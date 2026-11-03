'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CHECKLIST_LABELS, KIND_LABELS } from './labels'
import styles from './admin.module.css'

type Outcome = { kind: 'error'; message: string; detail?: string } | { kind: 'done'; message: string }

/** Posts to an admin endpoint. The server decides everything; the page only reloads its data afterwards. */
function useAdminPost() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function post(url: string, body: unknown, done: string): Promise<boolean> {
    setPending(true)
    setOutcome(null)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
      if (!response.ok) {
        setOutcome({ kind: 'error', message: data?.message ?? 'הפעולה נכשלה.', detail: data?.detail })
        return false
      }
      setOutcome({ kind: 'done', message: done })
      router.refresh()
      return true
    } catch {
      setOutcome({ kind: 'error', message: 'אין חיבור. שום דבר לא השתנה.' })
      return false
    } finally {
      setPending(false)
    }
  }
  return { post, pending, outcome }
}

function Outcome({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null
  return outcome.kind === 'error' ? (
    <p role="alert" className={styles.error}>
      {outcome.message}
      {outcome.detail && (
        <>
          {' '}
          <span dir="ltr" className={styles.detail}>
            {outcome.detail}
          </span>
        </>
      )}
    </p>
  ) : (
    <p role="status" className={styles.done}>
      {outcome.message}
    </p>
  )
}

/** A button that asks once more before it acts. */
function Confirmed({ label, question, confirmLabel, variant, disabled, onConfirm }: {
  label: string
  question: string
  confirmLabel: string
  variant?: 'primary' | 'destructive'
  disabled?: boolean
  onConfirm: () => Promise<boolean>
}) {
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant={variant === 'destructive' ? 'destructive' : 'primary'} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    )
  }
  return (
    <div className={styles.confirm} role="group" aria-label={label}>
      <p>{question}</p>
      <div className={styles.row}>
        <Button
          variant={variant === 'destructive' ? 'destructive' : 'primary'}
          disabled={disabled}
          onClick={async () => {
            await onConfirm()
            setAsking(false)
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={() => setAsking(false)}>
          ביטול
        </Button>
      </div>
    </div>
  )
}

export function ReviewForm({ versionId, kind, fingerprint, items }: { versionId: string; kind: 'TECHNICAL' | 'CONTENT'; fingerprint: string; items: readonly string[] }) {
  const { post, pending, outcome } = useAdminPost()
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i, false])))
  const [decision, setDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED'>('APPROVED')
  const [notes, setNotes] = useState('')
  const heading = `heading-${kind}`
  const allTicked = items.every((i) => ticks[i])

  return (
    <form
      className={styles.form}
      aria-labelledby={heading}
      onSubmit={async (event) => {
        event.preventDefault()
        const ok = await post(`/api/admin/media/versions/${versionId}/review`, { kind, decision, checklist: ticks, notes: notes.trim() || undefined, fingerprint }, 'הסקירה נרשמה.')
        if (ok) setNotes('')
      }}
    >
      <h3 id={heading} className={styles.h3}>
        {KIND_LABELS[kind]}
      </h3>
      <fieldset className={styles.fieldset} disabled={pending}>
        <legend className="visually-hidden">רשימת בדיקה: {KIND_LABELS[kind]}</legend>
        {items.map((item) => (
          <label key={item} className={styles.check}>
            <input type="checkbox" checked={ticks[item] ?? false} onChange={(e) => setTicks({ ...ticks, [item]: e.target.checked })} />
            <span>{CHECKLIST_LABELS[item] ?? item}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.fieldset} disabled={pending}>
        <legend className={styles.legend}>החלטה</legend>
        <label className={styles.check}>
          <input type="radio" name={`decision-${kind}`} checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} />
          <span>מאשר (דורש סימון של כל הסעיפים)</span>
        </label>
        <label className={styles.check}>
          <input type="radio" name={`decision-${kind}`} checked={decision === 'CHANGES_REQUESTED'} onChange={() => setDecision('CHANGES_REQUESTED')} />
          <span>מבקש שינויים (דורש הערה)</span>
        </label>
      </fieldset>
      <label className={styles.field}>
        <span>הערות {decision === 'CHANGES_REQUESTED' ? '' : '(רשות)'}</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} disabled={pending} />
      </label>
      <Button type="submit" loading={pending} loadingLabel="שומר…" disabled={decision === 'APPROVED' && !allTicked}>
        רישום הסקירה
      </Button>
      <Outcome outcome={outcome} />
    </form>
  )
}

