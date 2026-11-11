// SYNTHETIC TEST FIXTURES. The "video" built here is a structurally valid MP4 container with empty sample data:
// it has the right boxes (tracks, codec names, duration, faststart) but nothing that can be watched or heard.
// It exists only to exercise metadata validation and must never be published or shown as a real clip.
// playableMedia() is the one exception: a really decodable SYNTHETIC TEST CLIP for browser playback tests (still not training content).
import { readFileSync } from 'node:fs'
import { getTechnique } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { demonstratedParams } from '@/domain/techniques/params'
import type { BundleInput } from '@/server/media/bundle'

function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length + 8, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}

function track(handler: 'vide' | 'soun', codec: string, width = 0, height = 0): Buffer {
  const tkhd = Buffer.alloc(84)
  tkhd.writeUInt32BE(width * 65536, 76)
  tkhd.writeUInt32BE(height * 65536, 80)
  const hdlr = Buffer.alloc(25)
  hdlr.write(handler, 8, 'latin1')
  const stsd = Buffer.alloc(24)
  stsd.writeUInt32BE(1, 4)
  stsd.writeUInt32BE(16, 8)
  stsd.write(codec, 12, 'latin1')
  return box('trak', box('tkhd', tkhd), box('mdia', box('hdlr', hdlr), box('minf', box('stbl', box('stsd', stsd)))))
}

export type Mp4Options = { durationMs?: number; faststart?: boolean; audio?: boolean; video?: boolean; videoCodec?: string; audioCodec?: string; width?: number; height?: number }

export function buildMp4(options: Mp4Options = {}): Buffer {
  const { durationMs = 20_000, faststart = true, audio = true, video = true, videoCodec = 'avc1', audioCodec = 'mp4a', width = 1280, height = 720 } = options
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomiso2avc1mp41', 'latin1'))
  const mvhd = Buffer.alloc(100)
  mvhd.writeUInt32BE(1000, 12)
  mvhd.writeUInt32BE(durationMs, 16)
  const moov = box('moov', box('mvhd', mvhd), ...(video ? [track('vide', videoCodec, width, height)] : []), ...(audio ? [track('soun', audioCodec)] : []))
  const mdat = box('mdat', Buffer.alloc(64))
  return Buffer.concat(faststart ? [ftyp, moov, mdat] : [ftyp, mdat, moov])
}

export function buildWebp(size = 64): Buffer {
  const out = Buffer.alloc(Math.max(size, 20))
  out.write('RIFF', 0, 'latin1')
  out.writeUInt32LE(out.length - 8, 4)
  out.write('WEBP', 8, 'latin1')
  return out
}

const cue = (n: number, start: number, end: number, text: string) => {
  const t = (ms: number) => {
    const s = Math.floor(ms / 1000)
    return `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`.replace(/^00:/, '')
  }
  return `${n}\n${t(start)} --> ${t(end)}\n${text}`
}

/** Voice lines of the mouthing-redirect-toy@1 STANDARD storyboard (20 s). */
export const MOUTHING_VOICE = [
  { speaker: 'narrator', startMs: 200, endMs: 2800, text: 'כשהגור נוגס ביד במשחק' },
  { speaker: 'narrator', startMs: 3200, endMs: 7800, text: 'לא מושכים את היד. נשארים בלי תנועה.' },
  { speaker: 'narrator', startMs: 8200, endMs: 12500, text: 'מקרבים צעצוע מתאים לפה שלו.' },
  { speaker: 'narrator', startMs: 17200, endMs: 19800, text: 'משבחים כשהוא לועס צעצוע, לא ידיים.' },
] as const

