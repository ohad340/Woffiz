import { describe, expect, it } from 'vitest'
import { DEV_PLAN } from '@/fixtures/devPlan'
import { assertValidPath, expandWindow, findCurrentIndex, initialWindow, isPathComplete, PathInvariantError } from './path'
import type { Level, LevelState } from './types'

function path(states: LevelState[]): Level[] {
  return states.map((state, i) => ({
    id: `l${i + 1}`,
    position: i + 1,
    topic: 'commands',
    title: `שלב ${i + 1}`,
    goal: '',
    masteryCriterion: '',
    estimatedMinutes: 5,
    state,
  }))
}

describe('assertValidPath', () => {
  it('accepts the development plan as one mixed-topic path with one current level', () => {
    const levels: Level[] = DEV_PLAN.map((entry, i) => ({
      id: `dev-${i + 1}`,
      position: i + 1,
      topic: entry.topic.toLowerCase() as Level['topic'],
      title: entry.content.title,
      goal: entry.content.goal,
      masteryCriterion: entry.content.successCriterion,
      estimatedMinutes: entry.estimatedMinutes,
      state: i === 0 ? 'current' : 'locked',
    }))
    expect(() => assertValidPath(levels)).not.toThrow()
    expect(levels.filter((l) => l.state === 'current')).toHaveLength(1)
    expect(new Set(levels.map((l) => l.topic)).size).toBe(5)
  })

  it('accepts a finished path with no current level', () => {
    expect(() => assertValidPath(path(['completed', 'completed']))).not.toThrow()
    expect(isPathComplete(path(['completed', 'completed']))).toBe(true)
  })

  it.each([
    ['two current levels', ['completed', 'current', 'current']],
    ['completed after current', ['current', 'completed', 'locked']],
    ['locked before current', ['locked', 'current', 'locked']],
  ] as const)('rejects %s', (_name, states) => {
    expect(() => assertValidPath(path([...states]))).toThrow(PathInvariantError)
  })

  it('rejects gaps in positions', () => {
    const levels = path(['current', 'locked'])
    levels[1]!.position = 3
    expect(() => assertValidPath(levels)).toThrow(PathInvariantError)
  })
})

describe('path window', () => {
  it('centers a bounded window on the current level and expands within bounds', () => {
    const levels = path(['completed', 'completed', 'completed', 'completed', 'completed', 'current', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'])
    expect(findCurrentIndex(levels)).toBe(5)
    const window = initialWindow(levels)
    expect(window).toEqual({ start: 2, end: 10 })
    expect(expandWindow(window, levels.length, 'earlier')).toEqual({ start: 0, end: 10 })
    expect(expandWindow(window, levels.length, 'later')).toEqual({ start: 2, end: 12 })
  })
})
