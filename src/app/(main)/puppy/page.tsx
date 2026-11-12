import type { Metadata } from 'next'
import { DeleteAccount } from '@/components/account/DeleteAccount'
import { Mascot } from '@/components/art/Mascot'
import { AiAdjust } from '@/components/exercise/AiAdjust'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { InstallGuide } from '@/components/pwa/InstallGuide'
import { Card } from '@/components/ui/Card'
import { hasMediaAuditRecords } from '@/server/account-deletion'
import { getRecentAttempts, requireOverview } from '@/server/queries'
import { requireUserOrRedirect } from '@/server/session'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'הגור שלי' }

const OUTCOME_LABELS = { INDEPENDENT: 'הצליח לבד', WITH_HELP: 'הצליח עם עזרה', STRUGGLING: 'עדיין מתקשה' } as const
const dateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jerusalem' })

export default async function PuppyPage() {
  const user = await requireUserOrRedirect()
  const [overview, attempts, hasAuditRecords] = await Promise.all([requireOverview(user.id), getRecentAttempts(user.id), hasMediaAuditRecords(user.id)])
  const puppy = overview.puppy

  return (
    <div className={styles.narrow}>
      <div className={styles.profileHero}>
        <span className={styles.profileAvatar}>
          <Mascot />
        </span>
        <div>
          <h1 className={styles.pageTitle}>הגור שלי</h1>
          <p className={styles.muted}>
            {puppy.name}
            {puppy.ageLabel && ` · ${puppy.ageLabel}`}
          </p>
        </div>
      </div>

      <Card aria-labelledby="recent-title">
        <h2 id="recent-title" className={styles.cardTitle}>
          תרגולים אחרונים
        </h2>
        {attempts.length === 0 ? (
          <p className={styles.muted}>עוד אין דיווחי תרגול. אחרי התרגיל הראשון הם יופיעו כאן.</p>
        ) : (
          <ul className={styles.list}>
            {attempts.map((attempt) => (
              <li key={attempt.id} className={styles.attempt}>
                <span>
                  שלב {attempt.levelPosition}: {attempt.levelTitle}
                  {attempt.mode === 'REVIEW' && ' (תרגול חוזר)'}
                </span>
                <span className={styles.muted}>
                  {OUTCOME_LABELS[attempt.outcome]} · {dateFormat.format(attempt.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {overview.current && overview.current.position < overview.levels.length && (
        <Card aria-labelledby="path-title" className={styles.sectionStack}>
          <h2 id="path-title" className={styles.cardTitle}>
            המסלול
          </h2>
          <p className={styles.muted}>אפשר לבקש לבנות מחדש את השלבים שעוד נעולים לפי ההתקדמות שלכם. שלבים שהושלמו והשלב הנוכחי לא ישתנו, ושליטה נקבעת רק על ידכם.</p>
          <AiAdjust
            endpoint="/api/plan/revise"
            planRevision={overview.planRevision}
            label="לעדכן את המשך המסלול"
            loadingLabel="מעדכנים…"
            doneNote="המשך המסלול עודכן."
            variant="secondary"
          />
        </Card>
      )}

      <Card id="install" aria-labelledby="install-title" className={styles.sectionStack}>
        <h2 id="install-title" className={styles.cardTitle}>
          התקנה במסך הבית
        </h2>
        <InstallGuide />
      </Card>

      <Card aria-labelledby="account-title" className={styles.sectionStack}>
        <h2 id="account-title" className={styles.cardTitle}>
          חשבון
        </h2>
        <p>
          מחוברים בתור <span className="ltr-value">{user.email}</span>
        </p>
        <SignOutButton />
        <DeleteAccount isAdmin={user.role === 'ADMIN'} hasAuditRecords={hasAuditRecords} />
      </Card>
    </div>
  )
}
