import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { prisma } from '@/server/db'
import type { BundleInput } from '@/server/media/bundle'
import { CHECKLISTS } from '@/server/media/gates'
import { ingestBundle } from '@/server/media/ingest'
import { liftSuspension, markReviewed, publish, submitReview, suspendTechnique, withdraw } from '@/server/media/lifecycle'
import { demoView, playbackFor, publishedCaptions, resolveDemo } from '@/server/media/resolve'
import { LocalMediaStore, verifyLocalToken } from '@/server/media/store'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { confirmMastery, recordAttempt } from '@/server/progress'
import { getExercise } from '@/server/queries'
import { adaptCurrentExercise } from '@/server/revision'
import { easierBundleInput, validBundleInput, variantBundleInput } from '../media/fixtures'
import { FULL_ANSWERS, REAL_POSTGRES, createUser, key, planFor, resetDatabase, usageCount } from './helpers'

// The real definitions are DRAFT. These tests use APPROVED COPIES, plus a test-only second version of the mouthing
// technique (as a same-topic replacement), with SYNTHETIC FIXTURE clips. Nothing real is approved or published.
const approve = (def: TechniqueDefinition): TechniqueDefinition => ({ ...def, review: { status: 'approved', approvedBy: 'test', approvedOn: '2026-11-03' } })
const MOUTHING = approve(TECHNIQUES.find((t) => t.key === 'mouthing-redirect-toy')!)
const MOUTHING_V2: TechniqueDefinition = { ...MOUTHING, version: 2 }
const techniques = [...TECHNIQUES.map(approve), MOUTHING_V2]
const lock = Object.fromEntries(techniques.map((def) => [`${def.key}@${def.version}`, fingerprintTechnique(def)]))
const deps = { techniques, lock }
const options = { techniqueDeps: deps }
const KEY = 'mouthing-redirect-toy'

const dir = mkdtempSync(join(tmpdir(), 'woffiz-playback-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const store = new LocalMediaStore(dir, 'integration-secret')

beforeEach(async () => {
  await resetDatabase()
  process.env.AI_TEST_MEDIA = 'true'
})
afterEach(() => {
  delete process.env.AI_TEST_MEDIA
})

const admin = () =>
  prisma.user.create({ data: { id: randomUUID(), name: 'Admin', email: `admin-${randomUUID()}@example.test`, emailVerified: true, role: 'ADMIN' } })

/** The same synthetic STANDARD clip, made for version 2 of the technique. */
function v2Bundle(): BundleInput {
  const input = validBundleInput()
  const manifest = structuredClone(input.manifest) as { technique: { version: number; fingerprint: string } }
  manifest.technique.version = 2
  manifest.technique.fingerprint = fingerprintTechnique(MOUTHING_V2)
  return { ...input, manifest }
}

async function publishFixture(adminId: string, input: BundleInput = validBundleInput()) {
  const { id } = await ingestBundle(input, { fixture: true, adminId, store, techniques })
  const { bundleFingerprint } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
  for (const kind of ['TECHNICAL', 'CONTENT'] as const) {
    await submitReview(adminId, id, { kind, decision: 'APPROVED', checklist: Object.fromEntries(CHECKLISTS[kind].map((c) => [c, true])), fingerprint: bundleFingerprint })
  }
  await markReviewed(adminId, id, deps)
  await publish(adminId, id, deps)
  return id
}

/** An owner whose CURRENT level is the biting level, bound to mouthing-redirect-toy@1 STANDARD. */
async function boundOwner() {
  const a = await admin()
  const clipId = await publishFixture(a.id)
  const owner = await createUser()
  await saveOnboardingDraft(owner.id, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: ['biting'] } })
  await completeOnboarding(owner.id, options)
  const plan = await planFor(owner.id)
  const exercise = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: plan.currentLevelId! }, orderBy: { version: 'desc' } })
  expect(exercise).toMatchObject({ techniqueKey: KEY, techniqueVersion: 1, techniqueVariant: 'STANDARD' })
  return { admin: a, clipId, owner, plan, exercise }
}

