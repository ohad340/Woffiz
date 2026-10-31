'use client'

import { ArrowRight, Check, Lock, Timer } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bridge, Bush, Flowers, Pine, River, Rock, RoundTree, Trophy } from '@/components/art/Decor'
import { Mascot, SpeechBubble } from '@/components/art/Mascot'
import { WoodSign } from '@/components/art/WoodSign'
import { VideoUnavailable } from '@/components/media/VideoUnavailable'
import { Badge } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { expandWindow, findCurrentIndex, initialWindow, isPathComplete, type PathWindow } from '@/domain/path'
import { LEVEL_STATE_LABELS, TOPIC_LABELS, type Level, type Puppy } from '@/domain/types'
import styles from './MapView.module.css'

/** Inline-start offsets (percent of path width) giving the winding shape. */
const OFFSETS = [50, 70, 50, 30] as const
const offsetAt = (index: number) => OFFSETS[index % OFFSETS.length]!

/** Completed medallions rotate through warm game colors (decorative only). */
const MEDAL_TONES = ['gold', 'blue', 'green'] as const

/** Scenery rotates with the row so each stretch of the trail looks different. */
function RowDecor({ index, hideStart, hideEnd }: { index: number; hideStart: boolean; hideEnd: boolean }) {
  const pattern = index % 4
  const d = styles.deco
  return (
    <div className={styles.decor} aria-hidden="true">
      {pattern === 0 && (
        <>
          {!hideStart && <Flowers className={`${d} ${styles.decoStart} ${styles.low}`} />}
          {!hideEnd && <Bush className={`${d} ${styles.decoEndNear} ${styles.low}`} />}
        </>
      )}
      {pattern === 1 && !hideStart && (
        <>
          <RoundTree className={`${d} ${styles.decoStart} ${styles.tall}`} />
          <Pine className={`${d} ${styles.decoStartFar} ${styles.tallSmall}`} />
        </>
      )}
      {pattern === 2 && (
        <>
          {!hideStart && <Rock className={`${d} ${styles.decoStart} ${styles.low}`} />}
          {!hideEnd && <Flowers className={`${d} ${styles.decoEndNear} ${styles.low}`} />}
        </>
      )}
      {pattern === 3 && !hideEnd && (
        <>
          <Pine className={`${d} ${styles.decoEndNear} ${styles.tall}`} />
          <Bridge className={`${d} ${styles.bridge}`} />
        </>
      )}
    </div>
  )
}

export function MapView({
  puppy,
  levels,
  openCurrent = false,
}: {
  puppy: Puppy
  levels: Level[]
  openCurrent?: boolean
}) {
  const currentIndex = findCurrentIndex(levels)
  const current = currentIndex === -1 ? undefined : levels[currentIndex]

  const [window, setWindow] = useState<PathWindow>(() => initialWindow(levels))
  const [openId, setOpenId] = useState<string | null>(openCurrent && current ? current.id : null)
  const [announcement, setAnnouncement] = useState('')
  const currentRef = useRef<HTMLLIElement>(null)

  const complete = isPathComplete(levels)
  const completedCount = levels.filter((level) => level.state === 'completed').length
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
        <Link href="/home" className={styles.back} aria-label="חזרה לבית">
          <ArrowRight size={24} strokeWidth={3} aria-hidden="true" />
        </Link>
        <WoodSign hanging as="h1" className={styles.title}>
          מפת האימון
        </WoodSign>
        <p className="visually-hidden">
          {complete
            ? `כל השלבים של ${puppy.name} הושלמו`
            : `${completedCount} מתוך ${levels.length} שלבים הושלמו. השלב הנוכחי: ${current?.position}, ${current?.title}.`}
        </p>
      </header>

      {/* The trail climbs: level 1 at the bottom, the goal at the top. DOM order stays 1 → n. */}
      <section className={styles.landscape} aria-labelledby="path-title">
        <h2 id="path-title" className="visually-hidden">
          מסלול האימון
        </h2>
        <River className={styles.river} />

        {window.start > 0 && (
          <div className={styles.more}>
            <Button variant="secondary" onClick={() => expand('earlier')}>
              הצגת שלבים קודמים ({window.start})
            </Button>
          </div>
        )}

        {window.start === 0 && (
          <div className={styles.start} aria-hidden="true">
            <Rock className={styles.startRock} />
            <Mascot pose="back" className={styles.startPup} />
          </div>
        )}

        <ol className={styles.path}>
          {visible.map((level, i) => {
            const index = window.start + i
            const prev = i > 0 ? visible[i - 1] : undefined
            const x = offsetAt(index)
            const isCurrent = level.state === 'current'
            const mascotSide = x >= 50 ? 'start' : 'end'
            // The trail segment from this node down to the previous level.
            const from = 100 - x
            const to = 100 - offsetAt(index - 1)
            return (
              <li
                key={level.id}
                ref={isCurrent ? currentRef : undefined}
                className={styles.step}
                style={{ '--x': x } as React.CSSProperties}
                data-state={level.state}
                data-tone={level.state === 'completed' ? MEDAL_TONES[index % MEDAL_TONES.length] : undefined}
              >
                <RowDecor
                  index={index}
                  hideStart={isCurrent && mascotSide === 'start'}
                  hideEnd={isCurrent && mascotSide === 'end'}
                />
                {prev && (
                  <svg
                    className={styles.connector}
                    data-done={prev.state === 'completed' || undefined}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    {['trackEdge', 'track', 'trackDots'].map((cls) => (
                      <path
                        key={cls}
                        className={styles[cls]}
                        d={`M ${from} 0 C ${from} 55, ${to} 45, ${to} 100`}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </svg>
                )}
                {isCurrent && (
                  <div className={styles.guide} data-side={mascotSide} aria-hidden="true">
                    <SpeechBubble className={styles.guideBubble}>
                      מעולה!
                      <br />
                      בואו נמשיך
                    </SpeechBubble>
                    <Mascot pose="sit" className={styles.guideMascot} />
                  </div>
                )}
                <button
                  type="button"
                  className={styles.node}
                  onClick={() => setOpenId(level.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className={styles.circle}>
                    {level.state === 'locked' ? (
                      <Lock size={30} strokeWidth={2.8} aria-hidden="true" />
                    ) : (
                      <span aria-hidden="true">{level.position}</span>
                    )}
                    {level.state === 'completed' && (
                      <span className={styles.stateIcon} aria-hidden="true">
                        <Check size={14} strokeWidth={3.5} />
                      </span>
                    )}
                  </span>
                  <span className={styles.label}>
                    <span className={styles.levelNo}>שלב {level.position}</span>
                    <span className={styles.levelTitle}>{level.title}</span>
                    <span className="visually-hidden">
                      {' '}
                      {TOPIC_LABELS[level.topic]}, {LEVEL_STATE_LABELS[level.state]}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {window.end === levels.length && (
          <div className={styles.goal} aria-hidden="true">
            <Trophy className={styles.trophy} />
            <span className={styles.pedestal} />
          </div>
        )}

        {window.end < levels.length && (
          <div className={styles.more}>
            <Button variant="secondary" onClick={() => expand('later')}>
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
