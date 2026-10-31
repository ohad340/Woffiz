'use client'

import { ArrowRight, Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Mascot, SpeechBubble } from '@/components/art/Mascot'
import { Button } from '@/components/ui/Button'
import { Card, Skeleton } from '@/components/ui/Card'
import { ChoiceGroup, type Choice } from '@/components/ui/ChoiceGroup'
import { TextArea, TextField } from '@/components/ui/Field'
import { StateMessage } from '@/components/ui/StateMessage'
import styles from './OnboardingFlow.module.css'

const AGE_OPTIONS: Choice[] = [
  { value: 'under-10w', label: 'עד 10 שבועות' },
  { value: '10-16w', label: '10–16 שבועות' },
  { value: '4-6m', label: '4–6 חודשים' },
  { value: 'over-6m', label: 'מעל 6 חודשים' },
  { value: 'unsure', label: 'לא בטוחים' },
]

const SKILL_OPTIONS: Choice[] = [
  { value: 'name', label: 'מגיב לשם שלו' },
  { value: 'sit', label: 'יושב כשמבקשים' },
  { value: 'come', label: 'מגיע כשקוראים לו' },
  { value: 'bed', label: 'נכנס לפינת השינה' },
  { value: 'unsure', label: 'לא בטוחים / עוד לא' },
]

const DIFFICULTY_OPTIONS: Choice[] = [
  { value: 'toilet', label: 'צרכים בבית' },
  { value: 'biting', label: 'נשיכות' },
  { value: 'sleep', label: 'שינה בלילה' },
  { value: 'alone', label: 'הישארות לבד' },
  { value: 'commands', label: 'הקשבה לפקודות' },
]

const TIME_OPTIONS: Choice[] = [
  { value: '5', label: 'עד 5 דקות ביום' },
  { value: '10', label: 'כ-10 דקות ביום' },
  { value: '15', label: '15 דקות ויותר ביום' },
]

export type Draft = {
  name: string
  age: string | null
  skills: string[]
  difficulties: string[]
  limitations: string
  time: string | null
}

const STEPS = ['הגור', 'מה הוא כבר יודע', 'מה קשה', 'זמן ומגבלות', 'סיכום'] as const
const GUIDE_LINES = ['ספרו לי על הגור שלכם!', 'כל דבר קטן נחשב!', 'לא נורא, נעבוד על זה יחד.', 'גם 5 דקות ביום זה מעולה.', 'כמעט סיימנו!'] as const

function labelsFor(options: Choice[], values: readonly string[]) {
  const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label)
  return labels.length ? labels.join(', ') : 'לא צוין'
}

type PreviewState = 'generating' | 'generation-error' | null

