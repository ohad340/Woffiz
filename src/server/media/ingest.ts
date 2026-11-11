import { randomUUID } from 'node:crypto'
import { TECHNIQUES } from '@/domain/techniques/catalog'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import type { Prisma } from '@/generated/prisma/client'
import { assertAdmin } from '../admin'
import { prisma } from '../db'
import { isLocalMachine, type Env } from '../local-mode'
import { validateBundle, type BundleInput } from './bundle'
import { mediaKeys, type MediaStore } from './store'

export class IngestError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('; '))
  }
}

export type IngestOptions = {
  /** A synthetic test bundle. Allowed only on a developer's machine or under NODE_ENV=test. */
  fixture: boolean
  adminId: string
  store: MediaStore
  env?: Env
  /** The technique catalog (tests inject definitions; the real catalog by default). */
  techniques?: readonly TechniqueDefinition[]
}

export const FIXTURE_VENDOR = 'test-fixture'
export const slotId = (key: string, version: number, variant: string) => `slot:${key}@${version}:${variant}`

const json = (value: unknown) => value as unknown as Prisma.InputJsonValue

/**
 * Validates a bundle and stores it as a DRAFT MediaVersion. Nothing is reviewed or published here: a draft has
 * no reviews and the database refuses to publish content that has changed since. Fixtures and production media
 * never mix: a fixture must say so in its manifest, a production bundle must not, and they never share a slot.
 */
export async function ingestBundle(input: BundleInput, options: IngestOptions) {
  const env = options.env ?? process.env
  if (options.fixture && !(isLocalMachine(env) || env.NODE_ENV === 'test')) {
    throw new IngestError(['fixture bundles are refused outside a local machine'])
  }
  await assertAdmin(options.adminId)

  const techniques = options.techniques ?? TECHNIQUES
  const { issues, bundle } = validateBundle(input, techniques)
  if (!bundle) throw new IngestError(issues)
  const { manifest } = bundle
  const labelledFixture = manifest.production.video.vendor === FIXTURE_VENDOR || manifest.production.voice.vendor === FIXTURE_VENDOR
  if (options.fixture !== labelledFixture) {
    throw new IngestError([options.fixture ? 'a fixture bundle must be labelled with the test-fixture vendor' : 'a bundle labelled test-fixture cannot be ingested as production media'])
  }

  const def = techniques.find((t) => t.key === manifest.technique.key && t.version === manifest.technique.version)!
  const assetId = slotId(def.key, def.version, manifest.technique.variant)
  const id = randomUUID()
  const keys = mediaKeys(id, options.fixture)

  // Upload first: the database row is only created when both objects exist. A failed insert leaves unreferenced objects
  // under an unused id, which are harmless (nothing points at them).
  await options.store.put(keys.videoKey, input.video, 'video/mp4')
  await options.store.put(keys.posterKey, input.poster, 'image/webp')

  return prisma.$transaction(async (tx) => {
    const state = await tx.techniqueVersionState.findUnique({ where: { techniqueKey_techniqueVersion: { techniqueKey: def.key, techniqueVersion: def.version } } })
    if (!state) {
      await tx.techniqueVersionState.create({ data: { techniqueKey: def.key, techniqueVersion: def.version, fingerprint: bundle.techniqueFingerprint } })
    } else if (state.fingerprint !== bundle.techniqueFingerprint) {
      throw new IngestError([`${def.key}@${def.version} was registered with a different definition: demonstrated behaviour changes need a new version`])
    }

    const existing = await tx.mediaAsset.findUnique({ where: { id: assetId } })
    if (existing && existing.isTestFixture !== options.fixture) throw new IngestError(['fixture and production media never share a slot'])
    if (!existing) {
      await tx.mediaAsset.create({
        data: {
          id: assetId,
          family: def.topic,
          variant: manifest.technique.variant,
          status: 'SLOT',
          isTestFixture: options.fixture,
          techniqueKey: def.key,
          techniqueVersion: def.version,
        },
      })
    }
    // Serialise concurrent ingests of the same slot so version numbers never collide.
    await tx.$queryRaw`SELECT "id" FROM "MediaAsset" WHERE "id" = ${assetId} FOR UPDATE`

    const duplicate = await tx.mediaVersion.findFirst({ where: { assetId, bundleFingerprint: bundle.bundleFingerprint }, select: { version: true } })
    if (duplicate) throw new IngestError([`this exact bundle is already version ${duplicate.version} of its slot`])
    const latest = await tx.mediaVersion.aggregate({ where: { assetId }, _max: { version: true } })

    const created = await tx.mediaVersion.create({
      data: {
        id,
        assetId,
        version: (latest._max.version ?? 0) + 1,
        status: 'DRAFT',
        techniqueKey: def.key,
        techniqueVersion: def.version,
        variant: manifest.technique.variant,
        techniqueFingerprint: bundle.techniqueFingerprint,
        videoKey: keys.videoKey,
        posterKey: keys.posterKey,
        videoSha256: bundle.videoSha256,
        posterSha256: bundle.posterSha256,
        captionsSha256: bundle.captionsSha256,
        transcriptSha256: bundle.transcriptSha256,
        bundleFingerprint: bundle.bundleFingerprint,
        bytes: bundle.bytes,
        width: bundle.width,
        height: bundle.height,
        durationMs: bundle.durationMs,
        hasAudio: bundle.hasAudio,
        captionsVtt: input.captions,
        transcriptJson: json(bundle.transcript),
        timelineJson: json(manifest.timeline),
        voiceJson: json(manifest.voice),
        demonstratedParamsJson: json(manifest.demonstratedParams),
        productionJson: json(manifest.production),
        isTestFixture: options.fixture,
        createdById: options.adminId,
      },
    })
    return { id: created.id, assetId, version: created.version, bundleFingerprint: bundle.bundleFingerprint }
  })
}
