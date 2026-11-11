import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { defaultParams } from '@/domain/techniques/params'
import { renderTechniqueContent } from '@/domain/techniques/render'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { prisma } from '@/server/db'
import type { BundleInput } from '@/server/media/bundle'
import { CHECKLISTS } from '@/server/media/gates'
import { ingestBundle } from '@/server/media/ingest'
import { markReviewed, publish, submitReview, suspendTechnique, withdraw } from '@/server/media/lifecycle'
import { LocalMediaStore } from '@/server/media/store'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { recordAttempt } from '@/server/progress'
import { adaptCurrentExercise, reviseFuturePlan } from '@/server/revision'
import { easierBundleInput, validBundleInput } from '../media/fixtures'
import { FULL_ANSWERS, REAL_POSTGRES, createUser, key, planFor, puppyOf, resetDatabase, usageCount } from './helpers'

// The real definitions are DRAFT and the owner approved nothing. To exercise technique-bound generation end to end,
// these tests inject APPROVED COPIES (with a matching lock) and publish SYNTHETIC FIXTURE clips, which are offered only
// with AI_TEST_MEDIA on a local machine or in tests. No real content is approved or published.
const approve = (def: TechniqueDefinition): TechniqueDefinition => ({ ...def, review: { status: 'approved', approvedBy: 'test', approvedOn: '2026-11-03' } })
const techniques = TECHNIQUES.map(approve)
const lock = Object.fromEntries(techniques.map((def) => [`${def.key}@${def.version}`, fingerprintTechnique(def)]))
const deps = { techniques, lock }
const options = { techniqueDeps: deps }
const MOUTHING = techniques.find((t) => t.key === 'mouthing-redirect-toy')!
const KEY = 'mouthing-redirect-toy'

const dir = mkdtempSync(join(tmpdir(), 'woffiz-generation-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const store = new LocalMediaStore(dir, 'integration-secret')

beforeEach(async () => {
  await resetDatabase()
  process.env.AI_TEST_MEDIA = 'true'
})
afterEach(() => {
  delete process.env.AI_TEST_MEDIA
  delete process.env.AI_FAKE_MODE
  delete process.env.MEDIA_REQUIRED
})

async function admin() {
  return prisma.user.create({ data: { id: randomUUID(), name: 'Admin', email: `admin-${randomUUID()}@example.test`, emailVerified: true, role: 'ADMIN' } })
}

/** Ingests, reviews, marks reviewed and publishes a synthetic fixture clip. Returns its version id. */
async function published(adminId: string, input: BundleInput = validBundleInput()) {
  const { id } = await ingestBundle(input, { fixture: true, adminId, store })
  const { bundleFingerprint } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
  for (const kind of ['TECHNICAL', 'CONTENT'] as const) {
    await submitReview(adminId, id, { kind, decision: 'APPROVED', checklist: Object.fromEntries(CHECKLISTS[kind].map((c) => [c, true])), fingerprint: bundleFingerprint })
  }
  await markReviewed(adminId, id, deps)
  await publish(adminId, id, deps)
  return id
}

async function draftAnswers(userId: string, difficulties: ('biting' | 'commands')[] = ['biting']) {
  await saveOnboardingDraft(userId, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties } })
}

