import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isLocalMachine, type Env } from '../local-mode'

/**
 * Object storage for the media bundle's large files (video, poster). Captions and transcript live in the database.
 * Objects are private: the only way to read one is a short-lived signed URL created on the server.
 */
export interface MediaStore {
  readonly kind: 'local' | 'supabase'
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** A URL that works for `ttlSeconds`. Supabase cannot revoke a signed URL before it expires. */
  signedReadUrl(key: string, ttlSeconds: number): Promise<string>
}

/** Only keys of the shape v/<uuid>/video.mp4 or fixtures/<uuid>/poster.webp are ever stored or signed. */
const KEY = /^(?:v|fixtures)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:video\.mp4|poster\.webp)$/

export function assertMediaKey(key: string): void {
  if (!KEY.test(key)) throw new Error('invalid media object key')
}

export const mediaKeys = (id: string, fixture: boolean) => {
  const prefix = `${fixture ? 'fixtures' : 'v'}/${id}`
  return { videoKey: `${prefix}/video.mp4`, posterKey: `${prefix}/poster.webp` }
}

// ----- Local development store (HMAC-signed, expiring URLs) -----

export function signLocalToken(key: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${key}\n${expiresAt}`).digest('base64url')
}

export function verifyLocalToken(key: string, expiresAt: number, token: string, secret: string, now = Date.now()): boolean {
  if (!KEY.test(key) || !Number.isFinite(expiresAt) || expiresAt < now) return false
  const expected = Buffer.from(signLocalToken(key, expiresAt, secret))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export class LocalMediaStore implements MediaStore {
  readonly kind = 'local' as const
  constructor(
    private readonly dir: string,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  path(key: string): string {
    assertMediaKey(key)
    const root = resolve(this.dir)
    const full = resolve(join(root, key))
    if (!full.startsWith(root)) throw new Error('invalid media object key')
    return full
  }

  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    void _contentType
    const file = this.path(key)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, body, { flag: 'wx' }) // never overwrite: an object path belongs to one immutable version
  }

  async signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    assertMediaKey(key)
    const expiresAt = this.now() + ttlSeconds * 1000
    const token = signLocalToken(key, expiresAt, this.secret)
    return `/api/media/local?k=${encodeURIComponent(key)}&e=${expiresAt}&s=${token}`
  }
}

// ----- Supabase Storage (private bucket, REST API, no SDK) -----
// Endpoint shapes follow the Supabase Storage REST API as documented at implementation time. They must be re-checked
// against the current docs before the first hosted use (slice 3D). Nothing here is called in slice 3A.

export class SupabaseMediaStore implements MediaStore {
  readonly kind = 'supabase' as const
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
    private readonly bucket: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.secretKey}`, apikey: this.secretKey, ...extra }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertMediaKey(key)
    const response = await this.fetchImpl(`${this.baseUrl}/storage/v1/object/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'false' }),
      body: new Uint8Array(body),
    })
    if (!response.ok) throw new Error(`storage upload failed (${response.status})`)
  }

  async signedReadUrl(key: string, ttlSeconds: number): Promise<string> {
    assertMediaKey(key)
    const response = await this.fetchImpl(`${this.baseUrl}/storage/v1/object/sign/${this.bucket}/${key}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    })
    if (!response.ok) throw new Error(`storage signing failed (${response.status})`)
    const data = (await response.json()) as { signedURL?: string }
    if (!data.signedURL) throw new Error('storage returned no signed URL')
    return `${this.baseUrl}/storage/v1${data.signedURL}`
  }
}

/**
 * Chooses the store from the environment (server only).
 * - MEDIA_STORE=supabase with SUPABASE_URL, SUPABASE_SECRET_KEY and MEDIA_BUCKET: the private bucket.
 * - otherwise a local store, but only on a developer's machine or under NODE_ENV=test.
 * Anywhere else the answer is "no store": media is simply unavailable, never public.
 */
export function mediaStoreFromEnv(env: Env = process.env): MediaStore | null {
  if (env.MEDIA_STORE === 'supabase') {
    const url = env.SUPABASE_URL?.trim().replace(/\/+$/, '')
    const key = env.SUPABASE_SECRET_KEY?.trim()
    const bucket = env.MEDIA_BUCKET?.trim()
    return url && key && bucket ? new SupabaseMediaStore(url, key, bucket) : null
  }
  if (isLocalMachine(env) || env.NODE_ENV === 'test') {
    const secret = env.MEDIA_URL_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim()
    return secret ? new LocalMediaStore(env.MEDIA_LOCAL_DIR?.trim() || '.media-local', secret) : null
  }
  return null
}
