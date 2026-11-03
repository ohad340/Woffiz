// Renders the LOCAL illustrated preview (pilot/mouthing-illustrated-preview): scene.js (Canvas 2D) + the Hebrew narration lines of
// script.json -> MP4 (H.264 High + AAC stereo, 1280x720, 30 fps, faststart), poster, captions (.vtt/.srt) and sample frames.
// Same local pipeline as assemble-clip.mjs: Chrome/Edge WebCodecs + mp4-muxer. No ffmpeg, no network, no paid service.
//
//   node scripts/render-illustrated-preview.mjs <folder> [--stills 2000,9500,...] [--crop x,y,w,h] [--scene scene-v1.js] [--name basename] [--prefix still-prefix]   only write PNG stills (optionally a 3x detail) to <folder>/frames
//   node scripts/render-illustrated-preview.mjs <folder> --voices <folder>/voice [--write-durations]
//
// Voice files line-1.wav ... line-N.wav come from scripts/local-hebrew-tts.ps1. startMs in script.json is editorial and never moved.
import { chromium } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const folder = args[0]
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
if (!folder) {
  console.error('Usage: node scripts/render-illustrated-preview.mjs <folder> [--stills ms,ms,...] [--voices <folder>] [--write-durations]')
  process.exit(1)
}
const stills = opt('--stills')
const sceneFile = opt('--scene', 'scene-v2.js') // e.g. scene-v1.js to re-render the first version
const outName = opt('--name', 'woffiz-mouthing-illustrated-preview') // output basename (.mp4, poster uses -poster.png when set)
const prefix = opt('--prefix', 'frame') // still file prefix
const voicesDir = opt('--voices')
const scriptPath = join(folder, 'script.json')
const script = JSON.parse(readFileSync(scriptPath, 'utf8'))
const { width: W, height: H, durationMs } = script.video
const FPS = 30
const fontFile = (w) => readFileSync(`node_modules/@fontsource/heebo/files/heebo-hebrew-${w}-normal.woff2`)
const voiceFiles = stills ? [] : script.voice.map((_, i) => {
  const name = readdirSync(voicesDir).find((f) => f.startsWith(`line-${i + 1}.`))
  if (!name) throw new Error(`missing voice file line-${i + 1}.* in ${voicesDir}`)
  return join(voicesDir, name)
})

