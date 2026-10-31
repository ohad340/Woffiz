import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthScreen } from '@/components/auth/AuthScreen'
import styles from '@/components/auth/AuthScreen.module.css'
import { ResendVerification } from '@/components/auth/ResendVerification'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Button } from '@/components/ui/Button'
import { getOverview } from '@/server/queries'
import { getSessionUser } from '@/server/session'

export const metadata: Metadata = { title: 'אימות כתובת האימייל' }
export const dynamic = 'force-dynamic'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/**
 * Landing screen for the emailed link (Better Auth redirects here with ?verified=1, plus ?error=CODE when
 * the token is expired or invalid) and the "check your inbox" screen after registration or sign-in.
 * Success is read from the session, never from the query string.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams
  const error = first(params.error)?.toUpperCase()
  const arrivedFromLink = first(params.verified) === '1'
  const user = await getSessionUser()

  if (user?.emailVerified) {
    if (!arrivedFromLink) redirect('/')
    const next = (await getOverview(user.id)) ? '/home' : '/onboarding'
    return (
      <AuthScreen title="האימייל אומת">
        <p className={styles.success} role="status">
          תודה! הכתובת אומתה ואתם מחוברים.
        </p>
        <Button href={next} size="cta" fullWidth>
          {next === '/home' ? 'המשך לאימון' : 'מתחילים להכיר את הגור'}
        </Button>
      </AuthScreen>
    )
  }

  if (error) {
    const expired = error === 'TOKEN_EXPIRED'
    return (
      <AuthScreen title={expired ? 'פג תוקף הקישור' : 'הקישור לא תקין'}>
        <p className={styles.error} role="alert">
          {expired ? 'קישור האימות תקף לשעה אחת, והזמן עבר.' : 'לא הצלחנו לאמת עם הקישור הזה. אולי הוא הועתק חלקית.'} אפשר לשלוח קישור
          חדש.
        </p>
        <ResendVerification sessionEmail={user?.email} />
        <p className={styles.links}>
          <Link className={styles.link} href="/">
            חזרה לכניסה
          </Link>
        </p>
      </AuthScreen>
    )
  }

  if (arrivedFromLink && !user) {
    // A link that was already used: the address is verified, but the link does not sign in a second time.
    return (
      <AuthScreen title="הקישור כבר טופל">
        <p className={styles.success} role="status">
          אם הכתובת אומתה, אפשר להיכנס עכשיו עם האימייל והסיסמה.
        </p>
        <Button href="/" size="cta" fullWidth>
          לכניסה
        </Button>
      </AuthScreen>
    )
  }

  const sendFailed = first(params.send) === 'failed'
  return (
    <AuthScreen title="בדקו את תיבת הדואר">
      {sendFailed ? (
        <p className={styles.error} role="alert">
          לא הצלחנו לשלוח את מייל האימות כרגע. נסו לשלוח שוב בעוד כמה דקות.
        </p>
      ) : (
        <p className={styles.lead}>
          {user ? (
            <>
              שלחנו קישור אימות אל <bdi dir="ltr">{user.email}</bdi>. לחצו עליו כדי להמשיך לאימון.
            </>
          ) : (
            'שלחנו קישור אימות לכתובת שנרשמתם איתה. לחצו עליו כדי להיכנס ולהתחיל.'
          )}
        </p>
      )}
      <p className={styles.muted}>הקישור תקף לשעה. לא הגיע? בדקו בתיקיית הספאם או שלחו קישור חדש.</p>
      <ResendVerification sessionEmail={user?.email} />
      {user ? (
        <SignOutButton />
      ) : (
        <p className={styles.links}>
          <Link className={styles.link} href="/">
            חזרה לכניסה
          </Link>
        </p>
      )}
    </AuthScreen>
  )
}
