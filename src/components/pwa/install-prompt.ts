'use client'

/**
 * Keeps the browser's deferred install prompt (Chromium `beforeinstallprompt`) from the first page of the visit,
 * because it usually fires at page load, before /puppy is opened. In memory only: no storage, no network.
 */

/** Not in the DOM lib (WICG incubation, Chromium only). */
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<unknown>
  readonly userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallPromptSnapshot = { promptAvailable: boolean; installedNow: boolean }

const SERVER_SNAPSHOT: InstallPromptSnapshot = { promptAvailable: false, installedNow: false }

let deferred: BeforeInstallPromptEvent | null = null
let snapshot: InstallPromptSnapshot = SERVER_SNAPSHOT
let captured = false
const listeners = new Set<() => void>()

function publish(next: InstallPromptSnapshot) {
  if (next.promptAvailable === snapshot.promptAvailable && next.installedNow === snapshot.installedNow) return
  snapshot = next
  for (const fn of listeners) fn()
}

/** Idempotent: attaches the window listeners once per page load. */
export function captureInstallPrompt() {
  if (captured || typeof window === 'undefined') return
  captured = true
  window.addEventListener('beforeinstallprompt', (event) => {
    // Defers the browser's own install UI; installation then runs through the /puppy button or the browser menu.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    publish({ ...snapshot, promptAvailable: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    publish({ promptAvailable: false, installedNow: true })
  })
}

export function subscribeInstallPrompt(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const getInstallPromptSnapshot = () => snapshot
export const getInstallPromptServerSnapshot = () => SERVER_SNAPSHOT

/** Shows the browser's install dialog once; the saved event is single-use, so it is dropped either way. */
export async function promptInstall() {
  const event = deferred
  if (!event) return
  deferred = null
  publish({ ...snapshot, promptAvailable: false })
  try {
    await event.prompt()
  } catch {
    // The browser refused (for example, already shown). The browser-menu instructions remain.
  }
}
