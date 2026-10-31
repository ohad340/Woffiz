'use client'

import { Check, Lock, PawPrint, Timer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { VideoUnavailable } from '@/components/media/VideoUnavailable'
import { Badge, Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { expandWindow, findCurrentIndex, initialWindow, isPathComplete, type PathWindow } from '@/domain/path'
import { LEVEL_STATE_LABELS, TOPIC_LABELS, type Level, type Puppy } from '@/domain/types'
import styles from './MapView.module.css'

/** Inline-start offsets (percent of path width) giving the winding shape. */
const OFFSETS = [50, 74, 50, 26] as const
const offsetAt = (index: number) => OFFSETS[index % OFFSETS.length]!

const STATE_ICONS = { completed: Check, current: PawPrint, locked: Lock } as const

export function MapView({ puppy, levels }: { puppy: Puppy; levels: Level[] }) {
  const [window, setWindow] = useState<PathWindow>(() => initialWindow(levels))
  const [openId, setOpenId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const currentRef = useRef<HTMLLIElement>(null)

  const currentIndex = findCurrentIndex(levels)
  const current = currentIndex === -1 ? undefined : levels[currentIndex]
  const complete = isPathComplete(levels)
  const visible = useMemo(() => levels.slice(window.start, window.end), [levels, window])
  const openLevel = levels.find((level) => level.id === openId)

  // Bring the frontier into view on arrival without moving keyboard focus.
  useEffect(() => {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    currentRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  const expand = (direction: 'earlier' | 'later') => {
    const next = expandWindow(window, levels.length, direction)
    const added = direction === 'earlier' ? window.start - next.start : next.end - window.end
    setWindow(next)
    setAnnouncement(`נוספו ${added} שלבים ${direction === 'earlier' ? 'קודמים' : 'הבאים'}`)
  }

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          <PawPrint size={24} />
        </span>
        <div>
          <h1 className={styles.puppyName}>{puppy.name}</h1>
          <p className={styles.puppyMeta}>
            {complete ? 'כל השלבים בתוכנית הושלמו' : `שלב ${current?.position} מתוך ${levels.length}`}
          </p>
        </div>
      </header>

      {current && (
        <Card className={styles.summary} aria-labelledby="current-summary-title">
          <div className={styles.summaryMeta}>
            <Badge tone="accent">{TOPIC_LABELS[current.topic]}</Badge>
            <span className={styles.duration}>
              <Timer size={16} aria-hidden="true" />
              כ-{current.estimatedMinutes} דקות
            </span>
          </div>
          <h2 id="current-summary-title" className={styles.summaryTitle}>
            {current.title}
          </h2>
          <p className={styles.summaryGoal}>{current.goal}</p>
          <Button size="cta" fullWidth onClick={() => setOpenId(current.id)}>
            ממשיכים לתרגל
          </Button>
        </Card>
      )}

      {complete && (
        <Card className={styles.summary}>
          <h2 className={styles.summaryTitle}>סיימתם את כל השלבים בתוכנית</h2>
          <p className={styles.summaryGoal}>אפשר להמשיך לתרגל כל שלב שהושלם.</p>
          <Button href="/review" size="cta" fullWidth>
            חוזרים לתרגל
          </Button>
        </Card>
      )}

      <section className={styles.pathSection} aria-labelledby="path-title">
        <h2 id="path-title" className="visually-hidden">
          מסלול האימון
        </h2>

        {window.start > 0 && (
          <div className={styles.more}>
            <Button variant="ghost" onClick={() => expand('earlier')}>
              הצגת שלבים קודמים ({window.start})
            </Button>
          </div>
        )}

        <ol className={styles.path}>
          {visible.map((level, i) => {
            const index = window.start + i
            const next = visible[i + 1]
            const Icon = STATE_ICONS[level.state]
            const from = 100 - offsetAt(index)
            const to = 100 - offsetAt(index + 1)
            return (
              <li
                key={level.id}
                ref={level.state === 'current' ? currentRef : undefined}
                className={styles.step}
                style={{ '--x': offsetAt(index) } as React.CSSProperties}
                data-state={level.state}
              >
                {next && (
                  <svg
                    className={styles.connector}
                    data-done={level.state === 'completed' || undefined}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d={`M ${from} 0 C ${from} 55, ${to} 45, ${to} 100`} vectorEffect="non-scaling-stroke" />
                  </svg>
                )}
                <button
                  type="button"
                  className={styles.node}
                  onClick={() => setOpenId(level.id)}
                  aria-current={level.state === 'current' ? 'step' : undefined}
                >
                  <span className={styles.circle}>
                    <span className="visually-hidden">שלב </span>
                    {level.position}
                    <span className={styles.stateIcon} aria-hidden="true">
                      <Icon size={14} strokeWidth={3} />
                    </span>
                  </span>
                  <span className={styles.label}>
                    <span className={styles.title}>{level.title}</span>
                    <span className={styles.topic}>
                      {TOPIC_LABELS[level.topic]} · {LEVEL_STATE_LABELS[level.state]}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {window.end < levels.length && (
          <div className={styles.more}>
            <Button variant="ghost" onClick={() => expand('later')}>
              הצגת שלבים נוספים ({levels.length - window.end})
            </Button>
          </div>
        )}

        <p className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>
      </section>

      <Sheet
        open={Boolean(openLevel)}
        title={openLevel ? `שלב ${openLevel.position}: ${openLevel.title}` : ''}
        onClose={() => setOpenId(null)}
        footer={
          <Button variant="secondary" fullWidth onClick={() => setOpenId(null)}>
            חזרה למפה
          </Button>
        }
      >
        {openLevel && <LevelDetails level={openLevel} />}
      </Sheet>
    </div>
  )
}

function LevelDetails({ level }: { level: Level }) {
  if (level.state === 'locked') {
    return (
      <>
        <p className={styles.lockNote}>
          <Lock size={20} aria-hidden="true" />
          <span>השלימו את השלב הקודם כדי לפתוח</span>
        </p>
        <p>
          <strong>המטרה: </strong>
          {level.goal}
        </p>
      </>
    )
  }

  return (
    <>
      <div className={styles.summaryMeta}>
        <Badge tone={level.state === 'completed' ? 'success' : 'accent'}>
          {level.state === 'completed' ? 'תרגול חוזר' : TOPIC_LABELS[level.topic]}
        </Badge>
        <span className={styles.duration}>
          <Timer size={16} aria-hidden="true" />
          כ-{level.estimatedMinutes} דקות
        </span>
      </div>
      <p>
        <strong>המטרה: </strong>
        {level.goal}
      </p>
      <VideoUnavailable />
      <div className={styles.criterion}>
        <h3 className={styles.criterionTitle}>מתי זה נחשב שליטה?</h3>
        <p>{level.masteryCriterion}</p>
      </div>
      <p className={styles.phaseNote}>
        {level.state === 'completed'
          ? 'תרגול חוזר לא משנה את ההתקדמות במסלול. מסך התרגול המלא יתווסף בשלב הפיתוח הבא.'
          : 'מסך התרגיל המלא והדיווח על תרגול יתווספו בשלב הפיתוח הבא.'}
      </p>
    </>
  )
}
