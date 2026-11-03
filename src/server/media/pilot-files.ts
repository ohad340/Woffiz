import { getTechnique } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { demonstratedParams } from '@/domain/techniques/params'
import type { TechniqueVariantName } from '@/domain/techniques/types'
import type { BundleInput } from './bundle'

/**
 * Authoring source of one production bundle (pilot/<name>/script.json): the Hebrew voice lines with their timing, the
 * demonstrated timeline and the visual notes. The three text files of the bundle (manifest, captions, transcript) are
 * generated from it, so the timing lives in one place. After the real voice audio exists, the times are re-measured from
 * it and only this file is edited.
 */
export type PilotScript = {
  technique: { key: string; version: number; variant: TechniqueVariantName }
  video: { durationMs: number; width: number; height: number }
  timeline: { kind: 'setting' | 'step'; stepId?: string; startMs: number; endMs: number }[]
  voice: { speaker: 'narrator' | 'demo'; startMs: number; endMs: number; text: string; stepId?: string }[]
  visual: { startMs: number; text: string }[]
  /** Dates of 0000-00-00 mean "not produced yet": such a manifest is only for dry-run validation. */
  production: {
    video: { vendor: string; model: string; date: string }
    voice: { vendor: string; voiceName: string; date: string }
    assembly: string
  }
}

export const isPlaceholderDate = (date: string) => date === '0000-00-00'

const clock = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

/** manifest + captions + transcript of the bundle, derived from the script and the CURRENT catalog definition. */
export function buildPilotFiles(script: PilotScript): Pick<BundleInput, 'manifest' | 'captions' | 'transcript'> & { placeholders: string[] } {
  const def = getTechnique(script.technique.key, script.technique.version)
  const variant = def?.variants[script.technique.variant]
  if (!def || !variant) throw new Error(`unknown technique ${script.technique.key}@${script.technique.version} ${script.technique.variant}`)
  const manifest = {
    schema: 'woffiz-media-manifest-v1',
    technique: { ...script.technique, fingerprint: fingerprintTechnique(def) },
    demonstratedParams: demonstratedParams(variant),
    video: { ...script.video, hasAudio: true },
    timeline: script.timeline,
    voice: script.voice,
    production: { kind: 'ai-generated', ...script.production },
  }
  const captions = [
    'WEBVTT',
    '',
    ...script.voice.flatMap((v, i) => [`${i + 1}`, `${clock(v.startMs)} --> ${clock(v.endMs)}`, v.speaker === 'demo' ? `(המדגים:) ${v.text}` : v.text, '']),
  ].join('\n')
  const transcript = [
    ...script.voice.map((v) => ({ type: 'speech' as const, speaker: v.speaker, startMs: v.startMs, text: v.text })),
    ...script.visual.map((v) => ({ type: 'visual' as const, startMs: v.startMs, text: v.text })),
  ].sort((a, b) => a.startMs - b.startMs)
  const placeholders = [script.production.video.date, script.production.voice.date].filter(isPlaceholderDate)
  return { manifest, captions, transcript, placeholders }
}
