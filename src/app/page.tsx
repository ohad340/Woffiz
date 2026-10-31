import { PawPrint } from 'lucide-react'
import Image from 'next/image'
import { HeroScene } from '@/components/art/HeroScene'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { AuthForm } from '@/components/auth/AuthForm'
import { APP_NAME } from '@/lib/app'
import { signUpEnabled } from '@/server/local-mode'
import { getOverview } from '@/server/queries'
import { getSessionUser } from '@/server/session'
import { redirect } from 'next/navigation'
import styles from './welcome.module.css'

const POINTS = [
  'צרכים, נשיכות, שינה, הישארות לבד ופקודות בסיס, במסלול אחד.',
  'מתרגלים בקצב של הגור. אין לחץ של זמן.',
  'חינם, בעברית, ואפשר להתקין על מסך הבית.',
]

export const dynamic = 'force-dynamic'

export default async function WelcomePage() {
  const user = await getSessionUser()
  if (user) redirect((await getOverview(user.id)) ? '/home' : '/onboarding')

  return (
    <>
      <FixtureBanner />
      <main id="main" className={styles.main} tabIndex={-1}>
        <HeroScene labelledBy="welcome-title">
          <h1 id="welcome-title" className={styles.logoHeading}>
            <Image className={styles.logo} src="/art/logo.webp" alt={APP_NAME} width={1100} height={794} unoptimized priority />
          </h1>
          <p>תוכנית אימון אישית לגור שלכם, שלב אחרי שלב</p>
        </HeroScene>

        <div className={styles.card}>
          <p className={styles.lead}>
            בכל פעם תרגיל אחד ברור, הדגמה קצרה והוראות פשוטות. מתקדמים לשלב הבא רק כשהגור באמת מוכן.
          </p>
          <ul className={styles.points}>
            {POINTS.map((point) => (
              <li key={point}>
                <span className={styles.bullet} aria-hidden="true">
                  <PawPrint size={16} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.actions}>
          <AuthForm signUpOpen={signUpEnabled()} />
        </div>
        <p className={styles.legal}>מדיניות פרטיות ופרטי תמיכה יפורסמו לפני ההשקה.</p>
      </main>
    </>
  )
}
