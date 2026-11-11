import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Playing a demonstration must never report practice, confirm mastery, change a plan or call a model. The code on the
// playback path is kept away from that code entirely: it may not import it, directly or by name.
const PLAYBACK_FILES = [
  'src/server/media/resolve.ts',
  'src/components/media/DemoVideo.tsx',
  'src/components/media/VideoUnavailable.tsx',
  'src/app/api/media/playback/route.ts',
  'src/app/api/media/local/route.ts',
  'src/app/api/media/versions/[id]/captions/route.ts',
]

const FORBIDDEN = [
  /from ['"][^'"]*\/progress['"]/,
  /from ['"][^'"]*\/revision['"]/,
  /from ['"][^'"]*\/onboarding['"]/,
  /from ['"][^'"]*\/idempotency['"]/,
  /from ['"][^'"]*\/ai\/(?:jobs|provider|anthropic|gemini|fake|quota)['"]/,
  /\b(?:recordAttempt|confirmMastery|adaptCurrentExercise|reviseFuturePlan|completeOnboarding)\b/,
  /\/api\/(?:attempts|mastery|plan|onboarding)/,
  /\.(?:create|update|upsert|delete|createMany|updateMany|deleteMany)\(/,
  /\$executeRaw/,
]

describe('the playback path cannot write progress or call AI', () => {
  it.each(PLAYBACK_FILES)('%s imports and calls nothing that writes', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    for (const pattern of FORBIDDEN) expect(source, `${file} matches ${pattern}`).not.toMatch(pattern)
  })

  it('the only fetch in the player is the read-only playback endpoint', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/media/DemoVideo.tsx'), 'utf8')
    const calls = [...source.matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1])
    expect(calls).toEqual(['/api/media/playback?exerciseVersionId=${demo.exerciseVersionId}&variant=${demo.variant}'])
    expect(source).not.toMatch(/method:\s*['"]POST['"]/)
  })
})
