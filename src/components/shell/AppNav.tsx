'use client'

import { Dog, Map, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_SHORT_NAME } from '@/lib/app'
import styles from './AppShell.module.css'

const DESTINATIONS = [
  { href: '/map', label: 'המפה', Icon: Map },
  { href: '/review', label: 'חזרה', Icon: RotateCcw },
  { href: '/puppy', label: 'הגור שלי', Icon: Dog },
] as const

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav className={styles.nav} aria-label="ניווט ראשי">
      <span className={styles.brand}>{APP_SHORT_NAME}</span>
      <ul className={styles.navList}>
        {DESTINATIONS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link href={href} className={styles.navLink} aria-current={active ? 'page' : undefined}>
                <Icon size={24} aria-hidden="true" strokeWidth={active ? 2.5 : 2} />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
