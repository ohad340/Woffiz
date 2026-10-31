import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { FixtureBanner } from '@/components/shell/FixtureBanner'
import { APP_NAME } from '@/lib/app'
import styles from './AuthScreen.module.css'

/** Shared frame for the account screens (verification, password reset): logo, one card, one heading. */
export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <FixtureBanner />
      <main id="main" className={styles.main} tabIndex={-1}>
        <Link href="/" className={styles.logoLink}>
          <Image className={styles.logo} src="/art/logo.webp" alt={`${APP_NAME} – לדף הכניסה`} width={1100} height={794} unoptimized priority />
        </Link>
        <section className={styles.card} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          {children}
        </section>
      </main>
    </>
  )
}
