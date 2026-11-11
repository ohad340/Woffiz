// LOCAL MACHINE ONLY. Binds the current level of a local account to the pilot technique, so the published pilot clip can be
// watched on the real exercise screen without waiting for the plan generator to place that topic:
//   npx tsx scripts/pilot-bind-local.ts --email you@example.com [--key mouthing-redirect-toy --version 1]
// It adds a new exercise version to the account's CURRENT level with the catalog rendering of the technique's STANDARD variant
// (default parameters), exactly the shape the generator stores. It does not publish, approve or review anything: the clip only
// shows if it is PUBLISHED and the definition is approved and frozen in the lock file. Refused outside a local machine.
import 'dotenv/config'
import { getTechnique } from '../src/domain/techniques/catalog'
import { defaultParams } from '../src/domain/techniques/params'
import { renderTechniqueContent } from '../src/domain/techniques/render'
import { prisma } from '../src/server/db'
import { isLocalMachine } from '../src/server/local-mode'
import { slotId } from '../src/server/media/ingest'

const args = process.argv.slice(2)
const value = (flag: string) => args[args.indexOf(flag) + 1]
const email = args.includes('--email') ? value('--email') : undefined
const key = args.includes('--key') ? value('--key')! : 'mouthing-redirect-toy'
const version = args.includes('--version') ? Number(value('--version')) : 1
if (!email || !isLocalMachine()) {
  console.error('Usage: tsx scripts/pilot-bind-local.ts --email <address> [--key k --version n]. Local machine only (APP_ENV=local, BETTER_AUTH_URL on localhost).')
  process.exit(1)
}
const def = getTechnique(key, version)
const variant = def?.variants.STANDARD
if (!def || !variant) {
  console.error(`unknown technique ${key}@${version}`)
  process.exit(1)
}
const owner = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
const plan = owner && (await prisma.plan.findFirst({ where: { puppy: { ownerId: owner.id }, status: 'ACTIVE' } }))
if (!plan?.currentLevelId) {
  console.error('That account has no active plan with a current level. Finish onboarding first.')
  process.exit(1)
}
const levelId = plan.currentLevelId
const latest = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId }, orderBy: { version: 'desc' } })
const params = defaultParams(variant)
await prisma.$transaction([
  prisma.exerciseVersion.create({
    data: {
      levelId,
      version: latest.version + 1,
      criterionVersion: latest.criterionVersion + 1,
      contentJson: renderTechniqueContent(def, 'STANDARD', params),
      mediaId: slotId(key, version, 'STANDARD'),
      techniqueKey: key,
      techniqueVersion: version,
      techniqueVariant: 'STANDARD',
      techniqueParamsJson: { params, tipIds: [] },
    },
  }),
  prisma.level.update({ where: { id: levelId }, data: { contentVersion: { increment: 1 } } }),
])
console.log(`Level ${levelId} now shows ${key}@${version} STANDARD. Open /exercise/${levelId}`)
await prisma.$disconnect()
