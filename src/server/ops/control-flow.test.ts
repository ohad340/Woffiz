import { describe, expect, it } from 'vitest'
import { isNextControlFlow } from './control-flow'

describe('Next.js control-flow filter of onRequestError', () => {
  it('recognises the control-flow digests', () => {
    for (const digest of [
      'NEXT_REDIRECT;replace;/;307;',
      'NEXT_NOT_FOUND',
      'NEXT_HTTP_ERROR_FALLBACK;404',
      'DYNAMIC_SERVER_USAGE',
      'BAILOUT_TO_CLIENT_SIDE_RENDERING',
    ]) {
      expect(isNextControlFlow(Object.assign(new Error('x'), { digest })), digest).toBe(true)
    }
  })

  it('treats everything else as a fault', () => {
    expect(isNextControlFlow(new Error('boom'))).toBe(false)
    expect(isNextControlFlow(Object.assign(new Error('x'), { digest: '2847261' }))).toBe(false)
    expect(isNextControlFlow(Object.assign(new Error('x'), { digest: 42 }))).toBe(false)
    expect(isNextControlFlow({ digest: 'my NEXT_REDIRECT' })).toBe(false)
    expect(isNextControlFlow(null)).toBe(false)
    expect(isNextControlFlow('NEXT_REDIRECT')).toBe(false)
  })
})
