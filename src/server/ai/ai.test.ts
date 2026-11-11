import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_ANSWERS, type OnboardingAnswers } from '../content'
import { anthropicGenerate } from './anthropic'
import { aiConfig } from './config'
import { fakeGenerate } from './fake'
import { geminiGenerate } from './gemini'
import { forAnthropic, forGemini } from './json-schema'
import { TEST_MEDIA } from './media'
import { initialPlanRequest, PLAN_LEVELS, POLICY_VERSION } from './prompts'
import { AiProviderError } from './provider'
import { jsonSchemaOf, planOutputSchema, type PlanOutput } from './schema'
import { validatePlan } from './validate'

const LOCAL = { APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000' }

const answers = (extra: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  ...EMPTY_ANSWERS,
  name: 'לוקה',
  age: '10-16w',
  time: '10',
  skills: ['name'],
  difficulties: ['biting'],
  ...extra,
})

async function fakePlan(profile: OnboardingAnswers, mediaCatalog = [] as typeof TEST_MEDIA[number][]): Promise<PlanOutput> {
  const request = initialPlanRequest({ task: 'initial_plan', profile, mediaCatalog, techniques: [], mediaRequired: false, policyVersion: POLICY_VERSION, levelCount: PLAN_LEVELS })
  return planOutputSchema.parse((await fakeGenerate(request)).json)
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AI_FAKE_MODE
})

describe('aiConfig', () => {
  it('defaults to Claude Haiku 5.5 and needs its key', () => {
    expect(aiConfig({})).toEqual({ kind: 'none' })
    expect(aiConfig({ ...LOCAL })).toEqual({ kind: 'none' }) // no implicit local generator any more
    expect(aiConfig({ ANTHROPIC_API_KEY: ' k ' })).toEqual({ kind: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5', timeoutMs: 45_000 })
    expect(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_MODEL_ID: 'claude-sonnet-5-5', AI_TIMEOUT_MS: '5000' })).toEqual({
      kind: 'anthropic',
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      timeoutMs: 5000,
    })
  })

  it('caps the attempt timeout so the whole operation stays below the route duration', () => {
    expect(aiConfig({ ANTHROPIC_API_KEY: 'k', AI_TIMEOUT_MS: '900000' })).toMatchObject({ timeoutMs: 100_000 })
    expect(aiConfig({ ANTHROPIC_API_KEY: 'k', AI_TIMEOUT_MS: 'abc' })).toMatchObject({ timeoutMs: 45_000 })
  })

  it('never switches provider or model on its own', () => {
    // A Gemini key does not enable Claude, and a Gemini model id is a configuration error for Claude.
    expect(aiConfig({ GEMINI_API_KEY: 'g' })).toEqual({ kind: 'none' })
    expect(aiConfig({ ANTHROPIC_API_KEY: 'k', AI_MODEL_ID: 'gemini-3.5-flash-lite' })).toEqual({ kind: 'none' })
    expect(aiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'g', AI_MODEL_ID: 'claude-haiku-5-5' })).toEqual({ kind: 'none' })
    // An unknown provider name disables the service instead of choosing another.
    expect(aiConfig({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'k' })).toEqual({ kind: 'none' })
  })

  it('keeps Gemini for explicit configuration only', () => {
    expect(aiConfig({ AI_PROVIDER: 'gemini', ...LOCAL })).toEqual({ kind: 'none' })
    expect(aiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: ' k ', AI_MODEL_ID: 'gemini-x', AI_TIMEOUT_MS: '5000' })).toEqual({
      kind: 'gemini',
      apiKey: 'k',
      model: 'gemini-x',
      timeoutMs: 5000,
    })
    expect(aiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toMatchObject({ model: 'gemini-3.5-flash-lite' })
  })

  it('uses the local generator only when asked for, on a local machine or under test', () => {
    expect(aiConfig({ AI_PROVIDER: 'fake', ...LOCAL })).toMatchObject({ kind: 'fake' })
    expect(aiConfig({ AI_PROVIDER: 'fake', APP_ENV: 'production', BETTER_AUTH_URL: 'https://woffiz.vercel.app' })).toEqual({ kind: 'none' })
    expect(aiConfig({ AI_PROVIDER: 'fake', NODE_ENV: 'test' })).toMatchObject({ kind: 'fake' })
  })
})

