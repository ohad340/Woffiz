// Contact sheets from exported MP4s: node scripts/_sheet.mjs <spec.json>; spec = [{ out, mp4, times:[...], crop:[x,y,w,h], scale, cols, label }]
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
const specs = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const files = new Map()
const server = createServer((req, res) => {
  const f = decodeURIComponent(req.url.slice(1))
  if (!f) return res.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>')
  if (!f.endsWith('.mp4')) return res.writeHead(404).end()
  if (!files.has(f)) files.set(f, readFileSync(f))
  const bytes = files.get(f)
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
for (const spec of specs) {
  const data = await page.evaluate(async ({ spec, url }) => {
    const v = document.createElement('video')
    v.muted = true
    v.src = url
    await new Promise((ok, no) => {
      v.onloadedmetadata = ok
      v.onerror = () => no(new Error('decode'))
    })
    const [cx, cy, cw, ch] = spec.crop
    const sc = spec.scale || 1
    const cols = spec.cols || spec.times.length
    const rows = Math.ceil(spec.times.length / cols)
    const c = new OffscreenCanvas(cw * sc * cols, ch * sc * rows)
    const g = c.getContext('2d')
    g.fillStyle = '#000'
    g.fillRect(0, 0, c.width, c.height)
    g.font = `${Math.max(12, 12 * sc)}px sans-serif`
    for (let i = 0; i < spec.times.length; i++) {
      await new Promise((ok) => {
        v.onseeked = ok
        v.currentTime = spec.times[i] + 0.0001
      })
      await new Promise((r) => setTimeout(r, 200))
      const x = (i % cols) * cw * sc
      const y = Math.floor(i / cols) * ch * sc
      g.drawImage(v, cx, cy, cw, ch, x, y, cw * sc, ch * sc)
      g.fillStyle = '#fff'
      g.strokeStyle = '#000'
      g.lineWidth = 3
      g.strokeText(`${spec.label || ''} ${spec.times[i].toFixed(3)}s`, x + 4, y + 14 * Math.max(1, sc))
      g.fillText(`${spec.label || ''} ${spec.times[i].toFixed(3)}s`, x + 4, y + 14 * Math.max(1, sc))
    }
    const buf = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()
    let s = ''
    const u = new Uint8Array(buf)
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }, { spec, url: '/' + encodeURIComponent(spec.mp4) })
  writeFileSync(spec.out, Buffer.from(data, 'base64'))
  console.log('wrote', spec.out)
}
await browser.close()
server.close()
