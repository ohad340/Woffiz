import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { EmailTransport } from './config'
import type { AuthEmailKind } from './templates'

export type OutgoingEmail = { kind: AuthEmailKind; to: string; subject: string; html: string; text: string; url: string }

/** A delivery failure. Its message never contains the recipient, the link or a key: it may be logged. */
export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

async function sendWithResend(message: OutgoingEmail, transport: Extract<EmailTransport, { kind: 'resend' }>) {
  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${transport.apiKey}`,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ from: transport.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new EmailDeliveryError(`Resend request failed (${error instanceof Error ? error.name : 'unknown'})`)
  }
  if (!response.ok) {
    // Only the status and Resend's error name: the body can echo the recipient.
    const name = await response
      .json()
      .then((body: { name?: unknown }) => (typeof body?.name === 'string' ? body.name : ''))
      .catch(() => '')
    throw new EmailDeliveryError(`Resend rejected the message (${response.status}${name ? ` ${name}` : ''})`)
  }
}

/** Local machines only (see config.ts). One JSON file per message; tests read the link from it. */
async function writeToOutbox(message: OutgoingEmail, dir: string) {
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify({ ...message, sentAt: new Date().toISOString() }))
  } catch {
    throw new EmailDeliveryError('Could not write to the local email outbox')
  }
}

export async function deliver(message: OutgoingEmail, transport: EmailTransport): Promise<void> {
  if (transport.kind === 'resend') return sendWithResend(message, transport)
  if (transport.kind === 'outbox') return writeToOutbox(message, transport.dir)
  throw new EmailDeliveryError('Email delivery is not configured')
}
