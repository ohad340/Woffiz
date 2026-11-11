import { describe, expect, it } from 'vitest'
import { MOUTHING_REDIRECT_TOY } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { CHECKLISTS, publishGateIssues, reviewGateIssues, reviewInputIssues, type ReviewRow } from './gates'

const all = (kind: 'TECHNICAL' | 'CONTENT', value = true) => Object.fromEntries(CHECKLISTS[kind].map((id) => [id, value]))
const FP = 'a'.repeat(64)
const review = (kind: ReviewRow['kind'], decision: ReviewRow['decision'], fp = FP): ReviewRow => ({ kind, decision, reviewedFingerprint: fp })

describe('review input', () => {
  it('accepts an approval only with every checklist item ticked', () => {
    expect(reviewInputIssues('TECHNICAL', 'APPROVED', all('TECHNICAL'), undefined)).toEqual([])
    const missingTick = { ...all('CONTENT'), 'no-signs-of-fear-in-puppy': false }
    expect(reviewInputIssues('CONTENT', 'APPROVED', missingTick, undefined)[0]).toMatch(/every item ticked/)
  })

  it('rejects unknown or missing checklist items and mixes of the two kinds', () => {
    expect(reviewInputIssues('TECHNICAL', 'APPROVED', { ...all('TECHNICAL'), extra: true }, undefined)[0]).toMatch(/unknown checklist item/)
    const { 'captions-in-sync': _removed, ...rest } = all('TECHNICAL')
    void _removed
    expect(reviewInputIssues('TECHNICAL', 'APPROVED', rest, undefined).join()).toMatch(/missing/)
    expect(reviewInputIssues('TECHNICAL', 'APPROVED', all('CONTENT'), undefined).join()).toMatch(/unknown checklist item/)
  })

  it('needs a note to request changes, whatever is ticked', () => {
    expect(reviewInputIssues('CONTENT', 'CHANGES_REQUESTED', all('CONTENT', false), undefined)).toEqual(['a request for changes needs a note'])
    expect(reviewInputIssues('CONTENT', 'CHANGES_REQUESTED', all('CONTENT', false), 'hand jerks away at 0:05')).toEqual([])
  })

  it('every approval asks the reviewer to confirm having watched and listened in full', () => {
    expect(CHECKLISTS.TECHNICAL).toContain('watched-and-listened-in-full')
    expect(CHECKLISTS.CONTENT).toContain('watched-and-listened-in-full')
  })
})

describe('review gate', () => {
  it('needs both kinds, approving this exact bundle', () => {
    expect(reviewGateIssues([review('CONTENT', 'APPROVED'), review('TECHNICAL', 'APPROVED')], FP)).toEqual([])
    expect(reviewGateIssues([], FP)).toEqual(['no TECHNICAL review yet', 'no CONTENT review yet'])
    expect(reviewGateIssues([review('TECHNICAL', 'APPROVED')], FP)).toEqual(['no CONTENT review yet'])
    expect(reviewGateIssues([review('TECHNICAL', 'APPROVED'), review('CONTENT', 'APPROVED', 'b'.repeat(64))], FP)).toEqual(['the CONTENT approval is for a different bundle'])
  })

  it('counts only the newest review of each kind', () => {
    const newestFirst = [review('CONTENT', 'CHANGES_REQUESTED'), review('CONTENT', 'APPROVED'), review('TECHNICAL', 'APPROVED')]
    expect(reviewGateIssues(newestFirst, FP)).toEqual(['the latest CONTENT review requests changes'])
    const reapproved = [review('CONTENT', 'APPROVED'), ...newestFirst]
    expect(reviewGateIssues(reapproved, FP)).toEqual([])
  })
})

describe('publish gate', () => {
  const fp = fingerprintTechnique(MOUTHING_REDIRECT_TOY)
  const approved: TechniqueDefinition = { ...MOUTHING_REDIRECT_TOY, review: { status: 'approved', approvedBy: 'owner', approvedOn: '2026-11-03' } }
  const state = { fingerprint: fp, suspendedAt: null }
  const version = { techniqueFingerprint: fp, isTestFixture: false }
  const lock = { 'mouthing-redirect-toy@1': fp }

  it('passes only for an approved, frozen, unsuspended technique', () => {
    expect(publishGateIssues(approved, lock, version, state, {})).toEqual([])
  })

  it('refuses the draft definitions of the real catalog: the owner has not approved their defaults', () => {
    expect(publishGateIssues(MOUTHING_REDIRECT_TOY, lock, version, state, {})[0]).toMatch(/still a draft/)
  })

  it('refuses an unfrozen or changed definition, a mismatching clip or state, and a suspension', () => {
    expect(publishGateIssues(approved, {}, version, state, {}).join()).toMatch(/not frozen/)
    expect(publishGateIssues(approved, lock, { ...version, techniqueFingerprint: 'x' }, state, {}).join()).toMatch(/different definition/)
    expect(publishGateIssues(approved, lock, version, { ...state, fingerprint: 'x' }, {}).join()).toMatch(/different fingerprint/)
    expect(publishGateIssues(approved, lock, version, { ...state, suspendedAt: new Date() }, {}).join()).toMatch(/suspended/)
    expect(publishGateIssues(undefined, lock, version, state, {})).toEqual(['the technique definition no longer exists in the catalog'])
  })

  it('keeps fixtures local', () => {
    const fixture = { ...version, isTestFixture: true }
    expect(publishGateIssues(approved, lock, fixture, state, {})[0]).toMatch(/fixture cannot be published/)
    expect(publishGateIssues(approved, lock, fixture, state, { APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000' })).toEqual([])
    expect(publishGateIssues(approved, lock, fixture, state, { NODE_ENV: 'test' })).toEqual([])
    expect(publishGateIssues(approved, lock, fixture, state, { APP_ENV: 'local', BETTER_AUTH_URL: 'https://woffiz.example' })[0]).toMatch(/fixture/)
  })
})
