import { useId } from 'react'

/**
 * Unique gradient ids per SVG instance. Shared ids break when the first copy
 * lives in a hidden subtree (Chrome then paints the fill as none).
 */
export function useArtIds() {
  const base = `a${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (name: string) => `${base}-${name}`
}
