import { testMediaEnabled } from './config'
import type { CatalogEntry } from './schema'

/**
 * ISOLATED DEVELOPMENT MEDIA CATALOG — not real, not reviewed. Phase 2 has no published media, so the catalog
 * offered to the generator is empty unless AI_TEST_MEDIA=true on a local machine / in tests.
 * Reviewed, published media arrives in Phase 3 (PRD §7).
 */
export const TEST_MEDIA: readonly CatalogEntry[] = [
  { id: 'test-media-name', family: 'COMMANDS', variant: 'STANDARD' },
  { id: 'test-media-toilet', family: 'TOILET', variant: 'STANDARD' },
  { id: 'test-media-biting', family: 'BITING', variant: 'STANDARD' },
  { id: 'test-media-sleep', family: 'SLEEP', variant: 'STANDARD' },
  { id: 'test-media-alone', family: 'ALONE', variant: 'STANDARD' },
]

export function offeredCatalog(env: Record<string, string | undefined> = process.env): CatalogEntry[] {
  return testMediaEnabled(env) ? [...TEST_MEDIA] : []
}

export function findCatalogEntry(catalog: readonly CatalogEntry[], id: string) {
  return catalog.find((entry) => entry.id === id)
}

/** Makes sure the rows an ExerciseVersion.mediaId points at exist (isolated test catalog only). */
export async function ensureTestMediaRows(
  tx: { mediaAsset: { upsert: (args: { where: { id: string }; create: { id: string; family: string; variant: string }; update: Record<string, never> }) => Promise<unknown> } },
  ids: (string | null)[],
) {
  for (const id of new Set(ids.filter((value): value is string => value !== null))) {
    const entry = TEST_MEDIA.find((candidate) => candidate.id === id)
    if (entry) await tx.mediaAsset.upsert({ where: { id }, create: { id, family: entry.family, variant: entry.variant }, update: {} })
  }
}
