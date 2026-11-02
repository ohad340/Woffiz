import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { recordAttempt } from '@/server/progress'
import { adaptCurrentExercise, reviseFuturePlan } from '@/server/revision'
import { createUser, key, onboard, planFor, resetDatabase } from './helpers'

// Opt-in, spends a few cents: AI_LIVE=1 npm run test:integration -- test/integration/ai-live.test.ts
// Runs the whole pipeline (jobs, validation, commit, adapt, revise) against the real model with the key from .env.
const live = process.env.AI_LIVE === '1'

function envValue(name: string) {
  return readFileSync('.env', 'utf8').match(new RegExp(`^${name}="?([^"\\n]*)`, 'm'))?.[1]?.trim()
}

beforeEach(resetDatabase)

describe.skipIf(!live)('live model', () => {
  it('creates, adapts and revises a plan through the real provider', async () => {
    process.env.AI_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = envValue('ANTHROPIC_API_KEY')
    process.env.AI_MODEL_ID = envValue('AI_MODEL_ID') || 'claude-haiku-5-5'

    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    expect(plan.source).toMatch(/^ai:/)
    expect(plan.levels.length).toBeGreaterThanOrEqual(12)

    const level = plan.levels[0]!
    await recordAttempt(user.id, { levelId: level.id, outcome: 'STRUGGLING', idempotencyKey: key() })
    await recordAttempt(user.id, { levelId: level.id, outcome: 'STRUGGLING', idempotencyKey: key() })
    const adapted = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, key())
    const revised = await reviseFuturePlan(user.id, { planRevision: adapted.planRevision }, key())

    const jobs = await prisma.generationJob.findMany({ where: { puppy: { ownerId: user.id } }, orderBy: { createdAt: 'asc' } })
    expect(jobs.map((j) => `${j.kind}:${j.status}`)).toEqual(['INITIAL_PLAN:SUCCEEDED', 'ADAPT_CURRENT:SUCCEEDED', 'REVISE_FUTURE:SUCCEEDED'])
    expect(jobs.every((j) => (j.outputTokens ?? 0) > 0 && (j.latencyMs ?? 0) > 0)).toBe(true)
    expect(await prisma.masteryEvent.count()).toBe(0)
    expect(revised.replacedLevels).toBeGreaterThan(0)
    expect(plan.levels[0]!.state).toBe('CURRENT')
  }, 180_000)
})
