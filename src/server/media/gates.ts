import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import type { Env } from '../local-mode'
import { isLocalMachine } from '../local-mode'

export type ReviewKind = 'TECHNICAL' | 'CONTENT'
export type ReviewDecisionName = 'APPROVED' | 'CHANGES_REQUESTED'

/**
 * Checklist item ids. An APPROVED review must tick every item of its kind: the ticks are the reviewer's own statement
 * that they watched and listened to the clip. The Hebrew labels live in the admin UI.
 */
export const CHECKLISTS: Record<ReviewKind, readonly string[]> = {
  TECHNICAL: [
    'watched-and-listened-in-full',
    'plays-on-reference-devices',
    'poster-is-a-real-frame',
    'hebrew-voice-intelligible',
    'loudness-acceptable',
    'voice-matches-action-timing',
    'captions-in-sync',
    'no-visual-artifacts',
    'subjects-fully-in-frame',
  ],
  CONTENT: [
    'watched-and-listened-in-full',
    'steps-match-rendered-instructions-in-order',
    'speech-cues-audible-at-right-moment',
    'no-aversive-or-hazardous-handling',
    'no-signs-of-fear-in-puppy',
    'sources-reread-and-support-the-steps',
    'demonstrated-parameters-match-catalog',
  ],
}

/** Problems with a submitted review, empty when it may be recorded. */
export function reviewInputIssues(kind: ReviewKind, decision: ReviewDecisionName, checklist: Record<string, boolean>, notes: string | undefined): string[] {
  const issues: string[] = []
  const expected = CHECKLISTS[kind]
  for (const id of Object.keys(checklist)) if (!expected.includes(id)) issues.push(`unknown checklist item "${id}"`)
  for (const id of expected) if (typeof checklist[id] !== 'boolean') issues.push(`checklist item "${id}" is missing`)
  if (decision === 'APPROVED') {
    for (const id of expected) if (checklist[id] !== true) issues.push(`approval needs every item ticked: "${id}"`)
  } else if (!notes || notes.trim().length < 3) {
    issues.push('a request for changes needs a note')
  }
  return issues
}

export type ReviewRow = { kind: ReviewKind; decision: ReviewDecisionName; reviewedFingerprint: string }

/**
 * Both a TECHNICAL and a CONTENT review must approve this exact bundle. Reviews are ordered newest first; only
 * the newest of each kind counts, so a later request for changes overrides an earlier approval, and an approval of
 * any other bundle (another fingerprint) counts for nothing.
 */
export function reviewGateIssues(reviewsNewestFirst: readonly ReviewRow[], bundleFingerprint: string): string[] {
  const issues: string[] = []
  for (const kind of ['TECHNICAL', 'CONTENT'] as const) {
    const latest = reviewsNewestFirst.find((r) => r.kind === kind)
    if (!latest) issues.push(`no ${kind} review yet`)
    else if (latest.decision !== 'APPROVED') issues.push(`the latest ${kind} review requests changes`)
    else if (latest.reviewedFingerprint !== bundleFingerprint) issues.push(`the ${kind} approval is for a different bundle`)
  }
  return issues
}

export type PublishFacts = {
  techniqueFingerprint: string
  isTestFixture: boolean
}

/**
 * Publication gates that do not depend on reviews. The technique definition must be approved by the owner, frozen
 * in techniques.lock.json at exactly its current fingerprint, registered in the database with that fingerprint, and
 * not suspended. A fixture is never published outside a local machine or tests.
 */
export function publishGateIssues(
  def: TechniqueDefinition | undefined,
  lock: Readonly<Record<string, string>>,
  version: PublishFacts,
  state: { fingerprint: string; suspendedAt: Date | null },
  env: Env,
): string[] {
  const issues: string[] = []
  if (!def) return ['the technique definition no longer exists in the catalog']
  const id = `${def.key}@${def.version}`
  const fingerprint = fingerprintTechnique(def)
  if (def.review.status !== 'approved') issues.push(`${id} is still a draft: the owner has not approved its definition`)
  if (lock[id] !== fingerprint) issues.push(`${id} is not frozen in techniques.lock.json at its current definition`)
  if (version.techniqueFingerprint !== fingerprint) issues.push('the clip was made for a different definition of this technique version')
  if (state.fingerprint !== fingerprint) issues.push('the registered technique state has a different fingerprint')
  if (state.suspendedAt) issues.push(`${id} is suspended: lift the suspension first`)
  if (version.isTestFixture && !(isLocalMachine(env) || env.NODE_ENV === 'test')) issues.push('a test fixture cannot be published outside a local machine')
  return issues
}
