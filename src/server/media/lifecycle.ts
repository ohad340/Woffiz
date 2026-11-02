import { TECHNIQUES } from '@/domain/techniques/catalog'
import { TECHNIQUE_LOCK } from '@/domain/techniques/lock'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import type { Prisma } from '@/generated/prisma/client'
import { assertAdmin } from '../admin'
import { prisma, type Tx } from '../db'
import { AppError } from '../errors'
import type { Env } from '../local-mode'
import { publishGateIssues, reviewGateIssues, reviewInputIssues, type ReviewDecisionName, type ReviewKind } from './gates'

/**
 * Review, publication, withdrawal and suspension of media versions (slice 3B).
 *
 * LOCKING. Every transition takes the row of its technique version in TechniqueVersionState (`FOR UPDATE`) before it
 * reads anything it decides on. That one row covers both variants (STANDARD and EASIER), so review, publication,
 * withdrawal and suspension of a technique are strictly serialised, and the gates are checked INSIDE the lock. These
 * actions take no plan lock. Generation commits and attempt/mastery writes (slices 3C and 3D) take the plan row first
 * and then the technique rows FOR SHARE in sorted order, so the order plan -> technique can never deadlock with this
 * module, which only ever holds a single technique row.
 *
 * NOTHING HERE touches exercises, attempts, mastery or plans: media state only changes media rows (and the
 * suspension flag). Completed history is never rewritten.
 */

export type Deps = {
  techniques: readonly TechniqueDefinition[]
  lock: Readonly<Record<string, string>>
  env: Env
  now: () => Date
}

const defaults = (): Deps => ({ techniques: TECHNIQUES, lock: TECHNIQUE_LOCK, env: process.env, now: () => new Date() })
const withDefaults = (deps?: Partial<Deps>): Deps => ({ ...defaults(), ...deps })

const conflict = (detail: string) => new AppError('MEDIA_CONFLICT', detail)

type TechniqueState = { fingerprint: string; suspendedAt: Date | null }

/** Takes the technique version's lock row. Everything decided afterwards is decided under this lock. */
async function lockTechnique(tx: Tx, key: string, version: number): Promise<TechniqueState> {
  const rows = await tx.$queryRaw<TechniqueState[]>`
    SELECT "fingerprint", "suspendedAt" FROM "TechniqueVersionState"
    WHERE "techniqueKey" = ${key} AND "techniqueVersion" = ${version} FOR UPDATE`
  if (!rows[0]) throw new AppError('NOT_FOUND')
  return rows[0]
}

/** Admin check and technique lock for an action on one media version. Returns the version as read under the lock. */
async function lockVersion(tx: Tx, adminId: string, versionId: string) {
  await assertAdmin(adminId, tx)
  const found = await tx.mediaVersion.findUnique({ where: { id: versionId }, select: { techniqueKey: true, techniqueVersion: true } })
  if (!found) throw new AppError('NOT_FOUND')
  const state = await lockTechnique(tx, found.techniqueKey, found.techniqueVersion)
  const version = await tx.mediaVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { reviews: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } },
  })
  return { version, state }
}

const run = <T>(fn: (tx: Tx) => Promise<T>) => prisma.$transaction(fn, { timeout: 15_000, maxWait: 15_000 })

// ----- Reviews -----

export type ReviewInput = {
  kind: ReviewKind
  decision: ReviewDecisionName
  checklist: Record<string, boolean>
  notes?: string
  /** The bundle fingerprint the reviewer was looking at; the review is bound to it. */
  fingerprint: string
}

/** Records a TECHNICAL or CONTENT review of one exact bundle. Only drafts can be reviewed. */
export async function submitReview(adminId: string, versionId: string, input: ReviewInput) {
  return run(async (tx) => {
    const { version } = await lockVersion(tx, adminId, versionId)
    if (version.status !== 'DRAFT') throw conflict(`only a draft can be reviewed (this one is ${version.status})`)
    if (input.fingerprint !== version.bundleFingerprint) throw conflict('the bundle changed since you opened it: reload and review again')
    const issues = reviewInputIssues(input.kind, input.decision, input.checklist, input.notes)
    if (issues.length > 0) throw new AppError('VALIDATION', issues.join('; '))
    const review = await tx.mediaReview.create({
      data: {
        mediaVersionId: version.id,
        kind: input.kind,
        decision: input.decision,
        reviewerId: adminId,
        reviewedFingerprint: version.bundleFingerprint,
        checklistJson: input.checklist as Prisma.InputJsonValue,
        notes: input.notes?.trim() || null,
      },
    })
    return { reviewId: review.id }
  })
}

/** DRAFT -> REVIEWED, only when both kinds of review approve this exact bundle. */
export async function markReviewed(adminId: string, versionId: string, deps?: Partial<Deps>) {
  const { now } = withDefaults(deps)
  return run(async (tx) => {
    const { version } = await lockVersion(tx, adminId, versionId)
    if (version.status !== 'DRAFT') throw conflict(`only a draft can be marked reviewed (this one is ${version.status})`)
    const issues = reviewGateIssues(version.reviews, version.bundleFingerprint)
    if (issues.length > 0) throw conflict(issues.join('; '))
    await tx.mediaVersion.update({ where: { id: version.id }, data: { status: 'REVIEWED', reviewedAt: now() } })
    return { status: 'REVIEWED' as const }
  })
}

