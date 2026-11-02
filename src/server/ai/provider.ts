import { aiConfig, type AiConfig } from './config'
import { anthropicGenerate } from './anthropic'
import { fakeGenerate } from './fake'
import { geminiGenerate } from './gemini'

export type GenerateRequest = {
  kind: 'INITIAL_PLAN' | 'ADAPT_CURRENT' | 'REVISE_FUTURE'
  system: string
  /** Structured input. Owner text is data inside it, never part of the instructions. */
  input: unknown
  /** JSON Schema of the expected output. */
  schema: unknown
}

export type GenerateResult = {
  json: unknown
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
}

/** Failure of the provider itself (network, timeout, HTTP error, unusable body). Never carries keys or owner data. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

export async function generate(config: AiConfig, request: GenerateRequest): Promise<GenerateResult> {
  switch (config.kind) {
    case 'anthropic':
      return anthropicGenerate(config, request)
    case 'gemini':
      return geminiGenerate(config, request)
    case 'fake':
      return fakeGenerate(request, config.timeoutMs)
    case 'none':
      throw new AiProviderError('AI provider is not configured', false)
  }
}

export { aiConfig }
