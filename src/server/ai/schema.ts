import { z } from 'zod'
import { exerciseContentSchema, type OnboardingAnswers } from '../content'

export const TOPICS = ['TOILET', 'BITING', 'SLEEP', 'ALONE', 'COMMANDS'] as const
export type TopicName = (typeof TOPICS)[number]

/**
 * Phase 3C: a level (or adapted exercise) may be bound to an offered, reviewed technique. When it is, the server
 * REPLACES every instruction field with the catalog rendering (title, goal, preparation, steps, criterion, stop
 * conditions, easier variant, minutes) and discards the model's text for them; the model only chooses the technique,
 * integer parameters inside the offered ranges and catalog tips. Parameters are a list (not a map) so every object in
 * the wire schema stays closed. Missing in older outputs = null (free-form).
 */
export const techniqueChoiceSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{3,60}$/),
  version: z.number().int().min(1).max(1000),
  variant: z.enum(['STANDARD', 'EASIER']),
  params: z.array(z.object({ id: z.string().min(1).max(40), value: z.number().int() })).max(8),
  tipIds: z.array(z.string().min(1).max(40)).max(3),
})
export type TechniqueChoice = z.infer<typeof techniqueChoiceSchema>

/** One generated level. Position is the array index, so positions are always contiguous. */
export const generatedLevelSchema = exerciseContentSchema.extend({
  stableKey: z.string().regex(/^[a-z0-9-]{3,40}$/),
  topic: z.enum(TOPICS),
  /** stableKeys of earlier levels this level builds on. */
  prerequisites: z.array(z.string().min(3).max(40)).max(4),
  /** Id from the offered media catalog, or null when none is offered/compatible. */
  mediaId: z.string().min(1).max(60).nullable(),
  technique: techniqueChoiceSchema.nullable().default(null),
})
export type GeneratedLevel = z.infer<typeof generatedLevelSchema>

export const planOutputSchema = z.object({
  /** Short Hebrew explanation for the owner of why the path looks like this. */
  rationale: z.string().min(1).max(500),
  levels: z.array(generatedLevelSchema).min(12).max(16),
})
export type PlanOutput = z.infer<typeof planOutputSchema>

export const adaptOutputSchema = z.object({
  explanation: z.string().min(1).max(300),
  exercise: exerciseContentSchema.extend({
    mediaId: z.string().min(1).max(60).nullable(),
    technique: techniqueChoiceSchema.nullable().default(null),
  }),
})
export type AdaptOutput = z.infer<typeof adaptOutputSchema>

export const reviseOutputSchema = z.object({
  rationale: z.string().min(1).max(500),
  levels: z.array(generatedLevelSchema).min(1).max(15),
})
export type ReviseOutput = z.infer<typeof reviseOutputSchema>

export function jsonSchemaOf(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema)
}

// ----- Inputs handed to the generator (also read by the local fake) -----

export type CatalogEntry = { id: string; family: string; variant: 'STANDARD' | 'EASIER' }

export type ProfileInput = Pick<OnboardingAnswers, 'name' | 'age' | 'skills' | 'difficulties' | 'limitations' | 'time'>

/** What the model sees of an offered technique (server-only data such as asset ids stays on the server). */
export type ModelTechnique = {
  key: string
  version: number
  topic: TopicName
  allowedAges: string[]
  variants: {
    variant: 'STANDARD' | 'EASIER'
    title: string
    goal: string
    steps: string[]
    params: { id: string; unit: string; min: number; max: number; default: number }[]
    tips: { id: string; text: string }[]
  }[]
}

export type PlanInputBase = {
  profile: ProfileInput
  mediaCatalog: CatalogEntry[]
  /** Reviewed techniques with published, compatible demonstrations. Empty: every level is free-form. */
  techniques: ModelTechnique[]
  /** When true every level must use an offered technique (switched on only after the catalog is verified). */
  mediaRequired: boolean
  policyVersion: string
}

export type InitialPlanInput = PlanInputBase & { task: 'initial_plan'; levelCount: { min: number; max: number } }

export type AttemptSummary = { outcome: 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING'; mode: 'CURRENT' | 'REVIEW' }

export type AdaptCurrentInput = PlanInputBase & {
  task: 'adapt_current'
  currentLevel: { stableKey: string | null; topic: TopicName; position: number }
  currentExercise: z.infer<typeof exerciseContentSchema>
  /** The technique the current exercise demonstrates, if any. */
  currentTechnique: TechniqueChoice | null
  recentAttempts: AttemptSummary[]
}

export type ReviseFutureInput = PlanInputBase & {
  task: 'revise_future'
  completedSummaries: { stableKey: string | null; topic: TopicName; title: string }[]
  currentLevel: { stableKey: string | null; topic: TopicName; position: number }
  lockedLevels: GeneratedLevel[]
  recentAttempts: AttemptSummary[]
  totalLevelBounds: { min: number; max: number }
}
