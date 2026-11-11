import { z } from 'zod'

const ms = z.number().int().min(0).max(600_000)

export const timelineSegmentSchema = z
  .object({
    /** "setting" = illustrative scene, "step" = a demonstrated core step (stepId required). */
    kind: z.enum(['setting', 'step']),
    stepId: z.string().min(1).max(60).optional(),
    startMs: ms,
    endMs: ms,
  })
  .strict()

export const voiceSegmentSchema = z
  .object({
    speaker: z.enum(['narrator', 'demo']),
    startMs: ms,
    endMs: ms,
    text: z.string().trim().min(1).max(200),
    stepId: z.string().min(1).max(60).optional(),
  })
  .strict()

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const manifestSchema = z
  .object({
    schema: z.literal('woffiz-media-manifest-v1'),
    technique: z
      .object({
        key: z.string().regex(/^[a-z0-9-]{3,60}$/),
        version: z.number().int().min(1).max(1000),
        variant: z.enum(['STANDARD', 'EASIER']),
        fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    /** The parameter values the fixed clip shows. Must equal the catalog's "demonstrated" values. */
    demonstratedParams: z.record(z.string(), z.number().int()),
    video: z
      .object({ durationMs: ms, width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096), hasAudio: z.boolean() })
      .strict(),
    timeline: z.array(timelineSegmentSchema).min(1).max(40),
    voice: z.array(voiceSegmentSchema).min(1).max(40),
    production: z
      .object({
        kind: z.literal('ai-generated'),
        video: z.object({ vendor: z.string().min(1).max(80), model: z.string().min(1).max(80), date: isoDate }).strict(),
        voice: z.object({ vendor: z.string().min(1).max(80), voiceName: z.string().min(1).max(80), date: isoDate }).strict(),
        assembly: z.string().min(1).max(200),
      })
      .strict(),
  })
  .strict()

export type Manifest = z.infer<typeof manifestSchema>
export type TimelineSegment = z.infer<typeof timelineSegmentSchema>
export type VoiceSegment = z.infer<typeof voiceSegmentSchema>

export const transcriptEntrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('speech'), speaker: z.enum(['narrator', 'demo']), startMs: ms, text: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal('visual'), startMs: ms, text: z.string().trim().min(1).max(200) }).strict(),
])
export const transcriptSchema = z.array(transcriptEntrySchema).min(1).max(80)
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>
