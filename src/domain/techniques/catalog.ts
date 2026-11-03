import { fingerprintTechnique } from './fingerprint'
import type { TechniqueDefinition, TechniqueParam } from './types'

/**
 * Technique catalog. Both definitions are DRAFT: their product-default boundaries (marked
 * basis: 'product-default') and the verification of their sources need the owner's explicit approval before
 * any clip can be published against them. Released (approved) definitions are frozen in techniques.lock.json.
 */

const STOP = 'אם הגור נראה כואב, מבוהל מאוד או אגרסיבי, עוצרים את התרגיל ופונים לווטרינר או למאלף מוסמך.'

/** Media-neutral parameter: the clip shows `demonstrated`, every value in min..max is the same method. */
function neutral(id: string, label: string, unit: string, min: number, max: number, def: number, demonstrated: number, note: string): TechniqueParam {
  return { id, label, unit, min, max, default: def, demonstrated, compatibleMin: min, compatibleMax: max, basis: 'product-default', basisNote: note }
}

const ROUNDS_NOTE = 'The clip shows one round; repeating the same method more times does not change it (media-neutral).'
const SESSIONS_NOTE = 'Mastery-criterion wording only; not shown in the clip (media-neutral).'

export const MOUTHING_REDIRECT_TOY: TechniqueDefinition = {
  key: 'mouthing-redirect-toy',
  version: 1,
  topic: 'BITING',
  description: 'Puppy mouths hands or clothes: stay still, offer a suitable toy, praise chewing the toy.',
  audience: {
    allowedAges: ['under-10w', '10-16w', '4-6m', 'over-6m', 'unsure'],
    basis: 'product-default',
    basisNote: 'The source speaks about puppies in general and gives no age limit; all bands allowed pending owner approval.',
  },
  variants: {
    STANDARD: {
      title: 'מפנים נשיכות לצעצוע',
      goal: 'כשהגור נוגס ביד, הוא עובר ללעוס צעצוע.',
      estimatedMinutes: 5,
      preparation: ['צעצוע רך או חפץ לעיסה מתאים לגור', 'עוד צעצוע בהישג יד', 'בגד עם שרוול ארוך ועבה עוזר להישאר רגועים'],
      // No waiting time in seconds: the sources tie the toy to the puppy's pause or release, not to a clock.
      steps: [
        { id: 'stay-still', text: 'כשהגור נוגס ביד או בשרוול, לא מושכים ולא מזיזים את היד. משאירים אותה רפויה ושקטה.' },
        { id: 'offer-toy', text: 'ברגע שהגור עוצר לרגע או משחרר, מקרבים לפה שלו צעצוע מתאים.' },
        { id: 'praise-chewing', text: 'כשהגור לועס את הצעצוע, משבחים אותו בקול רגוע.', speechCue: 'praise' },
      ],
      params: [
        neutral('rounds', 'Repetitions per practice session', 'rounds', 1, 6, 3, 1, ROUNDS_NOTE),
        neutral('sessionsInRow', 'Consecutive sessions for the mastery criterion', 'sessions', 2, 5, 3, 3, SESSIONS_NOTE),
      ],
      successCriterion: 'ב-{sessionsInRow} מפגשי תרגול רצופים, כשהגור נוגס והיד נשארת שקטה, הוא לוקח את הצעצוע שמוצע לו ולועס אותו.',
      tips: [
        { id: 'rotate-toys', text: 'מחזיקים כמה צעצועים בבית ומחליפים אותם כל כמה ימים, כדי שיישארו מעניינים.' },
        { id: 'enough-sleep', text: 'גור עייף נוגס יותר, לכן דואגים שיישן מספיק.' },
      ],
    },
    EASIER: {
      title: 'מציעים צעצוע מוקדם',
      goal: 'הגור מקבל צעצוע לפני שהוא מתחיל לנגוס.',
      estimatedMinutes: 3,
      preparation: ['צעצוע רך או חפץ לעיסה מתאים לגור'],
      steps: [
        { id: 'offer-toy-early', text: 'כשהגור מתחיל להתרגש לקראת משחק, מציעים לו צעצוע לפני שהוא נוגס.' },
        { id: 'praise-chewing', text: 'כשהגור לועס את הצעצוע, משבחים אותו בקול רך.', speechCue: 'praise' },
      ],
      params: [
        neutral('rounds', 'Repetitions per practice session', 'rounds', 1, 6, 3, 1, ROUNDS_NOTE),
        neutral('sessionsInRow', 'Consecutive sessions for the mastery criterion', 'sessions', 2, 5, 3, 3, SESSIONS_NOTE),
      ],
      successCriterion: 'ב-{sessionsInRow} מפגשי תרגול רצופים, הגור לועס את הצעצוע שהוצע לו לפני שהתחיל לנגוס.',
      tips: [{ id: 'rotate-toys', text: 'מחזיקים כמה צעצועים בבית ומחליפים אותם כל כמה ימים, כדי שיישארו מעניינים.' }],
    },
  },
  fallbackEasier: {
    title: 'עוד יותר פשוט',
    steps: ['מחזיקים צעצוע ביד אחת כל זמן המשחק.', 'משבחים כל רגע שבו הגור לועס אותו.'],
  },
  forbiddenBehaviour: [
    'pulling the hand or clothing away quickly',
    'punishment, raised voice, pushing the puppy down',
    'rough play or using hands or feet as toys',
    'smiling or laughing at the mouthing',
    'ignoring a toy the puppy brings',
  ],
  stopConditions: [STOP, 'אם הנשיכות חזקות או שהגור לא נרגע, קמים ומתרחקים לרגע, וחוזרים אליו בשקט עם צעצוע.'],
  review: { status: 'draft' },
  sources: [
    {
      url: 'https://www.dogstrust.org.uk/dog-advice/unwanted-behaviours/stop-your-dog-chewing-mouthing',
      publisher: 'Dogs Trust',
      title: 'Mouthing, nipping and puppy biting',
      verifiedOn: '2026-11-03',
      verification: 'extracted-text',
      supports: ['stay-still', 'offer-toy', 'offer-toy-early', 'praise-chewing', 'rotate-toys', 'enough-sleep', 'forbidden', 'stop'],
      summary:
        'Quick wins: avoid pulling hands, arms or legs away quickly (it turns into a game); "stay still and redirect your dog when there is a brief pause in the behaviour"; redirect the mouth onto an age-appropriate toy or dog-safe chew kept in several places. Redirecting: spot early play signs and give a toy before mouthing starts; use three or four toys and swap them every couple of days; praise chewing an appropriate item or bringing a toy; ignoring a brought toy can teach that mouthing gets more attention. Avoid raised voices or pushing the dog down. Puppies need 18-20 hours of sleep. NOTE: the page numbered ladder differs: stay still, drop or hide a toy you hold, then turn away with crossed arms, then step away, then reward calm. No seconds, repetitions or mastery criterion are given.',
    },
    {
      url: 'https://www.rspca.org.uk/documents/1494939/7712578/Understand%20mouthing%20and%20play%20biting%20behaviour%20(156%20KB)/a444ab58-8ef0-32e2-6b34-0726fdc652ed',
      publisher: 'RSPCA (UK)',
      title: 'Understanding mouthing and play-biting behaviour (guidance for new dog owners, last updated November 2015)',
      verifiedOn: '2026-11-03',
      verification: 'extracted-text',
      supports: ['stay-still', 'offer-toy', 'forbidden'],
      summary:
        'Mouthing should always be redirected onto a suitable toy; have a toy in hand when playing; if the puppy touches a hand, body or clothing, keep that part still and distract them at once by offering a toy instead; keep the toy interesting by moving it; do not smile or laugh at the mouthing; no rough games without toys; be consistent. Does not mention praise. No seconds or repetitions given. It is an adopter leaflet dated 2015. TIMING DIFFERS from our sequence: it offers the toy at once, during the contact; we offer it at the pause or release (Dogs Trust, Dogs for Good).',
    },
    {
      url: 'https://www.dogsforgood.org/media/biwlp0nd/family-dog-programme-puppy-biting.pdf',
      publisher: 'Dogs for Good',
      title: 'Puppy biting, nipping, and mouthing (family dog programme handout, 2015)',
      verifiedOn: '2026-11-03',
      verification: 'extracted-text',
      supports: ['stay-still', 'offer-toy', 'praise-chewing', 'rotate-toys', 'enough-sleep', 'forbidden', 'stop'],
      summary:
        'Redirect the puppy onto something suitable to bite and chew; when a puppy holds clothing, quietly stand very still and, WHEN THEY LET GO, redirect them onto something suitable (redirection after release, not during the mouthing); always use a toy, never hands or arms, for play; praise verbally when the puppy chooses to chew a toy; do not use anything aversive, shout or drag by the scruff; puppies need 18-20 hours of sleep. No seconds or repetitions given. A 2015 handout.',
    },
  ],
}

