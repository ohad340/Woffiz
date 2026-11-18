import type { Instrumentation } from 'next'
import { isNextControlFlow } from '@/server/ops/control-flow'

/**
 * Uncaught server errors (render, route, action) become one SERVER_ERROR ops event (docs/DECISIONS.md P4-6, O4).
 * Next.js control-flow throws (redirect, not-found, dynamic bailouts) are not faults. Nothing from the error, the request
 * or the context is stored or logged. The ops module (database access) is loaded only in the Node.js runtime.
 */
export const onRequestError: Instrumentation.onRequestError = async (error) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || isNextControlFlow(error)) return
  const { recordOpsEvent, evaluateAlerts } = await import('@/server/ops')
  await recordOpsEvent('SERVER_ERROR')
  await evaluateAlerts('server-error')
}
