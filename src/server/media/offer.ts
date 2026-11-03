import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { TECHNIQUE_LOCK } from '@/domain/techniques/lock'
import { checkMediaParamCompatibility, type ParamValues } from '@/domain/techniques/params'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { testMediaEnabled } from '../ai/config'
import type { TechniqueChoice } from '../ai/schema'
import { findOffer, paramValues, type OfferedTechnique } from '../ai/techniques'
import type { prisma, Tx } from '../db'
import type { Env } from '../local-mode'

/**
 * What generation may bind to (slice 3C), read from the database.
 *
 * A technique version is OFFERED only when all hold: its definition is approved by the owner and frozen in
 * techniques.lock.json at its current fingerprint, it is registered with that fingerprint and not suspended, and its
 * STANDARD variant has a PUBLISHED clip. Fixture clips count only with AI_TEST_MEDIA on a local machine or in tests.
 * Both real definitions are draft today, so production offers nothing and generation stays free-form.
 */

export type TechniqueDeps = { techniques: readonly TechniqueDefinition[]; lock: Readonly<Record<string, string>>; env: Env }

export const techniqueDeps = (overrides: Partial<TechniqueDeps> = {}): TechniqueDeps => ({
  techniques: TECHNIQUES,
  lock: TECHNIQUE_LOCK,
  env: process.env,
  ...overrides,
})

/** Every level must be technique-bound. Off unless explicitly switched on after the published catalog is verified. */
export const mediaRequired = (env: Env = process.env) => env.MEDIA_REQUIRED === 'true'

const releasable = (def: TechniqueDefinition, lock: TechniqueDeps['lock']) =>
  def.review.status === 'approved' && lock[`${def.key}@${def.version}`] === fingerprintTechnique(def)

type Db = Tx | typeof prisma

export async function loadOfferedTechniques(db: Db, deps: TechniqueDeps): Promise<OfferedTechnique[]> {
  const candidates = deps.techniques.filter((def) => releasable(def, deps.lock))
  if (candidates.length === 0) return []
  const [states, published] = await Promise.all([
    db.techniqueVersionState.findMany({ where: { suspendedAt: null } }),
    db.mediaVersion.findMany({
      where: { status: 'PUBLISHED', ...(testMediaEnabled(deps.env) ? {} : { isTestFixture: false }) },
      select: { id: true, assetId: true, techniqueKey: true, techniqueVersion: true, variant: true, demonstratedParamsJson: true },
    }),
  ])
  return candidates.flatMap((def) => {
    const state = states.find((s) => s.techniqueKey === def.key && s.techniqueVersion === def.version)
    if (!state || state.fingerprint !== fingerprintTechnique(def)) return []
    const slots = published
      .filter((v) => v.techniqueKey === def.key && v.techniqueVersion === def.version && def.variants[v.variant])
      .map((v) => ({ variant: v.variant, assetId: v.assetId, mediaVersionId: v.id, demonstrated: v.demonstratedParamsJson as ParamValues }))
    return slots.some((s) => s.variant === 'STANDARD') ? [{ def, slots }] : []
  })
}

/**
 * Commit-time recheck, called INSIDE the generation commit transaction after the plan (or puppy) row lock. It takes the
 * TechniqueVersionState rows of every bound technique FOR SHARE in sorted order, the same rows publication, withdrawal
 * and suspension take FOR UPDATE. So a withdrawal or suspension either committed before (and is seen here) or waits
 * until this commit is done. It then re-reads what is offered and checks every choice again: still offered, its
 * variant still published, and its parameters compatible with the published clip. Returns issues (empty = commit).
 */
export async function recheckBoundTechniques(tx: Tx, choices: readonly (TechniqueChoice | null)[], deps: TechniqueDeps): Promise<string[]> {
  const bound = choices.filter((c): c is TechniqueChoice => c !== null)
  if (bound.length === 0) return []
  const refs = [...new Map(bound.map((c) => [`${c.key}@${String(c.version).padStart(6, '0')}`, c])).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [, ref] of refs) {
    await tx.$queryRaw`SELECT 1 FROM "TechniqueVersionState" WHERE "techniqueKey" = ${ref.key} AND "techniqueVersion" = ${ref.version} FOR SHARE`
  }
  const offers = await loadOfferedTechniques(tx, deps)
  const issues: string[] = []
  for (const choice of bound) {
    const id = `${choice.key}@${choice.version}`
    const offer = findOffer(offers, choice)
    if (!offer) {
      issues.push(`${id} is no longer offered (withdrawn, suspended or not approved)`)
      continue
    }
    const slot = offer.slots.find((s) => s.variant === choice.variant)
    const variant = offer.def.variants[choice.variant]
    if (!slot || !variant) {
      issues.push(`${id} ${choice.variant} has no published demonstration any more`)
      continue
    }
    for (const issue of checkMediaParamCompatibility(variant, paramValues(choice), slot.demonstrated)) issues.push(`${id}: ${issue}`)
  }
  return issues
}

/** Rebuilds a stored binding (ExerciseVersion columns) as a choice, e.g. to hand locked levels back to revise_future. */
export function choiceFromColumns(row: {
  techniqueKey: string | null
  techniqueVersion: number | null
  techniqueVariant: 'STANDARD' | 'EASIER' | null
  techniqueParamsJson: unknown
}): TechniqueChoice | null {
  if (!row.techniqueKey || row.techniqueVersion === null || !row.techniqueVariant) return null
  const stored = (row.techniqueParamsJson ?? {}) as { params?: Record<string, number>; tipIds?: string[] }
  return {
    key: row.techniqueKey,
    version: row.techniqueVersion,
    variant: row.techniqueVariant,
    params: Object.entries(stored.params ?? {}).map(([id, value]) => ({ id, value })),
    tipIds: stored.tipIds ?? [],
  }
}

/** Offered techniques that can replace a paused exercise: same topic, allowed for the puppy's age, with a STANDARD clip. */
export function eligibleReplacements(offers: readonly OfferedTechnique[], topic: string, answers: { age: string | null }) {
  const age = answers.age ?? 'unsure'
  return offers.filter((o) => o.def.topic === topic && (o.def.audience.allowedAges as readonly string[]).includes(age) && o.slots.some((s) => s.variant === 'STANDARD'))
}
