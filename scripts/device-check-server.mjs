// Serves ONE folder (video.mp4, captions.vtt, poster.webp) with a bare player page on the local network, so a real phone can
// check decoding, sound and Hebrew captions of a clip before it goes anywhere near the app:
//   node scripts/device-check-server.mjs <folder> [port]
// The page uses the same player attributes as the app (native controls, playsinline, preload none, Hebrew captions track) and
// the server answers Range requests like the app's media route (iOS needs them). It does NOT test the app, sign-in or signed
// links. No upload, no internet, no data collected; stop it with Ctrl+C. Anyone on the same Wi-Fi can open the page while it runs.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join, resolve } from 'node:path'

const folder = resolve(process.argv[2] ?? '')
const port = Number(process.argv[3] ?? 8765)
const FILES = { '/video.mp4': 'video/mp4', '/captions.vtt': 'text/vtt; charset=utf-8', '/poster.webp': 'image/webp' }
for (const name of ['video.mp4', 'captions.vtt']) if (!existsSync(join(folder, name))) throw new Error(`${name} not found in ${folder}`)

const page = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בדיקת מכשיר</title>
<style>body{font:16px system-ui;margin:16px}video{width:100%;max-height:70vh;background:#000}pre{white-space:pre-wrap}</style></head><body>
<h1>בדיקת מכשיר: סרטון הדגמה</h1>
<video id="v" controls playsinline preload="none"${existsSync(join(folder, 'poster.webp')) ? ' poster="/poster.webp"' : ''} src="/video.mp4"><track kind="captions" srclang="he" label="עברית" src="/captions.vtt" default></video>
<pre id="log">טוען…</pre>
<script>
const v=document.getElementById('v'),log=document.getElementById('log'),lines=[]
const add=t=>{lines.push(t);log.textContent=lines.slice(-14).join('\n')}
add(navigator.userAgent)
for(const e of ['loadedmetadata','canplay','playing','pause','ended','error','waiting','stalled'])v.addEventListener(e,()=>add(e+' t='+v.currentTime.toFixed(1)+(e==='loadedmetadata'?' '+v.videoWidth+'x'+v.videoHeight+' d='+v.duration.toFixed(1):'')+(e==='error'&&v.error?' code='+v.error.code:'')))
add('לחצו על כפתור ההפעלה. בדקו: תמונה, קול, כתוביות בעברית (בכפתור CC / תפריט הכתוביות), סנכרון.')
</script></body></html>`

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page)
    return
  }
  const type = FILES[path]
  const file = type && join(folder, path.slice(1))
  if (!file || !existsSync(file)) {
    res.writeHead(404).end('not found')
    return
  }
  const size = statSync(file).size
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end()
      return
    }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1, 'cache-control': 'no-store' })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size, 'cache-control': 'no-store' })
  createReadStream(file).pipe(res)
}).listen(port, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)
  console.log(`Device check for ${folder}`)
  for (const a of addresses) console.log(`  open on the phone (same Wi-Fi): http://${a}:${port}/`)
  console.log(`  on this computer: http://localhost:${port}/`)
})
