import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runHousekeeping } from '@/server/housekeeping/run'
import { PilotMetricsV1, computePilotMetrics, ilDayStartUtc } from '@/server/metrics'
import { resetDatabase } from './helpers'
import { AS_OF, CANARY, EXPECTED, TODAY, removeAccount, seedMetrics } from './ops-seed'

// Pilot metrics M1-M6 (Phase 4, slice 6; docs/DECISIONS.md P4-6) on a fixed seed with exact timestamps.
beforeEach(resetDatabase)

describe('pilot metrics on a fixed seed', () => {
  it('computes exact M1-M6 values, Israel-day boundaries around the DST change included', async () => {
    await seedMetrics()
    expect(await computePilotMetrics({ asOf: AS_OF, today: TODAY })).toEqual(EXPECTED)
  })

  it('the attempts at 21:30 and 22:30 UTC on 2026-03-26 fall on two Israel days', async () => {
    await seedMetrics()
    // Owner A has CURRENT attempts on Israel days 03-26 and 03-27 and a review on 03-29: three distinct days in the last 7.
    const metrics = await computePilotMetrics({ asOf: AS_OF, today: TODAY })
    expect(metrics.activeDays.atLeast3In7).toBe(1)
    // On 04-02, 03-26 and 03-27 have left the 7-day window (day > today - 7), so A drops below three days.
    const later = await computePilotMetrics({ asOf: new Date('2026-04-02T10:00:00Z'), today: '2026-04-02' })
    expect(later.activeDays.atLeast3In7).toBe(0)
  })

  it('excludes ADMIN accounts with all their data; a legacy unverified owner with data counts as registered and in M6 only', async () => {
    const { g, e } = await seedMetrics()
    const before = await computePilotMetrics({ asOf: AS_OF, today: TODAY })
    await removeAccount(g.id) // the ADMIN and everything it owns
    expect(await computePilotMetrics({ asOf: AS_OF, today: TODAY })).toEqual(before)

    await removeAccount(e.id) // the legacy unverified owner with a puppy, attempts and a failed provider job
    const withoutLegacy = await computePilotMetrics({ asOf: AS_OF, today: TODAY })
    expect(withoutLegacy).toEqual({
      ...before,
      funnel: { ...before.funnel, registered: before.funnel.registered - 1 },
      generation: {
        ...before.generation,
        byStatus: { ...before.generation.byStatus, FAILED: before.generation.byStatus.FAILED - 1 },
        failuresByClass: { ...before.generation.failuresByClass, provider: before.generation.failuresByClass.provider - 1 },
      },
    })
  })

  it('an owner deleted later disappears from live metrics but not from an earlier daily snapshot', async () => {
    const { a } = await seedMetrics()
    // The run of 2026-03-31 writes the snapshot of Israel day 2026-03-30 (and backfills the 7 days before it).
    const run = await runHousekeeping({ trigger: 'MANUAL', now: new Date('2026-03-31T10:00:00Z') })
    expect(run.outcome).toBe('ok')
    const row = await prisma.pilotMetricDay.findUniqueOrThrow({ where: { day: new Date('2026-03-30T00:00:00Z') } })
    const snapshot = PilotMetricsV1.parse(row.metricsJson)
    expect(snapshot).toEqual(await computePilotMetrics({ asOf: ilDayStartUtc('2026-03-31'), today: '2026-03-30' }))
    expect(snapshot.funnel.registered).toBe(6)

    await removeAccount(a.id)
    const live = await computePilotMetrics({ asOf: ilDayStartUtc('2026-03-31'), today: '2026-03-30' })
    expect(live.funnel.registered).toBe(5)
    const kept = await prisma.pilotMetricDay.findUniqueOrThrow({ where: { day: new Date('2026-03-30T00:00:00Z') } })
    expect(PilotMetricsV1.parse(kept.metricsJson)).toEqual(snapshot)
  })

  it('privacy: no seeded email, name, puppy name, profile, exercise, payload or idempotency text reaches the result or a snapshot', async () => {
    await seedMetrics()
    // The payload really is in the database (so the checks below mean something); housekeeping prunes it later (B3).
    expect(JSON.stringify(await prisma.generationJob.findMany({ select: { payloadJson: true } }))).toContain(CANARY.payload)
    const live = JSON.stringify(await computePilotMetrics({ asOf: AS_OF, today: TODAY }))
    await runHousekeeping({ trigger: 'MANUAL', now: new Date('2026-03-31T10:00:00Z') })
    const snapshots = await prisma.pilotMetricDay.findMany()
    expect(snapshots.length).toBe(8)
    const stored = JSON.stringify(snapshots.map((s) => s.metricsJson))
    const runs = JSON.stringify(await prisma.housekeepingRun.findMany())
    for (const value of Object.values(CANARY)) {
      expect(live).not.toContain(value)
      expect(stored).not.toContain(value)
      expect(runs).not.toContain(value)
    }
  })

  it('an empty database gives zero counts and null medians, never NaN', async () => {
    const metrics = await computePilotMetrics({ asOf: AS_OF, today: TODAY })
    expect(metrics.funnel).toEqual({ registered: 0, verified: 0, onboarded: 0, firstPractice: 0, medianHoursToFirstPractice: null })
    expect(metrics.mastery.perActiveOwnerWeek).toBeNull()
    expect(JSON.stringify(metrics)).not.toMatch(/NaN|Infinity/)
  })
})
