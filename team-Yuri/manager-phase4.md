# Manager Phase 4

## Phase Identifier
PHASE=4

## Status
STATUS: APPROVED

Scope of this revision: **slice 4.4 only** (account deletion), revision 1, 2026-11-12. Input: the 4.4 contract in `team-Yuri/arch-phase4.md` (STATUS: READY_FOR_MANAGER, decisions A1-A10, the deletion inventory, owner decisions B1-B3 approved on 2026-11-12). Slices 4.2 (`7bc45f8`) and 4.3 (`ad6b55a`) are merged and deployed; their designs and reviews are kept below as closed records and are not reopened. Slices 4.5-4.8 are not designed here. **No migration is needed** (confirmed, see "Verified semantics" V7). Nothing in this document authorizes deleting a real account, a migration, a push, a merge or a deployment.

## Phase Goal
A signed-in, verified owner permanently deletes their account from `/puppy`: they read an honest Hebrew scope statement, re-enter their password, and one server transaction removes every owner-scoped row; every session ends, no in-flight request can recreate data, and shared media and other accounts are untouched. Slices 4.2 and 4.3 behavior (offline fallback, owner-activated update, shell cache allowlist) is unchanged.

## Source References
- `team-Yuri/PHASE.md` (`PHASE=4`), `team-Yuri/plan.md` (slice 4.4), `team-Yuri/arch-phase4.md` (A1-A10, inventory, B1-B3), `PRD.md` §8 and §10, `DESIGN_SYSTEM.md` §8 "Puppy and settings", §9, §12, §14, `docs/DECISIONS.md` (48, 57, 62, 64, 66, 68-71, 76, P4-1 to P4-3).
- `.claude/rules/20-testing.md`, `30-docs.md`, `40-project-structure.md`.
- Code baseline `origin/main` `ad6b55a`, read with `git show ad6b55a:<path>`: `prisma/schema.prisma`, `src/server/{auth,session,http,errors,onboarding,progress,revision,idempotency,queries,db}.ts`, `src/server/ai/{jobs,quota}.ts`, `src/server/email/rate-limit.ts`, `src/app/api/**/route.ts`, `src/components/ui/{Sheet,Button}.tsx`, `src/app/(main)/puppy/page.tsx`.
- Better Auth **1.7.14** (the installed `node_modules/better-auth`, version printed from its `package.json`): `dist/crypto/password.mjs`, `dist/api/routes/{sign-in,sign-out,password,email-verification,update-user}.mjs`, `dist/cookies/index.mjs`, `dist/integrations/next-js.mjs`.

## Architecture Summary
The contract is followed as written, with **two corrections to A5** found while checking the lock order (F1, F2 below), one **choke point** for the deleted-account 500 mapping (F3), and the Better Auth API names the contract asked for. One new route, one server module, one dialog component, one account-card change, a welcome-page status line, three error codes, tests, docs. No schema, `sw.js`, `auth.ts`, environment or dependency change.

## Verified semantics
Better Auth 1.7.14 (read from the installed source):
- **V1 Password verifier.** `import { verifyPassword } from 'better-auth/crypto'`, signature `({ hash, password }) => Promise<boolean>` (scrypt through `node:crypto`; it is what sign-in uses as `ctx.context.password.verify`). The credential account is the `Account` row with `providerId = 'credential'` and `accountId = user.id`; the hash is its `password` column. Sign-in does the same lookup and treats a missing account or hash as a wrong password. `maxPasswordLength` is 128 in `auth.ts`, so the body bound is 1-128.
- **V2 Reset tokens.** A password-reset request stores a `verification` row with `identifier = 'reset-password:<24-character id>'` and **`value = the user id`**, plus `expiresAt` (`dist/api/routes/password.mjs`); a reset consumes it. Deleting by `value = userId` is correct whether or not the identifier is hashed. Email-verification links in this project are stateless signed tokens (`createEmailVerificationToken`); for a deleted account Better Auth answers `verify-email` with a redirect carrying `USER_NOT_FOUND`, not a 500.
- **V3 Session cookies.** `import { getCookies } from 'better-auth/cookies'`; `getCookies(auth.options)` returns `{ sessionToken, sessionData, dontRememberToken, accountData }`, each `{ name, attributes }`. Name is `better-auth.<key>`, with the `__Secure-` prefix when `BETTER_AUTH_URL` starts with `https://` (production). Attributes: `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure` true exactly when prefixed, no `domain` (cross-subdomain is off), `maxAge` 30 days for the session token. This project has no cookie cache and no account cookie, so only `session_token` (and possibly `dont_remember`) is ever set.
- **V4 Supported expiry from a route handler.** Better Auth's own `expireCookie` sets the same name and attributes with value `''` and `maxAge: 0`. Two supported routes: `auth.api.signOut({ headers, asResponse: true })`, or building the expiry from `getCookies(auth.options)` (`auth.options` and `(await auth.$context).authCookies` are both exposed by the `betterAuth()` return value in 1.7.14, and are the same data Better Auth's sign-out uses). **Decision: the second.** It is deterministic, does not depend on a session row that the deletion just removed, logs nothing, and works outside a Next request scope (the `nextCookies()` plugin silently does nothing there, which would make an integration test of the route blind). Expire `sessionToken`, `sessionData` and `dontRememberToken`. A test proves the equivalence against a real sign-out (see M2).
- **V5 Sessions are database rows.** No cookie cache: `auth.api.getSession` reads `session` and `user` on every request. Deleting the `session` rows ends every device at its next request (`UNAUTHENTICATED`).
- **V6 `verification` has no foreign key**; the reset-token row must be deleted explicitly (A5).
- **V7 Foreign keys (schema at `ad6b55a`).** `Session`, `Account`, `Puppy` (`ownerId`, unique) and `IdempotencyKey` cascade from `User`; `Plan`, `GenerationJob` and `Attempt` cascade from `Puppy`; `Level` from `Plan`; `ExerciseVersion` and `MasteryEvent` from `Level`. **Two RESTRICT keys** block a cascade: `Attempt.exerciseVersionId` and `MasteryEvent.attemptId`. `Plan.currentLevelId` is a plain column (no foreign key, so no cycle). `GenerationJob.ownerId` is a plain string (jobs are owned through `puppyId`). `AiUsageDay` has no foreign key. **No schema change is required, so no migration** (A1 holds).
- **V8 Lock side effects.** Inserting a row that references `Puppy` or `User` takes `FOR KEY SHARE` on the referenced row, which conflicts with `FOR UPDATE` and with a `DELETE`. This is why the real lock graph differs from the explicit locks.

## Lock-order check (A5 against the code)
Locks per write path at `ad6b55a` (explicit lock, then implicit key-share locks from foreign keys):

| Path | Order |
|---|---|
| Generation commit, onboarding (`completeOnboarding`) | `fenceJob` (job row) → `lockPuppy` (`FOR UPDATE`) → plan inserts under that lock |
| Generation commit, adapt and revise | `fenceJob` (job row) → `lockPlan` (`FOR UPDATE`) → writes under that lock (new rows take key-share on `Puppy`) |
| Progression (`recordAttempt`, `confirmMastery`) | `lockPlan` (`FOR UPDATE`) → `attempt.create` (key-share on `Puppy`, `Level`, `ExerciseVersion`) → `idempotencyKey.create` (key-share on `User`) |
| `saveOnboardingDraft`, first tx of `completeOnboarding` | `ensurePuppy` insert (key-share on `User`, only when a puppy is really inserted) → `lockPuppy` |
| `startJob`, `finishJob`, `refundJobUnitOnce`, `claimAttempt` | single autocommit statements on job rows (and `INSERT` with key-share on `Puppy`); no transaction held |
| Idempotency write in adapt and revise | `saveResult` (`idempotencyKey.create`, key-share on `User`) inside the commit transaction, after `fenceJob` and `lockPlan`; the snapshot transaction before the provider call writes nothing |

The global order that every path above respects is **job → plan → puppy → user**, where a path simply skips the levels it does not use.

- **F1 (correction of A5 steps 3 and 4).** The contract locks the puppy, then the plans. Progression holds the plan lock and then needs key-share on the puppy; a deletion holding `Puppy FOR UPDATE` and waiting for that plan lock closes a cycle (`40P01`). **The deletion must lock jobs, then plans, then the puppy.** This is the same rationale as A5 ("matches decisions 66 and 76"), applied to the real graph.
- **F2 (gap in the job lock).** A job inserted after the deletion's first job-lock pass (a new request that passed authentication before the deletion) whose worker then reaches its commit would hold that job row and wait for the puppy, while the deletion holds the puppy and waits for the job row in its `DELETE`: a second cycle. **Fix, no waiting while holding the puppy:** right after the puppy lock, lock the account's jobs again with **`FOR UPDATE NOWAIT`** (locks already held by this transaction do not conflict; unlocked newcomers are locked on the spot; a job held by another transaction raises `55P03`). On `55P03`, `40P01` or `40001` the whole transaction rolls back and is retried, **at most 3 attempts** with 50-150 ms jitter; after that the route answers the existing `500 INTERNAL`, nothing deleted.
- The `User` row is deleted last. In-flight transactions that hold key-share on it (idempotency inserts, `ensurePuppy`) never wait for a lock the deletion holds, so the deletion simply waits for them. A `ensurePuppy` insert that lands after the deletion's explicit deletes is removed by the `user` cascade (a draft puppy has no attempts, so no RESTRICT key is involved).
- A deletion that finds the user already gone (`DELETE FROM "user"` affects 0 rows, for example two concurrent deletions) answers `UNAUTHENTICATED`.

