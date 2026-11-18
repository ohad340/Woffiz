'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './admin.module.css'

const LINKS = [
  { href: '/admin/media', label: 'סרטוני הדגמה' },
  { href: '/admin/metrics', label: 'מדדי הפיילוט' },
] as const

/** Navigation between the administrator screens. The current section is marked with aria-current. */
export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="ניהול" className={styles.row}>
      {LINKS.map(({ href, label }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link key={href} href={href} aria-current={current ? 'page' : undefined}>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
