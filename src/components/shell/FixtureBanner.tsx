import { FlaskConical } from 'lucide-react'
import styles from './AppShell.module.css'

/** Marks every screen that shows fixture data. Remove only when real data replaces it. */
export function FixtureBanner({ text = 'תצוגת פיתוח · נתוני דמו בלבד, שום דבר לא נשמר בשרת' }: { text?: string }) {
  return (
    <p className={styles.fixture} role="note">
      <FlaskConical size={16} aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
