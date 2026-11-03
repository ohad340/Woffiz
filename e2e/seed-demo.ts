// Test helper run by the e2e specs (never by the app), local machine only. TEST DATA ONLY:
// - publishes SYNTHETIC FIXTURE clips of name-look@1 (STANDARD and EASIER) using an APPROVED COPY of the draft definition
//   (the real definition stays draft; nothing real is approved);
// - binds the owner's current level to name-look@1 STANDARD by adding a new exercise version with the catalog rendering
//   (the normal app flows would do this through generation; here it is set up directly for the browser tests);
// - mode "paused" then suspends the technique, mode "unavailable" withdraws the STANDARD clip.
// Prints {levelId, exerciseVersionId} as JSON.
import { randomUUID } from 'node:crypto'
import { TECHNIQUES } from '../src/domain/techniques/catalog'
import { fingerprintTechnique } from '../src/domain/techniques/fingerprint'
import { defaultParams } from '../src/domain/techniques/params'
import { renderTechniqueContent } from '../src/domain/techniques/render'
import type { TechniqueDefinition } from '../src/domain/techniques/types'
import { prisma } from '../src/server/db'
import { isLocalMachine } from '../src/server/local-mode'
import { CHECKLISTS } from '../src/server/media/gates'
import { IngestError, ingestBundle, slotId } from '../src/server/media/ingest'
import { markReviewed, publish, submitReview, suspendTechnique, withdraw } from '../src/server/media/lifecycle'
import { mediaStoreFromEnv } from '../src/server/media/store'
import { nameLookBundleInput } from '../test/media/fixtures'

const [email, mode = 'ready'] = process.argv.slice(2)
if (!email || !isLocalMachine()) throw new Error('usage: seed-demo <email> <ready|paused|unavailable>; local machine only')
const store = mediaStoreFromEnv()
if (!store) throw new Error('no local media store')

const approve = (def: TechniqueDefinition): TechniqueDefinition => ({ ...def, review: { status: 'approved', approvedBy: 'e2e-test', approvedOn: '2026-11-03' } })
const techniques = TECHNIQUES.map(approve)
const lock = Object.fromEntries(techniques.map((def) => [`${def.key}@${def.version}`, fingerprintTechnique(def)]))
const deps = { techniques, lock }
const NAME = techniques.find((t) => t.key === 'name-look')!

const admin = await prisma.user.create({ data: { id: randomUUID(), name: 'E2E admin', email: `e2e-admin-${randomUUID()}@example.test`, emailVerified: true, role: 'ADMIN' } })
// Earlier specs may have left the technique suspended in this shared test database.
await prisma.techniqueVersionState.updateMany({ where: { techniqueKey: 'name-look' }, data: { suspendedAt: null } })

async function publishFixture(variant: 'STANDARD' | 'EASIER') {
  // The shared test database may already hold a clip with the same timing: retry with another random shift.
  let id = ''
  for (let attempt = 0; !id; attempt++) {
    try {
      id = (await ingestBundle(nameLookBundleInput(variant, 1 + Math.floor(Math.random() * 900), { playable: true }), { fixture: true, adminId: admin.id, store: store! })).id
    } catch (error) {
      if (attempt >= 20 || !(error instanceof IngestError) || !/already version/.test(error.message)) throw error
    }
  }
  const { bundleFingerprint } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
  for (const kind of ['TECHNICAL', 'CONTENT'] as const) {
    await submitReview(admin.id, id, { kind, decision: 'APPROVED', checklist: Object.fromEntries(CHECKLISTS[kind].map((c) => [c, true])), fingerprint: bundleFingerprint })
  }
  await markReviewed(admin.id, id, deps)
  await publish(admin.id, id, deps)
  return id
}
const standardClip = await publishFixture('STANDARD')
await publishFixture('EASIER')

const owner = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } })
const plan = await prisma.plan.findFirstOrThrow({ where: { puppy: { ownerId: owner.id }, status: 'ACTIVE' } })
const levelId = plan.currentLevelId!
const latest = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId }, orderBy: { version: 'desc' } })
const params = defaultParams(NAME.variants.STANDARD!)
const exercise = await prisma.exerciseVersion.create({
  data: {
    levelId,
    version: latest.version + 1,
    criterionVersion: latest.criterionVersion + 1,
    contentJson: renderTechniqueContent(NAME, 'STANDARD', params),
    mediaId: slotId('name-look', 1, 'STANDARD'),
    techniqueKey: 'name-look',
    techniqueVersion: 1,
    techniqueVariant: 'STANDARD',
    techniqueParamsJson: { params, tipIds: [] },
  },
})
await prisma.level.update({ where: { id: levelId }, data: { contentVersion: { increment: 1 } } })

if (mode === 'paused') await suspendTechnique(admin.id, 'name-look', 1, 'e2e: paused guidance')
if (mode === 'unavailable') await withdraw(admin.id, standardClip, { reason: 'TECHNICAL', note: 'e2e: unavailable clip' }, deps)

console.log(JSON.stringify({ levelId, exerciseVersionId: exercise.id }))
await prisma.$disconnect()
