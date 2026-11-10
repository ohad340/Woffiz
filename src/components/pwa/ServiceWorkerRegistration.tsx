'use client'

import { useEffect } from 'react'

/** Registers the offline-recovery service worker (public/sw.js) in production builds only. Renders nothing. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Without a service worker the app still works online; only the offline fallback is missing.
    })
  }, [])
  return null
}
