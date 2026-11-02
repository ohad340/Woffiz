import type { OnboardingAnswers } from '../content'
import { findCatalogEntry } from './media'
import type { AdaptOutput, CatalogEntry, GeneratedLevel, PlanOutput, ReviseOutput, TechniqueChoice, TopicName } from './schema'
import { renderChoice, techniqueIssues, type OfferedTechnique } from './techniques'

export type Issue = string

export type Context = {
  answers: OnboardingAnswers
  catalog: readonly CatalogEntry[]
  /** Offered techniques (slice 3C). Absent or empty: only free-form levels are possible. */
  techniques?: readonly OfferedTechnique[]
  /** Every level must be technique-bound (MEDIA_REQUIRED=true, only once the published catalog is verified). */
  mediaRequired?: boolean
}

const DIFFICULTY_TOPIC: Record<OnboardingAnswers['difficulties'][number], TopicName> = {
  toilet: 'TOILET',
  biting: 'BITING',
  sleep: 'SLEEP',
  alone: 'ALONE',
  commands: 'COMMANDS',
}

/**
 * Wording the product never ships (PRD section 6 content boundary): physical or aversive methods and guaranteed
 * outcomes. Conservative on purpose: a hit rejects the candidate instead of repairing it. Negations such as
 * "בלי עונש" are allowed.
 */
const BANNED: { pattern: RegExp; reason: string }[] = [
  { pattern: /להכות|הכאה|מכה|מכים|סטירה|לבעוט|בועטים|לנער את/, reason: 'physical punishment' },
  { pattern: /(?<!בלי |ללא |אין )(?:עונש|להעניש|מענישים)/, reason: 'punishment' },
  { pattern: /צועקים|לצעוק|צעקות|מרימים קול/, reason: 'shouting' },
  { pattern: /קולר חנק|קולר חשמלי|קולר דוקרני|הלם חשמלי/, reason: 'aversive tool' },
  { pattern: /להרעיב|הרעבה|לנעול (?:אותו|אותה|את הגור)/, reason: 'deprivation or confinement as penalty' },
  { pattern: /מובטח|מובטחת|בוודאות|ערבות להצלחה|100%/, reason: 'guaranteed outcome' },
]

/** Reasons whose phrases are fine when negated ("אל תצעקו"); physical violence and guarantees are never fine. */
const NEGATABLE = new Set(['punishment', 'shouting', 'deprivation or confinement as penalty'])

const MARKUP = /<[a-z!/][^>]*>|https?:\/\/|www\.|\]\(/i
const HEBREW = /[֐-׿]/
const SAFETY_REFERRAL = /וטרינר|מאלף מוסמך|מאלף כלבים|מאמן מוסמך|מאמן כלבים/

type ContentLike = Pick<
  GeneratedLevel,
  'title' | 'goal' | 'preparation' | 'steps' | 'successCriterion' | 'stopConditions' | 'easierVariant' | 'estimatedMinutes' | 'mediaId'
>

function textsOf(level: ContentLike) {
  return [
    level.title,
    level.goal,
    ...level.preparation,
    ...level.steps,
    level.successCriterion,
    ...level.stopConditions,
    level.easierVariant.title,
    ...level.easierVariant.steps,
  ]
}

const NEGATION = /(?:^|s)(?:אל|לא|בלי|ללא|אין)(?:s|$)/

/** True when the banned phrase is used in a negated sentence ("אל תגיבו בעונש"), which is exactly what we want to say. */
function isNegated(text: string, index: number) {
  const sentenceStart = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('!', index), text.lastIndexOf('?', index)) + 1
  return NEGATION.test(text.slice(sentenceStart, index))
}

function bannedReasons(text: string) {
  const reasons: string[] = []
  for (const { pattern, reason } of BANNED) {
    const match = pattern.exec(text)
    if (match && !(NEGATABLE.has(reason) && isNegated(text, match.index))) reasons.push(reason)
  }
  return reasons
}

function badWording(text: string) {
  return MARKUP.test(text) || bannedReasons(text).length > 0
}

function checkContent(label: string, level: ContentLike, ctx: Context, issues: Issue[], bound = false) {
  for (const text of textsOf(level)) {
    for (const reason of bannedReasons(text)) issues.push(`${label}: banned wording (${reason})`)
    if (MARKUP.test(text)) issues.push(`${label}: contains a link or markup`)
    if (!HEBREW.test(text)) issues.push(`${label}: text is not Hebrew`)
  }
  if (!level.stopConditions.some((c) => SAFETY_REFERRAL.test(c))) issues.push(`${label}: missing vet/trainer stop condition`)
  const budget = Number(ctx.answers.time ?? 15)
  if (level.estimatedMinutes > budget) issues.push(`${label}: ${level.estimatedMinutes} min exceeds the ${budget} min budget`)
  if (ctx.answers.age === 'under-10w' && level.estimatedMinutes > 5) issues.push(`${label}: too long for a puppy under 10 weeks`)
  if (level.mediaId !== null && !bound) {
    const entry = findCatalogEntry(ctx.catalog, level.mediaId)
    if (!entry) issues.push(`${label}: unknown media id`)
    else if (entry.variant !== 'STANDARD') issues.push(`${label}: media variant is not compatible`)
  }
}

