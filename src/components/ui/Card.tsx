import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import styles from './Card.module.css'

export function Card({ className, ...rest }: ComponentPropsWithoutRef<'section'>) {
  return <section className={[styles.card, className].filter(Boolean).join(' ')} {...rest} />
}

type BadgeTone = 'neutral' | 'success' | 'warning' | 'info' | 'accent'

export function Badge({ tone = 'neutral', icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={styles.skeletonLine} aria-hidden="true" />
      ))}
    </div>
  )
}
