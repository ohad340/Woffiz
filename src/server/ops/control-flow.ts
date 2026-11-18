/**
 * Next.js signals redirects, not-found and dynamic-rendering bailouts by throwing errors with these digests. They are
 * control flow, not faults, so onRequestError ignores them (docs/DECISIONS.md P4-6).
 */
const CONTROL_FLOW_DIGESTS = ['NEXT_REDIRECT', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK', 'DYNAMIC_SERVER_USAGE', 'BAILOUT_TO_CLIENT_SIDE_RENDERING']

export function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && CONTROL_FLOW_DIGESTS.some((prefix) => digest.startsWith(prefix))
}