let browser
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel, args: ['--enable-features=MediaFoundationAACEncoder'] })
    break
  } catch {}
}
if (!browser) throw new Error('Chrome or Edge is required')
const page = await browser.newPage()
await page.route('http://localhost:9/**', (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  if (path === '/scene.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: readFileSync(join(folder, sceneFile)) })
  let m = path.match(/^\/ref\/(\d)$/)
  if (m && script.reference && existsSync(join(folder, 'reference', script.reference[Number(m[1]) - 1]))) return route.fulfill({ contentType: 'image/webp', body: readFileSync(join(folder, 'reference', script.reference[Number(m[1]) - 1])) })
  m = path.match(/^\/font\/(\d+)$/)
  if (m) return route.fulfill({ contentType: 'font/woff2', body: fontFile(m[1]) })
  m = path.match(/^\/f\/line-(\d+)$/)
  if (m && voiceFiles[Number(m[1]) - 1]) return route.fulfill({ contentType: 'audio/wav', body: readFileSync(voiceFiles[Number(m[1]) - 1]) })
  return route.fulfill({ status: 404, body: '' })
})
await page.goto('http://localhost:9/')
await page.addScriptTag({ content: readFileSync('node_modules/mp4-muxer/build/mp4-muxer.js', 'utf8') })
await page.addScriptTag({ url: 'http://localhost:9/scene.js' })
page.on('console', (m) => console.log('[page]', m.text()))

const result = await page.evaluate(
  async ({ W, H, FPS, durationMs, script, stills, crop }) => {
    for (const w of [700, 800]) document.fonts.add(await new FontFace('Heebo', 'url(/font/' + w + ')', { weight: String(w) }).load())
    const images = []
    for (const n of [1, 2, 3]) {
      const r = await fetch('/ref/' + n)
      if (r.ok) images.push(await createImageBitmap(await r.blob()))
    }
    WoffizScene.init({ ...script, images })
    const canvas = new OffscreenCanvas(W, H)
    const ctx = canvas.getContext('2d')
    const b64 = (buf) => {
      let s = ''
      const u = new Uint8Array(buf)
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
      return btoa(s)
    }
    const png = async (ms) => {
      WoffizScene.draw(ctx, ms / 1000)
      if (crop) {
        // debugging aid: a 3x magnified detail of the frame
        const [x, y, w, h] = crop
        const zoom = new OffscreenCanvas(w * 3, h * 3)
        zoom.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w * 3, h * 3)
        return b64(await (await zoom.convertToBlob({ type: 'image/png' })).arrayBuffer())
      }
      return b64(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer())
    }
    if (stills) return { stills: await Promise.all(stills.map(async (ms) => [ms, await png(ms)])) }

    const RATE = 48_000
    const silence = 10 ** (-45 / 20)
    const lines = []
    for (let i = 0; i < script.voice.length; i++) {
      const data = await (await fetch(`/f/line-${i + 1}`)).arrayBuffer()
      const decoded = await new OfflineAudioContext(2, RATE, RATE).decodeAudioData(data)
      const ch = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c))
      const loud = (n) => ch.some((d) => Math.abs(d[n]) > silence)
      let a = 0
      let b = decoded.length - 1
      while (a < b && !loud(a)) a++
      while (b > a && !loud(b)) b--
      const pad = Math.round(0.03 * RATE)
      a = Math.max(0, a - pad)
      b = Math.min(decoded.length - 1, b + pad)
      lines.push({ buffer: decoded, from: a, to: b, durationMs: Math.round(((b - a + 1) / RATE) * 1000) })
    }
    const frames = Math.round((durationMs / 1000) * RATE)
    const mixCtx = new OfflineAudioContext(2, frames, RATE)
    lines.forEach((l, i) => {
      const trimmed = mixCtx.createBuffer(l.buffer.numberOfChannels, l.to - l.from + 1, RATE)
      for (let c = 0; c < l.buffer.numberOfChannels; c++) trimmed.copyToChannel(l.buffer.getChannelData(c).subarray(l.from, l.to + 1), c)
      const src = mixCtx.createBufferSource()
      src.buffer = trimmed
      src.connect(mixCtx.destination)
      src.start(script.voice[i].startMs / 1000)
    })
    const mix = await mixCtx.startRendering()

    // Integrated loudness (BS.1770 K-weighting, gated) to -16 LUFS, peak ceiling -1.5 dBFS.
    const kCtx = new OfflineAudioContext(2, frames, RATE)
    const kSrc = kCtx.createBufferSource()
    kSrc.buffer = mix
    const shelf = Object.assign(kCtx.createBiquadFilter(), { type: 'highshelf' })
    shelf.frequency.value = 1681.97
    shelf.gain.value = 4
    const hp = Object.assign(kCtx.createBiquadFilter(), { type: 'highpass' })
    hp.frequency.value = 38.13
    hp.Q.value = 0.5
    kSrc.connect(shelf).connect(hp).connect(kCtx.destination)
    kSrc.start()
    const k = await kCtx.startRendering()
    const block = Math.round(0.4 * RATE)
    const step = Math.round(0.1 * RATE)
    const powers = []
    for (let s = 0; s + block <= frames; s += step) {
      let z = 0
      for (let c = 0; c < 2; c++) {
        const d = k.getChannelData(c)
        let sum = 0
        for (let n = s; n < s + block; n++) sum += d[n] * d[n]
        z += sum / block
      }
      powers.push(z)
    }
    const lufs = (z) => -0.691 + 10 * Math.log10(z)
    const abs = powers.filter((z) => z > 0 && lufs(z) > -70)
    const ungated = abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length)
    const rel = abs.filter((z) => lufs(z) > lufs(ungated) - 10)
    const measured = lufs(rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length))
    let gain = 10 ** ((-16 - measured) / 20)
    let peak = 0
    for (let c = 0; c < 2; c++) for (const x of mix.getChannelData(c)) peak = Math.max(peak, Math.abs(x))
    const ceiling = 10 ** (-1.5 / 20)
    const limited = peak * gain > ceiling
    if (limited) gain = ceiling / peak
    const out = [0, 1].map((c) => Float32Array.from(mix.getChannelData(c), (x) => x * gain))

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
      fastStart: 'in-memory',
    })
    const failures = []
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => failures.push(String(e)) })
    venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 4_000_000, framerate: FPS })
    const total = Math.round((durationMs / 1000) * FPS)
    for (let i = 0; i < total; i++) {
      WoffizScene.draw(ctx, i / FPS)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      venc.encode(frame, { keyFrame: i % (2 * FPS) === 0 })
      frame.close()
      if (venc.encodeQueueSize > 10) await new Promise((r) => setTimeout(r, 5))
    }
    await venc.flush()
    let bitrate = 128_000
    if (!(await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate })).supported) bitrate = 96_000
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => failures.push(String(e)) })
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate })
    const chunk = 4800
    for (let s = 0; s < frames; s += chunk) {
      const n = Math.min(chunk, frames - s)
      const data = new Float32Array(n * 2)
      data.set(out[0].subarray(s, s + n), 0)
      data.set(out[1].subarray(s, s + n), n)
      const audio = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s * 1e6) / RATE), data })
      aenc.encode(audio)
      audio.close()
    }
    await aenc.flush()
    muxer.finalize()
    if (failures.length) throw new Error(failures.join('; '))
    return {
      durations: lines.map((l) => l.durationMs),
      loudness: { measuredLufs: Math.round(measured * 10) / 10, gainDb: Math.round(20 * Math.log10(gain) * 10) / 10, peakLimited: limited, audioBitrate: bitrate },
      video: b64(muxer.target.buffer),
      poster: await png(script.video.posterMs ?? 4000),
    }
  },
  { W, H, FPS, durationMs, script, stills: stills ? stills.split(',').map(Number) : null, crop: opt('--crop') ? opt('--crop').split(',').map(Number) : null },
)
await browser.close()

