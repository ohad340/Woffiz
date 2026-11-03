import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EVAL_CASES, evaluatePlan } from './eval-cases'
import { fakeGenerate } from './fake'
import { initialPlanRequest, PLAN_LEVELS, POLICY_VERSION } from './prompts'
import { planOutputSchema } from './schema'

describe('plan evaluation cases', () => {
  it.each(EVAL_CASES)('local generator satisfies "$id"', async (evalCase) => {
    const request = initialPlanRequest({
      task: 'initial_plan',
      profile: evalCase.answers,
      mediaCatalog: [],
      techniques: [],
      mediaRequired: false,
      policyVersion: POLICY_VERSION,
      levelCount: PLAN_LEVELS,
    })
    const plan = planOutputSchema.parse((await fakeGenerate(request)).json)
    expect(evaluatePlan(plan, evalCase)).toEqual([])
  })

  // Recordings come from `npm run ai:eval` (a live model call, run by the owner). They are re-validated offline
  // so a change to the validator or the cases shows up without spending anything.
  const recordedDir = join(process.cwd(), 'test/ai/recorded')
  const recordings = existsSync(recordedDir)
    ? readdirSync(recordedDir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.json'))
    : []

  it.skipIf(recordings.length === 0)('recorded model outputs keep their recorded verdict', () => {
    for (const file of recordings) {
      const record = JSON.parse(readFileSync(join(recordedDir, file), 'utf8')) as { caseId: string; problems: string[]; output: unknown }
      const evalCase = EVAL_CASES.find((c) => c.id === record.caseId)
      expect(evalCase, `unknown case in ${file}`).toBeDefined()
      const parsed = planOutputSchema.safeParse(record.output)
      const problems = parsed.success ? evaluatePlan(parsed.data, evalCase!) : ['output does not match the schema']
      // A recording that passed must still pass; one that failed (kept as evidence) must still be refused,
      // so a weaker validator or check shows up here without spending anything.
      if (record.problems.length === 0) expect(problems, file).toEqual([])
      else expect(problems.length, file).toBeGreaterThan(0)
    }
  })
})
