'use client'

import { Download, Share } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/Button'
import { detectInstallCase, type InstallCase } from '@/lib/pwa/install'
import { getInstallPromptSnapshot, promptInstall, subscribeInstallPrompt } from './install-prompt'
import styles from './InstallGuide.module.css'

const STANDALONE_QUERY = '(display-mode: standalone)'

function subscribe(callback: () => void) {
  const unsubscribePrompt = subscribeInstallPrompt(callback)
  const media = window.matchMedia(STANDALONE_QUERY)
  media.addEventListener('change', callback)
  return () => {
    unsubscribePrompt()
    media.removeEventListener('change', callback)
  }
}

function getCase(): InstallCase {
  const { promptAvailable, installedNow } = getInstallPromptSnapshot()
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return detectInstallCase({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: window.matchMedia(STANDALONE_QUERY).matches || iosStandalone,
    promptAvailable,
    installedNow,
  })
}

/** Not detected yet on the server and during hydration: only the intro renders, so the markup matches. */
const getServerCase = (): InstallCase | null => null

/** Content of the "התקנה במסך הבית" card on /puppy (P4-2): one of four honest, browser-appropriate cases. */
export function InstallGuide() {
  const installCase = useSyncExternalStore<InstallCase | null>(subscribe, getCase, getServerCase)

  return (
    <div className={styles.guide}>
      <p>אפשר להוסיף את Woffiz למסך הבית ולפתוח אותה כמו אפליקציה.</p>

      {installCase === 'installed' && <p className={styles.installed}>Woffiz כבר מותקנת במכשיר הזה.</p>}

      {installCase === 'prompt' && (
        <>
          <div>
            <Button variant="primary" icon={<Download size={20} aria-hidden="true" />} onClick={() => void promptInstall()}>
              התקנה
            </Button>
          </div>
          <p className={styles.muted}>הדפדפן יציג חלון אישור משלו.</p>
        </>
      )}

      {installCase === 'ios' && (
        <>
          <ol className={styles.steps}>
            <li>
              <Share size={20} aria-hidden="true" className={styles.stepIcon} />
              <span>הקישו על כפתור השיתוף (ריבוע עם חץ למעלה). אם הוא לא מופיע, הקישו קודם על ⋯.</span>
            </li>
            <li>
              <span>בחרו „הוספה למסך הבית”. ייתכן שצריך לגלול למטה ברשימה.</span>
            </li>
            <li>
              <span>הקישו על „הוספה”.</span>
            </li>
          </ol>
          <p className={styles.muted}>באייפון ובאייפד ההתקנה נעשית דרך תפריט השיתוף. השמות יכולים להשתנות מעט בין גרסאות.</p>
        </>
      )}

      {installCase === 'other' && (
        <p>
          בדפדפנים שתומכים בהתקנה, פתחו את תפריט הדפדפן ובחרו „התקנת האפליקציה” או „הוספה למסך הבית”. יש דפדפנים שלא תומכים
          בהתקנה, ואפשר להמשיך להשתמש ב-Woffiz כאן בדפדפן.
        </p>
      )}
    </div>
  )
}
