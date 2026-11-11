import { Film } from 'lucide-react'
import Link from 'next/link'
import { TechniqueSuspension } from '@/components/admin/AdminActions'
import { STATUS_LABELS, REASON_LABELS } from '@/components/admin/labels'
import styles from '@/components/admin/admin.module.css'
import { Badge, Card } from '@/components/ui/Card'
import { TOPIC_LABELS, type Topic } from '@/domain/types'
import { adminOverview } from '@/server/media/admin-queries'
import { requireAdminOrNotFound } from '@/server/session'

const STATUS_TONE = { DRAFT: 'neutral', REVIEWED: 'info', PUBLISHED: 'success', WITHDRAWN: 'warning' } as const

export default async function AdminMediaPage() {
  await requireAdminOrNotFound()
  const techniques = await adminOverview()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Film size={28} aria-hidden="true" />
        <h1 className={styles.title}>ניהול סרטוני הדגמה</h1>
      </header>
      <p className={styles.muted}>
        כל גרסת סרטון נסקרת בידיכם מול ההוראות והמקורות לפני הפרסום. סקירות קשורות לתוכן המדויק של החבילה, ושינוי תוכן הוא גרסה חדשה. מסך זה פנימי ולא מוצג לבעלי הגורים.
      </p>

      {techniques.map(({ def, locked, state, versions }) => {
        const id = `${def.key}@${def.version}`
        const suspended = Boolean(state?.suspendedAt)
        return (
          <Card key={id} aria-labelledby={`t-${def.key}`}>
            <div className={styles.stack}>
              <div className={styles.header}>
                <h2 id={`t-${def.key}`} className={styles.h2}>
                  <span className={styles.ltr}>{id}</span> · {TOPIC_LABELS[def.topic.toLowerCase() as Topic]}
                </h2>
                <div className={styles.badges}>
                  <Badge tone={def.review.status === 'approved' ? 'success' : 'warning'}>{def.review.status === 'approved' ? 'הגדרה מאושרת' : 'הגדרה בטיוטה: ברירות המחדל לא אושרו'}</Badge>
                  <Badge tone={locked ? 'success' : 'neutral'}>{locked ? 'נעולה בקובץ הנעילה' : 'לא נעולה'}</Badge>
                  {suspended && <Badge tone="warning">מושעית</Badge>}
                  {!state && <Badge tone="neutral">עדיין לא נקלטה חבילה</Badge>}
                </div>
              </div>
              <p className={styles.muted}>
                <span className={styles.ltr}>{def.description}</span>
              </p>

              {versions.length === 0 ? (
                <p className={styles.muted}>אין גרסאות סרטון. קליטת חבילה נעשית בפקודה scripts/media-ingest.ts ויוצרת טיוטה בלבד.</p>
              ) : (
                <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="טבלת הגרסאות (אפשר לגלול הצידה)">
                  <table className={styles.table}>
                    <caption className="visually-hidden">גרסאות הסרטון של {id}</caption>
                    <thead>
                      <tr>
                        <th scope="col">וריאנט</th>
                        <th scope="col">גרסה</th>
                        <th scope="col">מצב</th>
                        <th scope="col">משך</th>
                        <th scope="col">פתיחה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((v) => (
                        <tr key={v.id}>
                          <td>{v.variant === 'STANDARD' ? 'רגיל' : 'קל'}</td>
                          <td>{v.version}</td>
                          <td>
                            <div className={styles.badges}>
                              <Badge tone={STATUS_TONE[v.status]}>{STATUS_LABELS[v.status]}</Badge>
                              {v.withdrawReason && <Badge tone="neutral">{REASON_LABELS[v.withdrawReason]}</Badge>}
                              {v.isTestFixture && <Badge tone="accent">פיקסצ׳ר בדיקה</Badge>}
                            </div>
                          </td>
                          <td>{Math.round(v.durationMs / 1000)} שנ׳</td>
                          <td>
                            <Link href={`/admin/media/${v.id}`}>לסקירה</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {state && (
                <details>
                  <summary>{suspended ? 'הטכניקה מושעית: הסרת השעיה' : 'השעיית הטכניקה'}</summary>
                  <TechniqueSuspension techniqueKey={def.key} version={def.version} suspended={suspended} />
                </details>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
