import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'

// Fixed-timestamp seed of the pilot-metrics tests (slice 4.6). Every row is written directly so each timestamp is exact.
// Israel days around the DST start (2026-03-27): 2026-03-26T21:30Z is 23:30 on the 26th, 22:30Z is 00:30 on the 27th.

export const AS_OF = new Date('2026-03-30T10:00:00Z')
export const TODAY = '2026-03-30'

/** Distinctive strings that must never appear in metrics, snapshots, the page, alert mail or logs. */
export const CANARY = {
  email: 'privacy-canary-email@example.test',
  name: 'PrivacyCanaryName',
  puppy: 'כלבלב-קנרית',
  profile: 'canary-profile-text',
  exercise: 'canary-exercise-text',
  payload: 'canary-payload-text',
  idempotency: 'canary-idem-key',
}

const t = (iso: string) => new Date(iso)

type Topic = 'TOILET' | 'BITING' | 'SLEEP' | 'ALONE' | 'COMMANDS'

async function user(o: { email?: string; name?: string; verified: boolean; role?: 'OWNER' | 'ADMIN'; createdAt?: string }) {
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: o.name ?? 'בדיקה',
      email: o.email ?? `metrics-${randomUUID()}@example.test`,
      emailVerified: o.verified,
      role: o.role ?? 'OWNER',
      createdAt: t(o.createdAt ?? '2026-02-01T08:00:00Z'),
    },
  })
}

async function puppy(ownerId: string, onboardedAt: string | null, name = 'לוקה', profile = '') {
  return prisma.puppy.create({ data: { ownerId, name, profileJson: { note: profile }, onboardedAt: onboardedAt ? t(onboardedAt) : null } })
}

/** An ACTIVE plan with levels; the level at `current` (position) is the plan's current level. */
async function plan(puppyId: string, createdAt: string, levels: { position: number; topic: Topic }[], current: number, text = 'צעד') {
  const created = await prisma.plan.create({ data: { puppyId, createdAt: t(createdAt) } })
  const rows = []
  for (const level of levels) {
    const row = await prisma.level.create({
      data: { planId: created.id, position: level.position, topic: level.topic, state: level.position === current ? 'CURRENT' : level.position < current ? 'COMPLETED' : 'LOCKED' },
    })
    const exercise = await prisma.exerciseVersion.create({ data: { levelId: row.id, contentJson: { title: text } } })
    rows.push({ ...row, exerciseId: exercise.id })
  }
  await prisma.plan.update({ where: { id: created.id }, data: { currentLevelId: rows.find((r) => r.position === current)!.id } })
  return { plan: created, levels: rows }
}

async function attempt(puppyId: string, level: { id: string; exerciseId: string }, at: string, outcome: 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING', mode: 'CURRENT' | 'REVIEW' = 'CURRENT') {
  return prisma.attempt.create({ data: { puppyId, levelId: level.id, exerciseVersionId: level.exerciseId, outcome, mode, createdAt: t(at) } })
}

async function mastery(level: { id: string }, attemptId: string, at: string) {
  return prisma.masteryEvent.create({ data: { levelId: level.id, attemptId, criterionVersion: 1, confirmedAt: t(at) } })
}

async function job(puppyId: string, ownerId: string, status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED' | 'STALE', createdAt: string, errorCode: string | null = null, payload?: string) {
  return prisma.generationJob.create({
    data: {
      puppyId,
      ownerId,
      kind: 'INITIAL_PLAN',
      status,
      expectedRevision: 0,
      promptVersion: 'p',
      policyVersion: 'p',
      model: 'fake',
      errorCode,
      payloadJson: payload ? { text: payload } : undefined,
      createdAt: t(createdAt),
      finishedAt: status === 'PENDING' ? null : t(createdAt),
      idempotencyKey: `seed-${randomUUID()}`,
      leaseExpiresAt: t(createdAt),
    },
  })
}

/**
 * Owners A, B, C (verified, onboarded), D (verified, not onboarded), E (legacy unverified WITH data), F (unverified, empty),
 * an ADMIN with data, and an owner created after AS_OF. Expected values: EXPECTED below.
 */
