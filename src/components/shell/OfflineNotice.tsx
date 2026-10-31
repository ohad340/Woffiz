'use client'

import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import styles from './AppShell.module.css'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** Honest connection notice; `forced` previews the state in development. */
export function OfflineNotice({ forced = false }: { forced?: boolean }) {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
  const offline = forced || !online
  return (
    <div role="status" aria-live="polite">
      {offline && (
        <p className={styles.offline}>
          <WifiOff size={20} aria-hidden="true" />
          <span>אין חיבור לאינטרנט. התוכן המוצג לקריאה בלבד, ושום דיווח לא יישמר עד שהחיבור יחזור.</span>
        </p>
      )}
    </div>
  )
}
