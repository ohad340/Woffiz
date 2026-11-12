import { describe, expect, it, vi } from 'vitest'
import { RELOAD_FALLBACK_MS, UPDATE_CHECK_INTERVAL_MS, createUpdateController, type WorkerLike } from './update'

class FakeWorker implements WorkerLike {
  messages: unknown[] = []
  private listeners: Array<() => void> = []
  constructor(public state: string) {}
  postMessage(message: unknown) {
    this.messages.push(message)
  }
  addEventListener(_type: 'statechange', fn: () => void) {
    this.listeners.push(fn)
  }
  setState(state: string) {
    this.state = state
    for (const fn of this.listeners) fn()
  }
}

function setup({ controller = true, waiting = null as FakeWorker | null, updateResult = Promise.resolve() as Promise<unknown> } = {}) {
  let clock = 0
  const timers: Array<{ fn: () => void; at: number }> = []
  const updatefound: Array<() => void> = []
  const controllerchange: Array<() => void> = []
  const registration = {
    waiting,
    installing: null as FakeWorker | null,
    addEventListener: (_type: 'updatefound', fn: () => void) => updatefound.push(fn),
    update: vi.fn(() => updateResult),
  }
  const container = {
    controller: controller ? {} : null,
    addEventListener: (_type: 'controllerchange', fn: () => void) => controllerchange.push(fn),
  }
  const reload = vi.fn()
  const controllerApi = createUpdateController({
    registration,
    container,
    reload,
    now: () => clock,
    setTimer: (fn, ms) => timers.push({ fn, at: clock + ms }),
  })
  return {
    controller: controllerApi,
    registration,
    container,
    reload,
    /** A new worker is found and finishes installing (it then waits). */
    installNewWorker() {
      const worker = new FakeWorker('installing')
      registration.installing = worker
      for (const fn of updatefound) fn()
      registration.installing = null
      registration.waiting = worker
      worker.setState('installed')
      return worker
    },
    /** The waiting worker becomes active and takes control. */
    activate() {
      registration.waiting = null
      container.controller = {}
      for (const fn of controllerchange) fn()
    },
    fireControllerChange() {
      for (const fn of controllerchange) fn()
    },
    advance(ms: number) {
      clock += ms
      for (const timer of timers.splice(0)) {
        if (timer.at <= clock) timer.fn()
        else timers.push(timer)
      }
    },
  }
}

describe('createUpdateController', () => {
  it('never offers an update on a first install (no controlling worker)', () => {
    const t = setup({ controller: false })
    expect(t.controller.getStatus()).toBe('idle')
    t.installNewWorker()
    expect(t.controller.getStatus()).toBe('idle')
    t.fireControllerChange() // first-install clients.claim()
    expect(t.controller.getStatus()).toBe('idle')
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('offers an update when a worker is already waiting on an existing installation', () => {
    const t = setup({ waiting: new FakeWorker('installed') })
    expect(t.controller.getStatus()).toBe('available')
  })

  it('offers an update when a new worker finishes installing on an existing installation', () => {
    const t = setup()
    const listener = vi.fn()
    t.controller.subscribe(listener)
    expect(t.controller.getStatus()).toBe('idle')
    t.installNewWorker()
    expect(t.controller.getStatus()).toBe('available')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('a tap sends exactly one SKIP_WAITING message and reloads exactly once after controllerchange', () => {
    const t = setup()
    const worker = t.installNewWorker()
    t.controller.applyUpdate()
    expect(t.controller.getStatus()).toBe('activating')
    expect(worker.messages).toEqual([{ type: 'SKIP_WAITING' }])
    expect(t.reload).not.toHaveBeenCalled()
    t.activate()
    expect(t.reload).toHaveBeenCalledTimes(1)
    t.fireControllerChange()
    t.advance(RELOAD_FALLBACK_MS)
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('a double tap sends one message', () => {
    const t = setup()
    const worker = t.installNewWorker()
    t.controller.applyUpdate()
    t.controller.applyUpdate()
    expect(worker.messages).toHaveLength(1)
  })

  it('does nothing on a tap when no update is available', () => {
    const t = setup()
    t.controller.applyUpdate()
    expect(t.controller.getStatus()).toBe('idle')
    t.advance(RELOAD_FALLBACK_MS)
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('an unrequested controllerchange (another tab updated) never reloads and clears the offer', () => {
    const t = setup()
    const worker = t.installNewWorker()
    t.activate()
    expect(t.reload).not.toHaveBeenCalled()
    expect(worker.messages).toEqual([])
    expect(t.controller.getStatus()).toBe('idle')
  })

  it('reloads once after 10 s when no controllerchange arrives, and a late controllerchange adds no second reload', () => {
    const t = setup()
    t.installNewWorker()
    t.controller.applyUpdate()
    t.advance(RELOAD_FALLBACK_MS - 1)
    expect(t.reload).not.toHaveBeenCalled()
    t.advance(1)
    expect(t.reload).toHaveBeenCalledTimes(1)
    t.activate()
    expect(t.reload).toHaveBeenCalledTimes(1)
  })

  it('"later" sends no message and stays dismissed for this page load, even for another waiting worker', () => {
    const t = setup()
    const worker = t.installNewWorker()
    t.controller.dismiss()
    expect(t.controller.getStatus()).toBe('dismissed')
    expect(worker.messages).toEqual([])
    t.installNewWorker()
    expect(t.controller.getStatus()).toBe('dismissed')
    t.controller.applyUpdate()
    expect(t.reload).not.toHaveBeenCalled()
  })

  it('unsubscribe stops notifications', () => {
    const t = setup()
    const listener = vi.fn()
    const unsubscribe = t.controller.subscribe(listener)
    unsubscribe()
    t.installNewWorker()
    expect(listener).not.toHaveBeenCalled()
  })

  describe('maybeCheckForUpdate', () => {
    it('skips the first call and then checks at most once per hour', () => {
      const t = setup()
      t.controller.maybeCheckForUpdate()
      expect(t.registration.update).not.toHaveBeenCalled()
      t.advance(UPDATE_CHECK_INTERVAL_MS - 1)
      t.controller.maybeCheckForUpdate()
      expect(t.registration.update).not.toHaveBeenCalled()
      t.advance(1)
      t.controller.maybeCheckForUpdate()
      expect(t.registration.update).toHaveBeenCalledTimes(1)
      t.controller.maybeCheckForUpdate()
      t.advance(UPDATE_CHECK_INTERVAL_MS / 2)
      t.controller.maybeCheckForUpdate()
      expect(t.registration.update).toHaveBeenCalledTimes(1)
      t.advance(UPDATE_CHECK_INTERVAL_MS / 2)
      t.controller.maybeCheckForUpdate()
      expect(t.registration.update).toHaveBeenCalledTimes(2)
    })

    it('swallows a rejected update check', async () => {
      const t = setup({ updateResult: Promise.reject(new Error('offline')) })
      t.advance(UPDATE_CHECK_INTERVAL_MS)
      expect(() => t.controller.maybeCheckForUpdate()).not.toThrow()
      expect(t.registration.update).toHaveBeenCalledTimes(1)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  })
})
