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
process.env.LOCAL_SIGNUP = 'true'
process.env.AUTH_RATE_MAX = '10000'
// The per-IP email limit (all test requests share one IP); the per-address limit stays real.
process.env.AUTH_EMAIL_RATE_MAX = '10000'
// PGlite (local) serves one connection; standard PostgreSQL (CI) keeps the default pool so concurrency is real.
if (process.env.TEST_DB_KIND !== 'postgres') process.env.DATABASE_POOL_MAX = '1'
// Mail never leaves the machine in tests: the outbox transport (local only) is selected, and test files
// that send mail mock delivery on top of it. A real RESEND_API_KEY from .env is ignored.
process.env.EMAIL_TRANSPORT = 'outbox'
process.env.EMAIL_OUTBOX_DIR = 'test-results/integration-outbox'
delete process.env.RESEND_API_KEY
delete process.env.TESTER_EMAIL
