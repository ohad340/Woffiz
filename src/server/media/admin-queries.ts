import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import { TECHNIQUE_LOCK } from '@/domain/techniques/lock'
import { prisma } from '../db'
import { publishGateIssues, reviewGateIssues, type ReviewRow } from './gates'
import { mediaStoreFromEnv } from './store'

const SIGNED_URL_TTL_S = 600

/** Overview for the admin list: every catalog technique with its registered state and all media versions. */
export async function adminOverview() {
  const [states, versions] = await Promise.all([
    prisma.techniqueVersionState.findMany(),
    prisma.mediaVersion.findMany({
      select: {
        id: true,
        version: true,
        status: true,
        techniqueKey: true,
        techniqueVersion: true,
        variant: true,
        isTestFixture: true,
        durationMs: true,
        createdAt: true,
        publishedAt: true,
        withdrawReason: true,
      },
      orderBy: [{ techniqueKey: 'asc' }, { variant: 'asc' }, { version: 'desc' }],
    }),
  ])
  return TECHNIQUES.map((def) => {
    const state = states.find((s) => s.techniqueKey === def.key && s.techniqueVersion === def.version) ?? null
    return {
      def,
      locked: TECHNIQUE_LOCK[`${def.key}@${def.version}`] === fingerprintTechnique(def),
      state: state ? { suspendedAt: state.suspendedAt } : null,
      versions: versions.filter((v) => v.techniqueKey === def.key && v.techniqueVersion === def.version),
    }
  })
}

/** Everything the review page needs about one version, including what still blocks publication. */
export async function adminVersion(id: string) {
  const version = await prisma.mediaVersion.findUnique({
    where: { id },
    include: { reviews: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } },
  })
  if (!version) return null
  const def = TECHNIQUES.find((t) => t.key === version.techniqueKey && t.version === version.techniqueVersion)
  const state = await prisma.techniqueVersionState.findUnique({
    where: { techniqueKey_techniqueVersion: { techniqueKey: version.techniqueKey, techniqueVersion: version.techniqueVersion } },
  })
  const rows: ReviewRow[] = version.reviews.map((r) => ({ kind: r.kind, decision: r.decision, reviewedFingerprint: r.reviewedFingerprint }))
  const reviewIssues = reviewGateIssues(rows, version.bundleFingerprint)
  const publishIssues = state ? publishGateIssues(def, TECHNIQUE_LOCK, version, state, process.env) : ['the technique state is not registered']

  let urls: { video: string; poster: string } | null = null
  const store = mediaStoreFromEnv()
  if (store) {
    try {
      urls = { video: await store.signedReadUrl(version.videoKey, SIGNED_URL_TTL_S), poster: await store.signedReadUrl(version.posterKey, SIGNED_URL_TTL_S) }
    } catch {
      urls = null
    }
  }
  return { version, def: def ?? null, state, reviewIssues, publishIssues, urls }
}
