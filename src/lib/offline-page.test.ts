import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// public/offline.html must stay self-contained (it is served with no network), so it copies design tokens inline.
// This keeps every copied value identical to the source of truth in src/styles/tokens.css.
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

/** Custom properties of the first `:root { ... }` block, as name → normalized value. */
function rootTokens(css: string): Map<string, string> {
  const block = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
  const tokens = new Map<string, string>()
  for (const [, name = '', value = ''] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.replace(/\s+/g, ' ').trim().toLowerCase())
  return tokens
}

describe('offline fallback page', () => {
  const source = rootTokens(read('src/styles/tokens.css'))
  const copied = rootTokens(read('public/offline.html'))

  it('copies design tokens', () => {
    expect(copied.size).toBeGreaterThan(10)
  })

  it('uses exactly the values from src/styles/tokens.css', () => {
    const drift = [...copied].filter(([name, value]) => source.get(name) !== value).map(([name, value]) => `${name}: ${value} (tokens.css: ${source.get(name) ?? 'missing'})`)
    expect(drift).toEqual([])
  })

  it('is a static Hebrew RTL page with no external files', () => {
    const html = read('public/offline.html')
    expect(html).toMatch(/<html lang="he" dir="rtl">/)
    expect(html).not.toMatch(/\s(src|href)=/)
  })
})
