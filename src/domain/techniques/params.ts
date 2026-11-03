import type { TechniqueDefinition, TechniqueParam, TechniqueVariant, TechniqueVariantName } from './types'

export type ParamValues = Record<string, number>

export function variantOf(def: TechniqueDefinition, name: TechniqueVariantName): TechniqueVariant | null {
  return def.variants[name] ?? null
}

/**
 * Deterministic parameter check for the written instructions: exactly the declared parameters, each an
 * integer inside its full range. Returns issues (empty = valid).
 */
export function validateTechniqueParams(variant: TechniqueVariant, params: ParamValues): string[] {
  const issues: string[] = []
  const known = new Set(variant.params.map((p) => p.id))
  for (const id of Object.keys(params)) if (!known.has(id)) issues.push(`unknown parameter "${id}"`)
  for (const spec of variant.params) {
    const value = params[spec.id]
    if (value === undefined) issues.push(`missing parameter "${spec.id}"`)
    else if (!Number.isInteger(value)) issues.push(`parameter "${spec.id}" is not an integer`)
    else if (value < spec.min || value > spec.max) issues.push(`parameter "${spec.id}" is outside ${spec.min}-${spec.max}`)
  }
  return issues
}

export function defaultParams(variant: TechniqueVariant): ParamValues {
  return Object.fromEntries(variant.params.map((p) => [p.id, p.default]))
}

export function demonstratedParams(variant: TechniqueVariant): ParamValues {
  return Object.fromEntries(variant.params.map((p) => [p.id, p.demonstrated]))
}

export const isMediaNeutral = (p: TechniqueParam) => p.compatibleMin === p.min && p.compatibleMax === p.max

/** Internal consistency of a definition's parameter specs (used by the catalog test). */
export function checkParamSpec(p: TechniqueParam): string[] {
  const issues: string[] = []
  const ok = (n: number) => Number.isInteger(n)
  if (![p.min, p.max, p.default, p.demonstrated, p.compatibleMin, p.compatibleMax].every(ok)) issues.push(`${p.id}: not integers`)
  if (!(p.min <= p.compatibleMin && p.compatibleMin <= p.compatibleMax && p.compatibleMax <= p.max)) issues.push(`${p.id}: compatible range outside range`)
  if (!(p.compatibleMin <= p.demonstrated && p.demonstrated <= p.compatibleMax)) issues.push(`${p.id}: demonstrated value outside compatible range`)
  if (!(p.min <= p.default && p.default <= p.max)) issues.push(`${p.id}: default outside range`)
  return issues
}

/**
 * Binding check: may the FIXED clip (which shows `mediaDemonstrated`) accompany instructions with `params`?
 * - the clip must declare exactly the catalog's demonstrated values (otherwise it shows another method), and
 * - every chosen value must be inside the parameter's compatible range.
 * A technique key match alone is never enough.
 */
export function checkMediaParamCompatibility(variant: TechniqueVariant, params: ParamValues, mediaDemonstrated: ParamValues): string[] {
  const issues = validateTechniqueParams(variant, params)
  for (const spec of variant.params) {
    if (mediaDemonstrated[spec.id] !== spec.demonstrated) issues.push(`media demonstrates ${spec.id}=${mediaDemonstrated[spec.id]}, catalog says ${spec.demonstrated}`)
    const value = params[spec.id]
    if (value !== undefined && (value < spec.compatibleMin || value > spec.compatibleMax)) {
      issues.push(`parameter "${spec.id}"=${value} is outside the range ${spec.compatibleMin}-${spec.compatibleMax} that the clip shows`)
    }
  }
  for (const id of Object.keys(mediaDemonstrated)) if (!variant.params.some((p) => p.id === id)) issues.push(`media declares unknown parameter "${id}"`)
  return issues
}
