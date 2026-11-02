import { describe, expect, it } from 'vitest'
import { exerciseContentSchema } from '@/server/content'
import { TECHNIQUES, getTechnique, techniqueId } from './catalog'
import { fingerprintTechnique } from './fingerprint'
import { lockIssues } from './lock'
import { checkMediaParamCompatibility, checkParamSpec, defaultParams, demonstratedParams, isMediaNeutral, validateTechniqueParams } from './params'
import { renderTechniqueContent } from './render'
import type { TechniqueDefinition } from './types'

const mouthing = getTechnique('mouthing-redirect-toy', 1)!
const nameLook = getTechnique('name-look', 1)!

describe('technique catalog', () => {
  it('starts with two DRAFT techniques; nothing is approved without the owner', () => {
    expect(TECHNIQUES.map(techniqueId)).toEqual(['mouthing-redirect-toy@1', 'name-look@1'])
    for (const def of TECHNIQUES) expect(def.review.status).toBe('draft')
  })

  it('has unique keys, valid parameter specs and every {placeholder} backed by a parameter', () => {
    const ids = TECHNIQUES.map(techniqueId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const def of TECHNIQUES) {
      for (const [name, variant] of Object.entries(def.variants)) {
        for (const spec of variant.params) expect(checkParamSpec(spec), `${def.key} ${name}`).toEqual([])
        const used = [...variant.steps.map((s) => s.text), variant.successCriterion, ...variant.preparation, ...variant.tips.map((t) => t.text)].flatMap((t) =>
          [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!),
        )
        for (const id of used) expect(variant.params.some((p) => p.id === id), `${def.key} ${name} {${id}}`).toBe(true)
        expect(new Set(variant.steps.map((s) => s.id)).size).toBe(variant.steps.length)
      }
    }
  })

  it('records an https source for every step, tip and the forbidden-behaviour boundary (shape only)', () => {
    for (const def of TECHNIQUES) {
      expect(def.sources.length).toBeGreaterThan(0)
      const supported = new Set(def.sources.flatMap((s) => s.supports))
      for (const source of def.sources) {
        expect(source.url.startsWith('https://')).toBe(true)
        expect(source.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(source.summary.length).toBeGreaterThan(20)
      }
      expect(supported.has('forbidden')).toBe(true)
      for (const variant of Object.values(def.variants)) {
        for (const step of variant.steps) expect(supported.has(step.id), `${def.key}: ${step.id}`).toBe(true)
        for (const tip of variant.tips) expect(supported.has(tip.id), `${def.key}: ${tip.id}`).toBe(true)
      }
    }
  })

  it('labels every parameter without a source as a product default', () => {
    for (const def of TECHNIQUES) for (const v of Object.values(def.variants)) for (const p of v.params) expect(p.basis).toBe('product-default')
  })
})

describe('fingerprint and release lock', () => {
  it('is stable, ignores review and sources, and changes with the demonstrated behaviour', () => {
    const base = fingerprintTechnique(mouthing)
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(fingerprintTechnique({ ...mouthing, review: { status: 'approved', approvedBy: 'x', approvedOn: '2026-11-03' } })).toBe(base)
    expect(fingerprintTechnique({ ...mouthing, sources: [] })).toBe(base)
    const std = mouthing.variants.STANDARD!
    const changed: TechniqueDefinition = { ...mouthing, variants: { ...mouthing.variants, STANDARD: { ...std, steps: [...std.steps].reverse() } } }
    expect(fingerprintTechnique(changed)).not.toBe(base)
  })

  it('fails when an approved definition is not locked, changed after release, or removed', () => {
    const approved: TechniqueDefinition = { ...mouthing, review: { status: 'approved', approvedBy: 'owner', approvedOn: '2026-11-03' } }
    expect(lockIssues([approved], {})).toEqual(['mouthing-redirect-toy@1 is approved but not in techniques.lock.json'])
    const lock = { 'mouthing-redirect-toy@1': fingerprintTechnique(approved) }
    expect(lockIssues([approved], lock)).toEqual([])
    const std = approved.variants.STANDARD!
    const edited: TechniqueDefinition = { ...approved, variants: { ...approved.variants, STANDARD: { ...std, goal: 'אחר' } } }
    expect(lockIssues([edited], lock)[0]).toMatch(/changed after release/)
    expect(lockIssues([], lock)[0]).toMatch(/missing from the catalog/)
  })

  it('the committed lock matches the catalog', () => {
    expect(lockIssues(TECHNIQUES)).toEqual([])
  })
})

describe('rendering from the catalog', () => {
  it('renders valid ExerciseContent whose mandatory steps are the catalog text, in order', () => {
    const content = renderTechniqueContent(mouthing, 'STANDARD', defaultParams(mouthing.variants.STANDARD!), ['rotate-toys'])
    expect(exerciseContentSchema.safeParse(content).success).toBe(true)
    expect(content.steps).toHaveLength(3)
    expect(content.steps[0]).toContain('3 שניות')
    expect(content.successCriterion).toContain('3 מפגשי')
    expect(content.preparation.at(-1)).toContain('מחליפים אותם')
    expect(content.easierVariant.title).toBe(mouthing.variants.EASIER!.title)
    expect(content.stopConditions.some((s) => /וטרינר/.test(s))).toBe(true)
  })

  it('renders the EASIER variant with the generic fallback and rejects unknown tips or bad parameters', () => {
    const easier = renderTechniqueContent(nameLook, 'EASIER', defaultParams(nameLook.variants.EASIER!))
    expect(easier.easierVariant).toEqual(nameLook.fallbackEasier)
    expect(() => renderTechniqueContent(nameLook, 'STANDARD', defaultParams(nameLook.variants.STANDARD!), ['nope'])).toThrow(/unknown tip/)
    expect(() => renderTechniqueContent(nameLook, 'STANDARD', { distanceMeters: 9, rounds: 5, sessionsInRow: 3 })).toThrow(/invalid parameters/)
  })
})

describe('parameters', () => {
  const std = mouthing.variants.STANDARD!

  it('accepts only declared integer parameters inside their range', () => {
    expect(validateTechniqueParams(std, defaultParams(std))).toEqual([])
    expect(validateTechniqueParams(std, { stillSeconds: 11, rounds: 3, sessionsInRow: 3 })).toHaveLength(1)
    expect(validateTechniqueParams(std, { stillSeconds: 2.5, rounds: 3, sessionsInRow: 3 })[0]).toMatch(/integer/)
    expect(validateTechniqueParams(std, { stillSeconds: 3, rounds: 3 })[0]).toMatch(/missing/)
    expect(validateTechniqueParams(std, { stillSeconds: 3, rounds: 3, sessionsInRow: 3, extra: 1 })[0]).toMatch(/unknown/)
  })

  it('separates media-neutral parameters from media-bound ones', () => {
    const byId = Object.fromEntries(std.params.map((p) => [p.id, p]))
    expect(isMediaNeutral(byId.rounds!)).toBe(true)
    expect(isMediaNeutral(byId.sessionsInRow!)).toBe(true)
    expect(isMediaNeutral(byId.stillSeconds!)).toBe(false)
  })

  it('binds a clip only to parameter values inside the range the clip still shows', () => {
    const shown = demonstratedParams(std)
    // The written instructions may use 8 seconds, but the fixed clip shows about 3: no media for that combination.
    expect(validateTechniqueParams(std, { stillSeconds: 8, rounds: 3, sessionsInRow: 3 })).toEqual([])
    expect(checkMediaParamCompatibility(std, { stillSeconds: 8, rounds: 3, sessionsInRow: 3 }, shown)[0]).toMatch(/outside the range 2-5/)
    expect(checkMediaParamCompatibility(std, { stillSeconds: 5, rounds: 6, sessionsInRow: 5 }, shown)).toEqual([])
    // Matching the technique key and variant is not enough: a clip that demonstrates another value is rejected too.
    expect(checkMediaParamCompatibility(std, defaultParams(std), { ...shown, stillSeconds: 8 })[0]).toMatch(/media demonstrates stillSeconds=8/)
    expect(checkMediaParamCompatibility(std, defaultParams(std), { ...shown, bogus: 1 })[0]).toMatch(/unknown parameter/)
  })
})
