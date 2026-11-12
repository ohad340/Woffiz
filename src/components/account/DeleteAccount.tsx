'use client'

import { Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import styles from './DeleteAccount.module.css'

const ADMIN_TEXT = 'זהו חשבון מנהל. כדי למחוק אותו צריך קודם לבטל את הרשאת המנהל, פעולה שמבצע בעל המערכת.'
const NETWORK_ERROR = 'לא נמחק דבר. בדקו את החיבור ונסו שוב.'
const GENERIC_ERROR = 'משהו השתבש. לא נמחק דבר. נסו שוב בעוד רגע.'

type Props = {
  /** The account's CURRENT database role is ADMIN: the dialog explains and offers no form. */
  isAdmin: boolean
  /** The id appears in the media review and publication records (a former administrator). */
  hasAuditRecords: boolean
}

/**
 * "מחיקת החשבון" on /puppy: an honest scope statement, a password check and a permanent deletion (docs/DECISIONS.md P4-4).
 * Cancel has the initial focus. Nothing is deleted unless the server answers 200, and then the whole page is replaced
 * (a full navigation drops all client state; the session is already gone).
 */
export function DeleteAccount({ isAdmin, hasAuditRecords }: Props) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const formId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)

  function close() {
    setOpen(false)
    setPassword('')
    setError(undefined)
  }

  // The dialog's header close button comes first in the DOM, so a plain showModal() would focus it: move focus to Cancel.
  useEffect(() => {
    if (open) document.querySelector<HTMLElement>('[data-delete-cancel]')?.focus()
  }, [open])

  // After a refused or failed request the field is focused again, so the owner can correct it at once.
  useEffect(() => {
    if (error) formRef.current?.querySelector('input')?.focus()
  }, [error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || password.length === 0) return
    inFlight.current = true
    setSending(true)
    setError(undefined)
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (response.ok) {
        // Deliberately a full navigation, not a client-side route change: it drops every piece of client state, and the
        // session is already gone (the design of the deletion flow, docs/DECISIONS.md P4-4).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/?deleted=1'
        return
      }
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null
      setError(typeof body?.message === 'string' ? body.message : GENERIC_ERROR)
    } catch {
      setError(NETWORK_ERROR)
    }
    // Only a request that did not delete anything gets here: the password never stays in memory.
    setPassword('')
    setSending(false)
    inFlight.current = false
  }

  return (
    <>
      <Button variant="destructive" icon={<Trash2 size={20} aria-hidden="true" />} onClick={() => setOpen(true)}>
        מחיקת החשבון
      </Button>
      <Sheet
        open={open}
        title="מחיקת החשבון"
        onClose={close}
        footer={
          isAdmin ? (
            <Button variant="secondary" fullWidth data-delete-cancel="" onClick={close}>
              סגירה
            </Button>
          ) : (
            <>
              <Button variant="secondary" fullWidth data-delete-cancel="" onClick={close}>
                ביטול
              </Button>
              <Button variant="destructive" fullWidth type="submit" form={formId} loading={sending} loadingLabel="מוחקים…" disabled={password.length === 0}>
                מחיקה לצמיתות
              </Button>
            </>
          )
        }
      >
        {isAdmin ? (
          <p>{ADMIN_TEXT}</p>
        ) : (
          <>
            <div className={styles.scope}>
              <p>
                <strong>מה יימחק עכשיו, ולא ניתן לשחזר:</strong> החשבון, כתובת האימייל והסיסמה, וכל ההתחברויות שלכם בכל המכשירים · פרופיל הגור ותשובות השאלון · כל
                מסלולי האימון והתרגילים · דיווחי התרגול ואישורי השליטה · רשומות ההתאמה האישית, כולל התוצרים השמורים שלהן.
              </p>
              <p>
                <strong>מה נשאר:</strong> סרטוני ההדגמה המשותפים. הם אף פעם לא הכילו מידע שלכם.
              </p>
              {hasAuditRecords && (
                <p>
                  רשומות הבדיקה והפרסום של סרטוני הדגמה נשמרות עם מזהה פנימי שאינו מכיל כתובת אימייל. אחרי המחיקה הוא כבר לא מקושר לשום חשבון אצלנו. גיבויים
                  שנוצרו לפני המחיקה עשויים עדיין לקשר אותו עד שיפוגו.
                </p>
              )}
              <p>
                <strong>כדאי לדעת:</strong> אי אפשר לשחזר את החשבון. עותקים עשויים להישאר זמן מוגבל בגיבויים וביומנים של ספקי האחסון והדואר, לפי מדיניות השמירה
                שלהם, ובכל בקשת התאמה אישית שכבר הייתה בעיבוד.
              </p>
            </div>
            <form id={formId} ref={formRef} onSubmit={submit} noValidate>
              <div aria-live="polite">
                <TextField
                  label="הסיסמה הנוכחית"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={sending}
                  error={error}
                />
              </div>
            </form>
          </>
        )}
      </Sheet>
    </>
  )
}
