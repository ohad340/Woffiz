import { NextResponse } from 'next/server'
import { authorizeCron } from '@/server/housekeeping/authorize'
import { runHousekeeping } from '@/server/housekeeping/run'

// Daily housekeeping (docs/DECISIONS.md P4-6). Vercel Cron calls it with `Authorization: Bearer <CRON_SECRET>`
// (vercel.json, production only). Never cached; the run is bounded well below this duration.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  // Fails closed: without CRON_SECRET, or with any other header, nothing runs and nothing is recorded.
  if (!authorizeCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers })
  }
  const trigger = request.headers.get('user-agent') === 'vercel-cron/1.0' ? 'CRON' : 'MANUAL'
  const result = await runHousekeeping({ trigger })
  if (result.outcome === 'already-running') return NextResponse.json({ outcome: 'already-running' }, { status: 409, headers })
  return NextResponse.json(
    { outcome: result.outcome, steps: result.steps.map(({ step, status, count }) => ({ step, status, count })) },
    { headers },
  )
}
