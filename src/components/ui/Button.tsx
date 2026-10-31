import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'

type CommonProps = {
  variant?: Variant
  size?: 'default' | 'cta'
  fullWidth?: boolean
  icon?: ReactNode
  children: ReactNode
}

type ButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<'button'>, 'children'> & {
    href?: undefined
    loading?: boolean
    loadingLabel?: string
  }

type LinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, 'children'> & { href: string }

function classes({ variant = 'primary', size = 'default', fullWidth }: CommonProps, extra?: string) {
  return [styles.button, styles[variant], size === 'cta' && styles.cta, fullWidth && styles.full, extra]
    .filter(Boolean)
    .join(' ')
}

export function Button(props: ButtonProps | LinkProps) {
  if (props.href !== undefined) {
    const { variant, size, fullWidth, icon, children, className, ...rest } = props
    return (
      <Link className={classes({ variant, size, fullWidth, children }, className)} {...rest}>
        {icon}
        <span>{children}</span>
      </Link>
    )
  }

  const { variant, size, fullWidth, icon, children, className, loading, loadingLabel, disabled, type, ...rest } =
    props
  return (
    <button
      type={type ?? 'button'}
      className={classes({ variant, size, fullWidth, children }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* Keep the original label in layout so width stays stable while loading. */}
      <span className={loading ? styles.hiddenLabel : styles.label}>
        {icon}
        <span>{children}</span>
      </span>
      {loading && (
        <span className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{loadingLabel ?? 'שומרים…'}</span>
        </span>
      )}
    </button>
  )
}
