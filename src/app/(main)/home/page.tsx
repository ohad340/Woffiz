import type { Metadata } from 'next'
import { ChevronLeft, Dog, Map, PawPrint, Play, RotateCcw, Timer } from 'lucide-react'
import Link from 'next/link'
import { HeroScene } from '@/components/art/HeroScene'
import { Mascot } from '@/components/art/Mascot'
import { Button } from '@/components/ui/Button'
import { requireOverview } from '@/server/queries'
import { requireUserOrRedirect } from '@/server/session'
import styles from './home.module.css'

export const metadata: Metadata = { title: 'בית' }

type Tile = {
  href: string
  title: string
  meta: string
  tone: 'green' | 'purple' | 'orange' | 'blue'
  Icon: typeof Map
  progress?: number
}

export default async function HomePage() {
  const user = await requireUserOrRedirect()
  const overview = await requireOverview(user.id)
  const { completed, current, puppy } = overview
  const total = overview.levels.length

  const tiles: Tile[] = [
    {
      href: '/map',
      title: 'מפת המסע',
      meta: `${completed}/${total} שלבים`,
      tone: 'green',
      Icon: Map,
      progress: completed / total,
    },
    { href: '/review', title: 'חזרה', meta: `${completed} שלבים לתרגול`, tone: 'purple', Icon: RotateCcw },
    ...(current
      ? [
          {
            href: `/exercise/${current.id}`,
            title: 'האימון של היום',
            meta: `${current.title} · כ-${current.estimatedMinutes} דק׳`,
            tone: 'orange' as const,
            Icon: Timer,
          },
        ]
      : []),
    { href: '/puppy', title: 'הגור שלי', meta: puppy.name, tone: 'blue', Icon: Dog },
  ]

  return (
    <div className={styles.home}>
      <HeroScene
        labelledBy="home-title"
        top={
          <div className={styles.topRow}>
            <div className={styles.profile}>
              <span className={styles.avatar}>
                <Mascot />
              </span>
              <div>
                <p className={styles.puppyName}>{puppy.name}</p>
                <p className={styles.puppyMeta}>
                  {current ? `שלב ${current.position} · ${puppy.ageLabel}` : 'כל השלבים הושלמו'}
                </p>
              </div>
            </div>
            <p className={styles.chip}>
              <span className={styles.chipIcon} aria-hidden="true">
                <PawPrint size={16} strokeWidth={2.6} />
              </span>
              <span aria-hidden="true">
                {completed}/{total}
              </span>
              <span className="visually-hidden">
                {completed} מתוך {total} שלבים הושלמו
              </span>
            </p>
          </div>
        }
      >
        <h1 id="home-title">איזה כיף שחזרתם!</h1>
        <p>ממשיכים במסע האימון של {puppy.name}</p>
      </HeroScene>

      <div className={styles.ctaWrap}>
        {current ? (
          <Button
            href={`/exercise/${current.id}`}
            size="cta"
            fullWidth
            icon={<Play size={24} fill="currentColor" aria-hidden="true" />}
          >
            המשך לאימון
          </Button>
        ) : (
          <Button href="/review" size="cta" fullWidth>
            חוזרים לתרגל
          </Button>
        )}
      </div>

      <nav aria-label="קיצורי דרך" className={styles.sheet}>
        <ul className={styles.tiles}>
          {tiles.map(({ href, title, meta, tone, Icon, progress }) => (
            <li key={title}>
              <Link href={href} className={styles.tile} data-tone={tone}>
                <span className={styles.tileArt} aria-hidden="true">
                  <Mascot className={styles.tileMascot} />
                  <span className={styles.tileBadge}>
                    <Icon size={18} strokeWidth={2.6} />
                  </span>
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  <ChevronLeft size={18} strokeWidth={3} />
                </span>
                <span className={styles.tileTitle}>{title}</span>
                <span className={styles.tileMeta}>{meta}</span>
                {progress !== undefined && (
                  <span className={styles.bar} aria-hidden="true">
                    <span style={{ inlineSize: `${Math.round(progress * 100)}%` }} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
