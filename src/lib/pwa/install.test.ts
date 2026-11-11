import { describe, expect, it } from 'vitest'
import { detectInstallCase, isAppleMobile, type InstallInput } from './install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  // iPadOS requests the desktop site by default and reports itself as a Mac.
  ipadDesktopClass:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0',
}

const input = (overrides: Partial<InstallInput>): InstallInput => ({
  userAgent: UA.desktopChrome,
  maxTouchPoints: 0,
  standalone: false,
  promptAvailable: false,
  installedNow: false,
  ...overrides,
})

describe('detectInstallCase', () => {
  it.each([
    ['iPhone Safari', input({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 }), 'ios'],
    ['iPhone Chrome (CriOS)', input({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 }), 'ios'],
    ['iPadOS desktop-class UA with touch', input({ userAgent: UA.ipadDesktopClass, maxTouchPoints: 5 }), 'ios'],
    ['real macOS Safari', input({ userAgent: UA.macSafari, maxTouchPoints: 0 }), 'other'],
    ['Android Chrome with a prompt', input({ userAgent: UA.androidChrome, maxTouchPoints: 5, promptAvailable: true }), 'prompt'],
    ['Android Chrome without a prompt', input({ userAgent: UA.androidChrome, maxTouchPoints: 5 }), 'other'],
    ['desktop Chrome with a prompt', input({ userAgent: UA.desktopChrome, promptAvailable: true }), 'prompt'],
    ['desktop Edge with a prompt', input({ userAgent: UA.desktopEdge, promptAvailable: true }), 'prompt'],
    ['desktop Firefox', input({ userAgent: UA.desktopFirefox }), 'other'],
    ['Android Firefox', input({ userAgent: UA.androidFirefox, maxTouchPoints: 5 }), 'other'],
    ['installed now (appinstalled)', input({ userAgent: UA.desktopChrome, installedNow: true }), 'installed'],
    ['standalone wins over a prompt', input({ userAgent: UA.androidChrome, standalone: true, promptAvailable: true }), 'installed'],
  ] as const)('%s → %s', (_name, value, expected) => {
    expect(detectInstallCase(value)).toBe(expected)
  })

  it.each(Object.entries(UA))('standalone on %s → installed', (_name, userAgent) => {
    expect(detectInstallCase(input({ userAgent, maxTouchPoints: 5, standalone: true }))).toBe('installed')
  })
})

describe('isAppleMobile', () => {
  it('needs a touch screen for a Macintosh UA', () => {
    expect(isAppleMobile(UA.macSafari, 0)).toBe(false)
    expect(isAppleMobile(UA.macSafari, 1)).toBe(false)
    expect(isAppleMobile(UA.ipadDesktopClass, 5)).toBe(true)
  })
})
