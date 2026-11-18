import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { auth } from '@/server/auth'
import { prisma } from '@/server/db'
import { setDeferredSinkForTests } from '@/server/ops/defer'
import { utcTs } from '@/server/ops/time'
import { BASE, cookieFrom } from './mail'

// Helpers of the slice 4.6 suites (ops events, alerts, housekeeping, purge).

export const PASSWORD = 'correct horse battery'

/** Collects after-response tasks (no Next.js request scope in tests) so a test can run them when it chooses. */
export function deferredTasks() {
  const tasks: (() => Promise<void>)[] = []
  setDeferredSinkForTests((task) => tasks.push(task))
  return {
    count: () => tasks.length,
    /** Runs every queued task (and those they queue), in order. */
    async drain() {
      while (tasks.length) await tasks.shift()!()
    },
    uninstall: () => setDeferredSinkForTests(null),
  }
}

/** A verified account with a password and a signed-in session cookie. */
export async function signedInAccount(role: 'OWNER' | 'ADMIN' = 'OWNER', email = `ops-${randomUUID()}@example.test`) {
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'בדיקה' } as never, headers: new Headers({ origin: BASE }), asResponse: true })
  if (signUp.status !== 200) throw new Error(`sign-up answered ${signUp.status}`)
  const user = await prisma.user.update({ where: { email }, data: { emailVerified: true, role } })
  const signIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, headers: new Headers({ origin: BASE }), asResponse: true })
  if (signIn.status !== 200) throw new Error(`sign-in answered ${signIn.status}`)
  return { ...user, cookie: cookieFrom(signIn) }
}

/** A fresh outbox directory for this test (mail is written as files; nothing leaves the machine). */
export function freshOutbox() {
  const dir = mkdtempSync(join(tmpdir(), 'woffiz-ops-outbox-'))
  vi.stubEnv('EMAIL_OUTBOX_DIR', dir)
  return dir
}

/** An outbox path that cannot be written (its parent is a file), so every delivery fails. */
export function brokenOutbox() {
  const dir = mkdtempSync(join(tmpdir(), 'woffiz-ops-broken-'))
  const file = join(dir, 'not-a-directory')
  writeFileSync(file, '')
  vi.stubEnv('EMAIL_OUTBOX_DIR', join(file, 'outbox'))
}

type OutboxMessage = { kind: string; to: string; subject: string; html: string; text: string; url: string }

/** Alert emails written to the outbox directory. */
export function alertFiles(dir: string): (OutboxMessage & { raw: string })[] {
  return readdirSync(dir)
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .map((raw) => ({ ...(JSON.parse(raw) as OutboxMessage), raw }))
    .filter((message) => message.kind === 'ops-alert')
}

/** Inserts operational events at an exact time. */
export async function insertEvents(kind: 'SERVER_ERROR' | 'AUTH_EMAIL_FAILED' | 'HOUSEKEEPING_FAILED', count: number, at: Date) {
  for (let i = 0; i < count; i++) {
    await prisma.$executeRaw`INSERT INTO "OpsEvent" ("id", "kind", "createdAt") VALUES (gen_random_uuid(), ${kind}::"OpsEventKind", ${utcTs(at)})`
  }
}

export const eventCount = (kind: 'SERVER_ERROR' | 'AUTH_EMAIL_FAILED' | 'HOUSEKEEPING_FAILED') => prisma.opsEvent.count({ where: { kind } })

export const openAlerts = () => prisma.opsAlert.findMany({ where: { resolvedAt: null }, orderBy: { openedAt: 'asc' } })

export const MIN = 60_000
export const HOUR = 60 * MIN
export const later = (from: Date, ms: number) => new Date(from.getTime() + ms)
