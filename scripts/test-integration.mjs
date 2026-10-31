// Applies migrations to the dedicated TEST database, then runs the integration suite.
// The suite TRUNCATES tables, so it refuses to run against the development database.
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Start a test database (npm run db:test:dev) and set it in .env.')
  process.exit(1)
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL must differ from DATABASE_URL: the suite wipes its database.')
  process.exit(1)
}

const kind = process.env.TEST_DB_KIND ?? 'pglite'
console.log(`Integration tests against a ${kind} database.`)
if (kind !== 'postgres') {
  console.log('Concurrency / row-locking tests are SKIPPED here. They run only on standard PostgreSQL (TEST_DB_KIND=postgres, e.g. CI).')
}

const env = { ...process.env, DATABASE_URL: testUrl, SHADOW_DATABASE_URL: '', TEST_DB_KIND: kind }
const run = (args) => spawnSync('npx', args, { stdio: 'inherit', env, shell: true })

let result = run(['prisma', 'migrate', 'deploy'])
if (result.status !== 0) process.exit(result.status ?? 1)
result = run(['vitest', 'run', '--config', 'vitest.integration.config.ts', ...process.argv.slice(2)])
process.exit(result.status ?? 1)