export const NAME_LOOK: TechniqueDefinition = {
  key: 'name-look',
  version: 1,
  topic: 'COMMANDS',
  description: 'Teach the puppy its name: say it once, reward the look.',
  audience: {
    allowedAges: ['under-10w', '10-16w', '4-6m', 'over-6m', 'unsure'],
    basis: 'product-default',
    basisNote: 'The source page covers dogs in general with no age limit; all bands allowed pending owner approval.',
  },
  variants: {
    STANDARD: {
      title: 'מגיב לשם',
      goal: 'הגור מסתכל אליכם כשאומרים את שמו.',
      estimatedMinutes: 3,
      preparation: ['חדר שקט בלי הסחות', 'חטיפים קטנים שהגור אוהב'],
      steps: [
        { id: 'say-name-once', text: 'עומדים במרחק של כ-{distanceMeters} מטר מהגור ואומרים את שמו פעם אחת, בקול נעים.', speechCue: 'name' },
        { id: 'treat-on-look', text: 'ברגע שהגור מסתכל אליכם, אומרים "יופי" ונותנים חטיף.', speechCue: 'praise' },
      ],
      params: [
        {
          id: 'distanceMeters',
          label: 'Distance from the puppy',
          unit: 'meters',
          min: 1,
          max: 3,
          default: 1,
          demonstrated: 1,
          compatibleMin: 1,
          compatibleMax: 2,
          basis: 'product-default',
          basisNote: 'The source gives no distance; the clip shows about one meter. Outside 1-2 the clip no longer shows the same setup.',
        },
        neutral('rounds', 'Repetitions per practice session', 'rounds', 3, 8, 5, 3, ROUNDS_NOTE),
        neutral('sessionsInRow', 'Consecutive sessions for the mastery criterion', 'sessions', 2, 5, 3, 3, SESSIONS_NOTE),
      ],
      successCriterion: 'ב-{sessionsInRow} מפגשי תרגול רצופים, הגור מסתכל אליכם אחרי שאמרתם את שמו פעם אחת, בחדר שקט.',
      tips: [{ id: 'repeat-less', text: 'אם הגור לא מגיב, לא חוזרים על השם שוב ושוב. מתרגלים ממרחק קרוב יותר ומתגמלים כל מבט.' }],
    },
    EASIER: {
      title: 'מתגמלים כל מבט',
      goal: 'הגור לומד שמבט אליכם מביא חטיף.',
      estimatedMinutes: 3,
      preparation: ['חדר שקט בלי הסחות', 'חטיפים קטנים שהגור אוהב'],
      steps: [
        { id: 'reward-glance', text: 'כל פעם שהגור מציץ אליכם, גם לרגע, נותנים לו חטיף מיד.', speechCue: 'praise' },
        { id: 'treat-on-look', text: 'כשהמבטים מתרגלים, אומרים את שמו פעם אחת וכשהוא מסתכל, נותנים חטיף.', speechCue: 'name' },
      ],
      params: [
        neutral('rounds', 'Repetitions per practice session', 'rounds', 3, 8, 5, 3, ROUNDS_NOTE),
        neutral('sessionsInRow', 'Consecutive sessions for the mastery criterion', 'sessions', 2, 5, 3, 3, SESSIONS_NOTE),
      ],
      successCriterion: 'ב-{sessionsInRow} מפגשי תרגול רצופים, הגור מסתכל אליכם בכל פעם שאתם אומרים את שמו.',
      tips: [],
    },
  },
  fallbackEasier: {
    title: 'עוד יותר פשוט',
    steps: ['מחזיקים חטיף ליד העיניים שלכם.', 'מתגמלים כל מבט, גם קצר.'],
  },
  forbiddenBehaviour: ['repeating the name over and over when ignored', 'using the name for scolding or only when the puppy misbehaves'],
  stopConditions: [STOP],
  review: { status: 'draft' },
  sources: [
    {
      url: 'https://www.dogstrust.org.uk/dog-advice/training/basics/name-training',
      publisher: 'Dogs Trust',
      title: 'How to teach your dog their name',
      verifiedOn: '2026-11-02',
      verification: 'fetched-summary',
      supports: ['reward-glance', 'say-name-once', 'treat-on-look', 'repeat-less', 'forbidden'],
      summary:
        'Start in a quiet room; reward each glance at you; add the name, and when the puppy looks reward with a treat; do not repeat the name over and over when ignored; do not use attention only when the puppy misbehaves.',
    },
  ],
}

export const TECHNIQUES: readonly TechniqueDefinition[] = [MOUTHING_REDIRECT_TOY, NAME_LOOK]

export function getTechnique(key: string, version: number): TechniqueDefinition | undefined {
  return TECHNIQUES.find((t) => t.key === key && t.version === version)
}

export const techniqueId = (def: Pick<TechniqueDefinition, 'key' | 'version'>) => `${def.key}@${def.version}`
export const techniqueFingerprintOf = fingerprintTechnique
