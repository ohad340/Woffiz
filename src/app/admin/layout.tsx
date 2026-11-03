import type { Metadata } from 'next'
import { SignOutBar } from '@/components/shell/SignOutBar'
import styles from '@/components/shell/AppShell.module.css'
import { requireAdminOrNotFound } from '@/server/session'

// Administrator screens depend on the current session and database state: nothing is cached or shared.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'ניהול מדיה', robots: { index: false, follow: false } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminOrNotFound()
  return (
    <div className={styles.shell}>
      <SignOutBar />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
