import { Activity } from 'lucide-react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { z } from 'zod'
import {
  FAILURE_CLASS_LABELS,
  GENERATION_STATUS_LABELS,
  NOTIFY_LABELS,
  RULE_LABELS,
  RUN_OUTCOME_LABELS,
  STEP_LABELS,
  STEP_STATUS_LABELS,
  TRIGGER_LABELS,
} from '@/components/admin/labels'
import styles from '@/components/admin/admin.module.css'
import { Badge, Card } from '@/components/ui/Card'
import { TOPIC_LABELS, type Topic } from '@/domain/types'
import { prisma } from '@/server/db'
import { purgeNeverVerified } from '@/server/housekeeping/never-verified'
import { PilotMetricsV1, computePilotMetrics, share, type PilotMetrics } from '@/server/metrics'
import { requireAdminOrNotFound } from '@/server/session'

// Aggregate pilot metrics, alerts and housekeeping (docs/DECISIONS.md P4-6). ADMIN only, never cached, nothing per account.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'מדדי הפיילוט' }

const RULE_CODES: Record<string, string> = {
  SERVER_ERRORS: 'server-errors',
  AUTH_EMAIL: 'auth-email',
  GENERATION_FAILURES: 'generation-failures',
  AI_BUDGET_WARNING: 'ai-budget-warning',
  AI_BUDGET_EXHAUSTED: 'ai-budget-exhausted',
  HOUSEKEEPING: 'housekeeping',
}
const NOTIFY_TONE = { SENT: 'success', FAILED: 'warning', GAVE_UP: 'warning', SUPPRESSED: 'neutral', SKIPPED: 'neutral', NOT_CONFIGURED: 'neutral', PENDING: 'info' } as const
const STEP_TONE = { ok: 'success', failed: 'warning', skipped: 'neutral' } as const
const OUTCOME_TONE = { ok: 'success', partial: 'warning', running: 'info', abandoned: 'warning' } as const

const RunSteps = z.object({
  outcome: z.enum(['running', 'ok', 'partial', 'abandoned']).catch('partial'),
  steps: z.array(z.object({ step: z.string(), status: z.enum(['ok', 'failed', 'skipped']), count: z.number().nullable() })).catch([]),
})

const STALE_RUN_MS = 36 * 3_600_000
const number = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 })
const time = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
const date = new Intl.DateTimeFormat('he-IL', { timeZone: 'UTC', dateStyle: 'short' })

const n = (value: number | null) => (value === null ? '—' : number.format(value))
/** "X מתוך Y (Z%)"; an empty denominator shows "—", never NaN or 0%. */
function of(part: number, whole: number) {
  if (whole < 1) return '—'
  return `${number.format(part)} מתוך ${number.format(whole)} (${share(part, whole)}%)`
}