export function validBundleInput(): BundleInput {
  const def = getTechnique('mouthing-redirect-toy', 1)!
  const manifest = {
    schema: 'woffiz-media-manifest-v1',
    technique: { key: def.key, version: def.version, variant: 'STANDARD', fingerprint: fingerprintTechnique(def) },
    demonstratedParams: demonstratedParams(def.variants.STANDARD!),
    video: { durationMs: 20_000, width: 1280, height: 720, hasAudio: true },
    timeline: [
      { kind: 'setting', startMs: 0, endMs: 3000 },
      { kind: 'step', stepId: 'stay-still', startMs: 3000, endMs: 8000 },
      { kind: 'step', stepId: 'offer-toy', startMs: 8000, endMs: 13000 },
      { kind: 'step', stepId: 'praise-chewing', startMs: 13000, endMs: 17000 },
      { kind: 'setting', startMs: 17000, endMs: 20000 },
    ],
    voice: MOUTHING_VOICE.map((v) => ({ ...v })),
    production: {
      kind: 'ai-generated',
      video: { vendor: 'test-fixture', model: 'none', date: '2026-11-02' },
      voice: { vendor: 'test-fixture', voiceName: 'none', date: '2026-11-02' },
      assembly: 'synthetic container, no media',
    },
  }
  const captions = [
    'WEBVTT',
    '',
    cue(1, 200, 2800, 'כשהגור נוגס ביד במשחק'),
    '',
    cue(2, 3200, 7800, 'לא מושכים את היד. נשארים בלי תנועה.'),
    '',
    cue(3, 8200, 12500, 'מקרבים צעצוע מתאים לפה שלו.'),
    '',
    cue(4, 17200, 19800, 'משבחים כשהוא לועס צעצוע, לא ידיים.'),
    '',
  ].join('\n')
  const transcript = [
    { type: 'speech', speaker: 'narrator', startMs: 200, text: MOUTHING_VOICE[0].text },
    { type: 'visual', startMs: 3000, text: '[המבוגר לא מזיז את היד]' },
    { type: 'speech', speaker: 'narrator', startMs: 3200, text: MOUTHING_VOICE[1].text },
    { type: 'speech', speaker: 'narrator', startMs: 8200, text: MOUTHING_VOICE[2].text },
    { type: 'visual', startMs: 10000, text: '[הגור עובר ללעוס את הצעצוע]' },
    { type: 'speech', speaker: 'narrator', startMs: 17200, text: MOUTHING_VOICE[3].text },
  ]
  return { manifest, video: buildMp4(), poster: buildWebp(), captions, transcript }
}

/** A valid bundle for the same slot that differs from the base one (the end of the first step moves by `variant` ms). */
export function variantBundleInput(variant: number): BundleInput {
  const input = validBundleInput()
  if (variant === 0) return input
  const manifest = structuredClone(input.manifest) as { timeline: { startMs: number; endMs: number }[] }
  manifest.timeline[1]!.endMs = 8000 + variant
  manifest.timeline[2]!.startMs = 8000 + variant
  return { ...input, manifest }
}

/**
 * The really decodable SYNTHETIC TEST CLIP (H.264 + AAC, moving shapes, test tones, 20 s, 1280x720; scripts/make-playable-fixture.mjs).
 * Not training content: no dog, no speech. Its tones sit at the voice lines of nameLookBundleInput.
 */
export function playableMedia(): { video: Buffer; poster: Buffer } {
  return { video: readFileSync(new URL('./playable/clip.mp4', import.meta.url)), poster: readFileSync(new URL('./playable/poster.webp', import.meta.url)) }
}

/**
 * Synthetic bundle of name-look@1 (both variants). Two audible demonstrator lines: the dog's name and the praise, each
 * inside its step. `shift` moves the boundary between the two steps, so every call can make a distinct bundle.
 */
