import type { Level } from './types'

export class PathInvariantError extends Error {}

/**
 * Checks the single-path contract (PRD §5.1–5.2): unique consecutive positions,
 * every level before the frontier completed, exactly one current, the rest locked.
 * A plan with every level completed is finished and has no current level.
 */
export function assertValidPath(levels: readonly Level[]): void {
  if (levels.length === 0) throw new PathInvariantError('Path has no levels')

  const ids = new Set<string>()
  let seenCurrent = false

  levels.forEach((level, index) => {
    if (level.position !== index + 1) {
      throw new PathInvariantError(`Level ${level.id} has position ${level.position}, expected ${index + 1}`)
    }
    if (ids.has(level.id)) throw new PathInvariantError(`Duplicate level id ${level.id}`)
    ids.add(level.id)

    if (level.state === 'current') {
      if (seenCurrent) throw new PathInvariantError('More than one current level')
      seenCurrent = true
    } else if (level.state === 'completed' && seenCurrent) {
      throw new PathInvariantError(`Completed level ${level.id} after the current level`)
    } else if (level.state === 'locked' && !seenCurrent) {
      throw new PathInvariantError(`Locked level ${level.id} before the current level`)
    }
  })
}

export function findCurrentIndex(levels: readonly Level[]): number {
  return levels.findIndex((level) => level.state === 'current')
}

export function isPathComplete(levels: readonly Level[]): boolean {
  return levels.length > 0 && levels.every((level) => level.state === 'completed')
}

export function pathProgress(levels: readonly Level[]) {
  return {
    completed: levels.filter((level) => level.state === 'completed').length,
    total: levels.length,
    current: levels.find((level) => level.state === 'current'),
  }
}

export type PathWindow = { start: number; end: number }

/** Bounded segment around the frontier for long plans; `end` is exclusive. */
export function initialWindow(levels: readonly Level[], before = 3, after = 4): PathWindow {
  const current = findCurrentIndex(levels)
  const anchor = current === -1 ? levels.length - 1 : current
  return {
    start: Math.max(0, anchor - before),
    end: Math.min(levels.length, anchor + after + 1),
  }
}

export function expandWindow(window: PathWindow, total: number, direction: 'earlier' | 'later', step = 4): PathWindow {
  return direction === 'earlier'
    ? { ...window, start: Math.max(0, window.start - step) }
    : { ...window, end: Math.min(total, window.end + step) }
}
