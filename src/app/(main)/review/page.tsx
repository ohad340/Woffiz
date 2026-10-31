import type { Metadata } from 'next'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge, Card, Skeleton } from '@/components/ui/Card'
import { StateMessage } from '@/components/ui/StateMessage'
import { TOPIC_LABELS } from '@/domain/types'
import { DEMO_LEVELS } from '@/fixtures/demoPlan'
import { parseDevState } from '@/lib/devState'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'חזרה' }

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const state = parseDevState((await searchParams).state)
  const completed = state === 'empty' ? [] : DEMO_LEVELS.filter((level) => level.state === 'completed')

  return (
    <div className={styles.narrow}>
      <div className={styles.sectionStack}>
        <h1>חזרה על שלבים</h1>
        <p className={styles.lead}>אפשר לתרגל שוב כל שלב שהושלם. תרגול חוזר לא משנה את ההתקדמות במפה.</p>
      </div>

      {state === 'loading' ? (
        <Skeleton lines={5} label="טוענים את רשימת השלבים…" />
      ) : state === 'error' ? (
        <StateMessage
          kind="error"
          title="לא הצלחנו לטעון את הרשימה"
          action={
            <Button href="/review" variant="secondary">
              ניסיון חוזר
            </Button>
          }
        />
      ) : completed.length === 0 ? (
        <StateMessage
          kind="empty"
          title="עוד אין שלבים שהושלמו"
          action={
            <Button href="/map" variant="secondary">
              למפה
            </Button>
          }
        >
          אחרי שתשלימו שלב במפה, הוא יופיע כאן לתרגול חוזר.
        </StateMessage>
      ) : (
        <ol className={styles.list} aria-label="שלבים שהושלמו">
          {completed.map((level) => (
            <li key={level.id}>
              <Card className={styles.reviewCard} aria-labelledby={`review-${level.id}`}>
                <div className={styles.reviewMeta}>
                  <Badge tone="success" icon={<RotateCcw size={12} aria-hidden="true" />}>
                    תרגול חוזר
                  </Badge>
                  <Badge>{TOPIC_LABELS[level.topic]}</Badge>
                </div>
                <h2 id={`review-${level.id}`} className={styles.reviewTitle}>
                  שלב {level.position}: {level.title}
                </h2>
                <p className={styles.muted}>{level.goal}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
