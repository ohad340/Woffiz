'use client'

import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import styles from './Sheet.module.css'

type SheetProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/**
 * Bottom sheet (mobile) / centered dialog (wide) on the native <dialog> element:
 * modal focus containment, Escape dismissal and focus restoration come from the platform.
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself) dismisses.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
            <X size={24} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  )
}
