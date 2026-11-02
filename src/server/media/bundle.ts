import { getTechnique } from '@/domain/techniques/catalog'
import { canonicalJson, fingerprintTechnique, sha256 } from '@/domain/techniques/fingerprint'
import { checkMediaParamCompatibility, demonstratedParams } from '@/domain/techniques/params'
import { manifestSchema, transcriptSchema, type Manifest, type TranscriptEntry } from './manifest'
import { inspectMp4, isWebp } from './mp4'
import { parseCaptions, plain } from './vtt'

export const BUNDLE_FORMAT = 'media-bundle-v1'
export const LIMITS = { videoBytes: 15 * 1024 * 1024, posterBytes: 300 * 1024, minDurationMs: 3_000, maxDurationMs: 40_000 } as const
/** Narration must end this long before a demonstrator line starts (and the other way round): no competing voices. */
export const MIN_VOICE_GAP_MS = 300
/** A caption cue must start within this long of the spoken line it shows. */
export const MAX_CAPTION_DRIFT_MS = 500
const HEBREW = /[֐-׿]/
const MARKUP = /<[a-z!/][^>]*>|https?:\/\/|www\./i

export type BundleInput = { manifest: unknown; video: Buffer; poster: Buffer; captions: string; transcript: unknown }

export type ValidatedBundle = {
  manifest: Manifest
  transcript: TranscriptEntry[]
  techniqueFingerprint: string
  videoSha256: string
  posterSha256: string
  captionsSha256: string
  transcriptSha256: string
  bundleFingerprint: string
  bytes: number
  width: number
  height: number
  durationMs: number
  hasAudio: boolean
}

export type BundleResult = { issues: string[]; bundle: ValidatedBundle | null }

/**
 * AUTOMATED METADATA VALIDATION. It proves structure and internal consistency: the file is a well-formed MP4 with
 * audio and video tracks, the manifest matches the technique definition, and captions, voice lines and transcript
 * agree with each other in text and timing metadata. It does NOT prove that the voice is intelligible Hebrew, that
 * the picture shows the demonstrated method, or that sound and image really line up: only the owner watching and
 * listening to the clip can establish that.
 */
