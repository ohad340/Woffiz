import styles from './WoodSign.module.css'

/** Wooden plank sign. `hanging` adds ropes (map title); otherwise it stands on a post. */
export function WoodSign({
  children,
  hanging = false,
  as: Tag = 'p',
  className,
}: {
  children: React.ReactNode
  hanging?: boolean
  as?: 'p' | 'h1' | 'h2'
  className?: string
}) {
  return (
    <div className={[styles.sign, hanging ? styles.hanging : styles.standing, className].filter(Boolean).join(' ')}>
      <Tag className={styles.plank}>{children}</Tag>
    </div>
  )
}
