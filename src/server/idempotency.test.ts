import { describe, expect, it } from 'vitest'
import { hashPayload } from './idempotency'

describe('hashPayload', () => {
  it('is stable regardless of key order', () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashPayload({ b: { d: [1, 2], c: 2 }, a: 1 }))
  })

  it('changes when any value changes', () => {
    const base = { levelId: 'x', outcome: 'INDEPENDENT' }
    expect(hashPayload(base)).not.toBe(hashPayload({ ...base, outcome: 'WITH_HELP' }))
    expect(hashPayload(base)).not.toBe(hashPayload({ ...base, levelId: 'y' }))
  })

  it('ignores undefined fields and distinguishes order in arrays', () => {
    expect(hashPayload({ a: 1, b: undefined })).toBe(hashPayload({ a: 1 }))
    expect(hashPayload([1, 2])).not.toBe(hashPayload([2, 1]))
  })
})
