export type Cue = { startMs: number; endMs: number; text: string }

export const MAX_CUE_LINES = 2
export const MAX_LINE_CHARS = 42

const HEBREW = /[\u0590-\u05FF]/
const TIMING = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})(?:\s+.*)?$/

const ms = (h: string | undefined, m: string, s: string, f: string) => Number(h ?? 0) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(f)

/**
 * Parses and validates Hebrew WebVTT captions. Returns the cues and a list of issues (empty = valid).
 * Plain text only: no tags, at most 2 lines of 42 characters, cues ordered and non-overlapping, inside the clip.
 */
export function parseCaptions(vtt: string, durationMs: number): { cues: Cue[]; issues: string[] } {
  const issues: string[] = []
  const cues: Cue[] = []
  const text = vtt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(text)) return { cues, issues: ['captions: missing WEBVTT header'] }

  const blocks = text.split(/\n{2,}/).slice(1)
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0)
    if (lines.length === 0 || lines[0]!.startsWith('NOTE')) continue
    const timingIndex = lines.findIndex((l) => l.includes('-->'))
    if (timingIndex < 0 || timingIndex > 1) {
      issues.push('captions: block without a timing line')
      continue
    }
    const match = TIMING.exec(lines[timingIndex]!)
    if (!match) {
      issues.push(`captions: bad timing line "${lines[timingIndex]}"`)
      continue
    }
    const startMs = ms(match[1], match[2]!, match[3]!, match[4]!)
    const endMs = ms(match[5], match[6]!, match[7]!, match[8]!)
    const body = lines.slice(timingIndex + 1)
    const label = `cue at ${startMs} ms`
    if (endMs <= startMs) issues.push(`captions: ${label} ends before it starts`)
    if (body.length === 0) issues.push(`captions: ${label} is empty`)
    if (body.length > MAX_CUE_LINES) issues.push(`captions: ${label} has more than ${MAX_CUE_LINES} lines`)
    for (const line of body) {
      if (line.length > MAX_LINE_CHARS) issues.push(`captions: ${label} has a line over ${MAX_LINE_CHARS} characters`)
      if (/[<>]/.test(line)) issues.push(`captions: ${label} contains markup`)
    }
    const joined = body.join(' ')
    if (!HEBREW.test(joined)) issues.push(`captions: ${label} is not Hebrew`)
    cues.push({ startMs, endMs, text: joined })
  }

  if (cues.length === 0) issues.push('captions: no cues')
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!
    if (cue.endMs > durationMs + 250) issues.push(`captions: cue at ${cue.startMs} ms runs past the end of the clip`)
    const previous = cues[i - 1]
    if (previous && cue.startMs < previous.endMs) issues.push(`captions: cue at ${cue.startMs} ms overlaps the previous cue`)
  }
  return { cues, issues }
}

/** Letters and digits only, so punctuation, quotes and speaker labels do not matter when comparing spoken text. */
export const plain = (text: string) => text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
