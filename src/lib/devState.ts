/**
 * Development-only state preview via `?state=`. Lets reviewers see every
 * presentation state without a backend. Must be removed or gated before any public deployment.
 */
export const DEV_STATES = ['loading', 'empty', 'error', 'offline', 'generating', 'generation-error'] as const
export type DevState = (typeof DEV_STATES)[number]

export function parseDevState(value: string | string[] | undefined): DevState | null {
  const raw = Array.isArray(value) ? value[0] : value
  return DEV_STATES.find((state) => state === raw) ?? null
}
