// Assembles ONE demonstration clip locally: the chosen footage (its own audio is discarded) + one audio file per voice line of
// script.json, placed at the line's startMs, loudness-normalised -> video.mp4 (H.264 High + AAC stereo, faststart, 1280x720,
// 30 fps) and poster.webp (a real frame) in the bundle folder. Encoding runs in local Chrome or Edge (WebCodecs) with the
// pure-JS mp4-muxer; no ffmpeg, no network, no account.
//
//   node scripts/assemble-clip.mjs <bundle folder> --footage <file.mp4> --voices <folder with line-1.*, line-2.*, ...>
//        [--from-ms 0] [--poster-ms 4500] [--measure] [--write-durations]
//
// --measure           only decode the voice files, trim their leading/trailing silence and print each duration
// --write-durations   also set each line's endMs = startMs + measured duration in script.json (startMs is never moved:
//                     timing to the footage is an editorial decision, made by editing startMs after watching it)
// Voice files may be WAV, MP3 or M4A (anything Chrome decodes). Line N of script.json uses line-N.<ext>.
import { chromium } from '@playwright/test'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { inspect } from 'node:util'

const args = process.argv.slice(2)
const folder = args[0]
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const footage = opt('--footage')
const voices = opt('--voices')
const measureOnly = args.includes('--measure')
const writeDurations = args.includes('--write-durations')
if (!folder || !voices || (!measureOnly && !footage)) {
  console.error('Usage: node scripts/assemble-clip.mjs <bundle folder> --footage <file.mp4> --voices <folder> [--from-ms 0] [--poster-ms 4500] [--measure] [--write-durations]')
  process.exit(1)
}
const scriptPath = join(folder, 'script.json')
const script = JSON.parse(readFileSync(scriptPath, 'utf8'))
const { width: W, height: H, durationMs } = script.video
const FPS = 30
const MIME = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.mp4': 'video/mp4', '.mov': 'video/quicktime' }
const voiceFiles = script.voice.map((_, i) => {
  const name = readdirSync(voices).find((f) => f.startsWith(`line-${i + 1}.`))
  if (!name) throw new Error(`missing voice file line-${i + 1}.* in ${voices}`)
  return join(voices, name)
})

let browser
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel, args: ['--enable-features=MediaFoundationAACEncoder', '--autoplay-policy=no-user-gesture-required'] })
    break
  } catch {}
}
if (!browser) throw new Error('Chrome or Edge is required')
const page = await browser.newPage()
const served = new Map([['footage', footage], ...voiceFiles.map((f, i) => [`line-${i + 1}`, f])])
await page.route('http://localhost:9/**', (route) => {
  const name = new URL(route.request().url()).pathname.slice(3)
  if (route.request().url() === 'http://localhost:9/') return route.fulfill({ contentType: 'text/html', body: '<html></html>' })
  const file = served.get(name)
  if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: '' })
  return route.fulfill({ contentType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', body: readFileSync(file) })
})
await page.goto('http://localhost:9/') // a secure context for WebCodecs
await page.addScriptTag({ content: readFileSync('node_modules/mp4-muxer/build/mp4-muxer.js', 'utf8') })