describe('schema views per provider', () => {
  const schema = {
    $schema: 'x',
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', minLength: 3, maxLength: 40, pattern: '^[a-z]{3,40}$' },
      minutes: { type: 'integer', minimum: 1, maximum: 60 },
      levels: { type: 'array', minItems: 12, maxItems: 16, items: { type: 'string' } },
      steps: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
    },
  }

  it('Anthropic: drops unsupported keywords, keeps minItems of at most 1 and additionalProperties:false', () => {
    const sent = forAnthropic(schema) as typeof schema
    expect(JSON.stringify(sent)).not.toMatch(/\$schema|minLength|maxLength|pattern|minimum|maximum|maxItems/)
    expect(sent.additionalProperties).toBe(false)
    expect(sent.properties.levels).not.toHaveProperty('minItems') // 12 is not accepted by the endpoint
    expect(sent.properties.steps).toMatchObject({ minItems: 1 })
  })

  it('Gemini: drops $schema, additionalProperties and maxItems only', () => {
    const sent = JSON.stringify(forGemini(schema))
    expect(sent).not.toMatch(/\$schema|additionalProperties|maxItems/)
    expect(sent).toContain('minLength')
  })

  it('the real plan schema passes through the Anthropic view without any rejected keyword', () => {
    const sent = JSON.stringify(forAnthropic(jsonSchemaOf(planOutputSchema)))
    expect(sent).not.toMatch(/minLength|maxLength|"pattern"|"minimum"|"maximum"|maxItems|\$schema/)
    expect(sent).toContain('"additionalProperties":false')
  })
})

describe('Anthropic adapter (official SDK, stubbed network)', () => {
  const config = { kind: 'anthropic' as const, apiKey: 'sk-ant-secret-123', model: 'claude-haiku-5-5', timeoutMs: 1000 }
  const request = {
    kind: 'INITIAL_PLAN' as const,
    system: 'sys',
    input: { profile: { limitations: 'private note' } },
    schema: { $schema: 'x', type: 'object', properties: { list: { type: 'array', maxItems: 3, minItems: 1 } } },
  }
  const message = (over: Record<string, unknown> = {}) =>
    Response.json({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [
        { type: 'thinking', thinking: '', signature: 's' },
        { type: 'text', text: '{"ok":true}' },
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 11, output_tokens: 7 },
      ...over,
    })

  it('sends a bounded, schema-constrained request with the key in a header and no sampling parameters', async () => {
    const fetchMock = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>(async () => message())
    vi.stubGlobal('fetch', fetchMock)
    const result = await anthropicGenerate(config, request)
    expect(result).toMatchObject({ json: { ok: true }, inputTokens: 11, outputTokens: 7 }) // text read by block type, not position

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/v1/messages')
    expect(String(url)).not.toContain('sk-ant-secret-123')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-ant-secret-123') // the SDK (1.x) sends the key as a bearer token
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', system: 'sys', max_tokens: 16_000 })
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } })
    expect(body).not.toHaveProperty('thinking') // adaptive thinking is the model default; see anthropic.ts
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(/maxItems|\$schema/)
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(body).not.toHaveProperty('top_k')
    expect(body.messages).toEqual([{ role: 'user', content: JSON.stringify(request.input) }])
  })

  it('makes exactly one HTTP attempt per call (the job owns the single retry)', async () => {
    const fetchMock = vi.fn(async () => new Response('{"type":"error","error":{"type":"overloaded_error","message":"x"}}', { status: 529 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ retryable: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    [429, true],
    [500, true],
    [529, true],
    [400, false],
    [401, false],
    [404, false],
  ])('maps HTTP %i to retryable=%s without leaking the key or the input', async (status, retryable) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'sk-ant-secret-123 private note' } }), { status })),
    )
    const error = await anthropicGenerate(config, request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as AiProviderError).retryable).toBe(retryable)
    expect((error as Error).message).toBe(`provider status ${status}`)
  })

  it('reports network failures and unusable answers as provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ message: 'provider unreachable', retryable: true })

    vi.stubGlobal('fetch', vi.fn(async () => message({ stop_reason: 'refusal' })))
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ message: 'provider refused the request', retryable: false })

    vi.stubGlobal('fetch', vi.fn(async () => message({ stop_reason: 'max_tokens' })))
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ message: 'provider output was cut off', retryable: true })

    vi.stubGlobal('fetch', vi.fn(async () => message({ content: [{ type: 'text', text: 'not json' }] })))
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ message: 'provider returned invalid JSON', retryable: true })

    vi.stubGlobal('fetch', vi.fn(async () => message({ content: [{ type: 'thinking', thinking: '', signature: 's' }] })))
    await expect(anthropicGenerate(config, request)).rejects.toMatchObject({ message: 'provider returned no content' })
  })
})

