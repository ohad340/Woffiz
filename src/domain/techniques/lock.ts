import { fingerprintTechnique } from './fingerprint'
import lockFile from './techniques.lock.json'
import type { TechniqueDefinition } from './types'

/** Fingerprints of RELEASED (approved) definitions, key@version -> sha256. Added when the owner approves one. */
export const TECHNIQUE_LOCK: Readonly<Record<string, string>> = lockFile

/** Issues for definitions that break the release rules: approved but unlocked, or locked but changed or removed. */
export function lockIssues(defs: readonly TechniqueDefinition[], lock: Readonly<Record<string, string>> = TECHNIQUE_LOCK): string[] {
  const issues: string[] = []
  for (const def of defs) {
    const id = `${def.key}@${def.version}`
    const locked = lock[id]
    if (def.review.status === 'approved' && !locked) issues.push(`${id} is approved but not in techniques.lock.json`)
    if (locked && locked !== fingerprintTechnique(def)) issues.push(`${id} changed after release: create a new version instead`)
  }
  for (const id of Object.keys(lock)) {
    if (!defs.some((d) => `${d.key}@${d.version}` === id)) issues.push(`${id} is locked but missing from the catalog (released versions must be kept)`)
  }
  return issues
}
