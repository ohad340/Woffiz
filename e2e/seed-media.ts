// Test helper run by the e2e specs (never by the app): makes an existing e2e account an ADMIN and stores a synthetic
// FIXTURE bundle as a DRAFT. Refuses to run anywhere but a local machine. Prints the new version id as JSON.
import { prisma } from '../src/server/db'
import { ingestBundle } from '../src/server/media/ingest'
import { mediaStoreFromEnv } from '../src/server/media/store'
import { isLocalMachine } from '../src/server/local-mode'
import { variantBundleInput } from '../test/media/fixtures'

const [email, variant, ...flags] = process.argv.slice(2)
if (!email || !isLocalMachine()) throw new Error('usage: seed-media <email> <variant>; local machine only')
const store = mediaStoreFromEnv()
if (!store) throw new Error('no local media store')

const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role: 'ADMIN' } })
// The shared test database may still carry a suspension left by the integration suite; --unsuspend clears it (test data only).
if (flags.includes('--unsuspend')) await prisma.techniqueVersionState.updateMany({ data: { suspendedAt: null } })
const result = await ingestBundle(variantBundleInput(Number(variant) || 0), { fixture: true, adminId: user.id, store })
console.log(JSON.stringify({ versionId: result.id }))
await prisma.$disconnect()
