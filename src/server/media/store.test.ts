import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { LocalMediaStore, SupabaseMediaStore, assertMediaKey, mediaKeys, mediaStoreFromEnv, signLocalToken, verifyLocalToken } from './store'

const ID = '0b8a1c52-6f0d-4a39-9d4e-3b1a5c7d9e21'
const dir = mkdtempSync(join(tmpdir(), 'woffiz-media-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('object keys', () => {
  it('accepts only v/ or fixtures/ + uuid + the two known file names', () => {
    expect(mediaKeys(ID, false)).toEqual({ videoKey: `v/${ID}/video.mp4`, posterKey: `v/${ID}/poster.webp` })
    expect(mediaKeys(ID, true).videoKey).toBe(`fixtures/${ID}/video.mp4`)
    for (const bad of ['../etc/passwd', `v/${ID}/../x.mp4`, `/v/${ID}/video.mp4`, `x/${ID}/video.mp4`, `v/${ID}/other.mp4`, `v/not-a-uuid/video.mp4`]) {
      expect(() => assertMediaKey(bad), bad).toThrow()
    }
  })
})

describe('local store', () => {
  const store = new LocalMediaStore(dir, 'secret', () => 1_000_000)

  it('writes an object once and never overwrites it', async () => {
    await store.put(`fixtures/${ID}/poster.webp`, Buffer.from('abc'), 'image/webp')
    expect(readFileSync(store.path(`fixtures/${ID}/poster.webp`)).toString()).toBe('abc')
    await expect(store.put(`fixtures/${ID}/poster.webp`, Buffer.from('xyz'), 'image/webp')).rejects.toThrow()
    expect(readFileSync(store.path(`fixtures/${ID}/poster.webp`)).toString()).toBe('abc')
  })

  it('signs short-lived URLs that verify only for the right key, time and secret', async () => {
    const url = new URL(await store.signedReadUrl(`v/${ID}/video.mp4`, 600), 'http://localhost')
    const key = url.searchParams.get('k')!
    const exp = Number(url.searchParams.get('e'))
    const token = url.searchParams.get('s')!
    expect(exp).toBe(1_000_000 + 600_000)
    expect(verifyLocalToken(key, exp, token, 'secret', 1_000_001)).toBe(true)
    expect(verifyLocalToken(key, exp, token, 'secret', exp + 1)).toBe(false) // expired
    expect(verifyLocalToken(key, exp, token, 'other-secret', 1_000_001)).toBe(false)
    expect(verifyLocalToken(`v/${ID}/poster.webp`, exp, token, 'secret', 1_000_001)).toBe(false)
    expect(verifyLocalToken(key, exp + 1, token, 'secret', 1_000_001)).toBe(false)
    expect(verifyLocalToken('../../x', exp, signLocalToken('../../x', exp, 'secret'), 'secret', 1_000_001)).toBe(false)
  })
})

describe('Supabase store (mocked fetch, never called for real)', () => {
  it('uploads without overwrite and returns a full signed URL', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return String(url).includes('/sign/')
        ? new Response(JSON.stringify({ signedURL: '/object/sign/media/v/x?token=t' }), { status: 200 })
        : new Response('{}', { status: 200 })
    })
    const store = new SupabaseMediaStore('https://example.supabase.co', 'secret-key', 'media', fetchMock as unknown as typeof fetch)
    await store.put(`v/${ID}/video.mp4`, Buffer.from('x'), 'video/mp4')
    expect(calls[0]!.url).toBe(`https://example.supabase.co/storage/v1/object/media/v/${ID}/video.mp4`)
    expect((calls[0]!.init.headers as Record<string, string>)['x-upsert']).toBe('false')
    expect(await store.signedReadUrl(`v/${ID}/video.mp4`, 600)).toBe('https://example.supabase.co/storage/v1/object/sign/media/v/x?token=t')
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ expiresIn: 600 })
  })

  it('turns provider failures into errors without echoing the secret key', async () => {
    const store = new SupabaseMediaStore('https://example.supabase.co', 'secret-key', 'media', (async () => new Response('denied', { status: 403 })) as unknown as typeof fetch)
    const error = await store.put(`v/${ID}/video.mp4`, Buffer.from('x'), 'video/mp4').catch((e: Error) => e)
    expect((error as Error).message).toBe('storage upload failed (403)')
    expect((error as Error).message).not.toContain('secret-key')
  })
})

describe('store selection', () => {
  it('uses the private bucket only when fully configured, and a local store only on a developer machine', () => {
    expect(mediaStoreFromEnv({ MEDIA_STORE: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'k', MEDIA_BUCKET: 'b' })?.kind).toBe('supabase')
    expect(mediaStoreFromEnv({ MEDIA_STORE: 'supabase', SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
    expect(mediaStoreFromEnv({ APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 's' })?.kind).toBe('local')
    expect(mediaStoreFromEnv({ BETTER_AUTH_URL: 'https://woffiz.example', BETTER_AUTH_SECRET: 's' })).toBeNull()
  })
})
