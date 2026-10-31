import { Button } from '@/components/ui/Button'
import { StateMessage } from '@/components/ui/StateMessage'
import styles from './welcome.module.css'

export default function NotFound() {
  return (
    <main id="main" className={styles.main} tabIndex={-1}>
      <StateMessage
        kind="empty"
        headingLevel="h1"
        title="הדף לא נמצא"
        action={
          <Button href="/home" size="cta">
            חזרה לבית
          </Button>
        }
      />
    </main>
  )
}
