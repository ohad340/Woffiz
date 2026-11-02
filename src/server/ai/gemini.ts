import type { AiConfig } from './config'
import { forGemini } from './json-schema'
import { AiProviderError, type GenerateRequest, type GenerateResult } from './provider'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/**
 * One structured-output call to the Gemini REST API. Errors carry only the HTTP status or a fixed
 * phrase: never the key, the request body (owner text) or the response body.
 */
export async function geminiGenerate(
  config: Extract<AiConfig, { kind: 'gemini' }>,
  request: GenerateRequest,
): Promise<GenerateResult> {
  const started = Date.now()
  let response: Response
  try {
    response = await fetch(`${BASE}/${encodeURIComponent(config.model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(request.input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: forGemini(request.schema),
          temperature: 0.4,
          maxOutputTokens: 16_000,
        },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new AiProviderError(timedOut ? 'provider timeout' : 'provider unreachable', true)
  }
  if (!response.ok) {
    throw new AiProviderError(`provider status ${response.status}`, response.status === 429 || response.status >= 500)
  }
  let body: GeminiResponse
  try {
    body = (await response.json()) as GeminiResponse
  } catch {
    throw new AiProviderError('provider returned an unreadable body', true)
  }
  const candidate = body.candidates?.[0]
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('')
  if (!text) throw new AiProviderError(`provider returned no content (${candidate?.finishReason ?? 'unknown'})`, true)
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new AiProviderError('provider returned invalid JSON', true)
  }
  return {
    json,
    inputTokens: body.usageMetadata?.promptTokenCount ?? null,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
    latencyMs: Date.now() - started,
  }
}
