import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const F = 'pilot/mouthing-illustrated-preview'
const bytes = readFileSync(`${F}/woffiz-mouthing-illustrated-preview-v2.mp4`)
const txt = bytes.toString('latin1')
console.log('ftyp', bytes.slice(4, 12).toString('latin1'), '| avc1', txt.includes('avc1'), '| mp4a', txt.includes('mp4a'), '| moov before mdat (faststart)', txt.indexOf('moov') < txt.indexOf('mdat'))
// a local server with Range support, like a real host (the app's media route does the same)
const server = createServer((req, res) => {
  if (req.url !== '/v.mp4') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>')
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  if (!m) return res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': bytes.length }).end(bytes)
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : bytes.length - 1
  res.writeHead(206, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${bytes.length}`, 'content-length': b - a + 1 }).end(bytes.subarray(a, b + 1))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${server.address().port}`
let browser
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel })
    break
  } catch {}
}
const page = await browser.newPage()
await page.goto(base + '/')
const out = await page.evaluate(async () => {
  const v = document.createElement('video')
  v.muted = true
  v.src = '/v.mp4'
  await new Promise((ok, no) => {
    v.onloadedmetadata = ok
    v.onerror = () => no(new Error('video decode error ' + v.error?.message))
  })
  const info = { duration: v.duration, w: v.videoWidth, h: v.videoHeight }
  const c = new OffscreenCanvas(1280, 720)
  const x = c.getContext('2d')
  const frames = {}
  const b64 = (buf) => {
    let s = ''
    const u = new Uint8Array(buf)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  const seeks = {}
  for (const t of [0.2, 3, 8.4, 9.5, 10.6, 11.5, 13.5, 17, 21, 23.8]) {
    await new Promise((ok) => {
      v.onseeked = ok
      v.currentTime = t
    })
    await new Promise((r) => setTimeout(r, 250))
    x.drawImage(v, 0, 0, 1280, 720)
    seeks[t] = Number(v.currentTime.toFixed(2))
    frames[t] = b64(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
  }
  const ab = await (await fetch('/v.mp4')).arrayBuffer()
  const dec = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(ab)
  const d = dec.getChannelData(0)
  const win = dec.sampleRate / 10
  const rms = []
  for (let s = 0; s + win <= d.length; s += win) {
    let z = 0
    for (let n = s; n < s + win; n++) z += d[n] * d[n]
    rms.push(Math.sqrt(z / win))
  }
  const spans = []
  let st = null
  rms.forEach((r, i) => {
    if (r > 0.01 && st === null) st = i
    if (r <= 0.01 && st !== null) {
      if (i - st > 3) spans.push([st / 10, i / 10])
      st = null
    }
  })
  if (st !== null) spans.push([st / 10, rms.length / 10])
  return { info, seeks, audio: { duration: dec.duration, channels: dec.numberOfChannels, rate: dec.sampleRate, speechSpans: spans }, frames }
})
console.log(JSON.stringify({ ...out, frames: undefined }))
mkdirSync(`${F}/frames`, { recursive: true })
for (const [t, d] of Object.entries(out.frames)) writeFileSync(`${F}/frames/mp4-${String(Math.round(Number(t) * 10)).padStart(3, '0')}.png`, Buffer.from(d, 'base64'))
await browser.close()
server.close()
