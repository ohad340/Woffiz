// Writes manifest.json, captions.vtt and transcript.json of a production bundle from its script.json:
//   npx tsx scripts/build-pilot-files.ts pilot/mouthing-redirect-toy-1-standard [--allow-placeholder]
// Run it again after every edit of script.json (for example after re-timing the lines to the real voice audio) and after any
// change to the technique definition: the manifest carries the definition's fingerprint. Then add video.mp4 and poster.webp
// to the same folder and ingest it with scripts/media-ingest.ts. Production dates of 0000-00-00 are refused unless
// --allow-placeholder, which is for dry runs only. Reads and writes local files; no network, no database.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildPilotFiles, type PilotScript } from '../src/server/media/pilot-files'

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith('--'))
if (!folder) {
  console.error('Usage: tsx scripts/build-pilot-files.ts <folder> [--allow-placeholder]')
  process.exit(1)
}
const script = JSON.parse(readFileSync(join(folder, 'script.json'), 'utf8')) as PilotScript
const { manifest, captions, transcript, placeholders } = buildPilotFiles(script)
if (placeholders.length && !args.includes('--allow-placeholder')) {
  console.error('script.json still has production dates of 0000-00-00 (video or voice not produced yet). Fill them in, or pass --allow-placeholder for a dry run.')
  process.exit(2)
}
writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(join(folder, 'captions.vtt'), captions)
writeFileSync(join(folder, 'transcript.json'), JSON.stringify(transcript, null, 2) + '\n')
console.log(`written manifest.json, captions.vtt, transcript.json in ${folder}`)
