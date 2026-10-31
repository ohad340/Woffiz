'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import styles from './SignInForm.module.css'

type Phase = { kind: 'form' } | { kind: 'sent'; email: string; devLink: string | null }

/**
 * Email magic-link sign-in. In local development there is no email provider: the server keeps
 * the link in a dev inbox and we show it here, labeled, instead of pretending an email was sent.
 */
export function SignInForm({ devInbox }: { devInbox: boolean }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setFieldError('כתבו כתובת אימייל תקינה')
      return
    }
    setFieldError(undefined)
    setError(undefined)
    setLoading(true)
    try {
      const response = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: value, name: value.split('@')[0], callbackURL: '/home', newUserCallbackURL: '/onboarding' }),
      })
      if (!response.ok) throw new Error(String(response.status))
      let devLink: string | null = null
      if (devInbox) {
        const inbox = await fetch(`/api/dev/inbox?email=${encodeURIComponent(value)}`, { cache: 'no-store' })
        if (inbox.ok) devLink = ((await inbox.json()) as { url: string }).url
      }
      setPhase({ kind: 'sent', email: value, devLink })
    } catch {
      setError('לא הצלחנו לשלוח קישור כניסה. בדקו את החיבור ונסו שוב.')
    } finally {
      setLoading(false)
    }
  }

  if (phase.kind === 'sent') {
    return (
      <div className={styles.sent} role="status">
        {phase.devLink ? (
          <>
            <p className={styles.devNote}>מצב פיתוח — לא נשלח מייל</p>
            <p>
              בסביבה המקומית אין שליחת מייל. הקישור ל-<span className="ltr-value">{phase.email}</span> מוכן:
            </p>
            <Button href={phase.devLink} size="cta" fullWidth prefetch={false}>
              כניסה עם הקישור
            </Button>
          </>
        ) : (
          <p>
            שלחנו קישור כניסה אל <span className="ltr-value">{phase.email}</span>. הקישור תקף לזמן קצר וניתן לשימוש פעם אחת.
          </p>
        )}
        <Button variant="ghost" onClick={() => setPhase({ kind: 'form' })}>
          שימוש בכתובת אחרת
        </Button>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label="אימייל"
        type="email"
        inputMode="email"
        autoComplete="email"
        dir="ltr"
        value={email}
        error={fieldError}
        helper="נשלח אליכם קישור כניסה, בלי סיסמה."
        onChange={(e) => setEmail(e.target.value)}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="cta" fullWidth loading={loading} loadingLabel="שולחים…">
        כניסה עם אימייל
      </Button>
    </form>
  )
}