export function VersionActions({ versionId, status, reviewReady }: { versionId: string; status: string; reviewReady: boolean }) {
  const { post, pending, outcome } = useAdminPost()
  const [reason, setReason] = useState<'TECHNICAL' | 'SAFETY'>('TECHNICAL')
  const [note, setNote] = useState('')
  const base = `/api/admin/media/versions/${versionId}`

  return (
    <div className={styles.stack}>
      {status === 'DRAFT' && (
        <Confirmed
          label="סימון כנסקר"
          question="לסמן את הגרסה כנסקרת? נדרשים אישור טכני ואישור תוכן לגרסה הזו בדיוק."
          confirmLabel="כן, לסמן כנסקר"
          disabled={pending || !reviewReady}
          onConfirm={() => post(`${base}/mark-reviewed`, {}, 'הגרסה סומנה כנסקרת.')}
        />
      )}
      {status === 'REVIEWED' && (
        <Confirmed
          label="פרסום"
          question="לפרסם את הגרסה? היא תחליף את הגרסה המפורסמת הקודמת של אותה משבצת."
          confirmLabel="כן, לפרסם"
          disabled={pending}
          onConfirm={() => post(`${base}/publish`, {}, 'הגרסה פורסמה.')}
        />
      )}
      {status !== 'WITHDRAWN' && (
        <div className={styles.form}>
          <h3 className={styles.h3}>הסרת הגרסה</h3>
          <fieldset className={styles.fieldset} disabled={pending}>
            <legend className={styles.legend}>סיבה</legend>
            <label className={styles.check}>
              <input type="radio" name="withdraw-reason" checked={reason === 'TECHNICAL'} onChange={() => setReason('TECHNICAL')} />
              <span>תקלה טכנית — ההוראות הכתובות נשארות זמינות</span>
            </label>
            <label className={styles.check}>
              <input type="radio" name="withdraw-reason" checked={reason === 'SAFETY'} onChange={() => setReason('SAFETY')} />
              <span>בטיחות — משעה את הטכניקה כולה והנחיות התלויות בה מושהות</span>
            </label>
          </fieldset>
          <label className={styles.field}>
            <span>הערה (חובה)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} disabled={pending} />
          </label>
          <Confirmed
            label="הסרה"
            variant="destructive"
            question={reason === 'SAFETY' ? 'להסיר ולהשעות את הטכניקה? ההשעיה חלה על שני הווריאנטים.' : 'להסיר את הגרסה? אי אפשר להחזיר גרסה שהוסרה.'}
            confirmLabel="כן, להסיר"
            disabled={pending || note.trim().length < 3}
            onConfirm={() => post(`${base}/withdraw`, { reason, note }, 'הגרסה הוסרה.')}
          />
        </div>
      )}
      <Outcome outcome={outcome} />
    </div>
  )
}

export function TechniqueSuspension({ techniqueKey, version, suspended }: { techniqueKey: string; version: number; suspended: boolean }) {
  const { post, pending, outcome } = useAdminPost()
  const [note, setNote] = useState('')
  const action = suspended ? 'lift' : 'suspend'

  return (
    <div className={styles.form}>
      <label className={styles.field}>
        <span>{suspended ? 'הערה להסרת ההשעיה (חובה)' : 'הערה להשעיה (חובה)'}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} disabled={pending} />
      </label>
      <Confirmed
        label={suspended ? 'הסרת השעיה' : 'השעיית הטכניקה'}
        variant={suspended ? 'primary' : 'destructive'}
        question={suspended ? 'להסיר את ההשעיה? גרסאות שהוסרו לא חוזרות לפרסום.' : 'להשעות את הטכניקה (שני הווריאנטים)? הנחיות התלויות בה יושהו.'}
        confirmLabel={suspended ? 'כן, להסיר' : 'כן, להשעות'}
        disabled={pending || note.trim().length < 3}
        onConfirm={async () => {
          const ok = await post(`/api/admin/media/techniques/${techniqueKey}/${version}/${action}`, { note }, suspended ? 'ההשעיה הוסרה.' : 'הטכניקה הושעתה.')
          if (ok) setNote('')
          return ok
        }}
      />
      <Outcome outcome={outcome} />
    </div>
  )
}
