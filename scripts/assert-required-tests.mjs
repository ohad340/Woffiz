// Fails unless every test listed in scripts/required-pg-tests.json EXECUTED and PASSED in a Vitest JSON report.
// A skipped test is not a pass: checking TEST_DB_KIND alone cannot tell whether the PostgreSQL-only tests really ran,
// so CI runs the integration suite with the JSON reporter and then this script.
//   node scripts/assert-required-tests.mjs test-results/integration.json
import { readFileSync } from 'node:fs'

const reportPath = process.argv[2]
if (!reportPath) {
  console.error('Usage: node scripts/assert-required-tests.mjs <vitest-json-report>')
  process.exit(2)
}

const { required, allowedToSkip = [] } = JSON.parse(readFileSync(new URL('./required-pg-tests.json', import.meta.url), 'utf8'))
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const results = new Map()
for (const file of report.testResults ?? []) {
  for (const test of file.assertionResults ?? []) results.set(test.fullName, test.status)
}

const problems = []
for (const name of required) {
  const status = results.get(name)
  if (status === undefined) problems.push(`MISSING  ${name}`)
  else if (status !== 'passed') problems.push(`${status.toUpperCase().padEnd(8)} ${name}`)
}
// Nothing else may be silently skipped either (the opt-in live-model test is the one allowed exception).
for (const [name, status] of results) {
  if (status !== 'passed' && !required.includes(name) && !allowedToSkip.includes(name)) problems.push(`${status.toUpperCase().padEnd(8)} ${name}`)
}

if (problems.length) {
  console.error(`Required PostgreSQL tests did not all execute and pass (${problems.length} problem(s)):`)
  for (const line of problems) console.error(`  ${line}`)
  process.exit(1)
}
console.log(`All ${required.length} required PostgreSQL tests executed and passed (${results.size} tests in the report).`)
