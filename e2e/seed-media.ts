// Test helper run by the e2e specs (never by the app): makes an existing e2e account an ADMIN and stores a synthetic
// FIXTURE bundle as a DRAFT. Refuses to run anywhere but a local machine. Prints the new version id as JSON.
import { prisma } from '../src/server/db'
import { IngestError, ingestBundle } from '../src/server/media/ingest'
import { mediaStoreFromEnv } from '../src/server/media/store'
import { isLocalMachine } from '../src/server/local-mode'
import { playableMedia, variantBundleInput } from '../test/media/fixtures'

const [email, variant, ...flags] = process.argv.slice(2)
if (!email || !isLocalMachine()) throw new Error('usage: seed-media <email> <variant>; local machine only')
const store = mediaStoreFromEnv()
if (!store) throw new Error('no local media store')

const user = await prisma.user.update({ where: { email: email.toLowerCase() }, data: { role: 'ADMIN' } })
// The shared test database may still carry a suspension left by the integration suite; --unsuspend clears it (test data only).
if (flags.includes('--unsuspend')) await prisma.techniqueVersionState.updateMany({ data: { suspendedAt: null } })
// The shared test database may already hold this exact bundle: retry with a nearby variant.
let result: Awaited<ReturnType<typeof ingestBundle>> | undefined
for (let attempt = 0; !result; attempt++) {
  try {
    result = await ingestBundle({ ...variantBundleInput((Number(variant) || 0) + attempt), ...playableMedia() }, { fixture: true, adminId: user.id, store })
  } catch (error) {
    if (attempt >= 20 || !(error instanceof IngestError) || !/already version/.test(error.message)) throw error
  }
}
console.log(JSON.stringify({ versionId: result.id }))
await prisma.$disconnect()
