import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { checkMediaParamCompatibility, type ParamValues } from '@/domain/techniques/params'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import type { prisma, Tx } from '../db'
import { AppError } from '../errors'
import { isLocalMachine, type Env } from '../local-mode'
import type { TranscriptEntry } from './manifest'
import { mediaStoreFromEnv } from './store'

/**
 * Which demonstration an exercise shows (slice 3D). READ-ONLY: nothing here writes, and nothing here may import
 * progression, mastery or AI code (a test enforces that). Playing a clip can therefore never unlock anything.
 *
 * - none: the exercise version is free-form or from before Phase 3. Compatibility is never inferred from keywords.
 * - paused: its technique version is suspended (safety): the guidance is paused.
 * - unavailable: bound, but no published clip fits EXACTLY: same technique key and version, same variant, made for the
 *   current definition fingerprint, and showing parameter values compatible with the ones this exercise uses.
 * - ready: that clip.
 */

export type DemoVariant = 'STANDARD' | 'EASIER'
type Bound = { techniqueKey: string | null; techniqueVersion: number | null; techniqueVariant: DemoVariant | null; techniqueParamsJson: unknown }
type Db = Tx | typeof prisma

const readyFields = { id: true, videoKey: true, posterKey: true, width: true, height: true, durationMs: true, transcriptJson: true } as const
type ReadyVersion = { id: string; videoKey: string; posterKey: string; width: number; height: number; durationMs: number; transcriptJson: unknown }

export type ResolvedDemo = { state: 'none' } | { state: 'paused' } | { state: 'unavailable' } | { state: 'ready'; version: ReadyVersion }

/** Synthetic fixture clips can only exist on a developer's machine; they are never played anywhere else. */
export const fixturePlaybackAllowed = (env: Env = process.env) => isLocalMachine(env) || env.NODE_ENV === 'test'

/** The parameter values the exercise uses for `variant` (the easier sheet of a STANDARD exercise uses EASIER defaults for the rest). */
function paramsFor(def: TechniqueDefinition, variant: DemoVariant, stored: unknown): ParamValues | null {
  const spec = def.variants[variant]
  if (!spec) return null
  const values = ((stored ?? {}) as { params?: ParamValues }).params ?? {}
  return Object.fromEntries(spec.params.map((p) => [p.id, values[p.id] ?? p.default]))
}

export async function resolveDemo(
  db: Db,
  exercise: Bound,
  variant: DemoVariant | null = exercise.techniqueVariant,
  options: { env?: Env; techniques?: readonly TechniqueDefinition[] } = {},
): Promise<ResolvedDemo> {
  const { techniqueKey: key, techniqueVersion: version } = exercise
  if (!key || version === null || !exercise.techniqueVariant || !variant) return { state: 'none' }
  const env = options.env ?? process.env

  const state = await db.techniqueVersionState.findUnique({ where: { techniqueKey_techniqueVersion: { techniqueKey: key, techniqueVersion: version } } })
  if (!state) return { state: 'unavailable' }
  if (state.suspendedAt) return { state: 'paused' }

  const def = (options.techniques ?? TECHNIQUES).find((t) => t.key === key && t.version === version)
  const params = def ? paramsFor(def, variant, exercise.techniqueParamsJson) : null
  const spec = def?.variants[variant]
  if (!def || !params || !spec) return { state: 'unavailable' }

  const clip = await db.mediaVersion.findFirst({
    where: { techniqueKey: key, techniqueVersion: version, variant, status: 'PUBLISHED', ...(fixturePlaybackAllowed(env) ? {} : { isTestFixture: false }) },
    select: { ...readyFields, techniqueFingerprint: true, demonstratedParamsJson: true },
  })
  if (!clip || clip.techniqueFingerprint !== fingerprintTechnique(def)) return { state: 'unavailable' }
  if (checkMediaParamCompatibility(spec, params, clip.demonstratedParamsJson as ParamValues).length > 0) return { state: 'unavailable' }
  const { techniqueFingerprint: _f, demonstratedParamsJson: _d, ...ready } = clip
  void [_f, _d]
  return { state: 'ready', version: ready }
}

/** What the owner's browser receives: short-lived signed URLs, captions through our own origin, the reviewed transcript. */
export type DemoView =
  | { state: 'none' | 'paused' | 'unavailable' }
  | {
      state: 'ready'
      exerciseVersionId: string
      variant: DemoVariant
      videoUrl: string
      posterUrl: string
      captionsUrl: string
      width: number
      height: number
      durationMs: number
      transcript: { type: 'speech' | 'visual'; speaker?: 'narrator' | 'demo'; text: string }[]
    }

export function mediaUrlTtlSeconds(env: Env = process.env) {
  const n = Number(env.MEDIA_URL_TTL_S)
  return Number.isInteger(n) && n > 0 && n <= 3600 ? n : 600
}

export async function demoView(resolved: ResolvedDemo, exerciseVersionId: string, variant: DemoVariant, env: Env = process.env): Promise<DemoView> {
  if (resolved.state !== 'ready') return { state: resolved.state }
  const store = mediaStoreFromEnv(env)
  if (!store) return { state: 'unavailable' }
  const ttl = mediaUrlTtlSeconds(env)
  try {
    const { version } = resolved
    return {
      state: 'ready',
      exerciseVersionId,
      variant,
      videoUrl: await store.signedReadUrl(version.videoKey, ttl),
      posterUrl: await store.signedReadUrl(version.posterKey, ttl),
      captionsUrl: `/api/media/versions/${version.id}/captions`,
      width: version.width,
      height: version.height,
      durationMs: version.durationMs,
      transcript: (version.transcriptJson as TranscriptEntry[]).map((e) => (e.type === 'speech' ? { type: 'speech', speaker: e.speaker, text: e.text } : { type: 'visual', text: e.text })),
    }
  } catch {
    return { state: 'unavailable' }
  }
}

/**
 * Owner-authorized playback (and URL refresh): the exercise version must belong to the owner's puppy and its level must
 * be open (current or completed). Reads only.
 */
export async function playbackFor(db: Db, userId: string, exerciseVersionId: string, variant: DemoVariant): Promise<DemoView> {
  const exercise = await db.exerciseVersion.findUnique({ where: { id: exerciseVersionId }, include: { level: { include: { plan: { include: { puppy: true } } } } } })
  if (!exercise || exercise.level.plan.puppy.ownerId !== userId || exercise.level.state === 'LOCKED') throw new AppError('NOT_FOUND')
  if (variant === 'EASIER' && exercise.techniqueVariant !== 'STANDARD' && exercise.techniqueVariant !== 'EASIER') throw new AppError('NOT_FOUND')
  return demoView(await resolveDemo(db, exercise, variant), exercise.id, variant)
}

/**
 * Captions of a PUBLISHED clip (null for drafts, reviewed-but-unpublished and withdrawn versions, and for fixtures where
 * fixtures may not play). Published clips are shared, non-personal content, so any verified account may read them.
 */
export async function publishedCaptions(db: Db, id: string, env: Env = process.env): Promise<string | null> {
  const version = await db.mediaVersion.findUnique({ where: { id }, select: { status: true, isTestFixture: true, captionsVtt: true } })
  if (!version || version.status !== 'PUBLISHED' || (version.isTestFixture && !fixturePlaybackAllowed(env))) return null
  return version.captionsVtt
}
