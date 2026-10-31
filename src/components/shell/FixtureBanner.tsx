import { FlaskConical } from 'lucide-react'
import styles from './AppShell.module.css'

/** Marks screens whose training content is development content. Remove when reviewed content replaces it. */
export function FixtureBanner({ text = 'תצוגת פיתוח · תוכן הדגמה לא מאומת, ההתקדמות נשמרת' }: { text?: string }) {
  return (
    <p className={styles.fixture} role="note">
      <FlaskConical size={16} aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
