// Runs the plan evaluation cases against the LIVE configured provider (default: Claude Haiku 5.5) and records the
// outputs in test/ai/recorded/<model>/. Costs a few cents (one call per case). Run by the owner: npm run ai:eval
// Needs ANTHROPIC_API_KEY in .env. Prints case ids, counts and problems only, never the key or the plan text.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aiConfig } from '../src/server/ai/config'
import { EVAL_CASES, evaluatePlan } from '../src/server/ai/eval-cases'
import { estimateCostUsd } from '../src/server/ai/pricing'
import { initialPlanRequest, PLAN_LEVELS, POLICY_VERSION, PROMPT_VERSION } from '../src/server/ai/prompts'
import { generate } from '../src/server/ai/provider'
import { planOutputSchema } from '../src/server/ai/schema'

const config = aiConfig()
if (config.kind === 'none' || config.kind === 'fake') {
  console.error('No live provider is configured (ANTHROPIC_API_KEY is missing in .env). Nothing was called.')
  process.exit(1)
}

const dir = join(process.cwd(), 'test/ai/recorded', config.model)
mkdirSync(dir, { recursive: true })
let failures = 0
let totalIn = 0
let totalOut = 0
let totalMs = 0

for (const evalCase of EVAL_CASES) {
  const request = initialPlanRequest({
    task: 'initial_plan',
    profile: evalCase.answers,
    mediaCatalog: [],
    policyVersion: POLICY_VERSION,
    levelCount: PLAN_LEVELS,
  })
  try {
    const result = await generate(config, request)
    const parsed = planOutputSchema.safeParse(result.json)
    const problems = parsed.success ? evaluatePlan(parsed.data, evalCase) : ['output does not match the schema']
    const cost = estimateCostUsd(config.model, result.inputTokens, result.outputTokens)
    totalIn += result.inputTokens ?? 0
    totalOut += result.outputTokens ?? 0
    totalMs += result.latencyMs
    writeFileSync(
      join(dir, `${evalCase.id}.json`),
      JSON.stringify(
        {
          caseId: evalCase.id,
          provider: config.kind,
          model: config.model,
          recordedAt: new Date().toISOString(),
          promptVersion: PROMPT_VERSION,
          policyVersion: POLICY_VERSION,
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, estimatedCostUsd: cost },
          problems,
          output: result.json,
        },
        null,
        2,
      ),
    )
    console.log(
      `${problems.length ? 'FAIL' : 'ok  '} ${evalCase.id}: ${result.latencyMs} ms, in ${result.inputTokens} / out ${result.outputTokens} tokens (output includes any thinking), ~$${cost?.toFixed(4) ?? '?'}${problems.length ? ' | ' + problems.slice(0, 4).join('; ') : ''}`,
    )
    if (problems.length) failures++
  } catch (error) {
    failures++
    console.log(`FAIL ${evalCase.id}: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}
const totalCost = estimateCostUsd(config.model, totalIn, totalOut)
console.log(`Total: in ${totalIn} / out ${totalOut} tokens, ${(totalMs / 1000).toFixed(1)} s of model time, ~$${totalCost?.toFixed(4) ?? '?'} (estimate at list price)`)
console.log(failures ? `${failures} of ${EVAL_CASES.length} cases need attention.` : `All ${EVAL_CASES.length} cases passed the automated checks.`)
process.exit(failures ? 1 : 0)