export function OnboardingFlow({
  previewState,
  initial,
}: {
  previewState: PreviewState
  /** Answers and step restored from the server, so a refresh or a new device continues where you left off. */
  initial: { answers: Draft; step: number }
}) {
  const router = useRouter()
  const [step, setStep] = useState(initial.step)
  const [draft, setDraft] = useState<Draft>(initial.answers)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>()
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // Step change is navigation: move focus to the new step heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const validate = (index: number) => {
    const next: typeof errors = {}
    if (index === 0) {
      if (!draft.name.trim()) next.name = 'כתבו את שם הגור'
      if (!draft.age) next.age = 'בחרו גיל משוער, או "לא בטוחים"'
    }
    if (index === 3 && !draft.time) next.time = 'בחרו כמה זמן יש לכם לתרגל'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  /** POSTs JSON with the same-origin cookie. Returns an error message, or null on success. */
  async function post(path: string, body: unknown): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.ok) return null
      const data = (await response.json().catch(() => null)) as { message?: string } | null
      return data?.message ?? 'לא הצלחנו לשמור. נסו שוב.'
    } catch {
      return 'אין חיבור. התשובות נשארו במסך, אפשר לנסות שוב.'
    }
  }

  // Each step is saved on the server before moving on; a failure keeps every answer in place.
  const submitStep = async () => {
    if (!validate(step)) return
    setSaving(true)
    setSaveError(undefined)
    if (isSummary) {
      const failure = await post('/api/onboarding/complete', {})
      setSaving(false)
      if (failure) return setSaveError(failure)
      router.push('/home')
      router.refresh()
      return
    }
    const nextStep = Math.min(step + 1, STEPS.length - 1)
    const failure = await post('/api/onboarding/draft', { step: nextStep, answers: draft })
    setSaving(false)
    if (failure) return setSaveError(failure)
    setStep(nextStep)
  }

  if (previewState === 'generating') {
    return (
      <main id="main" className={styles.main} tabIndex={-1}>
        <Card className={styles.stack}>
          <h1 className={styles.heading}>מכינים את תוכנית האימון</h1>
          <p className={styles.muted}>זה יכול לקחת עד דקה. התשובות שלכם כבר שמורות.</p>
          <Skeleton lines={4} label="מכינים את התוכנית…" />
          <p className={styles.devNote}>תצוגה מקדימה של מצב הטעינה. בשלב 0 לא נוצרת תוכנית.</p>
        </Card>
      </main>
    )
  }

  if (previewState === 'generation-error') {
    return (
      <main id="main" className={styles.main} tabIndex={-1}>
        <StateMessage
          kind="error"
          headingLevel="h1"
          title="לא הצלחנו להכין את התוכנית"
          action={
            <Button size="cta" onClick={() => router.push('/onboarding?state=generating')}>
              ניסיון חוזר
            </Button>
          }
        >
          התשובות שלכם שמורות ואין צורך למלא אותן שוב.
        </StateMessage>
      </main>
    )
  }

  const isSummary = step === STEPS.length - 1

  return (
    <main id="main" className={styles.main} tabIndex={-1}>
      <div className={styles.topBar}>
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} icon={<ArrowRight size={20} aria-hidden="true" />}>
            חזרה
          </Button>
        ) : (
          <Button variant="ghost" href="/" icon={<ArrowRight size={20} aria-hidden="true" />}>
            חזרה
          </Button>
        )}
        <p className={styles.progressText}>
          שלב {step + 1} מתוך {STEPS.length}
        </p>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <span style={{ inlineSize: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      <div className={styles.guide} aria-hidden="true">
        <Mascot className={styles.guideMascot} />
        <SpeechBubble className={styles.guideBubble}>{GUIDE_LINES[step]}</SpeechBubble>
      </div>

      <form
        className={styles.stack}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submitStep()
        }}
      >
        <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>
          {isSummary ? 'בדקו שהכול נכון' : STEPS[step]}
        </h1>

        {step === 0 && (
          <>
            <TextField
              label="איך קוראים לגור?"
              value={draft.name}
              maxLength={40}
              autoComplete="off"
              error={errors.name}
              onChange={(e) => update('name', e.target.value)}
              onBlur={() => {
                if (!draft.name.trim()) setErrors((e) => ({ ...e, name: 'כתבו את שם הגור' }))
              }}
            />
            <ChoiceGroup
              legend="בן כמה הוא בערך?"
              hint="אין צורך בתאריך מדויק."
              options={AGE_OPTIONS}
              value={draft.age}
              error={errors.age}
              onChange={(v) => update('age', v)}
            />
          </>
        )}

        {step === 1 && (
          <ChoiceGroup
            multiple
            legend="מה הגור כבר יודע לעשות?"
            hint="אפשר לבחור כמה תשובות, או לדלג."
            options={SKILL_OPTIONS}
            value={draft.skills}
            onChange={(v) => update('skills', v)}
          />
        )}

        {step === 2 && (
          <ChoiceGroup
            multiple
            legend="במה הכי קשה לכם עכשיו?"
            hint="נשתמש בזה כדי לסדר את המסלול. אפשר לבחור כמה תשובות."
            options={DIFFICULTY_OPTIONS}
            value={draft.difficulties}
            onChange={(v) => update('difficulties', v)}
          />
        )}

        {step === 3 && (
          <>
            <ChoiceGroup
              legend="כמה זמן יש לכם לתרגל?"
              options={TIME_OPTIONS}
              value={draft.time}
              error={errors.time}
              onChange={(v) => update('time', v)}
            />
            <TextArea
              label="משהו שחשוב שנדע?"
              optional
              helper="למשל: מגבלה רפואית, פחד מרעשים, אין חצר. זה לא תחליף לייעוץ וטרינרי."
              maxLength={300}
              value={draft.limitations}
              onChange={(e) => update('limitations', e.target.value)}
            />
          </>
        )}

        {isSummary && (
          <>
            <dl className={styles.summary}>
              {[
                { step: 0, term: 'שם וגיל', value: `${draft.name || 'לא צוין'} · ${labelsFor(AGE_OPTIONS, draft.age ? [draft.age] : [])}` },
                { step: 1, term: 'מה הוא כבר יודע', value: labelsFor(SKILL_OPTIONS, draft.skills) },
                { step: 2, term: 'מה קשה', value: labelsFor(DIFFICULTY_OPTIONS, draft.difficulties) },
                {
                  step: 3,
                  term: 'זמן ומגבלות',
                  value: [labelsFor(TIME_OPTIONS, draft.time ? [draft.time] : []), draft.limitations.trim()]
                    .filter(Boolean)
                    .join(' · '),
                },
              ].map((row) => (
                <div key={row.step} className={styles.summaryRow}>
                  <div>
                    <dt className={styles.summaryTerm}>{row.term}</dt>
                    <dd className={styles.summaryValue}>{row.value}</dd>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setStep(row.step)}
                    icon={<Pencil size={18} aria-hidden="true" />}
                    aria-label={`עריכת ${row.term}`}
                  >
                    עריכה
                  </Button>
                </div>
              ))}
            </dl>
            <p className={styles.devNote}>בשלב הפיתוח המסלול הוא מסלול הדגמה קבוע, לא תוכנית אישית.</p>
          </>
        )}

        <div className={styles.footer}>
          {saveError && (
            <p className={styles.saveError} role="alert">
              {saveError}
            </p>
          )}
          <Button type="submit" size="cta" fullWidth loading={saving} loadingLabel={isSummary ? 'מכינים את המסלול…' : 'שומרים…'}>
            {isSummary ? 'מכינים את המסלול' : 'המשך'}
          </Button>
        </div>
      </form>
    </main>
  )
}
