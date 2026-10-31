import { NextResponse } from 'next/server'
import { devInboxEnabled, latestDevMessage } from '@/server/dev-inbox'

/** Local development only. Answers 404 anywhere the dev inbox is not explicitly enabled. */
export function GET(request: Request) {
  if (!devInboxEnabled()) return new NextResponse(null, { status: 404 })
  const email = new URL(request.url).searchParams.get('email')?.trim()
  if (!email) return NextResponse.json({ error: 'VALIDATION' }, { status: 400 })
  const message = latestDevMessage(email)
  if (!message) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ url: message.url, notice: 'מצב פיתוח — לא נשלח מייל' }, { headers: { 'Cache-Control': 'no-store' } })
}
