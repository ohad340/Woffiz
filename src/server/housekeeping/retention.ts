// Retention periods of slice 4.6 (docs/DECISIONS.md P4-6; owner decisions F2 and F3). Code constants, not environment
// values: changing one is a reviewed code change. The 30-day job-payload rule (B3) stays the constant inside ai/jobs.ts.

/** "OpsEvent" rows. */
export const OPS_EVENT_DAYS = 30
/** Resolved "OpsAlert" rows. */
export const RESOLVED_ALERT_DAYS = 90
/** Finished "HousekeepingRun" rows. */
export const HOUSEKEEPING_RUN_DAYS = 90
/** "PilotMetricDay" aggregate snapshots (F2). */
export const METRIC_DAY_DAYS = 365
/** Never-verified accounts are purged this long after creation, once NEVER_VERIFIED_PURGE=on (F3). */
export const NEVER_VERIFIED_DAYS = 14

/** Rows deleted per table per run. */
export const PRUNE_BATCH = 10_000
/** Never-verified accounts handled per run. */
export const PURGE_BATCH = 100
/** Missing snapshot days backfilled per run (the 7 Israel days before yesterday). */
export const BACKFILL_DAYS = 7
