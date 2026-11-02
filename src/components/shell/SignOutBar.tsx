import { SignOutButton } from '@/components/auth/SignOutButton'
import styles from './SignOutBar.module.css'

/** A slim row with a compact sign-out button, for signed-in screens outside the main app shell. */
export function SignOutBar() {
  return (
    <div className={styles.bar}>
      <SignOutButton compact />
    </div>
  )
}
