import { describe, expect, it } from 'vitest'
import { MOUTHING_REDIRECT_TOY, NAME_LOOK } from '@/domain/techniques/catalog'
import { defaultParams, demonstratedParams } from '@/domain/techniques/params'
import { renderTechniqueContent } from '@/domain/techniques/render'
import type { TechniqueDefinition, TechniqueVariantName } from '@/domain/techniques/types'
import { EMPTY_ANSWERS, type OnboardingAnswers } from '../content'
import { EVAL_CASES, evaluatePlan } from './eval-cases'
import { fakeGenerate } from './fake'
import { forAnthropic } from './json-schema'
import { parseAdapt, parsePlan } from './parse'
import { adaptCurrentRequest, initialPlanRequest, PLAN_LEVELS, POLICY_VERSION } from './prompts'
import { jsonSchemaOf, planOutputSchema, type GeneratedLevel, type PlanOutput, type TechniqueChoice } from './schema'
import { modelTechniques, type OfferedTechnique } from './techniques'
import { validatePlan } from './validate'

// The real definitions are DRAFT. These tests use APPROVED COPIES, offered as if a fixture clip were published, to
// exercise generation. Nothing here approves real content.
const approved = (def: TechniqueDefinition): TechniqueDefinition => ({ ...def, review: { status: 'approved', approvedBy: 'test', approvedOn: '2026-11-03' } })

function offer(def: TechniqueDefinition, variants: TechniqueVariantName[] = ['STANDARD', 'EASIER']): OfferedTechnique {
  const copy = approved(def)
  return {
    def: copy,
    slots: variants.map((variant) => ({
      variant,
      assetId: `slot:${def.key}@${def.version}:${variant}`,
      mediaVersionId: `00000000-0000-4000-8000-00000000000${variant === 'STANDARD' ? 1 : 2}`,
      demonstrated: demonstratedParams(copy.variants[variant]!),
    })),
  }
}

