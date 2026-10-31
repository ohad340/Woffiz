import { Mail, PawPrint } from 'lucide-react'
import { HeroScene } from '@/components/art/HeroScene'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { Button } from '@/components/ui/Button'
import { APP_NAME } from '@/lib/app'
import styles from './welcome.module.css'

const POINTS = [
  'צרכים, נשיכות, שינה, הישארות לבד ופקודות בסיס, במסלול אחד.',
  'מתרגלים בקצב של הגור. אין לחץ של זמן.',
  'חינם, בעברית, ואפשר להתקין על מסך הבית.',
]

export default function WelcomePage() {
  return (
    <>
      <FixtureBanner text="תצוגת פיתוח · אין עדיין התחברות אמיתית" />
      <main id="main" className={styles.main} tabIndex={-1}>
        <HeroScene labelledBy="welcome-title">
          <h1 id="welcome-title">{APP_NAME}</h1>
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
          <Button href="/onboarding" size="cta" fullWidth icon={<Mail size={22} aria-hidden="true" />}>
            כניסה עם אימייל
          </Button>
          <p className={styles.note}>בגרסת הפיתוח הכפתור מדלג ישר לשאלון ההיכרות. התחברות אמיתית תתווסף בשלב הבא.</p>
        </div>
        <p className={styles.legal}>מדיניות פרטיות ופרטי תמיכה יפורסמו לפני ההשקה.</p>
      </main>
    </>
  )
}
