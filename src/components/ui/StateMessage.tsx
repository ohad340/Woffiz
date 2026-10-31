import { AlertCircle, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Mascot } from '@/components/art/Mascot'
import styles from './StateMessage.module.css'

type StateMessageProps = {
  kind: 'empty' | 'error' | 'offline'
  title: string
  children?: ReactNode
  action?: ReactNode
  headingLevel?: 'h1' | 'h2'
}

/** Empty / error / offline message with a concrete next action. */
export function StateMessage({ kind, title, children, action, headingLevel = 'h2' }: StateMessageProps) {
  const Heading = headingLevel
  return (
    <div className={styles.state} data-kind={kind} role={kind === 'error' ? 'alert' : undefined}>
      {kind === 'empty' ? (
        <Mascot className={styles.mascot} />
      ) : kind === 'error' ? (
        <AlertCircle className={styles.icon} size={36} aria-hidden="true" />
      ) : (
        <WifiOff className={styles.icon} size={36} aria-hidden="true" />
      )}
      <Heading className={styles.title}>{title}</Heading>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
