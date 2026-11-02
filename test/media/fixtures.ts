// SYNTHETIC TEST FIXTURES. The "video" built here is a structurally valid MP4 container with empty sample data:
// it has the right boxes (tracks, codec names, duration, faststart) but nothing that can be watched or heard.
// It exists only to exercise metadata validation and must never be published or shown as a real clip.
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
  { speaker: 'demo', startMs: 14000, endMs: 15200, text: 'יופי, איזה צעצוע!', stepId: 'praise-chewing' },
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
    cue(4, 14000, 15200, '(המדגים:) יופי, איזה צעצוע!'),
    '',
    cue(5, 17200, 19800, 'משבחים כשהוא לועס צעצוע, לא ידיים.'),
    '',
  ].join('\n')
  const transcript = [
    { type: 'speech', speaker: 'narrator', startMs: 200, text: MOUTHING_VOICE[0].text },
    { type: 'visual', startMs: 3000, text: '[המבוגר לא מזיז את היד]' },
    { type: 'speech', speaker: 'narrator', startMs: 3200, text: MOUTHING_VOICE[1].text },
    { type: 'speech', speaker: 'narrator', startMs: 8200, text: MOUTHING_VOICE[2].text },
    { type: 'visual', startMs: 10000, text: '[הגור עובר ללעוס את הצעצוע]' },
    { type: 'speech', speaker: 'demo', startMs: 14000, text: MOUTHING_VOICE[3].text },
    { type: 'speech', speaker: 'narrator', startMs: 17200, text: MOUTHING_VOICE[4].text },
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
