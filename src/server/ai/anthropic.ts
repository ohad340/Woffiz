import Anthropic from '@anthropic-ai/sdk'
import type { AiConfig } from './config'
import { forAnthropic } from './json-schema'
import { AiProviderError, type GenerateRequest, type GenerateResult } from './provider'

/**
 * Bounded output. A 16-level Hebrew plan is about 4-5K output tokens (measured with the evaluation cases); the cap
 * leaves room for adaptive thinking and a longer plan, and stays under the size the SDK accepts without streaming.
 */
const MAX_OUTPUT_TOKENS = 16_000

/**
 * One structured-output call to the Claude Messages API through the official SDK (Claude Haiku 5.5).
 * - `output_config.format` constrains the answer to our JSON schema (no beta header needed); every bound the
 *   endpoint cannot express is enforced by our own validation afterwards.
 * - `effort: low` with the model's default adaptive thinking. Turning thinking off (`disabled` is accepted at effort
 *   low, medium and high on Haiku 5.5) was measured on the six evaluation cases (docs/AI_EVALS.md): about 6 s and
 *   1.5K output tokens faster per plan, but only 4 of 6 cases passed even after the retry with the validator's
 *   findings, against 5 of 6 on the first attempt and 6 of 6 after the retry with adaptive thinking. Compliance with
 *   the safety and structure rules comes first, so thinking stays on (thinking tokens are billed as output).
 * - No temperature/top_p/top_k: Haiku 5.5 rejects non-default values with a 400.
 * - `maxRetries: 0`: the one automatic retry belongs to the generation job (jobs.ts), so retries never multiply.
 * Errors carry only a fixed phrase or the HTTP status: never the key, the request (owner text) or the response body.
 */
export async function anthropicGenerate(
  config: Extract<AiConfig, { kind: 'anthropic' }>,
  request: GenerateRequest,
): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 0 })
  const started = Date.now()

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: request.system,
      messages: [{ role: 'user', content: JSON.stringify(request.input) }],
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: forAnthropic(request.schema) as Record<string, unknown> },
      },
    })
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiProviderError('provider timeout', true)
    if (error instanceof Anthropic.APIConnectionError) throw new AiProviderError('provider unreachable', true)
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 0
      // 429 (rate limit), 5xx and 529 (overloaded) are transient; other 4xx are our request or configuration.
      throw new AiProviderError(`provider status ${status}`, status === 429 || status >= 500)
    }
    throw new AiProviderError('provider call failed', false)
  }

  if (response.stop_reason === 'refusal') throw new AiProviderError('provider refused the request', false)
  if (response.stop_reason === 'max_tokens') throw new AiProviderError('provider output was cut off', true)

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text) throw new AiProviderError('provider returned no content', true)
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AiProviderError('provider returned invalid JSON', true)
  }
  return {
    json,
    inputTokens: response.usage.input_tokens,
    // Output tokens include any thinking tokens: the API bills thinking as output and reports no separate count.
    outputTokens: response.usage.output_tokens,
    latencyMs: Date.now() - started,
  }
}
