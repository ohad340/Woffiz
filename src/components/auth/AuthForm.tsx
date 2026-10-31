'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import styles from './AuthForm.module.css'

type Mode = 'sign-in' | 'sign-up'

const MIN_PASSWORD = 8

/** Better Auth error codes to Hebrew. Anything unknown gets a generic, non-revealing message. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'האימייל או הסיסמה לא נכונים.',
  USER_ALREADY_EXISTS: 'כבר קיים חשבון עם האימייל הזה. אפשר להיכנס אליו.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'כבר קיים חשבון עם האימייל הזה. אפשר להיכנס אליו.',
  PASSWORD_TOO_SHORT: `הסיסמה קצרה מדי. צריך לפחות ${MIN_PASSWORD} תווים.`,
  PASSWORD_TOO_LONG: 'הסיסמה ארוכה מדי.',
  EMAIL_PASSWORD_SIGN_UP_DISABLED: 'ההרשמה עדיין לא פתוחה בסביבה הזו.',
  EMAIL_AND_PASSWORD_SIGN_UP_DISABLED: 'ההרשמה עדיין לא פתוחה בסביבה הזו.',
}

/** Email and password sign-in or registration. The session cookie is set by the server. */
export function AuthForm({ signUpOpen }: { signUpOpen: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const signingUp = mode === 'sign-up'

  function switchMode(next: Mode) {
    setMode(next)
    setError(undefined)
    setErrors({})
  }

  function validate() {
    const next: typeof errors = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'כתבו כתובת אימייל תקינה'
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
    try {
      const value = email.trim()
      const response = await fetch(signingUp ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signingUp ? { email: value, password, name: value.split('@')[0] } : { email: value, password }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { code?: string } | null
        const fallback = response.status === 429 ? 'יותר מדי ניסיונות. נסו שוב בעוד דקה.' : 'לא הצלחנו להיכנס. בדקו את הפרטים ונסו שוב.'
        setError(MESSAGES[data?.code ?? ''] ?? fallback)
        setLoading(false)
        return
      }
      router.push(signingUp ? '/onboarding' : '/home')
      router.refresh()
    } catch {
      setError('אין חיבור. בדקו את החיבור ונסו שוב.')
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {signUpOpen ? (
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
        helper={signingUp ? `לפחות ${MIN_PASSWORD} תווים.` : undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="cta" fullWidth loading={loading} loadingLabel={signingUp ? 'יוצרים חשבון…' : 'נכנסים…'}>
        {signingUp ? 'יצירת חשבון' : 'כניסה'}
      </Button>
    </form>
  )
}
