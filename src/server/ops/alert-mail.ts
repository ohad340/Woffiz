import { emailTransport, normalizeEmail, verifiedSender, type EmailTransport } from '../email/config'
import { renderOpsAlert, type OpsAlertInput } from '../email/ops-alert-template'
import { deliver } from '../email/transport'
import type { Env } from '../local-mode'

/** Same shape check as the authentication mail (email/config.ts keeps its regex private). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AlertChannel =
  | { kind: 'send'; to: string; transport: Exclude<EmailTransport, { kind: 'none' }> }
  | { kind: 'status'; status: 'NOT_CONFIGURED' | 'SKIPPED' }

/**
 * Where an alert email may go (docs/DECISIONS.md P4-6, O11), decided before anything is claimed:
 * - ALERT_EMAIL unset or not an address, or no transport: NOT_CONFIGURED (the page is the only channel);
 * - Resend on the shared sender, which delivers only to TESTER_EMAIL, and ALERT_EMAIL is another address: SKIPPED;
 * - otherwise send (verified sender: any address; local outbox: a file).
 */
export function alertChannel(env: Env = process.env): AlertChannel {
  const to = env.ALERT_EMAIL ? normalizeEmail(env.ALERT_EMAIL) : ''
  if (!EMAIL_SHAPE.test(to)) return { kind: 'status', status: 'NOT_CONFIGURED' }
  const transport = emailTransport(env)
  if (transport.kind === 'none') return { kind: 'status', status: 'NOT_CONFIGURED' }
  if (transport.kind === 'resend' && !verifiedSender(env) && to !== transport.tester) {
    console.warn('[ops] alert mail skipped: shared sender delivers only to TESTER_EMAIL')
    return { kind: 'status', status: 'SKIPPED' }
  }
  return { kind: 'send', to, transport }
}

export function alertEnvironment(env: Env = process.env): OpsAlertInput['environment'] {
  const value = env.VERCEL_ENV
  return value === 'production' || value === 'preview' || value === 'development' ? value : 'local'
}

/** Link to the admin page, built from BETTER_AUTH_URL (never from a request). */
export function metricsLink(env: Env = process.env): string {
  return new URL('/admin/metrics', env.BETTER_AUTH_URL || 'http://localhost:3000').toString()
}

/** Sends one alert email through the existing delivery (10 s timeout). Throws EmailDeliveryError on failure. */
export async function sendOpsAlert(channel: Extract<AlertChannel, { kind: 'send' }>, input: Omit<OpsAlertInput, 'environment' | 'link'>): Promise<void> {
  const link = metricsLink()
  await deliver({ kind: 'ops-alert', to: channel.to, url: link, ...renderOpsAlert({ ...input, environment: alertEnvironment(), link }) }, channel.transport)
}