async function exercisesOf(userId: string) {
  return prisma.exerciseVersion.findMany({
    where: { level: { plan: { puppy: { ownerId: userId } } } },
    include: { level: true },
    orderBy: [{ level: { position: 'asc' } }, { version: 'asc' }],
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('what generation is offered', () => {
  it('keeps free-form generation when the published catalog is empty', async () => {
    const a = await admin()
    await ingestBundle(validBundleInput(), { fixture: true, adminId: a.id, store }) // a DRAFT is never offered
    const owner = await createUser()
    await draftAnswers(owner.id)
    await completeOnboarding(owner.id, options)
    const rows = await exercisesOf(owner.id)
    expect(rows.length).toBeGreaterThanOrEqual(12)
    expect(rows.every((r) => r.techniqueKey === null && r.techniqueParamsJson === null)).toBe(true)
  })

  it('never offers the real draft definitions, even with a published fixture clip', async () => {
    const a = await admin()
    await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id)
    await completeOnboarding(owner.id) // no injected copies: the real catalog, both definitions draft
    expect((await exercisesOf(owner.id)).every((r) => r.techniqueKey === null)).toBe(true)
  })

  it('never offers fixture clips without AI_TEST_MEDIA, or a suspended technique', async () => {
    const a = await admin()
    await published(a.id)
    delete process.env.AI_TEST_MEDIA
    const first = await createUser()
    await draftAnswers(first.id)
    await completeOnboarding(first.id, options)
    expect((await exercisesOf(first.id)).every((r) => r.techniqueKey === null)).toBe(true)

    process.env.AI_TEST_MEDIA = 'true'
    await suspendTechnique(a.id, KEY, 1, 'checking')
    const second = await createUser()
    await draftAnswers(second.id)
    await completeOnboarding(second.id, options)
    expect((await exercisesOf(second.id)).every((r) => r.techniqueKey === null)).toBe(true)
  })
})

describe('technique-bound initial plans', () => {
  it('binds the biting level to the published technique and stores the catalog rendering, not model text', async () => {
    const a = await admin()
    await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id)
    await completeOnboarding(owner.id, options)

    const rows = await exercisesOf(owner.id)
    const bound = rows.filter((r) => r.techniqueKey)
    expect(bound).toHaveLength(1)
    const row = bound[0]!
    expect(row).toMatchObject({
      techniqueKey: KEY,
      techniqueVersion: 1,
      techniqueVariant: 'STANDARD',
      mediaId: 'slot:mouthing-redirect-toy@1:STANDARD',
      criterionVersion: 1,
      level: { topic: 'BITING' },
    })
    expect(row.techniqueParamsJson).toEqual({ params: defaultParams(MOUTHING.variants.STANDARD!), tipIds: ['rotate-toys'] })
    expect(row.contentJson).toEqual(renderTechniqueContent(MOUTHING, 'STANDARD', defaultParams(MOUTHING.variants.STANDARD!), ['rotate-toys']))
    // Free-form levels may still carry the isolated Phase 2 test-media ids, but never a technique slot.
    expect(rows.filter((r) => !r.techniqueKey).every((r) => !r.mediaId?.startsWith('slot:'))).toBe(true)
  })

  it('with MEDIA_REQUIRED and an incomplete catalog, refuses to create a plan and keeps the answers and the unit', async () => {
    const a = await admin()
    await published(a.id)
    process.env.MEDIA_REQUIRED = 'true'
    const owner = await createUser()
    await draftAnswers(owner.id)
    await expect(completeOnboarding(owner.id, { techniqueDeps: { ...deps, env: process.env } })).rejects.toMatchObject({ code: 'GENERATION_FAILED' })
    expect((await puppyOf(owner.id)).onboardedAt).toBeNull()
    expect(await usageCount('ai-request', owner.id)).toBe(0)
  })
})

describe('the commit rechecks media under the technique lock', () => {
  async function racing(change: (adminId: string, versionId: string) => Promise<unknown>) {
    const a = await admin()
    const versionId = await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id)
    process.env.AI_FAKE_MODE = 'slow' // about 3 s between offering and commit
    const generation = completeOnboarding(owner.id, options).then(
      () => 'committed',
      (error: { code?: string }) => error.code,
    )
    await sleep(700)
    await change(a.id, versionId)
    expect(await generation).toBe('GENERATION_FAILED')
    const job = await prisma.generationJob.findFirstOrThrow({ where: { ownerId: owner.id } })
    expect(job).toMatchObject({ status: 'REJECTED', errorCode: 'media-unavailable' })
    expect((await puppyOf(owner.id)).onboardedAt).toBeNull()
    expect(await prisma.plan.count({ where: { puppy: { ownerId: owner.id } } })).toBe(0)
    expect(await usageCount('ai-request', owner.id)).toBe(0) // the unit is refunded

    // Asking again works: nothing is offered any more, so the plan is free-form.
    delete process.env.AI_FAKE_MODE
    await completeOnboarding(owner.id, options)
    expect((await exercisesOf(owner.id)).every((r) => r.techniqueKey === null)).toBe(true)
  }

  it('a TECHNICAL withdrawal during generation rejects the candidate and refunds the unit', async () => {
    await racing((adminId, versionId) => withdraw(adminId, versionId, { reason: 'TECHNICAL', note: 'audio drift' }, deps))
  })

  it('a suspension during generation rejects the candidate and refunds the unit', async () => {
    await racing((adminId) => suspendTechnique(adminId, KEY, 1, 'doubt about the technique'))
  })
})

