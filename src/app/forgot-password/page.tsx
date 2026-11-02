import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthScreen } from '@/components/auth/AuthScreen'
import styles from '@/components/auth/AuthScreen.module.css'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata: Metadata = { title: 'שכחתי סיסמה' }
export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return (
    <AuthScreen title="שכחתם את הסיסמה?">
      <ForgotPasswordForm />
      <p className={styles.links}>
        <Link className={styles.link} href="/">
          חזרה לכניסה
        </Link>
      </p>
    </AuthScreen>
  )
}
