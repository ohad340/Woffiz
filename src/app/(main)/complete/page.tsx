import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { HeroScene } from '@/components/art/HeroScene'
import { Button } from '@/components/ui/Button'
import { requireOverview } from '@/server/queries'
import { requireUserOrRedirect } from '@/server/session'
import styles from '../page.module.css'

export const metadata: Metadata = { title: 'סיכום המסלול' }

export default async function CompletePage() {
  const user = await requireUserOrRedirect()
  const overview = await requireOverview(user.id)
  if (!overview.planCompleted) redirect('/home')

  return (
    <div className={styles.narrow}>
      <HeroScene labelledBy="complete-title">
        <h1 id="complete-title">סיימתם את כל השלבים!</h1>
        <p>
          השלמתם {overview.completed} שלבים עם {overview.puppy.name}, לפי הדיווחים שלכם
        </p>
      </HeroScene>
      <p className={styles.lead}>
        ההתקדמות מבוססת על מה שדיווחתם, לא על מבחן. אפשר להמשיך לתרגל כל שלב שהושלם כדי לשמור על מה שנלמד.
      </p>
      <Button href="/review" size="cta" fullWidth>
        חוזרים לתרגל
      </Button>
    </div>
  )
}
