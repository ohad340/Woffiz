# Architecture Phase 4

## Phase Identifier
PHASE=4

## Status
STATUS: APPROVED

Slice 4.6 final Architect review APPROVED on 2026-11-18. The code and local evidence are approved. Merge conditions C1-C4 (the CI-only items) are pending an owner-approved push; see "Architect Review".

Slice 4.6 contract written on 2026-11-17. Owner decisions F1-F3 approved on 2026-11-17 as recommended (see "Owner Decisions (slice 4.6)"): alert email to `ALERT_EMAIL` with the admin page as fallback, 365-day snapshot retention, 14-day never-verified retention.

Slice 4.5 is approved, merged and deployed (see "Slice 4.5 record", "Release record"). Nothing in this contract authorizes a migration, a merge, a deployment, a production environment change or the deletion of real data.

Revision for **slice 4.6** (pilot metrics, operational alerts and retention housekeeping), 2026-11-17. Slices 4.2 (`7bc45f8`), 4.3 (`ad6b55a`), 4.4 (`0b18ee2`) and 4.5 (`265f006`, PR #8) are approved, merged and deployed. Their contracts and final reviews are kept below as closed records and are not reopened.

## Phase Goal
Deliver the remaining ROADMAP Phase 4 work as the ordered slices of `team-Yuri/plan.md`. 4.1-4.5 are done. This revision details **slice 4.6 only**. 4.7 and 4.8 get their own contracts later.

**Slice 4.6 goal:** the owner can see how the pilot is going and learns about operational failures without watching logs, while the app keeps no personal data longer than it needs to.
- An ADMIN-only page `/admin/metrics` shows aggregate pilot metrics derived from data the app already stores, plus open alerts and the state of housekeeping.
- Server errors, authentication-mail failures, generation failures and AI budget exhaustion raise deduplicated alerts that carry no personal data.
- One daily scheduled housekeeping run enforces every retention rule: the existing 30-day job-payload rule (unchanged), the existing counter pruning, the new operational tables, the aggregate snapshots, and the purge of never-verified accounts after an owner-approved period.
- The purge of never-verified accounts is built and tested in 4.6, but in production it runs only after a separate owner approval (O9). Until then it only counts the eligible accounts.

## Source References
- `team-Yuri/plan.md` (APPROVED):
  - slice 4.6;
  - owner decision 4: "Pilot analytics are first-party in the app's own database. No third party, no cookies, no extra cost.";
  - principle "Derive before collecting";
  - open questions "Alert channel" and "Retention period for analytics events".
- PRD.md §8 (deletion and the 30-day failed-job payload retention, owner-approved 2026-11-12), §10 (privacy, secrets) and the pilot paragraph (measure onboarding-to-first-practice conversion, active practice days, day-7 return, repeated difficulty per level, mastery-report frequency and video issues; "spending alerts").
- ROADMAP.md Phase 4: "minimal privacy-conscious analytics, deletion and operational alerts"; review of activation, day-7 return and stalled levels.
- `docs/DECISIONS.md` P4-4 (account deletion, B3 payload retention) and P4-5 (allowlist; P8 assigned the never-verified purge to 4.6).
- Code baseline `origin/main` `265f006`, read-only:
  - `prisma/schema.prisma`: `User.emailVerified`, `User.createdAt`, `Puppy.onboardedAt`, `Attempt` (`outcome`, `mode`, `createdAt`), `MasteryEvent.confirmedAt`, `Plan`/`Level` (`position`, `topic`, `state`), `GenerationJob` (`status`, `errorCode`, `finishedAt`, `payloadJson`), `AiUsageDay`, `EmailRateLimit`, `Verification`;
  - `src/server/ai/jobs.ts`: `pruneJobPayloads` (30 days by `createdAt`), called only opportunistically from `startJob`; error codes `quota-account`, `quota-calls`, `attempts-exhausted`, `deadline`, `internal`, `lease-expired`;
  - `src/server/ai/quota.ts`: `pruneAiUsage` (7 days), `keyOf`, the system-wide `ai-calls` counter, `deleteRequestUnits`;
  - `src/server/email/delivery.ts` (`sendAuthEmail`, delivery failures logged without address; `pruneRateLimits` at 1 % of requests), `transport.ts` (`deliver`, 10 s timeout), `config.ts` (`emailTransport`, `signUpPolicy`);
  - `src/server/auth.ts`: `requireEmailVerification: true`, `autoSignInAfterVerification: true`, link TTL 1 h (`AUTH_LINK_TTL_SECONDS`), verification is a token, not a `verification` row; a reset request stores the user id as a `verification` value;
  - `src/server/account-deletion.ts` (P4-4 transaction, lock order job -> plan -> puppy -> user);
  - `src/server/http.ts` (`postRoute` and `adminRoute`, the only `INTERNAL` 500 branches), `src/server/admin.ts` (`assertAdmin`), `src/server/session.ts` (`requireAdminOrNotFound`), `src/app/admin/layout.tsx`;
  - `vercel.json` (no crons), `.env.example`, `test/integration/data-api-lock.test.ts`, `scripts/required-pg-tests.json`.
- Platform documentation checked on 2026-11-17:
  - Vercel Cron Jobs: on Hobby at most once per day, invoked anywhere within the scheduled hour, included in all plans. Best-effort delivery, so a run can be missed or delivered twice. No retry on failure. Production deployments only. `CRON_SECRET` is sent as `Authorization: Bearer …`. Cron definitions follow an Instant Rollback. Cron Jobs are marked legacy in favor of Vercel Schedules.
  - Next.js `after()`: stable since 15.1, usable in Route Handlers, runs after the response through `waitUntil` on Vercel, also when the handler throws, if it was registered before the throw.
  - Resend free plan: 100 emails per day and 3 000 per month, shared by all mail; over quota is a `429` with no queueing.

## Current-state findings that shape the design
1. **Every PRD pilot metric except "video issues" can be derived from existing tables.** Onboarding (`Puppy.onboardedAt`), practice (`Attempt`), difficulty (`Attempt.outcome` per `Level`), mastery (`MasteryEvent`) and generation health (`GenerationJob`) are already stored. Only "returned without practicing" has no source. Recording it would mean tracking visits, so return is defined by practice (O2). Video issues are not measurable: the pilot runs without videos (owner decision 2).
2. **Derived metrics follow the account.** When an account is deleted (P4-4), its rows go and the live metrics drop it. That is correct for privacy, but the pilot results report (4.8) would lose history. A daily snapshot of aggregate integers only, with no account ids, keeps trends without keeping personal data (O3).
3. **Server errors and mail failures have no stored source.** They exist only as `console.error` lines. Alerting on them needs a minimal event row with no payload (O4).
4. **`pruneJobPayloads` runs only when a generation starts.** If nobody generates, payloads older than 30 days stay. The approved 30-day policy is honored only while traffic exists. A daily run closes this gap without changing the rule.
5. **Never-verified accounts cannot sign in, so they cannot delete themselves.** Their rows (address, password hash) stay for ever today. Accounts created before verification became mandatory may be unverified and still hold data (a puppy, sessions). An automatic purge must not touch them (O8).
6. **Verification is a signed token checked against the user row, and it signs the user in.** A purge that races a verification must leave either a verified account or no account, never a session for a deleted user (O8).
7. **Hobby scheduling is daily and imprecise.** Alerts cannot depend on the schedule. They are evaluated when the failure happens (inline, after the response), and the daily run is the backstop.
8. **The only mail channel is Resend, on the shared sender.** It delivers only to the Resend account's own address, which is `TESTER_EMAIL`, so an owner alert can work today without a domain. Its quota is shared with authentication mail.

## Architectural Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| O1. **Metrics are derived at read time from product tables, ADMIN-only, aggregates only.** One server module (`src/server/metrics/`) computes a typed, fixed-shape result. One page, `/admin/metrics`, renders it under the existing admin layout (`requireAdminOrNotFound`: verified session plus a database ADMIN role, everyone else gets the 404). `force-dynamic` and `Cache-Control: private, no-store`. No API endpoint, no CLI, no export in 4.6. | "Derive before collecting." One access path is the smallest attack surface. A page is enough for the owner and for 4.8. | No new collection for metrics. The page shows nothing about a single account: no id, email, name, puppy name, profile, exercise text, payload or idempotency key, and no per-account rows. |
| O2. **Metric definitions (fixed; the Manager may refine the SQL, not the meaning).**<br>- **Cohort:** accounts with role OWNER only. ADMIN accounts and their puppies are excluded everywhere.<br>- **Day:** a calendar day in `Asia/Jerusalem`.<br>- **M1 Funnel:** registered → verified → onboarded (`onboardedAt` set) → first practice (at least one CURRENT attempt). Each stage is a count, with its share of the previous stage, plus the median hours from `onboardedAt` to the first CURRENT attempt.<br>- **M2 Active practice days:** distinct days with at least one attempt (any mode) per onboarded owner, over the last 7 and 28 days. Shown as median, number of owners with ≥ 3 days in the last 7, and number with 0.<br>- **M3 Day-7 return:** of owners whose onboarding day + 13 has passed, the number with at least one attempt on days 7-13 after the onboarding day (day 0).<br>- **M4 Repeated difficulty per level:** per level position, the number of owners with ≥ 2 STRUGGLING CURRENT attempts on that level, and the most frequent topic. **Stalled:** owners whose ACTIVE plan's current level has no mastery and no attempt in the last 7 days.<br>- **M5 Mastery reports:** mastery confirmations in the last 7 and 28 days; median days from the first CURRENT attempt on a level to its mastery; confirmations per active owner-week.<br>- **M6 Generation health:** jobs in the last 7 days by status; failures by error code; per-account quota refusals (`quota-account`); budget refusals (`quota-calls`). `payloadJson` is never read.<br>- **Video issues:** shown as "not measured in the pilot: no demonstration videos". | The PRD measures, made precise enough to test. Practice-based return avoids visit tracking. | Every number shows its denominator ("2 of 3"). With 20-30 owners, percentages alone would mislead. |
| O3. **Daily aggregate snapshot `PilotMetricDay`.** One row per day: `day` (date, primary key), `schemaVersion`, `computedAt`, `metricsJson`. The JSON is the M1-M6 result for that day, validated by a strict schema of integers and decimals only, with no strings except fixed codes. Written only by the housekeeping run, for the previous day, as an idempotent upsert. Missing days of the last 7 are backfilled. Days older than that are never recomputed, because the underlying data may have been deleted. Kept for **F2**. | Keeps trends after deletions (finding 2) without personal data. | Account deletion needs no change: a snapshot holds no account id and cannot be linked back. README states that aggregate counts can outlive an account. |
| O4. **Operational events `OpsEvent`:** `id`, `kind`, `createdAt`, nothing else. Kinds:<br>- `SERVER_ERROR`: the `INTERNAL` branch of `postRoute` and `adminRoute`, excluding the deleted-account branch and every `AppError`, plus uncaught server errors through Next.js `onRequestError` in `instrumentation.ts` (Node.js runtime only; the Manager verifies the API on Next 16.4.3);<br>- `AUTH_EMAIL_FAILED`: `sendAuthEmail` catches a `deliver` failure. A policy skip is not a failure;<br>- `HOUSEKEEPING_FAILED`: a housekeeping step failed.<br>Recording never throws, never awaits beyond one insert, and logs only a fixed line on failure. Recording inside the ops code never records `SERVER_ERROR` (no recursion). Kept 30 days. | Finding 3. A row with only a kind and a time is not personal data. | The request path changes only by one insert on an error branch, which is already failing. Success paths are untouched. |
| O5. **Generation and budget signals are derived from `GenerationJob` and `AiUsageDay`, not hooked into generation code.** `jobs.ts`, `onboarding.ts`, `revision.ts` and `quota.ts` are not modified.<br>- **Generation failure:** a job closed FAILED with `errorCode` in `attempts-exhausted`, `deadline`, `internal` or `lease-expired`, counted by `finishedAt`.<br>- **Budget:** today's system-wide `ai-calls` counter, read by its recomputed key, against `AI_DAILY_CALLS_MAX`; or any `quota-calls` failure today.<br>- `quota-account`, `STALE` and `REJECTED` are normal product outcomes. They appear in M6, never as alerts.<br>The three generation routes register `after(() => evaluateAlerts('generation'))` before their work starts. | Generation logic stays untouched (plan constraint). The data already exists. | An index on `GenerationJob` for the failure count is added only if the Manager shows the query needs one. |
| O6. **Alert rules (Architect defaults, code constants, documented):**<br>- `server-errors`: ≥ 3 `SERVER_ERROR` in 60 min;<br>- `auth-email`: ≥ 2 `AUTH_EMAIL_FAILED` in 60 min;<br>- `generation-failures`: ≥ 3 generation failures in 60 min;<br>- `ai-budget-warning`: the `ai-calls` counter reaches 80 % of the daily maximum (once per UTC day);<br>- `ai-budget-exhausted`: the counter reaches the maximum, or a `quota-calls` failure (once per UTC day);<br>- `housekeeping`: any failed step.<br>Evaluation runs inline after the response (`after()`) when an event is recorded or a generation route finishes, and in every housekeeping run. A missed or late daily run is shown on the page (last successful run older than 36 h). It cannot alert, because nothing would run to send it. | Pilot volume is small, so low absolute thresholds catch real faults. PRD "spending alerts". | Thresholds change only by a reviewed code change, recorded in `P4-6`. |
| O7. **Deduplication, delivery and failure handling.**<br>- **Storage:** `OpsAlert` holds `id`, `rule`, `dedupKey` (the rule; rule + UTC day for budget rules), `openedAt`, `lastEventAt`, `eventCount`, `lastNotifiedAt`, `notifyStatus` (`SENT`, `FAILED`, `SKIPPED`, `SUPPRESSED`, `NOT_CONFIGURED`, `GAVE_UP`), `notifyAttempts`, `resolvedAt`.<br>- **One open alert per `dedupKey`:** partial unique index where `resolvedAt IS NULL`. Opening is a single `INSERT … ON CONFLICT DO NOTHING RETURNING`, so across instances only the inserter notifies.<br>- **Reminder:** while the alert is open, at most one reminder per 24 h, claimed by one conditional `UPDATE … RETURNING`.<br>- **Auto-resolve:** a windowed alert resolves when it has had no matching event for 6 h (checked inline and daily). Resolution sends nothing.<br>- **Global cap:** at most 10 alert emails per UTC day, counted from `OpsAlert`. Over the cap the status is `SUPPRESSED`. This protects the 100-per-day Resend quota for authentication mail.<br>- **Retries:** a send failure becomes `FAILED`. It is retried by the next evaluation or housekeeping run, at most 3 attempts, then `GAVE_UP`. The page shows every status.<br>- Resolved alerts are kept 90 days.<br>- **Isolation:** nothing in alerting throws into a request, changes a response or delays it. | Exactly-once notification under concurrency, bounded mail volume, honest failure states. | The page is always the fallback channel, whatever F1 decides. |
| O8. **Never-verified purge: eligibility and race safety.**<br>- **Eligible** = `emailVerified = false`, role OWNER, `createdAt` older than **F3**, **no `Puppy` row** and **no unexpired session**. Legacy unverified accounts with data are never purged automatically; the page shows their count for the owner.<br>- **One short transaction per account:** `SELECT … FROM "user" WHERE id = $1 AND <eligibility> FOR UPDATE SKIP LOCKED`. The puppy and session conditions are re-checked under the lock, and a row lost to a concurrent writer is skipped. Then delete, scoped to that user and in this order: `verification` where `value = userId`; `session`; `account`; `IdempotencyKey`; the account's `AiUsageDay` request keys (`deleteRequestUnits`); then `DELETE FROM "user" WHERE id = $1 AND "emailVerified" = false`, which must remove exactly one row, or the transaction rolls back.<br>- **Race behavior:**<br>  - a verification that commits first leaves the account verified and skipped;<br>  - a verification that runs while the purge holds the lock finds no user afterwards, and its session insert fails on the foreign key, so no session and no user remain;<br>  - the purge never waits (`SKIP LOCKED`).<br>- **Batch:** at most 100 accounts per run. The run logs only counts. `account-deletion.ts` is not modified or shared. | Finding 5 and finding 6. A user lock taken first is the same last step as P4-4's lock order. An unverified account without a puppy has no plan, job or attempt rows. | `EmailRateLimit` hashes are a residue pruned within 24 h, as in P4-4. Someone holding an old link after a purge can register again while their address is allowed. README states it. |
| O9. **Purge activation is a separate production approval.** The purge deletes only when the server-only `NEVER_VERIFIED_PURGE` is exactly `on`. Otherwise the step is a dry run: it records the eligible count in the run and shows it on the page. Retention periods are code constants (F2, F3, and the Architect's 30/90-day values), not environment values. | The first production purge deletes real data, so the owner sees the dry-run count before approving it. | Production steps: deploy, review the dry-run count, then a separate approval to set the flag and redeploy. |
| O10. **Daily housekeeping run.**<br>- **Route:** `GET /api/cron/housekeeping`, `force-dynamic`, a bounded `maxDuration`. Vercel Cron in `vercel.json` runs it once per day (proposed `0 1 * * *` UTC, about 03:00-04:59 in Israel).<br>- **Authorization:** `Authorization: Bearer <CRON_SECRET>`, compared in constant time. If `CRON_SECRET` is unset or does not match, the answer is 401, nothing runs and nothing is recorded.<br>- **Steps,** each isolated so a failure does not stop the others: `pruneJobPayloads` (unchanged, now guaranteed daily), `pruneAiUsage` (unchanged), `pruneRateLimits` (unchanged), prune `OpsEvent` (30 days), resolved `OpsAlert` (90 days), `HousekeepingRun` (90 days) and `PilotMetricDay` (F2), the never-verified purge or dry run (O8-O9), write and backfill `PilotMetricDay` (O3), evaluate alerts and retry failed notifications (O6-O7).<br>- **`HousekeepingRun`:** `id`, `trigger`, `startedAt`, `finishedAt`, `stepsJson` with per-step status and counts and an error class only, no messages. A partial unique index allows one unfinished run. An unfinished run older than 15 min is closed as abandoned before a new one starts.<br>- Every step is idempotent and reconciling, so a duplicate or missed delivery is harmless. | Finding 4 and finding 7. The Vercel documentation requires idempotency and a lock. The lock lives in PostgreSQL, so no new service is needed. | One daily function invocation. Cron Jobs are marked legacy: the Manager confirms that a `vercel.json` cron still deploys on Hobby, or names the equivalent Schedules configuration. Either way, no paid feature. |
| O11. **Alert delivery channel = F1.** If F1 is email, a new `sendOpsAlert` uses the existing `deliver` and a new fixed template to the server-only `ALERT_EMAIL`.<br>- **Content:** rule, count, window, threshold, first and last event time, `VERCEL_ENV`, and a link to `/admin/metrics` built from `BETTER_AUTH_URL`. No address, id, error message, stack or request data.<br>- **Shared sender:** delivered only if `ALERT_EMAIL` equals `TESTER_EMAIL`, the only address Resend delivers to. Otherwise `SKIPPED`, with a fixed log line.<br>- **Verified sender (P4-5 active):** any valid address.<br>- **Local outbox:** a file, as for authentication mail.<br>- `ALERT_EMAIL` unset gives `NOT_CONFIGURED` and the page only. | Reuses the one integration the plan assumed (A4). No new service, account or cost. | The authentication-mail gating (P4-5) is not touched. Alert mail is a separate function with a fixed recipient. |
| O12. **Everything else unchanged:** authentication and its configuration, the allowlist (P4-5), account deletion (P4-4) and its dialog, service worker, offline fallback, update flow, shell cache allowlist, progression, generation logic, media, `MEDIA_REQUIRED` (off) and video production (paused). | Scope discipline. | — |

## Constraints / Non-Negotiables
- No personal data in metrics output, snapshots, ops events, alerts, alert mail or logs: no email, name, id, puppy name, profile, exercise content, AI payload, password, token, cookie, IP, user agent or request body.
- First-party only: no third-party analytics, cookies, client-side tracking, beacons or persistent client storage. Metrics need no client code beyond rendering the page.
- Progression invariants unchanged. Metrics and housekeeping read product data. The only product rows they delete are those of eligible never-verified accounts (O8) and the payload columns already covered by B3.
- The 30-day job-payload rule (B3) and the immediate removal on account deletion (P4-4) keep exactly their current meaning and code.
- Every new table enables RLS and revokes `anon` and `authenticated` (`data-api-lock` test).
- Hebrew RTL admin UI from existing components and tokens (Card, Badge, the admin table and `tableWrap`), no charts, no animation. Honest empty states. Axe clean and no overflow at 360, 768 and 1280 px.
- Retention values are code constants recorded in `P4-6`. Changing them is a reviewed code change.

## Technical Boundaries / Out of Scope
- Visit, page-view or session tracking; the "returned without practicing" metric.
- Video-issue metrics (no videos in the pilot).
- An API, CSV export or CLI for metrics; charts; per-account drill-down.
- Purging expired sessions or verification rows of verified accounts (a possible later housekeeping item, not 4.6).
- Pager, SMS, Slack or other third-party alert channels, Vercel log drains or paid observability.
- Any change to authentication, the allowlist, account deletion, the service worker or generation logic.
- 4.7 work (drills, backups, performance) and 4.8 work (devices, usability, report).

## Dependencies and Interfaces

### Expected files (slice 4.6)
- `prisma/schema.prisma` and one additive migration: `OpsEvent`, `OpsAlert`, `HousekeepingRun`, `PilotMetricDay`, their enums and indexes, RLS enabled and `anon`/`authenticated` revoked.
- `src/server/metrics/` (pilot metrics and snapshot schema), `src/server/ops/` (events, alert rules and evaluation, alert mail), `src/server/housekeeping/` (run lease, steps, never-verified purge).
- `src/app/admin/metrics/page.tsx`, and admin navigation and page titles as needed (the layout title currently says "ניהול מדיה").
- `src/app/api/cron/housekeeping/route.ts`; `vercel.json` (`crons`).
- `src/instrumentation.ts` (`onRequestError`, Node.js runtime only).
- Small hooks:
  - the `INTERNAL` branches in `src/server/http.ts`;
  - the delivery-failure branch in `src/server/email/delivery.ts`;
  - `after()` registration in the three generation route files.
- An alert template next to `src/server/email/templates.ts`.
- Tests: `test/integration/` (metrics, ops alerts, housekeeping, never-verified purge, required PostgreSQL concurrency cases added to `scripts/required-pg-tests.json`), unit tests for pure parts, `e2e/admin-metrics.spec.ts`.
- Docs: README, `.env.example`, `docs/DECISIONS.md` `P4-6`, one PRD sentence with the approved retention periods (F2, F3).

### Interfaces
- New server-only environment variables:
  - `CRON_SECRET` (required for the scheduled run);
  - `ALERT_EMAIL` (if F1 is email);
  - `NEVER_VERIFIED_PURGE` (`on` enables deletion).
  None is ever sent to the browser, logged or rendered.
- `GET /api/cron/housekeeping`: bearer-authorized, returns a JSON summary of step statuses and counts only.
- `/admin/metrics`: ADMIN-only server page, 404 for everyone else.

## Data / State Considerations
- **Four additive tables, no change to existing columns.** The 4.5 code ignores them, so the migration can be applied before the deployment.
- **What each table holds:** `OpsEvent` and `OpsAlert` hold codes, counts and times. `HousekeepingRun` holds step statuses and counts. `PilotMetricDay` holds aggregates. None references a user.
- **Retention:**

| Data | Kept | Mechanism |
|---|---|---|
| `GenerationJob.payloadJson` | 30 days (B3, unchanged); deleted with the account (P4-4, unchanged) | existing `pruneJobPayloads`, now daily |
| `AiUsageDay` | 7 days (unchanged) | existing `pruneAiUsage`, now daily |
| `EmailRateLimit` | 24 h (unchanged) | existing `pruneRateLimits`, now daily |
| `OpsEvent` | 30 days | housekeeping |
| `OpsAlert` (resolved) | 90 days | housekeeping |
| `HousekeepingRun` | 90 days | housekeeping |
| `PilotMetricDay` | **365 days (F2)** | housekeeping |
| Never-verified accounts | **14 days (F3)** after creation, then purged (only with `NEVER_VERIFIED_PURGE=on`) | housekeeping (O8-O9) |
| Live metrics | as long as the underlying account data | derived at read time |

## Security / Privacy Considerations
- **Access:**
  - the metrics page is reachable only through `requireAdminOrNotFound`, with the role read from the database;
  - the cron route only with the bearer secret;
  - there is no other entry point.
- **Fixed shapes:** the metrics result and the snapshot schema are fixed. A test serializes both after seeding distinctive strings (email, name, puppy name, profile text, exercise text, payload text) and asserts that none appears.
- **Mail:** alert mail and every new log line use fixed text with codes and counts only.
- **Cron secret:** compared in constant time. Its absence fails closed (401).
- **Purge:** irreversible, so it is gated (O9). Its eligibility excludes any account with data or an active session. A test enumerates every `public` table against the purge (deleted, not user-scoped, or excluded by eligibility), in both directions, as the 4.4 inventory guard does.

## Testing and Lint Expectations
`npm run check` green (typecheck, lint, unit, build). Integration suites green locally, and the required PostgreSQL cases executed and passed in CI. Full e2e green at 360, 768 and 1280 px with axe. Every negative check is recorded and its scratch change restored `cmp`-identical, as in earlier slices.

**Unit**
- Metric math on fixed inputs:
  - the Asia/Jerusalem day boundaries, including a DST change;
  - the day 7-13 window and its denominator;
  - medians with even and odd counts;
  - empty cohorts.
- Alert rule evaluation: thresholds, windows, the once-per-UTC-day keys and the 6 h auto-resolve.
- Snapshot schema: rejects strings and unknown keys.
- Alert template: contains no input except codes, counts, times and the link.
- Cron authorization: unset secret, wrong secret, wrong length and the right secret.

**Integration (PGlite locally, PostgreSQL in CI)**
- **Metrics:**
  - known seeds give exact M1-M6 values;
  - ADMIN accounts are excluded;
  - a deleted account disappears from live metrics but not from an earlier snapshot;
  - the privacy serialization test (above).
- **Page access:** OWNER, unverified, signed-out and revoked-ADMIN requests to `/admin/metrics` get the 404. A current ADMIN gets the page.
- **Ops events:**
  - each `SERVER_ERROR` source records one row;
  - an `AppError` records none;
  - the deleted-account branch records none;
  - a delivery failure records one `AUTH_EMAIL_FAILED`;
  - a recording failure (table unavailable) leaves the original response unchanged.
- **Alerts:**
  - threshold crossing opens one alert and one notification;
  - below the threshold nothing happens;
  - reminder after 24 h only;
  - auto-resolve after 6 h quiet;
  - daily cap gives `SUPPRESSED`;
  - delivery failure gives `FAILED`, then a retry, then `GAVE_UP` after 3;
  - shared sender with a different `ALERT_EMAIL` gives `SKIPPED`;
  - unset gives `NOT_CONFIGURED`;
  - budget warning and exhaustion fire once per UTC day from the real `ai-calls` counter.
- **Housekeeping:**
  - each step's retention boundary (just inside and just outside);
  - payload pruning gives the same result as today;
  - one failing step does not stop the others and records `HOUSEKEEPING_FAILED`;
  - a second run while one is unfinished is refused;
  - an abandoned run older than 15 min is closed;
  - a repeated run is a no-op;
  - snapshot upsert and 7-day backfill.
- **Never-verified purge:**
  - eligible accounts are deleted with all dependent rows;
  - not purged: verified, ADMIN, too recent, has a puppy, has an unexpired session;
  - dry run (flag not `on`) deletes nothing and reports the count;
  - inventory guard in both directions;
  - verifying with an old link after a purge yields no user and no session, and registering again works where allowed.

**Required PostgreSQL concurrency (added to `scripts/required-pg-tests.json`)**
1. A verification `UPDATE` holding the user row (separate connection, uncommitted): the purge skips the account, and after the commit the account stays verified.
2. The purge holding the user row (test seam after the lock), with a real verification request through Better Auth on another connection: after the commit there is no user and no session, and the verification request failed without a 500 storm. The Manager states the exact expected response.
3. 10 concurrent purge invocations over N eligible accounts: each account is deleted exactly once, the deleted counts sum to N, and there are no errors.
4. 10 concurrent alert evaluations over the same threshold crossing: one `OpsAlert` row, one notification.
5. 5 concurrent housekeeping starts: one run executes, the others are refused.
- **Negative checks:** with `SKIP LOCKED` removed, case 1 waits. With the partial unique index on open alerts removed, case 4 sends more than one notification. Both are restored afterwards.

**E2E (`e2e/admin-metrics.spec.ts` and existing suites)**
- An ADMIN opens `/admin/metrics` and sees seeded aggregates, an empty-state variant, an open alert and the housekeeping section. `expectHealthyPage` passes at 360, 768 and 1280 px, with keyboard focus order and no overflow from the tables.
- An OWNER gets the 404.
- Triggering a local generation failure three times (the fake generator in `fail` mode) opens an alert, and the local outbox receives one alert file with no personal data.
- The existing suites (auth, account deletion, PWA, offline) pass unchanged.

## Functional Testability
- Page/screen the user can open: `/admin/metrics` as ADMIN (local, seeded).
- User-visible behavior: aggregate funnel, practice, return, difficulty, mastery and generation numbers with denominators; open alerts with their notification status; last housekeeping run; eligible never-verified count and whether the purge is enabled.
- Command-line flow: `curl -H "Authorization: Bearer <local test secret>" http://localhost:3000/api/cron/housekeeping` returns the step summary. Without the header it returns 401.
- Minimal end-to-end flow: force three local generation failures and see one alert on the page and one alert file in the local outbox. Seed an unverified account older than F3, run housekeeping with the flag off (counted, kept), then on (deleted, dependent rows gone).
- Expected observable result: as above, with no personal data in the page source, the outbox file or the logs.

## Handoff Notes for Manager
- Base the branch on `main` `265f006`, in a new branch and worktree. Bring over the updated artifacts from the shared folder byte for byte.
- **Verify against current official docs and name the exact APIs:**
  - Next.js 16.4.3 `after()` and `onRequestError`;
  - the `vercel.json` cron (or Schedules) configuration on Hobby;
  - Better Auth 1.7.14 `verify-email` behavior when the user row is gone, which sets the expected response in concurrency case 2;
  - whether PGlite supports `AT TIME ZONE 'Asia/Jerusalem'`. If not, compute days in TypeScript with the same results.
- **Define in the design:**
  - the exact metric SQL;
  - the snapshot schema;
  - the OpsEvent sources;
  - the after-response wiring in the three generation routes;
  - the housekeeping step order and bounds;
  - the purge seam;
  - the page layout from existing components.
- **Hold to:** no change to the files listed in O5 and O12 beyond the named hooks.
- **Production actions are not part of implementation.** List them for the owner in the order of "Production actions (slice 4.6)".

## Owner Decisions (slice 4.6)
**Approved by the owner on 2026-11-17, all three as recommended.** The approval sets the values below. It does not authorize the migration, any environment variable (`CRON_SECRET`, `ALERT_EMAIL`, `NEVER_VERIFIED_PURGE`), the merge, the deployment or any purge of real accounts; those remain the separate steps of "Production actions (slice 4.6)".
- **F1:** email through Resend to the server-only `ALERT_EMAIL`, with `/admin/metrics` as the fallback (O11).
- **F2:** `PilotMetricDay` snapshots kept **365 days**.
- **F3:** never-verified accounts purged **14 days** after creation, once `NEVER_VERIFIED_PURGE=on` is separately approved.

| # | Decision | Recommendation (approved) | Alternatives (not chosen) |
|---|---|---|---|
| F1 | **Alert channel** | Email through the existing Resend integration to a server-only `ALERT_EMAIL`, with the `/admin/metrics` page as the fallback. While the shared sender is in use, `ALERT_EMAIL` must be the Resend account address (`TESTER_EMAIL`). No cost. At most 10 alert emails a day, within the free quota shared with authentication mail. | (b) Page only: no push, the owner must look. (c) A third-party channel: a new account and data processor, possible cost, out of the plan's "no new services". |
| F2 | **Analytics retention** (`PilotMetricDay` aggregate snapshots; live metrics simply follow the account data) | **365 days.** Snapshots hold no personal data, and a year covers the pilot, the 4.8 report and the Phase 5 launch decision. | 180 days; or until 90 days after the pilot results report. |
| F3 | **Never-verified account retention** (after creation; then purged, once `NEVER_VERIFIED_PURGE=on` is separately approved) | **14 days.** The link lasts 1 h and can be re-sent at any time, so 14 days leaves ample time. After a purge the person can simply register again while their address is allowed. | 7 days (less data kept); 30 days (more forgiving). |

## Production actions (slice 4.6)
None is authorized by this contract. Each is a separate owner approval, in this order, after the code is approved:
1. Apply the additive migration with `prisma migrate deploy` by hand (never in the build). It is backward compatible with the 4.5 code.
2. Set `CRON_SECRET` (random, at least 16 header-safe characters) and, if F1 is email, `ALERT_EMAIL`, for Production.
3. Merge and deploy. The deployment registers the daily cron (production only). After the first run, check the cron log and the page.
4. Review the dry-run count of eligible never-verified accounts on the page. Then a separate approval to set `NEVER_VERIFIED_PURGE=on` and redeploy. From then on, purged accounts cannot be restored.

Costs: none expected. One function invocation a day on Hobby; a few small tables on the Supabase free tier; alert mail within the Resend free quota. Rollback: deploy the previous release (`265f006`, `dpl_Akza3ACdCrzeBDg4GdKPh38tvwuG`). Its cron definitions (none) come back with an Instant Rollback, and the additive tables can stay. A purge is not undone by a rollback.

## Architect Review
ARCHITECT_REVIEW_STATUS: APPROVED

### Review Notes
Final review of slice 4.6 revision 1, 2026-11-18.

**What was reviewed:**
- Commits `a965abf..51592f0` on `b3000b3`, branch `feature/phase-4-ops-housekeeping`, worktree `C:\Users\אוהד\Documents\Woffiz-4.6`. Not pushed.
- `manager-phase4.md` (shared folder): MANAGER_REVIEW_STATUS APPROVED, 2026-11-18.
- The top "4.6" section of `dev-phase4.md` in the worktree.

**What the approval covers:** the architecture, the code and the local evidence. The CI-only items are merge conditions (C1-C4 below), not results.

**Architect spot-checks** (reading only; no tests run, per A3):
- **Scope:**
  - `git diff 265f006 --name-only` over `jobs.ts`, `quota.ts`, `onboarding.ts`, `revision.ts`, `account-deletion.ts`, `auth.ts`, `public/sw.js`, `progress.ts`, `package.json` and `package-lock.json` is empty.
  - `git diff --stat b3000b3..51592f0`: 64 files, all within M1-M8, G7/G8 or the test helpers.
  - `vercel.json` adds only `crons`.
- **O4 hooks** (`http.ts`, `delivery.ts`, `instrumentation.ts`, the three generation routes):
  - each adds only a deferred record/evaluate call;
  - responses, schemas, handlers and `maxDuration` are unchanged;
  - `AppError` and the deleted-account branch return before the hook;
  - `onRequestError` is limited to Node.js, filters control-flow digests and imports the ops module dynamically.
- **O8/O9 purge** (`housekeeping/never-verified.ts`):
  - eligibility, `FOR UPDATE OF u SKIP LOCKED`, and the re-check of puppy and session under the lock all match;
  - the delete order matches O8, including `deleteRequestUnits`;
  - the final user `DELETE … AND "emailVerified" = false` must return exactly 1, otherwise the transaction rolls back;
  - deletion requires `NEVER_VERIFIED_PURGE === 'on'` at call time;
  - `account-deletion.ts` is not imported;
  - the log line holds counts only.
- **O10 route:**
  - `authorizeCron` compares SHA-256 digests with `timingSafeEqual` and fails closed on an unset or empty secret;
  - the route sets `force-dynamic` and `maxDuration = 60`, and every answer is `private, no-store`.
- **O6/O7 rules:** thresholds 3/2/3 in 60 min, 6 h quiet resolve, 24 h reminder, 3 attempts, 10 mails per UTC day, and per-UTC-day budget keys all match.
- **Migration:**
  - one additive migration with `OpsAlert_one_open_per_key` and `HousekeepingRun_one_unfinished`;
  - the RLS and revoke block is present;
  - no existing migration is changed.
- **Required list:** `required-pg-tests.json` names the five cases. The test file holds them under the standard-PostgreSQL `describe`, and case 2 prints the `[case 2] …` line.

**Rulings on the Manager refinements G1-G10:**
- **G1: accepted, as an amendment of O5.** O5's literal code list would miss the most common failure (`provider …`). The alert set is every `FAILED` job except `quota-account` and `quota-calls`. `STALE` and `REJECTED` stay non-alerting, and `quota-calls` belongs to the budget rule. This follows O5's intent.
- **G2: accepted.** The real `fail`-mode flow through the three routes is proven in integration. The e2e seeds failures, so a shared server mode cannot break parallel specs.
- **G3: accepted.** It defines "stalled" (at least 7 days on the current level), which O2 left open.
- **G4: accepted.** It defines the nested funnel and the M2-M5 cohort. Legacy unverified accounts are counted on the housekeeping block.
- **G5: accepted, with one clarification.** As designed (Manager plan) and implemented, the event insert itself runs inside `runAfterResponse`. Outside a request scope with no test sink, the event is therefore dropped as well, not "already written". This loss cannot occur in production:
  - every hook site runs inside a request scope;
  - `onRequestError` awaits directly.

  Deferring the insert is stricter than O4's "one insert on the error branch", because the failing response is not delayed at all.
- **G6: accepted.** The expected result of case 2 is `500`, an empty body, no session-token cookie, no user row and no session row. It must be observed in CI (C2).
- **G7: accepted.**
  - `transport.ts`: type only.
  - `config.ts`: one additive `verifiedSender`.
  - `playwright.config.ts` and `test/integration/setup.ts`: test infrastructure.
- **G8: accepted.** The new class `'operational, not linked to an account'` is correct: the four tables hold no user id.
- **G9: accepted.** Vercel Cron Jobs, not Schedules. Two rules carry forward:
  - a later move to Schedules is a configuration change only;
  - `crons` and `schedules` must never both be present, or the route runs twice.
- **G10: accepted as a known coverage gap.** These are not alert sources:
  - the account-deletion route's own `INTERNAL` branch;
  - Better Auth's internal 500s;
  - client-side errors.

  This follows O4/O12 and is documented in the README. Closing it would need changes to files that 4.6 protects, so it is not a 4.6 item.

**Rulings on the ten Developer interpretations** (all accepted by the Manager):
1. **Accepted.** Legacy unverified owners count in M6 (Q4 as designed). Such accounts cannot sign in, so in practice they add no jobs. No `P4-6` change is required.
2. **Accepted.** Timestamps passed as `::timestamptz AT TIME ZONE 'UTC'` give the same instant as a `Date`, consistent with V6.
3. **Accepted.** The inclusive boundaries (retry at 5 min, reminder at 24 h) do not affect the cap or the exactly-once claim.
4. **Accepted.** The sweep claims a never-claimed first notification, which closes the case of an opener dying between insert and claim. The conditional claim keeps it exactly once. `now` is a test-only parameter.
5. **Accepted.** The refreshed `eventCount` is informational only.
6. **Accepted.** `snapshots = 1` on a repeated run is the specified idempotent upsert of Israel yesterday.
7. **Accepted.** The run lease uses `ON CONFLICT DO NOTHING RETURNING` on `HousekeepingRun_one_unfinished`. The meaning is the same as O10, without an exception path.
8. **Accepted.** The log lines carry codes and counts only.
9. **Accepted.** The extra files:
   - the `nav.row > a` rule: 44 px target, current link marked by weight, no new token;
   - the reset list;
   - the test helpers;
   - `reset-ops`, limited to its own `e2e-ops-` jobs;
   - `test.slow()`.
10. **Accepted.** The extra assertion in the 4.4 inventory guard strengthens it and changes no classification.

**Manager observations:**
- **(a): accepted as a known limitation.** A sender that dies after claiming attempt 3 leaves that alert silent until it resolves. Every rule resolves (6 h quiet, the next UTC day, or the next ok run). Recorded in `plan.md` as a follow-up, to be fixed when the alert module is next changed: a null status at attempt 3 older than 5 min becomes `GAVE_UP`.
- **(b): accepted.** A `P2028` or a `302` in CI case 2 is a test-timing failure. It is diagnosed before any further push. `auth.ts` is never changed for it.
- **(c): outside 4.6; an owner decision.** `next build` sometimes stops with a Next.js `SecurityFatalError` notice.
  - **The notice's own instructions are not acted on.** It contains instructions addressed to an automated agent, which is build output, not an approved request. No role ran the upgrade command it suggests.
  - **Public sources:** secondary sources report a Next.js security release of 2026-11-03 with patched versions 16.4.5 and 15.5.29. One reported advisory range (16.3.0-16.4.4) would include the installed 16.4.3. This is not yet verified against the official advisory.
  - **Production exposure:** production (4.5, `265f006`) runs 16.4.3 today, so the exposure is independent of 4.6.
  - **Recommendation (not approved):** one separate, dependency-only change from `main`. It moves `next` 16.4.3 to the patched 16.4.x after the Manager verifies the version against the official Next.js advisory. It has its own branch, CI and deployment approval, preferably before the pilot opens, and is never combined with 4.6.
  - **If CI's build stops on the same notice,** C1 fails. That failure is diagnosed, not re-run blindly.

**Criteria status:**
- **Met locally** (Manager criteria): 1-4 and 7-10.
- **Pending CI:** 5, 6 and 11 (conditions C1-C3).

### Required Corrections
None.

**Merge conditions** (they come after an owner-approved push; this review authorizes no push):
- **C1:** the three artifacts are copied byte for byte from the shared folder and committed in the worktree. Then a fresh first-attempt CI run of build, unit, integration and e2e is green, including the line "All 39 required PostgreSQL tests executed and passed".
- **C2:** the CI log line `[case 2] …` shows `status=500 body-length=0` and no session-token cookie, and the test's row assertions pass. Anything else: the Developer stops and reports; `auth.ts` is untouched.
- **C3:** N1 (without `SKIP LOCKED`, case 1 exceeds its bound) and N2 (without `OpsAlert_one_open_per_key`, case 4 sends more than one notification) both fail as intended on CI's standard PostgreSQL. They run from a scratch branch or commit that is never merged, with its own owner-approved push, and are recorded with restore proof.
- **C4:** the CI results are in the PR description. A new failure reopens this review.

**Not authorized by this review:**
- the migration in production;
- `CRON_SECRET`, `ALERT_EMAIL` or `NEVER_VERIFIED_PURGE` in any hosted environment;
- the push, the merge or the deployment;
- any purge of real accounts.

These remain the separate steps of "Production actions (slice 4.6)", in that order.

---

## Slice 4.5 record (APPROVED, merged in `265f006`; closed, not reopened)
The text below is the slice 4.5 contract, its corrective scope and its final Architect review exactly as approved, with headings demoted one level and its status lines qualified as slice 4.5. The release record comes first.

### Release record (2026-11-17)
- PR #8 merged: approved head `2b4f0ae`, merge commit `265f006` on `main`. Production deployment `dpl_Akza3ACdCrzeBDg4GdKPh38tvwuG`.
- CI on `main`, first attempt, green: build; 340 unit tests; 225 integration tests passed, 1 skipped; "All 34 required PostgreSQL tests executed and passed"; 235 e2e tests passed. C1 is met.
- Public post-deploy checks passed. **PENDING:** the production sign-up check expecting `403 SIGN_UP_RESTRICTED` was not run (the permission system blocked it). It must be run before the pilot opens.
- No production environment variable changed. Registration stays tester-only and the pilot is not open.
- Rollback target: `0b18ee2`, deployment `dpl_6kx6RtfQTw6D84p2JJuRL1w9XJ9Z`.

### Status
STATUS (slice 4.5): APPROVED

Slice 4.5 approved in final review on 2026-11-15 (see "Architect Review"). **Merge blocked:** C1 failed on PR #8 head `00fc050` (an e2e axe timing race in the 4.4 dialog tests). The test-only correction R1 is required before a new push (see "C1 failure and corrective scope"). R1 scope confirmed by the Architect on 2026-11-16 (see "R1 scope confirmation"); C1 still requires a green fresh CI run after an owner-approved push.

Owner decisions recorded on 2026-11-14: E1 resolved as an explicit `EMAIL_SENDER_VERIFIED` flag (P1), and P4/P5 revised so that removal from the list blocks only new registration. No production environment change is authorized.

Revision for **slice 4.5** (pilot access allowlist), 2026-11-14. Slices 4.2 (`7bc45f8`), 4.3 (`ad6b55a`) and 4.4 (`0b18ee2`, PR #7) are approved, merged and deployed. Their contracts and final reviews are kept below as closed records and are not reopened.

### Phase Goal
Deliver the remaining ROADMAP Phase 4 work as the ordered slices of `team-Yuri/plan.md`. 4.1-4.4 are done. This revision details **slice 4.5 only**; 4.6-4.8 get their own contract later.

**Slice 4.5 goal:** the server can admit a fixed list of pilot owners to registration through a server-only `PILOT_EMAILS` allowlist, next to `TESTER_EMAIL`.
- Sign-in for existing accounts is unchanged.
- Addresses not on the list get the same neutral Hebrew answer as today, with no account enumeration.
- New access is granted only through the registration gate. Mail about an existing account (password reset, verification re-send) is not blocked by later removal from the list, as long as the provider can deliver it (P4).
- **The allowlist is inert unless the owner has set `EMAIL_SENDER_VERIFIED=true` and `EMAIL_FROM` is outside `resend.dev`**, so the pilot cannot open by accident before the sending domain is verified and tested (P1).
- Locally, with the outbox transport, the allowlist is fully testable without Resend.

### Source References
- `team-Yuri/plan.md` (APPROVED). Slice 4.5, and owner decision 3: "Pilot access is a server-side email allowlist now; a verified sending domain comes later. Opening the pilot to non-tester addresses is blocked until the owner has a domain verified in Resend."
- PRD.md §1 (test phase limited to one tester address; registration and authentication mail) and §10 (server-only secrets).
- README "Email" and "Deployment": the shared `onboarding@resend.dev` sender only delivers to the Resend account's own address; production variables; the "a verified sending domain is needed before anyone else can register" note.
- Code baseline `origin/main` `0b18ee2`, read-only:
  - `src/server/email/config.ts`: `emailTransport`, `signUpPolicy` (`closed | tester | open`), `signUpAllowedFor`, `normalizeEmail` (trim + lower-case), `EMAIL_SHAPE`;
  - `src/server/email/delivery.ts`: `sendAuthEmail` delivers on Resend only to `TESTER_EMAIL`, otherwise logs and returns neutrally; `guardEmailRequest`: per-IP and per-address limits and a 1 s minimum response time;
  - `src/server/auth.ts`: the `policy` constant read at module load; `disableSignUp` when closed; the `before` hook on `/sign-up/email` throws `SIGN_UP_RESTRICTED`; `databaseHooks.user.create.before` as the second line of defense; `onExistingUserSignUp` re-sends verification to unverified accounts;
  - `src/server/local-mode.ts`: `isLocalMachine`, `signUpEnabled`;
  - `src/app/page.tsx` passes `signUpPolicy().kind` to `AuthForm`;
  - `src/components/auth/AuthForm.tsx` (`SignUpMode = 'closed' | 'tester' | 'open'`) and `messages.ts` (`SIGN_UP_RESTRICTED`: "בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות.");
  - `test/integration/email-auth.test.ts` (tester-phase suite), `src/server/email/config.test.ts`;
  - `.env.example`.

### Current-state findings that shape the design
1. Registration and mail share one decision: `emailTransport()` gives `resend` only when `TESTER_EMAIL` is set, and `sendAuthEmail` refuses every other recipient on Resend. **Admitting an address to registration without also admitting it to delivery would create accounts that can never be verified.** Delivery must therefore cover every allowed address, and, per the owner (P4), existing accounts as well.
2. The shared `onboarding@resend.dev` sender delivers only to the Resend account's own address. On that sender a pilot address can register but never receive its verification link. So the allowlist has a meaning only once `EMAIL_FROM` uses another, verified domain.
3. The policy is computed once per server instance (`const policy = signUpPolicy()` in `auth.ts`), and Vercel applies environment changes only to new deployments. **Changing `PILOT_EMAILS` in production therefore requires a redeploy.**
4. The non-allowed answer today is an explicit `403 SIGN_UP_RESTRICTED` with the Hebrew line above. It reveals whether an address may register, but never whether an account exists. The owner asked to keep this ("as today").
5. `onExistingUserSignUp` re-sends verification for an unverified account. A person who never verified is therefore not locked out: registering again, while still allowed, re-sends the link.

### Architectural Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| P1. **Activation rule (owner decision E1, 2026-11-14).** New server-only variable **`EMAIL_SENDER_VERIFIED`**, default false. Only the exact value `true` (after trim, case-insensitive) counts as true; anything else is false. On the Resend transport, `PILOT_EMAILS` is honored **only when both** `EMAIL_SENDER_VERIFIED` is true **and** the sender address in `EMAIL_FROM` is outside the shared `resend.dev` domain. If either condition is missing, the list is ignored, the policy stays tester-only, and one warning is logged per process (which condition failed and a count, no addresses). **Local exception (interpretation, flagged):** on the local outbox transport (local machine only, nothing leaves the machine), the list is honored without the flag, so the pilot policy is testable. Production never uses the outbox transport. | Two independent deliberate signals. The flag records the owner's confirmation; the domain check guards against a flag set while the shared sender is still configured. | The owner opens the pilot with deliberate production changes, each a separate approval and followed by a redeploy, in this order:<br>(1) verify the sending domain in Resend;<br>(2) a successful delivery test;<br>(3) switch `EMAIL_FROM` to that domain;<br>(4) set `EMAIL_SENDER_VERIFIED=true`;<br>(5) set `PILOT_EMAILS`.<br>Nothing is authorized now. |
| P2. **Policy shape.** `SignUpPolicy` gains `{ kind: 'pilot', tester: string \| null, emails: ReadonlySet<string> }`; the existing `closed`, `tester` and `open` keep their meaning. Priority:<br>(1) local outbox with `LOCAL_SIGNUP=true` gives `open` (unchanged);<br>(2) a valid allowlist that is active under P1 (Resend: flag true and sender outside `resend.dev`; or the local outbox) gives `pilot`;<br>(3) Resend with `TESTER_EMAIL` gives `tester` (unchanged);<br>(4) otherwise `closed`.<br>In `pilot`, an address may register if it equals `TESTER_EMAIL` (when set) or is in `emails`. | Minimal change to the one decision point. Better Auth's `disableSignUp` stays `kind === 'closed'`. | Every consumer (`auth.ts` hook, database hook, delivery, the welcome page) asks one function, `signUpAllowedFor`. |
| P3. **Parsing `PILOT_EMAILS` (fixed rules, no owner decision needed).**<br>- Separators: commas, semicolons and any whitespace, including newlines; empty items are dropped.<br>- Each entry goes through `normalizeEmail` (trim, lower-case) and must match the existing `EMAIL_SHAPE` **and** be printable ASCII. No provider-specific folding (no Gmail dot or `+tag` removal): match is exact after lower-casing, so a `+tag` address must be listed as such.<br>- Duplicates are removed.<br>- **Limit: at most 200 distinct entries** (the pilot targets 20-30 owners) and at most 16 KB raw.<br>- **Fail closed:** if any entry is malformed, or a limit is exceeded, the whole list is ignored and the policy falls back to rule (3)/(4), with one warning per process logged (counts only).<br>- An empty or unset variable gives no allowlist. | A typo must never silently admit or drop someone. Ignoring the whole list is visible: no pilot address can register, and the log says why. ASCII-only avoids homograph look-alikes. | Pure, unit-tested parser. The owner corrects the list and redeploys. |
| P4. **Delivery (revised by the owner, 2026-11-14).** The registration gate decides who gets an account; delivery decides who gets mail.<br>- **Shared sender** (tester mode, `resend.dev` or flag false): unchanged. Mail goes only to `TESTER_EMAIL`, the provider's own limit.<br>- **Verified sender** (P1 active): `sendAuthEmail` delivers to an address that is allowed by `signUpAllowedFor` **or belongs to an existing account** (checked server-side by the normalized email). This covers password reset, verification re-send and account recovery for accounts whose address was later removed from `PILOT_EMAILS`.<br>- Any other recipient is skipped with the existing neutral log line (no address).<br>- Outbox: unchanged. | Removing someone from the list must stop new registrations, not lock an existing owner out of recovery. Every mail path already concerns an existing user row: sign-up creates the row only after the gate, and reset and re-send require an account. The extra account check keeps arbitrary addresses unreachable even if a future caller passes one. | No enumeration change. Better Auth's reset and re-send answer generically whether or not the account exists, and `guardEmailRequest` keeps its 1 s floor and limits. The account lookup happens inside the send path, under that floor. |
| P5. **Sign-in and recovery unchanged.** The allowlist is consulted only when an account is created. Existing accounts, including those whose address was later removed from the list, sign in, reset their password and re-send verification as before, whenever the provider permits delivery (P4). Removal from the list blocks only new registration of that address. Revoking an existing account's access is out of scope; the person can delete their account (4.4). | Owner decision 2026-11-14. No lock-outs mid-pilot. | Documented in README. |
| P6. **No enumeration; neutral copy kept.** Non-allowed addresses get today's answer: the `before` hook's `403 SIGN_UP_RESTRICTED`, shown as "בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות.", with the same timing floor from `guardEmailRequest`. Existing-account behavior (generic success, re-send only for unverified) is unchanged. `AuthForm` treats `pilot` exactly like `tester`: same restricted-registration line, no list contents, no count. | "As today" (finding 4). The answer reveals list membership only, never account existence, as the tester gate already does. | `SignUpMode` gains `pilot` with the tester copy; no new Hebrew strings unless the Manager finds the tester line inaccurate for `pilot`. |
| P7. **No migration, no new storage, no new dependency.** The list lives only in the server environment and is never sent to the client, logged or rendered. | Scope and privacy. A database-backed or admin-editable list is a later option, not 4.5. | The release is code-only. The production variable is a separate owner approval. |
| P8. **Never-verified accounts follow-up goes to 4.6, not 4.5.** Purging accounts that never verified is a scheduled retention job with a retention period (an owner decision), next to the existing 30-day payload pruning and the analytics retention that 4.6 must decide anyway. 4.5 changes nothing for them: they are not locked out (finding 5, and under P4 the verification re-send for an existing account is delivered even after removal from the list). | 4.5 stays a pure gate change. Purging is deletion of personal data and needs its own contract and retention decision. | Recorded in plan.md as a 4.6 item. 4.5's README states that unverified accounts are not purged yet. |
| P9. **Everything else unchanged:** service worker, offline fallback, owner-activated update, shell allowlist, account deletion (4.4), progression, media, `MEDIA_REQUIRED` (off) and video production (paused). | Scope discipline. | — |

### Constraints / Non-Negotiables
- `PILOT_EMAILS` is server-only. It never appears in client bundles, responses, logs or the UI, and it is never committed with real addresses (only empty or `example.test` values in `.env.example` and tests).
- The pilot cannot open unless `EMAIL_SENDER_VERIFIED` is true **and** the sender is outside `resend.dev` (P1). Both default to closed. No production environment variable is added or changed as part of implementation.
- Fail closed on any malformed or oversized list (P3).
- No enumeration of accounts (P6). Existing timing and rate limits unchanged.
- No migration, no dependency, no change to the 4.2-4.4 behavior.
- Real addresses are never used in tests. Only `*.test` / `example.test` addresses.

### Technical Boundaries / Out of Scope
- Configuring or verifying the Resend sending domain, the delivery test, and changing production `EMAIL_FROM`, `EMAIL_SENDER_VERIFIED` or `PILOT_EMAILS` (owner actions, each a separate approval).
- An admin UI or database table for the list; invitations or invite links; per-address expiry; revoking access of existing accounts.
- Purging never-verified accounts (4.6, P8).
- Analytics and alerts (4.6), drills (4.7), device matrix and usability (4.8).

### Dependencies and Interfaces

#### Expected files (slice 4.5)
Modified:
- `src/server/email/config.ts`: the `pilot` policy, the parser (P3) and the activation rule (P1); `signUpAllowedFor` for `pilot`.
- `src/server/email/delivery.ts`: P4 (revised): tester-only on the shared sender; allowed-or-existing-account on the verified sender.
- `src/server/auth.ts`: only if needed so that the hook and the database hook use the extended policy. No other Better Auth configuration change.
- `src/components/auth/AuthForm.tsx` (`SignUpMode` gains `pilot`); `src/app/page.tsx` only if the type requires it.
- `src/server/email/config.test.ts`: the parser and policy matrix.
- `test/integration/email-auth.test.ts`, or a sibling file: direct sign-up API calls under the pilot policy.
- `.env.example`: documented `EMAIL_SENDER_VERIFIED="false"` and `PILOT_EMAILS=""`, with the rules and an `example.test` sample.
- `README.md`: the "Email" table and the "Deployment" notes, plus an "Opening the pilot" checklist (owner steps, each a separate approval).
- `docs/DECISIONS.md` `P4-5`; `team-Yuri/plan.md` (Architect: the follow-up moved to 4.6).

Not touched: `prisma/`, `public/sw.js`, `public/offline.html`, `next.config.ts`, the account-deletion code, media code, `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`.

#### Interfaces
- Environment: `EMAIL_SENDER_VERIFIED` (server-only, optional, default false; only `true` enables). `PILOT_EMAILS` (server-only, optional). Grammar: entries separated by `,`, `;` or whitespace; each a valid ASCII email; at most 200 distinct entries; at most 16 KB.
- No new HTTP route. `POST /api/auth/sign-up/email` behavior per policy:
  - allowed new address: generic success, verification mail sent;
  - allowed existing address: generic success, re-send only if unverified (unchanged);
  - not allowed: `403 SIGN_UP_RESTRICTED`, no mail, no row.

### Data / State Considerations
- No schema change, no migration.
- The list is read once per server instance (finding 3). A change takes effect on the next deployment.
- No personal data is stored beyond what registration already stores.

### Security / Privacy Considerations
- Two independent enforcement points stay in place (the `before` hook and `databaseHooks.user.create.before`), both through `signUpAllowedFor`. Direct API calls are covered by the same code.
- Mail reaches only the tester on the shared sender. On the verified sender it reaches allowed addresses and existing accounts only (P4). The pilot cannot open without the explicit flag and a non-`resend.dev` sender (P1).
- Logs carry counts and fixed text only, never addresses or the list.
- Membership disclosure (the 403 tells a caller whether an address may register) is accepted "as today". It never reveals account existence.

### Testing and Lint Expectations
Automated (Developer, recorded in `dev-phase4.md`):
- `npm run check` passes.
- **Unit (`config.test.ts`), parser:**
  - comma, semicolon, space, tab and newline separators;
  - mixed case and surrounding whitespace normalize;
  - duplicates collapse;
  - `+tag` kept exactly;
  - each of these makes the whole list ignored: a malformed entry, a non-ASCII entry, 201 distinct entries, more than 16 KB;
  - empty and unset give no list.
- **Unit (`config.test.ts`), policy matrix:**
  - Resend with the shared `resend.dev` sender plus `PILOT_EMAILS`, with the flag false **and** with the flag true, gives `tester` (list ignored);
  - Resend with a non-`resend.dev` sender plus a valid list and the flag unset, false, `1` or `yes` gives `tester`;
  - Resend with a non-`resend.dev` sender plus a valid list and `EMAIL_SENDER_VERIFIED=true` (also ` TRUE `) gives `pilot`;
  - the same with an invalid list gives `tester`;
  - Resend without `TESTER_EMAIL` keeps today's behavior unchanged;
  - local outbox plus `LOCAL_SIGNUP=true` gives `open`;
  - local outbox plus a valid list (no `LOCAL_SIGNUP`) gives `pilot`;
  - outbox off the local machine gives `none`/`closed`;
  - `signUpAllowedFor` covers the tester, a listed address (case-insensitive), an unlisted address and a non-string.
- **Integration (direct `POST /api/auth/sign-up/email` against a policy built from a test environment; the Manager chooses how to build that instance without changing production configuration):**
  - a listed address registers and gets exactly one verification message;
  - the tester address registers;
  - an unlisted address gets `403 SIGN_UP_RESTRICTED`, no `user` row and no message;
  - the same three under the shared sender: only the tester is admitted;
  - the database hook alone refuses an unlisted address when the route hook is bypassed;
  - delivery on the verified sender: an existing account whose address was removed from the list still receives its password-reset mail and a verification re-send, and still signs in (P4, P5);
  - its new registration is refused;
  - delivery to an address with no account and not on the list sends nothing and answers neutrally;
  - on the shared sender, only the tester receives mail (unchanged);
  - the timing floor and rate limits are unchanged.
- E2E: the existing suites stay green (the e2e server keeps the `open` policy). No `playwright.config.ts` change.
- CI green on the final head, as before. No new PostgreSQL-only test is expected.

### Functional Testability
- Command-line flow: run the local production build with the outbox transport (P1 local exception, no flag needed), `PILOT_EMAILS="pilot1@example.test"` and without `LOCAL_SIGNUP`. Registering `pilot1@example.test` writes a verification message to the outbox. Registering `other@example.test` shows "בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות." and writes nothing.
- API: the same through `POST /api/auth/sign-up/email`.
- Page: `/` (registration form) in pilot mode shows the restricted-registration line.
- Expected result: as above, asserted by integration tests and recorded once manually in the evidence.

### Handoff Notes for Manager
- Detail slice 4.5 only. Base `main` `0b18ee2`, new branch and worktree. Bring over the updated artifacts from the shared folder.
- Apply E1 as decided by the owner: `EMAIL_SENDER_VERIFIED` (default false) **and** a sender outside `resend.dev` (P1); P4 and P5 as revised. The local-outbox exception in P1 is an Architect interpretation for testability; keep it local-only.
- Confirm how a test can build a Better Auth instance with a pilot policy without changing production `auth.ts` behavior. A small factory is acceptable if the default export behaves identically.
- Verify the Resend sender rule against current Resend documentation: the shared `resend.dev` sender delivers only to the account's own address.
- Production `EMAIL_FROM`, `EMAIL_SENDER_VERIFIED` and `PILOT_EMAILS` changes are owner actions with separate approvals, in the P1 order (domain verified, delivery test, sender, flag, list) with a redeploy. The README "Opening the pilot" checklist lists them.

### Owner Decisions (slice 4.5)

Resolved by the owner on 2026-11-14:

| # | Decision | Owner decision |
|---|---|---|
| E1 | What activates the allowlist on Resend | **Explicit `EMAIL_SENDER_VERIFIED=true`, default false**, and `EMAIL_FROM` outside `resend.dev`; both required (P1). The production flag is set only after the sending domain is verified in Resend and a delivery test succeeds. |
| E2 | Effect of removing an existing account's address from `PILOT_EMAILS` | **Blocks new registration only.** Password reset and account recovery continue whenever the provider permits delivery (P4, P5 revised). |

Recorded, not blocking:
- **Adding or changing any production environment variable** (`EMAIL_FROM`, `EMAIL_SENDER_VERIFIED`, `PILOT_EMAILS`) is a separate owner approval each time, followed by a redeploy. **No production environment change is authorized now.** Implementing 4.5 changes no production variable.
- **No migration** in 4.5.
- **Never-verified accounts follow-up: assigned to 4.6** (P8). Its retention period is an owner decision there.
- The open plan.md decision "sending domain" remains the owner's action that actually opens the pilot. "Alert channel", "backups", "pilot recruitment" and "performance profile" do not affect 4.5.

### Architect Review
ARCHITECT_REVIEW_STATUS: APPROVED

Current revision: slice 4.5. The final reviews of slices 4.4, 4.3 and 4.2 are in the closed records below.

#### Review Notes
Final review of slice 4.5, 2026-11-15.
- Inputs: `team-Yuri/manager-phase4.md` ("Manager Review", MANAGER_REVIEW_STATUS: APPROVED, no corrections; shared folder) and the 4.5 section of `team-Yuri/dev-phase4.md` (committed in the worktree).
- Branch `feature/phase-4-pilot-allowlist`, HEAD `6e3ae38`, base `0b18ee2` (unchanged on the remote), worktree `C:\Users\אוהד\Documents\Woffiz-4.5`. Local only: not on the remote, no PR, no CI run yet.
- Read with git: the full diffs of `src/server/email/config.ts`, `src/server/email/delivery.ts`, `src/components/auth/AuthForm.tsx` and `.env.example`, plus the evidence. Tests were not re-run by the Architect.

**Scope.**
- Outside `team-Yuri/`, the diff touches exactly `.env.example`, `README.md`, `docs/DECISIONS.md` (`P4-5`), `AuthForm.tsx`, `config.ts`, `config.test.ts`, `delivery.ts` and the new `test/integration/pilot-allowlist.test.ts`.
- Not touched: `src/server/auth.ts`, `src/app/page.tsx`, `prisma/`, `public/`, `next.config.ts`, `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`, `DESIGN_SYSTEM.md`.
- No migration, no dependency.

**Compliance with P1-P9 and E1-E2:**

| Decision | Verdict | Evidence |
|---|---|---|
| P1 / E1 Activation | Compliant | On Resend, the list counts only when `EMAIL_SENDER_VERIFIED` trims and lower-cases to exactly `true` **and** `isSharedSender(EMAIL_FROM)` is false (`resend.dev`, `*.resend.dev` and an unparsable sender count as shared, which fails closed). The local outbox honors the list without the flag; `emailTransport` returns outbox only on a local machine. |
| P2 Policy shape | Compliant | `pilot { tester, emails }`; priority open → active pilot → tester → closed. `disableSignUp` stays `kind === 'closed'`. Every gate goes through `signUpAllowedFor`. |
| P3 Parsing | Compliant | Splits on `,`, `;` and whitespace. ASCII is checked on the entry as typed, before lower-casing. Lower-cased exact match, no folding, at most 254 characters per entry. Any bad entry, more than 200 distinct entries or more than 16 384 characters ignores the whole list. Unset, empty or separators-only means no list. Warnings carry counts only. |
| P4 / E2 Delivery | Compliant | Shared sender and tester mode unchanged (tester only). Verified sender: allowed address **or** existing account (`user.findUnique` on the normalized email); a failing lookup fails closed; the neutral answer and the 1 s floor are unchanged. |
| P5 Sign-in and recovery | Compliant | An address removed from the list still signs in and still receives reset and verification re-send mail. Its new sign-up answers identically to a never-seen address. |
| P6 No enumeration | Compliant | Unlisted addresses get today's `403 SIGN_UP_RESTRICTED` and Hebrew line; `pilot` reuses the tester sentence; no list or count reaches the client. |
| P7 No storage or migration | Compliant | Server environment only; never logged or rendered. |
| P8 Never-verified follow-up | Compliant | Not touched; assigned to 4.6 in plan.md. |
| P9 Nothing else changed | Compliant | Service worker, offline fallback, update flow, shell allowlist, account deletion, progression and media untouched. `MEDIA_REQUIRED` off, video paused. |

**Rulings on the Developer's seven interpretations (the Manager accepted all), all acknowledged:**
1. **ASCII check before lower-casing: acknowledged.** It is stricter and correct: it refuses the Kelvin sign and other look-alikes that lower-case to ASCII, and it meets P3's homograph intent.
2. **Both warnings when both P1 conditions fail: acknowledged.** The owner sees every missing step. Text is fixed and holds no address.
3. **Integration tests in a sibling file, `email-auth.test.ts` byte-identical: acknowledged.**
4. **HTTP test uses different casing, not surrounding whitespace: acknowledged.** Better Auth rejects spaces with a 400 before our hook runs. Whitespace is covered at the unit level.
5. **Database-hook test with `try`/`catch`: acknowledged, with the Manager's condition.** An earlier `.catch` form failed inconsistently and was not diagnosed. If the final form ever fails in CI, diagnosing it comes before another push.
6. **One disposable row in the local test database from the manual flow: acknowledged.** Reserved `.test` address, local only.
7. **`auth.ts` and `page.tsx` unchanged: acknowledged.** Both already route through `signUpPolicy`/`signUpAllowedFor` and treat every non-`closed` kind alike, so the policy constant in `auth.ts` picks up `pilot` without an edit.

**Rulings on the Manager's I1-I9, all acknowledged:**
- **I1, parser return shape and limits:** a `none | valid | invalid` union. The per-entry limit of 254 characters follows the email path limit, and the 16 384-character limit is checked before splitting. Within P3.
- **I2, sender parse:** `Name <addr>` or a bare address, by the last `@`. `*.resend.dev` and an unparsable sender count as shared (fail closed). `notresend.dev` is correctly not shared.
- **I3, warn-once:** one line per reason per process through a module-level set. The optional `warn` parameter is for tests only and does not change the default path.
- **I4, delivery policy at send time:** the policy is computed in `sendAuthEmail` from the same environment as `auth.ts`, so it cannot diverge within a process. The account lookup fails closed.
- **I5, Resend transport still required:** the pilot runs only on the Resend transport, which still requires `RESEND_API_KEY`, `EMAIL_FROM`, `TESTER_EMAIL` and `BETTER_AUTH_URL`. **Owner note: `TESTER_EMAIL` stays a required production variable even after the pilot opens.**
- **I6, `deployed(env)` test pattern:** reuses the existing harness with a placeholder key and a mocked `deliver`. Nothing is sent or written, and production `auth.ts` behavior is unchanged.
- **I7, `AuthForm` sentence:** `pilot` shows the tester line "בשלב הבדיקה ההרשמה פתוחה רק לכתובות מאושרות.", which is accurate for both.
- **I8, no e2e addition:** acceptable. The e2e server keeps the `open` policy, the 20 HTTP-level integration cases cover the behavior, and one manual flow is recorded. No `playwright.config.ts` change.
- **I9, README "Opening the pilot" checklist:** five owner steps in the E1 order (domain verified, delivery test, `EMAIL_FROM`, `EMAIL_SENDER_VERIFIED=true`, `PILOT_EMAILS`), each a separate approval followed by a redeploy, all PENDING.

**The e2e failures are independent of 4.5.** The Developer had three tests that failed twice in suite runs and passed in isolation. The Manager measured them head to head on `main` `0b18ee2` (no 4.5 code) and on 4.5, with the same local database, one worker and 12 runs per test:
- `auth.spec.ts` "register, onboard, refresh…": 8/12 failed on `main`, 7/12 on 4.5, with the same assertion and URL;
- `ai-plan.spec.ts` "…rebuilt…": 2/12 failed on `main`, 0/12 on 4.5.

They fail on `main` at the same or a higher rate. 4.5 touches neither flow, since the e2e server keeps `open`. CI on standard PostgreSQL is the gate. The persistent local flakiness of `auth.spec.ts` on PGlite remains the separately proposed follow-up, outside 4.5.

**Production behavior: the release changes none.** Confirmed from the code:
- In production `PILOT_EMAILS` is unset, so `activePilotList` returns null before parsing and without any warning.
- The policy is `tester` exactly as before, and `signUpAllowedFor(tester)` behaves as before.
- `sendAuthEmail` takes the unchanged tester-only branch, because the policy is not `pilot`.
- `AuthForm` renders the same sentence for `tester`.
- No environment variable was added or changed, and `.env.example` defaults to `false` and empty.
- No migration; no change to `auth.ts`, `page.tsx`, the service worker or 4.2-4.4 behavior.

The only runtime difference is one extra in-memory `signUpPolicy()` evaluation per send. Registration and mail stay tester-only until the owner performs the separately approved checklist steps.

**Non-blocking observations (from the Manager, confirmed):**
1. The parser splits on JavaScript `\s`, so a Unicode space such as a no-break space separates entries. This is lenient but safe, because every entry is still checked as printable ASCII.
2. `&&!` without a space in `delivery.ts` is cosmetic; lint passes.
3. No baseline `npm run check` was recorded on the untouched tree. The 4.4 evidence serves as the baseline, and CI is the independent confirmation.

**Merge conditions:**
- **C1 (open):** copy `arch-phase4.md`, `manager-phase4.md` and `plan.md` byte for byte from the shared folder and commit them in the worktree before the single push. Then one push and a draft PR. CI on the final head must be green in a single attempt on both runs: the build job, and the PostgreSQL job with "All 34 required PostgreSQL tests executed and passed" and e2e. The result goes in the PR description only. A CI failure reopens this review, including any failure of the database-hook test (interpretation 5).
- **C2 (open, owner):** merging to `main` starts the automatic Vercel production deployment, so the merge approval is also the deployment approval.
  - Code-only, no migration, **no production behavior change**. Rollback target: the production deployment of `0b18ee2` (`6kx6RtfQTw6D84p2JJuRL1w9XJ9Z`).
  - Post-deploy checks are read-only: `/` and `/sw.js` unchanged, plus one same-origin `POST /api/auth/sign-up/email` with a reserved `.test` address, expected to answer `403 SIGN_UP_RESTRICTED` with no account and no mail.
  - **No production environment variable is set as part of this release.**
- **C3 (open, owner, does not block this merge):** opening the pilot, through the five README checklist steps, each separately approved.

**Next slice (Architect decision): 4.6, pilot metrics, operational alerts and retention housekeeping** (including the never-verified-accounts purge, P8), per the approved plan. Its contract is designed after 4.5 is merged. The plan.md items open there are the **alert channel**, the **analytics retention** and the **never-verified retention period**, all owner decisions.

#### C1 failure and corrective scope (2026-11-15)
C1 failed and this review was reopened, as stated above. Inputs:
- PR #8 (draft), head `00fc050`, CI runs `43760553797` (push) and `43760560631` (pull_request), first attempt;
- the failed-job logs, read with `gh`;
- `origin/main` `0b18ee2`, read-only.

**Findings.**
- Build, integration, "All 34 required PostgreSQL tests executed and passed" and the database-hook test (interpretation 5) passed in both runs. Only e2e failed.
- Every failure is an axe `color-contrast` violation on the footer button labels of the 4.4 account-deletion dialog, in two tests: `e2e/account-deletion.spec.ts:22` (dialog opens…) and `:114` (administrator explanation).
- The failing set differs between the two runs on the same commit. Push run: tablet and desktop, both tests. Pull-request run: mobile `:114` only. **It is a timing race, not a deterministic defect.**
- The reduced-motion test (`:45`, the same dialog with the animation disabled) passed in every project in both runs.
- The same tests passed on `main` in PR #7's CI and on the `0b18ee2` push run.
- Cause: `expectHealthyPage` runs axe right after the dialog becomes visible, while the `Sheet` `rise` animation (`opacity 0 → 1`, `translateY`, `--duration-panel` 220 ms) is still running. Partly transparent text yields a computed contrast below the threshold.
- The steady-state dialog is compliant: the same check passes whenever the animation has ended, and a contrast that is low only during a 220 ms fade-in is not a WCAG defect of the product.
- **4.5 is not the cause.** Its diff touches neither `src/components/ui`, `src/components/account`, `e2e/` nor `playwright.config.ts`. The flake is latent on `main` and would hit any later PR as well.

**Decision (Architect): fix it as a test-only correction inside the 4.5 PR (R1 below), not in product code and not in a separate PR.**
- **Inside 4.5:** the same justified exception as the Phase 3 test fix carried by the 4.2 PR (`f38ed53`). The flake blocks C1. Main carries it, so merging 4.5 with the fix also makes `main` green. A separate PR would need its own CI, merge and automatic production deployment for a test-only change.
- **In the shared helper, not one spec:** any `expectHealthyPage` call made while a panel transition, the update banner or another finite animation runs has the same race. Fixing only `account-deletion.spec.ts` would leave the latent flake for other specs.
- **Not in product code:** the `Sheet` animation is DESIGN_SYSTEM §10's allowed 220 ms panel transition, and the product is compliant at rest. Changing `Sheet.module.css`, `--duration-panel` or the dialog to satisfy a test would be the wrong fix.

**Code approval unchanged.** The 4.5 product code (`6e3ae38` code commits) is not affected and needs no re-review. The P1-P9/E1-E2 verdicts stand, and the release still changes no production behavior.

#### Required Corrections
**R1 (C1 corrective, test-only; Manager revision 2 of slice 4.5, then Developer):**
1. **Change:** in `e2e/fixtures.ts`, `expectHealthyPage` waits, before running axe, until every **finite** animation in the document has finished: `document.getAnimations()`, filtered to those whose effect has a finite `iterations`, awaiting their `finished`. The wait is bounded (on the order of 2 s). If finite animations are still running at the bound, the helper fails with a clear message; it does not run axe on a moving page and it does not skip silently. Infinite animations are excluded from the wait (DESIGN_SYSTEM forbids them, and `map.spec.ts` already asserts there are none on the map).
2. **Not allowed:** disabling or excluding the `color-contrast` rule or any axe rule; adding retries, `test.retry` or timeouts that only mask the race; emulating reduced motion globally; fixed sleeps; any change to `src/`, `Sheet.module.css`, `--duration-panel`, `playwright.config.ts`, `vitest.config.ts`, `package.json`, `package-lock.json` or the 4.5 product files. The only file in scope is `e2e/fixtures.ts`, plus at most the two failing specs if the Manager shows that the helper alone cannot cover them.
3. **Proof required in `dev-phase4.md` (4.5 corrective section):**
   - **Negative check:** with the `Sheet` animation temporarily lengthened locally (for example `--duration-panel` set to 2 s in a scratch change), the two tests fail axe without the wait and pass with it. The scratch change is restored and shown `cmp`-identical, and is not committed.
   - **Repetition:** `e2e/account-deletion.spec.ts` repeated locally at least 10 times per project with the wait, all green on the first attempt per run. Report reruns as reruns.
   - The full e2e suite once, with reruns reported as such (local PGlite noise as before).
   - `npm run check` green.
   - A diff showing `e2e/fixtures.ts` as the only code change.
4. **Then:** Manager review of R1, and a short Architect confirmation of scope; no re-review of 4.5 code. Copy the artifacts byte for byte into the worktree and commit. Then, **with the owner's explicit approval of another push**, one push to PR #8 and a **fresh first-attempt** CI run on the new head. The failed runs are not re-run. Both runs must be green: build; "All 34 required PostgreSQL tests executed and passed"; e2e. The result goes in the PR description only. A new failure reopens this review again.
5. **Record:** a one-line note in `docs/DECISIONS.md` `P4-5` (or a short test-infrastructure note there) that the accessibility helper waits for finite animations before axe. No product documentation change.

Merge conditions after R1: C1 as above; C2 (owner approval of merge and the automatic Vercel deployment, rollback target `0b18ee2`, no production environment variable set) and C3 unchanged.

#### R1 scope confirmation (CONFIRMED, 2026-11-16)
Short scope confirmation required by R1 step 4. The 4.5 product code is not re-reviewed.
- Inputs: `team-Yuri/manager-phase4.md` "Revision 2 review" (APPROVED, 2026-11-16, no corrections; shared folder) and the "4.5 corrective (R1)" section of `team-Yuri/dev-phase4.md` (`STATUS (slice 4.5 revision 2): COMPLETE`).
- Commits `bddf03a..e1f5cda` on `feature/phase-4-pilot-allowlist`, start `00fc050`, worktree `C:\Users\אוהד\Documents\Woffiz-4.5`. `origin/feature/phase-4-pilot-allowlist` is still `00fc050`: nothing pushed.

**Checked by the Architect:**
- `git diff 00fc050..e1f5cda --name-only`: outside `team-Yuri/` exactly `e2e/fixtures.ts` and `docs/DECISIONS.md`. No spec, `src/`, `Sheet.module.css`, token, config, package or 4.5 product file changed.
- `e2e/fixtures.ts`: 26 added lines, 0 removed. The wait runs immediately before `AxeBuilder`, over running animations with a finite `iterations`, bounded at 2 000 ms, polled (no fixed sleep), and fails with its own message at the bound. No axe rule disabled, no retry, no global reduced motion. Matches R1 items 1-2.
- `docs/DECISIONS.md`: one sentence appended to the `P4-5` Notes cell. Matches item 5.
- Evidence matches item 3, as verified independently by the Manager: negative check 18/18 failed without the wait and 18/18 passed with it (1 500 ms panel), 6/6 failed with the helper's own bound error at 5 000 ms; restore `cmp`-identical and not committed; repetition rerun 180/180 on the first attempt (the standby-invalidated first run is labelled invalid, not counted); full-suite PGlite failures reported and labelled as reruns, with no failure in `expectHealthyPage`; `npm run check` green (19 files, 340 tests).
- `arch-phase4.md` and `plan.md` in the worktree HEAD are byte-identical to the shared folder before this addendum. `manager-phase4.md` and this file now differ and must be copied again.

**Non-blocking note:** R1 item 1's rationale "DESIGN_SYSTEM forbids infinite animations" is too broad. The app has infinite loading animations (spinner, skeleton), as the helper's comment states. Excluding them from the wait is still correct, because they never finish and do not fade content. No change needed.

**Verdict: R1 scope CONFIRMED.** Next, in order:
1. Copy `arch-phase4.md`, `manager-phase4.md` and `plan.md` byte for byte from the shared folder into the worktree and commit (no other change).
2. With the owner's explicit approval, one push to PR #8 and a fresh first-attempt CI run on the new head, under R1 step 4. The failed runs are not re-run.
3. C1 is met only when both runs are green. C2 and C3 unchanged. This confirmation authorizes no push, merge, deployment or production environment change.

---

## Slice 4.4 record (APPROVED, merged in `0b18ee2`; closed, not reopened)
The text below is the slice 4.4 contract, its design-stage corrections and its final Architect review exactly as approved, with headings demoted one level and its status lines qualified as slice 4.4.

### Status
STATUS (slice 4.4): APPROVED

Slice 4.4 approved in final review on 2026-11-13 (see "Architect Review").

Owner decisions B1-B3 approved on 2026-11-12 (see "Owner Decisions"). This approval does not authorize deleting real accounts, any migration, merging or deploying.

Revision for **slice 4.4** (account deletion), 2026-11-12. Slices 4.2 (`7bc45f8`) and 4.3 (`ad6b55a`, PR #6) are approved, merged and deployed. Their contracts and final reviews are kept below as closed records and are not reopened.

### Phase Goal
Deliver the remaining ROADMAP Phase 4 work as the ordered slices of `team-Yuri/plan.md`. 4.1-4.3 are done. This revision details **slice 4.4 only**; 4.5-4.8 get their own contract later, each before it starts.

**Slice 4.4 goal:** a signed-in, verified owner can permanently delete their account from `/puppy`.
- The owner confirms in an accessible Hebrew RTL dialog that says honestly what is deleted, what is retained and that deletion cannot be undone.
- The owner re-proves their identity (B1).
- One server transaction removes every owner-scoped row (inventory below).
- Every session of the account ends, and the authentication cookies are cleared.
- No in-flight generation, adaptation, revision, onboarding or progression request can commit afterwards or recreate deleted data.
- Shared media and other accounts are untouched.

### Source References
- `team-Yuri/plan.md` (APPROVED), slice 4.4.
- PRD.md §8: "Account deletion deletes personal profiles, plans and attempts and removes linked job payloads. Shared media assets remain. Proposed failed-job payload retention: 30 days; application backups and provider retention must be documented before launch."
- PRD §5 progression contract; §10 server requirements (authenticated requests, CSRF, transactions, server-only secrets).
- DESIGN_SYSTEM.md §8 "Puppy and settings": "Account deletion uses a confirmation dialog with an honest scope statement". §9: destructive button, dialogs with named heading, focus trap and Escape. §12: accessibility and RTL.
- docs/DECISIONS.md:
  - 48 and 57: generation jobs, leases and fencing;
  - 64: ADMIN read from the database;
  - 66 and 76: lock order (job → puppy or plan → technique states);
  - 68-71: append-only media audit;
  - P4-1 to P4-3: service worker.
- Code baseline: `origin/main` `ad6b55a`, inspected 2026-11-12, read-only:
  - `prisma/schema.prisma` and the 7 migrations: foreign-key actions and triggers;
  - `src/server/auth.ts`: Better Auth 1.7.14, email and password, `nextCookies()`, no cookie cache, 30-day sessions, `rateLimit` on Better Auth routes only;
  - `src/server/session.ts`: `requireUserFromRequest` takes the identity from the session cookie;
  - `src/server/http.ts`: `assertSameOrigin`, `postRoute`;
  - `src/server/ai/jobs.ts`: `startJob`, `fenceJob`, `finishJob`, `refundJobUnitOnce`, `pruneJobPayloads` (30 days);
  - `src/server/ai/quota.ts`: hashed `AiUsageDay` keys;
  - `src/server/onboarding.ts`: `lockPuppy`, puppy creation, commit after `fenceJob`;
  - `src/server/revision.ts` and `src/server/progress.ts`: `lockPlan`;
  - `src/server/email/rate-limit.ts`: `takeRateLimit`;
  - `src/components/ui/Sheet.tsx`: native `<dialog>`; `Button` has a `destructive` variant.

### Current-state findings that shape the design
1. **Two `ON DELETE RESTRICT` foreign keys block a naive cascade:**
   - `Attempt.exerciseVersionId → ExerciseVersion`;
   - `MasteryEvent.attemptId → Attempt`.

   Every other owner chain cascades from `user`. PostgreSQL checks RESTRICT immediately, so `DELETE FROM "user"` can fail for any owner who has attempts or mastery events, depending on cascade order. Deletion must therefore delete **explicitly in dependency order** inside one transaction. No schema change is needed.
2. **Media audit columns are plain strings, not foreign keys:**
   - `MediaVersion.createdById`, `publishedById` and `withdrawnById`;
   - `MediaReview.reviewerId`;
   - `TechniqueSuspensionEvent.actorId`.

   `MediaReview` and `TechniqueSuspensionEvent` are append-only, and `MediaVersion` content columns are frozen, all by database triggers. They cannot be rewritten without a migration that weakens the audit guarantees. Deleting a user never violates them.
3. **Sessions are database rows** (no Better Auth cookie cache is configured). Deleting the `session` rows invalidates every device at once; the cookies only need clearing on the device that asked.
4. **Email-verification links are stateless tokens** (`createEmailVerificationToken`). Password-reset tokens are rows in `verification`; Better Auth 1.7 stores the user id as the value, which the Manager must confirm against the 1.7.14 source.
5. **Payload retention already exists in code.** `pruneJobPayloads` clears `GenerationJob.payloadJson` older than 30 days, run opportunistically when a job starts. The PRD calls the 30 days "proposed"; it is not owner-approved.
6. **Everything owner-scoped chains to `user` through a foreign key** (`Puppy.ownerId`, `IdempotencyKey.userId`, `session`, `account`; `Plan`, `Attempt` and `GenerationJob` through `Puppy`). Once the `user` row is gone, no insert can recreate owner data, because the foreign key fails. The exception is `AiUsageDay`, whose keys are hashes with no foreign key.

### Architectural Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| A1. **Base:** branch from `main` `ad6b55a` in a new worktree. **No migration** is required: ordered deletes handle the RESTRICT keys, and the audit strings need no schema change. | Avoids a production database step and keeps the media audit triggers intact. | The release is code-only. If the Manager finds a need for a migration, that is a contract change that comes back to the Architect, and production migration is a separate owner approval. |
| A2. **Endpoint:** `POST /api/account/delete`, a project route, not Better Auth's built-in `deleteUser`. Same-origin JSON (`assertSameOrigin`). Identity only from `requireUserFromRequest` (session cookie, verified email); any id in the body is ignored, and the body schema has none. Response `Cache-Control: private, no-store`. | Better Auth's `deleteUser` deletes through its adapter outside our transaction and lock order, and does not know the owner tables or the RESTRICT keys. | A single code path owns deletion. Better Auth is used only for password verification and cookie names. |
| A3. **Identity verification (B1, owner-approved):** the request carries the current password. Inside the deletion transaction the server reads the account's credential `account` row and verifies the password with Better Auth's own password verifier (the Manager names the exact 1.7.14 API). A wrong password changes nothing and returns a neutral Hebrew error. Attempts are limited per account with `takeRateLimit` (new scope `account-delete`; 5 per 15 minutes is the default; hashed key, no address stored). The key is taken **before** verification. | A stolen or unattended session alone cannot delete the account. Email confirmation is not available to pilot addresses until the sender domain is verified (4.5). | No new table. The rate-limit table name says "Email", but `takeRateLimit` is generic. |
| A4. **ADMIN accounts (B2, owner-approved):** the endpoint refuses while the account's **current database role** is ADMIN (`ADMIN_DELETE_BLOCKED`, Hebrew explanation). The dialog shows the explanation instead of the form. An administrator first revokes the role with the existing `scripts/grant-admin.ts --revoke`, an owner-run action. After that, deletion proceeds, and the historical media audit rows keep the former user id as an **opaque identifier**: no foreign key and no email, so it is no longer linked to an email address once the `user` row is gone. If the account has such audit rows (the server checks this when it renders `/puppy`), the A9 scope statement adds one accurate line: review and publication records of demonstration videos are kept, carrying an internal identifier that contains no email address and that, after deletion, is no longer linked to any account in our system. Backups taken before the deletion may still link it until they expire (A9 limits). | Rewriting the append-only audit would need a migration that weakens decisions 62 and 68-71. Blocking accidental self-deletion of the only administrator protects the publishing workflow. | No audit row is changed or deleted. Shared media stays fully intact. |
| A5. **Deletion transaction (the only write path). Lock order corrected 2026-11-12 (C1, C2 in "Design-stage corrections and rulings"); the original order job → puppy → plan is superseded.** One interactive transaction, with timeouts like the other commits. It runs these steps in this order:<br>(1) verify the password;<br>(2) lock the account's `GenerationJob` rows `FOR UPDATE` in id order;<br>(3) lock the `Plan` rows `FOR UPDATE` in id order;<br>(4) lock the `Puppy` row `FOR UPDATE`, then re-lock the account's `GenerationJob` rows `FOR UPDATE NOWAIT`; on `55P03`, `40P01` or `40001` the whole transaction rolls back and is retried, at most 3 attempts with jitter, then `500 INTERNAL` with nothing deleted;<br>(5) delete, in dependency order: `MasteryEvent` → `Attempt` → `ExerciseVersion` → `Level` → `Plan` → `GenerationJob` (including its payloads) → `Puppy` → `IdempotencyKey` → `verification` (reset tokens of this user) → `AiUsageDay` (this account's `ai-request` keys for the retained days, recomputed with `keyOf`) → `session` → `account` → `user`.<br>Any error rolls everything back. | The real lock graph, including the implicit `FOR KEY SHARE` locks that foreign-key inserts take, orders every write path as **job → plan → puppy → user**. Progression holds the plan lock and then needs key-share on the puppy for its attempt insert. Deletion follows the same order, so there is no cycle. The `NOWAIT` re-lock closes the gap for a job created after step 2: deletion never waits for a job while it holds the puppy. The `user` row is deleted last; inserts that reference it take key-share locks and finish first. Deletion takes no technique lock. | All or nothing: a failure leaves the account fully usable. The Manager confirms the order against every write path and records it in `P4-4`. |
| A6. **In-flight work after deletion (500 mapping at the `postRoute` choke point, C3).** A request that started earlier either finishes before deletion takes its locks, and its result is then deleted with everything else, or it fails safely afterwards:<br>- `fenceJob` matches no job row, so the commit stops;<br>- `lockPuppy` and `lockPlan` find no row;<br>- every insert hits a missing foreign key.<br>Those paths answer with the existing neutral errors, never recreate rows, never refund into a recreated job, and never log personal data. One residue is accepted and documented: a request already past its quota check may re-insert an `ai-request` counter row. It holds a hash of the deleted id and is pruned within 7 days. | Proven on standard PostgreSQL (Testing). There is no "deleted" tombstone table, which would itself be personal data. | No change to the generation lifecycle beyond mapping these failures to clean errors where they currently surface as 500. |
| A7. **Sessions and cookies.** Deleting the `session` rows ends every device immediately: `getSession` reads the database. The success response also expires the Better Auth cookies on the requesting device, using Better Auth's own cookie names and attributes, including the `__Secure-` prefix on HTTPS (the Manager verifies the 1.7.14 helper or names). Afterwards the client goes to the welcome page `/` and shows a short "החשבון נמחק" status. No personal data goes in the URL. | Server-side invalidation is authoritative; clearing the cookie avoids a stale cookie on the device. | A second signed-in device lands on `/` at its next request. Its API calls get `UNAUTHENTICATED`. |
| A8. **Dialog on `/puppy`.** The "חשבון" card replaces the "will be added later" line with a destructive "מחיקת החשבון" button. It opens the existing `Sheet` (native `<dialog>`: named heading, focus containment, Escape, focus restoration) containing:<br>- the scope statement (A9);<br>- a password field with a visible label;<br>- "ביטול" (cancel, the default focus);<br>- "מחיקה לצמיתות" (destructive, disabled while sending).<br>States: sending (no duplicate submit), wrong password (inline error, input kept), rate-limited (explained), offline or network failure ("לא נמחק דבר", retry), ADMIN blocked (A4). | DESIGN_SYSTEM §8, §9 and §12. Reuses existing components; no new visual language. | DESIGN_SYSTEM.md gains the dialog row in §14 and the copy in §8. |
| A9. **Honest scope copy (Hebrew; final wording by the Manager within this meaning):**<br>- **Deleted now, irreversibly:** the account, email address and password, all sessions, the puppy profile and onboarding answers, all training plans and exercises, practice reports and mastery confirmations, and AI generation records including their stored outputs.<br>- **Retained:** shared demonstration media, which never contained the owner's data; for a former administrator, also the A4 line on the opaque identifier in video review records.<br>- **Limits:** recovery is not possible; copies may remain for a limited time in the hosting and email providers' backups and logs under their own retention, and in any generation request that was already being processed.<br>The copy must not promise a removal time we do not control, and it names no providers. | PRD §8 requires backups and provider retention to be documented. The copy must match actual behavior exactly. | README documents the same limits with specifics: Supabase backups depend on the plan (open owner decision "backups"); Resend keeps delivery logs; Vercel runtime logs; AI provider request retention. |
| A10. **No change elsewhere.** No change to the service worker (P4-1 to P4-3 unchanged: `/api/*` is never cached and pages are network-first), the update flow, progression rules, generation prompts, media or `MEDIA_REQUIRED` (off). No deletion of real accounts in any environment except disposable test accounts on local or CI databases. | Scope discipline. | Deleting any real account in production, including the owner's own test account, happens only through the shipped UI by that account's owner. |

### Owner-scoped deletion inventory (complete, from `prisma/schema.prisma` at `ad6b55a`)

| Table | Scope key | Action in 4.4 | Note |
|---|---|---|---|
| `user` | `id` = session user | **Delete** (last) | Email, name, role, verification flag |
| `session` | `userId` | **Delete** | All devices |
| `account` (Better Auth credential) | `userId` | **Delete** | Password hash |
| `verification` | reset-token rows whose value is the user id | **Delete** | Email-verification tokens are stateless and become useless once the user is gone |
| `Puppy` | `ownerId` | **Delete** | Profile and onboarding answers (`profileJson`, `onboardingStep`) |
| `Plan` | `puppyId` | **Delete** | |
| `Level` | `planId` | **Delete** | |
| `ExerciseVersion` | `levelId` | **Delete** (after `Attempt`) | RESTRICT target |
| `Attempt` | `puppyId` | **Delete** (after `MasteryEvent`) | RESTRICT target |
| `MasteryEvent` | `levelId` | **Delete** (first) | |
| `GenerationJob` | `puppyId` | **Delete**, including `payloadJson` | Personal failed-job payloads are removed by the deletion itself |
| `IdempotencyKey` | `userId` | **Delete** | Stored responses can echo owner content |
| `AiUsageDay` | hashed `ai-request` key of this user, per retained day | **Delete** | The system-wide `ai-calls` counter is not personal and stays |
| `EmailRateLimit` | hashed scope + address or IP | **Retain** (documented) | Short fixed windows, pruned after 24 h; abuse protection; contains no address |
| `MediaVersion`, `MediaReview`, `TechniqueSuspensionEvent` | opaque actor ids (strings) | **Retain unchanged** | Shared audit; append-only (A4) |
| `MediaAsset`, `TechniqueVersionState` | — | **Retain** | Shared catalog |
| Other accounts' rows in every table | — | **Untouched** | Proven by tests |

A guard test lists every table from `information_schema` and fails if a table is not classified in this inventory, so a future table cannot silently escape deletion.

### Constraints / Non-Negotiables
- The identity comes only from the session. No caller-supplied owner, user or puppy id is accepted anywhere in 4.4.
- One transaction: all or nothing. No partial deletion is observable.
- Progression invariants untouched. Deletion is the only new write path, and it only deletes.
- Shared media, catalog and audit rows are never modified or deleted.
- No secrets, passwords or email addresses in logs, errors or responses.
- The service worker, offline fallback, owner-activated update and shell allowlist are unchanged. Video production stays paused, `MEDIA_REQUIRED` stays off and techniques stay DRAFT.
- Pilot scope stays as agreed: no videos; approved emails only once the sender domain is verified (4.5); first-party analytics (4.6).
- No production migration, merge, deployment or deletion of real accounts without explicit owner approval. Merging to `main` is the production deployment.

### Technical Boundaries / Out of Scope
- Profile editing; data export; delayed or soft deletion ("grace period"); admin-initiated deletion of other accounts; support tooling.
- Purging never-verified accounts. They cannot sign in, so they cannot use this flow. This is recorded as a follow-up for 4.5/4.6, not built here.
- Changing the payload retention for remaining accounts. B3 is approved at the 30 days already implemented, so 4.4 changes no retention code; it only records the decision in `P4-4` and the README.
- Rewriting media audit rows; any migration.
- 4.5-4.8 work.

### Dependencies and Interfaces

#### Expected files (slice 4.4)
New:
- `src/server/account-deletion.ts`: the A5 transaction and A6 error mapping, with injectable dependencies for the rollback test.
- `src/app/api/account/delete/route.ts`: A2/A3/A7.
- `src/components/account/DeleteAccount.tsx` (+ `.module.css`): A8 dialog.
- Integration tests under `test/integration/` (deletion, inventory guard, concurrency) and unit tests for any pure helpers.
- `e2e/account-deletion.spec.ts`.

Modified:
- `src/app/(main)/puppy/page.tsx`: the account card.
- `src/app/page.tsx` (welcome): the "deleted" status, only if needed.
- `src/server/http.ts`: the C3 mapping in `postRoute` only (replaces per-path changes to the generation, progression and onboarding error paths); `src/server/ai/quota.ts`: one exported helper (I5).
- `src/server/errors.ts`: new codes with Hebrew text.
- `scripts/required-pg-tests.json`: the new PostgreSQL-only tests.
- `DESIGN_SYSTEM.md` §8/§14; `docs/DECISIONS.md` `P4-4`; `README.md` ("Account deletion": behavior and the A9 limits); `PRD.md` §8 (B3: the 30-day payload retention is owner-approved, no longer "proposed").

Not touched: `public/sw.js`, `public/offline.html`, `next.config.ts`, `src/server/auth.ts` (unless the Manager shows a required configuration change, which is a contract change), `prisma/schema.prisma` and `prisma/migrations/`, media code, `playwright.config.ts`, `.env.example`, `package.json`, `package-lock.json`.

#### Interfaces
- `POST /api/account/delete`. Body: `{ password: string }` (bounded length). Same-origin JSON. Possible responses:
  - `200 { deleted: true }`, with expired auth cookies;
  - `401 UNAUTHENTICATED`;
  - `403 EMAIL_NOT_VERIFIED`, `ADMIN_DELETE_BLOCKED` or `FORBIDDEN_ORIGIN`;
  - `400 VALIDATION`;
  - `422`-class `PASSWORD_INCORRECT`, neutral;
  - `429 RATE_LIMITED`;
  - `500 INTERNAL`, with nothing deleted.
- No other API, no schema change, no environment variable.

### Data / State Considerations
- After success, no row in any owner-scoped table references the account (inventory).
- Retained pseudonymous residues are documented: email rate-limit hashes (24 h), a possible late `ai-request` counter hash (7 days) and media audit actor ids (permanent, ADMIN history only).
- **B3, remaining accounts' failed-job payloads (owner-approved 2026-11-12):** a maximum of 30 days, as `pruneJobPayloads` already implements. Account deletion removes the deleted account's job payloads immediately, inside the A5 transaction. Record the decision in `P4-4`, and update the PRD §8 wording ("proposed") in the same change.

### Security / Privacy Considerations
- Defenses: CSRF via same-origin JSON; session-only identity; password re-entry with a per-account limit; constant, neutral error text; no enumeration (the account is already the session's).
- ADMIN self-deletion blocked (A4); `assertAdmin` reads the database, so a deleted or revoked admin can never act.
- No personal data in logs. The route logs only error codes. In-flight AI requests already sent to the provider are outside our control; A9 says so.
- Responses are `no-store`, and the service worker never caches `/api/*` (S2).

### Testing and Lint Expectations
Automated (Developer, recorded in `dev-phase4.md`):
- `npm run check` passes.
- Integration tests (PGlite locally, and standard PostgreSQL in CI):
  - **Full clearance:** a fully populated account is deleted: profile, plan with completed, current and locked levels, several exercise versions, attempts (current and review), mastery events, idempotency keys, a failed job with `payloadJson`, a reset token, today's `ai-request` counter and two sessions. Every inventory table holds zero rows for it, including an account with mastery events, which proves the RESTRICT order.
  - **Isolation:** a second populated account is byte-for-byte unchanged, compared by snapshot. Shared media (`MediaAsset`, `MediaVersion`, `MediaReview`, `TechniqueVersionState`, `TechniqueSuspensionEvent`) is unchanged by snapshot.
  - **Not by another account:** a request authenticated as account B deletes only B and never A. A body carrying A's id is ignored. Unauthenticated, unverified, cross-origin and non-JSON requests delete nothing.
  - **Password:** a wrong password deletes nothing. The rate limit refuses after the cap, and the key is taken before verification.
  - **ADMIN:** an account whose current role is ADMIN is refused. After revocation, deletion succeeds and the audit rows referencing the former id are unchanged.
  - **Sessions:** after success, both sessions fail `getSession`. The response expires the session cookie with Better Auth's names and attributes.
  - **Rollback:** an injected failure after some deletes leaves every row and session intact.
  - **Inventory guard:** an unclassified table fails the test.
- PostgreSQL-only concurrency tests, added to `scripts/required-pg-tests.json`. They use the deterministic lock-observation pattern (`pg_blocking_pids`; test-held locks, no sleeps for ordering):
  1. A deletion that starts while a generation commit holds its job row waits, then removes the committed plan as well. Nothing remains.
  2. A generation or adaptation whose commit starts after the deletion committed stops at `fenceJob` (or the missing puppy or plan). It recreates nothing, refunds nothing and gives a clean error.
  3. A mastery confirmation holding the plan lock: either it lands first and is then deleted, or it runs after and fails cleanly. There is never a deadlock and never an orphan row.
  4. An onboarding draft save or puppy creation racing the deletion never recreates a `Puppy` row.
  5. Two concurrent deletions of the same account: one succeeds, the other answers `UNAUTHENTICATED` or deletes nothing. No deadlock.
  6. The C2 gap: a job created after the first job-lock pass and held at the `fenceJob` position makes the `NOWAIT` re-lock fail; the deletion rolls back, releases the puppy and succeeds on retry. No `40P01`, nothing remains. Also required: the C1 negative check (with the original order, test 3 fails with `40P01`).
- E2E (Playwright, three viewports, disposable accounts from the existing `owner` fixture only):
  - opening the dialog: focus on "ביטול", Escape closes and restores focus, axe clean, RTL, no overflow at 360 px, reduced motion;
  - cancel deletes nothing (the account still works);
  - a wrong password shows an inline error and keeps the dialog;
  - successful deletion lands on `/` with the "deleted" status, `/home` redirects to `/`, and signing in again with the old credentials fails;
  - a second browser context signed in to the same account is signed out at its next navigation;
  - the existing `offline.spec.ts`, `pwa.spec.ts` and `shell.spec.ts` stay green.
- CI on standard PostgreSQL green on the final head, single attempt, all required tests.

Manual or owner (PENDING, not a merge blocker): deletion on a real phone (dialog, keyboard, VoiceOver reading the scope text). It belongs to the 4.8 matrix.

### Functional Testability
- Page/screen: `/puppy`, "חשבון" card, "מחיקת החשבון" dialog; welcome page `/` after deletion.
- User-visible behavior:
  1. Open the dialog, read the scope, cancel: nothing changes.
  2. Wrong password: error, nothing deleted.
  3. Correct password: the account is gone, the user is signed out everywhere and cannot sign in again.
- API: `POST /api/account/delete` as specified.
- Minimal end-to-end flow:
  1. Register a disposable account locally and onboard.
  2. Practice and confirm mastery.
  3. Delete it from `/puppy`.
  4. Database check: zero owner rows, other accounts and media unchanged.
- Expected result: as above, asserted by integration and e2e tests.

### Handoff Notes for Manager
- Detail slice 4.4 only. Base `main` `ad6b55a`, new branch and worktree.
- Apply the owner decisions B1-B3 below (approved; no further approval round). They do not authorize deleting real accounts, any migration, merging or deploying.
- Verify against Better Auth 1.7.14 (source or official docs): the password verifier API, the reset-token storage in `verification`, the session cookie names and attributes, and a supported way to expire them from a route handler.
- Confirm the A5 lock order against `startJob`, `fenceJob`, `lockPuppy`, `lockPlan`, `saveOnboardingDraft` and the idempotency writes, and record it in `P4-4`. Done by the Manager: the order is corrected as C1/C2.
- List every path where a deleted account would surface as a 500 today, and map only those (A6).
- No migration. If one becomes necessary, stop and return to the Architect.

### Design-stage corrections and rulings (2026-11-12)
Input: `team-Yuri/manager-phase4.md` slice 4.4 revision 1 (STATUS: READY_FOR_DEVELOPER), sections "Lock-order check", "Deleted-account responses today" and "Risks / Open Questions". I checked the lock graph against `src/server/progress.ts` (`recordAttempt`/`confirmMastery`: `lockPlan`, then `attempt.create`), `src/server/onboarding.ts`, `src/server/revision.ts` and `src/server/ai/jobs.ts` at `ad6b55a`, read-only.

**Corrections to the contract (accepted; the Architect's A5 was wrong):**
- **C1, lock order (Manager F1).** My A5 locked the puppy before the plans. Progression holds `Plan FOR UPDATE` and then inserts an `Attempt`, which takes `FOR KEY SHARE` on `Puppy`. A deletion holding `Puppy FOR UPDATE` while waiting for that plan lock closes a cycle (`40P01`). **Corrected order: jobs → plans → puppy → (deletes) → user.** The corrected A5 row is the contract.
- **C2, job gap (Manager F2).** A job inserted after the first job-lock pass, whose worker then reaches `fenceJob` and waits for the puppy, would deadlock with a deletion that holds the puppy and waits for the job row. **Fix: after the puppy lock, re-lock the jobs `FOR UPDATE NOWAIT`.** On `55P03`, `40P01` or `40001` the whole transaction rolls back, with a bounded retry of 3 attempts with jitter; then `500 INTERNAL`, nothing deleted. A bounded retry is acceptable because every attempt is all-or-nothing, and the owner can simply try again.
- **C3, 500 mapping at one choke point (Manager F3).** In `postRoute`'s non-`AppError` branch, if the session user's row no longer exists, answer `401 UNAUTHENTICATED` and log only the code. Otherwise behave exactly as today. This covers every in-flight path of a deleted account (A6) without touching domain code. The clean fence answers (409/404) stay as they are.

**Rulings on the Manager's interpretations I1-I9:**

| # | Interpretation | Ruling |
|---|---|---|
| I1 | A5 steps 3 and 4 swapped (plans before puppy) | **Acknowledged.** Recorded as C1. The required negative check (swap back, observe `40P01`, restore with `cmp`) must be in the evidence. |
| I2 | `NOWAIT` job re-lock, bounded retry, sixth PostgreSQL test | **Acknowledged.** Recorded as C2. The F2 test must use the injectable hook between the first job pass and the puppy lock; that hook must not change the default path. |
| I3 | 500 mapping at the `postRoute` choke point | **Acknowledged.** Recorded as C3. Condition: the mapping applies only when the session user's row is absent. With the user present, an unexpected error still answers 500 and is logged as today. `adminRoute` is unchanged. |
| I4 | Cookie expiry from `getCookies(auth.options)` instead of `auth.api.signOut` | **Acknowledged.** It does not depend on the session row the deletion just removed, and it works outside a Next request scope. The equivalence test against a real `signOut` is mandatory. A mismatch is a defect, not an interpretation. |
| I5 | One exported, transaction-aware helper in `src/server/ai/quota.ts` (ten UTC days) | **Acknowledged.** It is the minimal way to recompute the private `keyOf` that A5 requires. No other change to that file, and the system-wide `ai-calls` counter is untouched. |
| I6 | `/?deleted=1` marker and the welcome status line | **Acknowledged.** A constant marker with no personal data, as A7 requires. Anyone can open that URL and see the line; it is cosmetic and reveals nothing. A full navigation drops client state. The service worker is unaffected (network-first navigation). |
| I7 | Final Hebrew copy (M4) | **Acknowledged.** It matches A9 and the B2 wording: what is deleted now and irreversibly, what stays (shared videos), the A4 audit line only for accounts with audit records, and the limits for backups, provider logs and in-flight requests. It names no provider and promises no removal time. |
| I8 | Non-strict body schema; extra fields ignored | **Acknowledged.** Exactly A2: the schema reads only `password`, so any id in the body is never read. A test sends another account's id and proves it is ignored. |
| I9 | Password verified inside the transaction before any lock; rate limit outside, before verification | **Acknowledged.** No row lock is held while scrypt runs, and the limit cannot be bypassed by a failing transaction. Condition: a C2 retry must not take another rate-limit unit (the limit is taken once per request, outside the retried transaction). |

**Not an Architect decision (owner):** the Manager's open item to run a throwaway PostgreSQL server outside the repository before the single push. Architecturally recommended, because the six concurrency tests carry the main risk of this slice; the owner decides.

Contract status: still READY_FOR_MANAGER, now with C1-C3. No migration and no change to A1-A4 or A7-A10.

### Owner Decisions (slice 4.4)

All approved by the owner on 2026-11-12:

| # | Decision | Owner decision |
|---|---|---|
| B1 | How the owner proves identity before deletion | **Approved:** re-enter the current password, with per-account rate limiting (A3) |
| B2 | ADMIN accounts | **Approved:** in-app deletion is blocked while the role is ADMIN; revoke it first. Shared media audit records are preserved unchanged, and the retained opaque identifier is explained accurately (A4, A9) |
| B3 | Failed-job payload retention for remaining accounts | **Approved:** at most 30 days; account deletion removes that account's payloads immediately |

Also recorded:
- The open plan.md decision "backups" affects only the README specifics of A9, not the UI wording.
- None of the other open plan.md decisions (alert channel, sending domain, pilot recruitment, performance profile) affects 4.4.

### Architect Review
ARCHITECT_REVIEW_STATUS (slice 4.4): APPROVED

Current revision: slice 4.4. The final reviews of slices 4.3 and 4.2 are in the closed records below.

#### Review Notes
Final review of slice 4.4, 2026-11-13.
- Inputs: `team-Yuri/manager-phase4.md` ("Manager Review", MANAGER_REVIEW_STATUS: APPROVED, no corrections; shared folder) and the 4.4 section of `team-Yuri/dev-phase4.md` (STATUS (slice 4.4): COMPLETE; committed in the worktree).
- Branch `feature/phase-4-account-deletion`, HEAD `c92e2a8`, base `ad6b55a` (unchanged on the remote), worktree `C:\Users\אוהד\Documents\Woffiz-4.4`. Local only: not on the remote, no PR, no CI run yet.
- Checked read-only with git: `src/server/account-deletion.ts`, the route, `DeleteAccount.tsx` and the diffs of `http.ts`, `quota.ts`, `errors.ts`, `/puppy`, the welcome page, README and PRD.
- Tests were not re-run by the Architect.

**Scope.**
- Outside `team-Yuri/`, the diff touches only the files allowed by the contract.
- A path-filtered diff over `prisma/`, `public/` (including `sw.js` and `offline.html`), `next.config.ts`, `src/server/auth.ts`, `package.json`, `package-lock.json`, `.env.example`, `playwright.config.ts`, `vitest.config.ts`, `src/server/media` and `src/domain` is empty.
- No migration, no schema change, no dependency, no environment variable.

**Compliance with A1-A10 and C1-C3:**

| Decision | Verdict | Evidence |
|---|---|---|
| A1 Base, no migration | Compliant | Branched from `ad6b55a`; `prisma/` is not in the diff. |
| A2 Endpoint and identity | Compliant | `POST /api/account/delete`: `assertSameOrigin`, then `requireUserFromRequest`; the body schema reads `password` only (non-strict); `no-store`. Another account's id in the body is proven ignored. |
| A3 Password and limit (B1) | Compliant | `verifyPassword` from `better-auth/crypto` against the credential `account` row, inside the transaction and before any row lock. `takeRateLimit` (`account-delete`, 5/900 s) is taken once per request, outside the retried transaction and before verification. |
| A4 ADMIN (B2) | Compliant | The current database role ADMIN is refused with `ADMIN_DELETE_BLOCKED`, and the dialog shows only the explanation. After revocation, deletion succeeds with the audit rows byte-identical. `hasMediaAuditRecords` drives the accurate opaque-id line. |
| A5 as corrected by C1/C2 | Compliant | Identity checks, then jobs `FOR UPDATE`, then plans `FOR UPDATE`, then the puppy `FOR UPDATE`, then jobs `FOR UPDATE NOWAIT`. Deletes run in RESTRICT-safe order, with `user` last and exactly one row. `55P03`/`40P01`/`40001`/`P2034` roll back and retry at most 3 times, then 500 with nothing deleted. The test seams are optional parameters, unused by the default path. |
| A6 + C3 In-flight work | Compliant | `postRoute` answers 401 only for a non-`AppError` failure when the session user's row is gone. A failing lookup counts as "not deleted", so the 500 path is unchanged. Only a code is logged. `adminRoute` is unchanged. |
| A7 Sessions and cookies | Compliant | Session rows are deleted in the transaction. `expiredAuthCookies` uses `getCookies(auth.options)` with `maxAge: 0`, and is equivalent to a real `signOut` (http and https). A full navigation goes to `/?deleted=1`. |
| A8 Dialog | Compliant | The existing `Sheet` (native `<dialog>`); a destructive opener; initial focus on "ביטול"; a labelled password field with an associated, announced error; sending, wrong-password, rate-limit, network and ADMIN states; the password is cleared after each request that deleted nothing. |
| A9 Honest copy | Compliant | Deleted, retained and limits exactly as in the contract and B2. No provider named and no removal time in the UI. README states the provider facts without invented figures and keeps the "backups" decision open. |
| A10 No change elsewhere | Compliant | Service worker, update flow, shell allowlist, media and `MEDIA_REQUIRED` untouched. Only disposable accounts on local and throwaway databases. |
| B3 | Compliant | Deletion removes the account's job payloads in the transaction. PRD §8 now says 30 days, owner-approved. No retention code changed. |

**Rulings on the Developer's nine interpretations (the Manager accepted all nine); all acknowledged:**
1. **F3 helper tested in the integration file: acknowledged.** It imports the database client and the unit config has no database. The four decision cases and the route-level 401/500/`AppError` cases are covered.
2. **`afterJobLock` after the plan locks, before the puppy lock: acknowledged.** That is the position the C2 test needs. It is optional and unused by the default path, which meets the I2 condition.
3. **Focus on "ביטול" via an effect and `data-delete-cancel`: acknowledged.** `Sheet` renders children while closed, so `autoFocus` would target a hidden element. The e2e asserts the focus. The selector is document-wide, which is safe with one dialog per page.
4. **"מחיקה לצמיתות" also disabled while the field is empty: acknowledged.** Stricter than the contract, it avoids a pointless 400, and it is documented in DESIGN_SYSTEM.md.
5. **Scoped `eslint-disable-next-line` for `window.location.href`: acknowledged.** A7 requires a full navigation.
6. **Cookie normalizations (lower-case `SameSite`, drop `prefix`): acknowledged.** Next's `ResponseCookies` requires them, and the mandatory equivalence test (I4 condition) proves the serialized result equals Better Auth's sign-out.
7. **Welcome status reuses `.card` and `.lead`: acknowledged.** No new visual variant.
8. **Extra tests beyond M2: acknowledged.** They strengthen coverage.
9. **Rewritten F1 test: acknowledged, and required.** The first version masked the cycle. The rewritten test reproduces the real progression scenario, and the recorded negative check now fails with `40P01` under the old order, which is the proof C1 asked for.

**Rulings on the Manager's observations:**
- **`/api/mastery` and `/api/plan/revise` have no dedicated race test: acknowledged, no correction.** C3 is one route-agnostic decision in `postRoute`, tested directly: user gone gives 401; user present gives 500; `AppError` keeps its status.
  - `/api/mastery` fails like `/api/attempts`, which has a real in-flight race test: `lockPlan` returns no row, then a non-`AppError` follows.
  - `/api/plan/revise` shares `startJob`, the `fenceJob` stop and the choke point with `/api/plan/adapt`, which has a race test.
  - A dedicated case would repeat an existing proof of the same code path.
- **The six PostgreSQL-only tests were not re-executed by the Manager: acknowledged.**
  - Existing evidence: the Developer ran them on a throwaway PostgreSQL 17.11 (owner-approved), 10 times each, 60 executions and 0 failures. The full integration suite also passed there (203 passed, 3 skipped by design), the C1 negative check is recorded, and the Manager read the tests and judged them deterministic (lock state observed through `pg_stat_activity`/`pg_blocking_pids`, no sleep-ordering).
  - The independent execution is CI on standard PostgreSQL. It is therefore part of merge condition C1 below and must show "All 34 required PostgreSQL tests executed and passed" (28 + 6).

**Evidence assessment.**
- `npm run check` is green in a clean worktree (285 unit tests).
- Integration: 18 tests on PGlite; 24 on PostgreSQL. The inventory guard has a recorded negative check.
- E2E: 235 of 235 combined, 14 only on a rerun after a local PGlite restart (all in specs 4.4 does not touch, reported as reruns). The 18 new tests passed on the first run, and the Manager's independent run of the new and PWA specs passed 138/138 on the first attempt.
- Functional testability is demonstrated with disposable accounts only.

**Non-blocking observations:**
1. The rate limit is per account only (5 per 15 minutes), as B1 specified. An attacker must already hold a valid session, so this is accepted. Revisit only if pilot telemetry shows abuse.
2. `hasMediaAuditRecords` runs three small queries on every `/puppy` render, on unindexed string columns of small shared tables. Negligible at pilot scale.
3. Never-verified accounts cannot use this flow (they cannot sign in). This remains the recorded follow-up for 4.5/4.6.
4. Accepted residues, as documented: abuse-protection hashes (24 h), a possible late request-counter hash (7 days), the opaque ex-admin id in the audit tables, and provider backups and logs.

**Merge conditions:**
- **C1 (open):** commit this review and the Manager review in the worktree before the single push, copying `arch-phase4.md`, `manager-phase4.md` and `plan.md` byte for byte from the shared folder (Manager condition a). Then one push and a draft PR. CI on the final head must be green in a single attempt on both runs: the build job, and the PostgreSQL job with "All 34 required PostgreSQL tests executed and passed" and e2e. The result goes in the PR description only. A CI failure reopens this review.
- **C2 (open, owner):** merging to `main` starts the automatic Vercel production deployment, so the merge approval is also the deployment approval.
  - Code-only release, no migration. Rollback target: the production deployment of `ad6b55a` (`A8GhBhUGUhaS1vP5b9D54YHGnifz`).
  - **A code rollback does not restore a deleted account.**
  - Post-deploy checks are public and read-only. The route refuses unauthenticated and cross-origin requests without deleting anything. The `/puppy` dialog is opened and checked up to "ביטול" only. Sign-in, an existing plan, the map and the offline fallback still work.
  - **No real account may be deleted as verification.**
- **C3 (open, does not block this merge):** the real-device checks (dialog on a phone, keyboard, VoiceOver/TalkBack reading the scope) stay PENDING for the 4.8 matrix.

**Next slice (Architect decision): 4.5, pilot access allowlist**, per the approved plan.
- Its contract is designed after 4.4 is merged.
- The allowlist is built now. Opening the pilot to non-tester addresses stays blocked until the owner's sender domain is verified (owner decision, plan.md).
- The never-verified-accounts follow-up is re-evaluated there.

#### Required Corrections
None.


---

## Slice 4.3 record (APPROVED, merged in `ad6b55a`; closed, not reopened)
The text below is the slice 4.3 contract and its final Architect review exactly as approved, with headings demoted one level and its status lines qualified as slice 4.3.

### Status
STATUS (slice 4.3): APPROVED

Slice 4.3 approved in final review on 2026-11-12 (see "Architect Review").

Revision for **slice 4.3** (public shell asset caching), 2026-11-12. Slice 4.2 is approved, merged (`7bc45f8`) and deployed. Its contract and final reviews are kept unchanged as a closed record in "Slice 4.2 record" below and are not reopened.

### Phase Goal
Deliver the remaining ROADMAP Phase 4 work (PWA quality and private pilot) as the ordered slices of `team-Yuri/plan.md`: 4.1 and 4.2 are done; this revision details **slice 4.3 only**; 4.4-4.8 keep their plan.md scope and get their own contract later, each before it starts.

**Slice 4.3 goal:** the service worker keeps a versioned cache of **immutable public build assets only**:
- `/_next/static/*`, which includes the bundled Heebo fonts in `/_next/static/media/`;
- the four app icons in `/icons/`.

Nothing else may be cached: never HTML, API responses, RSC payloads, signed media URLs or user data. Caches from earlier worker versions are purged on activate. The new worker reaches existing installations only through the 4.2 mechanism: a version bump, then the owner's tap on "לעדכן עכשיו". The P4-1 offline fallback (`woffiz-offline-v1`, `/offline.html`) keeps working exactly as today.

**Honest value statement.**
- Next.js already serves `/_next/static/*` with a long-lived immutable HTTP cache header, so 4.3 adds little speed on an ordinary repeat visit.
- What it adds:
  - shell code, styles and fonts survive browser HTTP-cache eviction for the installed app;
  - the icons (served `max-age=0, must-revalidate`) no longer need revalidation;
  - a strictly allowlisted cache, which slice 4.7 can measure.
- 4.3 claims no performance improvement. Measurement belongs to 4.7.

### Source References
- `team-Yuri/plan.md` (APPROVED), slice 4.3: "Cache immutable public build assets (`/_next/static/*`, icons, fonts) in a versioned cache. Never cache HTML, API, RSC, signed media URLs or user data. Purge old caches on activate."
- ROADMAP.md Phase 4: "Cache public shell assets only; show honest offline states". PRD.md §10: "Cache public static assets only in MVP. Full offline training and offline progress submission are excluded"; §8: "Never expose private content through shared caches".
- docs/DECISIONS.md P4-1 (offline worker, `woffiz-offline-v1`, rollback) and P4-2 (owner-activated update, `sw-version`, rollback worker activates itself).
- Code baseline: `origin/main` `7bc45f8` (`public/sw.js` with `// sw-version: 4.2.0`, `next.config.ts` headers for `/sw.js` and `/offline.html`, `e2e/offline.spec.ts`, `e2e/pwa.spec.ts`, `src/lib/pwa/update.ts`).
- Observed on the deployed app (2026-11-12, public files only): `/icons/*.png` and `/art/*.webp` are served `Cache-Control: public, max-age=0, must-revalidate`. Fonts are bundled by Next.js into `/_next/static/media/heebo-*.woff2`.
- Next.js guide `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` (service worker headers).

### Architectural Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| S1. 4.3 branches from `main` `7bc45f8`. No other PR is open (checked 2026-11-12). | Clean base after the 4.2 merge. | No overlap to coordinate. |
| S2. **Allowlist, exact.** A request is cacheable only if all hold: GET; same origin; no `Range` header; not a navigation; no `RSC` request header and no `_rsc` search parameter; and the URL pathname either starts with `/_next/static/` or is one of `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-512.png`, `/icons/apple-touch-180.png`. Everything else is passed to the network untouched, as today. Explicitly excluded: page navigations, `/api/*` (auth, attempts, mastery, media playback and the HMAC media route), `/_next/image`, `/_next/data`, `/manifest.webmanifest`, `/sw.js`, `/offline.html` (it stays only in the offline cache), `/art/*` (owner decision 2026-11-12), every cross-origin URL (including Supabase signed storage URLs). | A positive allowlist cannot accidentally admit a new private route. Every path on it is public and identical for every account. | A new public asset type needs an explicit contract change. |
| S3. **Storable responses only:** `response.ok`, status exactly 200, `response.type === 'basic'`, and no `Cache-Control` containing `no-store` or `private`. Never 206, opaque, redirected or error responses. A failed or rejected write (including quota) is ignored and never breaks the response to the page. | Avoids poisoning the cache with partial, error or non-public responses. | The page always gets the network response when caching fails. |
| S4. **Strategies.** `/_next/static/*` is cache-first: content-hashed, so a cached entry is never stale. On a miss it fetches, stores if S3 allows, and returns. `/icons/*` is stale-while-revalidate: it serves the cached copy and refreshes it in the background, because the file names are not hashed. An uncached asset with no network fails as it does today; there is no synthetic response. | Correct per asset type. Hashed files never need revalidation; unhashed icons still pick up changes. | An icon change reaches clients on the next visit even without a version bump. |
| S5. **Versioning.** The worker version becomes a single constant in `public/sw.js` (`SW_VERSION = '4.3.0'`), and the shell cache is named `woffiz-shell-<SW_VERSION>`. The constant replaces the `// sw-version:` comment as the one place to bump; README is updated accordingly. Install precaches **only** `/offline.html` (unchanged); the shell cache fills at runtime. | One source of truth ties the cache name to the update mechanism. A light install cannot fail on a missing build asset. | Each deployment that needs a new worker bumps one constant, and its activation purges the previous shell cache. |
| S6. **Purge on activate.** `activate` deletes every cache whose name starts with `woffiz-` except `woffiz-offline-v1` and the current `woffiz-shell-<SW_VERSION>`, then `clients.claim()` as today. | Keeps storage bounded across versions and keeps the offline fallback intact. | The rollback worker (P4-2/D6) still deletes all `woffiz-*` caches, including shell caches. |
| S7. **Size bound within a version.** After each write the shell cache is trimmed oldest-first to a maximum entry count. The Manager sets the number from the measured production build: at least the full asset set of two builds, and a documented byte estimate. | Deployments without a version bump add new hashed chunks under the same cache name. | Storage stays bounded even if a bump is forgotten. |
| S8. **Navigation and offline behavior unchanged.** The navigation branch of the `fetch` handler (network-first, `/offline.html` on network failure, HTTP errors pass through), the `woffiz-offline-v1` name and contents, the `message` handler (`SKIP_WAITING` only, same origin) and the waiting rule of P4-2 stay as merged. | The owner requires the live fallback and the 4.2 update model to keep working. | The existing `offline.spec.ts` and `pwa.spec.ts` cases stay green. The one exception is the cache-content assertion, which 4.3 deliberately redefines (see Testing). |
| S9. **Rollout through 4.2.** The 4.3 worker is published by the S5 bump (`4.2.0` to `4.3.0`). Existing 4.2 installations keep the 4.2 worker, which caches nothing new, until the owner taps "לעדכן עכשיו". After the tap and the single reload, the 4.3 worker activates, purges any non-current `woffiz-shell-*` cache and starts filling its own. First-time visitors get 4.3 at once. | No silent activation (D4). | Until the tap, behavior is exactly 4.2. |
| S10. **No other change:** no server, database, API, environment variable, dependency, `next.config.ts` header, `public/offline.html`, manifest, icon file, layout or UI change. | 4.3 is service-worker behavior only. | No migration and no Vercel configuration. Merging to `main` still triggers the automatic production deployment, which the owner approves explicitly. |

### Constraints / Non-Negotiables
- Progression invariants untouched. No change to attempts, mastery, plans, generation, media, ownership or admin code.
- No private data in any cache. The allowlist (S2) and the storable-response rule (S3) are the only admission path.
- The P4-1 offline fallback and the P4-2 owner-activated update keep working unchanged (S8, S9).
- Video production stays paused, `MEDIA_REQUIRED` stays off and techniques stay DRAFT. 4.3 does not touch media code and never caches media or media URLs.
- Pilot scope stays as agreed: no videos; approved emails only once the sender domain is verified (4.5); first-party analytics in 4.6.
- No deployment, merge or production change without explicit owner approval. Merging to `main` is the production deployment.

### Technical Boundaries / Out of Scope
- Caching pages, RSC payloads, API responses or any per-account response. Offline training or offline report submission.
- `/art/*` artwork (owner decision 2026-11-12: excluded).
- Precaching a build manifest (needs a build-time step); `/_next/image` optimization caching; Background Sync; push.
- Performance measurement and claims (slice 4.7). Account deletion (4.4), allowlist (4.5), metrics and alerts (4.6), device matrix and usability (4.8).
- Any change to the completed 4.2 reviews.

### Dependencies and Interfaces

#### Expected files (slice 4.3)
Modified:
- `public/sw.js`: the S2 predicate, S3 storable rule, S4 strategies, S5 constant and cache name, S6 purge, S7 trim. The navigation branch and the `message` handler are unchanged.
- `e2e/offline.spec.ts`: only the test "only the public offline page is ever cached" is redefined to the 4.3 invariant (see Testing). No other case changes.
- `e2e/pwa.spec.ts`: new cases for purge on activate and the 4.2 to 4.3 update path. Existing cases unchanged.
- `README.md` "Installation and updates": the version constant replaces the comment marker, and the section lists what is cached and why.
- `docs/DECISIONS.md`: a new `P4-3` row after `P4-2`, superseding the "only `/offline.html` is ever cached" part of P4-1.

New:
- A unit test that loads `public/sw.js` in an isolated context with stubbed worker globals and tests the S2 predicate, the S3 rule, the S6 purge selection and the S7 trim. The Manager chooses the harness. `public/sw.js` stays a single, dependency-free file unless the Manager justifies a split. A split requires matching no-store headers, which means touching `next.config.ts`, and that is a contract change.

Not touched: `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, `public/icons/*`, `public/art/*`, `src/app/layout.tsx`, `src/components/pwa/*`, `src/lib/pwa/*`, `playwright.config.ts`, `.env.example`, `prisma/`, `package.json`, `package-lock.json`, all of `src/server/`.

#### Interfaces
- Cache names: `woffiz-offline-v1` (unchanged) and `woffiz-shell-<SW_VERSION>` (new).
- The page-to-worker message protocol is unchanged (`{ type: 'SKIP_WAITING' }` only).
- No HTTP API, schema or environment variable.

### Data / State Considerations
- The only new stored data is public build assets and icons, identical for every visitor. They hold no personal data, so retention rules for personal data do not apply.
- Storage is bounded by S6 (one shell cache per version) and S7 (entry cap within a version).
- No `localStorage`, `sessionStorage`, IndexedDB or server state.

### Security / Privacy Considerations
- The admission rule is a positive allowlist of public paths (S2) plus a public-response check (S3). The cache key never involves cookies or accounts.
- Signed media URLs (`/api/media/*`, Supabase storage) are excluded by path and by origin. So are auth and progression APIs.
- A shared device after sign-out: cached entries are public assets only, so nothing account-specific remains.
- The rollback worker removes every `woffiz-*` cache.

### Testing and Lint Expectations
Automated (Developer, recorded in `dev-phase4.md`):
- `npm run check` passes.
- **Unit, S2 matrix.**
  - Allowed: a chunk, a CSS file and a font under `/_next/static/`, and each of the four icons.
  - Rejected:
    - `/`, `/home` and a navigation request;
    - `/map?_rsc=…`, and any request with an `RSC` header;
    - `/api/auth/get-session`, `/api/attempts`, `/api/mastery`, `/api/media/playback`, `/api/media/local?…` and `/api/media/versions/<id>/captions`;
    - `/_next/image?url=…` and `/_next/data/…`;
    - `/art/map-painted.webp`, `/manifest.webmanifest`, `/sw.js`, `/offline.html` and `/icons/other.png`;
    - a cross-origin storage URL, POST, and a `Range` request.
- **Unit, S3:** 200 basic is stored; 206, 404, 500, opaque, redirected, `no-store` and `private` are not.
- **Unit, S6:** the purge keeps exactly `woffiz-offline-v1` and the current shell cache, deletes other `woffiz-*` caches, and leaves non-`woffiz-` caches alone.
- **Unit, S7:** the cache is trimmed oldest-first to the cap.
- **E2E (Playwright, three viewports), privacy proof.** After a signed-in session that loads `/home`, `/map`, `/review`, `/puppy` and a current exercise, and calls at least one API (`/api/auth/get-session`):
  - `caches.keys()` is exactly `woffiz-offline-v1` and `woffiz-shell-4.3.0`;
  - `woffiz-offline-v1` holds exactly `/offline.html`;
  - every key in the shell cache matches the S2 allowlist, and the shell cache is not empty;
  - no key is a navigation URL, `/api/*`, an `_rsc` URL, `/_next/image` or `/art/*`.
  
  On the desktop project the same assertion also runs after a session that resolves a fixture clip (existing demo-video setup), proving that media URLs are never cached.
- **E2E, offline behavior.**
  - With the network offline, a cached `/_next/static/` asset fetched by the page returns 200 from the worker.
  - An API fetch fails.
  - A navigation shows the unchanged offline fallback.
  - All existing `offline.spec.ts` cases pass.
- **E2E, update and purge.**
  - Starting from a controlled page with a seeded stale `woffiz-shell-0.0.0` cache, a waiting new worker (the 4.2 script-URL trigger) shows the banner and caches nothing until the tap.
  - After "לעדכן עכשיו" and the single reload, the stale shell cache is gone and `woffiz-offline-v1` is intact.
  - Existing `pwa.spec.ts` cases pass.
- CI on standard PostgreSQL is green on the final head, as for 4.2. 4.3 adds no PostgreSQL-only test.

Real device (owner, PENDING until done; part of the 4.8 matrix, not a merge blocker):
- iPhone, installed app after the 4.3 update:
  - cold start works;
  - the offline fallback still appears in airplane mode;
  - website data for the site stays small (Settings, Safari, Advanced, Website Data).
- Android Chrome, installed app: same checks.
- Deployed build, after an owner-approved merge: in DevTools Application, Cache Storage shows only `woffiz-offline-v1` and `woffiz-shell-4.3.0`, with allowlisted entries.

### Functional Testability
- Page/screen the user can open: any app page. The new state is visible in DevTools, Application, Cache Storage.
- User-visible behavior: none intended beyond the existing update banner for 4.2 installations. The app and the offline fallback behave as before.
- Command-line flow: `npm run check`, `npm run test:e2e`.
- API endpoint / request: none.
- Minimal end-to-end flow:
  1. Sign in on the local production build.
  2. Browse home, map, an exercise, review and puppy.
  3. Inspect the caches: only the offline page and allowlisted static assets.
  4. Go offline: a cached asset loads from the worker, and a page shows the offline fallback.
- Expected observable result: as above, asserted by the e2e privacy proof.

### Handoff Notes for Manager
- Detail slice 4.3 only. Base `main` `7bc45f8`.
- Owner decision (2026-11-12): `/art/*` stays **out** of the allowlist (S2 unchanged).
- Choose the S7 entry cap from the measured production build, and record the count and bytes.
- Choose the harness for unit-testing `public/sw.js` without splitting the file (S10).
- Record `P4-3` in docs/DECISIONS.md. Do not edit the 4.2 rows (`P4-2`) except to reference `P4-3`.
- Verify the Cache Storage and service-worker fetch semantics used (`cache.put` restrictions, `Response.type`, `respondWith` with stale-while-revalidate and `event.waitUntil`) against current official documentation.

### Open Questions (slice 4.3)

| Question | Why It Matters | Required Decision |
|---|---|---|
| Should the public artwork `/art/*.webp` (5 files, about 700 KB, unhashed, served `max-age=0, must-revalidate`) join the allowlist under the stale-while-revalidate rule like the icons? | It is the heaviest public shell asset and the one with the clearest repeat-visit benefit, but plan.md lists only `/_next/static/*`, icons and fonts. | **Resolved by the owner, 2026-11-12: excluded.** |

Of the six open owner decisions in plan.md (alert channel, backups, retention, sending domain, pilot recruitment, performance profile), **none blocks 4.3**:
- the cache holds no personal data, so retention does not apply;
- 4.3 makes no performance claim, so the performance profile belongs to 4.7;
- the other four concern 4.4-4.8.

### Architect Review
ARCHITECT_REVIEW_STATUS (slice 4.3): APPROVED

Current revision: slice 4.3. The final reviews of slice 4.2 are in the closed record below.

#### Review Notes
Final review of slice 4.3, 2026-11-12.
- Inputs: `team-Yuri/manager-phase4.md` ("Manager Review", MANAGER_REVIEW_STATUS: APPROVED, no corrections; shared folder, uncommitted) and the 4.3 section of `team-Yuri/dev-phase4.md` (STATUS: COMPLETE; committed in the worktree).
- Branch `feature/phase-4-shell-cache`, HEAD `cd94c50`, base `7bc45f8`, worktree `C:\Users\אוהד\Documents\Woffiz-4.3`. Local only: the branch is not on the remote, and there is no PR or CI run yet.
- Checked read-only with git. Tests were not re-run by the Architect.

**Scope.**
- `git diff 7bc45f8 cd94c50` outside `team-Yuri/` touches exactly: `public/sw.js`, the new `src/lib/sw.test.ts` (test only), `e2e/offline.spec.ts`, `e2e/pwa.spec.ts`, `e2e/demo-video.spec.ts`, `README.md` and `docs/DECISIONS.md` (`P4-3` added, `P4-2` gains only a reference).
- A path-filtered diff over `next.config.ts`, `public/offline.html`, `src/` (apart from the new test), `package.json`, `package-lock.json`, `playwright.config.ts`, `.env.example`, `prisma/` and `vitest.config.ts` is empty.
- The `e2e/offline.spec.ts` change is limited to the redefined cache-content test plus an import.

**Compliance with S1-S10 (`public/sw.js` read in full):**

| Decision | Verdict | Evidence |
|---|---|---|
| S1 Base | Compliant | Branched from `7bc45f8`; no other open PR. |
| S2 Allowlist | Compliant (stricter on icons) | `isShellRequest`: GET, same origin, not navigate, no `Range`/`RSC` header, no `_rsc`. Then either a `/_next/static/` prefix (any query) or one of the four exact icon paths with no query. Everything else returns without `respondWith`. `/art/*` excluded (owner decision); the negative check proves it. |
| S3 Storable | Compliant | `ok`, 200, `basic`, not `redirected`, no `no-store`/`private` (case-insensitive). Writes are in `try`/`catch`; the page always gets the network response. |
| S4 Strategies | Compliant | `/_next/static/*` cache-first (a hit makes no fetch; a rejected miss stays rejected). Icons stale-while-revalidate, with the refresh via `waitUntil`. No synthetic responses. |
| S5 Versioning | Compliant | `SW_VERSION = '4.3.0'` is the single bump point (the `// sw-version:` marker is removed; README and `P4-3` updated). `woffiz-shell-4.3.0`. Install precaches only `/offline.html`. |
| S6 Purge | Compliant | `activate` keeps exactly `woffiz-offline-v1` and the current shell cache, deletes other `woffiz-*` caches, leaves foreign caches, and calls `clients.claim()`. |
| S7 Cap | Compliant | 160 entries, derived from the measured build: N = 67 files, 1,229,393 B; 2 × (67 + 4) = 142 ≤ 160; about 3.2 MB at the cap. Trim is oldest-first after each put. |
| S8 Unchanged behavior | Compliant | The navigation branch, the offline cache name and contents, and the `SKIP_WAITING` handler are behaviorally unchanged. The only `skipWaiting()` is in that handler. The pre-existing `offline.spec.ts` and `pwa.spec.ts` cases are green. |
| S9 Rollout through 4.2 | Compliant | A waiting 4.3 worker handles no fetches (only the active worker does), and its install writes only `/offline.html`. E2E shows a seeded stale shell cache surviving until the tap and purged after the single reload. |
| S10 No other change | Compliant | No server, database, API, env, dependency, header, offline page, manifest, icon, layout or UI change. |

**The seven flagged interpretations, all acknowledged:**
1. **Test location `src/lib/sw.test.ts` with a `node:vm` harness: acknowledged.**
   - It runs the real `public/sw.js` text without adding exports, hooks or conditional code, so S10's single-file rule holds.
   - Its in-memory `caches` models the specified put/keys order, not a browser; that gap is covered by the e2e proofs.
   - The location under `src/lib` is accepted because the existing Vitest configuration collects tests there.
2. **Icons admitted only with an empty query string: acknowledged.** It is stricter than S2's exact-path list. A queried icon URL simply goes to the network. It adds no risk and cannot admit anything new.
3. **Media variant in `demo-video.spec.ts`: acknowledged.** This is exactly the contract's "on the desktop project … after a session that resolves a fixture clip (existing demo-video setup)". It also fetches captions and a playback link through the worker.
4. **"Caches nothing until the tap": acknowledged as the correct reading of S9.**
   - By platform semantics a waiting worker does not handle fetches. The unit case shows its install writes only `/offline.html` into the unchanged offline cache.
   - The e2e shows a stale shell cache surviving while the worker waits and being purged after the tap.
   - Refreshing `/offline.html` at install was already 4.2 behavior.
5. **Renamed test title** ("only the public offline page and public build assets are ever cached"): **acknowledged.** The old title would be false under P4-3. The contract's Testing section is the redefinition, and the title appears in no CI or required-test list.
6. **`SW_VERSION` comment in `pwa.spec.ts`: acknowledged.** Comment only; it follows S5's removal of the marker.
7. **`caches.match(url, { cacheName })` for lookups: acknowledged.** A read never creates a cache, and the URL-string key ignores request headers, as S2/S3 intend.

**Evidence assessment.**
- `npm run check` is green in a clean worktree. Unit tests: 285, 69 of them new over the real worker, with a recorded negative check that the Manager independently reproduced on four mutations.
- E2E: 217 of 217 combined, 23 only on a rerun after a local PGlite restart (reported as reruns). Every 4.3 case passed in the Manager's own rerun at all three widths.
- The privacy proof as text shows exactly two caches: `woffiz-offline-v1` with 1 entry, and `woffiz-shell-4.3.0` with 23 entries under `/_next/static/chunks` and `/_next/static/media` only.
- Functional testability is demonstrated.

**The `auth.spec.ts` failure is acknowledged as unrelated to 4.3.** The test "register, onboard, refresh, sign out and sign back in…" stays on `/onboarding` instead of reaching `/home` within 5 s.
- The Manager ran it 12 times on each tree, on the same local database: `main` `7bc45f8` without 4.3 code failed 6/12; the 4.3 branch failed 5/12. Every failure had the same assertion and URL.
- That shows the failure is pre-existing local flakiness, not a 4.3 effect. 4.3 touches neither auth, onboarding nor `auth.spec.ts`.
- The gate is the single CI run on standard PostgreSQL, where the test passed for 4.2. Separate follow-up, outside 4.3: investigate this test's local flakiness on PGlite (owner or orchestrator to schedule).

**Non-blocking observations:**
1. The deployed `/_next/static/immutable/…` layout is covered by a unit case only, because the local build does not produce it. The deployed Cache Storage check stays with the owner.
2. Icons enter the cache only when requested (installation, `apple-touch-icon`). This is documented.
3. The e2e update path registers the worker under a second URL (the 4.2 pattern). A real `SW_VERSION` bump was not re-run for 4.3. It is the mechanism already verified manually in 4.2.
4. `Vary: *` was not checked against a normative source. It is harmless here because the cache key is the URL string, and 206 is rejected by the status rule.

**Merge conditions:**
- **C1 (open):** the Architect and Manager reviews are committed in the worktree **before** the single push (Manager condition a). Then one push and a draft PR. CI on that final head must be green in a single attempt on both runs: "All 28 required PostgreSQL tests executed and passed", e2e, and the build job. The CI result goes in the PR description only, with no further documentation-only commit. A CI failure reopens this review.
- **C2 (open, owner):** merging to `main` starts the automatic Vercel production deployment, so the merge approval is also the deployment approval.
  - Rollback target: the current production deployment of `7bc45f8`. A worker defect is handled by the P4-2/D6 rollback worker, which deletes every `woffiz-*` cache, including the shell cache.
  - After deployment, check sign-in, an existing plan, the map, the offline fallback, and that existing 4.2 installations see the banner once. After the tap, Cache Storage holds only `woffiz-offline-v1` and `woffiz-shell-4.3.0` with allowlisted entries.
- **C3 (open, does not block this merge):** the real-device and deployed-build items stay PENDING for the 4.8 matrix.

**Next slice (Architect decision): 4.4, account deletion**, per the approved plan order. Its contract is designed after 4.3 is merged. It is the first slice since 4.1 that changes server and data code, so it gets its own full contract (transaction scope, the table inventory, a possible migration and the production order). The six open owner decisions are re-checked there; retention of failed-job payloads is expected to matter for 4.4.

#### Required Corrections
None.


---

## Slice 4.2 record (APPROVED, merged in `7bc45f8`; closed, not reopened)
The text below is the slice 4.2 contract and its final Architect reviews exactly as approved, with headings demoted one level and its review-status line qualified as slice 4.2.

### Phase Goal
Deliver the remaining ROADMAP Phase 4 work (PWA quality and private pilot) as the ordered slices 4.2-4.8 of `team-Yuri/plan.md`.

This revision details **slice 4.2 only**. Slices 4.3-4.8 keep the scope given in plan.md and get their own detailed contract in a later revision of this file, each before it starts.

**Slice 4.2 goal:** an owner can (1) find clear, honest, browser-appropriate instructions for installing Woffiz, (2) activate an available app update safely and only by their own action, and (3) never reach the `?state=` demo views in production. The views stay available in development and tests, and the live offline fallback (P4-1) keeps working unchanged.

### Source References
- `team-Yuri/plan.md` (APPROVED), slice 4.2.
- ROADMAP.md, Phase 4: "Verify HTTPS, manifest, icons, installation guidance and update behavior".
- PRD.md §10, PWA scope: contextual installation guidance; "do not promise identical installation prompts"; cache public static assets only.
- DESIGN_SYSTEM.md: §8 Home and "Puppy and settings", §9 Components and states, §10 Motion (no looping animations, reduced motion), §12 Accessibility and RTL, §14 State matrix.
- docs/DECISIONS.md: 6 (manifest, icons), 9 (`?state=` previews must be gated before public deployment) and P4-1 (offline recovery service worker and its rollback).
- Next.js guide `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` (install prompt pattern, `display-mode: standalone`, service worker headers, `updateViaCache: 'none'`).
- Code baseline: origin/main `d8add95` (`public/sw.js`, `src/components/pwa/ServiceWorkerRegistration.tsx`, `src/lib/devState.ts`, `src/server/local-mode.ts`, `src/app/manifest.ts`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`).

### Architectural Decisions

| Decision | Rationale | Consequence |
|---|---|---|
| D1. 4.2 branches from current `main` (`d8add95`), not from the PR #3 branch, and does not assume PR #3 is merged or deployed. | PR #3 is a draft that is still under release review. Coupling would block 4.2 on Phase 3. | Whichever of the two merges second rebases onto main and resolves the documentation overlaps listed below. |
| D2. Demo previews are enabled only when `devPreviewsEnabled(env)` is true: `NODE_ENV` is `development` or `test`, or `isLocalMachine(env)` (`APP_ENV=local` and a localhost `BETTER_AUTH_URL`). The gate lives in `src/server/local-mode.ts` next to the existing helpers and is evaluated on the server. | It reuses the proven local-machine rule. The Playwright server is a production build with `APP_ENV=local` on localhost, so the e2e previews keep working. Vercel never sets `APP_ENV` and its auth URL is HTTPS, so two independent conditions block it. | In production, `?state=` is ignored and the real page renders: no error, no 404, no hint that previews exist. No new environment variable. |
| D3. `parseDevState` takes the gate result. Every page reads `state` only through the gated parser (map, review, onboarding). | One choke point; a test can enforce it. | A future page cannot add an ungated preview without failing the static test. |
| D4. Update model: a new service worker that finds an **active** worker **waits**. It is activated only when the owner taps "update" (page → worker message `{ type: 'SKIP_WAITING' }`; any other message is ignored). After `controllerchange` that the owner asked for, the page reloads **once**. With no active worker (first install), the worker activates at once, as today, so the offline fallback is available from the first visit. | This replaces the silent `skipWaiting()` on every install in P4-1. The owner controls when the page reloads, so nothing is reloaded under a form in progress. | The update prompt appears once for existing installs the first time the 4.2 worker is published. That is accepted and documented. |
| D5. "Update" means a new service worker version. App pages and data are never cached (P4-1 is network-first, and 4.2 adds no caching), so a new deployment already reaches the owner on the next navigation. While the app is visible, the client calls `registration.update()` at most once per hour, so long-open installed apps discover a new worker. | Keeps 4.2 small, and a build-version endpoint is not needed now. | Bumping the worker (comment or cache version) is how a deployment asks clients to refresh. This is documented in README. Slice 4.3 (asset caching) relies on the same mechanism. |
| D6. The P4-1 rollback path is unchanged: a rollback `sw.js` calls `skipWaiting()` itself, deletes the `woffiz-*` caches and unregisters. The waiting rule in D4 belongs to the normal worker only. | An emergency rollback must never wait for a tap. | The README rollback text names both behaviors. |
| D7. The offline fallback's behavior is preserved unchanged: network-first for GET navigations only, `/offline.html` precached at install in `woffiz-offline-v1`, nothing written at runtime, HTTP errors pass through. 4.2 changes neither `public/offline.html` nor the headers in `next.config.ts`. The cache name stays `woffiz-offline-v1` because the offline page does not change. | The owner asked to preserve the live fallback. | All existing `e2e/offline.spec.ts` cases stay green with at most the minimal changes caused by D4. |
| D8. Install guidance is detected only on the client, from `display-mode: standalone` / `navigator.standalone`, `beforeinstallprompt` support and a coarse platform check. There are four cases: **installed** ("Woffiz כבר מותקנת במכשיר הזה"); **native prompt available** (Chromium: an "התקנה" button calling `prompt()` once); **iOS/iPadOS** (step-by-step: Share button, then "הוספה למסך הבית", then "הוספה"); **other or unknown** (honest browser-menu instructions and a statement that some browsers do not support installation). Detection logic is a pure, unit-tested module. | Follows PRD §10 and the Next.js pattern. It never promises an identical prompt. | iPhone wording and Share-sheet labels are verified on a real device before the copy is final (see the list below). |
| D9. Placement: an "התקנה במסך הבית" card on `/puppy` only, always present, with the full guidance and anchored at `#install`. `/home` is not changed. | `/puppy` is the settings surface (DESIGN_SYSTEM §8), and home keeps its designed scene. | **Owner decision (2026-11-10): `/puppy` only.** There is no home hint and no dismissal state. |
| D10. The update prompt is a global client component in the root layout: a non-modal banner with `role="status"` (polite) that does not steal focus. It offers "לעדכן עכשיו" (primary) and "אחר כך" (ghost; hides it until the next page load). It sits clear of the bottom navigation and respects safe-area insets. There is no animation beyond the allowed panel transition, and none under reduced motion. | DESIGN_SYSTEM §9/§10/§12. A non-blocking banner, because updating is never mandatory. | Copy (proposed): "גרסה חדשה של Woffiz מוכנה. העדכון יטען מחדש את העמוד." |
| D11. No server, database, API, environment-variable or dependency changes. | 4.2 is client and service-worker behavior plus a server-side gate. | No migration, no Vercel configuration, no secrets. |

### Constraints / Non-Negotiables
- Progression invariants untouched: no change to attempts, mastery, plans, generation, media or ownership code.
- The offline fallback behaves exactly as P4-1 (D7). No new cache and no cached page, API, RSC or user data.
- Hebrew RTL copy using DESIGN_SYSTEM tokens and components (Card, Button, StateMessage patterns). 48 px controls, visible focus, no looping animation, reduced motion respected, no horizontal overflow at 360, 768 and 1280 px.
- Previews stay fully available under `next dev`, unit and integration tests, and the Playwright production build on a local machine.
- Pilot scope stays as agreed: no videos (`MEDIA_REQUIRED` off, techniques DRAFT); registration limited to approved emails only after the sender domain is verified (slice 4.5); first-party analytics in slice 4.6. 4.2 adds no analytics, tracking or persistent client storage.
- No deployment, merge or production change is part of this slice's implementation. The deployed-build checks run only after the owner approves a deployment.

### Technical Boundaries / Out of Scope
- Public shell asset caching (slice 4.3). Account deletion (4.4). Pilot allowlist (4.5). Metrics and alerts (4.6). Drills, performance and accessibility measurement (4.7). Device matrix, PRD §11 and usability (4.8).
- Push notifications, background sync, periodic sync, manifest screenshots or shortcuts, a custom install UI on iOS beyond instructions, and build-version polling.
- The DECISIONS provider-table correction (deferred until PR #3 is merged; PR #3 edits that table).
- Any change to `public/offline.html`, `src/app/manifest.ts`, the icons, `next.config.ts`, `playwright.config.ts` or `.env.example`.

### Dependencies and Interfaces

#### Expected files (slice 4.2)
New:
- `src/lib/pwa/install.ts`: pure platform and install-state detection (input: UA string, standalone flags, prompt availability; output: one of the D8 cases), with `src/lib/pwa/install.test.ts`.
- `src/components/pwa/InstallGuide.tsx` (+ `.module.css`): the `/puppy` card content.
- `src/components/pwa/UpdatePrompt.tsx` (+ `.module.css`): the update banner.
- `src/lib/pwa/update.ts`: a small update controller (waiting-worker detection, message, reload-once guard, throttled `update()`), unit-testable with a fake registration, with `src/lib/pwa/update.test.ts`.
- `e2e/pwa.spec.ts`: install guidance cases, the update prompt flow and previews on the local server.

Modified:
- `public/sw.js`: D4 install and message handling; everything else unchanged.
- `src/components/pwa/ServiceWorkerRegistration.tsx`: hands the registration to the update controller and renders `UpdatePrompt`.
- `src/lib/devState.ts`: gated parsing (D3).
- `src/server/local-mode.ts` and `src/server/local-mode.test.ts`: `devPreviewsEnabled` and its environment matrix.
- `src/app/(main)/map/page.tsx`, `src/app/(main)/review/page.tsx`, `src/app/onboarding/page.tsx`: use the gate.
- `src/app/(main)/puppy/page.tsx`: install card.
- `src/app/layout.tsx`: only if the prompt is mounted there rather than inside `ServiceWorkerRegistration`.
- `e2e/offline.spec.ts`: only if D4 requires it (for example, waiting for activation on first install). No case is removed.
- `DESIGN_SYSTEM.md`: §8 new "Install guidance and app update" subsection, §9 a line for the update banner and install card, §14 new rows "Install guidance" and "App update" appended after "Entire app offline".
- `docs/DECISIONS.md`: a new `P4-2` row appended after `P4-1` (records D2-D10 and supersedes the "remove or gate" note of decision 9 and the auto-activation part of P4-1).
- `README.md`: a short "Installation and updates" section (how a deployment triggers the prompt, rollback worker behavior, the previews rule), placed before "## Checks".

#### Overlap with draft PR #3 (checked 2026-11-10)
PR #3: `feature/phase-3a-media-foundations`, head `3ddd5ba`, base `main`, merge-base `d8add95`, draft, open, mergeable, 101 files changed. It is not assumed merged or deployed.

| File | PR #3 change | 4.2 change | Overlap | Action |
|---|---|---|---|---|
| Application code (all expected 4.2 code files above) | none | yes | **None** | — |
| `DESIGN_SYSTEM.md` | §9 "Video" line; §14 "Video" row | new §8 subsection; new §9 line; §14 rows after "Entire app offline" | **Same file, nearby regions in §9 and §14**; low conflict risk | Do not edit the Video lines; place §9 text after "Do not rely on tooltips…"; resolve on rebase by keeping both |
| `docs/DECISIONS.md` | adds rows 58-89 before the Phase 4 section; edits the provider table | appends `P4-2` after `P4-1` | **Same file, adjacent regions** | Do not touch the provider table or rows 58-89; resolve on rebase by keeping both |
| `README.md` | appends notes near line 87 (local PGlite) and an AI/media section | new section before "## Checks" | **Same file, separate regions** | Keep the section self-contained |
| `playwright.config.ts` | projects and media env | none | **None if 4.2 complies** | 4.2 must not edit it |
| `.env.example` | media variables | none | **None if 4.2 complies** | 4.2 must not edit it |

No 4.2 code file is touched by PR #3. The only overlaps are three documentation files, and they are flagged here for the owner before implementation.

#### Interfaces
- Page → service worker: `postMessage({ type: 'SKIP_WAITING' })`, accepted only by a waiting worker; anything else is ignored.
- Server gate: `devPreviewsEnabled(env = process.env): boolean`, and `parseDevState(value, enabled)`.
- No HTTP API, no database schema, no environment variable.

### Data / State Considerations
- No server data changes and no persistent client storage (no `localStorage` key).
- The `woffiz-offline-v1` cache contents are unchanged (only `/offline.html`).
- The reload-once guard lives in memory or `sessionStorage` and is never persisted across sessions.

### Security / Privacy Considerations
- The previews gate is evaluated on the server, so the client cannot enable previews in production.
- The worker accepts only the one message type. It caches nothing new and keeps the same-origin CSP and no-store headers from P4-1.
- The install UI collects nothing, sends nothing and uses no third-party script.
- UA sniffing is used only to pick instruction text, never for access decisions.

### Testing and Lint Expectations
Automated (Developer, recorded in `dev-phase4.md`):
- `npm run check` (typecheck, lint, unit tests, production build) passes.
- Unit: the `devPreviewsEnabled` environment matrix (development, test, local machine, production with `APP_ENV` unset, `APP_ENV=local` with an HTTPS URL, `APP_ENV=preview`); `parseDevState` returns null when disabled; a static test that `state` search params are read only via the gated parser; install-state detection for each D8 case (iPhone Safari, iPadOS desktop-class UA, Android Chrome, desktop Chrome/Edge, Firefox, standalone); the update controller (first install shows no prompt, a waiting worker shows the prompt, tap → message → one reload, "אחר כך" → no message, throttled `update()`).
- E2E (Playwright, all three viewports, axe):
  - existing `e2e/shell.spec.ts` preview cases and all `e2e/offline.spec.ts` cases pass;
  - the `/puppy` install card renders the right case with emulated UA and standalone (via an init script) and a synthetic `beforeinstallprompt`;
  - `/home` renders as before, with no install hint;
  - the update prompt appears for a waiting worker, activates and reloads once on tap, and does nothing on "אחר כך";
  - keyboard focus order, RTL, reduced motion and no overflow at 360 px.
  If Chromium automation cannot install a second worker version, the Developer documents the limitation and covers the flow with the controller unit tests plus a recorded manual check.
- Production previews: proven by the unit matrix and the static choke-point test, plus one check against a production build started **without** `APP_ENV=local` (for example a separate script or one test-only server start) showing that `/map?state=error` renders the real map. Integration and e2e suites must never run against Supabase.

Real device (owner, recorded as PENDING until done; none blocks the merge of 4.2, all block the pilot release in 4.8):
- **iPhone Safari (current iOS), needs a real iPhone:**
  1. the `/puppy` card shows the iOS steps, and the Share-sheet labels match the Hebrew copy;
  2. Add to Home Screen works, and the icon and name are right (`apple-touch-180`, "Woffiz");
  3. launching from the home screen opens standalone at `/home` with the correct status bar and safe areas;
  4. in standalone the `/puppy` card says "already installed";
  5. the offline fallback appears in standalone with airplane mode on, and "ניסיון חוזר" recovers;
  6. after a new worker is deployed, reopening the installed app shows the update prompt, "לעדכן עכשיו" reloads once and "אחר כך" keeps working;
  7. VoiceOver reads the banner and the install steps in Hebrew in the right order;
  8. Reduce Motion on gives no transitions.
- **Android Chrome:** the native install button appears and installs; the installed app is standalone; the update prompt works.
- **Desktop Chrome/Edge:** the install button works. **Desktop Firefox and Safari:** honest instructions or the not-supported message.
- **Deployed build (after an owner-approved deployment only):** HTTPS, a valid manifest (DevTools Application panel), icons, and `?state=` ignored on the production URL.

### Functional Testability
- Page/screen the user can open: `/puppy` (install card), any page (update banner).
- User-visible behavior: browser-appropriate Hebrew install steps; an "already installed" state; an update banner that only acts on the owner's tap; production ignores `?state=`.
- Command-line flow: `npm run check`, `npm run test:e2e`.
- API endpoint / request: none (no new API).
- Minimal end-to-end flow: open the local production build → `/puppy` shows install guidance → deploy a changed worker locally → the banner appears → tap update → the page reloads once with the new worker; go offline → the fallback still appears.
- Expected observable result: as above; previews visible locally and invisible in a production-mode server without the local-machine flag.

### Handoff Notes for Manager
- Detail only slice 4.2 from this contract. Slices 4.3-4.8 are not designed yet.
- D9 resolved by the owner: install guidance on `/puppy` only; `/home` is not changed.
- **Flagged before implementation:** PR #3 overlaps 4.2 only in `DESIGN_SYSTEM.md`, `docs/DECISIONS.md` and `README.md` (documentation, separate or adjacent regions). No code overlap. 4.2 must not edit `playwright.config.ts` or `.env.example`.
- Verify the current service-worker lifecycle APIs (`skipWaiting`, `registration.waiting`, `controllerchange`, `beforeinstallprompt`) and the iOS Add to Home Screen behavior against current official documentation during design. The `beforeinstallprompt` event is non-standard and Chromium-only.
- Record decision `P4-2` in docs/DECISIONS.md, superseding the gating note of decision 9 and the auto-activation part of P4-1.

### Architect Review
ARCHITECT_REVIEW_STATUS (slice 4.2): APPROVED

#### Review Notes
Final review of slice 4.2, 2026-11-11.
- Inputs: `team-Yuri/manager-phase4.md` (revision 2, MANAGER_REVIEW_STATUS: APPROVED) and `team-Yuri/dev-phase4.md` (STATUS: COMPLETE).
- Branch `feature/phase-4-install-update`: code HEAD `6a028f5`, merge `d5218af` (parents `cb4b5df` and `505e2db`), artifact commits `05b9dc9` and `d6b629c`.
- Checked read-only with git against `origin/main` `505e2db`. Tests were not re-run by the Architect.

**Scope.** `git diff --stat 505e2db 6a028f5` = 26 files, +1321/−19, equal to the Developer evidence. Absent from the diff: `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons, `src/app/layout.tsx`, `src/app/(main)/home/*`, `playwright.config.ts`, `.env.example`, `prisma/`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`, `e2e/auth.spec.ts`. No test hook in application code (`git grep` for the e2e trigger in `src/` and `public/` is empty).

**Compliance with D1-D11:**

| Decision | Verdict | Evidence |
|---|---|---|
| D1 Base and PR #3 | Compliant | Branched from `d8add95` without assuming PR #3. After PR #3 merged (`505e2db`), the branch merged `main` as D1 prescribes for the second merger. One conflict (`ExerciseScreen.tsx`) resolved to `main` plus a marker. The three overlapping docs are insertions only. |
| D2 Server gate | Compliant | `devPreviewsEnabled(env)` = `NODE_ENV` development or test, or `isLocalMachine(env)`, in `src/server/local-mode.ts`. Matrix tested, including `APP_ENV=local` with an HTTPS URL and look-alike hosts. Production-build check `test:previews-gate`: A-C blocked, D shown. |
| D3 Single choke point | Compliant | `parseDevState(value, enabled)` has a required argument (`@ts-expect-error` proof). The static test pins the three callers, and its negative check is recorded. |
| D4 Owner-activated update | Compliant | `skipWaiting()` removed from `install`. The `message` handler accepts only a same-origin `{ type: 'SKIP_WAITING' }`. A first install activates by browser semantics (no active worker), and `activate` keeps `clients.claim()`. One reload after a requested `controllerchange`, with a once-guard shared by the 10 s fallback. |
| D5 Update meaning and checks | Compliant | `// sw-version:` marker; README documents bumping it. Throttled `registration.update()` at most hourly while visible, with rejections swallowed. |
| D6 Rollback path | Compliant | The `sw.js` header and README state that a rollback worker calls `skipWaiting()` itself, purges `woffiz-*` and unregisters. |
| D7 Offline fallback preserved | Compliant | `activate`, `fetch`, `CACHE` (`woffiz-offline-v1`) and `OFFLINE_URL` unchanged; `offline.html` and headers untouched. Unchanged `offline.spec.ts` green at three widths, including under the new worker. |
| D8 Install cases | Compliant | Pure `detectInstallCase` (installed, prompt, ios, other) with iPadOS desktop-class detection. Honest copy and no identical-prompt promise. The UA chooses text only. |
| D9 Placement | Compliant | Card on `/puppy` only (`#install`). `/home` untouched. No `localStorage`, `sessionStorage` or new cache. |
| D10 Banner | Compliant (acknowledged markup deviation accepted) | `role="status"` sits on the visible banner element, inside an always-present `aria-live="polite"` wrapper. This satisfies D10's "non-modal banner with `role="status"` (polite)" literally and avoids an empty status element on every page, which broke the unchanged `auth.spec.ts`. No focus move, 48 px buttons, safe area, no animation, reduced motion. Placement above the exercise practice bar via a presentation-only `data-practice-bar` attribute (owner-approved, revision 2). That attribute does not touch progression logic. |
| D11 No server, data, env or dependency change | Compliant | No API, schema, migration or environment variable. `package.json` adds only the `test:previews-gate` script; `package-lock.json` equals `main`. |

**Evidence assessment.**
- `npm run check` is green on a clean checkout.
- Unit: 216 tests, 64 of them new.
- Integration and e2e pass locally only with documented PGlite reruns (no test failed twice). This is accepted as local evidence; the authoritative single run is CI on standard PostgreSQL (C1).
- The Playwright limitation on service-worker script interception is documented. The fallback (controller unit tests, a script-URL e2e trigger in test code only, and a recorded two-build manual check of the real `sw-version` trigger) meets the arch requirement.
- Functional testability is demonstrated (install cases, update flow, gated previews).

**Non-blocking observations:**
1. A `status` element inside a polite live region may be announced twice by some screen readers. Covered by real-device item 7 (VoiceOver).
2. `preventDefault()` on `beforeinstallprompt` on every page suppresses Chromium's mini-infobar, so installation runs through `/puppy` or the browser menu. This is recorded in `P4-2`; re-evaluate with the usability sessions (4.8).
3. The first production deployment of 4.2 shows the update banner once to existing P4-1 installs, as accepted in D4. From then on, a deployment reaches installed clients' workers only if `sw-version` is bumped (README).
4. In this shared working copy, `npm run check` fails at lint on untracked files (`.claude/worktrees/` leftover, `pilot/` scripts). Not a code defect; owner housekeeping.

**Merge conditions:**
- **C1 (open):** CI green in a single run on standard PostgreSQL ("Integration and e2e on standard PostgreSQL" including `assert-required-tests`, and the e2e job). The branch is not on the remote yet, and CI runs on push and pull request, so pushing it and opening the PR is an owner-approved step. A CI failure reopens this review.
- **C2 (resolved by the owner, 2026-11-11):** the Team Yuri artifacts stay in the PR. This review changes `arch-phase4.md` after `05b9dc9`, so the updated file needs its own commit before the PR is opened.
- **C3 (open, does not block this merge):** all real-device and deployed-build items stay PENDING and block the pilot release (4.8).

**Next slice (Architect decision): 4.3, public shell asset caching**, as ordered in the approved plan.
- Rationale: it extends the same service worker, and it relies on the `sw-version` update mechanism that 4.2 delivers.
- Its design starts only after 4.2 is merged to `main`, because both change `public/sw.js`.
- Slices 4.4 (account deletion) and 4.5 (allowlist) follow. Neither is needed sooner, because opening the pilot is already gated by the verified sender domain and by 4.8.

#### Final review addendum (2026-11-12)
Scope: everything after the 2026-11-11 approval.
- Manager revision 3: CI runner pin, commit `0ce5973`.
- Manager revision 4: deterministic concurrency-test fix, commit `f38ed53`.
- C1 closure, reopening and re-closure: commits `49ea7d3`, `9b5e973`, `5830cb9`, `afbb030`, `a93d12a`, `3e4a8ba`.

Checked read-only with git and `gh` against `origin/main` `505e2db`. Tests were not re-run by the Architect.

**No application change after the approved code.** `git diff --name-only 6a028f5 3e4a8ba` over `src/`, `public/`, `next.config.ts`, `playwright.config.ts`, `.env.example`, `prisma/`, `package.json` and `package-lock.json` is empty. The D1-D11 verdicts above stand unchanged.

**`0ce5973`, CI runner pin (accepted).**
- Only `runs-on: ubuntu-latest` → `ubuntu-24.04` for the PostgreSQL job, plus one README line.
- Every step, test and assertion is unchanged.
- It is an infrastructure workaround for an apt DNS failure on the runner image, not a D11 dependency change.
- Follow-up: revisit the pin once `ubuntu-latest` is stable; the comment in `ci.yml` records this.

**`f38ed53`, deterministic withdrawal-vs-generation test (accepted).**
- Test-only: `test/integration/media-generation.test.ts` and `scripts/required-pg-tests.json`; `src/` unchanged.
- Fixing a Phase 3 test inside the 4.2 PR is a justified scope exception: the flaky test blocked C1, Manager revision 4 scoped it, and no 4.2 file is involved.
- Architecturally it strengthens the proof of decision 76 (commit-time recheck holds the technique row `FOR SHARE`, so a withdrawal must wait):
  - the synchronized test forces the bound ordering with a test-held `SHARE` lock on `"Plan"`;
  - it observes both waits in `pg_stat_activity` / `pg_blocking_pids`;
  - it asserts the saved binding, the final media state and unchanged exercises;
  - the unsynchronized race now accepts exactly the three valid outcomes (refused candidate, earlier binding, free-form plan);
  - the free-form ordering that the old assertion misread has its own test.
- No assertion was loosened. The lock is released in `finally`. There is no production hook.
- Accepted coupling: the synchronized test relies on the commit taking the technique row before its first `Plan` INSERT (`src/server/onboarding.ts`). If that order ever changes, the test fails loudly (`never observed in the database`) instead of passing falsely.
- Required PostgreSQL tests: 26 → 28 titles.

**C1, re-closure (confirmed independently).**
- PR #5 (https://github.com/ohad340/Woffiz/pull/5): open, draft, mergeable, head `a93d12a` on the remote.
- CI on `a93d12a`: push run `43112478218` and pull_request run `43112486608`, both green with both jobs.
- In run `43112486608`, every step of the job "Integration and e2e on standard PostgreSQL" succeeded:
  - integration: 181 passed, 1 skipped (live model);
  - "All 28 required PostgreSQL tests executed and passed (182 tests in the report)";
  - e2e: 210 passed.
- Job "Typecheck, lint, unit tests, build": 216 unit tests passed.
- Earlier green runs on `afbb030`: `43110046263` and `43110054197`.
- `git diff f38ed53 a93d12a` is `team-Yuri/dev-phase4.md` only.
- Local commit `3e4a8ba` (Manager re-closure note, documentation only) and this addendum are **not pushed**. The final head therefore still needs one green CI run before merging, as Ben's note states.

**Release consequences the owner must approve explicitly.**
- `vercel.json` disables deployments only for `feature/*`. Merging PR #5 into `main` therefore starts the automatic Vercel **production** deployment, and the merge approval is also the deployment approval.
- 4.2 has no migration and no environment variable, so no database step precedes the merge.
- Before the merge, record the current production deployment as the rollback target.
- After the deployment, check:
  - sign-in;
  - an existing training plan and the map;
  - `/puppy` install card;
  - `?state=error` on `/map` shows the real map;
  - the offline fallback;
  - existing P4-1 installs see the update banner once (D4, observation 3).
- A service-worker problem is rolled back with the P4-1/D6 rollback worker, not only by redeploying an older build, because installed workers persist.

**Final status of slice 4.2:**
- Merge conditions: **C1 closed on `a93d12a`, reconfirmation required on the final pushed head**; C2 resolved; C3 PENDING (blocks 4.8, not this merge).
- Next slice unchanged: **4.3**, designed after 4.2 is merged.

#### Required Corrections
None.
