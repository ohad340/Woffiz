import { APP_NAME } from '@/lib/app'

export type AuthEmailKind = 'verify-email' | 'reset-password'

/** Verification and reset links stay valid for one hour (the copy below says so). */
export const AUTH_LINK_TTL_SECONDS = 60 * 60

type Copy = { subject: string; heading: string; body: string; action: string; footer: string }

const COPY: Record<AuthEmailKind, Copy> = {
  'verify-email': {
    subject: `אימות כתובת האימייל ב-${APP_NAME}`,
    heading: 'עוד צעד קטן ומתחילים',
    body: 'כדי להתחיל לאמן את הגור, אשרו שזו כתובת האימייל שלכם.',
    action: 'אימות כתובת האימייל',
    footer: `הקישור תקף לשעה. אם לא נרשמתם ל-${APP_NAME}, אפשר להתעלם מההודעה.`,
  },
  'reset-password': {
    subject: `איפוס הסיסמה ב-${APP_NAME}`,
    heading: 'בחירת סיסמה חדשה',
    body: 'קיבלנו בקשה לאיפוס הסיסמה של החשבון שלכם.',
    action: 'בחירת סיסמה חדשה',
    footer: 'הקישור תקף לשעה ולשימוש אחד. אם לא ביקשתם איפוס, אפשר להתעלם מההודעה. הסיסמה לא תשתנה.',
  },
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Hebrew RTL email. Colors and radius mirror src/styles/tokens.css (email clients cannot read CSS variables). */
export function renderAuthEmail(kind: AuthEmailKind, url: string) {
  const copy = COPY[kind]
  const href = escapeHtml(url)
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#e4f4fe;font-family:Heebo,Arial,sans-serif;color:#1d2b3a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4f4fe;padding:24px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:560px;background:#ffffff;border-radius:24px;padding:24px;text-align:right;">
        <tr><td style="font-size:14px;font-weight:700;color:#1f6fd1;padding-bottom:8px;">${APP_NAME}</td></tr>
        <tr><td style="font-size:22px;font-weight:700;line-height:1.4;padding-bottom:12px;">${escapeHtml(copy.heading)}</td></tr>
        <tr><td style="font-size:16px;line-height:1.6;padding-bottom:24px;">${escapeHtml(copy.body)}</td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${href}" style="display:inline-block;background:#ffc22e;color:#3d2600;font-size:17px;font-weight:800;text-decoration:none;padding:14px 24px;border-radius:16px;border-bottom:4px solid #e08a00;">${escapeHtml(copy.action)}</a>
        </td></tr>
        <tr><td style="font-size:14px;line-height:1.5;color:#4e5d6c;padding-bottom:12px;">אם הכפתור לא עובד, העתיקו את הקישור לדפדפן:</td></tr>
        <tr><td dir="ltr" style="font-size:13px;line-height:1.5;color:#1f6fd1;word-break:break-all;text-align:left;padding-bottom:24px;">${href}</td></tr>
        <tr><td style="font-size:14px;line-height:1.5;color:#4e5d6c;">${escapeHtml(copy.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  const text = `${copy.heading}\n\n${copy.body}\n\n${copy.action}:\n${url}\n\n${copy.footer}`
  return { subject: copy.subject, html, text }
}
