/**
 * Minimal ISO-BMFF (MP4) inspection for ingest. This validates METADATA only: it proves the file is a
 * well-formed MP4 with a video track, an audio track and the index up front. It cannot tell whether the audio is
 * intelligible Hebrew or whether picture and voice are in sync: that needs a person to watch and listen.
 */
export type Mp4Info = {
  brand: string
  /** moov before mdat, so playback can start before the whole file is downloaded. */
  faststart: boolean
  durationMs: number
  video: { codec: string; width: number; height: number } | null
  audio: { codec: string } | null
}

type Box = { type: string; start: number; end: number; bodyStart: number }

function boxes(buf: Buffer, from: number, to: number): Box[] {
  const out: Box[] = []
  let pos = from
  while (pos + 8 <= to) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let header = 8
    if (size === 1) {
      if (pos + 16 > to) break
      size = Number(buf.readBigUInt64BE(pos + 8))
      header = 16
    } else if (size === 0) {
      size = to - pos
    }
    if (size < header || pos + size > to) break
    out.push({ type, start: pos, end: pos + size, bodyStart: pos + header })
    pos += size
  }
  return out
}

const child = (buf: Buffer, box: Box, type: string) => boxes(buf, box.bodyStart, box.end).find((b) => b.type === type)

export function inspectMp4(buf: Buffer): Mp4Info {
  const top = boxes(buf, 0, buf.length)
  const ftyp = top.find((b) => b.type === 'ftyp')
  if (!ftyp || top[0] !== ftyp) throw new Error('not an MP4: no ftyp box first')
  const moov = top.find((b) => b.type === 'moov')
  const mdat = top.find((b) => b.type === 'mdat')
  if (!moov) throw new Error('MP4 has no moov box')
  if (!mdat) throw new Error('MP4 has no media data')

  const mvhd = child(buf, moov, 'mvhd')
  if (!mvhd) throw new Error('MP4 has no mvhd box')
  const version = buf.readUInt8(mvhd.bodyStart)
  const timescale = version === 1 ? buf.readUInt32BE(mvhd.bodyStart + 20) : buf.readUInt32BE(mvhd.bodyStart + 12)
  const duration = version === 1 ? Number(buf.readBigUInt64BE(mvhd.bodyStart + 24)) : buf.readUInt32BE(mvhd.bodyStart + 16)
  if (timescale === 0) throw new Error('MP4 timescale is zero')

  let video: Mp4Info['video'] = null
  let audio: Mp4Info['audio'] = null
  for (const trak of boxes(buf, moov.bodyStart, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(buf, trak, 'mdia')
    const hdlr = mdia && child(buf, mdia, 'hdlr')
    if (!mdia || !hdlr) continue
    const handler = buf.toString('latin1', hdlr.bodyStart + 8, hdlr.bodyStart + 12)
    const minf = child(buf, mdia, 'minf')
    const stbl = minf && child(buf, minf, 'stbl')
    const stsd = stbl && child(buf, stbl, 'stsd')
    // stsd: version/flags (4), entry count (4), then the first sample entry: size (4), format (4).
    const codec = stsd ? buf.toString('latin1', stsd.bodyStart + 12, stsd.bodyStart + 16) : ''
    if (handler === 'vide' && !video) {
      const tkhd = child(buf, trak, 'tkhd')
      let width = 0
      let height = 0
      if (tkhd) {
        const v = buf.readUInt8(tkhd.bodyStart)
        const at = tkhd.bodyStart + (v === 1 ? 88 : 76)
        width = Math.round(buf.readUInt32BE(at) / 65536)
        height = Math.round(buf.readUInt32BE(at + 4) / 65536)
      }
      video = { codec, width, height }
    } else if (handler === 'soun' && !audio) {
      audio = { codec }
    }
  }

  return {
    brand: buf.toString('latin1', ftyp.bodyStart, ftyp.bodyStart + 4),
    faststart: moov.start < mdat.start,
    durationMs: Math.round((duration / timescale) * 1000),
    video,
    audio,
  }
}

/** WebP poster: RIFF....WEBP container. Dimensions are not read; the size limit keeps posters light. */
export function isWebp(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP'
}
