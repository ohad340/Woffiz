/**
 * Owner-activated app update (Phase 4, slice 2; docs/DECISIONS.md P4-2).
 *
 * A new public/sw.js that finds an active worker waits. The banner offers it only on an existing installation
 * (a page already controlled by a worker). Only the owner's tap posts `{ type: 'SKIP_WAITING' }`; the page then
 * reloads exactly once. Framework-free and DOM-free so it can be unit-tested with fakes. Nothing is persisted.
 */

export type UpdateStatus = 'idle' | 'available' | 'activating' | 'dismissed'

export type WorkerLike = {
  state: string
  postMessage(message: unknown): void
  addEventListener(type: 'statechange', fn: () => void): void
}

export type RegistrationLike = {
  waiting: WorkerLike | null
  installing: WorkerLike | null
  addEventListener(type: 'updatefound', fn: () => void): void
  update(): Promise<unknown>
}

export type ContainerLike = {
  controller: unknown | null
  addEventListener(type: 'controllerchange', fn: () => void): void
}

export type UpdateController = {
  getStatus(): UpdateStatus
  subscribe(fn: () => void): () => void
  applyUpdate(): void
  dismiss(): void
  maybeCheckForUpdate(): void
}

export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const
/** If the new worker does not take control within this time after the tap, reload anyway (the owner asked). */
export const RELOAD_FALLBACK_MS = 10_000
/** `registration.update()` runs at most once per this interval while the app is visible. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function createUpdateController(deps: {
  registration: RegistrationLike
  container: ContainerLike
  reload: () => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
}): UpdateController {
  const { registration, container, reload } = deps
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))

  let status: UpdateStatus = 'idle'
  let requested = false
  let reloaded = false
  let lastCheck = now()
  const listeners = new Set<() => void>()

  const setStatus = (next: UpdateStatus) => {
    if (next === status) return
    status = next
    for (const fn of listeners) fn()
  }

  const reloadOnce = () => {
    if (reloaded) return
    reloaded = true
    reload()
  }

  /** A waiting worker on an existing installation is offered, unless the owner already said "later". */
  const evaluate = () => {
    if (status === 'dismissed' || status === 'activating') return
    if (registration.waiting && container.controller) setStatus('available')
  }

  const watchInstalling = (worker: WorkerLike | null) => {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') evaluate()
    })
  }

  registration.addEventListener('updatefound', () => watchInstalling(registration.installing))
  watchInstalling(registration.installing)

  container.addEventListener('controllerchange', () => {
    if (requested) {
      reloadOnce()
      return
    }
    // First-install claim or another tab updated: never reload unasked.
    if (!registration.waiting && status === 'available') setStatus('idle')
  })

  evaluate()

  return {
    getStatus: () => status,
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    applyUpdate() {
      if (status !== 'available' || !registration.waiting) return
      requested = true
      setStatus('activating')
      registration.waiting.postMessage(SKIP_WAITING_MESSAGE)
      setTimer(reloadOnce, RELOAD_FALLBACK_MS)
    },
    dismiss() {
      if (status === 'activating') return
      setStatus('dismissed')
    },
    maybeCheckForUpdate() {
      const current = now()
      if (current - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
      lastCheck = current
      registration.update().catch(() => {
        // Offline or a transient failure: the next visible hour tries again.
      })
    },
  }
}
