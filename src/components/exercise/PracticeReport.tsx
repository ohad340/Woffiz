'use client'

import { PartyPopper } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ChoiceGroup, type Choice } from '@/components/ui/ChoiceGroup'
import { Sheet } from '@/components/ui/Sheet'
import { newKey } from '@/lib/ids'
import type { ExerciseView } from '@/server/queries'
import styles from './PracticeReport.module.css'

type Outcome = 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING'
type Mastery = 'yes' | 'no'

const OUTCOMES: Choice[] = [
  { value: 'INDEPENDENT', label: 'הצליח לבד' },
  { value: 'WITH_HELP', label: 'הצליח עם עזרה' },
  { value: 'STRUGGLING', label: 'עדיין מתקשה' },
]

const MASTERY: Choice[] = [
  { value: 'yes', label: 'כן, שולט בתרגיל לפי הקריטריון' },
  { value: 'no', label: 'עוד לא' },
]

type SavedAttempt = { attemptId: string; outcome: Outcome; criterionVersion: number; planRevision: number }
type MasteryResult = { nextLevelId: string | null; nextPosition: number | null; planCompleted: boolean }

type Done =
  | { kind: 'practice'; outcome: Outcome; mode: 'CURRENT' | 'REVIEW' }
  | { kind: 'mastery'; result: MasteryResult }

async function post<T>(path: string, body: unknown, key?: string): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    if (response.ok) return { ok: true, data: data as T }
    return { ok: false, message: (data as { message?: string } | null)?.message ?? 'לא הצלחנו לשמור. נסו שוב.' }
  } catch {
    // Network failure: nothing was confirmed, so we must not claim anything was saved.
    return { ok: false, message: 'אין חיבור, ולכן הדיווח עוד לא נשמר. הבחירה שלכם נשארה, אפשר לנסות שוב.' }
  }
}

