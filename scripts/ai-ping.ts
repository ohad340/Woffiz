// One minimal live access check of the configured provider: a tiny structured request, a few tokens.
// Run first: npm run ai:ping. Prints the model, status, latency and token usage; never the key.
import 'dotenv/config'
import { aiConfig } from '../src/server/ai/config'
import { estimateCostUsd } from '../src/server/ai/pricing'
import { generate } from '../src/server/ai/provider'

const config = aiConfig()
if (config.kind === 'none' || config.kind === 'fake') {
  console.error('No live provider is configured (ANTHROPIC_API_KEY is missing in .env). Nothing was called.')
  process.exit(1)
}

try {
  const result = await generate(config, {
    kind: 'INITIAL_PLAN',
    system: 'Answer with JSON that matches the schema.',
    input: { task: 'access check' },
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
  })
  const cost = estimateCostUsd(config.model, result.inputTokens, result.outputTokens)
  console.log(
    `ok: provider ${config.kind}, model ${config.model}, ${result.latencyMs} ms, in ${result.inputTokens} / out ${result.outputTokens} tokens, ~$${cost?.toFixed(6) ?? '?'}, answer ${JSON.stringify(result.json)}`,
  )
} catch (error) {
  console.error(`FAILED: provider ${config.kind}, model ${config.model}: ${error instanceof Error ? error.message : 'unknown error'}`)
  process.exit(1)
}
