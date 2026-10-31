'use client'

import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import styles from './Field.module.css'

type FieldShellProps = {
  label: string
  optional?: boolean
  helper?: ReactNode
  error?: string
  id: string
  children: ReactNode
}

function FieldShell({ label, optional, helper, error, id, children }: FieldShellProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional && <span className={styles.optional}> (רשות)</span>}
      </label>
      {children}
      {helper && !error && (
        <p className={styles.helper} id={`${id}-helper`}>
          {helper}
        </p>
      )}
      {error && (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function describedBy(id: string, helper: unknown, error: unknown) {
  if (error) return `${id}-error`
  if (helper) return `${id}-helper`
  return undefined
}

type TextFieldProps = Omit<ComponentPropsWithoutRef<'input'>, 'id'> & {
  label: string
  optional?: boolean
  helper?: ReactNode
  error?: string
}

export function TextField({ label, optional, helper, error, ...rest }: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} optional={optional} helper={helper} error={error}>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        {...rest}
      />
    </FieldShell>
  )
}

type TextAreaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> & {
  label: string
  optional?: boolean
  helper?: ReactNode
  error?: string
}

export function TextArea({ label, optional, helper, error, ...rest }: TextAreaProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} optional={optional} helper={helper} error={error}>
      <textarea
        id={id}
        className={`${styles.input} ${styles.textarea}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        {...rest}
      />
    </FieldShell>
  )
}
