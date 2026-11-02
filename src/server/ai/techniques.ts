import { checkMediaParamCompatibility, type ParamValues } from '@/domain/techniques/params'
import { renderTechniqueContent } from '@/domain/techniques/render'
import type { TechniqueDefinition, TechniqueVariantName } from '@/domain/techniques/types'
import type { ExerciseContent, OnboardingAnswers } from '../content'
import type { ModelTechnique, TechniqueChoice, TopicName } from './schema'

/**
 * Technique-bound generation (slice 3C), pure part. The database part (what is offered, the commit-time recheck)
 * lives in src/server/media/offer.ts.
 */

/** A published, compatible demonstration of one variant. `demonstrated` are the parameter values the clip shows. */
export type OfferedSlot = { variant: TechniqueVariantName; assetId: string; mediaVersionId: string; demonstrated: ParamValues }

/** A technique the server offers: approved, frozen, not suspended, with a published STANDARD clip. */
export type OfferedTechnique = { def: TechniqueDefinition; slots: OfferedSlot[] }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** What the model may choose from: catalog text for context, and only the parameter values the clips still show. */
export function modelTechniques(offers: readonly OfferedTechnique[]): ModelTechnique[] {
  return offers.map(({ def, slots }) => ({
    key: def.key,
    version: def.version,
    topic: def.topic,
    allowedAges: [...def.audience.allowedAges],
    variants: slots.flatMap((slot) => {
      const variant = def.variants[slot.variant]
      if (!variant) return []
      return [
        {
          variant: slot.variant,
          title: variant.title,
          goal: variant.goal,
          steps: variant.steps.map((s) => s.text),
          params: variant.params.map((p) => ({ id: p.id, unit: p.unit, min: p.compatibleMin, max: p.compatibleMax, default: clamp(p.default, p.compatibleMin, p.compatibleMax) })),
          tips: variant.tips.map((t) => ({ id: t.id, text: t.text })),
        },
      ]
    }),
  }))
}

export const paramValues = (choice: TechniqueChoice): ParamValues => Object.fromEntries(choice.params.map((p) => [p.id, p.value]))

export function findOffer(offers: readonly OfferedTechnique[], choice: Pick<TechniqueChoice, 'key' | 'version'>) {
  return offers.find((o) => o.def.key === choice.key && o.def.version === choice.version)
}

/**
 * Deterministic check of one technique choice. A technique key alone is never enough: the topic, the variant (and that a
 * published clip exists for it), the puppy's age, every parameter against the range the clip still shows, and every tip
 * must be acceptable.
 */
export function techniqueIssues(
  label: string,
  topic: TopicName,
  choice: TechniqueChoice,
  ctx: { answers: OnboardingAnswers; techniques: readonly OfferedTechnique[] },
  options: { allowEasier: boolean },
): string[] {
  const offer = findOffer(ctx.techniques, choice)
  if (!offer) return [`${label}: technique ${choice.key}@${choice.version} is not offered`]
  const issues: string[] = []
  if (offer.def.topic !== topic) issues.push(`${label}: technique topic ${offer.def.topic} differs from level topic ${topic}`)
  if (choice.variant === 'EASIER' && !options.allowEasier) issues.push(`${label}: plan levels use the STANDARD variant`)
  const slot = offer.slots.find((s) => s.variant === choice.variant)
  const variant = offer.def.variants[choice.variant]
  if (!slot || !variant) return [...issues, `${label}: no published ${choice.variant} demonstration for ${choice.key}@${choice.version}`]
  const age = ctx.answers.age ?? 'unsure'
  if (!offer.def.audience.allowedAges.includes(age)) issues.push(`${label}: technique not allowed for age ${age}`)
  const ids = choice.params.map((p) => p.id)
  if (new Set(ids).size !== ids.length) issues.push(`${label}: a parameter is given twice`)
  for (const issue of checkMediaParamCompatibility(variant, paramValues(choice), slot.demonstrated)) issues.push(`${label}: ${issue}`)
  if (new Set(choice.tipIds).size !== choice.tipIds.length) issues.push(`${label}: a tip is given twice`)
  for (const tip of choice.tipIds) if (!variant.tips.some((t) => t.id === tip)) issues.push(`${label}: unknown tip "${tip}"`)
  return issues
}

/** The catalog rendering of a VALID choice: the only instruction text a technique-bound exercise ever shows. */
export function renderChoice(choice: TechniqueChoice, offers: readonly OfferedTechnique[]): ExerciseContent {
  const offer = findOffer(offers, choice)
  if (!offer) throw new Error('technique is not offered')
  return renderTechniqueContent(offer.def, choice.variant, paramValues(choice), choice.tipIds)
}

/** Columns stored on the ExerciseVersion for a valid choice (null technique: free-form, nothing bound). */
export function boundColumns(choice: TechniqueChoice | null, offers: readonly OfferedTechnique[]) {
  if (!choice) return { techniqueKey: null, techniqueVersion: null, techniqueVariant: null, techniqueParamsJson: undefined }
  const slot = findOffer(offers, choice)!.slots.find((s) => s.variant === choice.variant)!
  return {
    mediaId: slot.assetId,
    techniqueKey: choice.key,
    techniqueVersion: choice.version,
    techniqueVariant: choice.variant,
    techniqueParamsJson: { params: paramValues(choice), tipIds: choice.tipIds },
  }
}