describe('Gemini adapter', () => {
  const config = { kind: 'gemini' as const, apiKey: 'secret-key-123', model: 'gemini-3.5-flash-lite', timeoutMs: 1000 }
  const request = { kind: 'INITIAL_PLAN' as const, system: 'sys', input: { profile: { limitations: 'private note' } }, schema: { $schema: 'x', type: 'object', properties: { list: { type: 'array', maxItems: 3, minItems: 1 } } } }

  it('sends the key in a header, structured-output config and the input as data', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const result = await geminiGenerate(config, request)
    expect(result).toMatchObject({ json: { ok: true }, inputTokens: 7, outputTokens: 3 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent')
    expect(url).not.toContain('secret-key-123')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key-123')
    const body = JSON.parse(String(init.body))
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    const sent = JSON.stringify(body.generationConfig.responseJsonSchema)
    expect(sent).not.toContain('$schema')
    expect(sent).not.toContain('maxItems')
    expect(sent).toContain('minItems')
    expect(body.contents[0].parts[0].text).toContain('private note')
  })

  it.each([
    [429, true],
    [503, true],
    [400, false],
  ])('maps HTTP %i to a retryable=%s error without leaking the key or the input', async (status, retryable) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('secret-key-123 private note', { status })))
    const error = await geminiGenerate(config, request).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as AiProviderError).retryable).toBe(retryable)
    expect(String((error as Error).message)).not.toMatch(/secret-key-123|private note/)
  })

  it('reports a timeout and unusable bodies as retryable provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }) }))
    await expect(geminiGenerate(config, request)).rejects.toMatchObject({ message: 'provider timeout', retryable: true })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [] })))
    await expect(geminiGenerate(config, request)).rejects.toMatchObject({ retryable: true })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })))
    await expect(geminiGenerate(config, request)).rejects.toMatchObject({ message: 'provider returned invalid JSON' })
  })
})

