import { describe, expect, it } from 'vitest'
import { signUpEnabled } from './local-mode'

const LOCAL = { LOCAL_SIGNUP: 'true', APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000' }

describe('signUpEnabled', () => {
  it('is on only when explicitly enabled, local, and pointed at this machine', () => {
    expect(signUpEnabled(LOCAL)).toBe(true)
    expect(signUpEnabled({ ...LOCAL, BETTER_AUTH_URL: 'http://127.0.0.1:3100' })).toBe(true)
  })

  it.each([
    ['flag missing', { ...LOCAL, LOCAL_SIGNUP: undefined }],
    ['flag false', { ...LOCAL, LOCAL_SIGNUP: 'false' }],
    ['flag not exactly true', { ...LOCAL, LOCAL_SIGNUP: '1' }],
    ['APP_ENV missing', { ...LOCAL, APP_ENV: undefined }],
    ['APP_ENV production', { ...LOCAL, APP_ENV: 'production' }],
    ['APP_ENV preview', { ...LOCAL, APP_ENV: 'preview' }],
    ['public URL', { ...LOCAL, BETTER_AUTH_URL: 'https://woffiz.example' }],
    ['look-alike host', { ...LOCAL, BETTER_AUTH_URL: 'https://localhost.evil.example' }],
    ['no URL', { ...LOCAL, BETTER_AUTH_URL: undefined }],
    ['garbage URL', { ...LOCAL, BETTER_AUTH_URL: 'not a url' }],
  ])('is off when %s', (_name, env) => {
    expect(signUpEnabled(env)).toBe(false)
  })
})
