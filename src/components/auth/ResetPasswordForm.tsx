'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { MIN_PASSWORD } from '@/lib/auth-paths'
import styles from './AuthScreen.module.css'
import { authErrorMessage, NETWORK_ERROR, readErrorCode } from './messages'

/** Sets a new password with the one-time token from the emailed link. Every session of the account ends. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [error, setError] = useState<{ text: string; expired: boolean } | undefined>()
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function validate() {
    const next: typeof errors = {}
    if (password.length < MIN_PASSWORD) next.password = `הסיסמה צריכה להיות לפחות ${MIN_PASSWORD} תווים`
    if (confirm !== password) next.confirm = 'הסיסמאות לא זהות'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(undefined)
    if (!validate()) return
    setLoading(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: password, token }),
      })
      if (response.ok) {
        setDone(true)
      } else {
        const code = await readErrorCode(response)
        setError({ text: authErrorMessage(response.status, code, 'לא הצלחנו לעדכן את הסיסמה. נסו שוב.'), expired: code === 'INVALID_TOKEN' })
      }
    } catch {
      setError({ text: NETWORK_ERROR, expired: false })
    }
    setLoading(false)
  }

  if (done) {
    return (
      <>
        <p className={styles.success} role="status">
          הסיסמה עודכנה. מטעמי אבטחה יצאנו מכל המכשירים, אז צריך להיכנס מחדש עם הסיסמה החדשה.
        </p>
        <Button href="/" size="cta" fullWidth>
          לכניסה
        </Button>
      </>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label="סיסמה חדשה"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        value={password}
        error={errors.password}
        helper={`לפחות ${MIN_PASSWORD} תווים.`}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        label="אימות הסיסמה החדשה"
        type="password"
        autoComplete="new-password"
        dir="ltr"
        value={confirm}
        error={errors.confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error.text}
          {error.expired && (
            <>
              {' '}
              <Link className={styles.link} href="/forgot-password">
                לבקשת קישור חדש
              </Link>
            </>
          )}
        </p>
      )}
      <Button type="submit" size="cta" fullWidth loading={loading} loadingLabel="שומרים…">
        שמירת הסיסמה החדשה
      </Button>
    </form>
  )
}
