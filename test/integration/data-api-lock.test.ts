import { describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'

// Supabase exposes the public schema through its Data API. Every app table must deny it by default.
describe('public Data API lock', () => {
  it('enables row level security on every table in the public schema', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`
    expect(rows.map((r) => r.tablename)).toEqual([])
  })
})
