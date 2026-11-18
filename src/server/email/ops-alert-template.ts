import { APP_NAME } from '@/lib/app'

/** The only input an alert email can carry (docs/DECISIONS.md P4-6, O11): codes, counts, times and the admin link. */
export type OpsAlertInput = {
  rule: 'server-errors' | 'auth-email' | 'generation-failures' | 'ai-budget-warning' | 'ai-budget-exhausted' | 'housekeeping'
  count: number
  windowMinutes: number | null
  threshold: number
  firstEventAt: Date
  lastEventAt: Date
  environment: 'production' | 'preview' | 'development' | 'local'
  link: string
}

const RULE_TEXT: Record<OpsAlertInput['rule'], string> = {
  'server-errors': 'שגיאות שרת',
  'auth-email': 'כשלי שליחת מייל אימות או איפוס',
  'generation-failures': 'כשלי יצירת תוכניות',
  'ai-budget-warning': 'תקציב קריאות הבינה המלאכותית היומי קרוב למיצוי',
  'ai-budget-exhausted': 'תקציב קריאות הבינה המלאכותית היומי מוצה',
  housekeeping: 'שלב בהרצת הניקוי היומית נכשל',
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const timeFormat = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
const count = (n: number) => (Number.isFinite(n) ? String(Math.max(0, Math.trunc(n))) : '0')

/** Hebrew RTL alert email in the style of renderAuthEmail. Pure; every value is escaped. Times in Asia/Jerusalem. */
export function renderOpsAlert(input: OpsAlertInput) {
  const subject = `${APP_NAME}: התראה תפעולית (${input.rule})`
  const window =
    input.windowMinutes !== null
      ? `ב-${count(input.windowMinutes)} הדקות האחרונות`
      : input.rule === 'housekeeping'
        ? 'בהרצה האחרונה'
        : 'היום (יום UTC)'
  const lines = [
    `כלל: ${RULE_TEXT[input.rule]} (${input.rule})`,
    `מספר אירועים: ${count(input.count)} ${window} (סף: ${count(input.threshold)})`,
    `אירוע ראשון: ${timeFormat.format(input.firstEventAt)}`,
    `אירוע אחרון: ${timeFormat.format(input.lastEventAt)}`,
    `סביבה: ${input.environment}`,
  ]
  const href = escapeHtml(input.link)
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#e4f4fe;font-family:Heebo,Arial,sans-serif;color:#1d2b3a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4f4fe;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;background:#ffffff;border-radius:24px;padding:24px;text-align:right;">
        <tr><td style="font-size:14px;font-weight:700;color:#1f6fd1;padding-bottom:8px;">${APP_NAME}</td></tr>
        <tr><td style="font-size:22px;font-weight:700;line-height:1.4;padding-bottom:12px;">התראה תפעולית</td></tr>
${lines.map((line) => `        <tr><td style="font-size:16px;line-height:1.6;padding-bottom:4px;">${escapeHtml(line)}</td></tr>`).join('\n')}
        <tr><td style="padding:20px 0 12px;">
          <a href="${href}" style="display:inline-block;background:#ffc22e;color:#3d2600;font-size:17px;font-weight:800;text-decoration:none;padding:14px 24px;border-radius:16px;border-bottom:4px solid #e08a00;">לדף מדדי הפיילוט</a>
        </td></tr>
        <tr><td dir="ltr" style="font-size:13px;line-height:1.5;color:#1f6fd1;word-break:break-all;text-align:left;padding-bottom:16px;">${href}</td></tr>
        <tr><td style="font-size:14px;line-height:1.5;color:#4e5d6c;">ההודעה לא כוללת פרטים אישיים. הפרטים המצטברים נמצאים בדף הניהול.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  const text = `התראה תפעולית\n\n${lines.join('\n')}\n\nלדף מדדי הפיילוט:\n${input.link}`
  return { subject, html, text }
}
