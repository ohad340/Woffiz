import { FlaskConical } from 'lucide-react'
import styles from './AppShell.module.css'

/** Marks screens whose training content is automatic (local generator or AI) and not reviewed by a qualified trainer. Remove when reviewed content is required and available. */
export function FixtureBanner({ text = 'תצוגת פיתוח · התוכן נוצר אוטומטית ולא נבדק על ידי מאלף מוסמך, ההתקדמות נשמרת' }: { text?: string }) {
  return (
    <p className={styles.fixture} role="note">
      <FlaskConical size={16} aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