if (stills) {
  mkdirSync(join(folder, 'frames'), { recursive: true })
  for (const [ms, data] of result.stills) writeFileSync(join(folder, 'frames', `${prefix}-${String(ms).padStart(5, '0')}.png`), Buffer.from(data, 'base64'))
  console.log(`wrote ${result.stills.length} stills to ${join(folder, 'frames')}`)
  process.exit(0)
}

script.voice.forEach((v, i) => console.log(`line-${i + 1} ${result.durations[i]} ms, starts ${v.startMs} ms: ${v.text}`))
if (args.includes('--write-durations')) {
  script.voice.forEach((v, i) => (v.endMs = v.startMs + result.durations[i]))
  writeFileSync(scriptPath, JSON.stringify(script, null, 2) + '\n')
}
const stamp = (ms, sep) => {
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}${sep}${p(ms % 1000, 3)}`
}
const cues = script.captions.map((c) => ({ ...c, text: c.lines.join('\n') }))
writeFileSync(join(folder, 'captions.vtt'), 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${c.text}\n`).join('\n'))
writeFileSync(join(folder, 'captions.srt'), cues.map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${c.text}\n`).join('\n'))
writeFileSync(join(folder, `${outName}.mp4`), Buffer.from(result.video, 'base64'))
writeFileSync(join(folder, outName === 'woffiz-mouthing-illustrated-preview' ? 'poster.png' : `${outName}-poster.png`), Buffer.from(result.poster, 'base64'))
console.log('loudness', result.loudness, `\nmp4 ${Buffer.from(result.video, 'base64').length} bytes`)
