// Generates test/media/playable/clip.mp4 and poster.webp: a SYNTHETIC TEST CLIP that real browsers can decode.
// It is not training content: it shows a moving square, a progress bar and a "SYNTHETIC TEST MEDIA" label, with a
// 440 Hz tone at the narrator lines and an 880 Hz tone at the demonstrator lines of the name-look fixture bundle.
// No speech, no dog, no technique. Local only, no network, no paid calls.
//
// Needs Chrome or Edge (WebCodecs H.264 + AAC) and the pure-JS mp4-muxer package, which is NOT a repo dependency:
//   npm i --no-save mp4-muxer && node scripts/make-playable-fixture.mjs
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const OUT = 'test/media/playable'
const SECONDS = 20
const W = 1280
const H = 720
const FPS = 30
const SAMPLE_RATE = 48_000
// [startMs, endMs, frequencyHz] — the voice lines of nameLookBundleInput('STANDARD', 0).
const TONES = [[300, 1800, 440], [2200, 5000, 440], [5400, 6200, 880], [9200, 12000, 440], [12400, 13200, 880], [16200, 19500, 440]]

const muxerSource = readFileSync('node_modules/mp4-muxer/build/mp4-muxer.js', 'utf8')
mkdirSync(OUT, { recursive: true })

let browser
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel, args: ['--enable-features=MediaFoundationAACEncoder'] })
    break
  } catch {}
}
if (!browser) throw new Error('Chrome or Edge is required')
const page = await browser.newPage()
await page.route('http://localhost:9/', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' })) // secure context for WebCodecs
await page.goto('http://localhost:9/')
await page.addScriptTag({ content: muxerSource })

const result = await page.evaluate(
  async ({ SECONDS, W, H, FPS, SAMPLE_RATE, TONES }) => {
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H },
      audio: { codec: 'aac', numberOfChannels: 1, sampleRate: SAMPLE_RATE },
      fastStart: 'in-memory',
    })
    const failures = []
    const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => failures.push(String(e)) })
    videoEncoder.configure({ codec: 'avc1.64001f', width: W, height: H, bitrate: 350_000, framerate: FPS })
    const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => failures.push(String(e)) })
    audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: 1, sampleRate: SAMPLE_RATE, bitrate: 96_000 })

    const canvas = new OffscreenCanvas(W, H)
    const ctx = canvas.getContext('2d')
    const draw = (t) => {
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, 0, W, H)
      // visible motion: a square sweeping across and a pulsing circle
      const x = 80 + ((t / SECONDS) * (W - 360))
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(x, 260, 200, 200)
      ctx.fillStyle = '#38bdf8'
      ctx.beginPath()
      ctx.arc(W / 2, 140, 40 + 25 * Math.sin(t * 4), 0, Math.PI * 2)
      ctx.fill()
      // which tone is sounding right now (so a viewer can see sound and picture agree)
      const tone = TONES.find(([s, e]) => t * 1000 >= s && t * 1000 < e)
      ctx.fillStyle = tone ? (tone[2] === 880 ? '#f87171' : '#4ade80') : '#475569'
      ctx.fillRect(40, 520, 80, 80)
      ctx.fillStyle = '#e5e7eb'
      ctx.font = 'bold 44px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('SYNTHETIC TEST MEDIA', W / 2, 650)
      ctx.font = '32px sans-serif'
      ctx.fillText('NOT TRAINING CONTENT', W / 2, 695)
      ctx.textAlign = 'left'
      ctx.fillText(`${t.toFixed(1)} s`, 140, 575)
      ctx.fillStyle = '#94a3b8'
      ctx.fillRect(0, H - 8, (t / SECONDS) * W, 8)
    }

    const frames = SECONDS * FPS
    for (let i = 0; i < frames; i++) {
      draw(i / FPS)
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      videoEncoder.encode(frame, { keyFrame: i % FPS === 0 })
      frame.close()
      if (videoEncoder.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 5))
    }
    await videoEncoder.flush()

    const chunk = 4800
    for (let start = 0; start < SECONDS * SAMPLE_RATE; start += chunk) {
      const data = new Float32Array(chunk)
      for (let i = 0; i < chunk; i++) {
        const t = (start + i) / SAMPLE_RATE
        const tone = TONES.find(([s, e]) => t * 1000 >= s && t * 1000 < e)
        data[i] = tone ? 0.25 * Math.sin(2 * Math.PI * tone[2] * t) : 0
      }
      const audio = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: chunk, numberOfChannels: 1, timestamp: Math.round((start * 1e6) / SAMPLE_RATE), data })
      audioEncoder.encode(audio)
      audio.close()
    }
    await audioEncoder.flush()
    muxer.finalize()

    draw(4.2)
    const poster = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
    const toB64 = async (buf) => {
      let s = ''
      const u = new Uint8Array(buf)
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
      return btoa(s)
    }
    return { failures, video: await toB64(muxer.target.buffer), poster: await toB64(await poster.arrayBuffer()) }
  },
  { SECONDS, W, H, FPS, SAMPLE_RATE, TONES },
)
await browser.close()
if (result.failures.length) throw new Error(result.failures.join('; '))
writeFileSync(`${OUT}/clip.mp4`, Buffer.from(result.video, 'base64'))
writeFileSync(`${OUT}/poster.webp`, Buffer.from(result.poster, 'base64'))
console.log('written', OUT)
