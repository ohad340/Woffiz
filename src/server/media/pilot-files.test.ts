import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { playableMedia } from '../../../test/media/fixtures'
import { getTechnique } from '@/domain/techniques/catalog'
import { validateBundle } from './bundle'
import { buildPilotFiles, type PilotScript } from './pilot-files'

const script = JSON.parse(readFileSync('pilot/mouthing-redirect-toy-1-standard/script.json', 'utf8')) as PilotScript

describe('pilot package: mouthing-redirect-toy@1 STANDARD (voice, captions, transcript timing)', () => {
  it('produces a metadata-valid bundle for the assembled 18.33 s clip (dry run on the synthetic stand-in clip, whose length is 20 s)', () => {
    const files = buildPilotFiles(script)
    expect(files.placeholders).toHaveLength(0) // the real clip and voices are produced: no 0000-00-00 dates left
    const standIn = buildPilotFiles({ ...script, video: { ...script.video, durationMs: 20_000 } })
    const result = validateBundle({ ...standIn, ...playableMedia() })
    expect(result.issues).toEqual([])
  })

  it('narration follows the catalog steps in order; STANDARD has no demonstrator line (the praise step carries no speech cue)', () => {
    const steps = script.timeline.filter((s) => s.kind === 'step').map((s) => s.stepId)
    const variant = getTechnique('mouthing-redirect-toy', 1)!.variants.STANDARD!
    expect(steps).toEqual(variant.steps.map((s) => s.id))
    expect(variant.steps.find((s) => s.id === 'praise-chewing')!.speechCue).toBeUndefined()
    expect(script.voice.filter((v) => v.speaker === 'demo')).toHaveLength(0)
    expect(script.voice.map((v) => v.text)).not.toContain('יופי, איזה צעצוע!')
    // the guidance of the praise step is still narrated, in its step
    const praise = script.timeline.find((s) => s.kind === 'step' && s.stepId === 'praise-chewing')!
    const last = script.voice.at(-1)!
    expect(last.text).toBe('כשהגור לועס את הצעצוע, משבחים אותו בקול רגוע.')
    expect(last.startMs).toBeGreaterThanOrEqual(praise.startMs)
    expect(last.endMs).toBeLessThanOrEqual(praise.endMs)
  })

  it('keeps the technique draft: nothing is approved or frozen by preparing the package', () => {
    expect(getTechnique('mouthing-redirect-toy', 1)!.review.status).toBe('draft')
    expect(JSON.parse(readFileSync('src/domain/techniques/techniques.lock.json', 'utf8'))).toEqual({})
  })
})
