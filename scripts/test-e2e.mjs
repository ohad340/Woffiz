// Applies migrations to the dedicated TEST database, builds the app, then runs Playwright against it.
import 'dotenv/config'
import { spawnSync } from 'node:child_process'

const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Start a test database (npm run db:test:dev) and set it in .env.')
  process.exit(1)
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL must differ from DATABASE_URL.')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL: testUrl, SHADOW_DATABASE_URL: '' }
const run = (args) => spawnSync('npx', args, { stdio: 'inherit', env, shell: true })

for (const args of [['prisma', 'migrate', 'deploy'], ['next', 'build'], ['playwright', 'test', ...process.argv.slice(2)]]) {
  const result = run(args)
  if (result.status !== 0) process.exit(result.status ?? 1)
}