const MOUTHING = offer(MOUTHING_REDIRECT_TOY)
const NAME = offer(NAME_LOOK)
const answers = (extra: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({ ...EMPTY_ANSWERS, name: 'בוני', age: '10-16w', difficulties: ['biting'], time: '10', ...extra })

async function fakePlan(profile: OnboardingAnswers, techniques: OfferedTechnique[], mediaRequired = false): Promise<PlanOutput> {
  const request = initialPlanRequest({ task: 'initial_plan', profile, mediaCatalog: [], techniques: modelTechniques(techniques), mediaRequired, policyVersion: POLICY_VERSION, levelCount: PLAN_LEVELS })
  return planOutputSchema.parse((await fakeGenerate(request)).json)
}

const choice = (over: Partial<TechniqueChoice> = {}): TechniqueChoice => ({
  key: 'mouthing-redirect-toy',
  version: 1,
  variant: 'STANDARD',
  params: Object.entries(defaultParams(MOUTHING_REDIRECT_TOY.variants.STANDARD!)).map(([id, value]) => ({ id, value })),
  tipIds: [],
  ...over,
})

/** A plan whose BITING level carries the given choice (everything else as the fake made it). */
async function planWith(over: Partial<GeneratedLevel>): Promise<PlanOutput> {
  const plan = await fakePlan(answers(), [MOUTHING])
  const index = plan.levels.findIndex((l) => l.technique)
  return { ...plan, levels: plan.levels.map((l, i) => (i === index ? { ...l, ...over } : l)) }
}
const issues = (plan: PlanOutput, techniques = [MOUTHING], profile = answers()) => validatePlan(plan, { answers: profile, catalog: [], techniques }).join(' | ')

describe('what the model is offered', () => {
  it('shows only the parameter values the clip still shows, and never asset ids', () => {
    const [mouthingModel, nameModel] = modelTechniques([MOUTHING, NAME])
    const standard = mouthingModel!.variants.find((v) => v.variant === 'STANDARD')!
    expect(standard.params.find((p) => p.id === 'rounds')).toMatchObject({ min: 1, max: 6 })
    // A media-bound parameter is offered only inside the range the clip shows (name-look: 1-3 m written, clip 1-2 m).
    const nameStandard = nameModel!.variants.find((v) => v.variant === 'STANDARD')!
    expect(nameStandard.params.find((p) => p.id === 'distanceMeters')).toMatchObject({ min: 1, max: 2, default: 1 })
    expect(JSON.stringify([mouthingModel, nameModel])).not.toMatch(/slot:|0000-4000/)
  })

  it('keeps the wire schema closed and without defaults, with the binding required-but-nullable', () => {
    const wire = JSON.stringify(forAnthropic(jsonSchemaOf(planOutputSchema)))
    expect(wire).not.toContain('"default"')
    expect(wire).toContain('"technique"')
    const level = (forAnthropic(jsonSchemaOf(planOutputSchema)) as { properties: { levels: { items: { required: string[] } } } }).properties.levels.items
    expect(level.required).toContain('technique')
  })
})

describe('technique-bound plans', () => {
  it('renders bound levels from the catalog and discards the model text; free-form levels stay as written', async () => {
    const plan = await fakePlan(answers(), [MOUTHING])
    const bound = plan.levels.filter((l) => l.technique)
    expect(bound).toHaveLength(1)
    expect(bound[0]).toMatchObject({ topic: 'BITING', mediaId: null })
    const parsed = parsePlan({ answers: answers(), catalog: [], techniques: [MOUTHING] })(plan)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const level = parsed.data.levels.find((l) => l.technique)!
    const expected = renderTechniqueContent(MOUTHING.def, 'STANDARD', defaultParams(MOUTHING.def.variants.STANDARD!), ['rotate-toys'])
    const { stableKey: _s, topic: _t, prerequisites: _p, mediaId: _m, technique: _q, ...content } = level
    void [_s, _t, _p, _m, _q]
    expect(content).toEqual(expected)
    const free = parsed.data.levels.filter((l) => !l.technique)
    expect(free.map((l) => l.title)).toEqual(plan.levels.filter((l) => !l.technique).map((l) => l.title))
  })

  it('ignores whatever the model wrote into the instruction fields of a bound level', async () => {
    const plan = await planWith({ title: 'x', goal: 'x', steps: ['x'], successCriterion: 'x', stopConditions: [], preparation: [] })
    const parsed = parsePlan({ answers: answers(), catalog: [], techniques: [MOUTHING] })(plan)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.data.levels.find((l) => l.technique)!.title).toBe(MOUTHING.def.variants.STANDARD!.title)
  })

  it('keeps generating free-form plans when nothing is offered (empty published catalog)', async () => {
    const plan = await fakePlan(answers(), [])
    expect(plan.levels.every((l) => l.technique === null)).toBe(true)
    expect(issues(plan, [])).toBe('')
  })

  it('rejects techniques that are not offered, on another topic, of the EASIER variant in a plan, or not for this age', async () => {
    expect(issues(await planWith({}), [])).toMatch(/is not offered/)
    const offTopic = await planWith({})
    const i = offTopic.levels.findIndex((l) => l.technique)
    offTopic.levels[i] = { ...offTopic.levels[i]!, topic: 'COMMANDS' }
    expect(issues(offTopic)).toMatch(/technique topic BITING differs from level topic COMMANDS/)
    expect(issues(await planWith({ technique: choice({ variant: 'EASIER' }) }))).toMatch(/plan levels use the STANDARD variant/)
    const adultsOnly = { ...MOUTHING, def: { ...MOUTHING.def, audience: { ...MOUTHING.def.audience, allowedAges: ['over-6m' as const] } } }
    expect(issues(await planWith({}), [adultsOnly])).toMatch(/not allowed for age 10-16w/)
  })

  it('rejects parameters the clip does not show, even when the written instructions would allow them', async () => {
    // name-look's distance is written as 1-3 m but its clip shows 1-2 m.
    const commands = answers({ difficulties: ['commands'] })
    const namePlan = await fakePlan(commands, [NAME])
    const at = (value: number) => {
      const plan = structuredClone(namePlan)
      const index = plan.levels.findIndex((l) => l.technique)
      plan.levels[index] = { ...plan.levels[index]!, technique: { key: 'name-look', version: 1, variant: 'STANDARD', params: [{ id: 'distanceMeters', value }, { id: 'rounds', value: 5 }, { id: 'sessionsInRow', value: 3 }], tipIds: [] } }
      return validatePlan(plan, { answers: commands, catalog: [], techniques: [NAME] }).join(' | ')
    }
    expect(at(2)).toBe('')
    expect(at(3)).toMatch(/outside the range 1-2 that the clip shows/)
    expect(issues(await planWith({ technique: choice({ params: [{ id: 'sessionsInRow', value: 3 }] }) }))).toMatch(/missing parameter "rounds"/)
    const dup = choice({ params: [...choice().params, { id: 'rounds', value: 2 }] })
    expect(issues(await planWith({ technique: dup }))).toMatch(/given twice/)
    expect(issues(await planWith({ technique: choice({ tipIds: ['made-up'] }) }))).toMatch(/unknown tip "made-up"/)
  })

  it('rejects a bound level that also names a media id: the server binds the clip itself', async () => {
    expect(issues(await planWith({ mediaId: 'slot:mouthing-redirect-toy@1:STANDARD' }))).toMatch(/must leave mediaId null/)
  })

  it('a topic or keyword match alone never binds anything: a free-form level stays free-form', async () => {
    const plan = await fakePlan(answers(), [])
    const biting = plan.levels.find((l) => l.topic === 'BITING')!
    expect(biting.technique).toBeNull()
    expect(biting.title).not.toBe(MOUTHING.def.variants.STANDARD!.title)
  })

  it('with MEDIA_REQUIRED every level must be bound, so an incomplete catalog cannot produce a plan', async () => {
    const plan = await fakePlan(answers(), [MOUTHING, NAME], true)
    const problems = validatePlan(plan, { answers: answers(), catalog: [], techniques: [MOUTHING, NAME], mediaRequired: true })
    expect(problems.some((p) => /a demonstrated technique is required/.test(p))).toBe(true)
    expect(plan.levels.filter((l) => l.technique).every((l) => ['BITING', 'COMMANDS'].includes(l.topic))).toBe(true)
  })
})