// ----- Publication -----

/**
 * REVIEWED -> PUBLISHED. Every gate is re-checked under the technique lock: both approvals still bind this exact
 * bundle, the technique definition is approved and frozen at its current fingerprint, the technique is not suspended,
 * and a fixture stays local. The previously published version of the slot is withdrawn as SUPERSEDED in the same transaction.
 */
export async function publish(adminId: string, versionId: string, deps?: Partial<Deps>) {
  const { techniques, lock, env, now } = withDefaults(deps)
  return run(async (tx) => {
    const { version, state } = await lockVersion(tx, adminId, versionId)
    if (version.status !== 'REVIEWED') throw conflict(`only a reviewed version can be published (this one is ${version.status})`)
    const def = techniques.find((t) => t.key === version.techniqueKey && t.version === version.techniqueVersion)
    const issues = [
      ...reviewGateIssues(version.reviews, version.bundleFingerprint),
      ...publishGateIssues(def, lock, version, state, env),
    ]
    if (issues.length > 0) throw conflict(issues.join('; '))

    const at = now()
    const previous = await tx.mediaVersion.findFirst({ where: { assetId: version.assetId, status: 'PUBLISHED' } })
    if (previous) {
      await tx.mediaVersion.update({
        where: { id: previous.id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: at,
          withdrawnById: adminId,
          withdrawReason: 'SUPERSEDED',
          withdrawNote: `superseded by version ${version.version}`,
        },
      })
    }
    await tx.mediaVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedAt: at, publishedById: adminId } })
    return { status: 'PUBLISHED' as const, supersededVersionId: previous?.id ?? null }
  })
}

// ----- Withdrawal and suspension -----

export type WithdrawInput = { reason: 'TECHNICAL' | 'SAFETY'; note: string }

async function suspendInTx(tx: Tx, adminId: string, key: string, version: number, note: string, at: Date) {
  await tx.techniqueVersionState.update({ where: { techniqueKey_techniqueVersion: { techniqueKey: key, techniqueVersion: version } }, data: { suspendedAt: at } })
  await tx.techniqueSuspensionEvent.create({ data: { techniqueKey: key, techniqueVersion: version, action: 'SUSPEND', note, actorId: adminId } })
}

/**
 * Withdraws a version for good (a withdrawn version never comes back; a fixed clip is a new version).
 * - TECHNICAL: this clip is withdrawn; written instructions stay available and a reviewed replacement can be published.
 * - SAFETY: the clip is withdrawn AND the whole technique version is suspended, in the same transaction, so guidance
 *   that depends on it is paused. History is never rewritten.
 */
export async function withdraw(adminId: string, versionId: string, input: WithdrawInput, deps?: Partial<Deps>) {
  const { now } = withDefaults(deps)
  const note = input.note.trim()
  if (note.length < 3) throw new AppError('VALIDATION', 'a withdrawal needs a note')
  return run(async (tx) => {
    const { version, state } = await lockVersion(tx, adminId, versionId)
    if (version.status === 'WITHDRAWN') throw conflict('this version is already withdrawn')
    const at = now()
    await tx.mediaVersion.update({
      where: { id: version.id },
      data: { status: 'WITHDRAWN', withdrawnAt: at, withdrawnById: adminId, withdrawReason: input.reason, withdrawNote: note },
    })
    let suspended = false
    if (input.reason === 'SAFETY' && !state.suspendedAt) {
      await suspendInTx(tx, adminId, version.techniqueKey, version.techniqueVersion, `safety withdrawal of media version ${version.id}: ${note}`, at)
      suspended = true
    }
    return { status: 'WITHDRAWN' as const, suspended }
  })
}

/** Explicitly suspends a technique version (both variants): guidance depending on it is paused until the owner lifts it. */
export async function suspendTechnique(adminId: string, key: string, version: number, note: string, deps?: Partial<Deps>) {
  const { now } = withDefaults(deps)
  const text = note.trim()
  if (text.length < 3) throw new AppError('VALIDATION', 'a suspension needs a note')
  return run(async (tx) => {
    await assertAdmin(adminId, tx)
    const state = await lockTechnique(tx, key, version)
    if (state.suspendedAt) throw conflict('this technique version is already suspended')
    await suspendInTx(tx, adminId, key, version, text, now())
    return { suspended: true as const }
  })
}

/** Lifts a suspension. Withdrawn versions stay withdrawn: a replacement has to be reviewed and published again. */
export async function liftSuspension(adminId: string, key: string, version: number, note: string) {
  const text = note.trim()
  if (text.length < 3) throw new AppError('VALIDATION', 'lifting a suspension needs a note')
  return run(async (tx) => {
    await assertAdmin(adminId, tx)
    const state = await lockTechnique(tx, key, version)
    if (!state.suspendedAt) throw conflict('this technique version is not suspended')
    await tx.techniqueVersionState.update({ where: { techniqueKey_techniqueVersion: { techniqueKey: key, techniqueVersion: version } }, data: { suspendedAt: null } })
    await tx.techniqueSuspensionEvent.create({ data: { techniqueKey: key, techniqueVersion: version, action: 'LIFT', note: text, actorId: adminId } })
    return { suspended: false as const }
  })
}
