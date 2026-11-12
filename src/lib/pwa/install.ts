/**
 * Install guidance case (Phase 4, slice 2; docs/DECISIONS.md P4-2). Pure: callers pass what the browser reports.
 * The user agent only chooses which instructions to show; it never gates access to anything.
 */

export type InstallCase = 'installed' | 'prompt' | 'ios' | 'other'

export type InstallInput = {
  userAgent: string
  maxTouchPoints: number
  /** `display-mode: standalone` matches, or iOS `navigator.standalone === true`. */
  standalone: boolean
  /** A deferred `beforeinstallprompt` event is available (Chromium only). */
  promptAvailable: boolean
  /** `appinstalled` fired during this page load. */
  installedNow: boolean
}

/** iPhone, iPad or iPod, including iPadOS with a desktop-class ("Macintosh") user agent and a touch screen. */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

export function detectInstallCase(input: InstallInput): InstallCase {
  if (input.standalone || input.installedNow) return 'installed'
  if (input.promptAvailable) return 'prompt'
  if (isAppleMobile(input.userAgent, input.maxTouchPoints)) return 'ios'
  return 'other'
}