/**
 * A technique-bound level is validated on what the owner will actually see: the catalog rendering. A free-form level is
 * validated on the model's text, as before. Returns nothing more: issues are pushed.
 */
function checkExercise(
  label: string,
  level: ContentLike & { technique: TechniqueChoice | null },
  topic: TopicName | undefined,
  ctx: Context,
  issues: Issue[],
  allowEasier: boolean,
) {
  if (!level.technique) {
    if (ctx.mediaRequired) issues.push(`${label}: a demonstrated technique is required`)
    checkContent(label, level, ctx, issues)
    return
  }
  if (level.mediaId !== null) issues.push(`${label}: a technique-bound exercise must leave mediaId null`)
  if (!topic) {
    issues.push(`${label}: technique without a known topic`)
    return
  }
  const found = techniqueIssues(label, topic, level.technique, { answers: ctx.answers, techniques: ctx.techniques ?? [] }, { allowEasier })
  if (found.length > 0) {
    issues.push(...found)
    return
  }
  checkContent(label, { ...renderChoice(level.technique, ctx.techniques ?? []), mediaId: null }, ctx, issues, true)
}

/** Replaces a valid technique-bound exercise's instruction fields with the catalog rendering (free-form: unchanged). */
export function rendered<T extends ContentLike & { technique: TechniqueChoice | null }>(level: T, ctx: Context): T {
  return level.technique ? { ...level, ...renderChoice(level.technique, ctx.techniques ?? []), mediaId: null } : level
}

/** Topic mix: no more than two levels in a row with the same topic, counting kept levels before the new ones. */
function checkMix(topics: TopicName[], issues: Issue[], before: TopicName[] = []) {
  const all = [...before, ...topics]
  for (let i = 2; i < all.length; i++) {
    if (all[i] === all[i - 1] && all[i] === all[i - 2]) {
      issues.push(`topic ${all[i]} appears three times in a row`)
      return
    }
  }
}

function checkLevels(levels: GeneratedLevel[], ctx: Context, issues: Issue[], keptKeys: string[] = [], keptTopics: TopicName[] = []) {
  const seen = new Set<string>(keptKeys)
  levels.forEach((level, index) => {
    const label = `level ${index + 1}`
    if (seen.has(level.stableKey)) issues.push(`${label}: duplicate stableKey`)
    for (const prerequisite of level.prerequisites) {
      if (prerequisite === level.stableKey || !seen.has(prerequisite)) issues.push(`${label}: prerequisite is not an earlier level`)
    }
    seen.add(level.stableKey)
    checkExercise(label, level, level.topic, ctx, issues, false)
    if (ctx.answers.age === 'under-10w' && level.topic === 'ALONE' && keptTopics.length + index < 4) {
      issues.push(`${label}: alone-time too early for a puppy under 10 weeks`)
    }
  })
  checkMix(
    levels.map((l) => l.topic),
    issues,
    keptTopics,
  )
}

export function validatePlan(output: PlanOutput, ctx: Context): Issue[] {
  const issues: Issue[] = []
  if (badWording(output.rationale)) issues.push('rationale: not allowed wording')
  checkLevels(output.levels, ctx, issues)
  const topics = new Set(output.levels.map((l) => l.topic))
  for (const difficulty of ctx.answers.difficulties) {
    if (!topics.has(DIFFICULTY_TOPIC[difficulty])) issues.push(`plan does not cover the listed difficulty "${difficulty}"`)
  }
  return issues
}

export function validateAdapt(output: AdaptOutput, ctx: Context, topic?: TopicName): Issue[] {
  const issues: Issue[] = []
  if (badWording(output.explanation)) issues.push('explanation: not allowed wording')
  checkExercise('exercise', output.exercise, topic, ctx, issues, true)
  return issues
}

export function validateRevise(
  output: ReviseOutput,
  ctx: Context,
  kept: { stableKeys: string[]; topics: TopicName[]; count: number },
  bounds: { min: number; max: number },
): Issue[] {
  const issues: Issue[] = []
  if (badWording(output.rationale)) issues.push('rationale: not allowed wording')
  const total = kept.count + output.levels.length
  if (total < bounds.min || total > bounds.max) issues.push(`plan would have ${total} levels (allowed ${bounds.min}-${bounds.max})`)
  checkLevels(output.levels, ctx, issues, kept.stableKeys, kept.topics)
  return issues
}