describe('technique-bound adaptation', () => {
  const current = renderTechniqueContent(MOUTHING.def, 'STANDARD', defaultParams(MOUTHING.def.variants.STANDARD!))
  const request = (techniques: OfferedTechnique[]) =>
    adaptCurrentRequest({
      task: 'adapt_current',
      profile: answers(),
      mediaCatalog: [],
      techniques: modelTechniques(techniques),
      mediaRequired: false,
      policyVersion: POLICY_VERSION,
      currentLevel: { stableKey: 'fx-1', topic: 'BITING', position: 1 },
      currentExercise: current,
      currentTechnique: choice(),
      recentAttempts: [],
    })

  it('moves to the published EASIER variant of the same technique, rendered from the catalog', async () => {
    const out = (await fakeGenerate(request([MOUTHING]))).json
    const parsed = parseAdapt({ answers: answers(), catalog: [], techniques: [MOUTHING] }, 'BITING')(out)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.exercise.technique).toMatchObject({ key: 'mouthing-redirect-toy', variant: 'EASIER' })
    expect(parsed.data.exercise.steps).toEqual(MOUTHING.def.variants.EASIER!.steps.map((s) => s.text))
  })

  it('stays free-form when no EASIER clip is published, and rejects a binding on another topic', async () => {
    const out = (await fakeGenerate(request([offer(MOUTHING_REDIRECT_TOY, ['STANDARD'])]))).json as { exercise: { technique: unknown } }
    expect(out.exercise.technique).toBeNull()
    const easier = (await fakeGenerate(request([MOUTHING]))).json
    const wrongTopic = parseAdapt({ answers: answers(), catalog: [], techniques: [MOUTHING] }, 'SLEEP')(easier)
    expect(wrongTopic.ok).toBe(false)
  })
})

describe('evaluation cases with an offered technique (local generator, no model call)', () => {
  it.each(EVAL_CASES)('"$id" still passes with mouthing and name-look offered', async (evalCase) => {
    const plan = await fakePlan(evalCase.answers, [MOUTHING, NAME])
    const parsed = parsePlan({ answers: evalCase.answers, catalog: [], techniques: [MOUTHING, NAME] })(plan)
    expect(parsed.ok, parsed.ok ? '' : (parsed.issues ?? []).join(' | ')).toBe(true)
    if (parsed.ok) expect(evaluatePlan(parsed.data, evalCase, [MOUTHING, NAME])).toEqual([])
  })
})