const result = await page.evaluate(
  async ({ W, H, FPS, durationMs, voice, fromMs, posterMs, measureOnly, footage }) => {
    const RATE = 48_000
    const silence = 10 ** (-45 / 20)
    // Decode and trim each voice line.
    const lines = []
    for (let i = 0; i < voice.length; i++) {
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
    const durations = lines.map((l) => l.durationMs)
    if (measureOnly) return { durations }

    // Mix the trimmed lines at their start times.
    const frames = Math.round((durationMs / 1000) * RATE)
    const mixCtx = new OfflineAudioContext(2, frames, RATE)
    lines.forEach((l, i) => {
      const trimmed = mixCtx.createBuffer(l.buffer.numberOfChannels, l.to - l.from + 1, RATE)
      for (let c = 0; c < l.buffer.numberOfChannels; c++) trimmed.copyToChannel(l.buffer.getChannelData(c).subarray(l.from, l.to + 1), c)
      const src = mixCtx.createBufferSource()
      src.buffer = trimmed
      src.connect(mixCtx.destination)
      src.start(voice[i].startMs / 1000)
    })
    const mix = await mixCtx.startRendering()

    // Integrated loudness (ITU-R BS.1770 K-weighting, 400 ms blocks, absolute and relative gates).
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

    // Footage frames.
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    // A blob URL, not the Playwright route: a fulfilled route has no Range support, so Chrome treats the file as unseekable and every
    // frame comes out as the first one (a frozen clip). A blob is fully seekable.
    video.src = URL.createObjectURL(await (await fetch('/f/footage')).blob())
    await new Promise((ok, fail) => {
      video.onloadedmetadata = ok
      video.onerror = () => fail(new Error('the footage cannot be decoded by this browser'))
    })
    const footageMs = Math.round(video.duration * 1000)
    if (footageMs + 1 < fromMs + durationMs) throw new Error(`footage is ${footageMs} ms; the timeline needs ${fromMs + durationMs} ms from ${fromMs} ms`)
    const canvas = new OffscreenCanvas(W, H)
    const ctx = canvas.getContext('2d')
    const drawAt = async (seconds) => {
      await new Promise((ok) => {
        video.onseeked = ok
        video.currentTime = seconds
      })
      // cover-fit, centred
      const scale = Math.max(W / video.videoWidth, H / video.videoHeight)
      const dw = video.videoWidth * scale
      const dh = video.videoHeight * scale
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh)
    }

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H, frameRate: FPS },
      audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE },
      fastStart: 'in-memory',
    })
    const failures = []
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => failures.push(String(e)) })
    venc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 3_000_000, framerate: FPS })
    const total = Math.round((durationMs / 1000) * FPS)
    for (let i = 0; i < total; i++) {
      await drawAt(fromMs / 1000 + (i + 0.5) / FPS)
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

    await drawAt((fromMs + posterMs) / 1000)
    let quality = 0.8
    let poster = await canvas.convertToBlob({ type: 'image/webp', quality })
    while (poster.size > 290 * 1024 && quality > 0.3) poster = await canvas.convertToBlob({ type: 'image/webp', quality: (quality -= 0.1) })
    const b64 = (buf) => {
      let s = ''
      const u = new Uint8Array(buf)
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
      return btoa(s)
    }
    return {
      durations,
      footage: { file: footage, durationMs: footageMs, width: video.videoWidth, height: video.videoHeight },
      loudness: { measuredLufs: Math.round(measured * 10) / 10, gainDb: Math.round(20 * Math.log10(gain) * 10) / 10, peakLimited: limited, audioBitrate: bitrate },
      video: b64(muxer.target.buffer),
      poster: b64(await poster.arrayBuffer()),
    }
  },
  { W, H, FPS, durationMs, voice: script.voice, fromMs: Number(opt('--from-ms', '0')), posterMs: Number(opt('--poster-ms', '4500')), measureOnly, footage: footage ?? '' },
)
await browser.close()

script.voice.forEach((v, i) => console.log(`line-${i + 1} ${result.durations[i]} ms (${v.speaker}, starts ${v.startMs}) ${v.text}`))
if (writeDurations) {
  script.voice.forEach((v, i) => (v.endMs = v.startMs + result.durations[i]))
  writeFileSync(scriptPath, JSON.stringify(script, null, 2) + '\n')
  console.log(`endMs updated in ${scriptPath}; check the gaps with: npx tsx scripts/build-pilot-files.ts ${folder} --allow-placeholder (then the validator)`)
}
if (measureOnly) process.exit(0)
writeFileSync(join(folder, 'video.mp4'), Buffer.from(result.video, 'base64'))
writeFileSync(join(folder, 'poster.webp'), Buffer.from(result.poster, 'base64'))
console.log('footage', inspect(result.footage), '\nloudness', inspect(result.loudness))
console.log(`written video.mp4 (${Buffer.from(result.video, 'base64').length} bytes) and poster.webp (${Buffer.from(result.poster, 'base64').length} bytes) in ${folder}`)