function Table({ label, caption, head, children }: { label: string; caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${label} (אפשר לגלול הצידה)`}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card aria-labelledby={id}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      <div className={styles.stack}>{children}</div>
    </Card>
  )
}

export default async function AdminMetricsPage() {
  await requireAdminOrNotFound()
  const now = new Date()
  const live = await computePilotMetrics({ asOf: now })
  const snapshotRows = await prisma.pilotMetricDay.findMany({ orderBy: { day: 'desc' }, take: 14 })
  const openAlerts = await prisma.opsAlert.findMany({ where: { resolvedAt: null }, orderBy: { openedAt: 'desc' } })
  const resolved7 = await prisma.opsAlert.count({ where: { resolvedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } })
  const lastRun = await prisma.housekeepingRun.findFirst({ orderBy: { startedAt: 'desc' } })
  const lastOk = await prisma.housekeepingRun.findFirst({ where: { stepsJson: { path: ['outcome'], equals: 'ok' } }, orderBy: { startedAt: 'desc' } })
  const purge = await purgeNeverVerified({ enabled: false })
  const purgeOn = process.env.NEVER_VERIFIED_PURGE === 'on'

  const run = lastRun ? RunSteps.parse(lastRun.stepsJson) : null
  const staleRun = !lastOk?.finishedAt || now.getTime() - lastOk.finishedAt.getTime() > STALE_RUN_MS
  const snapshots = snapshotRows.flatMap((row) => {
    const parsed = PilotMetricsV1.safeParse(row.metricsJson)
    return parsed.success ? [{ day: row.day, metrics: parsed.data }] : []
  })
  const failures = (m: PilotMetrics) => Object.values(m.generation.failuresByClass).reduce((sum, value) => sum + value, 0)
  const { funnel, activeDays, day7Return, difficulty, mastery, generation } = live

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Activity size={28} aria-hidden="true" />
        <h1 className={styles.title}>מדדי הפיילוט</h1>
      </header>
      <p className={styles.muted}>
        נתונים מצטברים בלבד, בעלי גורים בלבד (ללא חשבונות ניהול), לפי ימים בשעון ישראל. עודכן: {time.format(now)}
      </p>
      <p className={styles.muted}>סרטוני הדגמה: לא נמדד בפיילוט, אין סרטוני הדגמה</p>

      <Section id="alerts" title="התראות פתוחות">
        {openAlerts.length === 0 ? (
          <p className={styles.muted}>אין התראות פתוחות.</p>
        ) : (
          <Table label="טבלת ההתראות הפתוחות" caption="התראות פתוחות" head={['כלל', 'נפתחה', 'אירוע אחרון', 'אירועים', 'מצב ההודעה']}>
            {openAlerts.map((alert) => {
              const code = RULE_CODES[alert.rule] ?? alert.rule
              const status = alert.notifyStatus ?? 'PENDING'
              return (
                <tr key={alert.id}>
                  <td>
                    {RULE_LABELS[code]} <span className={styles.ltr}>({code})</span>
                  </td>
                  <td>{time.format(alert.openedAt)}</td>
                  <td>{time.format(alert.lastEventAt)}</td>
                  <td>{n(alert.eventCount)}</td>
                  <td>
                    <Badge tone={NOTIFY_TONE[status]}>{NOTIFY_LABELS[status]}</Badge>
                  </td>
                </tr>
              )
            })}
          </Table>
        )}
        <p className={styles.muted}>נסגרו ב-7 הימים האחרונים: {n(resolved7)}</p>
      </Section>

      <Section id="housekeeping" title="ניקוי ושמירת נתונים">
        {lastRun && run ? (
          <>
            <div className={styles.badges}>
              <span>
                הרצה אחרונה: {time.format(lastRun.startedAt)} ({TRIGGER_LABELS[lastRun.trigger]})
              </span>
              <Badge tone={OUTCOME_TONE[run.outcome]}>{RUN_OUTCOME_LABELS[run.outcome]}</Badge>
            </div>
            {run.steps.length > 0 && (
              <Table label="טבלת שלבי ההרצה האחרונה" caption="שלבי ההרצה האחרונה" head={['שלב', 'מצב', 'כמות']}>
                {run.steps.map((step) => (
                  <tr key={step.step}>
                    <td>{STEP_LABELS[step.step] ?? step.step}</td>
                    <td>
                      <Badge tone={STEP_TONE[step.status]}>{STEP_STATUS_LABELS[step.status]}</Badge>
                    </td>
                    <td>{n(step.count)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </>
        ) : (
          <p className={styles.muted}>עדיין לא הייתה הרצת ניקוי.</p>
        )}
        {staleRun && (
          <div className={styles.badges}>
            <Badge tone="warning">ההרצה היומית האחרונה שהצליחה ישנה מ-36 שעות</Badge>
          </div>
        )}
        <p>חשבונות שלא אומתו וזכאים למחיקה: {n(purge.eligible)}</p>
        <p>חשבונות ישנים שלא אומתו ויש בהם נתונים (לא נמחקים אוטומטית): {n(purge.legacyWithData)}</p>
        <div className={styles.badges}>
          <Badge tone={purgeOn ? 'warning' : 'neutral'}>{purgeOn ? 'המחיקה פעילה' : 'ספירה בלבד: המחיקה לא הופעלה'}</Badge>
        </div>
      </Section>

      <Section id="funnel" title="משפך הצטרפות">
        <Table label="טבלת משפך ההצטרפות" caption="משפך הצטרפות" head={['שלב', 'מספר', 'מתוך השלב הקודם']}>
          <tr>
            <td>נרשמו</td>
            <td>{n(funnel.registered)}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>אימתו את כתובת האימייל</td>
            <td>{n(funnel.verified)}</td>
            <td>{of(funnel.verified, funnel.registered)}</td>
          </tr>
          <tr>
            <td>השלימו את ההיכרות</td>
            <td>{n(funnel.onboarded)}</td>
            <td>{of(funnel.onboarded, funnel.verified)}</td>
          </tr>
          <tr>
            <td>תרגלו לפחות פעם אחת</td>
            <td>{n(funnel.firstPractice)}</td>
            <td>{of(funnel.firstPractice, funnel.onboarded)}</td>
          </tr>
        </Table>
        <p>חציון שעות מההיכרות לתרגול הראשון: {n(funnel.medianHoursToFirstPractice)}</p>
      </Section>

      <Section id="practice" title="ימי תרגול">
        <p>
          חציון ימי תרגול: {n(activeDays.median7)} ב-7 הימים האחרונים, {n(activeDays.median28)} ב-28 הימים האחרונים
        </p>
        <p>≥3 ימים ב-7: {of(activeDays.atLeast3In7, activeDays.cohort)}</p>
        <p>0 ימים ב-7: {of(activeDays.zeroIn7, activeDays.cohort)}</p>
      </Section>

      <Section id="return" title="חזרה ביום 7">
        <p>תרגלו בימים 7 עד 13 אחרי ההיכרות: {of(day7Return.returned, day7Return.eligible)}</p>
      </Section>

      <Section id="difficulty" title="קושי חוזר לפי שלב">
        {difficulty.byPosition.length === 0 ? (
          <p className={styles.muted}>אין שלב שבו בעלים דיווחו פעמיים על קושי.</p>
        ) : (
          <Table label="טבלת הקושי לפי שלב" caption="בעלים עם שני דיווחי קושי לפחות באותו שלב" head={['שלב במסלול', 'בעלים', 'הנושא השכיח']}>
            {difficulty.byPosition.map((row) => (
              <tr key={row.position}>
                <td>{n(row.position)}</td>
                <td>{n(row.owners)}</td>
                <td>{TOPIC_LABELS[row.topTopic.toLowerCase() as Topic]}</td>
              </tr>
            ))}
          </Table>
        )}
        <p>תקועים (אין תרגול ואין שליטה בשלב הנוכחי 7 ימים): {of(difficulty.stalled, difficulty.stalledOf)}</p>
      </Section>

      <Section id="mastery" title="דיווחי שליטה">
        <p>
          אישורי שליטה: {n(mastery.confirmations7)} ב-7 הימים האחרונים, {n(mastery.confirmations28)} ב-28 הימים האחרונים
        </p>
        <p>חציון ימים מהתרגול הראשון בשלב ועד השליטה: {n(mastery.medianDaysToMastery)}</p>
        <p>
          אישורים לשבוע פעיל של בעלים: {n(mastery.perActiveOwnerWeek)} (שבועות פעילים: {n(mastery.activeOwnerWeeks28)})
        </p>
      </Section>

      <Section id="generation" title="יצירת תוכניות">
        <p className={styles.muted}>משימות יצירה מ-7 הימים האחרונים.</p>
        <Table label="טבלת משימות היצירה לפי מצב" caption="משימות יצירה לפי מצב" head={['מצב', 'מספר']}>
          {Object.entries(generation.byStatus).map(([status, count]) => (
            <tr key={status}>
              <td>{GENERATION_STATUS_LABELS[status]}</td>
              <td>{n(count)}</td>
            </tr>
          ))}
        </Table>
        <Table label="טבלת הכשלים לפי סוג" caption="כשלי יצירה לפי סוג" head={['סוג הכשל', 'מספר']}>
          {Object.entries(generation.failuresByClass).map(([kind, count]) => (
            <tr key={kind}>
              <td>{FAILURE_CLASS_LABELS[kind]}</td>
              <td>{n(count)}</td>
            </tr>
          ))}
        </Table>
        <p>בקשות שנדחו בגלל המגבלה היומית לחשבון: {n(generation.quotaAccount)}</p>
        <p>בקשות שנדחו בגלל תקציב הקריאות היומי: {n(generation.quotaCalls)}</p>
      </Section>

      <Section id="snapshots" title="תמונות יומיות">
        {snapshots.length === 0 ? (
          <p className={styles.muted}>עדיין אין תמונות יומיות. הראשונה נכתבת בהרצה היומית הבאה.</p>
        ) : (
          <Table
            label="טבלת התמונות היומיות"
            caption="תמונות יומיות של 14 הימים האחרונים"
            head={['יום', 'נרשמו', 'השלימו היכרות', 'תרגלו', 'שליטה ב-7 ימים', 'כשלי יצירה']}
          >
            {snapshots.map(({ day, metrics }) => (
              <tr key={day.toISOString()}>
                <td>
                  <div className={styles.badges}>
                    <span>{date.format(day)}</span>
                    {metrics.backfilled === 1 && <Badge tone="neutral">השלמה בדיעבד</Badge>}
                  </div>
                </td>
                <td>{n(metrics.funnel.registered)}</td>
                <td>{n(metrics.funnel.onboarded)}</td>
                <td>{n(metrics.funnel.firstPractice)}</td>
                <td>{n(metrics.mastery.confirmations7)}</td>
                <td>{n(failures(metrics))}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  )
}
