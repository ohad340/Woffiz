import { z } from 'zod'

/** Hebrew exercise content stored as an immutable snapshot (ExerciseVersion.contentJson). */
export const exerciseContentSchema = z.object({
  title: z.string().min(1).max(80),
  goal: z.string().min(1).max(200),
  estimatedMinutes: z.number().int().min(1).max(60),
  preparation: z.array(z.string().min(1).max(200)).max(8),
  steps: z.array(z.string().min(1).max(300)).min(1).max(10),
  successCriterion: z.string().min(1).max(300),
  stopConditions: z.array(z.string().min(1).max(300)).max(5),
  /** Predefined easier version (Phase 1 has no AI). */
  easierVariant: z.object({
    title: z.string().min(1).max(80),
    steps: z.array(z.string().min(1).max(300)).min(1).max(6),
  }),
})

export type ExerciseContent = z.infer<typeof exerciseContentSchema>

/** Onboarding answers. Owner-entered text is untrusted: bounded and never rendered as HTML. */
export const AGE_BANDS = ['under-10w', '10-16w', '4-6m', 'over-6m', 'unsure'] as const
export const SKILLS = ['name', 'sit', 'come', 'bed', 'unsure'] as const
export const DIFFICULTIES = ['toilet', 'biting', 'sleep', 'alone', 'commands'] as const
export const PRACTICE_TIMES = ['5', '10', '15'] as const

export const onboardingAnswersSchema = z
  .object({
    name: z.string().trim().max(40),
    age: z.enum(AGE_BANDS).nullable(),
    skills: z.array(z.enum(SKILLS)).max(5),
    difficulties: z.array(z.enum(DIFFICULTIES)).max(5),
    limitations: z.string().trim().max(300),
    time: z.enum(PRACTICE_TIMES).nullable(),
  })
  .strict()

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>

export const EMPTY_ANSWERS: OnboardingAnswers = {
  name: '',
  age: null,
  skills: [],
  difficulties: [],
  limitations: '',
  time: null,
}

export const AGE_LABELS: Record<(typeof AGE_BANDS)[number], string> = {
  'under-10w': 'עד 10 שבועות',
  '10-16w': '10–16 שבועות',
  '4-6m': '4–6 חודשים',
  'over-6m': 'מעל 6 חודשים',
  unsure: 'גיל לא ידוע',
}
