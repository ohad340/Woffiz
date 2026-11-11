import { describe, expect, it } from 'vitest'
import { devPreviewsEnabled, signUpEnabled } from './local-mode'

const LOCAL = { LOCAL_SIGNUP: 'true', APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000' }

describe('devPreviewsEnabled', () => {
  const PROD_LOCAL = { NODE_ENV: 'production', APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3100' }

  it.each([
    ['next dev', { NODE_ENV: 'development' }],
    ['unit tests', { NODE_ENV: 'test' }],
    ['production build on this machine (Playwright)', PROD_LOCAL],
    ['production build on 127.0.0.1', { ...PROD_LOCAL, BETTER_AUTH_URL: 'http://127.0.0.1:3100' }],
    ['local machine without LOCAL_SIGNUP (the sign-up flag is irrelevant)', { ...PROD_LOCAL, LOCAL_SIGNUP: undefined }],
  ])('is on for %s', (_name, env) => {
    expect(devPreviewsEnabled(env)).toBe(true)
  })

  it.each([
    ['the Vercel shape (production, APP_ENV unset, HTTPS URL)', { NODE_ENV: 'production', BETTER_AUTH_URL: 'https://woffiz.example' }],
    ['APP_ENV=local with a public HTTPS URL', { ...PROD_LOCAL, BETTER_AUTH_URL: 'https://woffiz.example' }],
    ['APP_ENV=preview on localhost', { ...PROD_LOCAL, APP_ENV: 'preview' }],
    ['APP_ENV unset on localhost', { ...PROD_LOCAL, APP_ENV: undefined }],
    ['look-alike host', { ...PROD_LOCAL, BETTER_AUTH_URL: 'https://localhost.evil.example' }],
    ['garbage URL', { ...PROD_LOCAL, BETTER_AUTH_URL: 'not a url' }],
    ['an empty environment', {}],
  ])('is off for %s', (_name, env) => {
    expect(devPreviewsEnabled(env)).toBe(false)
  })
})

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
