export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'FORBIDDEN_ORIGIN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'LEVEL_LOCKED'
  | 'LEVEL_NOT_CURRENT'
  | 'STALE_PLAN'
  | 'ATTEMPT_INVALID'
  | 'IDEMPOTENCY_MISMATCH'
  | 'IDEMPOTENCY_REQUIRED'
  | 'ONBOARDING_INCOMPLETE'
  | 'ONBOARDING_DONE'
  | 'GENERATION_PENDING'
  | 'AI_UNAVAILABLE'
  | 'AI_QUOTA_EXCEEDED'
  | 'GENERATION_FAILED'
  | 'ADAPT_NOT_NEEDED'
  | 'REVISE_NOT_NEEDED'
  | 'MEDIA_CONFLICT'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  FORBIDDEN_ORIGIN: 403,
  VALIDATION: 400,
  NOT_FOUND: 404,
  LEVEL_LOCKED: 409,
  LEVEL_NOT_CURRENT: 409,
  STALE_PLAN: 409,
  ATTEMPT_INVALID: 409,
  IDEMPOTENCY_MISMATCH: 422,
  IDEMPOTENCY_REQUIRED: 400,
  ONBOARDING_INCOMPLETE: 409,
  ONBOARDING_DONE: 409,
  GENERATION_PENDING: 409,
  AI_UNAVAILABLE: 503,
  AI_QUOTA_EXCEEDED: 429,
  GENERATION_FAILED: 502,
  ADAPT_NOT_NEEDED: 409,
  REVISE_NOT_NEEDED: 409,
  MEDIA_CONFLICT: 409,
}

/** Hebrew messages safe to show owners. Never include internals or other users' data. */
const MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'צריך להתחבר כדי להמשיך.',
  EMAIL_NOT_VERIFIED: 'צריך לאמת את כתובת האימייל לפני שממשיכים.',
  FORBIDDEN_ORIGIN: 'הבקשה נדחתה.',
  VALIDATION: 'הנתונים שנשלחו אינם תקינים.',
  NOT_FOUND: 'לא מצאנו את מה שחיפשתם.',
  LEVEL_LOCKED: 'השלב הזה עוד נעול. השלימו את השלב הקודם כדי לפתוח.',
  LEVEL_NOT_CURRENT: 'השלב הזה כבר לא השלב הנוכחי. רעננו את המסך.',
  STALE_PLAN: 'המסלול התעדכן. רעננו את המסך ונסו שוב.',
  ATTEMPT_INVALID: 'אי אפשר לאשר שליטה על סמך התרגול הזה. דווחו על תרגול חדש.',
  IDEMPOTENCY_MISMATCH: 'אותו מפתח שימש לבקשה אחרת. נסו שוב.',
  IDEMPOTENCY_REQUIRED: 'חסר מפתח לבקשה.',
  ONBOARDING_INCOMPLETE: 'חסרות תשובות בשאלון.',
  ONBOARDING_DONE: 'השאלון כבר הושלם.',
  GENERATION_PENDING: 'אנחנו עדיין מכינים את התוכנית. המתינו רגע.',
  AI_UNAVAILABLE: 'ההתאמה האישית לא זמינה כרגע. מה ששמרתם נשאר כפי שהוא. נסו שוב בעוד זמן מה.',
  AI_QUOTA_EXCEEDED: 'הגעתם למגבלת ההתאמות להיום. נסו שוב מחר. מה שכבר נשמר לא ישתנה.',
  GENERATION_FAILED: 'לא הצלחנו להכין את התוכנית הפעם. מה ששמרתם נשאר כפי שהוא. נסו שוב.',
  ADAPT_NOT_NEEDED: 'אפשר להתאים את התרגיל אחרי כמה ניסיונות שלא יצאו בעצמאות.',
  REVISE_NOT_NEEDED: 'אין שלבים עתידיים לעדכן.',
  MEDIA_CONFLICT: 'הפעולה אינה אפשרית במצב הנוכחי של הסרטון או של הטכניקה.',
}

export class AppError extends Error {
  readonly status: number
  constructor(
    readonly code: ErrorCode,
    detail?: string,
  ) {
    super(detail ?? code)
    this.status = STATUS[code]
  }
  get hebrew() {
    return MESSAGE[this.code]
  }
}
