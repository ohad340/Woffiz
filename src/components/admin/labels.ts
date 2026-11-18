// Hebrew labels of the admin media workflow. The ids are the stable checklist item ids of src/server/media/gates.ts.

export const CHECKLIST_LABELS: Record<string, string> = {
  'watched-and-listened-in-full': 'צפיתי בקליפ כולו והאזנתי לקול, מהתחלה ועד הסוף',
  'plays-on-reference-devices': 'הקליפ מתנגן במכשירי הייחוס',
  'poster-is-a-real-frame': 'תמונת הפוסטר היא פריים אמיתי מהקליפ',
  'hebrew-voice-intelligible': 'הקול בעברית ברור ומובן',
  'loudness-acceptable': 'עוצמת הקול נוחה ואחידה',
  'voice-matches-action-timing': 'הקול מסונכרן עם הפעולה על המסך',
  'captions-in-sync': 'הכתוביות מסונכרנות עם הקול',
  'no-visual-artifacts': 'אין עיוותים בתמונה (גפיים מיותרות, תנועה בלתי אפשרית)',
  'subjects-fully-in-frame': 'הגור והמדגים נראים במלואם בפריים',
  'steps-match-rendered-instructions-in-order': 'הצעדים המודגמים תואמים להוראות הכתובות ובאותו סדר',
  'speech-cues-audible-at-right-moment': 'השם והשבח נשמעים ברגע הנכון',
  'no-aversive-or-hazardous-handling': 'אין טיפול מכאיב, מפחיד או מסוכן',
  'no-signs-of-fear-in-puppy': 'אין סימני פחד אצל הגור',
  'sources-reread-and-support-the-steps': 'קראתי שוב את המקורות והם תומכים בכל צעד',
  'demonstrated-parameters-match-catalog': 'הערכים המודגמים תואמים לקטלוג',
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'טיוטה',
  REVIEWED: 'נסקר',
  PUBLISHED: 'פורסם',
  WITHDRAWN: 'הוסר',
}

export const REASON_LABELS: Record<string, string> = {
  SUPERSEDED: 'הוחלף בגרסה חדשה',
  TECHNICAL: 'תקלה טכנית',
  SAFETY: 'בטיחות',
}

export const KIND_LABELS: Record<string, string> = {
  TECHNICAL: 'סקירה טכנית',
  CONTENT: 'סקירת תוכן',
}

export const DECISION_LABELS: Record<string, string> = {
  APPROVED: 'אושר',
  CHANGES_REQUESTED: 'התבקשו שינויים',
}

export const BASIS_LABELS: Record<string, string> = {
  source: 'נתמך במקור',
  'product-default': 'ברירת מחדל של המוצר (לא אושרה)',
}

/** The label never overstates what was checked. */
export const VERIFICATION_LABELS: Record<string, string> = {
  'fetched-summary': 'נבדק דרך סיכום של הדף שנשלף בכלי. זו לא קריאה מלאה של המקור.',
  'extracted-text': 'הטקסט המלא של המקור חולץ בכלי ונקרא במלואו בידי העוזר, לא בידי הבעלים. הבעלים עדיין לא קרא אותו.',
  'owner-read': 'נקרא במלואו בידי הבעלים',
}

// ----- Pilot metrics page (slice 4.6; docs/DECISIONS.md P4-6). Keys are the stored codes. -----

export const RULE_LABELS: Record<string, string> = {
  'server-errors': 'שגיאות שרת',
  'auth-email': 'כשלי שליחת מייל אימות או איפוס',
  'generation-failures': 'כשלי יצירת תוכניות',
  'ai-budget-warning': 'תקציב הבינה המלאכותית היומי קרוב למיצוי',
  'ai-budget-exhausted': 'תקציב הבינה המלאכותית היומי מוצה',
  housekeeping: 'שלב בניקוי היומי נכשל',
}

export const NOTIFY_LABELS: Record<string, string> = {
  SENT: 'נשלחה',
  FAILED: 'השליחה נכשלה, תנוסה שוב',
  GAVE_UP: 'השליחה נכשלה שלוש פעמים',
  SUPPRESSED: 'לא נשלחה: המכסה היומית מוצתה',
  SKIPPED: 'לא נשלחה: השולח המשותף שולח רק לכתובת הבודק',
  NOT_CONFIGURED: 'לא הוגדרה כתובת להתראות',
  PENDING: 'בשליחה',
}

export const STEP_LABELS: Record<string, string> = {
  'job-payloads': 'מחיקת תוכן של משימות יצירה (אחרי 30 יום)',
  'ai-usage': 'מוני השימוש בבינה המלאכותית (7 ימים)',
  'rate-limits': 'מוני הגבלת המיילים (24 שעות)',
  'ops-events': 'אירועים תפעוליים (30 יום)',
  'ops-alerts': 'התראות שנסגרו (90 יום)',
  'housekeeping-runs': 'רישומי הרצות ניקוי (90 יום)',
  'metric-days': 'תמונות יומיות (365 יום)',
  'never-verified': 'חשבונות שלא אומתו (14 יום)',
  snapshots: 'כתיבת תמונות יומיות',
  alerts: 'בדיקת התראות',
}

export const STEP_STATUS_LABELS: Record<string, string> = { ok: 'הצליח', failed: 'נכשל', skipped: 'דולג' }

export const RUN_OUTCOME_LABELS: Record<string, string> = { ok: 'הצליחה', partial: 'הצליחה חלקית', running: 'רצה עכשיו', abandoned: 'ננטשה' }

export const TRIGGER_LABELS: Record<string, string> = { CRON: 'מתוזמנת', MANUAL: 'ידנית' }

export const GENERATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתינה',
  SUCCEEDED: 'הצליחה',
  FAILED: 'נכשלה',
  REJECTED: 'נדחתה בבדיקת התוכן',
  STALE: 'התיישנה',
}

export const FAILURE_CLASS_LABELS: Record<string, string> = {
  provider: 'תקלה אצל ספק הבינה המלאכותית',
  deadline: 'חריגה מהזמן המוקצב',
  'attempts-exhausted': 'מוצו הניסיונות',
  internal: 'שגיאה פנימית',
  'lease-expired': 'העבודה ננטשה באמצע',
  other: 'אחר',
}
