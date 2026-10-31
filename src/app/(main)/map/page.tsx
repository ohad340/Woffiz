import type { Metadata } from 'next'
import { MapView } from '@/components/map/MapView'
import { OfflineNotice } from '@/components/shell/OfflineNotice'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Card'
import { StateMessage } from '@/components/ui/StateMessage'
import { assertValidPath } from '@/domain/path'
import { DEMO_LEVELS, DEMO_PUPPY } from '@/fixtures/demoPlan'
import { parseDevState } from '@/lib/devState'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'המפה' }

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const state = parseDevState((await searchParams).state)

  if (state === 'loading') {
    return (
      <div className={styles.narrow}>
        <h1 className="visually-hidden">המפה</h1>
        <Skeleton lines={6} label="טוענים את המפה…" />
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div className={styles.narrow}>
        <StateMessage
          kind="empty"
          headingLevel="h1"
          title="עוד אין תוכנית אימון"
          action={
            <Button href="/onboarding" size="cta">
              מתחילים להכיר את הגור
            </Button>
          }
        >
          נשאל כמה שאלות קצרות על הגור, ואז נכין לו מסלול אימון.
        </StateMessage>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className={styles.narrow}>
        <StateMessage
          kind="error"
          headingLevel="h1"
          title="לא הצלחנו לטעון את המפה"
          action={
            <Button href="/map" variant="secondary">
              ניסיון חוזר
            </Button>
          }
        >
          ההתקדמות שלכם לא נמחקה. נסו לטעון שוב בעוד רגע.
        </StateMessage>
      </div>
    )
  }

  assertValidPath(DEMO_LEVELS)

  return (
    <>
      <OfflineNotice forced={state === 'offline'} />
      <MapView puppy={DEMO_PUPPY} levels={DEMO_LEVELS} />
    </>
  )
}