export async function seedMetrics() {
  // A: onboarded 03-10, first CURRENT attempt 1 h later, returned on day 7, mastery of level 1, practice on 03-26, 03-27 and 03-29.
  const a = await user({ verified: true, email: CANARY.email, name: CANARY.name })
  const pa = await puppy(a.id, '2026-03-10T08:00:00Z', CANARY.puppy, CANARY.profile)
  const planA = await plan(pa.id, '2026-03-10T08:00:00Z', [{ position: 1, topic: 'BITING' }, { position: 2, topic: 'SLEEP' }], 2, CANARY.exercise)
  const [a1, a2] = planA.levels
  await attempt(pa.id, a1!, '2026-03-10T09:00:00Z', 'STRUGGLING')
  await attempt(pa.id, a1!, '2026-03-11T09:00:00Z', 'STRUGGLING')
  const masteredBy = await attempt(pa.id, a1!, '2026-03-17T10:00:00Z', 'INDEPENDENT')
  await mastery(a1!, masteredBy.id, '2026-03-17T10:00:00Z')
  await attempt(pa.id, a2!, '2026-03-26T21:30:00Z', 'WITH_HELP') // Israel day 03-26
  await attempt(pa.id, a2!, '2026-03-26T22:30:00Z', 'WITH_HELP') // Israel day 03-27
  await attempt(pa.id, a1!, '2026-03-29T12:00:00Z', 'INDEPENDENT', 'REVIEW')
  await prisma.idempotencyKey.create({ data: { userId: a.id, operation: 'attempt', key: CANARY.idempotency, requestHash: 'h', responseJson: {} } })
  await job(pa.id, a.id, 'SUCCEEDED', '2026-03-25T08:00:00Z')
  await job(pa.id, a.id, 'FAILED', '2026-03-28T08:00:00Z', 'provider status 503', CANARY.payload)
  await job(pa.id, a.id, 'FAILED', '2026-03-28T09:00:00Z', 'quota-account')
  await job(pa.id, a.id, 'SUCCEEDED', '2026-03-20T08:00:00Z') // older than 7 days

  // B: onboarded 03-25, no practice: not stalled yet (current for less than 7 days), not yet eligible for day-7 return.
  const b = await user({ verified: true })
  const pb = await puppy(b.id, '2026-03-25T08:00:00Z')
  await plan(pb.id, '2026-03-25T08:00:00Z', [{ position: 1, topic: 'TOILET' }], 1)
  await job(pb.id, b.id, 'FAILED', '2026-03-29T08:00:00Z', 'deadline')
  await job(pb.id, b.id, 'STALE', '2026-03-29T09:00:00Z')

  // C: onboarded 03-01, two STRUGGLING attempts on 03-02 (exactly 28 days before today: outside the 28-day window), stalled.
  const c = await user({ verified: true })
  const pc = await puppy(c.id, '2026-03-01T08:00:00Z')
  const planC = await plan(pc.id, '2026-03-01T08:00:00Z', [{ position: 1, topic: 'COMMANDS' }], 1)
  await attempt(pc.id, planC.levels[0]!, '2026-03-02T08:00:00Z', 'STRUGGLING')
  await attempt(pc.id, planC.levels[0]!, '2026-03-02T09:00:00Z', 'STRUGGLING')
  await job(pc.id, c.id, 'FAILED', '2026-03-29T10:00:00Z', 'quota-calls')
  await job(pc.id, c.id, 'REJECTED', '2026-03-29T11:00:00Z', 'rejected')
  await job(pc.id, c.id, 'FAILED', '2026-03-29T12:00:00Z', 'something-new')

  // D: verified, puppy started but never onboarded.
  const d = await user({ verified: true })
  await puppy(d.id, null)

  // E: legacy unverified account WITH data: registered, and its job is an OWNER job (M6); excluded from M1 after "registered" and M2-M5 (G4).
  const e = await user({ verified: false })
  const pe = await puppy(e.id, '2026-03-10T08:00:00Z')
  const planE = await plan(pe.id, '2026-03-10T08:00:00Z', [{ position: 1, topic: 'ALONE' }], 1)
  await attempt(pe.id, planE.levels[0]!, '2026-03-28T08:00:00Z', 'STRUGGLING')
  await attempt(pe.id, planE.levels[0]!, '2026-03-28T09:00:00Z', 'STRUGGLING')
  await job(pe.id, e.id, 'FAILED', '2026-03-28T08:00:00Z', 'provider status 500')

  // F: unverified, nothing else.
  await user({ verified: false })

  // ADMIN with a full set of data: excluded everywhere.
  const g = await user({ verified: true, role: 'ADMIN' })
  const pg = await puppy(g.id, '2026-03-10T08:00:00Z')
  const planG = await plan(pg.id, '2026-03-10T08:00:00Z', [{ position: 1, topic: 'SLEEP' }, { position: 2, topic: 'SLEEP' }], 2)
  await attempt(pg.id, planG.levels[0]!, '2026-03-28T08:00:00Z', 'STRUGGLING')
  const gm = await attempt(pg.id, planG.levels[0]!, '2026-03-28T09:00:00Z', 'STRUGGLING')
  await mastery(planG.levels[0]!, gm.id, '2026-03-29T09:00:00Z')
  await job(pg.id, g.id, 'FAILED', '2026-03-29T08:00:00Z', 'provider status 503')

  // H: created after AS_OF.
  await user({ verified: true, createdAt: '2026-03-31T08:00:00Z' })

  return { a, b, c, d, e, g }
}

/** Removes an account with every row it owns (MasteryEvent and Attempt hold RESTRICT keys, as in account deletion). */
export async function removeAccount(userId: string) {
  await prisma.masteryEvent.deleteMany({ where: { level: { plan: { puppy: { ownerId: userId } } } } })
  await prisma.attempt.deleteMany({ where: { puppy: { ownerId: userId } } })
  await prisma.user.delete({ where: { id: userId } })
}

export const EXPECTED = {
  schemaVersion: 1,
  backfilled: 0,
  funnel: { registered: 6, verified: 4, onboarded: 3, firstPractice: 2, medianHoursToFirstPractice: 12.5 },
  activeDays: { cohort: 3, atLeast3In7: 1, zeroIn7: 2, median7: 0, median28: 0 },
  day7Return: { eligible: 2, returned: 1 },
  difficulty: { byPosition: [{ position: 1, owners: 2, topTopic: 'BITING' }], stalled: 1, stalledOf: 3 },
  mastery: { confirmations7: 0, confirmations28: 1, activeOwnerWeeks28: 3, medianDaysToMastery: 7, perActiveOwnerWeek: 0.33 },
  generation: {
    byStatus: { PENDING: 0, SUCCEEDED: 1, FAILED: 6, REJECTED: 1, STALE: 1 },
    failuresByClass: { provider: 2, deadline: 1, 'attempts-exhausted': 0, internal: 0, 'lease-expired': 0, other: 1 },
    quotaAccount: 1,
    quotaCalls: 1,
  },
} as const
