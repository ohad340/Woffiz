import Image from 'next/image'
import styles from './HeroScene.module.css'

/**
 * Sky scene with the waving puppy (artwork cut from the approved reference).
 * `top` renders over the sky (e.g. a profile row); children are the real heading text.
 */
export function HeroScene({
  top,
  children,
  labelledBy,
}: {
  top?: React.ReactNode
  children: React.ReactNode
  labelledBy?: string
}) {
  return (
    <section className={styles.hero} aria-labelledby={labelledBy}>
      {top && <div className={styles.top}>{top}</div>}
      <div className={styles.text}>{children}</div>
      <Image
        className={styles.scene}
        src="/art/hero-scene.webp"
        alt=""
        aria-hidden="true"
        width={940}
        height={498}
        unoptimized
        priority
      />
    </section>
  )
}
