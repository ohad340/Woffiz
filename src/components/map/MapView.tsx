'use client'

import { Check, Lock, Timer } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { findCurrentIndex, isPathComplete } from '@/domain/path'
import { LEVEL_STATE_LABELS, TOPIC_LABELS, type Level, type Puppy } from '@/domain/types'
import styles from './MapView.module.css'

/**
 * The painted map shows one stretch of the trail: eight places along the path, bottom to top.
 * Slot centers are pixel positions in the 521x1415 artwork. Real level nodes sit on those places
 * (covering the artwork's own markers), and the window slides along the plan.
 */
const MAP_W = 521
const MAP_H = 1415
const SLOTS = [
  [305, 1218],
  [403, 1095],
  [355, 968],
  [255, 860],
  [278, 727],
  [205, 575],
  [251, 452],
  [310, 333],
] as const
const WINDOW = SLOTS.length
const STEP = WINDOW / 2

/** Completed medallions rotate through game colors (decorative only). */
const MEDAL_TONES = ['green', 'blue', 'purple'] as const

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export function MapView({ puppy, levels }: { puppy: Puppy; levels: Level[] }) {
  const currentIndex = findCurrentIndex(levels)
  const current = currentIndex === -1 ? undefined : levels[currentIndex]
  const maxStart = Math.max(0, levels.length - WINDOW)

  // Start so the current level lands in the middle of the artwork.
  const [start, setStart] = useState(() => clamp((currentIndex === -1 ? levels.length - 1 : currentIndex) - 3, 0, maxStart))
  const [openId, setOpenId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const currentRef = useRef<HTMLLIElement>(null)

  const complete = isPathComplete(levels)
  const completedCount = levels.filter((level) => level.state === 'completed').length
  const visible = levels.slice(start, start + WINDOW)
  const openLevel = levels.find((level) => level.id === openId)

  // Bring the frontier into view on arrival without moving keyboard focus.
  useEffect(() => {
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    currentRef.current?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  const move = (direction: 'earlier' | 'later') => {
    const next = clamp(start + (direction === 'earlier' ? -STEP : STEP), 0, maxStart)
    setStart(next)
    const last = Math.min(next + WINDOW, levels.length)
    setAnnouncement(`מוצגים שלבים ${next + 1} עד ${last}`)
  }

  return (
    <div className={styles.view}>
      <div className={styles.map}>
        <Image
          className={styles.mapArt}
          src="/art/map-painted.webp"
          alt=""
          aria-hidden="true"
          width={1042}
          height={2830}
          unoptimized
          priority
        />
        <h1 className="visually-hidden">מפת האילוף</h1>
        <p className="visually-hidden">
          {complete
            ? `כל השלבים של ${puppy.name} הושלמו`
            : `${completedCount} מתוך ${levels.length} שלבים הושלמו. השלב הנוכחי: ${current?.position}, ${current?.title}.`}
        </p>
        {/* Real control laid over the matching spot in the artwork. */}
        <Link href="/home" className={styles.back} aria-label="חזרה לבית" />

        {/* Places beyond the end of a short plan: cover the artwork's own markers. */}
        {SLOTS.slice(visible.length).map(([x, y]) => (
          <span
            key={`${x}-${y}`}
            className={styles.emptySlot}
            style={{ left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%` }}
            aria-hidden="true"
          />
        ))}

        <ol className={styles.slots}>
          {visible.map((level, i) => {
            const [x, y] = SLOTS[i]!
            const isCurrent = level.state === 'current'
            return (
              <li
                key={level.id}
                ref={isCurrent ? currentRef : undefined}
                className={styles.slot}
                style={{ left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%` }}
                data-state={level.state}
                data-tone={level.state === 'completed' ? MEDAL_TONES[(start + i) % MEDAL_TONES.length] : undefined}
              >
                <button
                  type="button"
                  className={styles.node}
                  onClick={() => setOpenId(level.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span className={styles.circle}>
                    {level.state !== 'locked' && <span aria-hidden="true">{level.position}</span>}
                    {level.state === 'completed' && (
                      <span className={styles.stateIcon} aria-hidden="true">
                        <Check size={12} strokeWidth={3.5} />
                      </span>
                    )}
                  </span>
                  <span className={styles.plaque} aria-hidden="true">
                    שלב {level.position}
                  </span>
                  <span className="visually-hidden">
                    שלב {level.position}: {level.title}. {TOPIC_LABELS[level.topic]}, {LEVEL_STATE_LABELS[level.state]}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {levels.length > WINDOW && (
        <div className={styles.pager}>
          <Button variant="secondary" disabled={start === 0} onClick={() => move('earlier')}>
            הצגת שלבים קודמים
          </Button>
          <Button variant="secondary" disabled={start >= maxStart} onClick={() => move('later')}>
            הצגת שלבים הבאים
          </Button>
        </div>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

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
      <div className={styles.criterion}>
        <h3 className={styles.criterionTitle}>מתי זה נחשב שליטה?</h3>
        <p>{level.masteryCriterion}</p>
      </div>
      <Button href={`/exercise/${level.id}`} size="cta" fullWidth>
        {level.state === 'completed' ? 'תרגול חוזר' : 'פתיחת התרגיל'}
      </Button>
    </>
  )
}
