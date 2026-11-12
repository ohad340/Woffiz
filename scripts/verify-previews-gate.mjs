// Proves that `?state=` previews are off in a production-mode server unless it runs on this machine (P4-2).
// Needs an existing production build (`npm run build`). Starts `next start` once per case with an EXPLICIT
// environment, because Next.js loads .env for any variable that is missing and could otherwise reopen the gate.
// Runs against TEST_DATABASE_URL only, never the development or a hosted database.
import 'dotenv/config'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const PORT = 3101
const ORIGIN = `http://localhost:${PORT}`
const PREVIEW_TEXT = { error: 'לא הצלחנו לטעון את המפה', empty: 'עוד אין תוכנית אימון' }

if (!existsSync('.next/BUILD_ID')) {
  console.error('No production build found: run `npm run build` first.')
  process.exit(1)
}
const testUrl = process.env.TEST_DATABASE_URL
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Start a test database (npm run db:test:dev) and set it in .env.')
  process.exit(1)
}
if (testUrl === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL must differ from DATABASE_URL.')
  process.exit(1)
}

const CASES = [
  { name: 'A (Vercel shape)', APP_ENV: 'production', BETTER_AUTH_URL: 'https://woffiz.example', previews: false },
  { name: 'B (APP_ENV=local, public URL)', APP_ENV: 'local', BETTER_AUTH_URL: 'https://woffiz.example', previews: false },
  { name: 'C (APP_ENV=preview, localhost)', APP_ENV: 'preview', BETTER_AUTH_URL: ORIGIN, previews: false },
  { name: 'D (positive control: this machine)', APP_ENV: 'local', BETTER_AUTH_URL: ORIGIN, previews: true },
]

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')

function stop(child) {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

async function waitForServer(child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`next start exited with code ${child.exitCode}`)
    try {
      if ((await fetch(`${ORIGIN}/offline.html`)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('next start did not answer within 60 s')
}

async function runCase(testCase) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    APP_ENV: testCase.APP_ENV,
    BETTER_AUTH_URL: testCase.BETTER_AUTH_URL,
    BETTER_AUTH_SECRET: 'previews-gate-secret-previews-gate-secret',
    DATABASE_URL: testUrl,
    SHADOW_DATABASE_URL: '',
    DATABASE_POOL_MAX: '1',
  }
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  try {
    await waitForServer(child)
    const failures = []
    const observed = []
    for (const [state, text] of Object.entries(PREVIEW_TEXT)) {
      const response = await fetch(`${ORIGIN}/map?state=${state}`, { redirect: 'manual' })
      const body = await response.text()
      const shown = body.includes(text)
      observed.push(`state=${state}: ${response.status}${response.headers.get('location') ? ` → ${response.headers.get('location')}` : ''}, preview ${shown ? 'shown' : 'absent'}`)
      // Unauthenticated requests always get the (main) layout's 307 to "/", but Next.js renders the page in
      // parallel and its payload is in the body, so the preview text is the signal (status is recorded only).
      if (testCase.previews && !shown) failures.push(`expected the ${state} preview in the response`)
      if (!testCase.previews && shown) failures.push(`the ${state} preview must not render`)
    }
    return { ok: failures.length === 0, detail: [...observed, ...failures].join('; ') }
  } catch (error) {
    return { ok: false, detail: `${error.message}${stderr ? `\n${stderr.trim()}` : ''}` }
  } finally {
    stop(child)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

let allPassed = true
for (const testCase of CASES) {
  const result = await runCase(testCase)
  allPassed &&= result.ok
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${testCase.name} [APP_ENV=${testCase.APP_ENV}, BETTER_AUTH_URL=${testCase.BETTER_AUTH_URL}]: ${result.detail}`)
}
process.exit(allPassed ? 0 : 1)
