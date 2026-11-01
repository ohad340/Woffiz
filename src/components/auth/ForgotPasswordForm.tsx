'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { RESET_PASSWORD_PATH } from '@/lib/auth-paths'
import styles from './AuthScreen.module.css'
import { authErrorMessage, looksLikeEmail, NETWORK_ERROR, readErrorCode, recalledEmail } from './messages'

/** Requests a reset link. The answer never says whether the address has an account. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail((current) => current || recalledEmail())
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    const value = email.trim()
    if (!looksLikeEmail(value)) {
      setFieldError('כתבו כתובת אימייל תקינה')
      return
    }
    setFieldError(undefined)
    setLoading(true)
    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, redirectTo: RESET_PASSWORD_PATH }),
      })
      if (response.ok) setSent(true)
      else setError(authErrorMessage(response.status, await readErrorCode(response), 'לא הצלחנו לשלוח קישור. נסו שוב.'))
    } catch {
      setError(NETWORK_ERROR)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <>
        <p className={styles.success} role="status">
          הבקשה התקבלה. אם יש חשבון לכתובת הזו, אמור להגיע אליה קישור לבחירת סיסמה חדשה בדקות הקרובות. הקישור תקף לשעה
          ולשימוש אחד.
        </p>
        <p className={styles.muted}>לא הגיע? בדקו בתיקיית הספאם, או נסו שוב בעוד כמה דקות.</p>
        <Button href="/" variant="secondary" fullWidth>
          חזרה לכניסה
        </Button>
      </>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.lead}>כתבו את כתובת האימייל של החשבון ונשלח אליה קישור לבחירת סיסמה חדשה.</p>
      <TextField
        label="אימייל"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        value={email}
        error={fieldError}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="cta" fullWidth loading={loading} loadingLabel="שולחים…">
        שליחת קישור לאיפוס
      </Button>
    </form>
  )
}
