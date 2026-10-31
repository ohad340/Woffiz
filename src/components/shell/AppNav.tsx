'use client'

import { Dog, House, Map, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { APP_NAME } from '@/lib/app'
import styles from './AppShell.module.css'

const DESTINATIONS = [
  { href: '/home', label: 'בית', Icon: House },
  { href: '/map', label: 'המפה', Icon: Map },
  { href: '/review', label: 'חזרה', Icon: RotateCcw },
  { href: '/puppy', label: 'הגור שלי', Icon: Dog },
] as const

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav className={styles.nav} aria-label="ניווט ראשי">
      <span className={styles.brand}>
        <Image className={styles.brandLogo} src="/art/logo.webp" alt={APP_NAME} width={1100} height={794} unoptimized />
      </span>
      <ul className={styles.navList}>
        {DESTINATIONS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link href={href} className={styles.navLink} aria-current={active ? 'page' : undefined}>
                <span className={styles.navIcon}>
                  <Icon size={24} aria-hidden="true" strokeWidth={active ? 2.6 : 2.2} />
                </span>
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
