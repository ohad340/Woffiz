import { Prisma } from '@/generated/prisma/client'

/**
 * A JS instant as the naive UTC timestamp every Prisma DateTime column holds (TIMESTAMP(3) without time zone), so it can be
 * compared with or written into a column directly. The ISO string carries its zone; AT TIME ZONE 'UTC' drops it.
 */
export const utcTs = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`

/** The UTC calendar day of an instant, 'YYYY-MM-DD' (the AI budget counters and the alert mail cap use UTC days). */
export const utcDay = (date: Date) => date.toISOString().slice(0, 10)

export const MINUTE_MS = 60_000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

export const minus = (date: Date, ms: number) => new Date(date.getTime() - ms)