**Final deletion transaction (replaces A5's order; interactive transaction with the bounds of `COMMIT_TX`: `maxWait` 10 s, `timeout` 20 s):**
1. Read the user's current role and the credential `Account`. Role `ADMIN` → `ADMIN_DELETE_BLOCKED`. `verifyPassword`; wrong or missing hash → `PASSWORD_INCORRECT`. (No row lock is held while scrypt runs.)
2. `SELECT id FROM "GenerationJob" WHERE "puppyId" = <the puppy> ORDER BY id FOR UPDATE`.
3. `SELECT id FROM "Plan" WHERE "puppyId" = <the puppy> ORDER BY id FOR UPDATE`.
4. `SELECT id FROM "Puppy" WHERE "ownerId" = <user> FOR UPDATE`; then the `NOWAIT` job re-lock (F2).
5. Deletes, each scoped to this user: `MasteryEvent` → `Attempt` → `ExerciseVersion` → `Level` → `Plan` → `GenerationJob` (payloads included) → `Puppy` → `IdempotencyKey` → `verification` (`value = userId`) → `AiUsageDay` (ten `keyOf('ai-request', userId, day)` keys around today, see M1) → `session` → `account` → `user`. The `user` delete must affect exactly one row.
When the account has no puppy (never started onboarding) steps 2-4 find nothing and are skipped; the rest is unchanged.

## Deleted-account responses today (A6: every path that surfaces as a 500)
Authentication is by session, so a request that begins after the deletion is already `UNAUTHENTICATED` (401), and all read paths answer cleanly (`getOverview` and `getExercise` return null, `playbackFor` and the captions route throw `NOT_FOUND`, pages redirect). Only a request **already past authentication when the deletion commits** can fail. Path by path:

| Route (via `postRoute`) | What happens after the deletion committed | Today |
|---|---|---|
| `POST /api/attempts` | `lockPlan` returns no row (no error), then `level.findUniqueOrThrow` throws Prisma `P2025`, or `attempt.create` hits a missing foreign key | **500** |
| `POST /api/mastery` | same, plus `idempotencyKey.create` foreign key | **500** |
| `POST /api/onboarding/draft` | `ensurePuppy` raw insert fails on the `User` key (`23503`), or `puppy.findUniqueOrThrow` throws `P2025` | **500** |
| `POST /api/onboarding/complete` | first transaction as above; `startJob` insert fails on the `Puppy` key (`23503`, not a unique violation, rethrown); `generationJob.update` of the charge day throws `P2025`; the commit stops at `fenceJob` with `GENERATION_PENDING` | **500** (first three), 409 (commit) |
| `POST /api/plan/adapt`, `POST /api/plan/revise` | snapshot transaction: `NOT_FOUND` if the puppy is gone (404); `startJob` as above (insert or charge-day update); the commit stops at `fenceJob` (409) | **500** (`startJob`), 404/409 otherwise |
| `GET /api/media/*`, pages, Better Auth routes | clean (404, redirect, 401, `USER_NOT_FOUND` redirect) | not a 500 |

- **F3 (one choke point).** All six routes use `postRoute`, and `user` is known there. In its `catch`, for an error that is **not** an `AppError`: look up whether the session user's row still exists; if it does not, answer `UNAUTHENTICATED` (401, `no-store`) and log only the code (no error object, which can carry query text); otherwise behave exactly as today (log, 500). This maps exactly the failures caused by a deleted account and nothing else, without touching the domain code, and any path this table missed is covered too. The fence answers (409/404) stay as they are: they are clean, and the account's next request is 401.
- `adminRoute` is not changed (an administrator cannot delete the account in-app, A4).

## Ordered Milestones
- **M0** Branch `feature/phase-4-account-deletion` from `origin/main` `ad6b55a` in a separate worktree; artifacts first; baseline.
- **M1** Server: `account-deletion.ts`, the quota helper, error codes, `postRoute` mapping (F3), the route with cookie expiry.
- **M2** Integration tests on PGlite and PostgreSQL: full clearance, isolation, other-account, password, ADMIN, sessions and cookies, rollback, inventory guard.
- **M3** The six PostgreSQL-only concurrency tests and `scripts/required-pg-tests.json`.
- **M4** UI: dialog, `/puppy` account card, welcome status.
- **M5** E2E with disposable accounts.
- **M6** Documentation.
- **M7** Evidence in `dev-phase4.md`.

## Detailed Development Plan

### M0. Branch, worktree, baseline
1. `git fetch origin`; verify `origin/main` is `ad6b55a` (if newer, record it and branch from it; a changed `schema.prisma` or any file listed under M1 would be a reason to stop and ask).
2. Worktree outside the repository tree, sibling of the shared folder: `git worktree add ../Woffiz-4.4 -b feature/phase-4-account-deletion origin/main`, then `git branch --unset-upstream` (a stray `git push` must never target `main`). **Do not switch the branch of, or touch `node_modules` in, the shared Woffiz folder**; the owner's temporary worktree `Woffiz-4.3` is not used.
3. Copy `.env` from the shared folder into the worktree (git-ignored, never committed). `npm ci`; `node_modules/.bin/prisma --version`; `node_modules/.bin/prisma generate` (never a bare `npx` tool).
4. First commit: copy `team-Yuri/arch-phase4.md`, `team-Yuri/manager-phase4.md` and `team-Yuri/plan.md` byte for byte from the shared folder (all three are uncommitted there; check with `cmp`). Nothing else in that commit.
5. Baseline on the untouched tree: `npm run check`, and the unit/integration/e2e commands you will use later; record counts.
6. **Database safety.** Every database command uses `TEST_DATABASE_URL` (the local test database; print the host and check it differs from `DATABASE_URL`). No Supabase connection, no `migrate reset`, no `db push`, no real account is ever deleted. `MEDIA_REQUIRED` stays unset.

### M1. Server
1. **`src/server/account-deletion.ts`** (new). `deleteAccount(userId, password, deps?)` implements the **Final deletion transaction** above, with the retry of F2. Dependencies are injectable so that tests can (a) fail after some deletes (rollback proof) and (b) run a hook between the first job-lock pass and the puppy lock (the F2 test); both are optional parameters, with no environment switch and no test-only branch in the default path. Also export `hasMediaAuditRecords(userId)` (true when the id appears in `MediaVersion.createdById|publishedById|withdrawnById`, `MediaReview.reviewerId` or `TechniqueSuspensionEvent.actorId`), used only by `/puppy` for the A4 line.
2. **Quota helper.** `keyOf` in `src/server/ai/quota.ts` is private. Add one exported, transaction-aware function (for example `deleteRequestUnits(tx, userId)`) that deletes the keys of the ten UTC days from eight days ago to tomorrow (`prune` keeps seven days; the extra margin covers the UTC/server-date edge). No other change to that file; the system-wide `ai-calls` counter is not touched.
3. **Rate limit.** Before the transaction, `takeRateLimit({ scope: 'account-delete', max: 5, windowSeconds: 900 }, userId)`; refusal → `RATE_LIMITED`. The key is taken **before** the password check. (The function uses the global client, so it must not run inside the interactive transaction.)
4. **Error codes** in `src/server/errors.ts` (add to the union, `STATUS` and `MESSAGE`): `PASSWORD_INCORRECT` 422 "הסיסמה שגויה. לא נמחק דבר."; `RATE_LIMITED` 429 "בוצעו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות. לא נמחק דבר."; `ADMIN_DELETE_BLOCKED` 403 "זהו חשבון מנהל. כדי למחוק אותו צריך קודם לבטל את הרשאת המנהל, פעולה שמבצע בעל המערכת."
5. **`postRoute` mapping (F3)** in `src/server/http.ts`: only in the non-`AppError` branch, only when `user` was resolved and its row is gone. Unit-test the helper that decides it (user present → 500 as today; user gone → 401).
6. **`src/app/api/account/delete/route.ts`** (POST only). Order: `assertSameOrigin`; `requireUserFromRequest` (verified session, identity only from the cookie); body `z.object({ password: z.string().min(1).max(128) })` **not strict**, so any extra field, including another account's id, is ignored and never read; `deleteAccount(user.id, password)`; success `200 { deleted: true }` with the three cookies expired (V4) and `Cache-Control: private, no-store`; every `AppError` mapped as in `postRoute`; anything else 500 `INTERNAL` with only the code logged. The password never appears in a log, an error or a response. Because it must add `Set-Cookie`, the route writes its own small try/catch rather than using `postRoute`.
7. **No change** to `src/server/auth.ts`, `public/sw.js`, `prisma/`, `next.config.ts`, `package.json`.

### M2. Integration tests (run on PGlite locally and on standard PostgreSQL in CI)
New `test/integration/account-deletion.test.ts` (use `helpers.ts`: `createUser`, `onboard`, `planFor`, `insertJob`; create real Better Auth sessions with the existing pattern):
1. **Full clearance.** Populate account A: profile, plan with completed, current and locked levels, several exercise versions, attempts (current and review), mastery events, idempotency keys, a failed job with `payloadJson`, a **real** reset token (request it through Better Auth, assert the `verification` row exists with `value = A`), today's `ai-request` counter, two sessions. Delete through the route. Assert **zero rows for A in every inventory table** (a scoped count per table, listed in the test), and that this account had mastery events (so the RESTRICT order is exercised).
2. **Isolation.** Account B populated the same way: snapshot B's rows in every owner table and the shared tables (`MediaAsset`, `MediaVersion`, `MediaReview`, `TechniqueVersionState`, `TechniqueSuspensionEvent`) as `ORDER BY id` JSON before and after; byte-identical.
3. **Not by another account.** Authenticated as B, with a body carrying A's id and email: only B is deleted, A is intact. Unauthenticated, unverified, cross-origin and non-JSON requests delete nothing (status codes asserted).
4. **Password.** Wrong password → 422, nothing deleted, session still valid. A missing password or one over 128 characters → 400. After 5 attempts in the window → 429 and the counter key is taken before verification (assert the row count moves on a wrong password).
5. **ADMIN.** Current role ADMIN → 403 `ADMIN_DELETE_BLOCKED`, nothing deleted. Revoke the role in the database (the effect of `scripts/grant-admin.ts --revoke`), delete: succeeds, the audit rows that carried the id (`MediaVersion`, `MediaReview`, `TechniqueSuspensionEvent`) are unchanged byte for byte, and no `user` row exists for that id.
6. **Sessions and cookies.** After success both sessions fail `auth.api.getSession`. The `Set-Cookie` headers expire `better-auth.session_token` (and `session_data`, `dont_remember`) with `Max-Age=0`, `Path=/`, `HttpOnly`, `SameSite=Lax`; with an https base URL the names carry `__Secure-` and `Secure`. **Equivalence test:** perform a real `auth.api.signOut({ headers, asResponse: true })` on another session and assert the route's cookie names and attributes equal Better Auth's own.
7. **Rollback.** Inject a failure after some deletes: every row of A and both sessions are intact; a following normal deletion works.
8. **Deleted-account mapping (F3)** at the route level: `postRoute` with a valid session whose user row is deleted between authentication and the failure answers 401, not 500; with the user present, an unexpected error still answers 500 (unit test of the decision helper plus one route-level case).
9. **Inventory guard.** List every table of the `public` schema from `information_schema` (excluding `_prisma_migrations`) and compare with an explicit classification in the test (deleted for the owner / retained shared / retained pseudonymous). An unclassified table fails the test. The classification mirrors the contract's inventory table.

### M3. PostgreSQL-only concurrency tests (required)
`describe.skipIf(!REAL_POSTGRES)('account deletion on standard PostgreSQL', …)`, all added to `scripts/required-pg-tests.json` by their full titles. Use the deterministic pattern of `test/integration/media-generation.test.ts` (`waitingBackends`, `observeWaiting`, `pg_blocking_pids`, locks held by the test on independent connections; no sleep orders anything):
1. **Deletion waits for a generation commit that holds the job row.** A transaction holds the job row (the `fenceJob` position); the deletion starts, is observed waiting behind it; the commit completes (plan created); the deletion proceeds and removes the committed plan as well. Nothing of the account remains.
2. **Commit after the deletion.** A generation and an adaptation whose commit starts after the deletion committed stop at `fenceJob` (`GENERATION_PENDING`), create no row, refund nothing (`refundJobUnitOnce` matches no row), and the route answers 409/401, never 500.
3. **Mastery confirmation and the plan lock (the F1 cycle).** A transaction holds the plan lock and has inserted an attempt (key-share on the puppy); the deletion is observed waiting on the plan lock **and holding no puppy lock**; the transaction commits; the deletion completes, with no `40P01`. Then the reverse order: the deletion started first, a mastery confirmation after it either waits and then fails cleanly (401 through F3) or lands first and is then deleted. No orphan row, no deadlock. Record in the evidence that swapping steps 3 and 4 of the deletion makes this test fail with `40P01` (a temporary local change, restored and shown identical with `cmp`).
4. **Onboarding racing the deletion.** A draft save and a puppy creation racing the deletion never leave a `Puppy` row for the deleted user (the `user` cascade or the explicit delete removes it); the request answers cleanly.
5. **Two concurrent deletions of the same account.** One succeeds (200), the other answers 401 or deletes nothing; no deadlock; the rate limit key is taken twice.
6. **F2 gap.** Using the injectable hook between the first job-lock pass and the puppy lock: a new `PENDING` job is inserted and its row is held by a test transaction that then waits for the puppy lock (the worker's commit position). The deletion's `NOWAIT` re-lock raises `55P03`, the deletion rolls back, releases the puppy, and the retry succeeds once the test transaction ends. No `40P01`, nothing remains.
Also required for the evidence: the full PostgreSQL integration suite and these six run **locally on a real PostgreSQL** (see "Open owner items") before the single push, so that CI is a confirmation and not the first execution.

### M4. UI (read `DESIGN_SYSTEM.md` §5, §8, §9, §12, §14 first; tokens only, no ad-hoc variants)
1. **`src/components/account/DeleteAccount.tsx`** (+ `.module.css`). A destructive `Button` "מחיקת החשבון" opens the existing `Sheet` (native `<dialog>`). Props from the server page: `isAdmin` (current database role) and `hasAuditRecords`. Contents:
   - heading (the `Sheet` title) "מחיקת החשבון";
   - the scope statement (below), then, only when `hasAuditRecords`, the A4 line;
   - a labelled password field "הסיסמה הנוכחית" (`type="password"`, `autoComplete="current-password"`, visible label, error text associated with the field and announced politely);
   - "ביטול" (secondary) which has the initial focus (`autoFocus` on it: the `Sheet` header close button precedes it in the DOM, so a plain `showModal()` would focus the close button) and "מחיקה לצמיתות" (destructive), disabled while sending;
   - `isAdmin`: the dialog shows the ADMIN explanation instead of the form (no password field, no delete button).
   States: sending (no duplicate submit); wrong password (inline error, field kept and re-focused); rate limited; offline or network failure ("לא נמחק דבר. בדקו את החיבור ונסו שוב.", retry possible); the password is cleared when the dialog closes or a request ends. Escape and the close button close the dialog and restore focus to the opening button.
2. **Scope copy (final Hebrew wording of A9; it must not promise a removal time, names no provider):**
   - **"מה יימחק עכשיו, ולא ניתן לשחזר:"** החשבון, כתובת האימייל והסיסמה, וכל ההתחברויות שלכם בכל המכשירים · פרופיל הגור ותשובות השאלון · כל מסלולי האימון והתרגילים · דיווחי התרגול ואישורי השליטה · רשומות ההתאמה האישית, כולל התוצרים השמורים שלהן.
   - **"מה נשאר:"** סרטוני ההדגמה המשותפים. הם אף פעם לא הכילו מידע שלכם.
   - A4 line (only when `hasAuditRecords`): "רשומות הבדיקה והפרסום של סרטוני הדגמה נשמרות עם מזהה פנימי שאינו מכיל כתובת אימייל. אחרי המחיקה הוא כבר לא מקושר לשום חשבון אצלנו. גיבויים שנוצרו לפני המחיקה עשויים עדיין לקשר אותו עד שיפוגו."
   - **"כדאי לדעת:"** אי אפשר לשחזר את החשבון. עותקים עשויים להישאר זמן מוגבל בגיבויים וביומנים של ספקי האחסון והדואר, לפי מדיניות השמירה שלהם, ובכל בקשת התאמה אישית שכבר הייתה בעיבוד.
3. **Success flow:** on `200`, a full navigation to `/?deleted=1` (not a client-side route change: it drops all client state; the session is already gone, so the client does not call sign-out). `?deleted=1` is a constant marker with no personal data. The service worker is unchanged (a navigation is network first).
4. **`src/app/(main)/puppy/page.tsx`:** in the "חשבון" card replace "עריכת פרטים ומחיקת חשבון יתווספו בהמשך." with the new `DeleteAccount` (sign-out stays; the card keeps one clear order: sign-out, then the destructive action last). **`src/app/page.tsx`:** when `deleted=1`, a short status line "החשבון נמחק." with `role="status"`, shown above the usual welcome content; no other change.

### M5. E2E (Playwright, three viewports, disposable accounts from the existing `owner` fixture only, local test database)
`e2e/account-deletion.spec.ts`: dialog opens with focus on "ביטול"; Escape closes and restores focus; axe clean; RTL; no horizontal overflow at 360 px; reduced motion; cancel deletes nothing (the account still works); a wrong password shows the inline error and keeps the dialog; a successful deletion lands on `/` with "החשבון נמחק.", `/home` redirects to `/`, and signing in with the old credentials fails; a **second browser context** signed in to the same account is signed out at its next navigation; the ADMIN explanation instead of the form when the disposable account is made ADMIN in the test database. Assertions use `expect.poll`, never sleeps. The existing `offline.spec.ts`, `pwa.spec.ts` and `shell.spec.ts` stay green and unchanged; `public/sw.js` is not in the diff. **Known local noise:** the PGlite test database is unstable under load and `auth.spec.ts` "register, onboard, refresh…" fails about half the time on `main` locally (shown on `7bc45f8`); report every rerun as a rerun; CI on standard PostgreSQL is the gate.

### M6. Documentation
`DESIGN_SYSTEM.md` §8 ("Puppy and settings": the account card and the dialog, with the scope copy) and §14 (dialog states); `docs/DECISIONS.md` row `P4-4` (endpoint, password re-entry and limit, ADMIN block, the transaction order **as corrected by F1/F2 with the lock graph**, the F3 mapping, cookie expiry, accepted residues, B3 at 30 days, no migration); `README.md` new "Account deletion" section (behavior, what is deleted and kept, the A9 limits; for providers say only what is true: Supabase backups depend on the plan and the owner's open "backups" decision, Resend keeps delivery logs, Vercel keeps runtime logs, the AI provider keeps requests under its own policy; invent no retention figure); `PRD.md` §8 (the 30-day payload retention is owner-approved, no longer "proposed"). Not touched: `public/sw.js`, `src/server/auth.ts`, `prisma/`, `.env.example`, `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`.

### M7. Evidence
`team-Yuri/dev-phase4.md`: 4.4 section on top, the 4.3 and 4.2 records kept below unchanged.

## Acceptance / Gating Criteria
1. Branch `feature/phase-4-account-deletion` from `origin/main` `ad6b55a` (or recorded newer `main`) in a separate worktree; the shared folder's branch and `node_modules` untouched; the three Team Yuri artifacts are the first commit.
2. `POST /api/account/delete` follows A2/A3/A7 and the final transaction; identity only from the session; the body schema has no id; a wrong password changes nothing; the limit key is taken before verification; ADMIN is refused.
3. The transaction locks jobs, then plans, then the puppy, then re-locks jobs `NOWAIT`, retries at most 3 times, deletes in the listed order and ends with exactly one `user` row deleted; any error rolls everything back.
4. A deleted account's in-flight write requests answer 401 (never 500) through the F3 choke point; an unrelated unexpected error still answers 500; no row is ever recreated.
5. Cookies are expired with Better Auth's names and attributes (equivalence test).
6. `npm run check` passes; the M2 integration tests pass on PGlite and on PostgreSQL; the inventory guard fails for an unclassified table (negative check recorded).
7. The six M3 tests pass on standard PostgreSQL, are listed in `scripts/required-pg-tests.json`, and the F1 negative check is recorded.
8. E2E passes at the three viewports (reruns reported as reruns); accessibility, RTL, 360 px, reduced motion verified; `offline.spec.ts`, `pwa.spec.ts`, `shell.spec.ts` unchanged and green.
9. The dialog and the Hebrew copy match M4; the scope statement is accurate and promises no removal time.
10. The diff against `origin/main` contains only: `src/server/account-deletion.ts`, `src/server/ai/quota.ts` (one helper), `src/server/errors.ts`, `src/server/http.ts` (F3 only), `src/app/api/account/delete/route.ts`, `src/components/account/*`, `src/app/(main)/puppy/page.tsx`, `src/app/page.tsx`, the new tests, `e2e/account-deletion.spec.ts`, `scripts/required-pg-tests.json`, `DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `README.md`, `PRD.md` §8, the Team Yuri artifacts. Not in the diff: `prisma/`, `public/sw.js`, `public/offline.html`, `next.config.ts`, `src/server/auth.ts`, `.env.example`, `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`, media code.
11. No migration, no environment variable, no dependency; `MEDIA_REQUIRED` off; video production paused; no real account deleted; nothing pushed, merged or deployed without the owner's approval.
12. After the owner-approved push: CI green on the final head, first attempt, both runs, "All N required PostgreSQL tests executed and passed" with the six new titles, e2e and build.
13. Real-device checks (phone dialog, keyboard, VoiceOver reading the scope text) recorded as PENDING for 4.8; they do not block the merge.

## Functional Testability Criteria
- Page the user can open: `/puppy`, "חשבון" card, "מחיקת החשבון" dialog; the welcome page after deletion.
- User-visible behavior: cancel changes nothing; a wrong password shows an error and deletes nothing; the correct password removes the account, signs out every device and the credentials no longer work.
- API: `POST /api/account/delete` with the responses 200, 400, 401, 403, 422, 429, 500 as specified.
- Command-line flow: `npm run check`; `npm run test:integration` (and the PostgreSQL run); `npm run test:e2e`.
- Minimal end-to-end flow: register a disposable account locally, onboard, practice and confirm mastery, delete it from `/puppy`, and check in the database that no owner row remains while another account and the shared media are unchanged.

## Required Developer Evidence
`team-Yuri/dev-phase4.md` (4.4 section), per `.claude/rules/20-testing.md` §80 and `30-docs.md` §50:
1. `PHASE=4`, slice 4.4, branch, worktree path, base hash, `git merge-base HEAD origin/main`, confirmation that the shared folder was not touched.
2. Implementation summary per milestone, and the interpretations list below.
3. Final diff (`git diff --stat` and the criterion 10 absent-list check).
4. Dependencies "none added"; `npm ci`, prisma version and generate; the database host of every database command (local test database only; for the PostgreSQL run, the throwaway server's address).
5. Unit and integration tests: commands, counts, every M2 case; the inventory-guard negative check.
6. PostgreSQL run: the six M3 titles executed and passed, the full integration suite on real PostgreSQL, the F1 negative check (a temporary swap of steps 3 and 4, then restored and `cmp`-identical).
7. Lint and typecheck results.
8. E2E: command, per-project counts, the new cases named, reruns reported as reruns, the three pre-existing PWA specs unchanged.
9. The F3 table: for each of the six routes, the assertion or test that proves 401 instead of 500 (or why the path stays 409/404).
10. Functional testability: how the minimal flow was exercised.
11. Documentation: sections changed; `DESIGN_SYSTEM.md` change explained.
12. Real-device checklist (PENDING, owner).
13. Known issues, scope compliance, declaration. After the owner-approved push: PR link, run ids and attempts, per-job results, integration counts, the required-tests line, the e2e count.

## Out of Scope
- Profile editing, data export, soft or delayed deletion, admin deletion of other accounts, purging never-verified accounts (follow-up for 4.5/4.6).
- Any change to payload retention code for remaining accounts (30 days already implemented; only recorded).
- Any migration, change to `auth.ts`, the service worker, the update flow, the shell allowlist, media code, `MEDIA_REQUIRED`.
- Deleting any real account, including the owner's own, in any environment.
- 4.5-4.8 work.

## Risks / Open Questions
- **Owner items.** (1) **Approved by the owner on 2026-11-12:** running a throwaway PostgreSQL 17.11 server from the session scratchpad (the `embedded-postgres` npm package, outside the repository and removed afterwards, as in the 4.2 corrective cycle) for the six required tests and the full integration suite **before the single push** (scope of the approval: that tool, this purpose, this slice; it adds nothing to the project and is removed afterwards). Without it those tests would run for the first time in CI, and a failure there would cost a second push. (2) No other decision: B1-B3 are approved; the `plan.md` items (alert channel, backups, retention, sending domain, pilot recruitment, performance profile) affect only README specifics of A9 or later slices.
- **Interpretations flagged for the Architect's final review** (none changes the intent of A1-A10): (I1) A5 steps 3 and 4 swapped, plans before the puppy (F1: deadlock against progression); (I2) the `NOWAIT` job re-lock with a bounded retry and the sixth PostgreSQL test (F2); (I3) the deleted-account 500 mapping at the `postRoute` choke point (`src/server/http.ts`) instead of per-path catches; (I4) cookie expiry built from `getCookies(auth.options)` rather than `auth.api.signOut`; (I5) one exported helper in `src/server/ai/quota.ts` because `keyOf` is private; (I6) the `/?deleted=1` marker and the welcome status; (I7) the final Hebrew copy; (I8) the body schema is not strict, so extra fields are ignored as A2 says; (I9) the password check runs inside the transaction before any lock, and the limit outside it.
- **Production release consequence (for the later owner approval).** The release is code-only, with no migration. Merging to `main` starts the automatic Vercel production deployment. Rollback target: the production deployment of `ad6b55a` (`A8GhBhUGUhaS1vP5b9D54YHGnifz`). **A deletion is irreversible: a code rollback does not restore a deleted account**, so post-deploy verification must not delete a real account. Registration in production is limited to the tester address, so there is no disposable production account; the post-deploy checks are public and read-only (the route exists and refuses an unauthenticated or cross-origin request without deleting anything; the `/puppy` dialog is checked only up to the cancel button), and an actual production deletion is left entirely to the owner's decision.
- **Shared test database and port 3100.** Several sessions use the local test database and the fixed e2e port; wait rather than collide, and do not change `playwright.config.ts`.
- **Local PGlite instability** (see M5) can hide or fake e2e failures; rerun and report honestly.
- **Artifacts are uncommitted in the shared folder** until the Developer commits copies in the worktree (M0).

## Manager Review
MANAGER_REVIEW_STATUS: APPROVED

Review of slice 4.4 (revision 1 of this design), 2026-11-13. Reviewed: branch `feature/phase-4-account-deletion`, HEAD `c92e2a8`, base `origin/main` `ad6b55a` (unchanged on the remote), worktree `C:\Users\אוהד\Documents\Woffiz-4.4`, evidence in the 4.4 section of `team-Yuri/dev-phase4.md`. Local only at the time of review: nothing pushed, no PR, nothing merged or deployed, no real account touched.

### Review Notes

**Checklist (`developer-review-checklist.md`):** phase identifier, implementation summary, files changed, unit result, lint result, functional testability, documentation, scope and known issues are present and consistent. No reject condition applies.

**Independent verification by the Manager (not copied from the evidence):**
- **Scope.** `git diff ad6b55a HEAD --name-only` outside `team-Yuri/` lists exactly the 16 files of criterion 10; the path-filtered diff over `prisma/`, `public/`, `next.config.ts`, `package.json`, `package-lock.json`, `playwright.config.ts`, `vitest.config.ts`, `.env.example` and `src/server/auth.ts` is empty. `arch-phase4.md` and `plan.md` in the first commit are byte-identical to the shared folder.
- **Implementation read in full:** `src/server/account-deletion.ts`, `src/app/api/account/delete/route.ts`, the `http.ts`, `quota.ts` and `errors.ts` diffs, `DeleteAccount.tsx`, the `/puppy` and welcome changes, the documentation diffs.
- **Commands run by the Manager in the 4.4 worktree:** `vitest run` (unit) 19 files / 285 tests passed; `tsc --noEmit` exit 0; `eslint src e2e test` clean; `npm run test:integration -- test/integration/account-deletion.test.ts` on the local PGlite database: **18 passed, 6 skipped** (the PostgreSQL-only ones, by design); `npm run test:e2e -- e2e/account-deletion.spec.ts e2e/offline.spec.ts e2e/pwa.spec.ts e2e/shell.spec.ts --workers=1`: **138 passed, first run, no failure and no rerun** (the 18 new tests and the three unchanged PWA specs). The local test database was started for this and stopped afterwards.

**1. Transaction order, `NOWAIT` retry, PostgreSQL tests, F1 negative check.**
- The code matches the Architect's corrected A5 (C1, C2): identity checks first with no row lock held (scrypt runs while the transaction holds nothing), then jobs, plans, the puppy, a `FOR UPDATE NOWAIT` re-lock of the jobs, deletes in the listed dependency order, `user` last with exactly one row required (zero answers `UNAUTHENTICATED`). `55P03`, `40P01`, `40001` and `P2034` roll back and retry at most 3 times with jitter, then propagate (500, nothing deleted). The rate-limit unit is taken once, outside the retried transaction (Architect condition on I9). The test seams are optional parameters, none read from the environment, none used by the default path (Architect condition on I2). The password is never logged.
- I read the F1 test (deletion queued behind a plan lock held by a progression transaction that inserts its attempt afterwards, `maxAttempts: 1`, a `FOR NO KEY UPDATE NOWAIT` probe proving the queued deletion holds no puppy lock, then the reverse order through the real `/api/attempts` route) and the F2 test (a new job appears through the hook and is held at the `fenceJob` position; the `NOWAIT` re-lock fails once, the retry waits at the first pass, the puppy is free, the retry succeeds). Both observe lock state through `pg_stat_activity` and `pg_blocking_pids` and order nothing by sleeping. They test the real scenario of the Manager's finding, and the Developer's account of the first F1 test that masked the cycle (interpretation 9) is the right correction.
- **F1 negative check:** recorded as a failure with `40P01 deadlock detected` when steps 3 and 4 are swapped, then restored and `cmp`-identical. The Developer ran the six tests 10 times (60 executions) and the full integration suite once on a throwaway PostgreSQL 17.11 under the owner's approval; `assert-required-tests` lists only the two `CI=true` cases of `ci-guard` as skipped. **Limit of this review:** the Manager did not re-execute the PostgreSQL-only tests (no standard PostgreSQL was started for the review, so as not to repeat the approved download for a second party). They are judged from the code and the evidence, and CI on standard PostgreSQL (expected line "All 34 required PostgreSQL tests executed and passed": 28 + 6) is the independent execution.

**2. F3 mapping and the F3 table.**
- `postRoute` answers 401 only in the non-`AppError` branch and only when the session user's row is gone; a failing lookup counts as "not deleted", so an unexpected error stays 500 and is logged as before; `adminRoute` is unchanged; only a code is logged (Architect condition on I3). Tested: the helper's four cases, a handler that deletes the user and then throws (401, no error object logged), the user-present case (500, logged once) and an `AppError` that keeps its status.
- Per route: `/api/attempts` is proved with a real in-flight request (401); `/api/onboarding/draft` and `/api/onboarding/complete`, and `/api/plan/adapt`, have race tests (never 500). **`/api/mastery` and `/api/plan/revise` have no dedicated race test; accepted.** Both are `postRoute` routes, so the mapping and its decision are the same function; `/api/mastery` has the same failure shape as `/api/attempts` (`lockPlan` returns no row after the deletion committed, the next read throws a Prisma not-found error, which is a non-`AppError`), and `/api/plan/revise` shares `startJob`, the `fenceJob` stop and the choke point with `/api/plan/adapt`. A dedicated case would repeat a proof that already exists for the same code path. Recorded as an observation, not a correction.

**3. Cookie equivalence.** The route expires `session_token`, `session_data` and `dont_remember` from `getCookies(auth.options)`. The tests compare the serialized `Set-Cookie` entries with those of a real `auth.api.signOut`, with an http base URL and again with an https base URL (`__Secure-` prefix and `Secure`). This is the mandatory test of the Architect's ruling on I4. The two normalizations in `expiredAuthCookies` (lower-casing `SameSite`, dropping Better Auth's `prefix` attribute) are required by Next's `ResponseCookies` and are covered by the same comparison.

**4. E2E results.** The Developer reported 235 of 235 with 14 passing only on a rerun after a local PGlite restart, all in specs that 4.4 does not touch, and the 18 new tests passing on the first run; an earlier targeted run had one new test fail inside the `owner` fixture (`P2028` in the server log) and pass in the full run. The Manager's own run of the new spec together with the `offline`, `pwa` and `shell` specs passed 138 of 138 on the first attempt. That the local PGlite database makes unrelated specs fail on first attempts was already demonstrated in the 4.3 cycle (the same pre-existing `auth.spec.ts` test failed about half the time on `main` `7bc45f8`, 6 of 12 against 5 of 12 on the 4.3 branch). Every rerun is reported as a rerun in the evidence. CI on standard PostgreSQL is the gate (criterion 12).

**5. The nine interpretations, Manager position** (none changes A1-A10; the Architect rules on them in the final review):
1. The F3 helper is tested in the integration file (it imports the database client, and the unit configuration has no database); accepted.
2. `afterJobLock` runs after the plan locks and before the puppy lock, which is the position the F2 test needs; accepted.
3. Initial focus on "ביטול" by an effect and a `data-delete-cancel` attribute, because `Sheet` renders its children while closed and `autoFocus` would run on a hidden element; accepted, and verified by the e2e focus assertions.
4. "מחיקה לצמיתות" is also disabled while the password field is empty; this goes one step beyond "disabled while sending", avoids a pointless 400, and is documented in `DESIGN_SYSTEM.md`; accepted.
5. The `eslint-disable-next-line` on `window.location.href` is narrowly scoped and justified (the contract requires a full navigation); accepted.
6. The cookie normalizations (see 3): accepted.
7. The welcome status reuses `.card` and `.lead`: accepted, no CSS change.
8. Extra tests beyond M2: accepted.
9. The rewritten F1 test: accepted (see 1).

**Documentation.** `DESIGN_SYSTEM.md` §8 and §14, `docs/DECISIONS.md` `P4-4` (with the lock graph and the corrected order), the README "Account deletion" section (honest A9 limits, no retention figure invented, the Supabase "backups" decision still open) and `PRD.md` §8 (B3, 30 days owner-approved) match the shipped behavior. The Hebrew copy in the component is the copy of M4.

**Non-blocking observations.**
- The deployed `/puppy` dialog and the phone, keyboard and VoiceOver reading of the scope text are PENDING for the owner (the 4.8 matrix).
- A real deletion on production is never part of verification. Registration there is limited to the tester address, and a deletion cannot be undone by a code rollback.
- Maximum 3 attempts then a 500 `INTERNAL` with nothing deleted is acceptable: each attempt is all-or-nothing and the owner can simply try again.

**Criteria status.** 1-11: met. 12: pending the owner-approved push (CI on the final head, first attempt, both runs, "All 34 required PostgreSQL tests executed and passed", e2e and build). 13: PENDING for the owner by design.

### Required Corrections
None. Conditions for the next stage (not corrections): (a) the Architect's final review and this review are committed in the worktree before the single push, by copying `arch-phase4.md`, `manager-phase4.md` and `plan.md` byte for byte from the shared folder (the committed copy of `manager-phase4.md` predates this review and one line of the owner-items text, so it must be refreshed); (b) one push, a draft PR, CI green on the final head in a single attempt on both runs; (c) the CI result is recorded in the PR description only, with no documentation-only commit afterwards; (d) merge to `main` and the automatic Vercel production deployment need the owner's explicit approval; the release is code-only with no migration, the rollback target is the production deployment of `ad6b55a` (`A8GhBhUGUhaS1vP5b9D54YHGnifz`), and a code rollback does not restore a deleted account.

---

## Slice 4.3 record (APPROVED, merged in `ad6b55a`; closed, not reopened)
STATUS (slice 4.3): APPROVED. MANAGER_REVIEW_STATUS (slice 4.3): APPROVED. Kept unchanged below; only the heading levels and these two status labels were adapted when slice 4.4 was added.

### Phase Identifier
PHASE=4

### Status
STATUS (slice 4.3): APPROVED

Scope of this revision: **slice 4.3 only** (public shell asset caching), revision 1, 2026-11-12. Input: the completed 4.3 contract in `team-Yuri/arch-phase4.md` (STATUS: READY_FOR_MANAGER, decisions S1-S10) and the owner decision of 2026-11-12 that `/art/*.webp` stays outside the cache. Slice 4.2 is merged (`7bc45f8`) and deployed; its design and reviews are kept unchanged below as a closed record and are not reopened. Slices 4.4-4.8 are not designed here.

### Phase Goal
The service worker keeps a versioned cache of immutable public build assets only: everything under `/_next/static/` (code, styles and the bundled Heebo fonts) and the four app icons. It never caches HTML, API responses, RSC payloads, signed media URLs, `/art/*` or any per-account response. Caches of earlier worker versions are purged on activate. The new worker reaches existing installations only through the 4.2 mechanism (version bump, then the owner's tap on "לעדכן עכשיו"). The P4-1 offline fallback (`woffiz-offline-v1`, `/offline.html`) keeps working exactly as today. 4.3 makes no performance claim; measurement belongs to slice 4.7.

### Source References
- `team-Yuri/arch-phase4.md`, slice 4.3 contract: decisions S1-S10, expected files, testing expectations, handoff notes. Owner decision 2026-11-12: `/art/*` excluded (S2 unchanged).
- `team-Yuri/plan.md` (APPROVED), slice 4.3; `PRD.md` §8 and §10 (public static assets only, never private content in shared caches); `docs/DECISIONS.md` P4-1 and P4-2; `README.md` "Installation and updates".
- Code baseline `origin/main` `7bc45f8`: `public/sw.js` (`// sw-version: 4.2.0`), `e2e/offline.spec.ts`, `e2e/pwa.spec.ts`, `e2e/demo-video.spec.ts`, `src/components/pwa/ServiceWorkerRegistration.tsx` (registers the worker in production builds only), `vitest.config.ts` (unit tests are `src/**/*.test.ts`).
- Official documentation checked by the Manager on 2026-11-12 (MDN `Cache.put`, `Cache.keys`, `FetchEvent.respondWith`; W3C Service Workers, Batch Cache Operations): see "Verified platform semantics".
- Measurements by the Manager on 2026-11-12 (read-only): see M1.

### Architecture Summary
Service-worker-only change (S10). One file, `public/sw.js`, stays dependency-free and unsplit. Positive allowlist (S2), storable-response rule (S3), cache-first for `/_next/static/*` and stale-while-revalidate for the icons (S4), one `SW_VERSION` constant that names the shell cache `woffiz-shell-<SW_VERSION>` (S5), purge on activate (S6), oldest-first entry cap (S7), navigation, offline cache and message handler unchanged (S8), rollout through the 4.2 update flow (S9).

### Verified platform semantics
Checked against current official documentation; the Developer must not rely on anything weaker.
- `Cache.put(request, response)` stores any request/response pair, including non-200 and opaque ones, and overwrites an existing entry that matches the request (MDN). It throws `TypeError` for a URL scheme other than http or https, a non-GET request and a null response (W3C Batch Cache Operations). Therefore S3 is the only gate against bad entries; `cache.add`/`addAll` must not be used for runtime caching (they refetch and reject non-2xx).
- In the specification's batch `put`, a matching entry is **removed and the new pair appended to the end** of the cache's list. `Cache.keys()` returns requests in insertion order (MDN). So `keys()[0]` is the oldest entry, and a refreshed icon moves to the newest position.
- A 206 rejection and the `Vary: *` rule were not confirmed from the text read. Neither matters here: S3 never stores a 206, and every `put` is inside a `try`/`catch` that ignores failure (S3).
- `respondWith()` must be called during the event dispatch (otherwise `InvalidStateError`), takes a `Response` or a promise of one, and anything else becomes a network error; a rejected promise also becomes a network error. Therefore the allowlist decision must be **synchronous**, and a request that fails it must return from the handler **without** calling `respondWith` (the browser then handles it as today).
- `event.waitUntil(promise)` keeps the worker alive for background work after the response is returned. Cache writes and the stale-while-revalidate refresh must be passed to `waitUntil` before the response promise settles.
- A same-origin response has `Response.type === 'basic'` even for a CORS-mode request. Font requests made by CSS use CORS mode, so the predicate must not reject `request.mode === 'cors'` (only `navigate` is rejected).

### Ordered Milestones

| Order | Milestone | Description | Acceptance Signal |
|---:|---|---|---|
| 0 | Branch, worktree, baseline | Work in a **separate git worktree** on `feature/phase-4-shell-cache` created from `origin/main` `7bc45f8` (see Detailed Plan). `npm ci` inside the worktree, local `prisma generate`, baseline `npm run check` and the existing `offline.spec.ts` and `pwa.spec.ts` | Baseline green on the untouched base; base hash recorded |
| 1 | Measure and fix the S7 cap | Production build in the worktree; count files and bytes of `/_next/static/*` and the icons; apply the cap rule | Count, bytes and chosen cap recorded |
| 2 | Service worker | `public/sw.js`: S2 predicate, S3 rule, S4 strategies, S5 constant and cache name, S6 purge, S7 trim; header comment updated | All pre-existing `offline.spec.ts` cases still green; unit cases (M3) green |
| 3 | Unit tests | `src/lib/sw.test.ts`: `node:vm` harness over the real `public/sw.js` | Every case listed in the Detailed Plan green |
| 4 | E2E | Privacy proof (redefined test), offline behavior, purge and update path, media variant | Full `npm run test:e2e` green at 360/768/1280 |
| 5 | Documentation | `README.md` "Installation and updates", `docs/DECISIONS.md` `P4-3`, reference from `P4-2` | Docs match the shipped behavior |
| 6 | Evidence | `team-Yuri/dev-phase4.md`, 4.3 section on top, 4.2 record kept below | Manager review checklist satisfiable |

### Detailed Development Plan

#### M0. Branch, worktree and baseline
- **Shared folder rule.** The Woffiz folder is shared with other sessions and sits on the merged branch `feature/phase-4-install-update`. Do not switch its branch and do not touch its `node_modules`. Create a worktree outside the repository tree, for example `git worktree add ../Woffiz-4.3 -b feature/phase-4-shell-cache origin/main` (adapt the path; it must not be inside the repository). Run every command of this slice from that worktree.
- Base is `origin/main` `7bc45f8` (S1). If `main` has moved when work starts, base on current `main` and record the hash; do not merge or rebase later without telling the owner.
- `npm ci` inside the worktree; run `node_modules/.bin/prisma generate` (never a bare `npx <tool>`). The e2e tests need the local test database: reuse the existing local `TEST_DATABASE_URL` setup by copying the untracked `.env` into the worktree. It is never committed, and no command may touch the Supabase database or any non-test database. If the Developer cannot start the local test database, stop and report.
- Port `3100` is fixed in `playwright.config.ts` with `reuseExistingServer: false`; if another session is running e2e, wait instead of changing the config.
- **Artifacts.** The Architect's `arch-phase4.md` (4.3 revision) and this file are uncommitted in the shared folder. Copy `team-Yuri/arch-phase4.md` and `team-Yuri/manager-phase4.md` byte for byte into the worktree and commit them first, as one commit "Team Yuri artifacts for slice 4.3", before any code. Do not edit them.
- Baseline: `npm run check` and `npm run test:e2e -- e2e/offline.spec.ts e2e/pwa.spec.ts` on the untouched base. Record the results.

#### M1. Measure the production build and fix the S7 cap (S7)
Manager's starting measurement (read-only, 2026-11-12), **to be replaced by the Developer's own measurement of the 4.3 build**:
- Local build in the shared folder (`.next/BUILD_ID` `LoRpoEXFPNcPoLxiuEsNL`, 2026-11-11, commit not recorded): `.next/static` holds **67 files, 1,229,393 bytes**: 24 in `chunks/` (871,798 B), 40 in `media/` (357,200 B: 20 `.woff` and 20 `.woff2`) and 3 tiny build manifests (395 B). The four icons are 365,841 bytes. A browser fetches one format per font face, so one real session loads fewer files, but the cap uses the full directory.
- Production landing page (`https://woffiz.vercel.app/`) references 11 static files (674,379 bytes). Their URLs are under `/_next/static/immutable/chunks/…`, which differs from the local directory layout above. **The predicate and the tests must therefore match the prefix `/_next/static/` and never hard-code `/_next/static/chunks/`**, and the Developer must record which layout the 4.3 build produces.
- Proposed cap: **160 entries** (shell cache). Basis: two full builds are 2 × (67 + 4) = 142 entries, plus margin. Byte estimate: about 18 KB average per static file, so exactly two full builds are about 2.8 MB and the cache at its cap is about 3.2 MB worst case (the 4 icons are about 0.37 MB of that). These are raw file sizes, as stored responses are not compressed.
- **Rule for the Developer.** Build with `npm run build` in the worktree. Let N be the number of files under `.next/static` (all files, as served under `/_next/static/`). If 2 × (N + 4) ≤ 160 the cap stays 160; otherwise the cap is 2 × (N + 4) rounded up to the next multiple of 10. Record N, the byte total, the layout (`chunks`/`media`/`immutable`), the cap and the byte estimate in `dev-phase4.md` and in `P4-3`. The cap is a named constant in `public/sw.js` with a comment giving this derivation.

#### M2. `public/sw.js` (S2-S9)
Design details that the contract leaves to the Manager. The contract's decisions are not changed.
1. **Constants at the top:** `SW_VERSION = '4.3.0'`; `OFFLINE_CACHE = 'woffiz-offline-v1'` (value unchanged); `SHELL_CACHE = 'woffiz-shell-' + SW_VERSION`; `SHELL_CACHE_MAX_ENTRIES` (M1); the four icon paths in a `Set`. The `// sw-version:` comment line is removed; `SW_VERSION` is the one place to bump (S5). Before removing it, `git grep` for the marker string and update every reference (README, DECISIONS and the comment in `e2e/pwa.spec.ts` that mentions it are the known ones; the e2e comment may stay if it is only history, but then it must not claim the marker still exists).
2. **Predicate `isShellRequest(request)`, synchronous and pure.** True only if all of: method GET; `new URL(request.url).origin === self.location.origin`; `request.mode !== 'navigate'`; no `Range` header; no `RSC` header (case-insensitive) and no `_rsc` search parameter; and either the pathname starts with `/_next/static/` (any query string, because the platform may append a deployment query), or the pathname is exactly one of the four icon paths **and the query string is empty** (stricter than S2: it admits only the four URLs themselves, so a crafted query cannot create unbounded variants). Everything in S2's exclusion list falls out of the allowlist; do not add exclusion code paths that could drift from it.
3. **Predicate `isStorable(response)`:** `response.ok`, `status === 200`, `type === 'basic'`, `redirected === false`, and no `Cache-Control` containing `no-store` or `private` (case-insensitive).
4. **Cache key:** the request URL string for both `match` and `put`, so request headers never decide a hit.
5. **`fetch` handler.** The first lines are the existing navigation branch, unchanged in behavior (network first, `/offline.html` from `OFFLINE_CACHE` when the network request itself fails, HTTP errors pass through). A request that is neither a navigation nor `isShellRequest` returns without `respondWith`.
   - `/_next/static/*`: cache-first. A hit is returned without any network request. A miss fetches; if `isStorable`, `event.waitUntil` receives "put a clone, then trim"; the original response is returned. A rejected fetch stays rejected: no synthetic response (S4).
   - Icons: stale-while-revalidate. With a cached copy, return it at once and pass the background refresh (fetch, `isStorable`, put, trim, all errors swallowed) to `event.waitUntil`. Without one, fetch, store if storable, return.
   - Every cache operation (open, put, trim) is wrapped so that a rejection (quota, `TypeError`) is ignored and never changes the response the page gets (S3).
6. **`activate` (S6):** delete every cache whose name starts with `woffiz-` and is neither `OFFLINE_CACHE` nor `SHELL_CACHE`; never touch other names; then `clients.claim()` as today.
7. **`install`:** unchanged. It precaches only `/offline.html` into `OFFLINE_CACHE` and does not call `skipWaiting()`. The `message` handler (same-origin `{ type: 'SKIP_WAITING' }` only) is unchanged. The only `skipWaiting()` in the file stays in that handler.
8. **Trim (S7):** after each successful `put`, read `cache.keys()` and delete entries from the front until the count is at most the cap. Concurrent trims are harmless. The trim never runs on `OFFLINE_CACHE`.
9. **Header comment** rewritten to describe 4.3 (what is cached and why, the allowlist, the version constant, the purge, the rollback worker that calls `skipWaiting()` itself, deletes the `woffiz-*` caches and unregisters).
10. **Dev machines.** The worker is registered only in production builds (`ServiceWorkerRegistration.tsx`), so `next dev` does not use it. A developer who ran `npm start` and later `next dev` on the **same origin** may still have the production worker registered and serve cached chunks. `README.md` gets one line telling developers to unregister the worker or clear site data when switching (M5).

#### M3. Unit tests: `src/lib/sw.test.ts`
- **Location (Manager decision).** `src/lib/sw.test.ts`, because `vitest.config.ts` only includes `src/**/*.test.ts`, `vitest.config.ts` is not in the contract's expected files, and the contract lists `src/lib/pwa/*` as not touched. No config change is allowed.
- **Harness (Manager decision).** Read `public/sw.js` as text and execute it with `node:vm` (`runInNewContext`) in a sandbox that provides: `self` (with `location`, `addEventListener` collecting handlers by event name, `skipWaiting`, `clients.claim`, `registration`), an in-memory `caches` fake, a stubbed `fetch`, and Node's real `Request`, `Response`, `Headers`, `URL`. Tests drive the collected handlers with fake events (`request`, `respondWith`, `waitUntil`, `data`, `origin`) and await what was handed over. `public/sw.js` gets no export, no test hook and no conditional code. The fake `Cache` must implement the verified semantics: `put` removes any matching entry and appends the new one; `keys()` returns insertion order; `match`, `delete`, `open`, `keys` on the storage. Node's `Response.type` is `'default'`, so a "basic" response is made by overriding `type` (for example with `Object.defineProperty`) in a small helper.
- **Cases (all required):**
  - S2 allowed: a chunk, a CSS file and a font under `/_next/static/` (including the `immutable/` layout, a query string, and a font request with `mode: 'cors'`), and each of the four icons.
  - S2 rejected: `/`, `/home`, a navigation request; `/map?_rsc=…` and any request with an `RSC` header; `/api/auth/get-session`, `/api/attempts`, `/api/mastery`, `/api/media/playback`, `/api/media/local?…`, `/api/media/versions/<id>/captions`; `/_next/image?url=…`, `/_next/data/…`; `/art/map-painted.webp`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/icons/other.png`, an icon URL with a query string; a cross-origin storage URL; POST; a request with `Range`. A rejected request leaves `respondWith` uncalled.
  - S3: 200 basic is stored; 206, 404, 500, opaque, redirected, `Cache-Control: no-store` and `private` are returned to the page but not stored.
  - S4: a cached static asset is returned without calling `fetch`; a miss fetches, stores and returns; a miss with a rejected `fetch` rejects (no synthetic response); the icon returns the cached copy first and the refresh updates the entry; a rejecting `cache.put` still returns the network response.
  - S5/S7: the shell cache name is `woffiz-shell-` plus `SW_VERSION`; after more writes than the cap, the cache holds exactly the cap and the oldest entries are gone; a refreshed icon is not the first to go.
  - S6: `activate` keeps exactly `woffiz-offline-v1` and the current shell cache, deletes other `woffiz-*` caches (including an older shell version), leaves non-`woffiz-` caches alone, and calls `clients.claim()`.
  - S8 unchanged behavior: `install` adds only `/offline.html` to `woffiz-offline-v1` and never calls `skipWaiting`; the `message` handler ignores a wrong origin and any type except `SKIP_WAITING`, and calls `skipWaiting` once for a valid message; a navigation whose `fetch` rejects returns the cached offline page; a navigation that gets HTTP 500 passes the 500 through.
- A negative check recorded in the evidence: temporarily add `/art/` to the allowlist and see the S2 test fail, then revert (as the 4.2 static test did).

#### M4. End-to-end tests (Playwright)
General: runs against the local production build as today. Cache writes happen after the response (`waitUntil`), so assertions use `expect.poll` on the cache contents, never a fixed sleep. No change to `playwright.config.ts`.
1. **Privacy proof, `e2e/offline.spec.ts`: only the test "only the public offline page is ever cached" is redefined** (no other case in the file changes). After a signed-in session that loads `/home`, `/map`, `/review`, `/puppy` and a current exercise (`/exercise/<level>`, as `loop.spec.ts` does), and calls `/api/auth/get-session`:
   - `caches.keys()` equals exactly `['woffiz-offline-v1', 'woffiz-shell-4.3.0']` (order-insensitive);
   - `woffiz-offline-v1` holds exactly `/offline.html`;
   - the shell cache is not empty and every key matches the S2 allowlist;
   - no key is a navigation URL, `/api/*`, an `_rsc` URL, `/_next/image` or `/art/*`.
   Runs at the three viewports.
2. **Media variant, `e2e/demo-video.spec.ts` (desktop-1280 project): one new test, no existing test changed (Manager decision).** The same assertions after a session that resolves a fixture clip with the file's existing setup (tap-to-play, signed link requested). Reason: that file already owns the technique-wide shared clip state and runs serially in the desktop project; putting this test in a file that runs in parallel could race with it. This extends the contract's file list by one test in an existing file; it is flagged for the Architect's acknowledgment at final review. If the Developer shows a safe way to do it from `pwa.spec.ts`, either place is acceptable if the choice is recorded.
3. **Offline behavior, `e2e/pwa.spec.ts`, new case.** The page is controlled by the worker and has cached at least one `/_next/static/` asset. With the network offline: fetching that cached asset from the page returns 200 from the worker; `fetch('/api/auth/get-session')` fails; a navigation shows the unchanged Hebrew offline fallback. Then back online.
4. **Update and purge, `e2e/pwa.spec.ts`, new case**, built on the existing 4.2 pattern (`publishNewWorker`, which registers the same `public/sw.js` under a second script URL because Playwright cannot serve a changed worker body). Seed `woffiz-shell-0.0.0` (with one entry) **after** the page is controlled, because the first worker's own activation would otherwise purge it. Then publish a new worker; assert the banner shows and the waiting worker has not activated, so the stale cache **still exists, unchanged** and `woffiz-offline-v1` is intact. After "לעדכן עכשיו" and the single reload, assert that `woffiz-shell-0.0.0` is gone, `woffiz-offline-v1` still holds exactly `/offline.html`, and the cache set is again exactly the two allowed names.
   - **Interpretation of the contract (flagged).** The contract says the waiting worker "caches nothing until the tap". Because the active worker in this test runs the same file and keeps writing allowlisted assets, a black-box check of "the waiting worker writes nothing" is not separable in e2e. It is proved at unit level (M3, S8: `install` only adds `/offline.html`) and in e2e by the stale cache surviving until the tap. If the Developer finds this reading unachievable, stop and report.
5. All pre-existing cases stay green and unchanged: every other case in `offline.spec.ts`, `pwa.spec.ts`, `shell.spec.ts`, `auth.spec.ts`, and the Phase 3 suites.

#### M5. Documentation (`.claude/rules/30-docs.md`)
- `README.md`, "Installation and updates" only: replace the `// sw-version:` instruction with `SW_VERSION` in `public/sw.js`; add a short list of what the worker caches (the `/_next/static/` assets and four icons), what it never caches and why (HTML, API, RSC, media and signed URLs, `/art/*`, all private content), that old shell caches are purged when a new worker activates, and the dev-machine note from M2.10. State honestly that 4.3 makes no performance claim.
- `docs/DECISIONS.md`: a new `P4-3` row after `P4-2`: decision, the S2 allowlist, the owner decision on `/art/*`, the measured cap (M1), the `SW_VERSION` constant replacing the marker, status "Confirmed (owner, slice 4.3 plan; `/art/*` excluded 2026-11-12)", and that it supersedes the "only `/offline.html` is ever cached" part of P4-1. Do not edit the `P4-2` row except to add a reference to `P4-3`. No edit to any other row.
- `DESIGN_SYSTEM.md`: no change (no UI change). State this in the evidence.

#### M6. Evidence in `team-Yuri/dev-phase4.md`
The Developer owns the file. Mirror the layout of the other two Phase 4 artifacts: the 4.3 evidence on top with the standard sections, the existing 4.2 record kept unchanged below it under a heading "Slice 4.2 record (closed)", the two status lines of the 4.2 record labelled "(slice 4.2)". Do not alter the 4.2 evidence.

#### Verification rules
- `npm run check` passes (typecheck, lint, unit, build), run on a clean worktree.
- Full `npm run test:e2e` at 360/768/1280. The local PGlite database is known to be unstable under load (4.2 evidence); a failed test may be rerun after restarting the test database, and every rerun is reported as a rerun, never as a first-run pass. No test may fail twice.
- No local integration run is required: 4.3 changes no server, database or test-database code. CI on standard PostgreSQL must still show the 28 required PostgreSQL tests executed and passed.
- Push, draft PR and CI: the Developer prepares everything locally and **does not push, open a PR, merge or deploy** until the owner approves it. After approval: push once, open the draft PR, and CI (push and pull_request, both jobs) must be green on the final head in a single attempt. Record the run ids.

### Acceptance / Gating Criteria
1. Branch `feature/phase-4-shell-cache` is based on `origin/main` `7bc45f8` (or recorded newer `main`), worked in a separate worktree; the shared folder's branch and `node_modules` were not touched; the Team Yuri artifacts are the first commit.
2. `public/sw.js` is one dependency-free file with `SW_VERSION = '4.3.0'`, the shell cache `woffiz-shell-4.3.0`, the exact S2 allowlist (`/art/*` excluded), the S3 rule, S4 strategies, S6 purge and the S7 cap derived by the M1 rule.
3. `install` precaches only `/offline.html` and never calls `skipWaiting()`; the only `skipWaiting()` is in the `SKIP_WAITING` handler; the navigation branch, `woffiz-offline-v1` and the `message` handler behave as before.
4. `npm run check` passes; every unit case of M3 passes, with the negative check recorded.
5. Full e2e passes at the three viewports; the redefined privacy proof passes; the offline-behavior and update/purge cases pass; the media variant passes in the desktop project; every other pre-existing case is unchanged and passes.
6. No private data in any cache: after a signed-in session, the caches are exactly `woffiz-offline-v1` (only `/offline.html`) and `woffiz-shell-4.3.0` (only allowlisted URLs).
7. The update reaches an existing installation only through the 4.2 flow (banner, owner's tap, one reload); the stale shell cache is purged on activation.
8. The diff against `origin/main` contains only: `public/sw.js`, `src/lib/sw.test.ts`, `e2e/offline.spec.ts` (the one test), `e2e/pwa.spec.ts`, `e2e/demo-video.spec.ts` (one new test), `README.md` ("Installation and updates" only), `docs/DECISIONS.md` (`P4-3` and a reference from `P4-2`), and the Team Yuri artifacts. Not in the diff: `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, `public/icons/*`, `public/art/*`, `src/app/layout.tsx`, `src/components/pwa/*`, `src/lib/pwa/*`, `playwright.config.ts`, `.env.example`, `vitest.config.ts`, `prisma/`, `package.json`, `package-lock.json`, anything under `src/server/`.
9. Docs match the shipped behavior; `P4-3` records the cap and the owner's `/art/*` decision.
10. `MEDIA_REQUIRED` stays off, video production stays paused, techniques stay DRAFT, no media code changed. Nothing pushed, merged or deployed without the owner's approval; no paid resource, no production data or environment change.
11. After owner-approved push: CI green on the final head in a single attempt for both runs (push and pull_request), including "All 28 required PostgreSQL tests executed and passed" and e2e.
12. Real-device and deployed-build items recorded as PENDING with the arch list; they do not block this merge.

### Functional Testability Criteria

- Page/screen the user can open: any app page; the new state is visible in DevTools, Application, Cache Storage.
- User-visible behavior: none intended beyond the existing update banner for 4.2 installations. The app and the offline fallback behave as before.
- Command-line flow: `npm run check`; `npm run test:e2e` (and `npm run test:unit` for `src/lib/sw.test.ts`).
- API endpoint / request: none.
- Minimal end-to-end flow: sign in on the local production build; browse home, map, an exercise, review and puppy; inspect Cache Storage (only the offline page and allowlisted static assets); go offline (a cached asset loads from the worker, a page shows the offline fallback).
- Expected observable result: as above, asserted by the e2e privacy proof and the offline-behavior case.

### Required Developer Evidence
`team-Yuri/dev-phase4.md` (4.3 section) must contain, per `.claude/rules/20-testing.md` §80 and `30-docs.md` §50:
1. Phase identifier `PHASE=4`, slice 4.3, branch, worktree path, base hash, `git merge-base HEAD origin/main`, and confirmation that the shared folder was not touched.
2. Implementation summary per milestone M0-M6.
3. Final diff against `origin/main`: `git diff --stat` plus the full diff, showing the not-touched list of criterion 8 absent.
4. Dependencies: "none added"; `npm ci` result; `node_modules/.bin/prisma --version` and `prisma generate`; the database host of every database command (local test database only).
5. S7 measurement: N, byte total, layout, the cap and the byte estimate.
6. Unit tests: command, counts, the new file and every case of M3; the recorded negative check.
7. Lint and typecheck: commands and results.
8. E2E: command, per-project pass counts; the redefined test, the offline-behavior case, the update/purge case and the media variant named with results; confirmation that all other pre-existing cases passed unchanged; every rerun reported as a rerun.
9. The actual Cache Storage contents at the end of the privacy proof (names and entry counts), as text.
10. Functional testability: how the minimal flow was exercised.
11. Documentation: which sections of README.md and docs/DECISIONS.md changed; `DESIGN_SYSTEM.md` unchanged and why.
12. Real-device and deployed-build checklist from the arch (iPhone and Android installed app after the 4.3 update; DevTools Cache Storage on the deployed build), every item PENDING (owner).
13. Known issues, scope compliance (including `MEDIA_REQUIRED` off and video paused, nothing pushed or deployed), declaration. After owner approval of the push: PR link, run ids, attempts, per-job results, integration counts, the required-tests line and the e2e count.

### Out of Scope
- Caching pages, RSC payloads, API responses or any per-account response; offline training or offline report submission; `/art/*` (owner decision); precaching a build manifest; `/_next/image` caching; Background Sync; push.
- Performance measurement and claims (slice 4.7); account deletion (4.4); allowlist (4.5); metrics and alerts (4.6); device matrix and usability (4.8).
- Any change to the completed 4.2 reviews, to `next.config.ts` headers, to the manifest, icons, layout or UI, and any server, database, environment variable or dependency change.

### Risks / Open Questions
- **Open owner decisions: none block 4.3.** The six items in `plan.md` (alert channel, backups, retention, sending domain, pilot recruitment, performance profile) belong to 4.4-4.8. The only 4.3 decision, `/art/*`, is resolved (excluded).
- **Layout mismatch.** The deployed build serves static files under `/_next/static/immutable/…` while the local `.next` directory examined by the Manager does not use that layout. Mitigation: prefix match on `/_next/static/`, M1 re-measurement on the 4.3 build, tests using the real layout.
- **Asynchronous cache writes** make e2e assertions flaky if they read too early. Mitigation: `expect.poll`, never sleeps.
- **Dev machine on the same origin** as a registered production worker can serve cached chunks to `next dev` (documented in README, M2.10).
- **Shared folder and port 3100.** Worktree isolation (M0) avoids branch and `node_modules` conflicts; two sessions running e2e at once collide on the fixed port. Wait; do not change the config.
- **Artifacts are uncommitted in the shared folder** until the Developer commits copies in the worktree (M0). The shared folder keeps showing them as modified on the old branch; owner housekeeping, not a defect.
- **Release consequence (for the later owner approval).** Merging to `main` starts the automatic production deployment. Existing 4.2 installations see the update banner once and keep the 4.2 worker until the owner taps. The rollback target is then the production deployment of the 4.2 release `7bc45f8`, and a worker defect is handled by the documented rollback worker (P4-2/D6), which also removes every `woffiz-*` cache.
- **Interpretations flagged for the Architect's final review (none changes a decision S1-S10):** the unit test file location `src/lib/sw.test.ts`; icons admitted only with an empty query string; the media-variant e2e placed in `demo-video.spec.ts`; the reading of "caches nothing until the tap" given in M4.4.

### Manager Review
MANAGER_REVIEW_STATUS (slice 4.3): APPROVED

Review of slice 4.3 (revision 1 of this design), 2026-11-12. Reviewed: branch `feature/phase-4-shell-cache`, HEAD `cd94c50`, base `origin/main` `7bc45f8`, worktree `C:\Users\אוהד\Documents\Woffiz-4.3`, evidence in the 4.3 section of `team-Yuri/dev-phase4.md`. Local only at the time of review: nothing pushed, no PR, nothing merged or deployed.

#### Review Notes

**Checklist (`developer-review-checklist.md`):** phase identifier, implementation summary, files changed, unit result, lint result, functional testability, documentation, scope and known issues are all present and consistent. No reject condition applies.

**Independent verification by the Manager (not copied from the evidence):**
- `public/sw.js` read in full against S2-S9. The allowlist is synchronous; a request off the allowlist returns without `respondWith`; `isStorable` requires `ok`, status 200, type `basic`, not redirected, no `no-store` or `private`; the cache key is the URL string; `/_next/static/*` is cache first, icons are stale-while-revalidate with an exact URL and no query; every cache operation is inside `try`/`catch` and writes go through `event.waitUntil`; the trim deletes from the front; `activate` deletes every `woffiz-*` cache except the offline cache and the current shell cache; `install` precaches only `/offline.html`; the navigation branch and the `message` handler are behaviorally unchanged; the only `skipWaiting()` is in the `SKIP_WAITING` handler. `SW_VERSION = '4.3.0'`, cap 160 by the M1 rule (2 x (67 + 4) = 142 <= 160).
- `git diff 7bc45f8 HEAD --name-only` outside `team-Yuri/` lists exactly `README.md`, `docs/DECISIONS.md`, `e2e/demo-video.spec.ts`, `e2e/offline.spec.ts`, `e2e/pwa.spec.ts`, `public/sw.js` and `src/lib/sw.test.ts` (criterion 8). The path-filtered diff over `package.json`, `package-lock.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `public/offline.html`, `src/server`, `src/components/pwa` and `src/lib/pwa` is empty. The two Team Yuri documents in the first commit are byte-identical to the shared folder (`cmp`).
- `node_modules/.bin/vitest run src/lib/sw.test.ts`: 69 passed. `tsc --noEmit`: exit 0. `eslint e2e src/lib/sw.test.ts public/sw.js`: clean.
- **S2/S3 matrix and negative check.** The matrix covers every S2 inclusion and exclusion named in the contract; each rejected case asserts no `respondWith`, no `fetch` and no cache created, and each S3 case asserts that the page receives the network response object. The recorded negative check was re-proved without editing the Developer's files: on a scratch copy of `public/sw.js`, admitting `/art/` makes `/art/map-painted.webp` handled; dropping the `Range` guard makes a Range request handled; dropping the `redirected` check or the `type !== 'basic'` check makes a redirected or CORS-typed response stored. Each of those four behaviors is asserted by a case in the matrix, so each mutation is caught.
- **Privacy proof, offline case, update/purge case, media variant (read).** The redefined test asserts the cache names are exactly `woffiz-offline-v1` (only `/offline.html`) and `woffiz-shell-4.3.0`, that every shell key is an allowlisted static path or one of the four icons without a query, and that no key matches page, API, RSC, `/_next/image|data`, artwork, offline, worker or manifest paths. The media variant additionally plays a fixture clip and fetches captions and a playback link through the worker. The offline case uses `cache: 'no-store'`, so a 200 can only come from the worker; it proves an uncached static path fails with no synthetic response, the API fails, and a page shows the fallback. The update case seeds `woffiz-shell-0.0.0` after the page is controlled, shows it survives while the new worker waits, and shows that after the owner's tap the cache set is exactly the offline cache and the current shell cache. Writes are awaited with `expect.poll`, never with sleeps.
- **Independent e2e rerun by the Manager** (local production build, local test database only, `--workers=1`): the `auth`, `ai-plan`, `offline` and `pwa` specs, 93 tests: 92 passed, 1 failed (see below). All 4.3 cases (redefined privacy proof, offline case, update/purge case) passed in all three projects in this run.

**The e2e results and the pre-existing failure (review focus 3).** The Developer reported 217 of 217 with 23 passing only on a rerun after a local PGlite restart, and 3 failures inside pre-existing test bodies without a proven cause. The one failure in the Manager's run is the same pre-existing test as two of those three (`auth.spec.ts`, "register, onboard, refresh, sign out and sign back in…": the page stays on `/onboarding` instead of reaching `/home` within 5 s). To settle causation, the Manager ran that single test, 4 repetitions per project (12 runs), on a clean detached worktree of `main` `7bc45f8` (no 4.3 code) and on the 4.3 branch, with the same local database and one worker: **`main`: 6 failed, 6 passed; 4.3: 5 failed, 7 passed**, with the same assertion and the same received URL in every failure. The failure is therefore independent of 4.3: it occurs on `main` at the same rate on this local PGlite database. The temporary worktree was removed. This turns the Developer's "no proven causal link" into a demonstrated non-link to 4.3. CI on standard PostgreSQL is the gate (criterion 11), and this test passed in CI for 4.2. The 13 setup failures (fixture and seed) were in code outside the 4.3 diff and passed on the rerun; `ai-plan` passed in all three projects in the Manager's run.

**Cache privacy.** No concrete defect. The admission path is the allowlist plus the storable rule only; no page, API, RSC, media, artwork or cross-origin response can be written; a signed-in session leaves exactly the two caches with allowlisted keys (text proof in the evidence: 1 offline entry, 23 shell entries under `/_next/static/chunks` and `/_next/static/media`).

**Update and offline behavior.** The 4.2 owner-activated flow and the offline fallback are unchanged and their pre-existing cases passed. A worker defect is covered by the unchanged rollback worker (P4-2/D6), which also deletes the shell cache.

**Flagged interpretations: Manager position.** None changes S1-S10; the Architect acknowledges them in the final review.
1. `src/lib/sw.test.ts` with the `node:vm` harness: a Manager decision within the contract; accepted.
2. Icons admitted only with an empty query: stricter than S2, harmless (such a URL simply goes to the network) and consistent with an exact URL list; accepted.
3. The media variant in `demo-video.spec.ts`: accepted.
4. "Caches nothing until the tap": proved by the install-handler unit case and by the stale cache surviving while the new worker waits; accepted.
5. Renamed test title ("only the public offline page and public build assets are ever cached"): required, because the old title would now be false. The contract line that names the old title (`arch-phase4.md`, Testing) is the redefinition itself, and the old title appears nowhere else in the repository (no CI list, no required-test list); accepted.
6. One `pwa.spec.ts` comment now says `SW_VERSION`: comment only; accepted.
7. `caches.match(url, { cacheName })` for lookup (does not create a cache on read): accepted.

**Non-blocking observations (recorded, not corrections).**
- The deployed `/_next/static/immutable/…` layout is covered by a unit case but not by a local e2e run, because the local build does not produce it; the deployed-build Cache Storage check stays with the owner (criterion 12).
- The icons enter the cache only when something requests them; documented.
- `Vary: *` and 206 handling were not confirmed against a normative source in the design phase; both are covered by behavior (206 is rejected by the status rule, and the URL-string key ignores request headers).
- The e2e update path registers the same worker under a second URL (the 4.2 pattern); a real `SW_VERSION` bump was not re-run for 4.3, as the evidence states.

**Criteria status.** 1-10: met. 11: pending the owner-approved push (CI on the final head, single attempt, both runs, "All 28 required PostgreSQL tests executed and passed", e2e). 12: PENDING for the owner by design (4.8 matrix).

#### Required Corrections
None. Conditions for the next stage (not corrections): (a) the Architect's final review and this review are committed in the worktree before the single push, so the final head already contains all review documents; (b) one push, a draft PR, CI green on the final head in a single attempt on both runs; (c) the CI result is recorded in the PR description only, with no further documentation-only commit; (d) merge to `main` and the automatic Vercel production deployment need the owner's explicit approval.

---

---

## Slice 4.2 record (APPROVED, merged in `7bc45f8`; closed, not reopened)
STATUS (slice 4.2): APPROVED. MANAGER_REVIEW_STATUS (slice 4.2): APPROVED. Kept unchanged below; only the heading levels and these two status labels were adapted when slice 4.3 was added.

### Phase Identifier
PHASE=4

### Status
STATUS (slice 4.2): APPROVED

Scope of this revision: **slice 4.2 only** (install guidance, owner-activated update, production gate for `?state=` previews). Slices 4.3-4.8 are not designed here.

Revision 2 (2026-11-11): Phase 3 (PR #3) is merged and deployed on `main` at `505e2db` with green CI. By owner instruction, the 4.2 branch merges `origin/main` at a safe checkpoint (new milestone M0b), keeping all 4.2 work. This applies D1's rule that whichever branch merges second aligns with `main`. The base, the PR #3 overlap section, acceptance criteria 1, 3, 10 and 11, the evidence list and the risks are updated. The exercise practice-bar marker found during implementation is now part of the design (M5).

### Phase Goal
An owner can (1) find clear, honest, browser-appropriate Hebrew instructions for installing Woffiz on `/puppy`, (2) activate an available app update only by their own tap, with exactly one reload, and (3) never reach the `?state=` demo views in production. Previews stay available under `next dev`, unit tests and the local Playwright production build. The P4-1 offline fallback keeps working unchanged.

### Source References
- `team-Yuri/PHASE.md` (`PHASE=4`), `team-Yuri/plan.md` (APPROVED, slice 4.2), `team-Yuri/arch-phase4.md` (READY_FOR_MANAGER, decisions D1-D11).
- PRD.md §10 (contextual install guidance, no identical-prompt promise, public static caching only); ROADMAP.md Phase 4.
- DESIGN_SYSTEM.md §5, §8 "Puppy and settings", §9, §10, §11, §12, §14.
- docs/DECISIONS.md rows 6, 9 and P4-1.
- Current base after M0b: `origin/main` = `505e2db` (Phase 3 merge, verified 2026-11-11). Its tree is identical to the PR #3 head `3ddd5ba`. Relative to `d8add95` it adds the devDependency `mp4-muxer` 5.2.2, the migration `20261102180000_phase3a_media_catalog` (with `prisma/schema.prisma`), Phase 3 e2e suites (`admin-media.spec.ts`, `demo-video.spec.ts`), Playwright projects with `testIgnore: /demo-video.spec.ts/` and `grepInvert: /@desktop-only/` on 360/768, and a reworked `ExerciseScreen.tsx`. It reads `parseDevState` only in the same three pages, with the same call shape.
- Original code baseline: `origin/main` = `d8add95` (verified 2026-11-11): `public/sw.js`, `src/components/pwa/ServiceWorkerRegistration.tsx`, `src/lib/devState.ts`, `src/server/local-mode.ts` (+ test), the three preview pages, `src/app/(main)/puppy/page.tsx`, `src/app/layout.tsx`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`, `e2e/fixtures.ts`, `vitest.config.ts` (node environment, `src/**/*.test.ts`).
- API references checked at design time (2026-11-11):
  - Next.js 16.4.3 guide `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`: `display-mode: standalone` check, iOS instructions pattern, `updateViaCache: 'none'`; the guide notes that `beforeinstallprompt` is not cross-browser and does not work on iOS Safari.
  - MDN `ServiceWorkerGlobalScope.skipWaiting()`: can be called at any point; it has an effect only when the worker would otherwise stay `waiting`.
  - MDN `controllerchange`: fires when the registration gets a new active worker. A first-install `clients.claim()` also fires it, so a reload must be tied to an owner request, not to the event alone.
  - MDN `beforeinstallprompt`: WICG incubation, limited availability (Chromium). `preventDefault()` defers the browser UI; the saved event's `prompt()` is single-use; `appinstalled` fires after installation.
  - Apple's iPhone User Guide page on Home Screen web apps could not be retrieved in text form at design time. The iOS copy below is therefore **proposed** and stays PENDING until the real-iPhone check (arch, real-device item 1).

### Architecture Summary
- D1: branch from `origin/main` `d8add95`; PR #3 is neither assumed merged nor used. PR #3 has since merged first, so under D1 the 4.2 branch is the one that aligns with `main` (M0b: merge `505e2db`, keeping both sides of the documentation overlaps).
- D2/D3: `devPreviewsEnabled(env)` in `src/server/local-mode.ts` (development, test, or `isLocalMachine`). `parseDevState(value, enabled)` is the single choke point. In production `?state=` is silently ignored.
- D4/D6: a new worker that finds an active worker **waits**. It is activated only by the page message `{ type: 'SKIP_WAITING' }` sent after the owner taps. The page reloads exactly once after a requested `controllerchange`. First install activates immediately. Rollback workers call `skipWaiting()` themselves.
- D5: "update" means a new worker version. A deployment bumps the worker file. While the app is visible the client calls `registration.update()` at most once per hour.
- D7: offline fallback unchanged (`woffiz-offline-v1`, `/offline.html` only, network-first navigations, errors pass through). `public/offline.html` and `next.config.ts` are not touched.
- D8/D9: four install cases (installed, native prompt, iOS, other), detected on the client by a pure module. The card lives on `/puppy` only, anchored at `#install`. `/home` is unchanged, and there is no dismissal state.
- D10: global non-modal update banner (`role="status"`, polite, no focus steal), with "לעדכן עכשיו" (primary) and "אחר כך" (ghost).
- D11: no server API, database, environment variable or dependency changes.

### Ordered Milestones

| Order | Milestone | Description | Acceptance Signal |
|---:|---|---|---|
| 0 | Branch and baseline | Create `feature/phase-4-install-update` from `d8add95`; install dependencies; run the baseline checks | `npm run check` green on the untouched baseline; branch base recorded (done) |
| 0b | Merge `main` 505e2db | Checkpoint commit of the 4.2 work, then `git merge origin/main` (no rebase, no force push), conflict resolution per the table below, `npm ci`, local `prisma generate`, checks against the local test database only | Merge commit contains `505e2db`; no 4.2 change lost; `npm run check` green |
| 1 | Previews gate | `devPreviewsEnabled`, required `enabled` argument for `parseDevState`, three pages wired, unit matrix and static choke-point test | Unit tests green; `tsc` rejects an ungated call; existing `shell.spec.ts` preview routes still pass |
| 2 | Production gate check | `scripts/verify-previews-gate.mjs` + `npm run test:previews-gate` against a production build with blocking and permitting environments | Script passes: blocked cases show no preview, the positive control shows it |
| 3 | Service worker update model | `public/sw.js`: no `skipWaiting()` at install; strict `SKIP_WAITING` message handler; version marker; rollback comment | All `e2e/offline.spec.ts` cases green with no edits to that file |
| 4 | Update controller | `src/lib/pwa/update.ts` + `update.test.ts` (fake registration/container/clock) | All listed controller cases green |
| 5 | Update banner | `UpdatePrompt.tsx` + CSS; wired from `ServiceWorkerRegistration.tsx` | Banner renders only for a waiting worker; one reload on tap; nothing on "אחר כך" |
| 6 | Install detection | `src/lib/pwa/install.ts` + `install.test.ts`; client prompt store `src/components/pwa/install-prompt.ts` | All UA/standalone/prompt cases green |
| 7 | Install card | `InstallGuide.tsx` + CSS on `/puppy` (`#install`) | Correct case per environment; `/home` unchanged |
| 8 | E2E | `e2e/pwa.spec.ts` (install cases, update flow, previews on local, a11y/RTL/overflow/reduced motion) | Full `npm run test:e2e` green at 360/768/1280 |
| 9 | Documentation | DESIGN_SYSTEM.md, docs/DECISIONS.md (`P4-2`), README.md, all in the regions below | Docs reviewed; no edit inside PR #3's regions |
| 10 | Evidence | `team-Yuri/dev-phase4.md` with all required evidence | Manager review checklist satisfied |

### Detailed Development Plan

#### M0. Branch and baseline
Done before revision 2 (the branch exists on `d8add95`). Kept for the record; the current alignment step is M0b.
1. `git fetch origin`, then confirm `git rev-parse --short origin/main` prints `d8add95`. If it differs, **stop and ask the owner** (D1 names this base explicitly). The local `main` is stale (`379315a`), so do not branch from it.
2. `git switch -c feature/phase-4-install-update d8add95`.
3. The working tree carries changes that belong to other work: modified `.claude/launch.json`, untracked `pilot/…`, `scripts/*illustrated-preview*.mjs`, `.claude/rules/`, `.claude/skills/`, `team-Yuri/`. **None of them goes into 4.2 commits.** Commit only the files listed in this design (plus `dev-phase4.md` if the owner wants Team Yuri artifacts committed; ask at commit time).
4. `npm ci` (or `npm install` if the lockfile requires it), then `npm run check`. Record the result as the baseline.

#### M0b. Merge `main` 505e2db (revision 2)
Run this only from the Developer session that owns this folder. Several sessions share the Woffiz folder, so no other session switches its branch or touches its `node_modules`.
1. **Safe checkpoint:** stop at a point where the 4.2 files compile. Commit only the 4.2 files (the M0 exclusions still apply: `.claude/launch.json`, `pilot/`, `.media-local/`, `e2e/.media/`, the `*illustrated-preview*` scripts). Record the checkpoint hash. Do not use `git stash`: a commit is recoverable and reviewable.
2. `git fetch origin` and confirm `git rev-parse --short origin/main` prints `505e2db`. If it differs, stop and ask.
3. `git merge origin/main` (a merge commit; **no rebase, no force push**, nothing pushed in this step). Resolve conflicts as follows:

| File | Expected conflict | Resolution |
|---|---|---|
| `package.json` | `main` adds devDependency `mp4-muxer`; 4.2 adds script `test:previews-gate` | Keep both. Then run `npm install` to update `package-lock.json` only if the lockfile conflicts; otherwise `npm ci` |
| `src/components/exercise/ExerciseScreen.tsx` | `main` reworked the screen; 4.2 adds a `data-practice-bar` marker | Take `main`'s version in full, then put the marker (and its one-line comment) back on `main`'s `<div className={styles.practiceBar}>`. No other change |
| `DESIGN_SYSTEM.md` | `main` rewrote the §9 "Video" line and the §14 "Video" row | Keep `main`'s Video text exactly; keep the 4.2 §8 subsection, §9 lines and §14 rows in the regions M9 defines |
| `docs/DECISIONS.md` | `main` added rows 58-89 and edited the provider table | Keep `main`'s rows and table exactly; keep `P4-2` directly after `P4-1` |
| `README.md` | `main` appended the Phase 3 media sections at the end | Keep both; the 4.2 section stays before `## Checks` |
| any other file | none expected | Stop and report it before resolving |

4. After the merge: `npm ci`, then `node_modules/.bin/prisma --version` (must report 7.10.1) and `node_modules/.bin/prisma generate`. Call the local CLI by path, never bare `npx prisma`.
5. Database: only the local test database (`TEST_DATABASE_URL`). `npm run test:e2e` already applies `prisma migrate deploy` to it, including the new `20261102180000_phase3a_media_catalog`. Before any database command, print the host of the URL it uses and confirm it is local. Never connect to Supabase or run `migrate reset`/`db push` against anything other than the test database.
6. Checks after the merge: `npm run check`; `npm run test:integration` (local test database); `npm run test:e2e` (all projects, including the Phase 3 suites); `npm run build && npm run test:previews-gate`.
7. Media stays off: no change to `MEDIA_REQUIRED` (unset/off), no technique status change, no media ingest or publication. If the previews-gate server needs media variables to start, set them explicitly to their off values inside the script, never from `.env`.

#### M1. Previews gate (D2, D3)
`src/server/local-mode.ts`, added next to `isLocalMachine` with no other change:
```ts
/** `?state=` previews (decision 9, P4-2): development, tests, or this developer's machine only. Never on Vercel. */
export function devPreviewsEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || isLocalMachine(env)
}
```
`src/lib/devState.ts`:
- Signature `parseDevState(value: string | string[] | undefined, enabled: boolean): DevState | null`. `enabled` is **required, with no default**, so TypeScript rejects an ungated call. It returns `null` when `!enabled`.
- The module stays free of server imports (callers pass the boolean). Replace the "must be removed or gated" note with a pointer to `devPreviewsEnabled` and P4-2.

Pages: replace `parseDevState(x)` with `parseDevState(x, devPreviewsEnabled())` in `src/app/(main)/map/page.tsx`, `src/app/(main)/review/page.tsx` and `src/app/onboarding/page.tsx`. Make no other change to them: the order of preview branches and auth calls stays as it is, and `OnboardingFlow.tsx` is not touched.

Unit tests:
- `src/server/local-mode.test.ts`: add a `describe('devPreviewsEnabled')` table. **On:** `NODE_ENV=development`; `NODE_ENV=test`; `NODE_ENV=production` + `APP_ENV=local` + `http://localhost:3100`; same with `http://127.0.0.1:3100`; local machine without `LOCAL_SIGNUP` (proves the flag is irrelevant). **Off:** production with `APP_ENV` unset and an HTTPS URL (the Vercel shape); production with `APP_ENV=local` and `https://woffiz.example`; `APP_ENV=preview` with localhost; `APP_ENV` unset with localhost; look-alike `https://localhost.evil.example`; garbage URL; an empty env. Existing `signUpEnabled` cases stay unchanged.
- New `src/lib/devState.test.ts`:
  - parser: each `DEV_STATES` value is accepted when enabled; unknown value, `undefined` and an array (first element used) behave as today; **every** value returns `null` when disabled.
  - static choke point: read every `.ts`/`.tsx` file under `src/` except `*.test.ts`. Assert that (a) each `parseDevState(` call passes exactly `devPreviewsEnabled()` as its second argument (no literal `true`, no variable); (b) every read of the `state` search parameter (`(await searchParams).state`, `searchParams.state`, `.get('state')`, `['state']`) occurs only as the first argument of such a call; (c) the set of files that call `parseDevState` equals the known list (map, review, onboarding), so a new preview page fails until it is reviewed. Use the same `readFileSync` style as `src/lib/offline-page.test.ts`.

#### M2. Production gate check (arch "Production previews")
New `scripts/verify-previews-gate.mjs` and `package.json` script `"test:previews-gate": "node scripts/verify-previews-gate.mjs"`. It is **not** added to `check`, because it needs a build.
- Preconditions: a `.next` production build exists (otherwise print "run `npm run build` first" and exit 1). `TEST_DATABASE_URL` is set and differs from `DATABASE_URL`, the same guards as `scripts/test-e2e.mjs`. The server gets `DATABASE_URL=$TEST_DATABASE_URL`, so it never runs against Supabase.
- For each case it starts `npx next start -p 3101` with an **explicit** environment, waits for the port, sends unauthenticated `fetch` requests with `redirect: 'manual'`, then stops the server (also on failure). Every gate variable is set explicitly per case (`NODE_ENV=production`, `APP_ENV`, `BETTER_AUTH_URL`, a dummy `BETTER_AUTH_SECRET`), because `next start` loads the developer's `.env` for any variable that is missing and could otherwise reopen the gate.
- Cases:

| Case | APP_ENV | BETTER_AUTH_URL | Expectation for `/map?state=error` and `/map?state=empty` |
|---|---|---|---|
| A (Vercel shape) | `production` | `https://woffiz.example` | Body does not contain "לא הצלחנו לטעון את המפה" / "עוד אין תוכנית אימון"; response is the normal unauthenticated path (record status and `Location`) |
| B (one condition) | `local` | `https://woffiz.example` | Same as A |
| C (one condition) | `preview` | `http://localhost:3101` | Same as A |
| D (positive control) | `local` | `http://localhost:3101` | Status 200 and the preview heading present, which proves the check can tell the cases apart |

- Output: one PASS/FAIL line per case. Exit code 0 only if all four pass. If Next.js turns out to keep `.env` values over explicit process values, the Developer documents it and adjusts the cases, keeping A, B and C as the blocking proofs.

#### M3. Service worker update model (D4, D6, D7)
`public/sw.js` changes only the following; `activate`, `fetch`, `CACHE` and `OFFLINE_URL` stay byte-for-byte the same:
- Add a version marker line near the top, `// sw-version: 4.2.0`. Changing this line is how a deployment publishes a new worker (D5).
- `install`: keep the precache of `/offline.html` exactly. **Remove** `.then(() => self.skipWaiting())`. Per the service-worker lifecycle, a first install with no active worker activates immediately; when an active worker exists, the new one waits.
- New handler:
```js
self.addEventListener('message', (event) => {
  // Only the owner's "update now" tap (UpdatePrompt) activates a waiting worker; everything else is ignored.
  if (event.origin !== self.location.origin) return
  if (!event.data || typeof event.data !== 'object' || event.data.type !== 'SKIP_WAITING') return
  event.waitUntil(self.skipWaiting())
})
```
  `skipWaiting()` has no effect on a worker that is not waiting (MDN), and the page posts only to `registration.waiting`.
- Update the header comment: the waiting rule (P4-2), and a rollback that now reads "publish a `sw.js` that calls `self.skipWaiting()` itself (a rollback never waits for a tap), deletes the `woffiz-*` caches and calls `self.registration.unregister()`".
- No new cache, no change to `public/offline.html` or `next.config.ts`.
- `e2e/offline.spec.ts` is **not** modified. Its helper already handles first-install control. If a case fails because of D4, the Developer stops and reports the failure instead of editing that file beyond the minimal change arch D7 allows, and justifies the change in `dev-phase4.md`.

#### M4. Update controller (D4, D5)
New `src/lib/pwa/update.ts`, framework-free and DOM-free, so it runs under the existing node Vitest config:
```ts
export type UpdateStatus = 'idle' | 'available' | 'activating' | 'dismissed'
export type WorkerLike = { state: string; postMessage(message: unknown): void; addEventListener(type: 'statechange', fn: () => void): void }
export type RegistrationLike = { waiting: WorkerLike | null; installing: WorkerLike | null; addEventListener(type: 'updatefound', fn: () => void): void; update(): Promise<unknown> }
export type ContainerLike = { controller: unknown | null; addEventListener(type: 'controllerchange', fn: () => void): void }
export function createUpdateController(deps: {
  registration: RegistrationLike; container: ContainerLike; reload: () => void
  now?: () => number; setTimer?: (fn: () => void, ms: number) => unknown
}): { getStatus(): UpdateStatus; subscribe(fn: () => void): () => void; applyUpdate(): void; dismiss(): void; maybeCheckForUpdate(): void }
```
Rules:
- **Available** only when a waiting worker exists **and** `container.controller` is non-null (an existing installation), either at creation or when `updatefound` → the installing worker's `statechange` reaches `installed`. On first install (no controller) the status stays `idle`.
- `applyUpdate()`: if status is `available` and `registration.waiting` exists, set `requested = true` and status `activating`, then post exactly `{ type: 'SKIP_WAITING' }` to the waiting worker. Repeated calls are no-ops.
- `controllerchange`: if `requested` and not yet reloaded, reload once. If not requested (first-install claim, or another tab updated), there is **no reload**, and status becomes `idle` when no waiting worker remains.
- Fallback: if no `controllerchange` arrives within 10 s after `applyUpdate()`, reload once anyway (the owner asked for a reload). It shares the same once-guard, so there is never a second reload.
- `dismiss()`: status `dismissed`, no message. It stays dismissed for the rest of this page load, even if another waiting worker appears. A full reload creates a new controller (D10).
- `maybeCheckForUpdate()`: calls `registration.update()` only if at least 60 minutes have passed since the last call made by this controller (the first call after creation is skipped, because the browser already checks on navigation). Rejections are swallowed.
- The guard lives in memory only. No `localStorage` or `sessionStorage`.

`src/lib/pwa/update.test.ts` (fakes + fake clock/timer) must cover: first install with no controller → never `available`; an existing controller + waiting worker at creation → `available`; `updatefound` → `installed` with a controller → `available`; tap → exactly one `SKIP_WAITING` message → `controllerchange` → exactly one reload; a double tap → one message; an unrequested `controllerchange` → no reload; the 10 s fallback reloads once and a late `controllerchange` adds no second reload; dismiss → no message, stays dismissed; `maybeCheckForUpdate` throttled (none before 60 min, one after, a rejection swallowed).

#### M5. Update banner (D10)
`src/components/pwa/ServiceWorkerRegistration.tsx`:
- Keeps the production-only registration with the same options. After `register()` resolves, it creates the controller with `{ registration, container: navigator.serviceWorker, reload: () => window.location.reload() }` and renders `<UpdatePrompt controller={…} />`. It renders nothing until then, and nothing in development.
- Wiring for `maybeCheckForUpdate`: `visibilitychange` → `visible`, plus a 60-minute `setInterval` that calls it only when `document.visibilityState === 'visible'`. Listeners and the interval are cleaned up on unmount.
- `src/app/layout.tsx` is **not** modified (the prompt mounts inside `ServiceWorkerRegistration`).
- It also calls `captureInstallPrompt()` (M6) in its own effect **before** the production check, so the install event is captured from the first page in every environment.

`src/components/pwa/UpdatePrompt.tsx` (+ `UpdatePrompt.module.css`):
- Status comes from `useSyncExternalStore(controller.subscribe, controller.getStatus, () => 'idle')`.
- Markup (amended at Manager review, commit `6a028f5`): an always-present live-region wrapper `<div aria-live="polite">` with **no role**. When the status is `available` or `activating`, it contains the banner surface carrying `role="status"`, which matches arch D10 ("a non-modal banner with `role="status"`"). An empty `role="status"` mounted on every page collided with each page's own status messages (it broke `e2e/auth.spec.ts`). The banner surface contains:
  - text: **"גרסה חדשה של Woffiz מוכנה. העדכון יטען מחדש את העמוד."**
  - `<Button variant="primary" loading={status === 'activating'} loadingLabel="מעדכנים…">לעדכן עכשיו</Button>`
  - `<Button variant="ghost">אחר כך</Button>`
- No focus movement. The banner sits at the end of `<body>` in DOM order, after the page content. It is reached by Tab after the page's own controls; screen readers hear the polite announcement.
- Layout and tokens: `--color-surface`, `--radius-lg`, `--shadow-overlay`, padding `--space-4`, gap `--space-3`, text `--text-body`, `max-inline-size: var(--width-form)`, centered with `inset-inline: var(--gutter)`. `position: fixed`; `inset-block-end: calc(var(--nav-height) + env(safe-area-inset-bottom) + var(--space-3))` below 1024 px, so it clears the bottom nav, and `calc(env(safe-area-inset-bottom) + var(--space-6))` at 1024 px and above (top navigation). `z-index` 30, above the bottom nav (20). It must stay **below** any open Sheet/dialog; verify this with the exercise report sheet open. The buttons wrap onto two lines at 360 px and keep the 48 px minimum height.
- While the banner is visible, `body` gets bottom padding equal to the banner's block size via `:global(body:has(…))` in the module CSS, so the last content and focused controls can scroll clear of it (DESIGN_SYSTEM §5/§11).
- **Exercise practice bar (revision 2):** the exercise screen has a fixed "תרגלנו" bar (`.practiceBar`, `z-index` 15) directly above the bottom nav, and the banner must not cover it. Allowed change: a marker attribute `data-practice-bar=""` on that bar's element in `src/components/exercise/ExerciseScreen.tsx`, plus a one-line comment. The banner CSS uses `:global(body:has([data-practice-bar]))` to raise its offset above the bar. No other change to the exercise screen (no logic, no style, no copy). E2E: on `/exercise/<id>` with the banner shown, the banner and the "תרגלנו" button do not intersect at 360 px, and the report Sheet still opens above the banner.
- **No animation** (no transition is needed), which also satisfies reduced motion.
- `/offline.html` is static and never shows the banner.

#### M6. Install detection (D8)
New `src/lib/pwa/install.ts`, pure with no `window` access:
```ts
export type InstallCase = 'installed' | 'prompt' | 'ios' | 'other'
export type InstallInput = { userAgent: string; maxTouchPoints: number; standalone: boolean; promptAvailable: boolean; installedNow: boolean }
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean // iPhone|iPad|iPod, or "Macintosh" with maxTouchPoints > 1 (iPadOS desktop-class UA)
export function detectInstallCase(input: InstallInput): InstallCase
```
Precedence: `standalone || installedNow` → `installed`; else `promptAvailable` → `prompt`; else `isAppleMobile` → `ios`; else `other`. `maxTouchPoints` is the only input added beyond the arch list; the iPadOS desktop-class UA needs it, and it is part of the "coarse platform check" in D8. The UA is used only to choose instruction text.

`src/lib/pwa/install.test.ts` covers fixed UA strings: iPhone Safari → `ios`; iPhone Chrome (`CriOS`) → `ios`; iPadOS desktop-class (`Macintosh`, touch points 5) → `ios`; real macOS Safari (touch points 0) → `other`; Android Chrome with a prompt → `prompt`; Android Chrome without a prompt → `other`; desktop Chrome and Edge with a prompt → `prompt`; desktop Firefox and Android Firefox → `other`; standalone on any UA → `installed`; `installedNow` → `installed`; standalone wins over a prompt.

New client store `src/components/pwa/install-prompt.ts`. This is a small helper the arch file list does not name; it is required because `beforeinstallprompt` usually fires at page load, before `/puppy` is opened.
- `captureInstallPrompt()` is idempotent and attaches window listeners once. On `beforeinstallprompt` it calls `preventDefault()` (MDN pattern), keeps the event and notifies subscribers. On `appinstalled` it sets `installedNow = true`, drops the event and notifies.
- `subscribe`, `getSnapshot()` → `{ promptAvailable, installedNow }` (a stable object per change), and `promptInstall()`, which calls `prompt()` once, then drops the event (single-use) and notifies. A dismissed prompt therefore falls back to the `other` case.
- A local TypeScript type for `BeforeInstallPromptEvent` (it is not in the DOM lib). No storage, no network.

#### M7. Install card on `/puppy` (D8, D9)
`src/components/pwa/InstallGuide.tsx` (+ `InstallGuide.module.css`), a client component:
- Inputs: the store snapshot; `matchMedia('(display-mode: standalone)')` (with a change subscription) or `navigator.standalone === true`; `navigator.userAgent`; `navigator.maxTouchPoints`. All are read through `useSyncExternalStore`, with a server snapshot of "not yet detected".
- Before detection (SSR and first paint) it renders only the always-present intro, so there is no hydration mismatch and no loading text.
- Copy (Hebrew; proposed and reviewed by the owner in the PR, iOS labels PENDING the device check):
  - intro (always): "אפשר להוסיף את Woffiz למסך הבית ולפתוח אותה כמו אפליקציה."
  - `installed`: "Woffiz כבר מותקנת במכשיר הזה."
  - `prompt`: `<Button variant="primary">התקנה</Button>` → `promptInstall()`; muted line "הדפדפן יציג חלון אישור משלו."
  - `ios`: `<ol>` of three steps: 1. "הקישו על כפתור השיתוף (ריבוע עם חץ למעלה). אם הוא לא מופיע, הקישו קודם על ⋯." 2. "בחרו „הוספה למסך הבית”. ייתכן שצריך לגלול למטה ברשימה." 3. "הקישו על „הוספה”." Muted line: "באייפון ובאייפד ההתקנה נעשית דרך תפריט השיתוף. השמות יכולים להשתנות מעט בין גרסאות."
  - `other`: "בדפדפנים שתומכים בהתקנה, פתחו את תפריט הדפדפן ובחרו „התקנת האפליקציה” או „הוספה למסך הבית”. יש דפדפנים שלא תומכים בהתקנה, ואפשר להמשיך להשתמש ב-Woffiz כאן בדפדפן."
- Lucide icons are decorative (`aria-hidden`), at 20 px (for example `Share` on the iOS step, `Download` on the button). There are no tooltips.

`src/app/(main)/puppy/page.tsx`: add `<Card id="install" aria-labelledby="install-title" className={styles.sectionStack}>` with `<h2 id="install-title" className={styles.cardTitle}>התקנה במסך הבית</h2>` and `<InstallGuide />`. Place it **after** the "המסלול" card and **before** "חשבון". The card is always present. Nothing else on the page changes. `/home` is not touched.

#### M8. E2E `e2e/pwa.spec.ts`
It runs in the existing three projects (do **not** edit `playwright.config.ts`), uses `expectHealthyPage` (axe, RTL, overflow) and the `owner` fixture. Since `505e2db` the 360/768 projects skip tests tagged `@desktop-only`; `pwa.spec.ts` uses no such tag, so every case runs at all three widths.
- **Block genuine install events:** an init script on every install test registers a capture-phase `beforeinstallprompt` listener that calls `stopImmediatePropagation()` unless the event carries a test marker. Headless Chromium may otherwise fire a real event on the installable localhost app and turn the iOS/other cases into `prompt`.
- Install cases on `/puppy#install` (each asserts the heading "התקנה במסך הבית" and the case text):
  1. `other`: default Desktop Chrome UA, no synthetic event.
  2. `prompt`: dispatch a synthetic, marked `beforeinstallprompt` with a stub `prompt()` that counts calls and resolves `{ outcome: 'accepted' }`. Clicking "התקנה" calls it exactly once; the button is gone afterwards. Then dispatch `appinstalled` → "כבר מותקנת".
  3. `ios`: `test.use({ userAgent: <iPhone Safari UA> })` → three ordered steps (`listitem` count 3).
  4. iPadOS desktop-class: Macintosh UA plus an init script setting `navigator.maxTouchPoints` to 5 → `ios`.
  5. `installed`: an init script making `matchMedia('(display-mode: standalone)').matches` true → "כבר מותקנת".
  - `/home`: no "התקנה במסך הבית" heading and no install text.
  - Keyboard: Tab reaches "התקנה" with the visible focus ring; reduced motion via `page.emulateMedia({ reducedMotion: 'reduce' })`.
- **Update flow.** First do a spike: prove that `context.route('**/sw.js', …)` can serve a changed worker body (the original body plus a different `// sw-version:` line, keeping the original headers) to `registration.update()` in Chromium 1.64. If it works:
  1. `/home`, wait until the page is controlled (copy the small `controlledByServiceWorker` helper into `pwa.spec.ts`; do not edit `offline.spec.ts`), set a `window` marker.
  2. Route the changed `sw.js` and call `registration.update()` → the banner text appears; `document.activeElement` is unchanged (no focus steal); `expectHealthyPage` passes with the banner shown at each viewport; the banner does not cover the bottom nav (bounding boxes do not intersect below 1024 px).
  3. "אחר כך" → the banner disappears, the marker is still present (no reload), and `registration.waiting` is still non-null.
  4. Reload → the banner reappears (next page load). "לעדכן עכשיו" → wait for `load` → the marker is gone, exactly **one** main-frame navigation happened within 3 s, `registration.waiting` is null, and the banner is absent.
  5. With the new worker active: `setOffline(true)` + reload → the "אין חיבור לאינטרנט" fallback still appears.
  6. Reduced motion: the banner has computed `transition-duration` 0s and `animation-name` none.
  If the spike fails, follow the arch fallback: document the exact limitation in `dev-phase4.md`, rely on the M4 controller tests, keep an e2e that asserts **no** banner after the first install, and record a manual check performed locally (two builds with different `sw-version`, steps and observed result).
- Previews on the local server: `/map?state=error` shows "לא הצלחנו לטעון את המפה" (positive proof that the gate stays open locally). The existing `shell.spec.ts` preview cases stay unchanged and green.

#### M9. Documentation (arch "Expected files"; PR #3 overlap rules)
- **DESIGN_SYSTEM.md**
  - §8: new subsection `### Install guidance and app update`, appended after `### Puppy and settings` (end of §8). It covers the four install cases and their copy, the `/puppy` placement and `#install` anchor, no home hint and no dismissal, the honest "some browsers don't support installation" rule, and the banner copy and behavior (owner-activated, one reload, "אחר כך" until the next page load, non-modal, no focus steal).
  - §9: one line for the update banner and one for the install card, placed **after** "Do not rely on tooltips for essential mobile instructions." Do **not** touch the "Video" line (PR #3 rewrites it).
  - §14: two rows, "Install guidance" and "App update", appended right after the "Entire app offline" row and before the "Offline page:" paragraph. Do **not** touch the "Video" row.
- **docs/DECISIONS.md**: a new `P4-2` row directly after `P4-1` in "Phase 4 — PWA quality". It records D2-D10 and states that it supersedes the "remove or gate" note of decision 9 and the auto-activation (`skipWaiting` at install) part of P4-1, with the rollback rule from D6. Rows 9 and P4-1 are **not** edited. The provider table and the area where PR #3 adds rows 58-89 are **not** touched (the provider-table correction is deferred per arch).
- **README.md**: new self-contained section `## Installation and updates (Phase 4, slice 2)` placed immediately **before** `## Checks`. It covers where the install card is; how a deployment triggers the prompt (bump `// sw-version:` in `public/sw.js`); that the owner taps to update and the page reloads once; the hourly check while visible; the one-time prompt for existing installs on the first 4.2 deployment; the rollback worker calling `skipWaiting()` itself; the previews rule (development, tests and local machine only); and `npm run test:previews-gate`. Nothing is appended at the end of the file (PR #3 appends its media sections there), and the `## Checks` block is not edited.
- `.env.example`, `playwright.config.ts`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons: **not modified**.

#### Documentation overlap with draft PR #3 (re-verified 2026-11-11)
PR #3 head `3ddd5ba`, merge-base `d8add95`, 101 files. No 4.2 code file is changed by PR #3 (checked: `sw.js`, `ServiceWorkerRegistration`, `devState`, `local-mode`, the three preview pages, `puppy/page.tsx`, `layout.tsx`, `e2e/offline|shell`, `lib/pwa`, `components/pwa`, `next.config.ts`). PR #3 still reads `parseDevState` in the same three pages, so after either merge the gated signature applies to them unchanged.

| File | PR #3 hunks | 4.2 region | Resolution when merging second |
|---|---|---|---|
| `DESIGN_SYSTEM.md` | §9 "Video" line (line 157); §14 "Video" row (line 216) | new §8 subsection; §9 line after "Do not rely on tooltips…"; §14 rows after "Entire app offline" | Keep both sides |
| `docs/DECISIONS.md` | +52 lines before the Phase 4 section (rows 58-89); provider table (line 113) | `P4-2` row after `P4-1` | Keep both sides; provider table untouched by 4.2 |
| `README.md` | +23 lines appended after "## Layout" (end of file) | new section before "## Checks" | Separate regions; keep both |
| `playwright.config.ts`, `.env.example` | changed | not edited by 4.2 | No overlap if 4.2 complies |

Whichever PR merges second rebases onto `main` and resolves these three documentation files by keeping both changes. 4.2 performs no merge or rebase onto PR #3.

**Revision 2 status:** PR #3 merged first (`505e2db`), so 4.2 is the branch that aligns. The owner chose a merge of `origin/main` (M0b) rather than a rebase. The table above stays the rule for the documentation conflicts; M0b adds `package.json` and `ExerciseScreen.tsx`. The DECISIONS provider-table correction is no longer blocked by PR #3, but it stays out of 4.2 scope (arch "Out of Scope") until the Architect assigns it.

### Acceptance / Gating Criteria
1. Branch `feature/phase-4-install-update` started from `d8add95` and contains `origin/main` `505e2db` through one merge commit made after a 4.2 checkpoint commit (M0b). No rebase or force push. Every 4.2 change from the checkpoint is still present after the merge.
2. `npm run check` passes (typecheck, lint, unit, build).
3. `npm run test:e2e` passes in full at 360/768/1280, including every pre-existing `offline.spec.ts` and `shell.spec.ts` case with those files unchanged (or a justified minimal `offline.spec.ts` change per D7), and the Phase 3 suites from `main` (`admin-media.spec.ts`, `demo-video.spec.ts`). `npm run test:integration` passes on the local test database.
4. `npm run test:previews-gate` passes cases A-D.
5. `parseDevState` cannot be called without the gate (compile-time), and the static test enforces `devPreviewsEnabled()` at every call site.
6. `public/sw.js`: no `skipWaiting()` at install; the only `skipWaiting()` is in the `SKIP_WAITING` handler; `activate`/`fetch`/cache name unchanged; the cache still contains only `/offline.html` (existing e2e).
7. The update banner appears only for a waiting worker on an existing installation, never steals focus, sends the message only on "לעדכן עכשיו", reloads exactly once, and does nothing on "אחר כך".
8. `/puppy` shows the correct one of four install cases; `/home` is unchanged.
9. Hebrew RTL, 48 px controls, visible focus, no animation, no horizontal overflow at 360/768/1280, axe clean.
10. No change to progression, mastery, plans, generation, media, ownership, server APIs, database, env vars or dependencies beyond what the merge brings from `main`. No new `localStorage`/`sessionStorage`/cache usage. `MEDIA_REQUIRED` stays off; video production stays paused; no technique or media state changes.
11. Docs updated only in the regions above; `playwright.config.ts` and `.env.example` untouched by 4.2. `git diff --stat origin/main...HEAD` (the 4.2 diff against `505e2db`) shows neither, and in `ExerciseScreen.tsx` only the marker line.
12. Real-device and deployed-build items recorded as PENDING with the arch list. They do not block the 4.2 merge.

### Functional Testability Criteria

- Page/screen the user can open: `/puppy` (card "התקנה במסך הבית", `#install`); any page (update banner).
- User-visible behavior: browser-appropriate Hebrew install guidance or "כבר מותקנת"; a non-blocking "גרסה חדשה" banner that acts only on the owner's tap; production ignores `?state=`.
- Command-line flow: `npm run check`; `npm run test:e2e`; `npm run build && npm run test:previews-gate`.
- API endpoint / request: none (no new API). The gate is observable as `GET /map?state=error` on the production-mode server (M2).
- Minimal end-to-end flow: local production build → `/puppy` shows guidance → a changed `sw-version` is served → the banner appears → "לעדכן עכשיו" → one reload under the new worker → offline → the fallback still appears.
- Expected observable result: as above; previews visible on the local machine and invisible in cases A-C.

### Required Developer Evidence
`team-Yuri/dev-phase4.md` must contain (per `.claude/rules/20-testing.md` §80 and `30-docs.md` §50):
1. Phase identifier `PHASE=4`, slice 4.2, branch name, original base `d8add95`, checkpoint commit hash, merge commit hash, and `git merge-base HEAD origin/main` = `505e2db…`.
2. Implementation summary per milestone M1-M9, plus M0b: conflicts met, how each was resolved, and confirmation that no 4.2 change was lost (checkpoint vs. post-merge comparison of the 4.2 files).
3. Final 4.2 diff against `main`: `git diff --stat origin/main...HEAD` plus the full diff, showing `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts` and `src/app/layout.tsx` absent, and `ExerciseScreen.tsx` limited to the marker.
4. Dependencies: "none added by 4.2" (`mp4-muxer` arrives from `main`); `npm ci` result; `node_modules/.bin/prisma --version` and `prisma generate` output; the database host used by every database command (local test database only) and the migrations applied to it.
5. Unit tests: command and result counts; names of the new test files and the cases from M1, M4 and M6.
6. Lint and typecheck: commands and results.
7. E2E: command, per-project pass counts, and explicit confirmation that all pre-existing `offline.spec.ts` and `shell.spec.ts` cases passed.
8. `test:previews-gate` output (all four case lines).
9. Update-flow evidence: the spike result (automated or fallback), and in the fallback case the recorded manual check steps and observations.
10. Functional testability: how the minimal flow was exercised, with screenshots of `/puppy` (one per case at 360 px) and the banner at 360 px with the bottom nav visible.
11. Accessibility/RTL: axe results, keyboard focus order around the card and banner, reduced-motion result, overflow at 360/768/1280.
12. Documentation: which sections changed in DESIGN_SYSTEM.md, docs/DECISIONS.md and README.md, and confirmation that PR #3 regions were not touched.
13. Real-device and deployed-build checklist from arch-phase4.md copied with every item marked PENDING (owner).
14. Known issues, scope compliance statement (including `MEDIA_REQUIRED` off and video production paused), declaration.
15. Integration tests: `npm run test:integration` command and result on the local test database, with skipped PostgreSQL-only tests reported as skipped.

### Out of Scope
- Slices 4.3-4.8: asset caching, account deletion, pilot allowlist, metrics and alerts, drills and measurements, device matrix and usability.
- Push, background or periodic sync, manifest screenshots or shortcuts, a custom iOS install UI beyond instructions, build-version polling, a home-screen install hint, dismissal persistence.
- Any change to `public/offline.html`, `src/app/manifest.ts`, icons, `next.config.ts`, `playwright.config.ts`, `.env.example`, CI workflow (except the runner pin approved in revision 3), server APIs, database schema or environment variables.
- The DECISIONS provider-table correction (deferred until PR #3 merges).
- Deployment, merge to `main`, production changes or real-device runs (the owner does these after approval). The M0b merge of `main` into the 4.2 branch is in scope.
- Video production, media ingest or publication, technique status changes and the `MEDIA_REQUIRED` switch.

### Risks / Open Questions

| Risk / question | Impact | Handling |
|---|---|---|
| Playwright may not be able to serve a changed worker script to `registration.update()` | Update flow not automated end to end | M8 spike first; arch fallback (controller unit tests + recorded manual check) |
| `next start` loads `.env` for unset variables, which could reopen the gate in M2 | False FAIL or false PASS of the production check | Every gate variable set explicitly per case; positive control D; behavior documented |
| A genuine `beforeinstallprompt` in headless Chromium | Flaky install-case tests | Capture-phase blocker init script in `pwa.spec.ts` |
| `preventDefault()` on `beforeinstallprompt` defers Chromium's own mini-infobar; install then runs through the `/puppy` button or the browser menu | Small change in Android Chrome behavior | Standard MDN pattern required by D8's single-use `prompt()`. Recorded in `P4-2`; the owner sees it in the PR |
| iOS Share-sheet wording and the "⋯" path differ between iOS versions; Apple's guide was not retrievable at design time | Copy may not match the device | Copy marked proposed; real-iPhone item 1 stays PENDING and blocks 4.8, not 4.2 |
| Existing installs see the prompt once on the first 4.2 deployment | One extra prompt | Accepted in D4; documented in README and `P4-2` |
| Fixed banner overlapping content on small screens | Obscured controls | `body:has()` padding while visible; e2e geometry check at 360 px; dismissible |
| Unrelated local changes in the working tree (`.claude/launch.json`, `pilot/`, `.media-local/`, `e2e/.media/`, preview scripts) | Accidental scope creep in commits | Commit only the listed files (M0, M0b) |
| Losing uncommitted 4.2 work during the merge | Lost work | Checkpoint commit before merging; compare 4.2 files before and after; no stash, rebase or force push |
| Several sessions share this folder | A branch switch or `npm ci` from another session corrupts the state (incident 2026-11-11) | M0b runs only from the Developer session that owns the folder; Prisma via the local CLI by path |
| The Phase 3 migration on the test database, or the PGlite limits | e2e/integration failures unrelated to 4.2 | Use the README PGlite advice (`--workers=2`, restart the test database); report PostgreSQL-only skips as skipped |
| `ExerciseScreen.tsx` conflict with `main`'s rework | Marker lost or extra changes | Take `main`'s file and re-add only the marker; e2e geometry check on `/exercise` |
| Whether `team-Yuri/` artifacts are committed on the slice branch | Repository hygiene, not blocking | Developer asks the owner at commit time |

No blocking open question remains for implementation.

### Manager Review
MANAGER_REVIEW_STATUS (slice 4.2): APPROVED

#### Review Notes
Reviewed 2026-11-11: `team-Yuri/dev-phase4.md` on `feature/phase-4-install-update` (HEAD `05b9dc9`, code HEAD `6a028f5`, merge `d5218af`). The Developer review checklist passes on every item. The claims below were re-checked independently with git (read-only); test runs were not repeated.

1. **M0b merge and final diff.**
   - Verified: `origin/main` = `505e2db`; `d5218af` has parents `cb4b5df` (checkpoint, parent `d8add95`) and `505e2db`; `git merge-base HEAD origin/main` = `505e2db`. The branch is not on the remote (nothing pushed).
   - Nothing lost: `git diff cb4b5df d5218af` over the 4.2-only files is empty.
   - `git diff --stat origin/main...6a028f5` = 26 files, +1321/−19, matching the evidence. None of these files is in that diff: `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, the manifest, `layout.tsx`, the icons, `offline/shell/auth.spec.ts`, `eslint.config.mjs`, `package-lock.json` or `prisma/`.
   - `ExerciseScreen.tsx` changes by the marker and its comment only. `package.json` adds only `test:previews-gate`. The three docs have 0 removed lines against `main`.
   - **Accepted.**
2. **Deviation in the M5 wrapper markup (`6a028f5`).** The deviation is justified and minimal: one component file, and no test was changed to accommodate it. The always-present polite live region is kept, and `role="status"` on the visible banner matches arch D10 literally. **Accepted;** M5 is amended above. Residual risk: a status element inside a polite live region may be announced twice by some screen readers. Real-device item 7 (VoiceOver) covers this and stays PENDING.
3. **Integration and e2e reruns.**
   - Integration: 11 failures in the last two files, all "connection closed" within about 100 ms after a 540 s run. After restarting the test database, the same files gave 11/11 PASS. Combined: 151 passed, 29 skipped (PostgreSQL-only), 0 failed.
   - E2E (`--workers=2`): 9 first-run failures, none in a 4.2 area, with PostgreSQL protocol errors (`08P01`/`P2039`) in the server log. `--last-failed --workers=1` passed 9/9; 210/210 combined, and no test failed twice.
   - All 4.2-relevant suites (`offline`, `shell`, `pwa`, `auth`) passed in the first run at all three widths. 4.2 changes no server, database or progression code, and the PGlite instability is a known, documented limitation (README).
   - **Accepted for local evidence, with merge condition C1.**
4. Other points checked:
   - The M2 case D expectation was adjusted within M2's latitude (the body text is the signal); the A-C blocking proofs are intact.
   - The M8 spike failed, as M8 anticipated. The arch fallback plus a test-only script-URL trigger (test code only; no hook in app code) and a recorded two-build manual check of the real `sw-version` trigger exceed the fallback minimum.
   - `npm run check` is green on a clean checkout. The local lint failure comes only from untracked files.
   - `MEDIA_REQUIRED` stays off and video production stays paused; nothing was pushed or deployed.

**Merge conditions (owner and orchestrator; no Developer correction required):**
- C1. Before merging to `main`, the PR's CI must be green on standard PostgreSQL in a single run: the CI job "Integration and e2e on standard PostgreSQL", including `assert-required-tests` for the required PostgreSQL-only tests (26 listed in `scripts/required-pg-tests.json`; the 29 local skips also included tests that are skipped for other reasons), and the e2e job. A failure there reopens this review. **Closed 2026-11-11 on `49ea7d3`, see "C1 closure" below. Reopened the same day on `9b5e973`, see "C1 reopened" below. Closed again on 2026-11-12 on `afbb030` and `a93d12a`, see "C1 closed again" below.**
- C2. Commit `05b9dc9` commits the Team Yuri artifacts (`PHASE.md`, `plan.md`, `arch-phase4.md`, `manager-phase4.md`, `dev-phase4.md`). M0 left that to the owner, and `dev-phase4.md` records no decision. The owner decides whether that commit stays in the PR. This manager document has changed since `05b9dc9` (this review), so if the commit stays, it needs updating. **Resolved 2026-11-11: the owner decided to keep the artifacts in the PR. This reviewed manager document is committed on top as its own commit.**
- C3. Real-device and deployed-build items stay PENDING. They block the pilot release (4.8), not this merge.

#### Required Corrections
None.

#### Scope amendment (revision 3, 2026-11-11): CI runner pin for PR #5
Approved by the owner and the Manager. This is a narrowly scoped CI fix so that merge condition C1 can be evaluated. It is not a product change.

**Facts (CI runs `43054638786` push and `43054685522` pull_request, both on `f24da02`):** job "Typecheck, lint, unit tests, build" passed. In job "Integration and e2e on standard PostgreSQL", `npm ci`, the integration tests and `assert-required-tests` (the PostgreSQL-only tests) **passed**. Then `npx playwright install --with-deps chromium` **failed** and "End-to-end tests" was **skipped**. The job uses `runs-on: ubuntu-latest`, which resolved to Ubuntu 26.04 (`resolute`). `apt` repeatedly failed with "Temporary failure resolving" for `azure.archive.ubuntu.com`, `archive.ubuntu.com` and `security.ubuntu.com`, while `packages.microsoft.com` resolved. The failure is in runner infrastructure, before any 4.2 e2e code runs.

**Approved change (Developer, a separate commit):**
- Before editing, verify against Playwright's official documentation (system requirements and release notes for 1.64.1) that Ubuntu 24.04 is a supported platform for Chromium and `install --with-deps`. Record the source and finding in `dev-phase4.md`. If it is not supported, stop and report.
- In `.github/workflows/ci.yml`, change **only** the `postgres` job: `runs-on: ubuntu-latest` → `runs-on: ubuntu-24.04`, with a one-line YAML comment giving the reason (Ubuntu 26.04 apt DNS failures during the Playwright dependency install; revisit when `ubuntu-latest` is stable). The `quality` job stays on `ubuntu-latest`.
- Keep everything else byte-for-byte: services, environment, every step, `npx playwright install --with-deps chromium`, the integration and required-tests steps, `npm run test:e2e`, and the report upload. No `continue-on-error`, no retries or `|| true`, no skipped or filtered tests, no changed assertions, no timeout changes, no cache shortcuts in place of the dependency install.
- One commit containing only `ci.yml` plus the documentation below; no application, test or config file. Documentation: one sentence in README `## Checks` (the paragraph about the GitHub Actions workflow) saying the PostgreSQL job runs on `ubuntu-24.04` and why, and the evidence in `dev-phase4.md`.

**Verification and stop rules:**
- Push the commit to the PR branch (the PR already exists, so CI runs on that commit) and record the run IDs and the result of both jobs on that commit. C1 is met only if both jobs pass in a single run, including e2e.
- If the same failure (apt DNS resolution) persists on `ubuntu-24.04`: do not retry blindly and do not change anything else. Inspect the logs (runner image and version, which hosts fail, whether any apt host resolves) and report the findings to the owner. Only then may a Playwright container image (`mcr.microsoft.com/playwright:v1.64.1-…`) be **proposed**. It needs a new approval before implementation.
- If a different failure appears (for example a real test failure), report it with the log excerpt; this review reopens. Do not fix tests under this amendment.
- No merge to `main`, no deployment, no change to the PR's draft status without the owner.

**Required evidence in `dev-phase4.md`:** the Playwright compatibility source, the commit hash and its diff (`ci.yml` and the README sentence only), the CI run IDs with the conclusion of each job and step, and, if it failed, the log analysis.

**C1 status:** integration and the PostgreSQL-only tests on standard PostgreSQL passed on `f24da02`. The e2e job is not yet evaluated (skipped because of the runner failure). C1 stays **open** until e2e passes in CI.

#### C1 closure and final owner approval readiness (2026-11-11)
Verified independently with `gh` (run metadata, job and step conclusions, logs) and `git` (read-only).

**Runner pin commit `0ce5973`:** only `.github/workflows/ci.yml` (`postgres` job: `runs-on: ubuntu-24.04` plus a one-line reason comment) and one sentence in README `## Checks`. The `quality` job stays on `ubuntu-latest`. No step, test, assertion or dependency install changed, and there is no `continue-on-error`, retry or skip. The Playwright compatibility check is recorded in `dev-phase4.md` (System requirements list Ubuntu 24.04; `playwright-core` 1.64.1 has `ubuntu24.04-x64`). **Within revision 3.**

| Head | Run | Event | Attempt | Quality job | PostgreSQL job (`ubuntu-24.04`, image 20261101.360.1) |
|---|---|---|---:|---|---|
| `0ce5973` | `43063382772` | push | 1 | success | success |
| `0ce5973` | `43063386873` | pull_request | 1 | success | success |
| `49ea7d3` | `43065122170` | push | 1 | success | success |
| `49ea7d3` | `43065132886` | pull_request | 1 | success | success |

In every PostgreSQL job, every step succeeded; the only skipped step is "Upload Playwright report on failure". On `49ea7d3`, both runs show integration test files 14 passed / 1 skipped (180 tests: 179 passed, 1 skipped). The skipped file is `test/integration/ai-live.test.ts`, which is `describe.skipIf(!live)`: the live model is never called in CI, by design. Each run also shows "All 26 required PostgreSQL tests executed and passed (180 tests in the report)." and e2e "Running 210 tests using 2 workers … 210 passed", with no failed or flaky test.

`49ea7d3` changes only `team-Yuri/dev-phase4.md` (+22 lines, the CI evidence for `0ce5973`). The runs on `49ea7d3` are recorded here only; `dev-phase4.md` does not list them. That is not a gap, because they repeat the same verdict on a documentation-only head.

**C1: CLOSED.** CI is green on standard PostgreSQL in a single attempt, with integration, the required PostgreSQL tests and e2e all passing, on two consecutive heads, including the current PR head `49ea7d3`.

**PR #5 status for the owner's final approval:**
- PR #5 `feature/phase-4-install-update` → `main`: open, **draft**, GitHub reports mergeable and merge state `CLEAN`, head `49ea7d3` (local = remote at verification time).
- Final diff against `main` (`505e2db`): 32 files, +2400/−21. That is the 26 slice 4.2 files reviewed above, plus `.github/workflows/ci.yml` (revision 3) and the five Team Yuri artifacts kept by the owner (C2). None of these is in the diff: `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, the manifest, `layout.tsx`, `offline/shell/auth.spec.ts`, `eslint.config.mjs`, `package-lock.json` or `prisma/`.
- Merge conditions: C1 closed; C2 resolved (artifacts kept); C3 stays PENDING (real-device and deployed-build checks block the pilot release in 4.8, not this merge).
- This closure note is committed locally on top of `49ea7d3` and is **not pushed**. If it is pushed, the new head is documentation-only, and its CI must also be green before merging, consistent with C1.
- Remaining owner actions, none of them performed here: mark PR #5 ready for review, approve, and merge; then any deployment as a separate approved step. No merge or deployment was done.

#### C1 reopened: intermittent Phase 3 test on head `9b5e973` (revision 4, 2026-11-11)
`9b5e973` (this document's C1 closure, documentation only) was pushed with the owner's approval. On that head, pull_request run `43101062711` passed and push run `43101057240` **failed** in "Integration tests (includes concurrency / row locking)": 178 passed, 1 failed, 1 skipped. Because the integration step failed, the required-tests check and e2e did not run in that run.

**Failing test:** `test/integration/media-generation.test.ts:300`, "media generation on standard PostgreSQL > a withdrawal waits for a generation commit that holds the technique row, so the committed binding predates it". `AssertionError: expected 1794431690092 to be less than or equal to 1794431690030`: the job's `finishedAt` is 62 ms later than the clip's `withdrawnAt`.

**Finding: a test flaw, not an ordering defect, and not caused by slice 4.2.** This diagnosis is **supported by code inspection and the CI log; it is not a reproduced failure.** The failure was not reproduced locally or in CI, the log does not show the committed plan's contents, and no test was rerun. The Developer's investigation below is what confirms or refutes it.
- The test runs `completeOnboarding` and `withdraw` in parallel. When generation succeeds, it assumes the plan was bound while the clip was still published and requires `finishedAt <= withdrawnAt`.
- Generation reads the offered techniques before the model call, outside any transaction (`src/server/onboarding.ts`, `loadOfferedTechniques(prisma, …)`). If the withdrawal commits before that read, no technique is offered, the plan is free-form with no binding, `recheckBoundTechniques` has nothing to check, and the commit succeeds after the withdrawal. That outcome is correct, but the test's timestamp assertion fails on it.
- `withdrawnAt` is stamped only after the withdrawal holds the technique row `FOR UPDATE` (`src/server/media/lifecycle.ts`). Had generation held the row first, `withdrawnAt` would be the later timestamp. So in this run the withdrawal came first.
- A bound plan cannot commit after a withdrawal: the commit takes the same technique row `FOR SHARE` and re-reads what is published (`src/server/media/offer.ts`), at the default READ COMMITTED isolation (no `isolationLevel` is set anywhere). The two sibling tests that assert exactly this (commit waits for an in-flight withdrawal or suspension, then refuses) passed in the same run.
- The test file and `src/server/media`, `src/server/ai` and `src/server/onboarding.ts` are identical to `main`; the test dates from Phase 3C (`287ce90`). The flaw is on `main` and can fail any CI run there. `9b5e973` differs from the green `49ea7d3` only in this document.
- Inspection also suggests that the test rarely exercises the ordering in its title: the withdrawal is a short transaction and usually commits first, so most passing runs go through the rejected branch.

**Approved correction scope (owner instruction 2026-11-11; Developer; one separate test-only commit):**
Files: `test/integration/media-generation.test.ts`, and `test/integration/helpers.ts` only if a shared helper is needed. Production code (`src/`) stays unchanged.

1. **Distinguish free-form plans from technique-bound plans.** Wherever a parallel generation can succeed, the test reads the owner's stored exercise versions and decides by what was saved, not by the promise result alone. A successful plan with no `techniqueKey` (committed after the withdrawal) is a valid outcome and is asserted as such: job `SUCCEEDED`, zero bound exercise versions for this owner, no timestamp comparison.
2. **Deterministic synchronization for the named test.** "a withdrawal waits for a generation commit that holds the technique row, so the committed binding predates it" must exercise that ordering on every run, with no reliance on scheduling luck and no fixed sleeps as the ordering mechanism:
   - generation has read the offer while the clip is published, and its commit transaction holds the technique row `FOR SHARE`;
   - only then does the withdrawal start, and the test **observes** it blocked on that lock (for example through `pg_locks` / `pg_stat_activity`) before letting generation's commit finish;
   - the mechanism is test-only. Candidates seen in code inspection, for the Developer to verify: a database-level blocker held by the test on a statement that the commit transaction runs after `recheckBoundTechniques` (the commit order is `fenceJob`, `lockPuppy`, recheck, `ensureTestMediaRows`, plan and level inserts, `finishJob`), or a signal through the injectable `techniqueDeps`. The Developer chooses and justifies it.
   - If this ordering cannot be forced without a production hook, **stop and report**; do not add the hook under this scope.
3. **Assert saved state, not only timestamps.** In the deterministic case assert all of: the generation result is fulfilled and the job is `SUCCEEDED`; the saved exercise version carries the binding (`techniqueKey`, `techniqueVersion`, `techniqueVariant` and the slot `mediaId`, as the neighbouring tests assert); the withdrawal fulfilled only after generation's commit; the media version ends `WITHDRAWN` with `withdrawnAt`, `withdrawnById` and the reason set; the stored binding is unchanged by the withdrawal (history is not rewritten). The `finishedAt <= withdrawnAt` assertion stays for the bound case.

Rules:
- The two existing "generation commit waits for an in-flight withdrawal / suspension" tests keep their assertions. If the unsynchronized parallel case is kept as an additional test, it must use the distinction in item 1.
- Not allowed: removing or loosening an assertion, a tolerance on timestamps, `skip`, `retry`, a longer sleep in place of synchronization, changes to the CI workflow or to other tests. Test titles listed in `scripts/required-pg-tests.json` stay exactly as they are; if a new PostgreSQL-only test is added, add its title to that file (the only allowed change there), so `assert-required-tests` proves it ran.
- **Real-defect rule:** if the investigation shows a technique-bound plan committed after the withdrawal took effect, or a withdrawal that did not wait for a commit holding the row, that is a production defect. Stop, report the evidence, and change nothing in `src/` without a new approval.

**Verification before requesting merge approval:**
- Run the affected file on **standard PostgreSQL** (`TEST_DB_KIND=postgres`), not PGlite, where these tests are skipped. If no local standard PostgreSQL is available, say so and use CI as that run; do not report a PGlite skip as a pass. Run the named test repeatedly on standard PostgreSQL (state how many times) to show it is deterministic.
- Then full CI on the pushed commit: both the push and the pull_request run, each in a single attempt, with both jobs green.

**Evidence required in `dev-phase4.md`:** whether the diagnosis was confirmed (and how: the forced ordering, and the free-form ordering observed or constructed); the synchronization mechanism and why it is test-only; the commit hash and diff (test files only, `git diff --stat` showing no `src/` change); the standard PostgreSQL runs of the affected tests with counts and repetition; the CI run IDs on the new head with attempt numbers, each job's result, integration counts, the required-tests line and the e2e count.

**Status:** slice 4.2 approval stands (no 4.2 file is involved). **C1 is open** until both CI runs on the PR head pass in a single attempt with the corrected test. A rerun of `43101057240` without the correction does not close C1. No merge or deployment.

#### C1 closed again: media-generation test correction reviewed (2026-11-12)
Evidence reviewed: `dev-phase4.md`, section "Media-generation test correction", and the diff of `f38ed53` read directly.

**Review of the correction (accepted):**
- Scope: `f38ed53` changes `test/integration/media-generation.test.ts` and `scripts/required-pg-tests.json` only. `git diff 9b5e973 HEAD -- src` is empty. No slice 4.2 file is involved; `playwright.config.ts` and `.env.example` are untouched.
- Item 1 (free-form vs bound): the unsynchronized race is kept as its own test and decides by what was saved (refused candidate with nothing stored and the unit refunded; bound plan with the timestamp order asserted; free-form plan with no binding and no timestamp comparison). A separate test constructs the free-form ordering (withdraw first, then generate), which is the case the old assertion rejected. No assertion was removed or loosened; one was added (`GENERATION_FAILED` on the rejected branch), and that code exists in `src/server/errors.ts`.
- Item 2 (deterministic synchronization): test-only. The test holds `LOCK TABLE "Plan" IN SHARE MODE`, so the commit's first plan `INSERT`, which runs after `recheckBoundTechniques` (`src/server/onboarding.ts`), waits while the commit already holds the technique row `FOR SHARE`. The test observes in `pg_stat_activity` / `pg_blocking_pids` that the commit waits behind the test's lock, starts the withdrawal only after that, and observes the withdrawal waiting on `"TechniqueVersionState" ... FOR UPDATE`, blocked by the commit's backend. The only pause spaces the polls. The lock is released in `finally`, so a failed expectation cannot leave it held. No production hook.
- Item 3 (saved state): asserts the saved binding (`techniqueKey`, `techniqueVersion`, `techniqueVariant`, slot `mediaId`, parameters, rendered content), job `SUCCEEDED`, settlement order generation then withdrawal, media version `WITHDRAWN` with `withdrawnAt`, `withdrawnById`, reason and note, `finishedAt <= withdrawnAt`, and the stored exercises identical before and after the withdrawal.
- Required list: two new PostgreSQL-only titles added (28 required titles; no existing title changed; one title is allowed to skip, the live-model test).
- Diagnosis: confirmed as a test flaw by construction and by the forced ordering. The original failure `43101057240` itself was not reproduced and its log does not show which ordering occurred; that stays stated as such. No production defect was found.
- Not measured: how often the unsynchronized race takes each of its three branches. Accepted; the synchronized test covers the bound ordering on every run.

**Verification accepted:**
- Standard PostgreSQL 17.11 (throwaway server outside the repository; PGlite not used): the affected file 14 passed; the PostgreSQL-only group 25 consecutive green runs (125 executions, 0 failures); full integration 179 passed, 3 skipped (two CI-guard cases that run only under `CI=true`, and the live-model test).
- CI on head `afbb030`: push run `43110046263` and pull_request run `43110054197`, attempt 1, both jobs green, integration 181 passed / 1 skipped, "All 28 required PostgreSQL tests executed and passed", e2e 210 passed.
- CI on the current PR head `a93d12a` (documentation only; `git diff f38ed53 a93d12a` is `dev-phase4.md` alone): push run `43112478218` and pull_request run `43112486608`, attempt 1, runner `ubuntu-24.04`, both jobs green in both runs, "All 28 required PostgreSQL tests executed and passed (182 tests in the report)", e2e 210 passed (3.7 and 4.1 min). Checked in the run logs.

**C1: CLOSED.** Four consecutive green single-attempt runs on two heads contain the corrected test. The failing run `43101057240` was not rerun, as required.

**PR #5 status for the owner's final approval:**
- PR #5 `feature/phase-4-install-update` -> `main`: open, **draft**, mergeable, merge state `CLEAN`, head `a93d12a` (local = remote; `main` at `505e2db`).
- Final diff against `main`: 34 files, +2682/-25. The slice 4.2 files as reviewed, plus `.github/workflows/ci.yml` (revision 3, runner pin), `test/integration/media-generation.test.ts` and `scripts/required-pg-tests.json` (revision 4, test only), and the Team Yuri artifacts kept by the owner (C2). Not in the diff: `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, the manifest, `layout.tsx`, `prisma/`, `package-lock.json`. The only `src/` changes are slice 4.2 files.
- Merge conditions: C1 closed; C2 resolved; C3 stays PENDING (real-device and deployed-build checks block the pilot release in 4.8, not this merge).
- This note is committed locally on top of `a93d12a` and **not pushed**. A push creates a new documentation-only head whose CI must be green before merging, consistent with C1.
- Remaining owner actions, none performed here: mark PR #5 ready for review, approve and merge; deployment is a separate approved step. No merge or deployment was done.
