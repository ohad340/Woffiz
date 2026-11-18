// Calendar days in Asia/Jerusalem (docs/DECISIONS.md P4-6). The SQL computes the same days with AT TIME ZONE.

export const IL_TZ = 'Asia/Jerusalem'

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: IL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: IL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** The Israel calendar day of an instant, as 'YYYY-MM-DD'. */
export function ilDay(date: Date): string {
  return dayFormat.format(date)
}

/** 'YYYY-MM-DD' plus n calendar days (n may be negative). Pure date arithmetic, no time zone involved. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

/**
 * The instant of Israel midnight that starts the given day. Israel's clock changes happen at 02:00, so midnight always
 * exists exactly once; the offset is +02:00 or +03:00.
 */
export function ilDayStartUtc(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  for (const offsetHours of [2, 3]) {
    const candidate = new Date(Date.UTC(y!, m! - 1, d!, -offsetHours))
    if (ilDay(candidate) === day && clockFormat.format(candidate) === '00:00') return candidate
  }
  throw new Error(`No Israel midnight found for ${day}`)
}
