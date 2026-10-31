import { Cloud, Hills } from './Decor'
import { Mascot, SpeechBubble } from './Mascot'
import { WoodSign } from './WoodSign'
import styles from './HeroScene.module.css'

/**
 * Full-bleed sky-and-hills scene with the waving mascot.
 * `top` renders over the sky (e.g. a profile row); children are the heading text.
 */
export function HeroScene({
  top,
  children,
  bubble,
  sign,
  labelledBy,
}: {
  top?: React.ReactNode
  children: React.ReactNode
  bubble?: string
  sign?: React.ReactNode
  labelledBy?: string
}) {
  return (
    <section className={styles.hero} aria-labelledby={labelledBy}>
      <Cloud className={`${styles.cloud} ${styles.cloudA}`} />
      <Cloud className={`${styles.cloud} ${styles.cloudB}`} />
      <Cloud className={`${styles.cloud} ${styles.cloudC}`} />
      {top && <div className={styles.top}>{top}</div>}
      <div className={styles.text}>{children}</div>
      <div className={styles.stage}>
        <Hills className={styles.hills} />
        {sign && <WoodSign className={styles.sign}>{sign}</WoodSign>}
        <div className={styles.mascotWrap}>
          {bubble && <SpeechBubble className={styles.bubble}>{bubble}</SpeechBubble>}
          <Mascot pose="wave" className={styles.mascot} />
        </div>
      </div>
    </section>
  )
}
