// Runs before every integration test file. It must set the environment BEFORE any server module
// is imported, because db.ts and auth.ts read it at import time.
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('Set TEST_DATABASE_URL (see .env.example). Run tests with: npm run test:integration')
if (process.env.TEST_DATABASE_URL === undefined && process.env.CI !== 'true') {
  throw new Error('Refusing to run: TEST_DATABASE_URL is not set and the suite wipes its database.')
}

process.env.DATABASE_URL = url
process.env.BETTER_AUTH_SECRET = 'integration-test-secret-integration-test-secret'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.APP_ENV = 'local'
process.env.DEV_EMAIL_INBOX = 'true'
// PGlite (local) serves one connection; standard PostgreSQL (CI) keeps the default pool so concurrency is real.
if (process.env.TEST_DB_KIND !== 'postgres') process.env.DATABASE_POOL_MAX = '1'
