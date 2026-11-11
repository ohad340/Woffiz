// Prints the fingerprint of a technique definition, the value that goes into techniques.lock.json when the owner approves it:
//   npx tsx scripts/technique-fingerprint.ts mouthing-redirect-toy 1
// Reads the catalog only; changes nothing.
import { getTechnique } from '../src/domain/techniques/catalog'
import { fingerprintTechnique } from '../src/domain/techniques/fingerprint'

const [key, version] = process.argv.slice(2)
const def = key && version ? getTechnique(key, Number(version)) : undefined
if (!def) {
  console.error('Usage: tsx scripts/technique-fingerprint.ts <key> <version>')
  process.exit(1)
}
console.log(`${def.key}@${def.version} (${def.review.status}) ${fingerprintTechnique(def)}`)