export function validateBundle(input: BundleInput): BundleResult {
  const issues: string[] = []
  const parsed = manifestSchema.safeParse(input.manifest)
  if (!parsed.success) return { issues: parsed.error.issues.map((i) => `manifest: ${i.path.join('.')} ${i.message}`), bundle: null }
  const manifest = parsed.data

  const def = getTechnique(manifest.technique.key, manifest.technique.version)
  const variant = def?.variants[manifest.technique.variant]
  if (!def || !variant) {
    return { issues: [`unknown technique ${manifest.technique.key}@${manifest.technique.version} ${manifest.technique.variant}`], bundle: null }
  }
  const techniqueFingerprint = fingerprintTechnique(def)
  if (manifest.technique.fingerprint !== techniqueFingerprint) issues.push('manifest was made for a different definition of this technique version')

  // The clip must declare exactly what the catalog says it demonstrates, and that must be a compatible combination.
  for (const issue of checkMediaParamCompatibility(variant, demonstratedParams(variant), manifest.demonstratedParams)) {
    issues.push(`demonstrated parameters: ${issue}`)
  }

  // ----- Video file -----
  let durationMs = manifest.video.durationMs
  if (input.video.length === 0 || input.video.length > LIMITS.videoBytes) issues.push(`video: size must be 1 byte to ${LIMITS.videoBytes} bytes`)
  try {
    const info = inspectMp4(input.video)
    if (!info.faststart) issues.push('video: not faststart (moov must come before mdat)')
    if (!info.video) issues.push('video: no video track')
    else {
      if (info.video.codec !== 'avc1') issues.push(`video: codec ${info.video.codec} (expected avc1/H.264)`)
      if (info.video.width !== manifest.video.width || info.video.height !== manifest.video.height) issues.push('video: size differs from the manifest')
    }
    if (!info.audio) issues.push('video: no audio track (Hebrew voice guidance is required)')
    else if (info.audio.codec !== 'mp4a') issues.push(`video: audio codec ${info.audio.codec} (expected mp4a/AAC)`)
    if (!manifest.video.hasAudio) issues.push('manifest: hasAudio must be true')
    if (Math.abs(info.durationMs - manifest.video.durationMs) > 500) issues.push('video: duration differs from the manifest by more than 0.5 s')
    durationMs = info.durationMs
  } catch (error) {
    issues.push(`video: ${(error as Error).message}`)
  }
  if (durationMs < LIMITS.minDurationMs || durationMs > LIMITS.maxDurationMs) {
    issues.push(`video: duration must be ${LIMITS.minDurationMs / 1000}-${LIMITS.maxDurationMs / 1000} s`)
  }

  // ----- Poster -----
  if (!isWebp(input.poster)) issues.push('poster: not a WebP image')
  if (input.poster.length > LIMITS.posterBytes) issues.push(`poster: larger than ${LIMITS.posterBytes} bytes`)

  // ----- Timeline: demonstrated steps, in the order of the core, exactly once -----
  const stepIds = variant.steps.map((s) => s.id)
  let last = 0
  const seenSteps: string[] = []
  for (const seg of manifest.timeline) {
    if (seg.endMs <= seg.startMs) issues.push(`timeline: segment at ${seg.startMs} ms ends before it starts`)
    if (seg.startMs < last) issues.push(`timeline: segment at ${seg.startMs} ms overlaps the previous one`)
    if (seg.endMs > durationMs + 250) issues.push(`timeline: segment at ${seg.startMs} ms runs past the clip`)
    last = Math.max(last, seg.endMs)
    if (seg.kind === 'step') {
      if (!seg.stepId) issues.push('timeline: step segment without stepId')
      else seenSteps.push(seg.stepId)
    } else if (seg.stepId) issues.push('timeline: setting segment must not have a stepId')
  }
  if (seenSteps.join('|') !== stepIds.join('|')) {
    issues.push(`timeline: demonstrated steps [${seenSteps.join(', ')}] must equal the core [${stepIds.join(', ')}] in order`)
  }
  const windowOf = (id: string) => manifest.timeline.find((s) => s.kind === 'step' && s.stepId === id)

  // ----- Voice: Hebrew, no overlap, demonstrator lines at the right moments -----
  const voice = manifest.voice
  voice.forEach((seg, i) => {
    const label = `voice line at ${seg.startMs} ms`
    if (seg.endMs <= seg.startMs) issues.push(`${label} ends before it starts`)
    if (seg.endMs > durationMs + 250) issues.push(`${label} runs past the clip`)
    if (!HEBREW.test(seg.text)) issues.push(`${label} is not Hebrew`)
    if (MARKUP.test(seg.text)) issues.push(`${label} contains markup or a link`)
    const prev = voice[i - 1]
    if (prev) {
      if (seg.startMs < prev.endMs) issues.push(`${label} overlaps the previous line (competing voices)`)
      else if (seg.speaker !== prev.speaker && seg.startMs - prev.endMs < MIN_VOICE_GAP_MS) {
        issues.push(`${label} starts less than ${MIN_VOICE_GAP_MS} ms after the other speaker`)
      }
    }
    if (seg.speaker === 'demo') {
      const step = variant.steps.find((s) => s.id === seg.stepId)
      const win = seg.stepId ? windowOf(seg.stepId) : undefined
      if (!step || !step.speechCue) issues.push(`${label}: demonstrator speech belongs to a step with a speech cue`)
      else if (!win || seg.startMs < win.startMs || seg.endMs > win.endMs) issues.push(`${label} lies outside its step "${seg.stepId}"`)
    }
  })
  for (const step of variant.steps.filter((s) => s.speechCue)) {
    const lines = voice.filter((v) => v.speaker === 'demo' && v.stepId === step.id)
    if (lines.length !== 1) issues.push(`step "${step.id}" needs exactly one audible demonstrator line (${step.speechCue}), found ${lines.length}`)
  }

  // ----- Captions: valid, and every spoken line is shown in time -----
  const captionResult = parseCaptions(input.captions, durationMs)
  issues.push(...captionResult.issues)
  for (const seg of voice) {
    const shownBy = captionResult.cues.find(
      (cue) =>
        cue.startMs < seg.endMs &&
        cue.endMs > seg.startMs &&
        Math.abs(cue.startMs - seg.startMs) <= MAX_CAPTION_DRIFT_MS &&
        plain(cue.text).includes(plain(seg.text)),
    )
    if (!shownBy) issues.push(`captions do not show the ${seg.speaker} line at ${seg.startMs} ms in sync`)
  }

  // ----- Transcript: speech entries equal the voice lines, in order -----
  const transcriptParsed = transcriptSchema.safeParse(input.transcript)
  let transcript: TranscriptEntry[] = []
  if (!transcriptParsed.success) issues.push(...transcriptParsed.error.issues.map((i) => `transcript: ${i.path.join('.')} ${i.message}`))
  else {
    transcript = transcriptParsed.data
    for (let i = 1; i < transcript.length; i++) {
      if (transcript[i]!.startMs < transcript[i - 1]!.startMs) issues.push('transcript: entries are not in time order')
    }
    const speech = transcript.filter((e): e is Extract<TranscriptEntry, { type: 'speech' }> => e.type === 'speech')
    if (speech.length !== voice.length || speech.some((e, i) => e.speaker !== voice[i]!.speaker || e.startMs !== voice[i]!.startMs || e.text !== voice[i]!.text)) {
      issues.push('transcript: speech entries must equal the voice lines (speaker, time and text), in order')
    }
    for (const entry of transcript) {
      if (MARKUP.test(entry.text)) issues.push('transcript: contains markup or a link')
      if (!HEBREW.test(entry.text)) issues.push('transcript: an entry is not Hebrew')
    }
  }

  if (issues.length > 0) return { issues, bundle: null }

  const videoSha256 = sha256(input.video)
  const posterSha256 = sha256(input.poster)
  const captionsSha256 = sha256(input.captions)
  const transcriptSha256 = sha256(canonicalJson(transcript))
  const bundleFingerprint = sha256(
    canonicalJson({
      format: BUNDLE_FORMAT,
      videoSha256,
      posterSha256,
      captionsSha256,
      transcriptSha256,
      timeline: manifest.timeline,
      voice: manifest.voice,
      demonstratedParams: manifest.demonstratedParams,
      technique: { key: manifest.technique.key, version: manifest.technique.version, variant: manifest.technique.variant, fingerprint: techniqueFingerprint },
    }),
  )
  return {
    issues,
    bundle: {
      manifest,
      transcript,
      techniqueFingerprint,
      videoSha256,
      posterSha256,
      captionsSha256,
      transcriptSha256,
      bundleFingerprint,
      bytes: input.video.length,
      width: manifest.video.width,
      height: manifest.video.height,
      durationMs,
      hasAudio: true,
    },
  }
}
