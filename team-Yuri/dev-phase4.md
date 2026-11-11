# Developer Phase 4

## Phase Identifier
PHASE=4

Slice: **4.2** (install guidance, owner-activated update, production gate for `?state=` previews). Manager design: revision 2.
Branch: `feature/phase-4-install-update`. Original base `d8add95` (`origin/main` verified as `d8add95` before branching, 2026-11-11).
- Checkpoint commit (4.2 files only): `cb4b5df`.
- Merge commit (M0b): `d5218af`, parents `cb4b5df` + `505e2db`. `origin/main` verified as `505e2db` before merging. No rebase, no force push, nothing pushed.
- Follow-up commit after the merge: `6a028f5` (banner `role="status"` fix, see "Implementation Summary").
- `git merge-base HEAD origin/main` → `505e2db40d8df797a2e0167327caedcba891d17a`.

## Status
STATUS: COMPLETE

## Source References
- `team-Yuri/PHASE.md` (`PHASE=4`), `team-Yuri/plan.md` (APPROVED, slice 4.2), `team-Yuri/arch-phase4.md` (D1-D11), `team-Yuri/manager-phase4.md` (READY_FOR_DEVELOPER, M0-M10).
- `.claude/rules/20-testing.md`, `30-docs.md`, `40-project-structure.md`; DESIGN_SYSTEM.md §5, §8, §9, §10, §11, §12, §14.
- Playwright 1.64.1 typings (`node_modules/playwright-core/types/types.d.ts`): request interception does not cover traffic handled by service workers (issue #1090).

## Implementation Summary
- **M0** Branch from `d8add95`; `npm ci`; baseline recorded (see "Baseline").
- **M0b** (revision 2) Checkpoint commit `cb4b5df` with the 26 files of 4.2 only, then `git merge origin/main` (`505e2db`) → merge commit `d5218af`.
  - Conflicts met: **one**, `src/components/exercise/ExerciseScreen.tsx`, as the M0b table expected. Resolution: `main`'s version in full (`git checkout --theirs`), then only the `data-practice-bar=""` attribute and its one-line comment on `main`'s `<div className={styles.practiceBar}>`. `git diff origin/main -- ExerciseScreen.tsx` shows exactly that hunk (+2/−1).
  - Merged automatically, both sides kept: `package.json` (`mp4-muxer` from `main` + `test:previews-gate` from 4.2; `package-lock.json` identical to `main`, so `npm ci`), `DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `README.md`. Against `main` the three docs show insertions only (24 lines, 0 removed): `main`'s "Video" line and row, rows 58-89 and the provider table are intact; `P4-2` follows `P4-1`; the 4.2 README section sits before `## Checks` and `main`'s media sections stay at the end.
  - No other file conflicted.
  - Nothing lost: `git diff cb4b5df d5218af` over the files only 4.2 touches (`public/sw.js`, `src/components/pwa`, `src/lib/pwa`, `src/lib/devState*`, `src/server/local-mode*`, the three preview pages, `puppy/page.tsx`, `e2e/pwa.spec.ts`, `scripts/verify-previews-gate.mjs`) is empty.
  - After the merge: `npm ci` → exit 0 (553 packages); `node_modules/.bin/prisma --version` → prisma 7.10.1, @prisma/client 7.10.1; `node_modules/.bin/prisma generate` → "Generated Prisma Client (7.10.1) to .\src\generated\prisma".
  - Database: every database command used `TEST_DATABASE_URL` at host `localhost:51218` (printed and checked before use; `DATABASE_URL` is `localhost:51214`, `DIRECT_URL` unset). `prisma migrate deploy` (run by the integration and e2e scripts) reported "7 migrations found … No pending migrations to apply": `20261102180000_phase3a_media_catalog` was already on the local test database. No Supabase connection, no `migrate reset`, no `db push`.
  - Media: `MEDIA_REQUIRED` is unset in the environment used and was not changed; no technique status change, no ingest, no publication. The previews-gate server starts without any media variable.
- **M1** `devPreviewsEnabled(env)` added to `src/server/local-mode.ts`. `parseDevState(value, enabled)` now requires the gate (no default) and returns `null` when it is off. The three preview pages pass `devPreviewsEnabled()`; nothing else in them changed (same branch order, same auth calls). New `src/lib/devState.test.ts` (parser, a `@ts-expect-error` compile-time proof of the required argument, and the static choke point), and a `devPreviewsEnabled` table in `src/server/local-mode.test.ts`.
- **M2** `scripts/verify-previews-gate.mjs` + `npm run test:previews-gate` (not in `check`). It starts the production build once per case with an explicit environment against `TEST_DATABASE_URL`.
- **M3** `public/sw.js`: version marker `// sw-version: 4.2.0`; `skipWaiting()` removed from `install`; strict `SKIP_WAITING` message handler (same origin, exact type); header comment with the waiting rule and the new rollback text. `activate`, `fetch`, `CACHE` and `OFFLINE_URL` are byte-for-byte unchanged.
- **M4** `src/lib/pwa/update.ts`: framework-free update controller (available only for a waiting worker on a controlled page; one `SKIP_WAITING` per tap; reload once on a requested `controllerchange`; 10 s fallback sharing the once-guard; dismiss for this page load; hourly throttled `update()` with rejections swallowed; memory only).
- **M5** `UpdatePrompt.tsx` + CSS, mounted by `ServiceWorkerRegistration.tsx` after `register()` resolves (production only). Visibility-change and hourly-interval wiring with cleanup. `captureInstallPrompt()` runs in its own effect before the production check. `src/app/layout.tsx` is not modified.
- **M6** `src/lib/pwa/install.ts` (pure `isAppleMobile`, `detectInstallCase`) and the client store `src/components/pwa/install-prompt.ts` (deferred `beforeinstallprompt`, `appinstalled`, single-use `promptInstall()`; no storage, no network).
- **M7** `InstallGuide.tsx` + CSS and the "התקנה במסך הבית" card on `/puppy` (`#install`, after "המסלול", before "חשבון"). `/home` is untouched.
- **M8** `e2e/pwa.spec.ts`. The required spike failed (see "Update-flow evidence"); the arch fallback was applied and extended with an automated flow based on a documented test-only trigger.
- **M9** DESIGN_SYSTEM.md, docs/DECISIONS.md (`P4-2`) and README.md, in the regions named by the Manager only.
- **Exercise practice bar (M5, revision 2):** below 1024 px the banner would cover the exercise screen's fixed "תרגלנו" bar. Found in e2e, approved by the owner, and now part of the design: `ExerciseScreen.tsx` gets only `data-practice-bar=""` plus a comment, and `UpdatePrompt.module.css` lifts the banner above the bar below 1024 px using tokens only (`--nav-height` + safe area + `--cta-height` + 3 × `--space-3`).
- **Deviation from M5 markup, needs Manager acknowledgement (commit `6a028f5`):** M5 asks for an always-present wrapper `<div role="status" aria-live="polite">`. Because the prompt mounts on every page, that empty `status` element made the pre-existing `e2e/auth.spec.ts` reset-password case fail in all three projects (`getByRole('status')` matched two elements). Fix inside the 4.2 component only: the always-present wrapper is `<div aria-live="polite">` (still a polite live region present before the content arrives), and `role="status"` sits on the banner element, which exists only while the banner shows. `auth.spec.ts` is unchanged. The first full e2e run had already shown this failure, and it was first misread as local database flakiness.

## Implemented Milestones

| Milestone | Completed: Yes/No | Notes |
|---|---:|---|
| M0 Branch and baseline | Yes | Baseline green after clearing stale build output (see "Baseline") |
| M0b Merge `main` 505e2db | Yes | One expected conflict; nothing lost; all checks rerun after the merge |
| M1 Previews gate | Yes | Static test proven to fail on an ungated call (negative check) |
| M2 Production gate check | Yes | 4/4 PASS; case D expectation adjusted as allowed by M2 (see below) |
| M3 Service worker update model | Yes | All pre-existing `offline.spec.ts` cases green, file unchanged |
| M4 Update controller | Yes | 12 unit cases |
| M5 Update banner | Yes | Practice-bar placement per revision 2; `role="status"` moved to the visible banner (deviation above) |
| M6 Install detection | Yes | 24 unit cases |
| M7 Install card | Yes | Four cases verified in e2e and screenshots |
| M8 E2E | Yes | Spike failed → fallback + automated flow with a test-only trigger + manual two-build check |
| M9 Documentation | Yes | Insertions only; no PR #3 region touched |
| M10 Evidence | Yes | This file |

## Files Changed

Final 4.2 diff against `main`: `git diff --stat origin/main...HEAD` (HEAD = `6a028f5`, `origin/main` = `505e2db`). The full diff is `git diff origin/main...HEAD` (1,321 insertions, 19 deletions); it is not copied into this file.

```text
 DESIGN_SYSTEM.md                                 |  14 ++
 README.md                                        |   9 +
 docs/DECISIONS.md                                |   1 +
 e2e/pwa.spec.ts                                  | 295 +++++++++++++++++++++++
 package.json                                     |   3 +-
 public/sw.js                                     |  22 +-
 scripts/verify-previews-gate.mjs                 |  99 ++++++++
 src/app/(main)/map/page.tsx                      |   3 +-
 src/app/(main)/puppy/page.tsx                    |   8 +
 src/app/(main)/review/page.tsx                   |   3 +-
 src/app/onboarding/page.tsx                      |   3 +-
 src/components/exercise/ExerciseScreen.tsx       |   3 +-
 src/components/pwa/InstallGuide.module.css       |  34 +++
 src/components/pwa/InstallGuide.tsx              |  84 +++++++
 src/components/pwa/ServiceWorkerRegistration.tsx |  50 +++-
 src/components/pwa/UpdatePrompt.module.css       |  52 ++++
 src/components/pwa/UpdatePrompt.tsx              |  52 ++++
 src/components/pwa/install-prompt.ts             |  66 +++++
 src/lib/devState.test.ts                         |  75 ++++++
 src/lib/devState.ts                              |   9 +-
 src/lib/pwa/install.test.ts                      |  62 +++++
 src/lib/pwa/install.ts                           |  30 +++
 src/lib/pwa/update.test.ts                       | 203 ++++++++++++++++
 src/lib/pwa/update.ts                            | 127 ++++++++++
 src/server/local-mode.test.ts                    |  28 ++-
 src/server/local-mode.ts                         |   5 +
 26 files changed, 1321 insertions(+), 19 deletions(-)
```

`ExerciseScreen.tsx` against `main` (the whole change):

```diff
-          <div className={styles.practiceBar}>
+          {/* data-practice-bar: the update banner (pwa/UpdatePrompt) sits above this fixed bar instead of covering it. */}
+          <div className={styles.practiceBar} data-practice-bar="">
```

New files: `e2e/pwa.spec.ts`, `scripts/verify-previews-gate.mjs`, `src/lib/devState.test.ts`, `src/lib/pwa/install.ts`, `src/lib/pwa/install.test.ts`, `src/lib/pwa/update.ts`, `src/lib/pwa/update.test.ts`, `src/components/pwa/InstallGuide.tsx`, `src/components/pwa/InstallGuide.module.css`, `src/components/pwa/UpdatePrompt.tsx`, `src/components/pwa/UpdatePrompt.module.css`, `src/components/pwa/install-prompt.ts`.

Absent from the diff (verified with `git diff origin/main...HEAD --name-only`): `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons, `src/app/layout.tsx`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`, `e2e/auth.spec.ts`.

| File | Change Summary | Reason |
|---|---|---|
| `src/server/local-mode.ts` | `devPreviewsEnabled()` | M1 / D2 |
| `src/lib/devState.ts` | Required `enabled` argument; doc comment points to P4-2 | M1 / D3 |
| `src/app/(main)/map/page.tsx`, `review/page.tsx`, `src/app/onboarding/page.tsx` | Pass `devPreviewsEnabled()` | M1 |
| `src/server/local-mode.test.ts`, `src/lib/devState.test.ts` | Environment matrix, parser, static choke point | M1 |
| `scripts/verify-previews-gate.mjs`, `package.json` | Production gate check + `test:previews-gate` | M2 |
| `public/sw.js` | Waiting rule, `SKIP_WAITING` handler, version marker, rollback text | M3 / D4 / D6 |
| `src/lib/pwa/update.ts` + test | Update controller | M4 |
| `src/components/pwa/ServiceWorkerRegistration.tsx`, `UpdatePrompt.tsx` + CSS | Banner and wiring | M5 / D10 |
| `src/lib/pwa/install.ts` + test, `src/components/pwa/install-prompt.ts` | Install detection and prompt store | M6 / D8 |
| `src/components/pwa/InstallGuide.tsx` + CSS, `src/app/(main)/puppy/page.tsx` | Install card on `/puppy` | M7 / D9 |
| `src/components/exercise/ExerciseScreen.tsx` | `data-practice-bar` marker only | M5 (revision 2) |
| `e2e/pwa.spec.ts` | Install cases, update flow, sheet stacking, local previews | M8 |
| `DESIGN_SYSTEM.md`, `docs/DECISIONS.md`, `README.md` | §8/§9/§14, `P4-2`, "Installation and updates" | M9 |

## Dependencies Installed

| Dependency / Tool | Command Used | Reason |
|---|---|---|
| None added by 4.2 | `npm ci` after the merge → exit 0, 553 packages | `mp4-muxer` 5.2.2 (devDependency) arrives from `main`. 4.2 adds only the `test:previews-gate` script to `package.json`; `package-lock.json` is identical to `main`. |
| Prisma CLI (local, by path) | `node_modules/.bin/prisma --version`; `node_modules/.bin/prisma generate` | 7.10.1 / 7.10.1; client generated to `src/generated/prisma` |

## Baseline (M0, on `d8add95`, before the merge)
- `npm ci` → exit 0.
- First `npm run check` → typecheck failed only on stale generated files in `.next/types` and `.next/dev/types` left by the Phase 3 branch (routes such as `src/app/admin/media/...` that do not exist on `d8add95`). No `next` server was running; `.next` (build output, gitignored) was removed.
- Second `npm run check` → typecheck PASS; lint FAIL only on files git does not track: a leftover worktree folder `.claude/worktrees/phase-4-offline-recovery/` (166 files, its own `.next`) and the owner's untracked `pilot/mouthing-illustrated-preview/*.js`. `eslint.config.mjs` is not part of this slice and was not changed.
- Baseline per step: `npm run typecheck` PASS; `npx eslint . --ignore-pattern ".claude/**" --ignore-pattern "pilot/**"` PASS; `npm run test:unit` PASS (8 files, 74 tests); `npm run build` PASS.

## Unit Tests

| Field | Value |
|---|---|
| Command | `npm run test:unit` |
| Result | PASS after the merge: 18 files, 216 tests (the 4.2 branch before the merge: 11 files, 138 tests, of which 64 new in 4.2; `main` adds 7 files) |
| Notes | New/changed files and cases below |

- `src/server/local-mode.test.ts` → `devPreviewsEnabled` on: development; test; production + `APP_ENV=local` + `http://localhost:3100`; same with `http://127.0.0.1:3100`; local machine without `LOCAL_SIGNUP`. Off: the Vercel shape; `APP_ENV=local` + `https://woffiz.example`; `APP_ENV=preview` on localhost; `APP_ENV` unset on localhost; `https://localhost.evil.example`; garbage URL; empty env. Existing `signUpEnabled` cases unchanged.
- `src/lib/devState.test.ts` → every `DEV_STATES` value accepted when enabled; unknown/undefined/array behavior; every value `null` when disabled (string and array); `@ts-expect-error` on an ungated call (typecheck fails if it ever compiles); static choke point: callers equal the known list (map, review, onboarding), every call passes exactly `devPreviewsEnabled()`, and `(await searchParams).state`, `searchParams.state` / `params.state`, `.get('state')` and `['state']` appear nowhere else in `src/` (non-test files).
  - Negative check: temporarily changing the review page to `parseDevState(..., true)` made two choke-point tests fail; the file was restored.
- `src/lib/pwa/update.test.ts` → first install never `available`; existing controller + waiting worker at creation → `available`; `updatefound` → `installed` → `available` (one notification); tap → exactly one `{ type: 'SKIP_WAITING' }` → `controllerchange` → exactly one reload (later events/fallback add none); double tap → one message; tap with nothing available → nothing; unrequested `controllerchange` → no reload and the offer clears; 10 s fallback reloads once and a late `controllerchange` adds no second reload; dismiss → no message, stays dismissed for another waiting worker; unsubscribe; `maybeCheckForUpdate` skips the first call, none before 60 min, one after, throttled again; rejection swallowed.
- `src/lib/pwa/install.test.ts` → iPhone Safari → ios; iPhone Chrome (CriOS) → ios; iPadOS desktop-class (Macintosh, 5 touch points) → ios; macOS Safari (0 touch points) → other; Android Chrome with/without prompt → prompt/other; desktop Chrome and Edge with prompt → prompt; desktop and Android Firefox → other; `installedNow` → installed; standalone wins over a prompt; standalone on each of the nine UAs → installed; `isAppleMobile` touch threshold.

## Lint

| Field | Value |
|---|---|
| Command | `npm run check` (typecheck, lint, unit tests, production build) |
| Result | PASS |
| Notes | See below |

- **Clean checkout of HEAD `6a028f5`** (detached worktree outside the repository folder, own `npm ci`, removed afterwards): `npm run check` → **exit 0** (typecheck PASS; lint 0 problems; 18 files / 216 tests; build "Compiled successfully"). The build needs `DATABASE_URL` to be set (`src/server/db.ts`); the clean checkout has no `.env`, so a local dummy value was passed (`postgres://build:build@localhost:1/build`; the build never connects). The first attempt without it failed at the build step with "DATABASE_URL is not set".
- **This working copy:** `npm run check` stops at lint because eslint also scans files git does not track: the leftover `.claude/worktrees/phase-4-offline-recovery/` folder (166 files, listed in `.git/info/exclude`) and five untracked `pilot/mouthing-illustrated-preview/*.js` scripts. Per step here: `npm run typecheck` PASS; `npx eslint . --ignore-pattern ".claude/**" --ignore-pattern "pilot/**"` PASS (0 problems); `npm run test:unit` PASS (216); `npm run build` PASS. Stale `.next` output from another session's dev server was removed first (no server was running).

## Integration Tests

| Field | Value |
|---|---|
| Command | `npm run test:integration` (local test database, `localhost:51218`, PGlite) |
| Result | PASS: 151 passed, 29 skipped, 0 failed (in two runs, see notes) |
| Notes | Skipped = the concurrency / row-locking tests that run only on standard PostgreSQL (`TEST_DB_KIND=postgres`, CI); they are reported as skipped, not passed |

- Full run: 15 files, 180 tests → 140 passed, 29 skipped, **11 failed** (540 s). All 11 are in the last two files (`onboarding.test.ts` 10, `data-api-lock.test.ts` 1), which failed within about 100 ms with "Server has closed the connection" / "Connection terminated unexpectedly": the local PGlite server dropped its connection.
- After restarting the test database: `npm run test:integration -- test/integration/onboarding.test.ts test/integration/data-api-lock.test.ts` → 2 files, **11 passed** (23 s).
- An earlier attempt was aborted by me (stopping the database while the suite was still running, because its 10-minute silence looked like a hang); it is not counted.

## E2E

Command: `npm run test:e2e -- --workers=2` (the README's local PGlite setting), after the merge, on HEAD `6a028f5`, local test database only. 210 tests in the three projects, including the Phase 3 suites from `main`.

| Run | Result |
|---|---|
| Full run (`--workers=2`, 14.8 min) | 201 passed, **9 failed** |
| `npm run test:e2e -- --last-failed --workers=1` after restarting the test database (1.3 min) | **9 passed** |
| Combined | 210 of 210 passed; no test failed twice |

The 9 first-run failures were in `ai-plan.spec.ts` (1, tablet), `admin-media.spec.ts` (1, desktop), `home.spec.ts` (2), `loop.spec.ts` (3) and `map.spec.ts` (2), all desktop. None is in a 4.2 area. The web server log of that run shows local database protocol errors at those moments (PostgreSQL code `08P01` "bind message supplies 3 parameters, but prepared statement requires 0", Prisma `P2039`, a 500 from `/api/auth/verify-email`); the rerun log has none.

Per project (first run; "ok" counts):

| Project | Tests | offline.spec | shell.spec | pwa.spec | auth.spec | admin-media.spec | demo-video.spec |
|---|---:|---:|---:|---:|---:|---:|---:|
| mobile-360 | 67 (67 ok) | 5/5 | 22/22 | 11/11 | 7/7 | 2/2 | not run (config) |
| tablet-768 | 67 (66 ok, 1 on rerun) | 5/5 | 22/22 | 11/11 | 7/7 | 2/2 | not run (config) |
| desktop-1280 | 76 (68 ok, 8 on rerun) | 5/5 | 22/22 | 11/11 | 7/7 | 3/3 (1 on rerun) | 8/8 |

Confirmation: every pre-existing `offline.spec.ts` case (5 × 3) and `shell.spec.ts` case (22 × 3) passed in the first run, with both files unchanged. `auth.spec.ts` (unchanged) passed 7 × 3, including the reset-password case that the `role="status"` fix addresses. `pwa.spec.ts` passed 11 × 3.

Before the merge (on `cb4b5df`'s content): `e2e/pwa.spec.ts` alone passed 33/33. Two earlier full runs on the pre-merge tree were not valid evidence (default workers with PGlite `P2028` errors plus the then-unfixed `auth.spec.ts` failure; the second was interrupted) and are not counted.

## Production previews gate (M2)

Command: `npm run test:previews-gate` on the post-merge production build (HEAD `6a028f5`) → exit 0. Same four lines as before the merge:

```text
PASS A (Vercel shape) [APP_ENV=production, BETTER_AUTH_URL=https://woffiz.example]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS B (APP_ENV=local, public URL) [APP_ENV=local, BETTER_AUTH_URL=https://woffiz.example]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS C (APP_ENV=preview, localhost) [APP_ENV=preview, BETTER_AUTH_URL=http://localhost:3101]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS D (positive control: this machine) [APP_ENV=local, BETTER_AUTH_URL=http://localhost:3101]: state=error: 307 → /, preview shown; state=empty: 307 → /, preview shown
```

Adjustment (allowed by M2): the first run failed case D because it expected status 200. Every unauthenticated request to a `(main)` page gets the layout's `redirect('/')` (307), but Next.js renders the page in parallel and its payload is in the same response body. So the preview text in the body is the signal, and the status is recorded only. With the gate open (D) the text is present; with it closed (A-C) it is absent, so the check tells the cases apart. All gate variables are set explicitly per case, so `.env` cannot reopen the gate.

## Update-flow evidence (M8)

**Spike (required first step): FAILED.** Steps, Chromium headless shell 1248 via Playwright 1.64.1, local production build:
1. `context.route('**/sw.js', …)` returning the original body with a different `// sw-version:` line, then `registration.update()` → the route handler was called **0 times**; `registration.waiting` stayed `null`.
2. Extra attempt (time-boxed): a browser-level CDP session with `Fetch.enable({ patterns: [{ urlPattern: '*/sw.js', requestStage: 'Response' }] })` → **0** paused requests; no waiting worker. The browser fetches the worker script for an update check on the service worker's own target, which Playwright neither routes nor exposes as a CDP session (Playwright documents that interception does not cover service-worker traffic, issue #1090).

**Fallback applied (arch):** the controller is covered by the M4 unit tests; `e2e/pwa.spec.ts` keeps "no update banner after a first install"; a manual check with two real builds was performed (below).

**Additional automated coverage (test-only trigger, clearly labeled in the spec):** the browser treats a changed worker **script URL** like a new version, so the test registers the same `public/sw.js` as `/sw.js?e2e-update=1`. The new worker installs and, finding an active worker, waits, exactly like after a `sw-version` bump. That exercises the real worker, the real controller and the real banner. Covered in all three projects: banner appears; focus unchanged; axe/RTL/overflow healthy with the banner; no intersection with the bottom nav; 48 px buttons; `transition-duration 0s`, `animation-name none`; "אחר כך" hides it with no reload and the worker still waiting; reload offers it again; "לעדכן עכשיו" → exactly one document request within 3 s, page really reloaded (window marker gone), `registration.waiting` null, no banner; offline fallback still appears under the new worker; reduced motion (`animation-name none`, transition ≤ 0.01 ms from the global reduced-motion rule). On the exercise screen: the banner does not intersect the "תרגלנו" button, the page is axe-healthy, and with the report sheet open the point at the banner's center belongs to the dialog (modal top layer above `z-index` 30).
- Note: counting `framenavigated` events was not usable (Next.js calls `history.replaceState` on hydration, which Playwright also reports), so document requests are counted instead.

**Manual two-build check of the real trigger (performed 2026-11-11, local, 360×780, Chromium via a local Playwright script outside the repository, test database only):**
1. Started the production build with `sw-version: 4.2.0` on port 3102 (local-machine env as in `playwright.config.ts`), signed in a fresh owner through the local outbox, opened `/home`, waited for control → **no banner**.
2. Stopped the server, changed only the `sw-version` line to `4.2.1-manual`, ran `next build`, started the server → `/sw.js` served `4.2.1-manual`.
3. Reloaded `/home` in the same browser → **banner shown**, `registration.waiting` present (screenshot `banner-home-360.png`).
4. "אחר כך" → banner hidden, same page (window marker kept). Reload → banner again.
5. "לעדכן עכשיו" → **exactly 1 document request**, page reloaded, `registration.waiting` null, no banner.
6. Offline + reload → "אין חיבור לאינטרנט" fallback shown.
7. `public/sw.js` restored to `4.2.0` and the original build rebuilt (`git diff` of `public/sw.js` unchanged afterwards).

Raw result: `{"build1Version":"4.2.0","build1BannerShown":false,"build2Version":"4.2.1-manual","build2BannerShown":true,"waitingBeforeTap":true,"afterLater":{"bannerShown":false,"samePage":true},"afterUpdate":{"documentRequests":1,"reloaded":true,"waiting":false,"bannerShown":false},"offlineFallback":true}`

## Functional Testability Evidence

| Field | Value |
|---|---|
| Method | End-to-end flow (Playwright + manual two-build check), page screenshots, CLI |
| Steps | Local production build → `/puppy#install` per browser case → new worker version → banner → "לעדכן עכשיו" → one reload under the new worker → offline → fallback; `npm run test:previews-gate` |
| Expected Result | Correct install case per environment; banner only for a waiting worker, acts only on the tap, one reload; previews off in A-C, on locally |
| Actual Result | PASS |
| Notes | Screenshots at 360 px (local, not committed; shared with the owner in the session): `install-other-360.png`, `install-prompt-360.png`, `install-ios-360.png`, `install-installed-360.png`, `banner-home-360.png` (banner above the bottom nav). |

## Accessibility / RTL
- axe (serious/critical) clean via `expectHealthyPage` on `/puppy` (other, prompt, iOS, reduced motion), on `/home` with the banner, and on the exercise screen with the banner, in all three projects. `html lang="he" dir="rtl"`; no horizontal overflow at 360/768/1280.
- Keyboard: Tab reaches "התקנה" with the 3 px focus outline (asserted). The banner never moves focus (asserted); it comes after the page content in DOM order, so Tab reaches it after the page's own controls.
- Reduced motion: no animation on the card or banner; the banner has no transition of its own.
- Hebrew copy as specified by the Manager; iOS labels remain PENDING the real-device check.

## Documentation Update Evidence

| Field | Value |
|---|---|
| Documentation Updated | YES |
| Files Updated | DESIGN_SYSTEM.md (§8 new "Install guidance and app update" after "Puppy and settings"; §9 two lines after "Do not rely on tooltips…"; §14 rows "Install guidance" and "App update" after "Entire app offline"); docs/DECISIONS.md (`P4-2` row right after `P4-1`); README.md (new "Installation and updates (Phase 4, slice 2)" section right before "## Checks") |
| Reason if Not Required | — |

All three are insertions only (`git diff` shows no removed lines). Not touched: the §9 "Video" line, the §14 "Video" row, DECISIONS rows 9 and P4-1, the provider table, the area before the Phase 4 section, the README end and the `## Checks` block.

## Real-device and deployed-build checklist (owner) — all PENDING

iPhone Safari (current iOS), real iPhone:
1. PENDING — the `/puppy` card shows the iOS steps, and the Share-sheet labels match the Hebrew copy.
2. PENDING — Add to Home Screen works; icon and name are right (`apple-touch-180`, "Woffiz").
3. PENDING — launching from the home screen opens standalone at `/home` with the correct status bar and safe areas.
4. PENDING — in standalone the `/puppy` card says "already installed".
5. PENDING — the offline fallback appears in standalone with airplane mode on, and "ניסיון חוזר" recovers.
6. PENDING — after a new worker is deployed, reopening the installed app shows the update prompt; "לעדכן עכשיו" reloads once and "אחר כך" keeps working.
7. PENDING — VoiceOver reads the banner and the install steps in Hebrew in the right order.
8. PENDING — Reduce Motion on gives no transitions.

Android Chrome: PENDING — the native install button appears and installs; the installed app is standalone; the update prompt works.
Desktop Chrome/Edge: PENDING — the install button works. Desktop Firefox and Safari: PENDING — honest instructions or the not-supported message.
Deployed build (after an owner-approved deployment only): PENDING — HTTPS, a valid manifest (DevTools Application panel), icons, and `?state=` ignored on the production URL.

## CI on standard PostgreSQL (merge condition C1; manager revision 3)

PR: https://github.com/ohad340/Woffiz/pull/5 (draft, `feature/phase-4-install-update` → `main`).

**Before the runner pin, head `f24da02` (`ubuntu-latest` = Ubuntu 26.04):** runs `43054638786` (push) and `43054685522` (pull_request) failed in job "Integration and e2e on standard PostgreSQL" at `npx playwright install --with-deps chromium`: apt could not resolve `azure.archive.ubuntu.com`, `archive.ubuntu.com` and `security.ubuntu.com` ("Temporary failure resolving"), so "End-to-end tests" was skipped. Integration tests and `assert-required-tests` passed in both. A second attempt of `43054685522` failed at the same step.

**Runner pin, commit `0ce5973`** (only `.github/workflows/ci.yml` and `README.md`): the `postgres` job runs on `ubuntu-24.04` with a one-line comment; the `quality` job stays on `ubuntu-latest`. No test, assertion or step changed; no `continue-on-error`, retry or skip. Checked first: the Playwright documentation (System requirements) lists Ubuntu 22.04 / 24.04 / 26.04 on x86-64 and arm64, and the installed `playwright-core` 1.64.1 contains the `ubuntu24.04-x64` platform.

**Result on head `0ce5973`: both runs green, each in a single attempt (attempt 1).**

| Step | Run `43063382772` (push) | Run `43063386873` (pull_request) |
|---|---|---|
| Job "Typecheck, lint, unit tests, build" | success (job `130671692952`) | success (job `130671708560`) |
| Job "Integration and e2e on standard PostgreSQL" | success (job `130671692378`) | success (job `130671709024`) |
| Runner image of that job | `ubuntu-24.04` | `ubuntu-24.04` (version 20261101.360.1) |
| Integration tests (includes concurrency / row locking) | success: 179 passed, 1 skipped (180) | success: 179 passed, 1 skipped (`ai-live.test.ts`) (180) |
| Require the PostgreSQL-only tests to have executed and passed | success | success: "All 26 required PostgreSQL tests executed and passed (180 tests in the report)." |
| `npx playwright install --with-deps chromium` | success | success |
| End-to-end tests | success: 210 passed (4.0 min), 2 workers | success: 210 passed (3.8 min), 2 workers |

No e2e test failed or was retried in either run, which is the single clean run on standard PostgreSQL that the local PGlite runs could not give.

## Known Issues / Limitations
- Playwright cannot serve a changed `sw.js` body to the browser's worker update check (spike above). The automated flow uses a script-URL trigger; the real `sw-version` trigger was verified manually with two builds.
- Local PGlite is unstable under load: it dropped connections during the integration suite and produced protocol errors during e2e even with `--workers=2`. Every affected test passed on a rerun after restarting the test database. A fully clean single run needs standard PostgreSQL (CI).
- The integration suite prints nothing for about 9 minutes on PGlite; it is slow, not hung.
- `npm run check` in this working copy fails at lint on untracked files (`.claude/worktrees/` leftover, `pilot/` scripts); it is green on a clean checkout.
- The update banner deviates from M5's wrapper markup (`role="status"` on the visible banner only); see "Implementation Summary".
- `preventDefault()` on `beforeinstallprompt` hides Chromium's own mini-infobar; installation runs through the `/puppy` button or the browser menu (recorded in `P4-2`).
- iOS wording is proposed until the real-iPhone check.

## Scope Compliance
- Only slice 4.2 was implemented. No change to progression, mastery, plans, generation, media, ownership, server APIs, database, environment variables or dependencies beyond what the merge brings from `main`. `MEDIA_REQUIRED` stays off (unset), video production stays paused, and no technique or media state was changed. No `localStorage`/`sessionStorage`/new cache. The offline fallback is unchanged (`woffiz-offline-v1` still holds only `/offline.html`, asserted by the unchanged `offline.spec.ts`).
- Not edited by 4.2: `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons, `src/app/layout.tsx`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`, `e2e/auth.spec.ts`, `eslint.config.mjs`.
- `src/components/exercise/ExerciseScreen.tsx`: the marker only, as revision 2 allows.
- Nothing was pushed, deployed or merged to `main`.
- Not committed: `.claude/launch.json`, `pilot/`, `scripts/*illustrated-preview*.mjs`, `.claude/rules/`, `.claude/skills/`, `.media-local/`, `e2e/.media/`.

## Developer Declaration
I, Sarah (SW Developer), declare that slice 4.2 of PHASE=4 was implemented within the approved scope (manager revision 2), with one markup deviation flagged for Manager acknowledgement, and that `origin/main` `505e2db` was merged per M0b. `npm run check`, the integration suite, the e2e suite and the previews-gate check were run after the merge with the results recorded above: all pass, and the local-database reruns are reported as reruns. The branch is ready for Manager review; it has not been pushed.
