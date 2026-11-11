import { readFile } from 'node:fs/promises'
import { LocalMediaStore, mediaStoreFromEnv, verifyLocalToken } from '@/server/media/store'

// Serves objects of the LOCAL development store behind a signed, expiring token, with Range support (Safari needs it
// to play video). Hosted environments have no local store, so this answers 404 there.
export async function GET(request: Request) {
  const notFound = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
  const store = mediaStoreFromEnv()
  if (!(store instanceof LocalMediaStore)) return notFound()
  const url = new URL(request.url)
  const key = url.searchParams.get('k') ?? ''
  const expiresAt = Number(url.searchParams.get('e'))
  const token = url.searchParams.get('s') ?? ''
  const secret = process.env.MEDIA_URL_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim() || ''
  if (!secret || !verifyLocalToken(key, expiresAt, token, secret)) return notFound()

  let body: Buffer
  try {
    body = await readFile(store.path(key))
  } catch {
    return notFound()
  }
  const type = key.endsWith('.mp4') ? 'video/mp4' : 'image/webp'
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    const size = body.length
    const start = Math.max(0, range[1] ? Number(range[1]) : size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    const part = body.subarray(start, end + 1)
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(part.length) },
    })
  }
  return new Response(new Uint8Array(body), { headers: { ...headers, 'Content-Length': String(body.length) } })
}