describe('local generator and validator', () => {
  const ctx = (a: OnboardingAnswers) => ({ answers: a, catalog: [] as typeof TEST_MEDIA[number][] })

  it('produces valid, differentiated plans for different profiles', async () => {
    const biting = answers({ difficulties: ['biting'] })
    const toilet = answers({ difficulties: ['toilet', 'sleep'], age: 'over-6m', time: '5' })
    const young = answers({ difficulties: ['alone'], age: 'under-10w', time: '15' })
    const [a, b, c] = await Promise.all([fakePlan(biting), fakePlan(toilet), fakePlan(young)])
    expect(validatePlan(a, ctx(biting))).toEqual([])
    expect(validatePlan(b, ctx(toilet))).toEqual([])
    expect(validatePlan(c, ctx(young))).toEqual([])
    expect(a.levels[0]?.topic).toBe('BITING')
    expect(a.levels.map((l) => l.topic)).not.toEqual(b.levels.map((l) => l.topic))
    expect(Math.max(...b.levels.map((l) => l.estimatedMinutes))).toBeLessThanOrEqual(5)
    expect(c.levels.slice(0, 4).some((l) => l.topic === 'ALONE')).toBe(false)
  })

  async function valid() {
    const profile = answers()
    return { plan: await fakePlan(profile), profile }
  }
  const withLevel = (plan: PlanOutput, index: number, patch: Partial<PlanOutput['levels'][number]>): PlanOutput => ({
    ...plan,
    levels: plan.levels.map((level, i) => (i === index ? { ...level, ...patch } : level)),
  })

  it('rejects each kind of unsafe or inconsistent candidate', async () => {
    const { plan, profile } = await valid()
    const issues = (candidate: PlanOutput) => validatePlan(candidate, ctx(profile)).join('|')

    expect(issues(withLevel(plan, 2, { steps: ['מענישים את הגור כשהוא נושך'] }))).toContain('banned wording')
    expect(issues(withLevel(plan, 2, { steps: ['בלי עונש, רק שבח'] }))).not.toContain('banned wording')
    expect(issues(withLevel(plan, 3, { successCriterion: 'מובטח שיצליח' }))).toContain('guaranteed outcome')
    expect(issues(withLevel(plan, 1, { goal: 'ראו https://example.com' }))).toContain('link or markup')
    expect(issues(withLevel(plan, 1, { title: 'only english' }))).toContain('not Hebrew')
    expect(issues(withLevel(plan, 4, { stopConditions: ['ממשיכים בכל מקרה'] }))).toContain('missing vet/trainer stop condition')
    expect(issues(withLevel(plan, 4, { estimatedMinutes: 30 }))).toContain('exceeds')
    expect(issues(withLevel(plan, 5, { prerequisites: ['not-a-level'] }))).toContain('prerequisite is not an earlier level')
    expect(issues(withLevel(plan, 5, { prerequisites: [plan.levels[7]?.stableKey ?? 'x'] }))).toContain('prerequisite is not an earlier level')
    expect(issues(withLevel(plan, 6, { stableKey: plan.levels[0]?.stableKey ?? 'x' }))).toContain('duplicate stableKey')
    expect(issues(withLevel(plan, 3, { mediaId: 'unknown-video' }))).toContain('unknown media id')
  })

  it('rejects three levels of one topic in a row and plans that skip a listed difficulty', async () => {
    const { plan, profile } = await valid()
    const same: PlanOutput = { ...plan, levels: plan.levels.map((l, i) => (i < 3 ? { ...l, topic: 'COMMANDS' as const } : l)) }
    expect(validatePlan(same, ctx(profile)).join('|')).toContain('three times in a row')
    const sleeper = answers({ difficulties: ['sleep'] })
    const noSleep: PlanOutput = { ...plan, levels: plan.levels.map((l) => (l.topic === 'SLEEP' ? { ...l, topic: 'COMMANDS' as const } : l)) }
    expect(validatePlan(noSleep, ctx(sleeper)).join('|')).toContain('does not cover the listed difficulty')
  })

  it('accepts only media that exists in the offered catalog', async () => {
    const profile = answers()
    const catalog = [...TEST_MEDIA]
    const plan = await fakePlan(profile, catalog)
    expect(validatePlan(plan, { answers: profile, catalog })).toEqual([])
    expect(validatePlan(plan, { answers: profile, catalog: [] }).join('|')).toContain('unknown media id')
  })

  it('the generator failure modes surface as provider errors or invalid output', async () => {
    process.env.AI_FAKE_MODE = 'fail'
    await expect(fakePlan(answers())).rejects.toBeInstanceOf(AiProviderError)
    process.env.AI_FAKE_MODE = 'invalid'
    await expect(fakePlan(answers())).rejects.toThrow()
  })
})
