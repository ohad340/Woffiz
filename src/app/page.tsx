import { Mail, PawPrint } from 'lucide-react'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { Button } from '@/components/ui/Button'
import { APP_NAME } from '@/lib/app'
import styles from './welcome.module.css'

export default function WelcomePage() {
  return (
    <>
      <FixtureBanner text="תצוגת פיתוח · אין עדיין התחברות אמיתית" />
      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.hero} aria-hidden="true">
          <PawPrint size={56} />
        </div>
        <h1 className={styles.title}>{APP_NAME}</h1>
        <p className={styles.lead}>
          תוכנית אימון אישית לגור שלכם: בכל פעם תרגיל אחד ברור, הדגמה קצרה והוראות פשוטות. מתקדמים לשלב הבא רק כשהגור
          באמת מוכן.
        </p>
        <ul className={styles.points}>
          <li>צרכים, נשיכות, שינה, הישארות לבד ופקודות בסיס, במסלול אחד.</li>
          <li>מתרגלים בקצב של הגור. אין לחץ של זמן.</li>
          <li>חינם, בעברית, ואפשר להתקין על מסך הבית.</li>
        </ul>
        <div className={styles.actions}>
          <Button href="/onboarding" size="cta" fullWidth icon={<Mail size={20} aria-hidden="true" />}>
            כניסה עם אימייל
          </Button>
          <p className={styles.note}>בגרסת הפיתוח הכפתור מדלג ישר לשאלון ההיכרות. התחברות אמיתית תתווסף בשלב הבא.</p>
        </div>
        <p className={styles.legal}>מדיניות פרטיות ופרטי תמיכה יפורסמו לפני ההשקה.</p>
      </main>
    </>
  )
}
