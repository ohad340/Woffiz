import { describe, expect, it } from 'vitest'
import { buildMp4, buildWebp, easierBundleInput, nameLookBundleInput, validBundleInput } from '../../../test/media/fixtures'
import { validateBundle, type BundleInput } from './bundle'
import { inspectMp4, isWebp } from './mp4'
import { parseCaptions } from './vtt'

type Mutable = Record<string, unknown> & { voice: Record<string, unknown>[]; timeline: Record<string, unknown>[]; demonstratedParams: Record<string, number> }

/** A fresh valid input with the manifest edited by `edit`. */
function withManifest(edit: (m: Mutable) => void, extra: Partial<BundleInput> = {}): BundleInput {
  const input = validBundleInput()
  const manifest = structuredClone(input.manifest) as Mutable
  edit(manifest)
  return { ...input, manifest, ...extra }
}

const issuesOf = (input: BundleInput) => validateBundle(input).issues

describe('MP4 inspection (metadata only)', () => {
  it('reads tracks, codecs, duration, size and faststart', () => {
    const info = inspectMp4(buildMp4({ durationMs: 12_345 }))
    expect(info).toMatchObject({ brand: 'isom', faststart: true, durationMs: 12_345, video: { codec: 'avc1', width: 1280, height: 720 }, audio: { codec: 'mp4a' } })
  })

  it('detects missing audio, a moov box at the end, and garbage', () => {
    expect(inspectMp4(buildMp4({ audio: false })).audio).toBeNull()
    expect(inspectMp4(buildMp4({ faststart: false })).faststart).toBe(false)
    expect(() => inspectMp4(Buffer.from('not an mp4 file at all'))).toThrow(/ftyp/)
  })

  it('recognises WebP by its container header only', () => {
    expect(isWebp(buildWebp())).toBe(true)
    expect(isWebp(Buffer.from('GIF89a......................'))).toBe(false)
  })
})

describe('WebVTT captions', () => {
  const ok = 'WEBVTT\n\n00:01.000 --> 00:03.000\nשלום לכם\n'

  it('accepts Hebrew plain-text cues inside the clip', () => {
    const { cues, issues } = parseCaptions(ok, 10_000)
    expect(issues).toEqual([])
    expect(cues).toEqual([{ startMs: 1000, endMs: 3000, text: 'שלום לכם' }])
  })

  it('rejects markup, English-only cues, overlap, long lines, too many lines, cues past the end and a missing header', () => {
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:03.000\n<b>שלום</b>\n', 10_000).issues.join()).toMatch(/markup/)
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:03.000\nhello\n', 10_000).issues.join()).toMatch(/not Hebrew/)
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:03.000\nשלום\n\n00:02.000 --> 00:04.000\nעוד\n', 10_000).issues.join()).toMatch(/overlaps/)
    expect(parseCaptions(`WEBVTT\n\n00:01.000 --> 00:03.000\n${'א'.repeat(43)}\n`, 10_000).issues.join()).toMatch(/over 42/)
    expect(parseCaptions('WEBVTT\n\n00:01.000 --> 00:03.000\nא\nב\nג\n', 10_000).issues.join()).toMatch(/more than 2 lines/)
    expect(parseCaptions(ok, 2_000).issues.join()).toMatch(/past the end/)
    expect(parseCaptions('00:01.000 --> 00:03.000\nשלום\n', 10_000).issues).toEqual(['captions: missing WEBVTT header'])
  })
})

