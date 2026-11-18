import { after } from 'next/server'

type Task = () => Promise<unknown>

let testSink: ((task: () => Promise<void>) => void) | null = null

/**
 * Tests only: outside a Next.js request scope (scripts, unit and integration tests) `after` throws, so deferred tasks are
 * dropped unless a sink is installed. Never read from the environment and never used by the app.
 */
export function setDeferredSinkForTests(sink: ((task: () => Promise<void>) => void) | null) {
  testSink = sink
}

/**
 * Runs the task after the response is sent (Next.js `after`, backed by waitUntil on Vercel), so it can neither delay nor
 * change the response. The task never throws into the request: a failure logs one fixed line. Outside a request scope the
 * task goes to the test sink, or is dropped (the daily housekeeping run is the backstop).
 */
export function runAfterResponse(task: Task): void {
  const wrapped = async () => {
    try {
      await task()
    } catch {
      console.error('[ops] after-response task failed')
    }
  }
  try {
    after(wrapped)
  } catch {
    testSink?.(wrapped)
  }
}
