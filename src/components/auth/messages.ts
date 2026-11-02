import { MIN_PASSWORD } from '@/lib/auth-paths'

/** Better Auth and email-guard error codes to Hebrew. Anything unknown gets a generic, non-revealing message. */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'האימייל או הסיסמה לא נכונים.',
  USER_ALREADY_EXISTS: 'כבר קיים חשבון עם האימייל הזה. אפשר להיכנס אליו.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'כבר קיים חשבון עם האימייל הזה. אפשר להיכנס אליו.',
  PASSWORD_TOO_SHORT: `הסיסמה קצרה מדי. צריך לפחות ${MIN_PASSWORD} תווים.`,
  PASSWORD_TOO_LONG: 'הסיסמה ארוכה מדי.',
  EMAIL_PASSWORD_SIGN_UP_DISABLED: 'ההרשמה עדיין לא פתוחה בסביבה הזו.',
  EMAIL_AND_PASSWORD_SIGN_UP_DISABLED: 'ההרשמה עדיין לא פתוחה בסביבה הזו.',
  SIGN_UP_RESTRICTED: 'בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות.',
  EMAIL_NOT_VERIFIED: 'צריך לאמת את כתובת האימייל לפני הכניסה. חפשו את הקישור בתיבת הדואר.',
  EMAIL_RATE_LIMITED: 'ביקשתם כמה מיילים ברצף. נסו שוב בעוד רבע שעה.',
  INVALID_TOKEN: 'הקישור לא תקף, פג תוקפו או שכבר השתמשו בו. בקשו קישור חדש.',
}

export const NETWORK_ERROR = 'אין חיבור. בדקו את החיבור ונסו שוב.'

export async function readErrorCode(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { code?: unknown } | null
  return typeof data?.code === 'string' ? data.code : ''
}

export function authErrorMessage(status: number, code: string, fallback: string): string {
  if (MESSAGES[code]) return MESSAGES[code]
  if (status === 429) return 'יותר מדי ניסיונות. נסו שוב בעוד דקה.'
  return fallback
}

/** The address the owner just typed, kept in this tab only so the next screen can offer it (never in a URL). */
const EMAIL_KEY = 'woffiz:auth-email'

export function rememberEmail(email: string) {
  try {
    sessionStorage.setItem(EMAIL_KEY, email)
  } catch {
    // Storage blocked: the next screen simply asks again.
  }
}

export function recalledEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

export const looksLikeEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim())
