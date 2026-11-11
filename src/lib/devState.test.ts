import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEV_STATES, parseDevState } from './devState'

describe('parseDevState', () => {
  it.each(DEV_STATES)('accepts %s when previews are enabled', (state) => {
    expect(parseDevState(state, true)).toBe(state)
  })

  it('ignores unknown and missing values, and uses the first element of an array', () => {
    expect(parseDevState('nope', true)).toBeNull()
    expect(parseDevState(undefined, true)).toBeNull()
    expect(parseDevState(['error', 'empty'], true)).toBe('error')
    expect(parseDevState(['nope', 'error'], true)).toBeNull()
  })

  it('cannot be called without the gate (compile-time; `npm run typecheck` fails if this ever compiles)', () => {
    // @ts-expect-error the `enabled` argument is required
    expect(parseDevState('error')).toBeNull()
  })

  it.each(DEV_STATES)('returns null for %s when previews are disabled (production)', (state) => {
    expect(parseDevState(state, false)).toBeNull()
    expect(parseDevState([state], false)).toBeNull()
  })
})

// Static choke point (P4-2): `?state=` is read only through the gated parser, and every call passes the
// server-side gate itself. A new preview page fails here until it is reviewed and added to PREVIEW_PAGES.
const SRC = fileURLToPath(new URL('../', import.meta.url))
const PREVIEW_PAGES = ['app/(main)/map/page.tsx', 'app/(main)/review/page.tsx', 'app/onboarding/page.tsx']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

const files = sourceFiles(SRC).map((file) => ({
  name: path.relative(SRC, file).split(path.sep).join('/'),
  code: readFileSync(file, 'utf8'),
}))
const GATED_CALL = 'parseDevState((await searchParams).state, devPreviewsEnabled())'

describe('?state= previews are gated at a single choke point', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('calls parseDevState only from the reviewed preview pages', () => {
    const callers = files.filter((f) => f.name !== 'lib/devState.ts' && f.code.includes('parseDevState(')).map((f) => f.name)
    expect(callers.sort()).toEqual([...PREVIEW_PAGES].sort())
  })

  it('passes exactly devPreviewsEnabled() as the gate at every call', () => {
    for (const { name, code } of files) {
      if (name === 'lib/devState.ts') continue
      const calls = code.match(/parseDevState\([^\n]*/g) ?? []
      for (const call of calls) expect(call, name).toContain(GATED_CALL)
    }
  })

  it('reads the state search parameter only as the first argument of the gated call', () => {
    const reads = [/\(await searchParams\)\.state\b/g, /\b(?:searchParams|params)\??\.state\b/g, /\.get\(\s*['"]state['"]\s*\)/g, /\[\s*['"]state['"]\s*\]/g]
    for (const { name, code } of files) {
      if (name === 'lib/devState.ts') continue
      const ungated = code.split(GATED_CALL).join('')
      for (const pattern of reads) expect(ungated.match(pattern), `${name}: ${pattern}`).toBeNull()
    }
  })
})
