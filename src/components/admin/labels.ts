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
  'owner-read': 'נקרא במלואו בידי הבעלים',
}
