import type { Parsed } from './jobs'
import { adaptOutputSchema, planOutputSchema, reviseOutputSchema } from './schema'
import type { AdaptOutput, PlanOutput, ReviseOutput, TopicName } from './schema'
import { validateAdapt, validatePlan, validateRevise, type Context } from './validate'

/** Reasons are for the server log only and never include candidate text or owner data. */
const failure = (reason: string, issues?: string[]): Parsed<never> => ({ ok: false, reason, issues })

/** Schema problems as short labels (path and rule, never the candidate's values), safe to hand back to the model. */
const schemaIssues = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message.slice(0, 80)}`)

export function parsePlan(ctx: Context) {
  return (json: unknown): Parsed<PlanOutput> => {
    const parsed = planOutputSchema.safeParse(json)
    if (!parsed.success) return failure('schema', schemaIssues(parsed.error))
    const issues = validatePlan(parsed.data, ctx)
    return issues.length ? failure(`${issues.length} validation issues`, issues) : { ok: true, data: parsed.data }
  }
}

export function parseAdapt(ctx: Context) {
  return (json: unknown): Parsed<AdaptOutput> => {
    const parsed = adaptOutputSchema.safeParse(json)
    if (!parsed.success) return failure('schema', schemaIssues(parsed.error))
    const issues = validateAdapt(parsed.data, ctx)
    return issues.length ? failure(`${issues.length} validation issues`, issues) : { ok: true, data: parsed.data }
  }
}

export function parseRevise(
  ctx: Context,
  kept: { stableKeys: string[]; topics: TopicName[]; count: number },
  bounds: { min: number; max: number },
) {
  return (json: unknown): Parsed<ReviseOutput> => {
    const parsed = reviseOutputSchema.safeParse(json)
    if (!parsed.success) return failure('schema', schemaIssues(parsed.error))
    const issues = validateRevise(parsed.data, ctx, kept, bounds)
    return issues.length ? failure(`${issues.length} validation issues`, issues) : { ok: true, data: parsed.data }
  }
}
