import type { ExerciseContent } from '@/server/content'

/**
 * A technique definition is the reviewed, immutable description of ONE demonstrated method. A released
 * `key@version` never changes: a change to the demonstrated behaviour is a new version (old ones are kept).
 * Mandatory instructions are rendered from here, never written by the AI.
 */
export type TechniqueVariantName = 'STANDARD' | 'EASIER'
export type TechniqueTopic = 'TOILET' | 'BITING' | 'SLEEP' | 'ALONE' | 'COMMANDS'
export type AgeBand = 'under-10w' | '10-16w' | '4-6m' | 'over-6m' | 'unsure'

/** Who is heard in the clip at a step: the demonstrator saying the dog's name or praise out loud. */
export type SpeechCue = 'name' | 'praise'

export type TechniqueStep = {
  /** Stable id, referenced by media timelines. */
  id: string
  /** Hebrew instruction. `{param}` placeholders are filled from validated integer parameters. */
  text: string
  /** When set, the clip must contain an audible demonstrator line at this step. */
  speechCue?: SpeechCue
}

/**
 * An integer parameter the plan may choose. Two ranges, on purpose:
 * - `min`..`max`: every value the written instructions may use.
 * - `compatibleMin`..`compatibleMax`: the values for which the FIXED clip still shows the same method. The clip
 *   shows `demonstrated`. A value outside the compatible range is a different method as far as the video goes,
 *   so no media is bound to it. A parameter whose compatible range equals its full range is media-neutral.
 */
export type TechniqueParam = {
  id: string
  /** English label for admins. */
  label: string
  unit: string
  min: number
  max: number
  default: number
  demonstrated: number
  compatibleMin: number
  compatibleMax: number
  basis: 'source' | 'product-default'
  basisNote: string
}

export type TechniqueVariant = {
  title: string
  goal: string
  estimatedMinutes: number
  preparation: string[]
  /** The demonstration core: mandatory, in this order. */
  steps: TechniqueStep[]
  params: TechniqueParam[]
  /** Hebrew; may contain `{param}` placeholders. */
  successCriterion: string
  /** Catalog-approved supporting tips the plan may pick from; shown as preparation items. */
  tips: { id: string; text: string }[]
}

export type TechniqueSource = {
  url: string
  publisher: string
  title: string
  /** ISO date the page was fetched and compared with the instructions. */
  verifiedOn: string
  /** `fetched-summary`: content checked through a tool-produced summary of the page. `owner-read`: the owner read it. */
  verification: 'fetched-summary' | 'owner-read'
  /** Step ids, parameter ids or boundary names (e.g. "forbidden") this source supports. */
  supports: string[]
  /** Paraphrase of what the source says that supports those items. */
  summary: string
}

export type TechniqueReview = {
  status: 'draft' | 'approved'
  approvedBy?: string
  approvedOn?: string
}

export type TechniqueDefinition = {
  key: string
  version: number
  topic: TechniqueTopic
  /** English description for admins. */
  description: string
  audience: { allowedAges: AgeBand[]; basis: 'source' | 'product-default'; basisNote: string }
  variants: Partial<Record<TechniqueVariantName, TechniqueVariant>>
  /** Rendered when the exercise itself is the easiest variant: a last, simpler fallback. */
  fallbackEasier: { title: string; steps: string[] }
  /** Behaviour that must never appear in a clip or in supporting text for this technique (admin checklist). */
  forbiddenBehaviour: string[]
  stopConditions: string[]
  /** Not part of the fingerprint: approving a definition does not change what it demonstrates. */
  review: TechniqueReview
  sources: TechniqueSource[]
}

export type TechniqueRef = { key: string; version: number }
export type RenderedTechnique = ExerciseContent