const progressSnapshot = async () =>
  JSON.stringify({
    attempts: await prisma.attempt.count(),
    mastery: await prisma.masteryEvent.count(),
    jobs: await prisma.generationJob.count(),
    usage: await prisma.aiUsageDay.findMany({ orderBy: { key: 'asc' } }),
    keys: await prisma.idempotencyKey.count(),
    plans: await prisma.plan.findMany({ orderBy: { id: 'asc' } }),
    levels: await prisma.level.findMany({ orderBy: { id: 'asc' } }),
    exercises: await prisma.exerciseVersion.findMany({ orderBy: { id: 'asc' } }),
  })

describe('demo resolver', () => {
  it('free-form exercises resolve to none', async () => {
    const owner = await createUser()
    await saveOnboardingDraft(owner.id, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: ['biting'] } })
    await completeOnboarding(owner.id, options) // nothing published: free-form
    const plan = await planFor(owner.id)
    const view = await getExercise(owner.id, plan.currentLevelId!)
    expect(view!.demo).toEqual({ state: 'none' })
    expect(view!.paused).toBe(false)
  })

  it('a bound exercise is ready with short-lived local URLs, our own captions route and the reviewed transcript', async () => {
    const { owner, plan, clipId } = await boundOwner()
    const view = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(view.demo).toMatchObject({ state: 'ready', variant: 'STANDARD', captionsUrl: `/api/media/versions/${clipId}/captions`, width: 1280, height: 720 })
    if (view.demo.state !== 'ready') return
    expect(view.demo.videoUrl).toMatch(/^\/api\/media\/local\?k=fixtures%2F/)
    expect(view.demo.transcript[0]).toMatchObject({ type: 'speech', speaker: 'narrator' })
    expect(view.easierDemo).toEqual({ state: 'unavailable' }) // no EASIER clip published yet
  })

  it('shows the EASIER clip in the easier sheet once it is published', async () => {
    const { admin: a, owner, plan } = await boundOwner()
    await publishFixture(a.id, easierBundleInput())
    const view = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(view.easierDemo).toMatchObject({ state: 'ready', variant: 'EASIER' })
  })

  it('requires the exact technique version, variant and compatible parameters', async () => {
    const { exercise } = await boundOwner()
    expect((await resolveDemo(prisma, exercise)).state).toBe('ready')
    expect((await resolveDemo(prisma, { ...exercise, techniqueVersion: 2 })).state).toBe('unavailable') // no clip for @2
    expect((await resolveDemo(prisma, exercise, 'EASIER')).state).toBe('unavailable') // no EASIER clip
    const outside = { ...exercise, techniqueParamsJson: { params: { stillSeconds: 8, rounds: 3, sessionsInRow: 3 }, tipIds: [] } }
    expect((await resolveDemo(prisma, outside)).state).toBe('unavailable') // the clip shows 2-5 s only
    expect((await resolveDemo(prisma, { ...exercise, techniqueKey: 'name-look' })).state).toBe('unavailable')
  })

  it('a technical withdrawal leaves the instructions and shows unavailable; a published replacement in the same slot is ready again', async () => {
    const { admin: a, clipId, owner, plan, exercise } = await boundOwner()
    await withdraw(a.id, clipId, { reason: 'TECHNICAL', note: 'audio drift' }, deps)
    const after = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(after.demo).toEqual({ state: 'unavailable' })
    expect(after.paused).toBe(false)
    expect(after.content).toEqual(exercise.contentJson)
    const replacement = await publishFixture(a.id, variantBundleInput(37))
    const again = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(again.demo).toMatchObject({ state: 'ready', captionsUrl: `/api/media/versions/${replacement}/captions` })
  })

  it('a suspension resolves to paused for both variants', async () => {
    const { admin: a, owner, plan } = await boundOwner()
    await publishFixture(a.id, easierBundleInput())
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    const view = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(view.demo).toEqual({ state: 'paused' })
    expect(view.paused).toBe(true)
    expect(view.easierDemo).toBeNull()
  })
})

