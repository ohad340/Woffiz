import { redirect } from 'next/navigation'
import { AppNav } from '@/components/shell/AppNav'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { SignOutBar } from '@/components/shell/SignOutBar'
import styles from '@/components/shell/AppShell.module.css'
import { getOverview } from '@/server/queries'
import { requireUserOrRedirect } from '@/server/session'

// Every screen here depends on the signed-in owner, so nothing is cached or shared.
export const dynamic = 'force-dynamic'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect()
  if (!(await getOverview(user.id))) redirect('/onboarding')

  return (
    <div className={styles.shell}>
      <FixtureBanner />
      <AppNav />
      <SignOutBar />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
