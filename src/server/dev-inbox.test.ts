import { describe, expect, it } from 'vitest'
import { devInboxEnabled } from './dev-inbox'

const LOCAL = { DEV_EMAIL_INBOX: 'true', APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000' }

describe('devInboxEnabled', () => {
  it('is on only when explicitly enabled, local, and pointed at this machine', () => {
    expect(devInboxEnabled(LOCAL)).toBe(true)
    expect(devInboxEnabled({ ...LOCAL, BETTER_AUTH_URL: 'http://127.0.0.1:3100' })).toBe(true)
  })

  it.each([
    ['flag missing', { ...LOCAL, DEV_EMAIL_INBOX: undefined }],
    ['flag false', { ...LOCAL, DEV_EMAIL_INBOX: 'false' }],
    ['flag not exactly true', { ...LOCAL, DEV_EMAIL_INBOX: '1' }],
    ['APP_ENV missing', { ...LOCAL, APP_ENV: undefined }],
    ['APP_ENV production', { ...LOCAL, APP_ENV: 'production' }],
    ['APP_ENV preview', { ...LOCAL, APP_ENV: 'preview' }],
    ['public URL', { ...LOCAL, BETTER_AUTH_URL: 'https://woffiz.example' }],
    ['look-alike host', { ...LOCAL, BETTER_AUTH_URL: 'https://localhost.evil.example' }],
    ['no URL', { ...LOCAL, BETTER_AUTH_URL: undefined }],
    ['garbage URL', { ...LOCAL, BETTER_AUTH_URL: 'not a url' }],
  ])('is off when %s', (_name, env) => {
    expect(devInboxEnabled(env)).toBe(false)
  })

  it('stays off with NODE_ENV production even if the three switches are set elsewhere', () => {
    // Deployed environments set none of the three; production hosting never has APP_ENV=local.
    expect(devInboxEnabled({ NODE_ENV: 'production', DEV_EMAIL_INBOX: 'true', BETTER_AUTH_URL: 'https://x.example' })).toBe(false)
  })
})