describe('technique-bound adaptation and revision', () => {
  it('adapts a bound current exercise to the published EASIER variant as a new version, keeping history', async () => {
    const a = await admin()
    await published(a.id)
    await published(a.id, easierBundleInput())
    const owner = await createUser()
    await draftAnswers(owner.id)
    await completeOnboarding(owner.id, options)
    const plan = await planFor(owner.id)
    const current = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: plan.currentLevelId! } })
    expect(current.techniqueVariant).toBe('STANDARD')
    for (let i = 0; i < 2; i++) await recordAttempt(owner.id, { levelId: plan.currentLevelId!, outcome: 'STRUGGLING', idempotencyKey: key() })
    const before = JSON.stringify(await prisma.attempt.findMany({ orderBy: { id: 'asc' } }))

    const idempotencyKey = key()
    const result = await adaptCurrentExercise(owner.id, { planRevision: plan.revision }, idempotencyKey, options)
    expect(result.exerciseVersion).toBe(2)
    const versions = await prisma.exerciseVersion.findMany({ where: { levelId: plan.currentLevelId! }, orderBy: { version: 'asc' } })
    expect(versions[0]).toEqual(current) // the previous version is untouched
    expect(versions[1]).toMatchObject({ techniqueKey: KEY, techniqueVariant: 'EASIER', criterionVersion: 2, mediaId: 'slot:mouthing-redirect-toy@1:EASIER' })
    expect((versions[1]!.contentJson as { steps: string[] }).steps).toEqual(MOUTHING.variants.EASIER!.steps.map((s) => s.text))
    expect(JSON.stringify(await prisma.attempt.findMany({ orderBy: { id: 'asc' } }))).toBe(before)

    // Idempotency and quota are unchanged: the same key returns the stored result without a new job.
    expect(await adaptCurrentExercise(owner.id, { planRevision: plan.revision }, idempotencyKey, options)).toEqual(result)
    expect(await prisma.generationJob.count({ where: { ownerId: owner.id, kind: 'ADAPT_CURRENT' } })).toBe(1)
  })

  it('revision keeps the binding of locked levels and refuses it once the technique is suspended', async () => {
    const a = await admin()
    await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id, ['commands', 'biting'])
    await completeOnboarding(owner.id, options)
    const before = await planFor(owner.id)
    const boundLocked = (await exercisesOf(owner.id)).filter((r) => r.techniqueKey && r.level.state === 'LOCKED')
    expect(boundLocked).toHaveLength(1)

    await reviseFuturePlan(owner.id, { planRevision: before.revision }, key(), options)
    const afterRevise = (await exercisesOf(owner.id)).filter((r) => r.techniqueKey && r.level.state === 'LOCKED')
    expect(afterRevise).toHaveLength(1)
    expect(afterRevise[0]!.id).not.toBe(boundLocked[0]!.id) // a new locked level, same binding
    expect(afterRevise[0]).toMatchObject({ techniqueKey: KEY, techniqueVariant: 'STANDARD', mediaId: 'slot:mouthing-redirect-toy@1:STANDARD' })

    await suspendTechnique(a.id, KEY, 1, 'doubt')
    const revision = (await planFor(owner.id)).revision
    await expect(reviseFuturePlan(owner.id, { planRevision: revision }, key(), options)).rejects.toMatchObject({ code: 'GENERATION_FAILED' })
    expect((await planFor(owner.id)).revision).toBe(revision) // nothing changed
  })
})

