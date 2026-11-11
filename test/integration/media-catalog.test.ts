import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { assertAdmin } from '@/server/admin'
import { validBundleInput } from '../media/fixtures'
import { ingestBundle, IngestError, slotId } from '@/server/media/ingest'
import { LocalMediaStore } from '@/server/media/store'
import type { BundleInput } from '@/server/media/bundle'
import { REAL_POSTGRES, createUser, onboard, resetDatabase } from './helpers'

const dir = mkdtempSync(join(tmpdir(), 'woffiz-ingest-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const store = new LocalMediaStore(dir, 'integration-secret')

beforeEach(resetDatabase)

const SLOT = slotId('mouthing-redirect-toy', 1, 'STANDARD')

async function createAdmin(overrides: { role?: 'ADMIN' | 'OWNER'; emailVerified?: boolean } = {}) {
  return prisma.user.create({
    data: { id: randomUUID(), name: 'Admin', email: `admin-${randomUUID()}@example.test`, emailVerified: overrides.emailVerified ?? true, role: overrides.role ?? 'ADMIN' },
  })
}

/** A second, different but valid bundle for the same slot (one step window is one frame longer). */
function otherBundle(): BundleInput {
  const input = validBundleInput()
  const manifest = structuredClone(input.manifest) as { timeline: { startMs: number; endMs: number }[] }
  manifest.timeline[1]!.endMs = 8100
  manifest.timeline[2]!.startMs = 8100
  return { ...input, manifest }
}

const ingest = (adminId: string, input: BundleInput = validBundleInput(), fixture = true, env?: Record<string, string | undefined>) =>
  ingestBundle(input, { fixture, adminId, store, env })

describe('admin role is read from the database every time', () => {
  it('accepts a verified ADMIN and nobody else', async () => {
    const admin = await createAdmin()
    await expect(assertAdmin(admin.id)).resolves.toMatchObject({ id: admin.id })

    const owner = await createUser()
    await expect(assertAdmin(owner.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(assertAdmin(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const unverified = await createAdmin({ emailVerified: false })
    await expect(assertAdmin(unverified.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('loses access the moment the role is revoked', async () => {
    const admin = await createAdmin()
    await assertAdmin(admin.id)
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'OWNER' } })
    await expect(assertAdmin(admin.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('ingest creates DRAFTs only', () => {
  it('stores a validated fixture bundle as DRAFT with fingerprints, no reviews and fixture storage keys', async () => {
    const admin = await createAdmin()
    const result = await ingest(admin.id)
    expect(result).toMatchObject({ assetId: SLOT, version: 1 })

    const row = await prisma.mediaVersion.findUniqueOrThrow({ where: { id: result.id } })
    expect(row).toMatchObject({ status: 'DRAFT', isTestFixture: true, hasAudio: true, createdById: admin.id, techniqueKey: 'mouthing-redirect-toy', variant: 'STANDARD' })
    expect(row.videoKey).toBe(`fixtures/${result.id}/video.mp4`)
    expect(row.bundleFingerprint).toBe(result.bundleFingerprint)
    expect(row.reviewedAt).toBeNull()
    expect(await prisma.mediaReview.count()).toBe(0)
    expect(await prisma.techniqueVersionState.findMany()).toMatchObject([{ techniqueKey: 'mouthing-redirect-toy', techniqueVersion: 1, suspendedAt: null }])
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: SLOT } })).toMatchObject({ isTestFixture: true, status: 'SLOT', techniqueVersion: 1 })
  })

  it('refuses non-admins, invalid bundles and duplicate bundles, and numbers new bundles 2, 3...', async () => {
    const owner = await createUser()
    await expect(ingest(owner.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const admin = await createAdmin()
    const broken = validBundleInput()
    const error = await ingest(admin.id, { ...broken, captions: 'WEBVTT\n' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(IngestError)
    expect((error as IngestError).issues.join()).toMatch(/captions/)
    expect(await prisma.mediaVersion.count()).toBe(0)

    await ingest(admin.id)
    await expect(ingest(admin.id)).rejects.toThrow(/already version 1/)
    expect((await ingest(admin.id, otherBundle())).version).toBe(2)
  })

  it('keeps fixtures and production media apart', async () => {
    const admin = await createAdmin()
    // A fixture is refused outside a local machine, whatever the caller says.
    await expect(ingest(admin.id, validBundleInput(), true, {})).rejects.toThrow(/refused outside a local machine/)
    // A bundle labelled as a fixture cannot be ingested as production, and a production-labelled one cannot be a fixture.
    await expect(ingest(admin.id, validBundleInput(), false)).rejects.toThrow(/test-fixture/)
    const real = validBundleInput()
    const manifest = structuredClone(real.manifest) as { production: { video: { vendor: string }; voice: { vendor: string } } }
    manifest.production.video.vendor = 'some-vendor'
    manifest.production.voice.vendor = 'some-voice-vendor'
    await expect(ingest(admin.id, { ...real, manifest }, true)).rejects.toThrow(/labelled with the test-fixture vendor/)
    // And they never share a slot.
    await ingest(admin.id)
    await expect(ingest(admin.id, { ...real, manifest }, false)).rejects.toThrow(/never share a slot/)
  })

  it('refuses a technique registered with another definition (changes need a new version)', async () => {
    const admin = await createAdmin()
    await prisma.techniqueVersionState.create({ data: { techniqueKey: 'mouthing-redirect-toy', techniqueVersion: 1, fingerprint: 'f'.repeat(64) } })
    await expect(ingest(admin.id)).rejects.toThrow(/different definition/)
    expect(await prisma.mediaVersion.count()).toBe(0)
  })
})

describe('database guards on MediaVersion', () => {
  async function draft() {
    const admin = await createAdmin()
    const { id } = await ingest(admin.id)
    return { admin, id }
  }
  const lifecycle = (id: string, sql: string) => prisma.$executeRawUnsafe(sql.replace(/\$ID/g, id))

  it('freezes content: no edits to any content column and no delete', async () => {
    const { id } = await draft()
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "videoSha256" = 'x' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/immutable/)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "captionsVtt" = 'WEBVTT' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/immutable/)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "transcriptJson" = '[]'::jsonb WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/immutable/)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "demonstratedParamsJson" = '{}'::jsonb WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/immutable/)
    await expect(lifecycle(id, `DELETE FROM "MediaVersion" WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/never deleted/)
  })

  it('allows only DRAFT > REVIEWED > PUBLISHED > WITHDRAWN (DRAFT or REVIEWED may be withdrawn)', async () => {
    const { admin, id } = await draft()
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'PUBLISHED', "reviewedAt" = now(), "publishedAt" = now(), "publishedById" = 'a' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/not allowed/)
    await lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'REVIEWED', "reviewedAt" = now() WHERE "id" = '$ID'::uuid`)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'DRAFT' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/not allowed/)
    await lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'PUBLISHED', "publishedAt" = now(), "publishedById" = '${admin.id}' WHERE "id" = '$ID'::uuid`)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'REVIEWED' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/not allowed/)
    // A withdrawal must say why and by whom.
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'WITHDRAWN' WHERE "id" = '$ID'::uuid`)).rejects.toThrow()
    await lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'WITHDRAWN', "withdrawnAt" = now(), "withdrawnById" = '${admin.id}', "withdrawReason" = 'TECHNICAL' WHERE "id" = '$ID'::uuid`)
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'PUBLISHED' WHERE "id" = '$ID'::uuid`)).rejects.toThrow(/not allowed/)
    expect((await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })).status).toBe('WITHDRAWN')
  })

  it('refuses PUBLISHED or REVIEWED without the matching timestamps', async () => {
    const { id } = await draft()
    await expect(lifecycle(id, `UPDATE "MediaVersion" SET "status" = 'REVIEWED' WHERE "id" = '$ID'::uuid`)).rejects.toThrow()
  })

  it('allows at most one PUBLISHED version per slot', async () => {
    const { admin, id } = await draft()
    const second = (await ingest(admin.id, otherBundle())).id
    const publish = (target: string) =>
      prisma.$executeRawUnsafe(
        `UPDATE "MediaVersion" SET "status" = 'REVIEWED', "reviewedAt" = now() WHERE "id" = '${target}'::uuid;
         UPDATE "MediaVersion" SET "status" = 'PUBLISHED', "publishedAt" = now(), "publishedById" = '${admin.id}' WHERE "id" = '${target}'::uuid`,
      )
    await publish(id)
    await expect(publish(second)).rejects.toThrow()
    expect(await prisma.mediaVersion.count({ where: { status: 'PUBLISHED' } })).toBe(1)
  })

  it('keeps reviews and suspension events append-only', async () => {
    const { admin, id } = await draft()
    const review = await prisma.mediaReview.create({
      data: { mediaVersionId: id, kind: 'TECHNICAL', decision: 'APPROVED', reviewerId: admin.id, reviewedFingerprint: 'f'.repeat(64), checklistJson: {} },
    })
    await expect(prisma.$executeRaw`UPDATE "MediaReview" SET "decision" = 'CHANGES_REQUESTED' WHERE "id" = ${review.id}::uuid`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`DELETE FROM "MediaReview" WHERE "id" = ${review.id}::uuid`).rejects.toThrow(/append-only/)

    const event = await prisma.techniqueSuspensionEvent.create({
      data: { techniqueKey: 'mouthing-redirect-toy', techniqueVersion: 1, action: 'SUSPEND', note: 'test', actorId: admin.id },
    })
    await expect(prisma.$executeRaw`UPDATE "TechniqueSuspensionEvent" SET "note" = 'x' WHERE "id" = ${event.id}::uuid`).rejects.toThrow(/append-only/)
    await expect(prisma.$executeRaw`DELETE FROM "TechniqueSuspensionEvent" WHERE "id" = ${event.id}::uuid`).rejects.toThrow(/append-only/)
  })

  it('keeps fixture and production storage keys apart and requires audio for production media', async () => {
    const { id } = await draft()
    const base = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
    const { id: _id, ...rest } = base
    void _id
    const copy = (over: Record<string, unknown>) =>
      prisma.mediaVersion.create({
        data: {
          ...(rest as object),
          transcriptJson: rest.transcriptJson ?? [],
          timelineJson: rest.timelineJson ?? [],
          voiceJson: rest.voiceJson ?? [],
          demonstratedParamsJson: rest.demonstratedParamsJson ?? {},
          productionJson: rest.productionJson ?? {},
          version: 99,
          bundleFingerprint: 'e'.repeat(64),
          ...over,
        } as never,
      })
    await expect(copy({ isTestFixture: false })).rejects.toThrow() // fixtures/ keys on production media
    await expect(copy({ isTestFixture: false, videoKey: `v/${id}/video.mp4`, posterKey: `v/${id}/poster.webp`, hasAudio: false })).rejects.toThrow() // silent production clip
    await expect(copy({ videoKey: `v/${id}/video.mp4` })).rejects.toThrow() // production key on a fixture
  })
})

describe('exercise versions can point at a technique version, and legacy ones stay valid', () => {
  it('keeps every existing exercise version without a technique, and enforces the reference when set', async () => {
    const owner = await createUser()
    await onboard(owner.id)
    const exercise = await prisma.exerciseVersion.findFirstOrThrow({ where: { level: { plan: { puppy: { ownerId: owner.id } } } } })
    expect(exercise).toMatchObject({ techniqueKey: null, techniqueVersion: null, techniqueVariant: null, techniqueParamsJson: null })
    await expect(
      prisma.exerciseVersion.update({ where: { id: exercise.id }, data: { techniqueKey: 'nope', techniqueVersion: 1, techniqueVariant: 'STANDARD' } }),
    ).rejects.toThrow()
    await prisma.techniqueVersionState.create({ data: { techniqueKey: 'nope', techniqueVersion: 1, fingerprint: 'f'.repeat(64) } })
    await prisma.exerciseVersion.update({ where: { id: exercise.id }, data: { techniqueKey: 'nope', techniqueVersion: 1, techniqueVariant: 'STANDARD', techniqueParamsJson: { rounds: 3 } } })
  })
})

describe('media tables are closed to the public Data API', () => {
  it('has row level security on every Phase 3 table', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity
        AND tablename IN ('MediaVersion', 'MediaReview', 'TechniqueVersionState', 'TechniqueSuspensionEvent', 'MediaAsset')`
    expect(rows.map((r) => r.tablename).sort()).toEqual(['MediaAsset', 'MediaReview', 'MediaVersion', 'TechniqueSuspensionEvent', 'TechniqueVersionState'])
  })
})

describe.skipIf(!REAL_POSTGRES)('media concurrency on standard PostgreSQL', () => {
  it('parallel ingests of different bundles get distinct version numbers', async () => {
    const admin = await createAdmin()
    const inputs = [4, 5, 6, 7, 8].map((extra) => {
      const base = validBundleInput()
      const manifest = structuredClone(base.manifest) as { timeline: { startMs: number; endMs: number }[] }
      manifest.timeline[1]!.endMs = 8000 + extra
      manifest.timeline[2]!.startMs = 8000 + extra
      return { ...base, manifest }
    })
    const results = await Promise.allSettled(inputs.map((input) => ingest(admin.id, input)))
    const versions = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.version] : []))
    expect(new Set(versions).size).toBe(versions.length)
    expect(versions.length).toBeGreaterThan(0)
    expect((await prisma.mediaVersion.findMany({ select: { version: true } })).map((v) => v.version).sort()).toEqual([...versions].sort())
  })

  it('parallel publishes of two versions leave exactly one PUBLISHED version', async () => {
    const admin = await createAdmin()
    const a = (await ingest(admin.id)).id
    const b = (await ingest(admin.id, otherBundle())).id
    const publish = (id: string) =>
      prisma.$transaction(async (tx) => {
        await tx.mediaVersion.update({ where: { id }, data: { status: 'REVIEWED', reviewedAt: new Date() } })
        await tx.mediaVersion.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: admin.id } })
      })
    const results = await Promise.allSettled([publish(a), publish(b)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.mediaVersion.count({ where: { status: 'PUBLISHED' } })).toBe(1)
  })
})
