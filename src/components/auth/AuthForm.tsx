'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { MIN_PASSWORD, VERIFY_CALLBACK_PATH } from '@/lib/auth-paths'
import styles from './AuthForm.module.css'
import { authErrorMessage, looksLikeEmail, NETWORK_ERROR, readErrorCode, rememberEmail } from './messages'

type Mode = 'sign-in' | 'sign-up'

/** Who may register here (decided on the server; the server enforces it again on every request). */
export type SignUpMode = 'closed' | 'tester' | 'open'

/** Email and password sign-in or registration. The session cookie is set by the server, only for verified addresses. */
export function AuthForm({ signUp }: { signUp: SignUpMode }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState<{ text: string; unverified?: boolean } | undefined>()
  const [loading, setLoading] = useState(false)

  const signingUp = mode === 'sign-up'

  function switchMode(next: Mode) {
    setMode(next)
    setError(undefined)
    setErrors({})
  }

  function validate() {
    const next: typeof errors = {}
    if (!looksLikeEmail(email)) next.email = 'כתבו כתובת אימייל תקינה'
    if (!password) next.password = 'כתבו סיסמה'
    else if (signingUp && password.length < MIN_PASSWORD) next.password = `הסיסמה צריכה להיות לפחות ${MIN_PASSWORD} תווים`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    if (!validate()) return
    setLoading(true)
    const value = email.trim()
    try {
      const response = await fetch(signingUp ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          signingUp
            ? { email: value, password, name: value.split('@')[0], callbackURL: VERIFY_CALLBACK_PATH }
            : { email: value, password },
        ),
      })
      rememberEmail(value)
      if (response.ok) {
        // Registration never signs in: the owner continues from the link in the verification email.
        router.push(signingUp ? '/verify-email' : '/home')
        router.refresh()
        return
      }
      const code = await readErrorCode(response)
      const fallback = signingUp ? 'לא הצלחנו ליצור חשבון. נסו שוב.' : 'לא הצלחנו להיכנס. בדקו את הפרטים ונסו שוב.'
      setError({ text: authErrorMessage(response.status, code, fallback), unverified: code === 'EMAIL_NOT_VERIFIED' })
      setLoading(false)
    } catch {
      setError({ text: NETWORK_ERROR })
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {signUp !== 'closed' ? (
        <div className={styles.tabs} role="group" aria-label="סוג הפעולה">
          <button type="button" className={styles.tab} aria-pressed={!signingUp} onClick={() => switchMode('sign-in')}>
            כניסה
          </button>
          <button type="button" className={styles.tab} aria-pressed={signingUp} onClick={() => switchMode('sign-up')}>
            הרשמה
          </button>
        </div>
      ) : (
        <p className={styles.closed}>ההרשמה עדיין לא פתוחה בסביבה הזו. אפשר להיכנס רק עם חשבון קיים.</p>
      )}
      {signingUp && signUp === 'tester' && <p className={styles.closed}>בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות.</p>}

      <TextField
        label="אימייל"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        value={email}
        error={errors.email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="סיסמה"
        type="password"
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        dir="ltr"
        value={password}
        error={errors.password}
        helper={signingUp ? `לפחות ${MIN_PASSWORD} תווים. את הכתובת מאמתים דרך קישור במייל.` : undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error.text}
          {error.unverified && (
            <>
              {' '}
              <Link className={styles.link} href="/verify-email">
                לשליחת קישור חדש
              </Link>
            </>
          )}
        </p>
      )}
      <Button type="submit" size="cta" fullWidth loading={loading} loadingLabel={signingUp ? 'יוצרים חשבון…' : 'נכנסים…'}>
        {signingUp ? 'יצירת חשבון' : 'כניסה'}
      </Button>
      {!signingUp && (
        <p className={styles.forgot}>
          <Link className={styles.link} href="/forgot-password">
            שכחתי סיסמה
          </Link>
        </p>
      )}
    </form>
  )
}