describe('bundle validation (automated metadata checks, not a review of the clip)', () => {
  it('accepts the synthetic fixture bundle and fingerprints every part', () => {
    const result = validateBundle(validBundleInput())
    expect(result.issues).toEqual([])
    const b = result.bundle!
    expect(b.bundleFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect([b.videoSha256, b.posterSha256, b.captionsSha256, b.transcriptSha256].every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true)
    expect(b).toMatchObject({ width: 1280, height: 720, durationMs: 20_000, hasAudio: true })
  })

  it('binds the fingerprint to every content part and to the technique definition', () => {
    const base = validateBundle(validBundleInput()).bundle!.bundleFingerprint
    const fp = (input: BundleInput) => validateBundle(input).bundle?.bundleFingerprint
    expect(fp(validBundleInput())).toBe(base)
    const v = validBundleInput()
    expect(fp({ ...v, video: Buffer.concat([v.video.subarray(0, v.video.length - 1), Buffer.from([1])]) })).not.toBe(base)
    expect(fp({ ...v, poster: buildWebp(80) })).not.toBe(base)
    expect(fp({ ...v, captions: v.captions.replace('מקרבים', 'מקרבים נא') })).toBeUndefined() // caption no longer matches the spoken line
    const changedTranscript = (v.transcript as { text: string }[]).map((e, i) => (i === 1 ? { ...e, text: '[המבוגר נשאר בלי תנועה]' } : e))
    expect(fp({ ...v, transcript: changedTranscript })).not.toBe(base)
    expect(fp(withManifest((m) => (m.timeline[1]!.endMs = 8100)))).not.toBe(base)
    expect(fp(withManifest((m) => (m.voice[0]!.endMs = 2700)))).not.toBe(base)
  })

  it('rejects a clip made for a different definition of the technique', () => {
    expect(issuesOf(withManifest((m) => ((m.technique as { fingerprint: string }).fingerprint = 'a'.repeat(64))))).toContain('manifest was made for a different definition of this technique version')
    expect(issuesOf(withManifest((m) => ((m.technique as { key: string }).key = 'no-such-technique')))[0]).toMatch(/unknown technique/)
  })

  it('rejects a clip that demonstrates other parameter values than the catalog', () => {
    expect(issuesOf(withManifest((m) => (m.demonstratedParams.rounds = 4))).join()).toMatch(/media demonstrates rounds=4/)
    expect(issuesOf(withManifest((m) => delete m.demonstratedParams.rounds)).join()).toMatch(/rounds/)
  })

  it('rejects a video without audio, not faststart, wrong codec, wrong size or wrong duration', () => {
    const v = validBundleInput()
    expect(issuesOf({ ...v, video: buildMp4({ audio: false }) }).join()).toMatch(/no audio track/)
    expect(issuesOf({ ...v, video: buildMp4({ faststart: false }) }).join()).toMatch(/not faststart/)
    expect(issuesOf({ ...v, video: buildMp4({ videoCodec: 'hvc1' }) }).join()).toMatch(/expected avc1/)
    expect(issuesOf({ ...v, video: buildMp4({ width: 640, height: 360 }) }).join()).toMatch(/size differs/)
    expect(issuesOf({ ...v, video: buildMp4({ durationMs: 25_000 }) }).join()).toMatch(/duration differs/)
    expect(issuesOf({ ...v, video: Buffer.from('nope') }).join()).toMatch(/video:/)
  })

  it('rejects demonstrated steps that are missing, reordered or repeated', () => {
    const reordered = withManifest((m) => {
      const [a, b] = [m.timeline[1]!.stepId, m.timeline[2]!.stepId]
      m.timeline[1]!.stepId = b
      m.timeline[2]!.stepId = a
    })
    expect(issuesOf(reordered).join()).toMatch(/must equal the core/)
    expect(issuesOf(withManifest((m) => m.timeline.splice(2, 1))).join()).toMatch(/must equal the core/)
  })

  it('requires an audible demonstrator line at every speech-cue step, at the right moment', () => {
    expect(issuesOf(withManifest((m) => m.voice.splice(3, 1))).join()).toMatch(/needs exactly one audible demonstrator line .*found 0/)
    expect(issuesOf(withManifest((m) => ((m.voice[3] as { stepId: string }).stepId = 'offer-toy'))).join()).toMatch(/speech cue/)
    expect(issuesOf(withManifest((m) => { m.voice[3]!.startMs = 12_800; m.voice[3]!.endMs = 14_000 })).join()).toMatch(/lies outside its step|after the other speaker/)
  })

  it('rejects competing voices and too little space between speakers', () => {
    expect(issuesOf(withManifest((m) => (m.voice[2]!.endMs = 14_500))).join()).toMatch(/overlaps the previous line/)
    expect(issuesOf(withManifest((m) => (m.voice[2]!.endMs = 13_800))).join()).toMatch(/less than 300 ms/)
  })

  it('rejects captions that do not show a spoken line, or show it out of sync', () => {
    const v = validBundleInput()
    expect(issuesOf({ ...v, captions: v.captions.replace(/00:14\.000 --> 00:15\.200/, '00:16.000 --> 00:16.900') }).join()).toMatch(/do not show the demo line/)
    expect(issuesOf({ ...v, captions: 'WEBVTT\n\n00:01.000 --> 00:03.000\nמשהו אחר\n' }).join()).toMatch(/do not show/)
  })

  it('requires the transcript speech entries to equal the voice lines, in order', () => {
    const v = validBundleInput()
    const swapped = [...(v.transcript as object[])]
    ;[swapped[2], swapped[3]] = [swapped[3]!, swapped[2]!]
    expect(issuesOf({ ...v, transcript: swapped }).join()).toMatch(/transcript/)
    expect(issuesOf({ ...v, transcript: (v.transcript as object[]).filter((e) => (e as { type: string }).type !== 'speech') }).join()).toMatch(/speech entries must equal/)
  })

  it('rejects a poster that is not WebP or is too large, and a non-Hebrew voice line', () => {
    const v = validBundleInput()
    expect(issuesOf({ ...v, poster: Buffer.from('JPEGDATA..............') }).join()).toMatch(/not a WebP/)
    expect(issuesOf({ ...v, poster: buildWebp(400 * 1024) }).join()).toMatch(/larger than/)
    expect(issuesOf(withManifest((m) => (m.voice[0]!.text = 'hello there'))).join()).toMatch(/not Hebrew/)
  })

  it('rejects a manifest that is not strictly the expected shape', () => {
    expect(issuesOf(withManifest((m) => (m.extra = 1)))[0]).toMatch(/^manifest:/)
    expect(issuesOf(withManifest((m) => ((m.production as { kind: string }).kind = 'recorded')))[0]).toMatch(/^manifest: production\.kind/)
  })
})

describe('the other synthetic fixtures are valid bundles too', () => {
  it.each([
    ['mouthing EASIER', () => easierBundleInput()],
    ['name-look STANDARD', () => nameLookBundleInput('STANDARD')],
    ['name-look EASIER', () => nameLookBundleInput('EASIER', 300)],
  ])('%s', (_name, make) => {
    expect(validateBundle(make()).issues).toEqual([])
  })
})

describe('the playable synthetic test clip (scripts/make-playable-fixture.mjs)', () => {
  it('is a valid bundle with a real H.264 + AAC track pair, faststart, 20 s, 1280x720', () => {
    const input = nameLookBundleInput('STANDARD', 0, { playable: true })
    expect(validateBundle(input).issues).toEqual([])
    expect(inspectMp4(input.video)).toMatchObject({ faststart: true, video: { codec: 'avc1', width: 1280, height: 720 }, audio: { codec: 'mp4a' } })
    expect(input.video.length).toBeGreaterThan(100_000) // real samples, unlike the empty containers of buildMp4()
    expect(isWebp(input.poster)).toBe(true)
  })
})