describe('owner-authorized playback', () => {
  it('serves fresh URLs to the owner and NOT_FOUND to anyone else, for locked levels and unknown ids', async () => {
    const { owner, exercise, plan } = await boundOwner()
    expect(await playbackFor(prisma, owner.id, exercise.id, 'STANDARD')).toMatchObject({ state: 'ready' })
    const other = await createUser()
    await expect(playbackFor(prisma, other.id, exercise.id, 'STANDARD')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(playbackFor(prisma, owner.id, randomUUID(), 'STANDARD')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const locked = await prisma.exerciseVersion.findFirstOrThrow({ where: { level: { planId: plan.id, state: 'LOCKED' } } })
    await expect(playbackFor(prisma, owner.id, locked.id, 'STANDARD')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('recovers from an expired link: the old URL stops verifying and a refresh returns a working one', async () => {
    const { owner, exercise } = await boundOwner()
    const secret = process.env.BETTER_AUTH_SECRET!
    const short = await demoView(await resolveDemo(prisma, exercise), exercise.id, 'STANDARD', { ...process.env, MEDIA_URL_TTL_S: '1' })
    if (short.state !== 'ready') throw new Error('expected ready')
    const parse = (url: string) => {
      const u = new URL(url, 'http://localhost')
      return [u.searchParams.get('k')!, Number(u.searchParams.get('e')), u.searchParams.get('s')!] as const
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    expect(verifyLocalToken(...parse(short.videoUrl), secret)).toBe(false)
    const fresh = await playbackFor(prisma, owner.id, exercise.id, 'STANDARD')
    if (fresh.state !== 'ready') throw new Error('expected ready')
    expect(verifyLocalToken(...parse(fresh.videoUrl), secret)).toBe(true)
  })

  it('captions are served only for PUBLISHED clips', async () => {
    const { admin: a, clipId } = await boundOwner()
    expect(await publishedCaptions(prisma, clipId)).toMatch(/^WEBVTT/)
    const draft = (await ingestBundle(variantBundleInput(51), { fixture: true, adminId: a.id, store, techniques })).id
    expect(await publishedCaptions(prisma, draft)).toBeNull()
    expect(await publishedCaptions(prisma, randomUUID())).toBeNull()
    expect(await publishedCaptions(prisma, clipId, {})).toBeNull() // a fixture never plays outside a local machine
    await withdraw(a.id, clipId, { reason: 'TECHNICAL', note: 'gone' }, deps)
    expect(await publishedCaptions(prisma, clipId)).toBeNull()
  })

  it('playback, refresh and captions write nothing: no attempts, mastery, jobs, quota, keys or plan changes', async () => {
    const { owner, exercise, plan, clipId } = await boundOwner()
    const before = await progressSnapshot()
    await getExercise(owner.id, plan.currentLevelId!)
    for (let i = 0; i < 3; i++) await playbackFor(prisma, owner.id, exercise.id, 'STANDARD')
    await publishedCaptions(prisma, clipId)
    expect(await progressSnapshot()).toBe(before)
  })
})

describe('the suspension guard on progression writes', () => {
  it('refuses reports and mastery on a paused exercise, keeps history, and allows them again after the lift', async () => {
    const { admin: a, owner, plan } = await boundOwner()
    const levelId = plan.currentLevelId!
    const earlier = await recordAttempt(owner.id, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const repeatKey = key()
    const stored = await recordAttempt(owner.id, { levelId, outcome: 'WITH_HELP', idempotencyKey: repeatKey })
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    const before = await progressSnapshot()

    await expect(recordAttempt(owner.id, { levelId, outcome: 'WITH_HELP', idempotencyKey: key() })).rejects.toMatchObject({ code: 'GUIDANCE_PAUSED' })
    await expect(
      confirmMastery(owner.id, { levelId, attemptId: earlier.attemptId, criterionVersion: earlier.criterionVersion, planRevision: earlier.planRevision, idempotencyKey: key() }),
    ).rejects.toMatchObject({ code: 'GUIDANCE_PAUSED' })
    expect(await progressSnapshot()).toBe(before)
    // A retry of a report saved before the suspension still returns its stored result.
    expect(await recordAttempt(owner.id, { levelId, outcome: 'WITH_HELP', idempotencyKey: repeatKey })).toEqual(stored)

    await liftSuspension(a.id, KEY, 1, 'resolved')
    const done = await confirmMastery(owner.id, { levelId, attemptId: earlier.attemptId, criterionVersion: earlier.criterionVersion, planRevision: earlier.planRevision, idempotencyKey: key() })
    expect(done.completedPosition).toBe(1)
  })

  it('pauses review reports on a completed bound level without touching its mastery', async () => {
    const { admin: a, owner, plan } = await boundOwner()
    const levelId = plan.currentLevelId!
    const attempt = await recordAttempt(owner.id, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
    await confirmMastery(owner.id, { levelId, attemptId: attempt.attemptId, criterionVersion: attempt.criterionVersion, planRevision: attempt.planRevision, idempotencyKey: key() })
    const mastery = await prisma.masteryEvent.findUniqueOrThrow({ where: { levelId } })
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    await expect(recordAttempt(owner.id, { levelId, outcome: 'WITH_HELP', idempotencyKey: key() })).rejects.toMatchObject({ code: 'GUIDANCE_PAUSED' })
    expect(await prisma.masteryEvent.findUniqueOrThrow({ where: { levelId } })).toEqual(mastery)
    expect((await prisma.level.findUniqueOrThrow({ where: { id: levelId } })).state).toBe('COMPLETED')
  })

  it('never pauses free-form exercises, even while a technique is suspended', async () => {
    const { admin: a } = await boundOwner()
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    const other = await createUser()
    await saveOnboardingDraft(other.id, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: ['biting'] } })
    await completeOnboarding(other.id) // the real (draft) catalog offers nothing: a free-form plan
    const plan = await planFor(other.id)
    const saved = await recordAttempt(other.id, { levelId: plan.currentLevelId!, outcome: 'INDEPENDENT', idempotencyKey: key() })
    await confirmMastery(other.id, { levelId: plan.currentLevelId!, attemptId: saved.attemptId, criterionVersion: saved.criterionVersion, planRevision: saved.planRevision, idempotencyKey: key() })
    expect(await prisma.masteryEvent.count({ where: { levelId: plan.currentLevelId! } })).toBe(1)
  })
})

describe('adaptation after a suspension', () => {
  it('without an eligible replacement: ADAPT_UNAVAILABLE before any job, quota unit or model call', async () => {
    const { admin: a, owner, plan } = await boundOwner()
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    const view = (await getExercise(owner.id, plan.currentLevelId!, options))!
    expect(view.replacementAvailable).toBe(false)
    await expect(adaptCurrentExercise(owner.id, { planRevision: plan.revision }, key(), options)).rejects.toMatchObject({ code: 'ADAPT_UNAVAILABLE' })
    await expect(adaptCurrentExercise(owner.id, { planRevision: plan.revision }, key(), options)).rejects.toMatchObject({ code: 'ADAPT_UNAVAILABLE' })
    expect(await prisma.generationJob.count({ where: { kind: 'ADAPT_CURRENT' } })).toBe(0)
    // One unit was charged by the initial plan, none by the refused adaptations.
    expect(await usageCount('ai-request', owner.id)).toBe(1)
  })

  it('with a same-topic replacement: no struggle rule, a new version bound to the replacement, history kept', async () => {
    const { admin: a, owner, plan, exercise } = await boundOwner()
    await publishFixture(a.id, v2Bundle())
    await suspendTechnique(a.id, KEY, 1, 'doubt')
    expect((await getExercise(owner.id, plan.currentLevelId!, options))!.replacementAvailable).toBe(true)
    const attemptsBefore = JSON.stringify(await prisma.attempt.findMany({ orderBy: { id: 'asc' } }))

    const result = await adaptCurrentExercise(owner.id, { planRevision: plan.revision }, key(), options)
    expect(result.exerciseVersion).toBe(2)
    const versions = await prisma.exerciseVersion.findMany({ where: { levelId: plan.currentLevelId! }, orderBy: { version: 'asc' } })
    expect(versions[0]).toEqual(exercise)
    expect(versions[1]).toMatchObject({ techniqueKey: KEY, techniqueVersion: 2, techniqueVariant: 'STANDARD', criterionVersion: 2 })
    expect(JSON.stringify(await prisma.attempt.findMany({ orderBy: { id: 'asc' } }))).toBe(attemptsBefore)

    // The new version is not paused: practice continues on it.
    const view = (await getExercise(owner.id, plan.currentLevelId!))!
    expect(view.paused).toBe(false)
    await recordAttempt(owner.id, { levelId: plan.currentLevelId!, outcome: 'WITH_HELP', idempotencyKey: key() })
  })
})

describe.skipIf(!REAL_POSTGRES)('suspension guard on standard PostgreSQL', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  /** Suspends inside a transaction that keeps the technique row locked for `holdMs` before committing. */
  const heldSuspension = (holdMs: number) =>
    prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "TechniqueVersionState" WHERE "techniqueKey" = ${KEY} AND "techniqueVersion" = 1 FOR UPDATE`
        await tx.techniqueVersionState.update({ where: { techniqueKey_techniqueVersion: { techniqueKey: KEY, techniqueVersion: 1 } }, data: { suspendedAt: new Date() } })
        await sleep(holdMs)
      },
      { timeout: 20_000, maxWait: 20_000 },
    )

  it('an attempt waits for an in-flight suspension and is then refused', async () => {
    const { owner, plan } = await boundOwner()
    const held = heldSuspension(1_500)
    await sleep(200)
    const attempt = recordAttempt(owner.id, { levelId: plan.currentLevelId!, outcome: 'WITH_HELP', idempotencyKey: key() }).then(
      () => 'saved',
      (e: { code?: string }) => e.code,
    )
    await held
    expect(await attempt).toBe('GUIDANCE_PAUSED')
    expect(await prisma.attempt.count()).toBe(0)
  })

  it('a mastery confirmation waits for an in-flight suspension and is then refused', async () => {
    const { owner, plan } = await boundOwner()
    const levelId = plan.currentLevelId!
    const earlier = await recordAttempt(owner.id, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const held = heldSuspension(1_500)
    await sleep(200)
    const mastery = confirmMastery(owner.id, { levelId, attemptId: earlier.attemptId, criterionVersion: earlier.criterionVersion, planRevision: earlier.planRevision, idempotencyKey: key() }).then(
      () => 'confirmed',
      (e: { code?: string }) => e.code,
    )
    await held
    expect(await mastery).toBe('GUIDANCE_PAUSED')
    expect(await prisma.masteryEvent.count()).toBe(0)
    expect((await prisma.level.findUniqueOrThrow({ where: { id: levelId } })).state).toBe('CURRENT')
  })

  it('a suspension racing mastery confirmations either lets one land first or refuses them, never deadlocks', async () => {
    for (let round = 0; round < 5; round++) {
      await resetDatabase()
      const { admin: a, owner, plan } = await boundOwner()
      const levelId = plan.currentLevelId!
      const earlier = await recordAttempt(owner.id, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
      const [mastery, suspension] = await Promise.allSettled([
        confirmMastery(owner.id, { levelId, attemptId: earlier.attemptId, criterionVersion: earlier.criterionVersion, planRevision: earlier.planRevision, idempotencyKey: key() }),
        suspendTechnique(a.id, KEY, 1, 'race'),
      ])
      expect(suspension.status).toBe('fulfilled')
      const events = await prisma.masteryEvent.count()
      if (mastery.status === 'fulfilled') expect(events).toBe(1)
      else {
        expect((mastery as PromiseRejectedResult).reason).toMatchObject({ code: 'GUIDANCE_PAUSED' })
        expect(events).toBe(0)
      }
    }
  })
})
