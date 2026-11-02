// Validates a media bundle folder and stores it as a DRAFT (nothing is reviewed or published by this command):
//   npx tsx scripts/media-ingest.ts <folder> --admin-email you@example.com [--fixture]
// The folder holds manifest.json, video.mp4, poster.webp, captions.vtt and transcript.json.
// --fixture is for synthetic test bundles and is refused outside a local machine.
// Only validation results and ids are printed. Automated checks cannot replace watching and listening to the clip.
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '../src/server/db'
import { ingestBundle, IngestError } from '../src/server/media/ingest'
import { mediaStoreFromEnv } from '../src/server/media/store'

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--admin-email') + 1])
const email = args[args.indexOf('--admin-email') + 1]
if (!folder || !email || email.startsWith('--')) {
  console.error('Usage: tsx scripts/media-ingest.ts <folder> --admin-email <address> [--fixture]')
  process.exit(1)
}

const store = mediaStoreFromEnv()
if (!store) {
  console.error('No media store is configured for this environment (local machine or MEDIA_STORE=supabase with its settings).')
  process.exit(1)
}
const admin = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
if (!admin) {
  console.error('No account with that address.')
  process.exit(1)
}

try {
  const result = await ingestBundle(
    {
      manifest: JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')),
      video: readFileSync(join(folder, 'video.mp4')),
      poster: readFileSync(join(folder, 'poster.webp')),
      captions: readFileSync(join(folder, 'captions.vtt'), 'utf8'),
      transcript: JSON.parse(readFileSync(join(folder, 'transcript.json'), 'utf8')),
    },
    { fixture: args.includes('--fixture'), adminId: admin.id, store },
  )
  console.log(`DRAFT created: version ${result.version} of ${result.assetId}`)
  console.log(`id ${result.id}`)
  console.log(`bundle fingerprint ${result.bundleFingerprint}`)
  console.log('Next: watch and listen to the clip, then review it (slice 3B). Metadata checks passed; the content is NOT reviewed.')
} catch (error) {
  if (error instanceof IngestError) {
    console.error('Rejected:')
    for (const issue of error.issues) console.error(` - ${issue}`)
    process.exit(2)
  }
  throw error
} finally {
  await prisma.$disconnect()
}
