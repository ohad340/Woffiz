import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewForm, TechniqueSuspension, VersionActions } from '@/components/admin/AdminActions'
import { BASIS_LABELS, DECISION_LABELS, KIND_LABELS, REASON_LABELS, STATUS_LABELS, VERIFICATION_LABELS } from '@/components/admin/labels'
import styles from '@/components/admin/admin.module.css'
import { Badge, Card } from '@/components/ui/Card'
import { adminVersion } from '@/server/media/admin-queries'
import { CHECKLISTS } from '@/server/media/gates'
import { requireAdminOrNotFound } from '@/server/session'

const STATUS_TONE = { DRAFT: 'neutral', REVIEWED: 'info', PUBLISHED: 'success', WITHDRAWN: 'warning' } as const
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`

type Segment = { kind: string; stepId?: string; startMs: number; endMs: number }
type Voice = { speaker: string; startMs: number; endMs: number; text: string; stepId?: string }
type Transcript = { type: string; speaker?: string; startMs: number; text: string }

export default async function AdminMediaVersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  await requireAdminOrNotFound()
  const { versionId } = await params
  if (!/^[0-9a-f-]{36}$/.test(versionId)) notFound()
  const data = await adminVersion(versionId)
  if (!data) notFound()
  const { version, def, state, reviewIssues, publishIssues, urls } = data
  const variant = def?.variants[version.variant]
  const timeline = version.timelineJson as Segment[]
  const voice = version.voiceJson as Voice[]
  const transcript = version.transcriptJson as Transcript[]
  const shown = version.demonstratedParamsJson as Record<string, number>
  const suspended = Boolean(state?.suspendedAt)

  return (
    <div className={styles.page}>
      <Link href="/admin/media">
        <ArrowRight size={20} aria-hidden="true" /> חזרה לרשימה
      </Link>

      <header className={styles.stack}>
        <h1 className={styles.title}>
          <span className={styles.ltr}>
            {version.techniqueKey}@{version.techniqueVersion}
          </span>{' '}
          · {version.variant === 'STANDARD' ? 'וריאנט רגיל' : 'וריאנט קל'} · גרסה {version.version}
        </h1>
        <div className={styles.badges}>
          <Badge tone={STATUS_TONE[version.status]}>{STATUS_LABELS[version.status]}</Badge>
          {version.withdrawReason && <Badge tone="neutral">{REASON_LABELS[version.withdrawReason]}</Badge>}
          {version.isTestFixture && <Badge tone="accent">פיקסצ׳ר בדיקה סינתטי: אין בו תמונה או קול אמיתיים</Badge>}
          {suspended && <Badge tone="warning">הטכניקה מושעית</Badge>}
          {def?.review.status !== 'approved' && <Badge tone="warning">הגדרת הטכניקה עדיין בטיוטה</Badge>}
        </div>
        {version.withdrawNote && <p className={styles.muted}>הערת הסרה: {version.withdrawNote}</p>}
      </header>

      <Card aria-labelledby="player-title">
        <h2 id="player-title" className={styles.h2}>
          תצוגה מקדימה
        </h2>
        {urls ? (
          <video className={styles.video} controls preload="none" playsInline poster={urls.poster} aria-label="תצוגה מקדימה של הסרטון">
            <source src={urls.video} type="video/mp4" />
            <track kind="captions" srcLang="he" label="עברית" src={`/api/admin/media/versions/${version.id}/captions`} default />
          </video>
        ) : (
          <p className={styles.notice}>אין אחסון מוגדר בסביבה הזו, לכן אין נגן. הכתוביות והתמליל מוצגים למטה.</p>
        )}
        <p className={styles.muted}>
          הבדיקות האוטומטיות מוכיחות מבנה והתאמה בין המניפסט, הכתוביות והתמליל. הן לא מוכיחות שהקול מובן או שהתמונה תואמת. זו הבדיקה שלכם.
        </p>
      </Card>

      <Card aria-labelledby="gates-title">
        <h2 id="gates-title" className={styles.h2}>
          מה חוסם פרסום
        </h2>
        {reviewIssues.length + publishIssues.length === 0 ? (
          <p className={styles.done}>כל התנאים מתקיימים.</p>
        ) : (
          <ul className={`${styles.blocked} ${styles.ltr}`}>
            {[...reviewIssues, ...publishIssues].map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <p className={styles.muted}>
          טביעת אצבע של החבילה: <span className={styles.ltr}>{version.bundleFingerprint}</span>
        </p>
      </Card>

      {variant && (
        <Card aria-labelledby="core-title">
          <h2 id="core-title" className={styles.h2}>
            ליבת ההדגמה לעומת הסרטון
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">הצעדים בקטלוג והקטעים בסרטון</caption>
              <thead>
                <tr>
                  <th scope="col">צעד בקטלוג</th>
                  <th scope="col">הוראה כתובה</th>
                  <th scope="col">קול מדגים</th>
                  <th scope="col">בסרטון</th>
                </tr>
              </thead>
              <tbody>
                {variant.steps.map((step) => {
                  const seg = timeline.find((s) => s.stepId === step.id)
                  return (
                    <tr key={step.id}>
                      <td className={styles.ltr}>{step.id}</td>
                      <td>{step.text}</td>
                      <td>{step.speechCue === 'name' ? 'אמירת שם' : step.speechCue === 'praise' ? 'שבח' : '—'}</td>
                      <td className={styles.ltr}>{seg ? `${clock(seg.startMs)}–${clock(seg.endMs)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 className={styles.h3}>פרמטרים</h3>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">פרמטרים והתאמתם לסרטון</caption>
              <thead>
                <tr>
                  <th scope="col">פרמטר</th>
                  <th scope="col">מודגם</th>
                  <th scope="col">טווח שהסרטון תואם לו</th>
                  <th scope="col">טווח ההוראות</th>
                  <th scope="col">בסיס</th>
                </tr>
              </thead>
              <tbody>
                {variant.params.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className={styles.ltr}>{p.id}</span>
                    </td>
                    <td>
                      {shown[p.id]} {p.compatibleMin === p.min && p.compatibleMax === p.max ? '(לא משפיע על הסרטון)' : ''}
                    </td>
                    <td className={styles.ltr}>
                      {p.compatibleMin}–{p.compatibleMax}
                    </td>
                    <td className={styles.ltr}>
                      {p.min}–{p.max}
                    </td>
                    <td>{BASIS_LABELS[p.basis]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card aria-labelledby="voice-title">
        <h2 id="voice-title" className={styles.h2}>
          קול, כתוביות ותמליל
        </h2>
        <ol className={styles.list}>
          {voice.map((line) => (
            <li key={`${line.startMs}-${line.speaker}`}>
              <span className={styles.ltr}>
                {clock(line.startMs)}–{clock(line.endMs)}
              </span>{' '}
              <strong>{line.speaker === 'demo' ? 'המדגים' : 'קריין'}:</strong> {line.text}
            </li>
          ))}
        </ol>
        <details>
          <summary>תמליל מלא</summary>
          <ol className={styles.list}>
            {transcript.map((entry) => (
              <li key={`${entry.startMs}-${entry.type}-${entry.text}`}>
                <span className={styles.ltr}>{clock(entry.startMs)}</span> {entry.type === 'speech' ? entry.text : <em>{entry.text}</em>}
              </li>
            ))}
          </ol>
        </details>
        <details>
          <summary>כתוביות (WebVTT)</summary>
          <pre className={styles.ltr}>{version.captionsVtt}</pre>
        </details>
      </Card>

      {def && (
        <Card aria-labelledby="sources-title">
          <h2 id="sources-title" className={styles.h2}>
            מקורות (פנימי)
          </h2>
          <ul className={styles.sources}>
            {def.sources.map((source) => (
              <li key={source.url}>
                <strong>{source.publisher}</strong>:{' '}
                <a href={source.url} className={styles.ltr} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <br />
                <span className={styles.muted}>
                  נבדק ב-<span className={styles.ltr}>{source.verifiedOn}</span>. {VERIFICATION_LABELS[source.verification]}
                </span>
                <br />
                <span className={styles.muted}>
                  תומך ב: <span className={styles.ltr}>{source.supports.join(', ')}</span>
                </span>
                <p className={styles.ltr}>{source.summary}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card aria-labelledby="reviews-title">
        <h2 id="reviews-title" className={styles.h2}>
          סקירות
        </h2>
        {version.reviews.length === 0 ? (
          <p className={styles.muted}>עדיין לא נרשמו סקירות.</p>
        ) : (
          <ol className={styles.list}>
            {version.reviews.map((review) => (
              <li key={review.id}>
                <strong>{KIND_LABELS[review.kind]}</strong> · {DECISION_LABELS[review.decision]} ·{' '}
                <span className={styles.ltr}>{review.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</span>
                {review.reviewedFingerprint !== version.bundleFingerprint && ' · חבילה אחרת'}
                {review.notes && <p>{review.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {version.status === 'DRAFT' && (
        <Card aria-labelledby="review-forms-title">
          <h2 id="review-forms-title" className={styles.h2}>
            רישום סקירה
          </h2>
          <p className={styles.muted}>כל סקירה נקשרת לחבילה המדויקת שמוצגת כאן. אישור דורש לסמן את כל הסעיפים.</p>
          <div className={styles.stack}>
            <ReviewForm versionId={version.id} kind="TECHNICAL" fingerprint={version.bundleFingerprint} items={CHECKLISTS.TECHNICAL} />
            <ReviewForm versionId={version.id} kind="CONTENT" fingerprint={version.bundleFingerprint} items={CHECKLISTS.CONTENT} />
          </div>
        </Card>
      )}

      <Card aria-labelledby="actions-title">
        <h2 id="actions-title" className={styles.h2}>
          פעולות
        </h2>
        {version.status === 'WITHDRAWN' ? (
          <p className={styles.muted}>גרסה שהוסרה לא חוזרת. גרסה מתוקנת נקלטת כגרסה חדשה ועוברת סקירה מחדש.</p>
        ) : (
          <VersionActions versionId={version.id} status={version.status} reviewReady={reviewIssues.length === 0} />
        )}
      </Card>

      {state && (
        <Card aria-labelledby="suspension-title">
          <h2 id="suspension-title" className={styles.h2}>
            השעיית הטכניקה
          </h2>
          <p className={styles.muted}>{suspended ? 'הטכניקה מושעית, ולכן אי אפשר לפרסם לה סרטונים.' : 'ההשעיה חלה על שני הווריאנטים של הטכניקה.'}</p>
          <TechniqueSuspension techniqueKey={version.techniqueKey} version={version.techniqueVersion} suspended={suspended} />
        </Card>
      )}
    </div>
  )
}
