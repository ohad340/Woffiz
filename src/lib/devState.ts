/**
 * State preview via `?state=`. Lets reviewers see every presentation state without a backend.
 * Gated (P4-2): callers must pass `devPreviewsEnabled()` from `@/server/local-mode`, so previews exist only in
 * development, tests and on this developer's machine. In production `?state=` is silently ignored.
 */
export const DEV_STATES = ['loading', 'empty', 'error', 'offline', 'generating', 'generation-error'] as const
export type DevState = (typeof DEV_STATES)[number]

/** `enabled` is required on purpose: an ungated call does not compile. */
export function parseDevState(value: string | string[] | undefined, enabled: boolean): DevState | null {
  if (!enabled) return null
  const raw = Array.isArray(value) ? value[0] : value
  return DEV_STATES.find((state) => state === raw) ?? null
}
