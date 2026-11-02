import type { OutgoingEmail } from '@/server/email/transport'

export const BASE = 'http://localhost:3000'

/** Messages "sent" in this test file. Filled by the mocked transport (see vi.mock in each file). */
export type Sent = OutgoingEmail[]

export function lastLink(sent: Sent, kind: OutgoingEmail['kind'], to: string) {
  const message = sent.filter((m) => m.kind === kind && m.to === to.toLowerCase()).at(-1)
  if (!message) throw new Error(`No ${kind} email for ${to}`)
  return message.url
}

export const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => c && !c.endsWith('='))
    .join('; ')

export function jsonPost(path: string, body: unknown, extra: Record<string, string> = {}) {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE, ...extra },
    body: JSON.stringify(body),
  })
}
