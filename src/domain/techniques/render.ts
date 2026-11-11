import { exerciseContentSchema, type ExerciseContent } from '@/server/content'
import { validateTechniqueParams, type ParamValues } from './params'
import type { TechniqueDefinition, TechniqueVariantName } from './types'

const fill = (text: string, params: ParamValues) => text.replace(/\{(\w+)\}/g, (_, id: string) => String(params[id] ?? `{${id}}`))

/**
 * Builds the standard exercise content from the catalog. Mandatory steps, the criterion, preparation and stop
 * conditions are catalog text; only the validated integer parameters and catalog tips vary.
 */
export function renderTechniqueContent(
  def: TechniqueDefinition,
  variantName: TechniqueVariantName,
  params: ParamValues,
  tipIds: string[] = [],
): ExerciseContent {
  const variant = def.variants[variantName]
  if (!variant) throw new Error(`${def.key}@${def.version} has no ${variantName} variant`)
  const issues = validateTechniqueParams(variant, params)
  if (issues.length > 0) throw new Error(`invalid parameters: ${issues.join('; ')}`)
  const tips = tipIds.map((id) => {
    const tip = variant.tips.find((t) => t.id === id)
    if (!tip) throw new Error(`unknown tip "${id}"`)
    return tip.text
  })
  const easier = variantName === 'STANDARD' ? def.variants.EASIER : undefined
  return exerciseContentSchema.parse({
    title: variant.title,
    goal: variant.goal,
    estimatedMinutes: variant.estimatedMinutes,
    preparation: [...variant.preparation, ...tips].map((t) => fill(t, params)),
    steps: variant.steps.map((s) => fill(s.text, params)),
    successCriterion: fill(variant.successCriterion, params),
    stopConditions: def.stopConditions,
    easierVariant: easier
      ? { title: easier.title, steps: easier.steps.map((s) => fill(s.text, { ...Object.fromEntries(easier.params.map((p) => [p.id, p.default])), ...params })) }
      : def.fallbackEasier,
  })
}
