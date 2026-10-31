'use client'

import { Check } from 'lucide-react'
import { useId } from 'react'
import styles from './ChoiceGroup.module.css'

export type Choice = { value: string; label: string; description?: string }

type ChoiceGroupProps = {
  legend: string
  hint?: string
  options: readonly Choice[]
  error?: string
} & (
  | { multiple?: false; value: string | null; onChange: (value: string) => void }
  | { multiple: true; value: readonly string[]; onChange: (value: string[]) => void }
)

/**
 * Full-width selectable cards (radio or checkbox). Selection is shown with
 * border weight and a check icon, never color alone.
 */
export function ChoiceGroup(props: ChoiceGroupProps) {
  const { legend, hint, options, error } = props
  const name = useId()
  const hintId = `${name}-hint`
  const errorId = `${name}-error`

  const isChecked = (v: string) => (props.multiple ? props.value.includes(v) : props.value === v)

  const toggle = (v: string) => {
    if (props.multiple) {
      props.onChange(props.value.includes(v) ? props.value.filter((x) => x !== v) : [...props.value, v])
    } else {
      props.onChange(v)
    }
  }

  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
    >
      <legend className={styles.legend}>{legend}</legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.options}>
        {options.map((option) => {
          const checked = isChecked(option.value)
          return (
            <label key={option.value} className={styles.option} data-checked={checked || undefined}>
              <input
                className={styles.input}
                type={props.multiple ? 'checkbox' : 'radio'}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => toggle(option.value)}
              />
              <span className={styles.marker} aria-hidden="true">
                {checked && <Check size={16} strokeWidth={3} />}
              </span>
              <span className={styles.text}>
                <span className={styles.optionLabel}>{option.label}</span>
                {option.description && <span className={styles.description}>{option.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