describe.skipIf(!REAL_POSTGRES)('media generation on standard PostgreSQL', () => {
  /** Holds the technique row FOR UPDATE while `change` runs, then commits after `holdMs`. */
  async function holdingTechniqueLock(change: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>, holdMs: number) {
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "TechniqueVersionState" WHERE "techniqueKey" = ${KEY} AND "techniqueVersion" = 1 FOR UPDATE`
        await change(tx)
        await sleep(holdMs)
      },
      { timeout: 20_000, maxWait: 20_000 },
    )
  }

  async function raceCommit(change: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], adminId: string, versionId: string) => Promise<unknown>) {
    const a = await admin()
    const versionId = await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id)
    // The change is not committed yet when generation reads the offer, so the candidate binds the technique; the commit
    // then has to wait for the technique row and must see the change.
    const held = holdingTechniqueLock((tx) => change(tx, a.id, versionId), 2_500)
    await sleep(300)
    const generation = completeOnboarding(owner.id, options).then(
      () => 'committed',
      (error: { code?: string }) => error.code,
    )
    await held
    expect(await generation).toBe('GENERATION_FAILED')
    expect(await prisma.generationJob.findFirstOrThrow({ where: { ownerId: owner.id } })).toMatchObject({ status: 'REJECTED', errorCode: 'media-unavailable' })
    expect(await prisma.exerciseVersion.count({ where: { techniqueKey: { not: null } } })).toBe(0)
    expect(await usageCount('ai-request', owner.id)).toBe(0)
  }

  it('a generation commit waits for an in-flight withdrawal and then refuses the withdrawn clip', async () => {
    await raceCommit((tx, adminId, versionId) =>
      tx.mediaVersion.update({
        where: { id: versionId },
        data: { status: 'WITHDRAWN', withdrawnAt: new Date(), withdrawnById: adminId, withdrawReason: 'TECHNICAL', withdrawNote: 'race test' },
      }),
    )
  })

  it('a generation commit waits for an in-flight suspension and then refuses the suspended technique', async () => {
    await raceCommit((tx) =>
      tx.techniqueVersionState.update({ where: { techniqueKey_techniqueVersion: { techniqueKey: KEY, techniqueVersion: 1 } }, data: { suspendedAt: new Date() } }),
    )
  })

  it('a withdrawal waits for a generation commit that holds the technique row, so the committed binding predates it', async () => {
    const a = await admin()
    const versionId = await published(a.id)
    const owner = await createUser()
    await draftAnswers(owner.id)
    const results = await Promise.allSettled([completeOnboarding(owner.id, options), withdraw(a.id, versionId, { reason: 'TECHNICAL', note: 'parallel' }, deps)])
    expect(results[1]!.status).toBe('fulfilled')
    const job = await prisma.generationJob.findFirstOrThrow({ where: { ownerId: owner.id } })
    if (results[0]!.status === 'fulfilled') {
      // Committed first: the binding was made while the clip was still published (withdrawal came after).
      expect(job.status).toBe('SUCCEEDED')
      expect(job.finishedAt!.getTime()).toBeLessThanOrEqual((await prisma.mediaVersion.findUniqueOrThrow({ where: { id: versionId } })).withdrawnAt!.getTime())
    } else {
      expect(job).toMatchObject({ status: 'REJECTED', errorCode: 'media-unavailable' })
    }
  })
})
