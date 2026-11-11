'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/Button'
import type { UpdateController, UpdateStatus } from '@/lib/pwa/update'
import styles from './UpdatePrompt.module.css'

const SPACE_PROPERTY = '--update-banner-block-size'
const getServerStatus = (): UpdateStatus => 'idle'

/**
 * Non-modal "new version" banner (P4-2). It never moves focus; the polite live region announces it.
 * Only "לעדכן עכשיו" activates the waiting worker (one reload); "אחר כך" hides it until the next page load.
 */
export function UpdatePrompt({ controller }: { controller: UpdateController }) {
  const status = useSyncExternalStore(controller.subscribe, controller.getStatus, getServerStatus)
  const visible = status === 'available' || status === 'activating'
  const surface = useRef<HTMLDivElement>(null)

  // Lets the page's last content and focused controls scroll clear of the fixed banner (see the module CSS).
  useEffect(() => {
    const element = surface.current
    if (!visible || !element) return
    const body = document.body
    const observer = new ResizeObserver(() => body.style.setProperty(SPACE_PROPERTY, `${element.offsetHeight}px`))
    observer.observe(element)
    return () => {
      observer.disconnect()
      body.style.removeProperty(SPACE_PROPERTY)
    }
  }, [visible])

  return (
    <div role="status" aria-live="polite">
      {visible && (
        <div ref={surface} className={styles.banner} data-update-banner="">
          <p className={styles.text}>גרסה חדשה של Woffiz מוכנה. העדכון יטען מחדש את העמוד.</p>
          <div className={styles.actions}>
            <Button variant="primary" loading={status === 'activating'} loadingLabel="מעדכנים…" onClick={() => controller.applyUpdate()}>
              לעדכן עכשיו
            </Button>
            <Button variant="ghost" disabled={status === 'activating'} onClick={() => controller.dismiss()}>
              אחר כך
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
