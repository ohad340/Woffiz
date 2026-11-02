import type { Metadata } from 'next'
import { AuthScreen } from '@/components/auth/AuthScreen'
import styles from '@/components/auth/AuthScreen.module.css'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { Button } from '@/components/ui/Button'

// The one-time token is in this page's URL: never send it to another site as a referrer.
export const metadata: Metadata = { title: 'בחירת סיסמה חדשה', referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** Better Auth redirects the emailed link here with ?token=… or, for an expired/used/unknown token, ?error=INVALID_TOKEN. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams
  const token = first(params.token)
  const error = first(params.error)

  if (error || !token) {
    return (
      <AuthScreen title="הקישור לא תקף">
        <p className={styles.error} role="alert">
          קישור האיפוס פג תוקף, כבר השתמשו בו, או שהוא לא שלם. כל קישור תקף לשעה ולשימוש אחד.
        </p>
        <Button href="/forgot-password" size="cta" fullWidth>
          בקשת קישור חדש
        </Button>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen title="בחירת סיסמה חדשה">
      <ResetPasswordForm token={token} />
    </AuthScreen>
  )
}
