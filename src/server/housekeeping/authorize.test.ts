import { describe, expect, it } from 'vitest'
import { authorizeCron } from './authorize'

const SECRET = 'local-test-secret-0123456789'

describe('cron authorization', () => {
  it('fails closed when CRON_SECRET is unset or empty', () => {
    expect(authorizeCron(`Bearer ${SECRET}`, undefined)).toBe(false)
    expect(authorizeCron('Bearer ', '')).toBe(false)
    expect(authorizeCron('Bearer ', '   ')).toBe(false)
    expect(authorizeCron(null, undefined)).toBe(false)
  })

  it('refuses a missing header, a wrong value, a different length and a missing Bearer prefix', () => {
    expect(authorizeCron(null, SECRET)).toBe(false)
    expect(authorizeCron('', SECRET)).toBe(false)
    expect(authorizeCron('Bearer local-test-secret-0123456780', SECRET)).toBe(false)
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe(false)
    expect(authorizeCron('Bearer x', SECRET)).toBe(false)
    expect(authorizeCron(SECRET, SECRET)).toBe(false)
    expect(authorizeCron(`bearer ${SECRET}`, SECRET)).toBe(false)
  })

  it('accepts exactly "Bearer <secret>" (the secret is trimmed, the header is not)', () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe(true)
    expect(authorizeCron(`Bearer ${SECRET}`, ` ${SECRET}\n`)).toBe(true)
    expect(authorizeCron(` Bearer ${SECRET}`, SECRET)).toBe(false)
  })
})
