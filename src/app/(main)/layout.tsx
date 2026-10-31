import { AppNav } from '@/components/shell/AppNav'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import styles from '@/components/shell/AppShell.module.css'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <FixtureBanner />
      <AppNav />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
