import { VideoOff } from 'lucide-react'
import styles from './VideoUnavailable.module.css'

/**
 * Honest placeholder when no demonstration can be shown; never a fake player.
 * - none: this exercise version has no demonstration (free-form, or from before reviewed media existed).
 * - unavailable: it has one, but no published, compatible clip can be shown right now (withdrawn or not yet replaced).
 */
export function VideoUnavailable({ reason = 'none' }: { reason?: 'none' | 'unavailable' }) {
  return (
    <figure className={styles.box}>
      <VideoOff size={32} aria-hidden="true" />
      {reason === 'none' ? (
        <figcaption>
          <strong>סרטון ההדגמה עדיין לא זמין</strong>
          <span>בגרסת הפיתוח אין סרטונים. סרטונים שנבדקו יתווספו לפני ההשקה.</span>
        </figcaption>
      ) : (
        <figcaption>
          <strong>סרטון ההדגמה לא זמין כרגע</strong>
          <span>אפשר להמשיך לפי ההוראות הכתובות.</span>
        </figcaption>
      )}
    </figure>
  )
}
