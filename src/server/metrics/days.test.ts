import { describe, expect, it } from 'vitest'
import { addDays, ilDay, ilDayStartUtc } from './days'

describe('Israel calendar days', () => {
  it('assigns an instant to its Israel day around midnight (winter, UTC+2)', () => {
    expect(ilDay(new Date('2026-01-10T21:59:59Z'))).toBe('2026-01-10')
    expect(ilDay(new Date('2026-01-10T22:00:00Z'))).toBe('2026-01-11')
  })

  it('crosses the DST start (2026-03-27) the same way the SQL does', () => {
    expect(ilDay(new Date('2026-03-26T21:30:00Z'))).toBe('2026-03-26')
    expect(ilDay(new Date('2026-03-26T23:30:00Z'))).toBe('2026-03-27')
    expect(ilDayStartUtc('2026-03-27').toISOString()).toBe('2026-03-26T22:00:00.000Z') // still UTC+2 at midnight
    expect(ilDayStartUtc('2026-03-28').toISOString()).toBe('2026-03-27T21:00:00.000Z') // summer time, UTC+3
  })

  it('crosses the DST end (2026-10-25) the same way the SQL does', () => {
    expect(ilDay(new Date('2026-10-24T20:59:00Z'))).toBe('2026-10-24')
    expect(ilDay(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-25')
    expect(ilDayStartUtc('2026-10-25').toISOString()).toBe('2026-10-24T21:00:00.000Z') // still UTC+3 at midnight
    expect(ilDayStartUtc('2026-10-26').toISOString()).toBe('2026-10-25T22:00:00.000Z') // winter time, UTC+2
  })

  it('every day start maps back to that day, and one millisecond earlier to the previous day', () => {
    for (let day = '2026-01-01'; day < '2027-01-01'; day = addDays(day, 1)) {
      const start = ilDayStartUtc(day)
      expect(ilDay(start)).toBe(day)
      expect(ilDay(new Date(start.getTime() - 1))).toBe(addDays(day, -1))
    }
  })

  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})
