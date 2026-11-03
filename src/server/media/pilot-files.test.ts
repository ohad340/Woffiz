import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { playableMedia } from '../../../test/media/fixtures'
import { getTechnique } from '@/domain/techniques/catalog'
import { validateBundle } from './bundle'
import { buildPilotFiles, type PilotScript } from './pilot-files'

const script = JSON.parse(readFileSync('pilot/mouthing-redirect-toy-1-standard/script.json', 'utf8')) as PilotScript

describe('pilot package: mouthing-redirect-toy@1 STANDARD (voice, captions, transcript timing)', () => {
  it('produces a metadata-valid bundle when a 20 s 1280x720 H.264+AAC clip arrives (dry run on the synthetic stand-in clip)', () => {
    const files = buildPilotFiles(script)
    expect(files.placeholders).toHaveLength(2) // production dates are not filled in until the clip exists
    const result = validateBundle({ ...files, ...playableMedia() })
    expect(result.issues).toEqual([])
  })

  it('narration and the demonstrator line follow the catalog steps in order, and the praise line sits in the praise step', () => {
    const steps = script.timeline.filter((s) => s.kind === 'step').map((s) => s.stepId)
    expect(steps).toEqual(getTechnique('mouthing-redirect-toy', 1)!.variants.STANDARD!.steps.map((s) => s.id))
    const demo = script.voice.filter((v) => v.speaker === 'demo')
    expect(demo).toHaveLength(1)
    expect(demo[0]!.stepId).toBe('praise-chewing')
  })

  it('keeps the technique draft: nothing is approved or frozen by preparing the package', () => {
    expect(getTechnique('mouthing-redirect-toy', 1)!.review.status).toBe('draft')
    expect(JSON.parse(readFileSync('src/domain/techniques/techniques.lock.json', 'utf8'))).toEqual({})
  })
})