export function nameLookBundleInput(variant: 'STANDARD' | 'EASIER', shift = 0, options: { playable?: boolean } = {}): BundleInput {
  const def = getTechnique('name-look', 1)!
  const [first, second] = variant === 'STANDARD' ? ['say-name-once', 'treat-on-look'] : ['reward-glance', 'treat-on-look']
  const lines =
    variant === 'STANDARD'
      ? { a: 'אומרים את שמו פעם אחת.', firstDemo: 'בוני!', b: 'כשהוא מסתכל, אומרים יופי ונותנים חטיף.', secondDemo: 'יופי!' }
      : { a: 'כל פעם שהגור מציץ, נותנים חטיף.', firstDemo: 'יופי!', b: 'עכשיו אומרים את שמו פעם אחת.', secondDemo: 'בוני!' }
  const voice = [
    { speaker: 'narrator', startMs: 300, endMs: 1800, text: 'עומדים מול הגור בחדר שקט.' },
    { speaker: 'narrator', startMs: 2200, endMs: 5000, text: lines.a },
    { speaker: 'demo', startMs: 5400, endMs: 6200, text: lines.firstDemo, stepId: first },
    { speaker: 'narrator', startMs: 9200 + shift, endMs: 12000 + shift, text: lines.b },
    { speaker: 'demo', startMs: 12400 + shift, endMs: 13200 + shift, text: lines.secondDemo, stepId: second },
    { speaker: 'narrator', startMs: 16200, endMs: 19500, text: 'מתגמלים כל מבט.' },
  ]
  const manifest = {
    schema: 'woffiz-media-manifest-v1',
    technique: { key: def.key, version: def.version, variant, fingerprint: fingerprintTechnique(def) },
    demonstratedParams: demonstratedParams(def.variants[variant]!),
    video: { durationMs: 20_000, width: 1280, height: 720, hasAudio: true },
    timeline: [
      { kind: 'setting', startMs: 0, endMs: 2000 },
      { kind: 'step', stepId: first, startMs: 2000, endMs: 9000 + shift },
      { kind: 'step', stepId: second, startMs: 9000 + shift, endMs: 16000 },
      { kind: 'setting', startMs: 16000, endMs: 20000 },
    ],
    voice,
    production: {
      kind: 'ai-generated',
      video: { vendor: 'test-fixture', model: 'none', date: '2026-11-03' },
      voice: { vendor: 'test-fixture', voiceName: 'none', date: '2026-11-03' },
      assembly: 'synthetic container, no media',
    },
  }
  const captions = ['WEBVTT', '', ...voice.flatMap((v, i) => [cue(i + 1, v.startMs, v.endMs, v.speaker === 'demo' ? `(המדגים:) ${v.text}` : v.text), ''])].join('\n')
  const transcript = voice.map((v) => ({ type: 'speech', speaker: v.speaker, startMs: v.startMs, text: v.text }))
  const media = options.playable ? playableMedia() : { video: buildMp4(), poster: buildWebp() }
  return { manifest, ...media, captions, transcript }
}

/** Synthetic EASIER-variant bundle of mouthing-redirect-toy@1 (offer the toy early, praise chewing). */
export function easierBundleInput(): BundleInput {
  const def = getTechnique('mouthing-redirect-toy', 1)!
  const voice = [
    { speaker: 'narrator', startMs: 200, endMs: 2800, text: 'כשהגור מתחיל להתרגש' },
    { speaker: 'narrator', startMs: 3200, endMs: 9500, text: 'מציעים לו צעצוע לפני שהוא נוגס.' },
    { speaker: 'demo', startMs: 11000, endMs: 12200, text: 'יופי, איזה צעצוע!', stepId: 'praise-chewing' },
    { speaker: 'narrator', startMs: 15200, endMs: 19800, text: 'משבחים כשהוא לועס צעצוע.' },
  ]
  const manifest = {
    schema: 'woffiz-media-manifest-v1',
    technique: { key: def.key, version: def.version, variant: 'EASIER', fingerprint: fingerprintTechnique(def) },
    demonstratedParams: demonstratedParams(def.variants.EASIER!),
    video: { durationMs: 20_000, width: 1280, height: 720, hasAudio: true },
    timeline: [
      { kind: 'setting', startMs: 0, endMs: 3000 },
      { kind: 'step', stepId: 'offer-toy-early', startMs: 3000, endMs: 10000 },
      { kind: 'step', stepId: 'praise-chewing', startMs: 10000, endMs: 15000 },
      { kind: 'setting', startMs: 15000, endMs: 20000 },
    ],
    voice,
    production: {
      kind: 'ai-generated',
      video: { vendor: 'test-fixture', model: 'none', date: '2026-11-02' },
      voice: { vendor: 'test-fixture', voiceName: 'none', date: '2026-11-02' },
      assembly: 'synthetic container, no media',
    },
  }
  const captions = ['WEBVTT', '', ...voice.flatMap((v, i) => [cue(i + 1, v.startMs, v.endMs, v.speaker === 'demo' ? `(המדגים:) ${v.text}` : v.text), ''])].join('\n')
  const transcript = voice.map((v) => ({ type: 'speech', speaker: v.speaker, startMs: v.startMs, text: v.text }))
  return { manifest, video: buildMp4(), poster: buildWebp(), captions, transcript }
}
