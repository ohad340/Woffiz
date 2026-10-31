'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { VERIFY_CALLBACK_PATH } from '@/lib/auth-paths'
import styles from './AuthScreen.module.css'
import { authErrorMessage, looksLikeEmail, NETWORK_ERROR, readErrorCode, recalledEmail, rememberEmail } from './messages'

/**
 * Sends a new verification link. A signed-in (unverified) owner uses the session's address; anyone else
 * types it. The success text is the same whether or not the address has an account.
 */
export function ResendVerification({ sessionEmail }: { sessionEmail?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(sessionEmail ?? '')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Restored after hydration so server and client render the same markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!sessionEmail) setEmail((current) => current || recalledEmail())
  }, [sessionEmail])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setResult(undefined)
    const value = email.trim()
    if (!looksLikeEmail(value)) {
      setFieldError('כתבו כתובת אימייל תקינה')
      return
    }
    setFieldError(undefined)
    setLoading(true)
    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, callbackURL: VERIFY_CALLBACK_PATH }),
      })
      if (response.ok) {
        rememberEmail(value)
        setResult({
          ok: true,
          text: sessionEmail
            ? 'שלחנו קישור אימות חדש. הקישור תקף לשעה.'
            : 'אם הכתובת רשומה וממתינה לאימות, שלחנו אליה קישור חדש. הקישור תקף לשעה.',
        })
      } else {
        const code = await readErrorCode(response)
        if (code === 'EMAIL_ALREADY_VERIFIED') {
          router.refresh()
          return
        }
        setResult({ ok: false, text: authErrorMessage(response.status, code, 'לא הצלחנו לשלוח קישור חדש. נסו שוב.') })
      }
    } catch {
      setResult({ ok: false, text: NETWORK_ERROR })
    }
    setLoading(false)
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {!sessionEmail && (
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
      )}
      {result && (
        <p className={result.ok ? styles.success : styles.error} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
      <Button type="submit" variant="secondary" fullWidth loading={loading} loadingLabel="שולחים…">
        שליחת קישור חדש
      </Button>
    </form>
  )
}
