export type ErrorCode =
  | 'UNAUTHENTICATED'
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

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
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
}

/** Hebrew messages safe to show owners. Never include internals or other users' data. */
const MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'צריך להתחבר כדי להמשיך.',
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
