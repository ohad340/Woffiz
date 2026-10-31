import type { Metadata } from 'next'
import { Mascot } from '@/components/art/Mascot'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DEMO_PUPPY } from '@/fixtures/demoPlan'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'הגור שלי' }

export default function PuppyPage() {
  return (
    <div className={styles.narrow}>
      <div className={styles.profileHero}>
        <span className={styles.profileAvatar}>
          <Mascot />
        </span>
        <div>
          <h1 className={styles.pageTitle}>הגור שלי</h1>
          <p className={styles.muted}>
            {DEMO_PUPPY.name} · {DEMO_PUPPY.ageLabel}
          </p>
        </div>
      </div>

      <Card aria-labelledby="profile-title">
        <h2 id="profile-title" className={styles.cardTitle}>
          פרטי הגור
        </h2>
        <dl className={styles.dl}>
          <dt>שם</dt>
          <dd>{DEMO_PUPPY.name}</dd>
          <dt>גיל</dt>
          <dd>{DEMO_PUPPY.ageLabel}</dd>
        </dl>
      </Card>

      <Card aria-labelledby="recent-title">
        <h2 id="recent-title" className={styles.cardTitle}>
          תרגולים אחרונים
        </h2>
        <p className={styles.muted}>עוד אין דיווחי תרגול. דיווחים יישמרו החל מהשלב הבא של הפיתוח.</p>
      </Card>

      <Card aria-labelledby="account-title" className={styles.sectionStack}>
        <h2 id="account-title" className={styles.cardTitle}>
          חשבון
        </h2>
        <p className={styles.muted}>עריכת פרטים, התנתקות ומחיקת חשבון יתווספו יחד עם ההתחברות האמיתית.</p>
        <Button href="/onboarding" variant="secondary">
          עריכת שאלון ההיכרות (דמו)
        </Button>
      </Card>
    </div>
  )
}