export function PracticeReport({ view, open, onClose }: { view: ExerciseView; open: boolean; onClose: () => void }) {
  const router = useRouter()
  const isReview = view.mode === 'review'

  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [mastery, setMastery] = useState<Mastery | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [done, setDone] = useState<Done | null>(null)

  // Retry state. A key stays with its payload so a retry after a dropped response is safe;
  // a different choice gets a new key. A saved attempt is never re-sent when only mastery failed.
  const attemptKey = useRef<{ outcome: Outcome; key: string } | null>(null)
  const masteryKey = useRef<{ attemptId: string; key: string } | null>(null)
  const savedAttempt = useRef<SavedAttempt | null>(null)

  const wantsMastery = !isReview && outcome === 'INDEPENDENT' && mastery === 'yes'
  const submitLabel = isReview ? 'שמירת תרגול חוזר' : wantsMastery ? 'אישור שליטה ושמירה' : 'שמירת תרגול'

  function pick(next: Outcome) {
    setOutcome(next)
    setFieldError(undefined)
    setError(undefined)
    if (next !== 'INDEPENDENT') setMastery(null)
  }

  async function submit() {
    if (!outcome) return setFieldError('בחרו איך היה התרגול')
    if (!isReview && outcome === 'INDEPENDENT' && !mastery) return setFieldError('בחרו אם הגור שולט בתרגיל לפי הקריטריון')

    setSaving(true)
    setError(undefined)

    let attempt = savedAttempt.current && savedAttempt.current.outcome === outcome ? savedAttempt.current : null
    if (!attempt) {
      if (attemptKey.current?.outcome !== outcome) attemptKey.current = { outcome, key: newKey() }
      const res = await post<SavedAttempt & { mode: 'CURRENT' | 'REVIEW' }>(
        '/api/attempts',
        { levelId: view.level.id, outcome },
        attemptKey.current.key,
      )
      if (!res.ok) {
        setSaving(false)
        return setError(res.message)
      }
      attempt = { attemptId: res.data.attemptId, outcome, criterionVersion: res.data.criterionVersion, planRevision: res.data.planRevision }
      savedAttempt.current = attempt
    }

    if (!wantsMastery) {
      setSaving(false)
      setDone({ kind: 'practice', outcome, mode: isReview ? 'REVIEW' : 'CURRENT' })
      router.refresh()
      return
    }

    if (masteryKey.current?.attemptId !== attempt.attemptId) masteryKey.current = { attemptId: attempt.attemptId, key: newKey() }
    const res = await post<MasteryResult>(
      '/api/mastery',
      {
        levelId: view.level.id,
        attemptId: attempt.attemptId,
        criterionVersion: attempt.criterionVersion,
        planRevision: attempt.planRevision,
      },
      masteryKey.current.key,
    )
    setSaving(false)
    if (!res.ok) return setError(res.message)
    // Only now, with the server's confirmation, do we show the unlock.
    setDone({ kind: 'mastery', result: res.data })
    router.refresh()
  }

  function close() {
    onClose()
    if (done) {
      setDone(null)
      setOutcome(null)
      setMastery(null)
      savedAttempt.current = null
      attemptKey.current = null
      masteryKey.current = null
    }
  }

  return (
    <Sheet
      open={open}
      title={done ? (done.kind === 'mastery' ? 'כל הכבוד!' : 'התרגול נשמר') : 'איך היה התרגול?'}
      onClose={close}
      footer={
        done ? (
          <DoneActions done={done} onClose={close} />
        ) : (
          <>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <Button size="cta" fullWidth loading={saving} loadingLabel="שומרים…" onClick={submit}>
              {submitLabel}
            </Button>
            <Button variant="ghost" fullWidth onClick={close} disabled={saving}>
              ביטול
            </Button>
          </>
        )
      }
    >
      {done ? (
        <DoneMessage done={done} />
      ) : (
        <>
          {isReview && <p className={styles.note}>תרגול חוזר לא משנה את ההתקדמות במסלול.</p>}
          <ChoiceGroup
            legend="איך היה?"
            options={OUTCOMES}
            value={outcome}
            error={outcome === null ? fieldError : undefined}
            onChange={(v) => pick(v as Outcome)}
          />
          {!isReview && outcome === 'INDEPENDENT' && (
            <div className={styles.criterion}>
              <h3 className={styles.criterionTitle}>הקריטריון לשליטה</h3>
              <p>{view.content.successCriterion}</p>
              <ChoiceGroup
                legend="הגור שולט בתרגיל לפי הקריטריון?"
                hint="רק אישור כזה פותח את השלב הבא."
                options={MASTERY}
                value={mastery}
                error={fieldError && outcome !== null ? fieldError : undefined}
                onChange={(v) => {
                  setMastery(v as Mastery)
                  setFieldError(undefined)
                }}
              />
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

function DoneMessage({ done }: { done: Done }) {
  if (done.kind === 'mastery') {
    const { result } = done
    return (
      <div className={styles.celebrate} role="status">
        <span className={styles.celebrateIcon} aria-hidden="true">
          <PartyPopper size={36} />
        </span>
        <p className={styles.celebrateTitle}>
          {result.planCompleted ? 'סיימתם את כל השלבים בתוכנית' : `שלב ${result.nextPosition} נפתח`}
        </p>
        <p>
          {result.planCompleted
            ? 'אפשר להמשיך לתרגל כל שלב שהושלם.'
            : 'השלמתם את השלב לפי הדיווח שלכם. אפשר להמשיך לשלב הבא או לחזור למפה.'}
        </p>
      </div>
    )
  }
  if (done.mode === 'REVIEW') {
    return (
      <p role="status" className={styles.doneText}>
        התרגול החוזר נשמר. זה לא משנה את ההתקדמות במסלול.
      </p>
    )
  }
  return (
    <p role="status" className={styles.doneText}>
      {done.outcome === 'STRUGGLING'
        ? 'זה בסדר גמור. חוזרים על זה עוד קצת, ואפשר לנסות את הגרסה הקלה. השלב נשאר פתוח.'
        : 'התרגול נשמר. השלב הנוכחי נשאר פתוח עד שתאשרו שהגור שולט בתרגיל.'}
    </p>
  )
}

function DoneActions({ done, onClose }: { done: Done; onClose: () => void }) {
  if (done.kind === 'mastery') {
    const { result } = done
    return (
      <>
        {result.nextLevelId ? (
          <Button href={`/exercise/${result.nextLevelId}`} size="cta" fullWidth>
            לשלב הבא
          </Button>
        ) : (
          <Button href="/complete" size="cta" fullWidth>
            לסיכום המסלול
          </Button>
        )}
        <Link href="/map" className={styles.link}>
          חזרה למפה
        </Link>
      </>
    )
  }
  return (
    <>
      <Button size="cta" fullWidth onClick={onClose}>
        חזרה לתרגיל
      </Button>
      <Link href="/map" className={styles.link}>
        חזרה למפה
      </Link>
    </>
  )
}
