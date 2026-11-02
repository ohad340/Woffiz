import type { Level, LevelState, Puppy, Topic } from '@/domain/types'
import { prisma } from './db'
import { AGE_LABELS, AGE_BANDS, exerciseContentSchema, type ExerciseContent } from './content'

/** Read models for server components. Every query is scoped to the authenticated owner. */

const TOPIC: Record<string, Topic> = {
  TOILET: 'toilet',
  BITING: 'biting',
  SLEEP: 'sleep',
  ALONE: 'alone',
  COMMANDS: 'commands',
}

const STATE: Record<string, LevelState> = { LOCKED: 'locked', CURRENT: 'current', COMPLETED: 'completed' }

export type Overview = {
  puppy: Puppy
  planId: string
  planRevision: number
  planCompleted: boolean
  levels: Level[]
  completed: number
  current: Level | null
}

function ageLabel(profileJson: unknown): string {
  const age = (profileJson as { age?: string } | null)?.age
  return AGE_BANDS.includes(age as (typeof AGE_BANDS)[number]) ? AGE_LABELS[age as keyof typeof AGE_LABELS] : ''
}

export async function getOverview(userId: string): Promise<Overview | null> {
  const puppy = await prisma.puppy.findUnique({
    where: { ownerId: userId },
    include: {
      plans: {
        orderBy: { version: 'asc' },
        take: 1,
        include: {
          levels: {
            orderBy: { position: 'asc' },
            include: { exerciseVersions: { orderBy: { version: 'desc' }, take: 1 } },
          },
        },
      },
    },
  })
  const plan = puppy?.plans[0]
  if (!puppy || !plan || !puppy.onboardedAt) return null

  const levels: Level[] = plan.levels.map((level) => {
    const content = exerciseContentSchema.parse(level.exerciseVersions[0]?.contentJson)
    return {
      id: level.id,
      position: level.position,
      topic: TOPIC[level.topic]!,
      title: content.title,
      goal: content.goal,
      masteryCriterion: content.successCriterion,
      estimatedMinutes: content.estimatedMinutes,
      state: STATE[level.state]!,
    }
  })

  return {
    puppy: { name: puppy.name, ageLabel: ageLabel(puppy.profileJson) },
    planId: plan.id,
    planRevision: plan.revision,
    planCompleted: plan.status === 'COMPLETED',
    levels,
    completed: levels.filter((l) => l.state === 'completed').length,
    current: levels.find((l) => l.state === 'current') ?? null,
  }
}

import { redirect } from 'next/navigation'

/** Pages render in parallel with their layout, so they redirect on their own when there is no plan. */
export async function requireOverview(userId: string): Promise<Overview> {
  const overview = await getOverview(userId)
  if (!overview) redirect('/onboarding')
  return overview
}

export type ExerciseView = {
  level: Level
  content: ExerciseContent
  exerciseVersionId: string
  criterionVersion: number
  planRevision: number
  mode: 'current' | 'review' | 'locked'
  nextPosition: number | null
  /** Reports on this exact version of a CURRENT level that were not "independent"; 2 or more offer an AI adaptation. */
  strugglesOnVersion: number
}

/** Returns null both when the level does not exist and when it belongs to someone else. */
export async function getExercise(userId: string, levelId: string): Promise<ExerciseView | null> {
  const level = await prisma.level.findUnique({
    where: { id: levelId },
    include: {
      plan: { include: { puppy: true } },
      exerciseVersions: { orderBy: { version: 'desc' }, take: 1 },
    },
  })
  const exercise = level?.exerciseVersions[0]
  if (!level || !exercise || level.plan.puppy.ownerId !== userId) return null

  const content = exerciseContentSchema.parse(exercise.contentJson)
  const strugglesOnVersion =
    level.state === 'CURRENT'
      ? await prisma.attempt.count({
          where: { levelId: level.id, exerciseVersionId: exercise.id, mode: 'CURRENT', outcome: { not: 'INDEPENDENT' } },
        })
      : 0
  return {
    level: {
      id: level.id,
      position: level.position,
      topic: TOPIC[level.topic]!,
      title: content.title,
      goal: content.goal,
      masteryCriterion: content.successCriterion,
      estimatedMinutes: content.estimatedMinutes,
      state: STATE[level.state]!,
    },
    content,
    exerciseVersionId: exercise.id,
    criterionVersion: exercise.criterionVersion,
    planRevision: level.plan.revision,
    mode: level.state === 'CURRENT' ? 'current' : level.state === 'COMPLETED' ? 'review' : 'locked',
    nextPosition: level.position + 1,
    strugglesOnVersion,
  }
}

export type RecentAttempt = {
  id: string
  levelPosition: number
  levelTitle: string
  outcome: 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING'
  mode: 'CURRENT' | 'REVIEW'
  createdAt: Date
}

export async function getRecentAttempts(userId: string, take = 5): Promise<RecentAttempt[]> {
  const attempts = await prisma.attempt.findMany({
    where: { puppy: { ownerId: userId } },
    orderBy: { createdAt: 'desc' },
    take,
    include: { level: true, exerciseVersion: true },
  })
  return attempts.map((attempt) => ({
    id: attempt.id,
    levelPosition: attempt.level.position,
    levelTitle: exerciseContentSchema.parse(attempt.exerciseVersion.contentJson).title,
    outcome: attempt.outcome,
    mode: attempt.mode,
    createdAt: attempt.createdAt,
  }))
}
