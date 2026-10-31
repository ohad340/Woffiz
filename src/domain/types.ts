export const TOPICS = ['toilet', 'biting', 'sleep', 'alone', 'commands'] as const
export type Topic = (typeof TOPICS)[number]

export const TOPIC_LABELS: Record<Topic, string> = {
  toilet: 'צרכים',
  biting: 'נשיכות',
  sleep: 'שינה',
  alone: 'הישארות לבד',
  commands: 'פקודות בסיס',
}

/** Server mastery states (PRD §5). Loading/review/unavailable are presentation-only. */
export type LevelState = 'locked' | 'current' | 'completed'

export const LEVEL_STATE_LABELS: Record<LevelState, string> = {
  locked: 'נעול',
  current: 'השלב הנוכחי',
  completed: 'הושלם',
}

export type Level = {
  id: string
  position: number
  topic: Topic
  title: string
  goal: string
  masteryCriterion: string
  estimatedMinutes: number
  state: LevelState
}

export type Puppy = {
  name: string
  ageLabel: string
}
