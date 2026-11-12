'use client'

import { useEffect, useState } from 'react'
import { createUpdateController, UPDATE_CHECK_INTERVAL_MS, type UpdateController } from '@/lib/pwa/update'
import { captureInstallPrompt } from './install-prompt'
import { UpdatePrompt } from './UpdatePrompt'

/**
 * Registers the service worker (public/sw.js) in production builds only and shows the owner-activated update
 * banner (P4-2). Renders nothing until the worker is registered, and nothing in development.
 */
export function ServiceWorkerRegistration() {
  const [controller, setController] = useState<UpdateController | null>(null)

  // The install prompt usually fires at page load, before /puppy is opened, so it is kept from the first page.
  useEffect(() => {
    captureInstallPrompt()
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    let cancelled = false
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return
        setController(createUpdateController({ registration, container: navigator.serviceWorker, reload: () => window.location.reload() }))
      })
      .catch(() => {
        // Without a service worker the app still works online; only the offline fallback is missing.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // While the app is visible, look for a new worker at most once per hour (long-open installed apps).
  useEffect(() => {
    if (!controller) return
    const check = () => {
      if (document.visibilityState === 'visible') controller.maybeCheckForUpdate()
    }
    document.addEventListener('visibilitychange', check)
    const interval = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(interval)
    }
  }, [controller])

  return controller ? <UpdatePrompt controller={controller} /> : null
}
