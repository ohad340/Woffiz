import { AlertCircle, Inbox, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './StateMessage.module.css'

const ICONS = {
  empty: Inbox,
  error: AlertCircle,
  offline: WifiOff,
} as const

type StateMessageProps = {
  kind: keyof typeof ICONS
  title: string
  children?: ReactNode
  action?: ReactNode
  headingLevel?: 'h1' | 'h2'
}

/** Empty / error / offline message with a concrete next action. */
export function StateMessage({ kind, title, children, action, headingLevel = 'h2' }: StateMessageProps) {
  const Icon = ICONS[kind]
  const Heading = headingLevel
  return (
    <div className={styles.state} data-kind={kind} role={kind === 'error' ? 'alert' : undefined}>
      <Icon className={styles.icon} size={32} aria-hidden="true" />
      <Heading className={styles.title}>{title}</Heading>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
