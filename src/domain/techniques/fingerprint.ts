import { createHash } from 'node:crypto'
import type { TechniqueDefinition } from './types'

/** Stable JSON: object keys sorted, undefined dropped. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

/**
 * Fingerprint of what a technique DEMONSTRATES. `review` and `sources` are left out on purpose: approving a
 * definition or re-verifying a source does not change the method, so it must not invalidate media approvals.
 */
export function fingerprintTechnique(def: TechniqueDefinition): string {
  const { review: _review, sources: _sources, ...behaviour } = def
  void _review
  void _sources
  return sha256(canonicalJson({ v: 'technique-fp-1', ...behaviour }))
}
