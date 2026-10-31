import { VideoOff } from 'lucide-react'
import styles from './VideoUnavailable.module.css'

/**
 * Placeholder for a demonstration video that does not exist yet.
 * Reviewed AI-produced media arrives in Phase 3; never show a fake player.
 */
export function VideoUnavailable() {
  return (
    <figure className={styles.box}>
      <VideoOff size={32} aria-hidden="true" />
      <figcaption>
        <strong>סרטון ההדגמה עדיין לא זמין</strong>
        <span>בגרסת הפיתוח אין סרטונים. סרטונים שנבדקו יתווספו לפני ההשקה.</span>
      </figcaption>
    </figure>
  )
}
