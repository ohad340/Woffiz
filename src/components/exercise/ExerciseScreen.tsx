'use client'

import { ArrowRight, Lightbulb, Lock, Timer, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { VideoUnavailable } from '@/components/media/VideoUnavailable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { TOPIC_LABELS } from '@/domain/types'
import type { ExerciseView } from '@/server/queries'
import { PracticeReport } from './PracticeReport'
import styles from './ExerciseScreen.module.css'

export function ExerciseScreen({ view }: { view: ExerciseView }) {
  const { level, content, mode } = view
  const [easierOpen, setEasierOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  if (mode === 'locked') {
    return (
      <div className={styles.screen}>
        <Link href="/map" className={styles.back}>
          <ArrowRight size={20} aria-hidden="true" />
          חזרה למפה
        </Link>
        <h1 className={styles.title}>
          שלב {level.position}: {content.title}
        </h1>
        <p className={styles.lockNote}>
          <Lock size={20} aria-hidden="true" />
          <span>השלימו את השלב הקודם כדי לפתוח</span>
        </p>
        <p>
          <strong>המטרה: </strong>
          {content.goal}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <Link href="/map" className={styles.back}>
        <ArrowRight size={20} aria-hidden="true" />
        חזרה למפה
      </Link>

      <header className={styles.header}>
        <div className={styles.meta}>
          <Badge tone={mode === 'review' ? 'success' : 'accent'}>{mode === 'review' ? 'תרגול חוזר' : TOPIC_LABELS[level.topic]}</Badge>
          <span className={styles.duration}>
            <Timer size={16} aria-hidden="true" />
            כ-{content.estimatedMinutes} דקות
          </span>
        </div>
        <h1 className={styles.title}>
          שלב {level.position}: {content.title}
        </h1>
        <p className={styles.goal}>{content.goal}</p>
      </header>

      <VideoUnavailable />

      {content.preparation.length > 0 && (
        <section aria-labelledby="prep-title" className={styles.section}>
          <h2 id="prep-title" className={styles.sectionTitle}>
            מה מכינים
          </h2>
          <ul className={styles.list}>
            {content.preparation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="steps-title" className={styles.section}>
        <h2 id="steps-title" className={styles.sectionTitle}>
          איך מתרגלים
        </h2>
        <ol className={styles.steps}>
          {content.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="criterion-title" className={styles.criterion}>
        <h2 id="criterion-title" className={styles.criterionTitle}>
          מתי זה נחשב שליטה?
        </h2>
        <p>{content.successCriterion}</p>
        <p className={styles.criterionNote}>צפייה בסרטון או דיווח על תרגול לא פותחים את השלב הבא. רק אישור שלכם שהגור שולט בתרגיל.</p>
      </section>

      {content.stopConditions.length > 0 && (
        <aside className={styles.stop} aria-label="מתי לעצור">
          <TriangleAlert size={20} aria-hidden="true" />
          <ul>
            {content.stopConditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      )}

      <div className={styles.easier}>
        <Button variant="secondary" icon={<Lightbulb size={20} aria-hidden="true" />} onClick={() => setEasierOpen(true)}>
          צריך להקל?
        </Button>
      </div>

      <div className={styles.practiceBar}>
        <Button size="cta" fullWidth onClick={() => setReportOpen(true)}>
          תרגלנו
        </Button>
      </div>

      <Sheet
        open={easierOpen}
        title={content.easierVariant.title}
        onClose={() => setEasierOpen(false)}
        footer={
          <Button variant="secondary" fullWidth onClick={() => setEasierOpen(false)}>
            חזרה לתרגיל
          </Button>
        }
      >
        <p className={styles.muted}>גרסה מוכנה מראש לתרגיל הזה. היא לא משנה את הקריטריון ולא פותחת שלב.</p>
        <ol className={styles.steps}>
          {content.easierVariant.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Sheet>

      <PracticeReport view={view} open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  )
}
