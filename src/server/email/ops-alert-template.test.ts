import { describe, expect, it } from 'vitest'
import { renderOpsAlert, type OpsAlertInput } from './ops-alert-template'

const input = (overrides: Partial<OpsAlertInput> = {}): OpsAlertInput => ({
  rule: 'generation-failures',
  count: 3,
  windowMinutes: 60,
  threshold: 3,
  firstEventAt: new Date('2026-11-17T08:05:00Z'),
  lastEventAt: new Date('2026-11-17T08:40:00Z'),
  environment: 'local',
  link: 'http://localhost:3100/admin/metrics',
  ...overrides,
})

describe('alert email template', () => {
  it('carries the rule code, counts, Israel times, environment and link, in Hebrew RTL', () => {
    const { subject, html, text } = renderOpsAlert(input())
    expect(subject).toBe('Woffiz: התראה תפעולית (generation-failures)')
    expect(html).toContain('lang="he" dir="rtl"')
    for (const part of [html, text]) {
      expect(part).toContain('generation-failures')
      expect(part).toContain('3 ב-60 הדקות האחרונות (סף: 3)')
      expect(part).toContain('10:05') // 08:05Z is 10:05 in Israel (winter)
      expect(part).toContain('10:40')
      expect(part).toContain('סביבה: local')
      expect(part).toContain('http://localhost:3100/admin/metrics')
    }
  })

  it('contains nothing but its fixed copy and the given values (no address, id or message can reach it)', () => {
    const { html, text } = renderOpsAlert(input({ rule: 'server-errors', count: 4, environment: 'production', link: 'https://app.example.test/admin/metrics' }))
    const stripped = text
      .replace('https://app.example.test/admin/metrics', '')
      .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, '')
      .replace(/\d{1,2}:\d{2}/g, '')
    expect(stripped).not.toMatch(/@|[a-f0-9]{8}-[a-f0-9]{4}/i)
    expect(html).not.toMatch(/@/)
  })

  it('escapes hostile values in the allowed fields', () => {
    const { html } = renderOpsAlert(input({ link: 'https://<script>alert(1)</script>.example.test/"x' }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;x')
  })

  it('describes the window of budget and housekeeping alerts', () => {
    expect(renderOpsAlert(input({ rule: 'ai-budget-warning', windowMinutes: null, count: 80, threshold: 80 })).text).toContain('80 היום (יום UTC) (סף: 80)')
    expect(renderOpsAlert(input({ rule: 'housekeeping', windowMinutes: null, count: 1, threshold: 1 })).text).toContain('1 בהרצה האחרונה (סף: 1)')
  })
})
