# Architecture Phase 4

## Phase Identifier
PHASE=4

## Status
STATUS: READY_FOR_MANAGER

Owner decisions B1-B3 approved on 2026-11-12 (see "Owner Decisions"). This approval does not authorize deleting real accounts, any migration, merging or deploying.

Revision for **slice 4.4** (account deletion), 2026-11-12. Slices 4.2 (`7bc45f8`) and 4.3 (`ad6b55a`, PR #6) are approved, merged and deployed. Their contracts and final reviews are kept below as closed records and are not reopened.

## Phase Goal
Deliver the remaining ROADMAP Phase 4 work as the ordered slices of `team-Yuri/plan.md`. 4.1-4.3 are done. This revision details **slice 4.4 only**; 4.5-4.8 get their own contract later, each before it starts.

**Slice 4.4 goal:** a signed-in, verified owner can permanently delete their account from `/puppy`.
- The owner confirms in an accessible Hebrew RTL dialog that says honestly what is deleted, what is retained and that deletion cannot be undone.
- The owner re-proves their identity (B1).
- One server transaction removes every owner-scoped row (inventory below).
- Every session of the account ends, and the authentication cookies are cleared.
- No in-flight generation, adaptation, revision, onboarding or progression request can commit afterwards or recreate deleted data.
- Shared media and other accounts are untouched.

## Source References
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

## Current-state findings that shape the design
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

## Architectural Decisions

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

## Owner-scoped deletion inventory (complete, from `prisma/schema.prisma` at `ad6b55a`)

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

## Constraints / Non-Negotiables
- The identity comes only from the session. No caller-supplied owner, user or puppy id is accepted anywhere in 4.4.
- One transaction: all or nothing. No partial deletion is observable.
- Progression invariants untouched. Deletion is the only new write path, and it only deletes.
- Shared media, catalog and audit rows are never modified or deleted.
- No secrets, passwords or email addresses in logs, errors or responses.
- The service worker, offline fallback, owner-activated update and shell allowlist are unchanged. Video production stays paused, `MEDIA_REQUIRED` stays off and techniques stay DRAFT.
- Pilot scope stays as agreed: no videos; approved emails only once the sender domain is verified (4.5); first-party analytics (4.6).
- No production migration, merge, deployment or deletion of real accounts without explicit owner approval. Merging to `main` is the production deployment.

## Technical Boundaries / Out of Scope
- Profile editing; data export; delayed or soft deletion ("grace period"); admin-initiated deletion of other accounts; support tooling.
- Purging never-verified accounts. They cannot sign in, so they cannot use this flow. This is recorded as a follow-up for 4.5/4.6, not built here.
- Changing the payload retention for remaining accounts. B3 is approved at the 30 days already implemented, so 4.4 changes no retention code; it only records the decision in `P4-4` and the README.
- Rewriting media audit rows; any migration.
- 4.5-4.8 work.

## Dependencies and Interfaces

### Expected files (slice 4.4)
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

### Interfaces
- `POST /api/account/delete`. Body: `{ password: string }` (bounded length). Same-origin JSON. Possible responses:
  - `200 { deleted: true }`, with expired auth cookies;
  - `401 UNAUTHENTICATED`;
  - `403 EMAIL_NOT_VERIFIED`, `ADMIN_DELETE_BLOCKED` or `FORBIDDEN_ORIGIN`;
  - `400 VALIDATION`;
  - `422`-class `PASSWORD_INCORRECT`, neutral;
  - `429 RATE_LIMITED`;
  - `500 INTERNAL`, with nothing deleted.
- No other API, no schema change, no environment variable.

## Data / State Considerations
- After success, no row in any owner-scoped table references the account (inventory).
- Retained pseudonymous residues are documented: email rate-limit hashes (24 h), a possible late `ai-request` counter hash (7 days) and media audit actor ids (permanent, ADMIN history only).
- **B3, remaining accounts' failed-job payloads (owner-approved 2026-11-12):** a maximum of 30 days, as `pruneJobPayloads` already implements. Account deletion removes the deleted account's job payloads immediately, inside the A5 transaction. Record the decision in `P4-4`, and update the PRD §8 wording ("proposed") in the same change.

## Security / Privacy Considerations
- Defenses: CSRF via same-origin JSON; session-only identity; password re-entry with a per-account limit; constant, neutral error text; no enumeration (the account is already the session's).
- ADMIN self-deletion blocked (A4); `assertAdmin` reads the database, so a deleted or revoked admin can never act.
- No personal data in logs. The route logs only error codes. In-flight AI requests already sent to the provider are outside our control; A9 says so.
- Responses are `no-store`, and the service worker never caches `/api/*` (S2).

## Testing and Lint Expectations
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

## Functional Testability
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

## Handoff Notes for Manager
- Detail slice 4.4 only. Base `main` `ad6b55a`, new branch and worktree.
- Apply the owner decisions B1-B3 below (approved; no further approval round). They do not authorize deleting real accounts, any migration, merging or deploying.
- Verify against Better Auth 1.7.14 (source or official docs): the password verifier API, the reset-token storage in `verification`, the session cookie names and attributes, and a supported way to expire them from a route handler.
- Confirm the A5 lock order against `startJob`, `fenceJob`, `lockPuppy`, `lockPlan`, `saveOnboardingDraft` and the idempotency writes, and record it in `P4-4`. Done by the Manager: the order is corrected as C1/C2.
- List every path where a deleted account would surface as a 500 today, and map only those (A6).
- No migration. If one becomes necessary, stop and return to the Architect.

## Design-stage corrections and rulings (2026-11-12)
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

## Owner Decisions (slice 4.4)

All approved by the owner on 2026-11-12:

| # | Decision | Owner decision |
|---|---|---|
| B1 | How the owner proves identity before deletion | **Approved:** re-enter the current password, with per-account rate limiting (A3) |
| B2 | ADMIN accounts | **Approved:** in-app deletion is blocked while the role is ADMIN; revoke it first. Shared media audit records are preserved unchanged, and the retained opaque identifier is explained accurately (A4, A9) |
| B3 | Failed-job payload retention for remaining accounts | **Approved:** at most 30 days; account deletion removes that account's payloads immediately |

Also recorded:
- The open plan.md decision "backups" affects only the README specifics of A9, not the UI wording.
- None of the other open plan.md decisions (alert channel, sending domain, pilot recruitment, performance profile) affects 4.4.

## Architect Review
ARCHITECT_REVIEW_STATUS: NOT_REVIEWED

Current revision: slice 4.4. The final reviews of slices 4.3 and 4.2 are in the closed records below.

### Review Notes

### Required Corrections

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
