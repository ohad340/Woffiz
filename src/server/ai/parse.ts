import type { Parsed } from './jobs'
import { adaptOutputSchema, planOutputSchema, reviseOutputSchema } from './schema'
import type { AdaptOutput, PlanOutput, ReviseOutput, TopicName } from './schema'
import { rendered, validateAdapt, validatePlan, validateRevise, type Context } from './validate'

/** Reasons are for the server log only and never include candidate text or owner data. */
const failure = (reason: string, issues?: string[]): Parsed<never> => ({ ok: false, reason, issues })

/** Schema problems as short labels (path and rule, never the candidate's values), safe to hand back to the model. */
const schemaIssues = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message.slice(0, 80)}`)

// A successful parse returns what will be STORED: technique-bound exercises already carry the catalog rendering
// instead of the model's text (validate.ts `rendered`), so nothing the model wrote for them can reach the owner.

export function parsePlan(ctx: Context) {
  return (json: unknown): Parsed<PlanOutput> => {
    const parsed = planOutputSchema.safeParse(json)
    if (!parsed.success) return failure('schema', schemaIssues(parsed.error))
    const issues = validatePlan(parsed.data, ctx)
    if (issues.length) return failure(`${issues.length} validation issues`, issues)
    return { ok: true, data: { ...parsed.data, levels: parsed.data.levels.map((level) => rendered(level, ctx)) } }
  }
}

export function parseAdapt(ctx: Context, topic: TopicName) {
  return (json: unknown): Parsed<AdaptOutput> => {
    const parsed = adaptOutputSchema.safeParse(json)
    if (!parsed.success) return failure('schema', schemaIssues(parsed.error))
    const issues = validateAdapt(parsed.data, ctx, topic)
    if (issues.length) return failure(`${issues.length} validation issues`, issues)
    return { ok: true, data: { ...parsed.data, exercise: rendered(parsed.data.exercise, ctx) } }
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
    if (issues.length) return failure(`${issues.length} validation issues`, issues)
    return { ok: true, data: { ...parsed.data, levels: parsed.data.levels.map((level) => rendered(level, ctx)) } }
  }
}
