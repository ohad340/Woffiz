import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { prisma } from '@/server/db'
import type { BundleInput } from '@/server/media/bundle'
import { ingestBundle } from '@/server/media/ingest'
import { CHECKLISTS, type ReviewKind } from '@/server/media/gates'
import { liftSuspension, markReviewed, publish, submitReview, suspendTechnique, withdraw, type Deps } from '@/server/media/lifecycle'
import { LocalMediaStore } from '@/server/media/store'
import { recordAttempt } from '@/server/progress'
import { validBundleInput } from '../media/fixtures'
import { REAL_POSTGRES, createUser, key, onboard, planFor, resetDatabase } from './helpers'

const dir = mkdtempSync(join(tmpdir(), 'woffiz-lifecycle-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const store = new LocalMediaStore(dir, 'integration-secret')

beforeEach(resetDatabase)

// The real catalog is entirely DRAFT: the owner has approved nothing. To exercise the workflow on isolated test
// fixtures, the tests inject an APPROVED COPY of the definition and a lock for it. Nothing real is approved here.
const mouthing = TECHNIQUES.find((t) => t.key === 'mouthing-redirect-toy')!
const approvedCopy: TechniqueDefinition = { ...mouthing, review: { status: 'approved', approvedBy: 'test', approvedOn: '2026-11-03' } }
const deps: Partial<Deps> = { techniques: [approvedCopy], lock: { 'mouthing-redirect-toy@1': fingerprintTechnique(approvedCopy) } }

const KEY = 'mouthing-redirect-toy'

async function admin(overrides: { role?: 'ADMIN' | 'OWNER' } = {}) {
  return prisma.user.create({
    data: { id: randomUUID(), name: 'Admin', email: `admin-${randomUUID()}@example.test`, emailVerified: true, role: overrides.role ?? 'ADMIN' },
  })
}

/** Distinct valid bundles for the same slot: the end of step 1 moves, so the fingerprint differs. */
function bundle(variant = 0): BundleInput {
  const input = validBundleInput()
  if (variant === 0) return input
  const manifest = structuredClone(input.manifest) as { timeline: { startMs: number; endMs: number }[] }
  manifest.timeline[1]!.endMs = 8000 + variant
  manifest.timeline[2]!.startMs = 8000 + variant
  return { ...input, manifest }
}

const draft = async (adminId: string, variant = 0) => (await ingestBundle(bundle(variant), { fixture: true, adminId, store })).id

async function approve(adminId: string, id: string, kinds: ReviewKind[] = ['TECHNICAL', 'CONTENT']) {
  const { bundleFingerprint } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
  for (const kind of kinds) {
    await submitReview(adminId, id, { kind, decision: 'APPROVED', checklist: Object.fromEntries(CHECKLISTS[kind].map((c) => [c, true])), fingerprint: bundleFingerprint })
  }
}

/** A version that has passed both reviews and is marked REVIEWED. */
async function reviewed(adminId: string, variant = 0) {
  const id = await draft(adminId, variant)
  await approve(adminId, id)
  await markReviewed(adminId, id, deps)
  return id
}

const status = async (id: string) => (await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).status
const technique = () => prisma.techniqueVersionState.findUniqueOrThrow({ where: { techniqueKey_techniqueVersion: { techniqueKey: KEY, techniqueVersion: 1 } } })
const conflict = (promise: Promise<unknown>, text?: RegExp) => expect(promise).rejects.toMatchObject({ code: 'MEDIA_CONFLICT', ...(text ? { message: expect.stringMatching(text) } : {}) })

describe('only an ADMIN can run any lifecycle action', () => {
  it('answers NOT_FOUND to owners for every action, and changes nothing', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    const owner = await createUser()
    const checklist = Object.fromEntries(CHECKLISTS.TECHNICAL.map((c) => [c, true]))
    const fingerprint = (await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).bundleFingerprint
    const denied = { code: 'NOT_FOUND' }
    await expect(submitReview(owner.id, id, { kind: 'TECHNICAL', decision: 'APPROVED', checklist, fingerprint })).rejects.toMatchObject(denied)
    await expect(markReviewed(owner.id, id, deps)).rejects.toMatchObject(denied)
    await expect(publish(owner.id, id, deps)).rejects.toMatchObject(denied)
    await expect(withdraw(owner.id, id, { reason: 'SAFETY', note: 'not an admin' }, deps)).rejects.toMatchObject(denied)
    await expect(suspendTechnique(owner.id, KEY, 1, 'not an admin')).rejects.toMatchObject(denied)
    await expect(liftSuspension(owner.id, KEY, 1, 'not an admin')).rejects.toMatchObject(denied)
    expect(await status(id)).toBe('REVIEWED')
    expect((await technique()).suspendedAt).toBeNull()
  })

  it('stops a revoked administrator immediately', async () => {
    const a = await admin()
    const id = await draft(a.id)
    await prisma.user.update({ where: { id: a.id }, data: { role: 'OWNER' } })
    await expect(approve(a.id, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('reviews are bound to the exact bundle', () => {
  it('records a review only for the fingerprint the reviewer saw, with a complete checklist', async () => {
    const a = await admin()
    const id = await draft(a.id)
    const ticks = Object.fromEntries(CHECKLISTS.CONTENT.map((c) => [c, true]))
    await conflict(submitReview(a.id, id, { kind: 'CONTENT', decision: 'APPROVED', checklist: ticks, fingerprint: 'f'.repeat(64) }), /bundle changed/)
    await expect(submitReview(a.id, id, { kind: 'CONTENT', decision: 'APPROVED', checklist: { ...ticks, 'no-signs-of-fear-in-puppy': false }, fingerprint: (await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).bundleFingerprint })).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(await prisma.mediaReview.count()).toBe(0)
    await approve(a.id, id, ['CONTENT'])
    const stored = await prisma.mediaReview.findFirstOrThrow()
    expect(stored).toMatchObject({ kind: 'CONTENT', decision: 'APPROVED', reviewerId: a.id })
    expect(stored.reviewedFingerprint).toBe((await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).bundleFingerprint)
  })

  it('refuses reviews once a version is no longer a draft', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    await conflict(approve(a.id, id, ['TECHNICAL']), /only a draft can be reviewed/)
  })

  it('marks REVIEWED only with both approvals, and the newest review of a kind decides', async () => {
    const a = await admin()
    const id = await draft(a.id)
    await conflict(markReviewed(a.id, id, deps), /no TECHNICAL review yet/)
    await approve(a.id, id, ['TECHNICAL'])
    await conflict(markReviewed(a.id, id, deps), /no CONTENT review yet/)
    await approve(a.id, id, ['CONTENT'])
    const fingerprint = (await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).bundleFingerprint
    await submitReview(a.id, id, { kind: 'CONTENT', decision: 'CHANGES_REQUESTED', checklist: Object.fromEntries(CHECKLISTS.CONTENT.map((c) => [c, false])), notes: 'hand moves at 0:05', fingerprint })
    await conflict(markReviewed(a.id, id, deps), /latest CONTENT review requests changes/)
    await approve(a.id, id, ['CONTENT'])
    await markReviewed(a.id, id, deps)
    expect(await status(id)).toBe('REVIEWED')
    expect((await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).reviewedAt).not.toBeNull()
  })
})

describe('publication gates', () => {
  it('publishes a reviewed version of an approved, frozen technique and supersedes the previous one', async () => {
    const a = await admin()
    const first = await reviewed(a.id, 0)
    expect(await publish(a.id, first, deps)).toEqual({ status: 'PUBLISHED', supersededVersionId: null })
    const second = await reviewed(a.id, 1)
    expect(await publish(a.id, second, deps)).toEqual({ status: 'PUBLISHED', supersededVersionId: first })
    expect(await status(second)).toBe('PUBLISHED')
    const old = await prisma.mediaVersion.findUniqueOrThrow({ where: { id: first } })
    expect(old).toMatchObject({ status: 'WITHDRAWN', withdrawReason: 'SUPERSEDED', withdrawnById: a.id })
    expect(await prisma.mediaVersion.count({ where: { status: 'PUBLISHED' } })).toBe(1)
  })

  it('refuses the real catalog: both techniques are still drafts, so nothing real can be published', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    await conflict(publish(a.id, id), /still a draft/)
    expect(await status(id)).toBe('REVIEWED')
  })

  it('refuses a technique that is not frozen in the lock file, or a version that is not REVIEWED', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    await conflict(publish(a.id, id, { ...deps, lock: {} }), /not frozen/)
    const other = await draft(a.id, 2)
    await conflict(publish(a.id, other, deps), /only a reviewed version can be published \(this one is DRAFT\)/)
  })

  it('re-checks the reviews at publication: a later request for changes or an approval of another bundle blocks it', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    const row = { mediaVersionId: id, reviewerId: a.id, checklistJson: {} }
    await prisma.mediaReview.create({ data: { ...row, kind: 'CONTENT', decision: 'CHANGES_REQUESTED', reviewedFingerprint: (await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).bundleFingerprint } })
    await conflict(publish(a.id, id, deps), /requests changes/)
    await prisma.mediaReview.create({ data: { ...row, kind: 'CONTENT', decision: 'APPROVED', reviewedFingerprint: 'e'.repeat(64) } })
    await conflict(publish(a.id, id, deps), /different bundle/)
    expect(await status(id)).toBe('REVIEWED')
  })

  it('refuses while the technique is suspended, and a fixture outside a local machine', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    await conflict(publish(a.id, id, { ...deps, env: {} }), /fixture cannot be published/)
    await suspendTechnique(a.id, KEY, 1, 'checking a doubt')
    await conflict(publish(a.id, id, deps), /suspended/)
    await liftSuspension(a.id, KEY, 1, 'doubt resolved')
    await publish(a.id, id, deps)
    expect(await status(id)).toBe('PUBLISHED')
  })
})

describe('withdrawal and suspension', () => {
  it('a TECHNICAL withdrawal withdraws the clip only: no suspension, and a replacement can follow', async () => {
    const a = await admin()
    const first = await reviewed(a.id, 0)
    await publish(a.id, first, deps)
    expect(await withdraw(a.id, first, { reason: 'TECHNICAL', note: 'audio clips at 0:12' }, deps)).toEqual({ status: 'WITHDRAWN', suspended: false })
    expect(await prisma.mediaVersion.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ status: 'WITHDRAWN', withdrawReason: 'TECHNICAL', withdrawNote: 'audio clips at 0:12' })
    expect((await technique()).suspendedAt).toBeNull()
    expect(await prisma.techniqueSuspensionEvent.count()).toBe(0)
    const replacement = await reviewed(a.id, 1)
    await publish(a.id, replacement, deps)
    expect(await status(replacement)).toBe('PUBLISHED')
    await conflict(withdraw(a.id, first, { reason: 'TECHNICAL', note: 'again' }, deps), /already withdrawn/)
  })

  it('a SAFETY withdrawal withdraws the clip and suspends the technique in one step; lifting does not bring the clip back', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    await publish(a.id, id, deps)
    expect(await withdraw(a.id, id, { reason: 'SAFETY', note: 'pulls the puppy by the collar at 0:07' }, deps)).toEqual({ status: 'WITHDRAWN', suspended: true })
    expect((await technique()).suspendedAt).not.toBeNull()
    const events = await prisma.techniqueSuspensionEvent.findMany({ orderBy: { createdAt: 'asc' } })
    expect(events).toMatchObject([{ action: 'SUSPEND', actorId: a.id, techniqueKey: KEY, techniqueVersion: 1 }])
    expect(events[0]!.note).toContain('pulls the puppy')

    const replacement = await reviewed(a.id, 1)
    await conflict(publish(a.id, replacement, deps), /suspended/)
    await liftSuspension(a.id, KEY, 1, 'replacement re-shot and re-reviewed')
    expect(await status(id)).toBe('WITHDRAWN')
    await publish(a.id, replacement, deps)
    expect(await status(replacement)).toBe('PUBLISHED')
    expect((await prisma.techniqueSuspensionEvent.findMany({ orderBy: { createdAt: 'asc' } })).map((e) => e.action)).toEqual(['SUSPEND', 'LIFT'])
  })

  it('withdraws drafts and reviewed versions too, and every withdrawal needs a note', async () => {
    const a = await admin()
    const d = await draft(a.id)
    await expect(withdraw(a.id, d, { reason: 'TECHNICAL', note: ' ' }, deps)).rejects.toMatchObject({ code: 'VALIDATION' })
    await withdraw(a.id, d, { reason: 'TECHNICAL', note: 'rejected draft' }, deps)
    expect(await status(d)).toBe('WITHDRAWN')
    const r = await reviewed(a.id, 1)
    await withdraw(a.id, r, { reason: 'TECHNICAL', note: 'found a problem after review' }, deps)
    expect(await status(r)).toBe('WITHDRAWN')
  })

  it('suspends and lifts explicitly, with notes, one state at a time', async () => {
    const a = await admin()
    await draft(a.id)
    await expect(suspendTechnique(a.id, KEY, 1, '')).rejects.toMatchObject({ code: 'VALIDATION' })
    await conflict(liftSuspension(a.id, KEY, 1, 'nothing to lift'), /not suspended/)
    await suspendTechnique(a.id, KEY, 1, 'doubt about the criterion')
    await conflict(suspendTechnique(a.id, KEY, 1, 'again'), /already suspended/)
    await liftSuspension(a.id, KEY, 1, 'checked the source again')
    expect((await technique()).suspendedAt).toBeNull()
    await expect(suspendTechnique(a.id, 'no-such-technique', 1, 'x'.repeat(5))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('exercise history and media content are never touched', () => {
  it('leaves plans, exercise versions, attempts and the media bundle exactly as they were across the whole lifecycle', async () => {
    const owner = await createUser()
    await onboard(owner.id)
    const plan = await planFor(owner.id)
    await recordAttempt(owner.id, { levelId: plan.currentLevelId!, outcome: 'STRUGGLING', idempotencyKey: key() })

    const snapshot = async () =>
      JSON.stringify({
        plan: await prisma.plan.findMany({ orderBy: { id: 'asc' } }),
        levels: await prisma.level.findMany({ orderBy: { id: 'asc' } }),
        exercises: await prisma.exerciseVersion.findMany({ orderBy: { id: 'asc' } }),
        attempts: await prisma.attempt.findMany({ orderBy: { id: 'asc' } }),
        mastery: await prisma.masteryEvent.findMany({ orderBy: { id: 'asc' } }),
      })
    const before = await snapshot()

    const a = await admin()
    const id = await reviewed(a.id)
    const content = async () => {
      const { status: _s, reviewedAt: _r, publishedAt: _p, publishedById: _pb, withdrawnAt: _w, withdrawnById: _wb, withdrawReason: _wr, withdrawNote: _wn, ...rest } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
      void [_s, _r, _p, _pb, _w, _wb, _wr, _wn]
      return JSON.stringify(rest)
    }
    const bundleBefore = await content()
    await publish(a.id, id, deps)
    await withdraw(a.id, id, { reason: 'SAFETY', note: 'safety check failed' }, deps)
    await liftSuspension(a.id, KEY, 1, 'resolved')
    await suspendTechnique(a.id, KEY, 1, 'another look')

    expect(await snapshot()).toBe(before)
    expect(await content()).toBe(bundleBefore)
  })
})

describe.skipIf(!REAL_POSTGRES)('media lifecycle on standard PostgreSQL', () => {
  it('parallel publishes of the same reviewed version succeed exactly once', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => publish(a.id, id, deps)))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'MEDIA_CONFLICT' })
    expect(await prisma.mediaVersion.count({ where: { status: 'PUBLISHED' } })).toBe(1)
  })

  it('parallel publishes of two reviewed versions serialise: both succeed in turn and exactly one stays published', async () => {
    const a = await admin()
    const first = await reviewed(a.id, 0)
    const second = await reviewed(a.id, 1)
    const results = await Promise.allSettled([publish(a.id, first, deps), publish(a.id, second, deps)])
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    const rows = await prisma.mediaVersion.findMany({ select: { id: true, status: true, withdrawReason: true } })
    expect(rows.filter((r) => r.status === 'PUBLISHED')).toHaveLength(1)
    expect(rows.filter((r) => r.status === 'WITHDRAWN' && r.withdrawReason === 'SUPERSEDED')).toHaveLength(1)
  })

  it('a SAFETY withdrawal racing the publication of the same version leaves it withdrawn and the technique suspended once', async () => {
    const a = await admin()
    const id = await reviewed(a.id)
    const results = await Promise.allSettled([publish(a.id, id, deps), withdraw(a.id, id, { reason: 'SAFETY', note: 'unsafe handling seen' }, deps)])
    expect(results[1]!.status).toBe('fulfilled') // the withdrawal always lands: before the publication (which then fails) or after it
    if (results[0]!.status === 'rejected') expect((results[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'MEDIA_CONFLICT' })
    expect(await status(id)).toBe('WITHDRAWN')
    expect(await prisma.mediaVersion.count({ where: { status: 'PUBLISHED' } })).toBe(0)
    expect((await technique()).suspendedAt).not.toBeNull()
    expect(await prisma.techniqueSuspensionEvent.count({ where: { action: 'SUSPEND' } })).toBe(1)
  })

  it('an explicit suspension racing a publication never lets the publication land after the suspension', async () => {
    for (let round = 0; round < 6; round++) {
      await resetDatabase()
      const a = await admin()
      const id = await reviewed(a.id)
      const results = await Promise.allSettled([publish(a.id, id, deps), suspendTechnique(a.id, KEY, 1, 'doubt about the technique')])
      expect(results[1]!.status).toBe('fulfilled')
      const state = await technique()
      expect(state.suspendedAt).not.toBeNull()
      const version = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
      if (results[0]!.status === 'rejected') {
        expect((results[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'MEDIA_CONFLICT' })
        expect(version.status).toBe('REVIEWED') // refused: it never became PUBLISHED
      } else {
        // Published first, then suspended: under the one lock the publication happened strictly before the suspension.
        expect(version.status).toBe('PUBLISHED')
        expect(version.publishedAt!.getTime()).toBeLessThanOrEqual(state.suspendedAt!.getTime())
      }
    }
  })

  it('parallel suspensions of one technique create one suspension and one event', async () => {
    const a = await admin()
    await draft(a.id)
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => suspendTechnique(a.id, KEY, 1, 'parallel doubt')))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.techniqueSuspensionEvent.count()).toBe(1)
  })
})
