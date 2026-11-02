/**
 * LOCAL DEVELOPMENT GENERATOR — not a model, not AI, not reviewed by a qualified trainer.
 * Reshapes the labeled development fixture to the profile (order, minutes, safe wording) so that the whole
 * generation pipeline (jobs, validation, commit, UI) can run without a provider. Honored only on a local
 * machine or under NODE_ENV=test (see config.ts). AI_FAKE_MODE=fail|invalid|slow exercises the failure paths.
 */
import { DEV_PLAN } from '@/fixtures/devPlan'
import { TEST_MEDIA } from './media'
import { AiProviderError, type GenerateRequest, type GenerateResult } from './provider'
import type {
  AdaptCurrentInput,
  AdaptOutput,
  GeneratedLevel,
  InitialPlanInput,
  PlanOutput,
  ReviseFutureInput,
  ReviseOutput,
  TopicName,
} from './schema'

const SAFETY = 'אם הגור נראה כואב, מבוהל מאוד או אגרסיבי, עוצרים ופונים לווטרינר או למאלף מוסמך.'

const DIFFICULTY_TOPIC: Record<string, TopicName> = {
  toilet: 'TOILET',
  biting: 'BITING',
  sleep: 'SLEEP',
  alone: 'ALONE',
  commands: 'COMMANDS',
}

function mediaFor(topic: TopicName, catalog: { id: string; family: string }[]) {
  return catalog.find((entry) => entry.family === topic && TEST_MEDIA.some((m) => m.id === entry.id))?.id ?? null
}

function fixtureLevel(index: number, input: InitialPlanInput): GeneratedLevel {
  const source = DEV_PLAN[index]
  if (!source) throw new Error('unknown fixture level')
  const budget = Number(input.profile.time ?? 15)
  const cap = input.profile.age === 'under-10w' ? Math.min(budget, 5) : budget
  const stopConditions = source.content.stopConditions.some((c) => /וטרינר/.test(c))
    ? [...source.content.stopConditions]
    : [...source.content.stopConditions, SAFETY]
  return {
    ...source.content,
    stopConditions,
    estimatedMinutes: Math.max(1, Math.min(source.estimatedMinutes, cap)),
    stableKey: `fx-${index + 1}`,
    topic: source.topic,
    prerequisites: [],
    mediaId: mediaFor(source.topic, input.mediaCatalog),
  }
}

/** Listed difficulties first, never three of one topic in a row, no alone-time in the first four levels of a very young puppy. */
function orderedFixture(input: InitialPlanInput): GeneratedLevel[] {
  const wanted = new Set(input.profile.difficulties.map((d) => DIFFICULTY_TOPIC[d]))
  const pool = DEV_PLAN.map((_, i) => fixtureLevel(i, input)).sort(
    (a, b) => Number(wanted.has(b.topic)) - Number(wanted.has(a.topic)) || a.stableKey.localeCompare(b.stableKey, 'en', { numeric: true }),
  )
  const out: GeneratedLevel[] = []
  while (pool.length) {
    const index = pool.findIndex((candidate) => {
      const last = out.slice(-2)
      const threeInRow = last.length === 2 && last.every((l) => l.topic === candidate.topic)
      const tooEarlyAlone = input.profile.age === 'under-10w' && candidate.topic === 'ALONE' && out.length < 4
      return !threeInRow && !tooEarlyAlone
    })
    out.push(...pool.splice(index === -1 ? 0 : index, 1))
  }
  return out.map((level, i) => ({ ...level, prerequisites: i === 0 ? [] : [out[i - 1]?.stableKey ?? level.stableKey] }))
}

async function applyMode(timeoutMs: number): Promise<'ok' | 'invalid'> {
  const mode = process.env.AI_FAKE_MODE
  if (mode === 'fail') throw new AiProviderError('provider status 503', true)
  if (mode === 'slow') {
    // Like a real call, a slow one gives up at the attempt timeout.
    const SLOW_MS = 3000
    if (timeoutMs < SLOW_MS) {
      await new Promise((resolve) => setTimeout(resolve, timeoutMs))
      throw new AiProviderError('provider timeout', true)
    }
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS))
  }
  return mode === 'invalid' ? 'invalid' : 'ok'
}

export async function fakeGenerate(request: GenerateRequest, timeoutMs = 45_000): Promise<GenerateResult> {
  const started = Date.now()
  const mode = await applyMode(timeoutMs)
  const input = request.input as InitialPlanInput | AdaptCurrentInput | ReviseFutureInput
  let json: unknown

  if (input.task === 'initial_plan') {
    const output: PlanOutput = {
      rationale: 'תוכנית הדגמה מקומית שנבנתה מתוכן פיתוח, לא על ידי מודל.',
      levels: mode === 'invalid' ? [] : orderedFixture(input),
    }
    json = output
  } else if (input.task === 'adapt_current') {
    const easier = input.currentExercise.easierVariant
    const output: AdaptOutput = {
      explanation: 'הקלנו את התרגיל: פחות חזרות וצעדים קטנים יותר (הדגמה מקומית).',
      exercise: {
        ...input.currentExercise,
        title: `${input.currentExercise.title} (מותאם)`,
        steps: mode === 'invalid' ? [] : easier.steps,
        mediaId: null,
      },
    }
    json = output
  } else {
    const output: ReviseOutput = {
      rationale: 'סידרנו מחדש את המשך המסלול (הדגמה מקומית).',
      levels: mode === 'invalid' ? [] : input.lockedLevels.map((level, i, all) => ({
        ...level,
        stableKey: `rv-${input.currentLevel.position + i + 1}`,
        prerequisites: i === 0 ? (input.currentLevel.stableKey ? [input.currentLevel.stableKey] : []) : [`rv-${input.currentLevel.position + i}`],
        mediaId: all[i]?.mediaId ?? null,
      })),
    }
    json = output
  }
  return { json, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started }
}
