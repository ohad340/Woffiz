# Developer Phase 4

## Phase Identifier
PHASE=4

Slice: **4.3** (public shell asset caching). Manager design: revision 1 (`STATUS: READY_FOR_DEVELOPER`), from the Architect contract S1-S10. Owner decision of 2026-11-12: `/art/*` stays outside the cache.
- Branch: `feature/phase-4-shell-cache`, created from `origin/main` `7bc45f8` (verified before branching and again at the end; `main` had not moved).
- Worktree: `C:\Users\אוהד\Documents\Woffiz-4.3`, a sibling of the shared folder and outside the repository tree.
- `git merge-base HEAD origin/main` → `7bc45f809c647727bd011e447a5dbc56f057bd3d`.
- Commits: `88ca1fc` Team Yuri artifacts (first commit, byte-identical copies, checked with `cmp`), `4247a95` service worker and unit tests, `0f93789` e2e, `522f1a7` README and `P4-3`, then the commit of this file.
- **Shared folder:** its branch (`feature/phase-4-install-update`) and `node_modules` were not touched, and `git status` there is unchanged (the owner's uncommitted `.claude/launch.json` and the two Team Yuri documents). Only read commands and `git fetch origin` ran there. The `.env` was copied into the worktree (ignored by git, never committed). The branch's upstream was cleared (`git branch --unset-upstream`), because `git worktree add … origin/main` had set it to `origin/main`, and a stray `git push` must not be able to target `main`.
- The local test database (`woffiz-test`, `localhost:51218`) is a resource shared with other sessions. I restarted that local server several times (see E2E).

## Status
STATUS: COMPLETE (local; nothing pushed, no PR, nothing merged or deployed, awaiting the owner)

## Source References
- `team-Yuri/arch-phase4.md` (slice 4.3 contract S1-S10) and `team-Yuri/manager-phase4.md` (revision 1: M0-M6, "Verified platform semantics").
- `.claude/rules/20-testing.md`, `30-docs.md`, `40-project-structure.md`; `PRD.md` §8 and §10; `docs/DECISIONS.md` P4-1, P4-2.
- Platform semantics used, as verified by the Manager from MDN and the W3C Service Workers and Batch Cache Operations specifications: `Cache.put` overwrites and appends, `Cache.keys()` is insertion order, `respondWith` must be called during dispatch (so the allowlist is synchronous and a rejected request returns without `respondWith`), `waitUntil` for the background writes, and a same-origin response is `basic` even for a CORS-mode request (the predicate rejects only `navigate`). I relied on nothing weaker.

## Implementation Summary
- **M0** Worktree and baseline. `npm ci` (553 packages, exit 0), `node_modules/.bin/prisma --version` → prisma 7.10.1, `@prisma/client` 7.10.1; `node_modules/.bin/prisma generate` → "Generated Prisma Client (7.10.1)". Baseline on the untouched base: `npm run check` exit 0 (18 files, 216 tests); `npm run test:e2e -- e2e/offline.spec.ts e2e/pwa.spec.ts --workers=2` → 48 passed.
- **M1** S7 cap, see "S7 measurement": N = 67, cap stays 160.
- **M2** `public/sw.js` (S2-S9): one dependency-free file. `SW_VERSION = '4.3.0'` (replaces the `// sw-version:` marker), `OFFLINE_CACHE = 'woffiz-offline-v1'`, `SHELL_CACHE = 'woffiz-shell-' + SW_VERSION`, `SHELL_CACHE_MAX_ENTRIES = 160` with its derivation in a comment. `isShellRequest` (synchronous, pure): GET, same origin, not a navigation, no `Range` or `RSC` header (case-insensitive), no `_rsc` parameter, and a pathname that starts with `/_next/static/` (any query) or is exactly one of the four icons with `request.url === origin + pathname` (so no query string at all, not even a bare `?`). `isStorable`: `ok`, status 200, type `basic`, not redirected, no `no-store` or `private`. Cache key = the request URL string. `/_next/static/*` is cache first (a hit makes no network request; a miss fetches, hands "put a clone, then trim" to `waitUntil` and returns the original; a rejected fetch stays rejected). Icons are stale-while-revalidate (the refresh and its errors go to `waitUntil`). Every cache operation is inside `try`/`catch`. A request off the allowlist returns from the handler without `respondWith`. `activate` deletes every `woffiz-*` cache except the offline and the current shell cache, then `clients.claim()`. `install` (precaches only `/offline.html`, no `skipWaiting`), the navigation branch and the `message` handler are behaviorally unchanged; the only `skipWaiting()` call stays in the `SKIP_WAITING` handler. The header comment describes 4.3 and the rollback worker. Trim after each successful put: `cache.keys()` oldest first, delete from the front until the count is at most the cap; it never runs on the offline cache.
- **M3** `src/lib/sw.test.ts`: the real `public/sw.js` run in `node:vm` with an in-memory `caches` that follows the specified put/keys semantics. No export, hook or conditional code was added to `sw.js`.
- **M4** E2E: the cache-content test in `offline.spec.ts` redefined; two new cases in `pwa.spec.ts`; one new test in `demo-video.spec.ts`.
- **M5** README "Installation and updates" and `docs/DECISIONS.md` `P4-3`.
- **M6** This file.

**Interpretations flagged for the Architect's final review (none changes S1-S10):**
1. Unit test location `src/lib/sw.test.ts` and the `node:vm` harness (Manager decisions).
2. Icons are admitted only with an empty query string (Manager decision, stricter than S2).
3. The media-variant e2e lives in `demo-video.spec.ts` (Manager decision); I found no need to move it.
4. "Caches nothing until the tap" is proved at unit level (the install handler only adds `/offline.html`) and in e2e by the stale `woffiz-shell-0.0.0` cache surviving while the new worker waits, as the Manager's M4.4 reading allows.
5. The redefined test in `offline.spec.ts` has a new title, "only the public offline page and public build assets are ever cached", because the old title would now be false; no other case in that file changed, apart from adding `currentLevelId` to the import line.
6. One comment in `pwa.spec.ts` that said "sw-version bump" now says "SW_VERSION bump" (the marker no longer exists). No test logic changed.
7. The lookup uses `caches.match(url, { cacheName })`, which does not create a cache on a read.

## Implemented Milestones

| Milestone | Completed: Yes/No | Notes |
|---|---:|---|
| M0 Branch, worktree, baseline | Yes | Baseline green on `7bc45f8` |
| M1 Measure and fix the S7 cap | Yes | N = 67, cap 160 |
| M2 Service worker | Yes | `public/sw.js`, `SW_VERSION = '4.3.0'` |
| M3 Unit tests | Yes | 69 cases, negative check recorded |
| M4 E2E | Yes | 217 of 217 passed, 23 of them only on a rerun after a database restart |
| M5 Documentation | Yes | README and `P4-3`; `DESIGN_SYSTEM.md` unchanged |
| M6 Evidence | Yes | This file |

## Files Changed

`git diff --stat origin/main...HEAD` before the commit of this file; the full diff is `git diff origin/main...HEAD`.

```text
 README.md                   |  10 +-
 docs/DECISIONS.md           |   3 +-
 e2e/demo-video.spec.ts      |  46 +++++
 e2e/offline.spec.ts         |  44 +++--
 e2e/pwa.spec.ts             |  75 +++++++-
 public/sw.js                | 152 +++++++++++++---
 src/lib/sw.test.ts          | 420 ++++++++++++++++++++++++++++++++++++++++++++
 team-Yuri/arch-phase4.md    | 212 +++++++++++++++++++---
 team-Yuri/manager-phase4.md | 245 ++++++++++++++++++++++----
 9 files changed, 1118 insertions(+), 89 deletions(-)
```

Criterion 8 check: `git diff origin/main...HEAD --name-only` lists only the files above (plus this file). Verified absent: `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, `public/icons/*`, `public/art/*`, `src/app/layout.tsx`, `src/components/pwa/*`, `src/lib/pwa/*`, `playwright.config.ts`, `.env.example`, `vitest.config.ts`, `prisma/`, `package.json`, `package-lock.json`, everything under `src/server/` (a path-filtered `git diff` over all of them returns no file).

| File | Change Summary | Reason |
|---|---|---|
| `public/sw.js` | Shell cache, allowlist, storable rule, strategies, purge, cap, `SW_VERSION` | M2 / S2-S9 |
| `src/lib/sw.test.ts` | 69 cases over the real worker in `node:vm` | M3 |
| `e2e/offline.spec.ts` | The cache-content test redefined (+ import of `currentLevelId`) | M4.1 |
| `e2e/pwa.spec.ts` | Offline-behavior case, update/purge case, one comment | M4.3, M4.4 |
| `e2e/demo-video.spec.ts` | One media-variant test | M4.2 |
| `README.md`, `docs/DECISIONS.md` | "Installation and updates"; `P4-3` row, reference in `P4-2` | M5 |
| `team-Yuri/arch-phase4.md`, `manager-phase4.md` | Copied byte for byte, first commit | M0 |

## Dependencies Installed

| Dependency / Tool | Command Used | Reason |
|---|---|---|
| None added | `npm ci` → exit 0, 553 packages (existing lockfile) | Dependencies of the new worktree. `package.json` and `package-lock.json` are unchanged. |
| Prisma CLI (local, by path) | `node_modules/.bin/prisma --version`; `node_modules/.bin/prisma generate` | 7.10.1 / 7.10.1; client generated to `src/generated/prisma` |

Database: every database command used `TEST_DATABASE_URL` at host `localhost:51218` (printed and checked: it differs from `DATABASE_URL`). That covers the e2e runs (`prisma migrate deploy` ran with "No pending migrations"), the Cache Storage script, and the `prisma dev` stop/start of the local `woffiz-test` server. No Supabase connection, no `migrate reset`, no `db push`. `MEDIA_REQUIRED` is unset.

## S7 measurement (M1)
- Build: `npm run build` in the worktree on the 4.3 tree (`.next/BUILD_ID` `BgHbbVEQ9iWgJ_DnJcegb`).
- **N = 67 files, 1,229,393 bytes** under `.next/static`: `chunks/` 24 files (871,798 B), `media/` 40 files (357,200 B: 20 `.woff` and 20 `.woff2`) and a build-id folder with 3 manifests (395 B). Identical to the Manager's starting measurement.
- Layout: the 4.3 local build produces `/_next/static/chunks/…` and `/_next/static/media/…` (the served HTML references `/_next/static/chunks/*.js|css`). The `immutable/` layout the Manager saw on the deployed site is not produced locally. The predicate matches the prefix `/_next/static/`, and the unit tests cover both layouts.
- Icons: 4 files, 365,841 bytes.
- Rule: 2 × (67 + 4) = 142 ≤ 160, so **the cap stays 160**. Byte estimate: two full builds are 2 × 1,229,393 + 365,841 = 2,824,627 B (about 2.8 MB); at the cap about 365,841 + 156 × 18,349 ≈ 3,228,000 B (about 3.2 MB), raw file sizes. Recorded in the constant's comment and in `P4-3`.

## Unit Tests

| Field | Value |
|---|---|
| Command | `npm run test:unit` (inside `npm run check`) and `npx vitest run src/lib/sw.test.ts` |
| Result | PASS: 19 files, 285 tests (baseline 18 files, 216 tests; 69 new in `src/lib/sw.test.ts`) |
| Notes | The harness reads `public/sw.js` as text and runs it with `node:vm.runInNewContext` with `self`, an in-memory `caches` (`put` removes a match and appends; `keys()` in insertion order), a stubbed `fetch`, and Node's `Request`, `Response`, `Headers`, `URL` (`Response.type` set through `Object.defineProperty`; a `Request` subclass resolves relative URLs). |

Cases (all required cases of M3):
- Source: `SW_VERSION` is `4.3.0`, the cap is 160, exactly one `skipWaiting(` call in code (the header comment mentions it), no `sw-version:` marker.
- **S2 allowed (10):** a chunk; a stylesheet; a font requested with `mode: 'cors'`; the `immutable/` layout; a deployment query string; each of the four icons.
- **S2 rejected (25), each leaves `respondWith` uncalled, calls no `fetch`, and creates no cache:** `/home` and `/` fetched by a script; `/map?_rsc=…`; an `RSC` header and a lower-case `rsc` header on a static path; a `Range` request; a POST to a static path; `/api/auth/get-session`, `/api/attempts`, `/api/mastery`, `/api/media/playback`, `/api/media/local?token=…`, `/api/media/versions/<id>/captions`; `/_next/image?url=…`; `/_next/data/…`; `/art/map-painted.webp`; `/manifest.webmanifest`; `/sw.js`; `/offline.html`; `/icons/other.png`; an icon with `?v=2` and with a bare `?`; a path that only contains `/_next/static/` further down; a cross-origin signed storage URL; a cross-origin copy of a static path.
- **S3 (11):** stored: 200 basic, 200 immutable. Returned to the page but not stored: 206, 404, 500, opaque, redirected, cors-typed, `no-store`, `No-Store` (any case), `private`. In every case the page gets the network response object.
- **S4 (7):** a cached static asset returns without any `fetch`; a miss fetches once, stores and returns; a miss with a rejected `fetch` rejects (no synthetic response, nothing stored); an icon returns the cached copy first and the refresh updates the entry; a failed refresh keeps the cached copy and never throws; an uncached icon is fetched, stored and returned; a non-storable refresh (404) leaves the cached icon alone; a rejecting `cache.put` still returns the network response.
- **S5/S7 (3):** the shell cache is named `woffiz-shell-<SW_VERSION>` and is the only cache written; after `CAP + 10` writes the cache holds exactly the cap, the oldest 10 are gone and the offline cache is untouched; a refreshed icon moves to the newest position and survives the trim.
- **S6 (1):** `activate` keeps exactly `woffiz-offline-v1` and the current shell cache, deletes `woffiz-shell-4.2.0`, `woffiz-shell-0.0.0`, `woffiz-offline-v0` and `woffiz-`, leaves `unrelated-cache` and `workbox-precache`, and calls `clients.claim()` once.
- **S8 (10):** `install` adds only `/offline.html` to the offline cache, creates no shell cache and never calls `skipWaiting`; the `message` handler ignores another origin, another type, a string, `null` and no data, and calls `skipWaiting` once for a same-origin `SKIP_WAITING`; a navigation whose `fetch` rejects gets the cached offline page, or a network error without one; a navigation that gets HTTP 500 passes the 500 through; a successful navigation stores nothing; a non-GET navigation is left to the browser.
- **Negative check (recorded):** I temporarily changed the allowlist line to also admit `url.pathname.startsWith('/art/')`. The run failed: `× does not handle artwork (owner decision)` (1 failed, 68 passed). I restored the file (`cmp` identical) and the run was green again (69 passed).

## Lint

| Field | Value |
|---|---|
| Command | `npm run check` (typecheck, lint, unit tests, production build) in the worktree |
| Result | PASS, exit 0 |
| Notes | Typecheck and lint were clean on the first run of `sw.test.ts` and the e2e files (`npx tsc --noEmit`, `npx eslint e2e src/lib/sw.test.ts`, exit 0). The worktree is a clean checkout with its own `npm ci`, so the lint scope problem of the shared folder (untracked folders) does not exist. The build ran with the copied local `.env`; it contacts no database. |

## E2E

Command: `npm run test:e2e -- --workers=2` (the README's local PGlite setting), local production build, local test database only. **217 tests** at 360/768/1280 (210 before; +2 in `pwa.spec.ts` per project and +1 in `demo-video.spec.ts`).

| Run | Result |
|---|---|
| Full run, 15.3 min | **194 passed, 16 failed, 7 did not run** |
| `npm run test:e2e -- --last-failed --workers=1` after restarting the test database (3.9 min) | **23 passed** (the 16 failures and the 7 that did not run) |
| Combined | 217 of 217 passed; no test failed twice |

None of the 16 first-run failures is an assertion about 4.3. **13 failed in setup before the test body**: the `owner` fixture (`onboardViaApi` at `fixtures.ts:58` or `:60`, registration at `:46`, a verification link answering 500 at `:53`) or the demo seed script (`e2e/seed-demo.ts`, PostgreSQL code `08P01` "bind message supplies 3 parameters, but prepared statement requires 0"): `offline.spec.ts` redefined test (mobile, desktop), `pwa.spec.ts` "reduced motion: the card renders the same…" (mobile, desktop), `shell.spec.ts` (mobile 1, tablet 4, desktop 1), `home.spec.ts` (desktop 2), `demo-video.spec.ts` "the playable clip really decodes and plays…" (desktop). **3 failed inside the body of pre-existing tests that 4.3 does not touch**: `auth.spec.ts` "register, onboard, refresh, sign out and sign back in…" (tablet, desktop: no redirect to `/home`) and `ai-plan.spec.ts` "the exercise offers an adaptation…" (desktop: the adaptation notice never appeared). The server log of that run shows the local database errors `P2028` (10), `P2039` (4) and `08P01`, the same errors the 4.2 evidence recorded, but I did not prove that they caused those 3 body failures; what I can state is that all 23 passed on the rerun, whose log has none of those errors. The 7 tests that did not run are the rest of `demo-video.spec.ts`, which runs serially and stops after a failure.

First-run pass counts per project (all reruns reported as reruns): mobile-360 66 of 69 (3 failed), tablet-768 64 of 69 (5 failed), desktop-1280 64 of 79 (8 failed, 7 did not run).

The 4.3 tests:
- **Redefined privacy proof** (`offline.spec.ts`, "only the public offline page and public build assets are ever cached"): first run passed on tablet-768; on mobile-360 and desktop-1280 it failed in the `owner` fixture (database error, before any 4.3 assertion). All three passed on the rerun.
- **Offline behavior** (`pwa.spec.ts`, "offline: a cached build asset still loads from the worker, the API fails and a page shows the fallback"): passed in the first run in all three projects. A cached `/_next/static/` asset fetched with `cache: 'no-store'` offline returns 200, an uncached static path fails (no synthetic response), the session API fails, and a reload shows "אין חיבור לאינטרנט".
- **Update and purge** (`pwa.spec.ts`, "the 4.3 update path: a stale shell cache survives until the owner taps, then it is purged"): passed in the first run in all three projects. Seeded `woffiz-shell-0.0.0` survives while the new worker waits (banner shown, waiting `?e2e-update=1`, active `/sw.js`); after "לעדכן עכשיו" and the reload, the cache set is exactly `woffiz-offline-v1` and `woffiz-shell-4.3.0`.
- **Media variant** (`demo-video.spec.ts`, "media is never cached: after playing a clip, the caches hold only the offline page and build assets", desktop-1280): in the full run it did not run (serial file after a seed failure). It passed on the rerun and in an earlier targeted run of `demo-video.spec.ts` alone (`--workers=1`, after a database restart): 9 of 9 passed.
- Earlier targeted run (`offline`, `pwa`, `demo-video` specs, 63 tests): 53 passed, 2 failed with the same database errors, 8 did not run.

**Pre-existing cases:** every pre-existing case that failed in the first full run failed in fixture or seed setup and passed on the rerun; the other four `offline.spec.ts` cases passed in the first run in all three projects, and `auth.spec.ts`, `admin-media.spec.ts` and the remaining `pwa.spec.ts`, `shell.spec.ts`, `loop`, `map` cases passed unchanged. None of those files was edited except as listed under "Files Changed".

## Cache Storage contents (privacy proof, as text)

From a separate local script (outside the repository) that ran the same session as the redefined test against the local production build, with the test database only: sign-up through the local outbox, onboarding, `/home` under the worker, then `/map`, `/review`, `/puppy`, the current exercise, and `GET /api/auth/get-session` (status 200).

```text
woffiz-offline-v1: 1 entries
   /offline.html

woffiz-shell-4.3.0: 23 entries
   /_next/static/chunks  x15
   /_next/static/media  x8
```

Two cache names, nothing else: no page, API, RSC, image, artwork or media URL. The icons are not in the cache because no page of this session requested them.

## Functional Testability Evidence

| Field | Value |
|---|---|
| Method | End-to-end (Playwright) plus a one-off script printing Cache Storage |
| Steps | Sign in on the local production build → browse home, map, review, puppy and an exercise → inspect Cache Storage → go offline: a cached asset loads from the worker, an uncached one and the API fail, a page shows the offline fallback → publish a new worker: the banner appears, the stale cache survives until the tap, then it is purged |
| Expected Result | Only the offline page and allowlisted static assets are cached; offline behavior as above |
| Actual Result | PASS (see E2E; 23 of 217 only on a rerun after a database restart) |
| Notes | The new worker version is published in e2e by registering the same `public/sw.js` under a second URL (the 4.2 pattern), because Playwright cannot serve a changed worker body. |

## Documentation Update Evidence

| Field | Value |
|---|---|
| Documentation Updated | YES |
| Files Updated | `README.md` "Installation and updates" only: the "Publishing an update" bullet now names the `SW_VERSION` constant; new bullets for what the worker caches, what it never caches and why, cleanup of old caches, the "first 4.3 deployment" note, the dev-machine note (production worker on the same origin as `next dev`) and an honest "no performance claim"; the rollback bullet also names the shell cache. `docs/DECISIONS.md`: a new `P4-3` row after `P4-2` (allowlist, owner decision on `/art/*`, measured cap, `SW_VERSION`, supersession of "only `/offline.html` is ever cached" and of the `sw-version` marker), and the `P4-2` row only gained the reference "Slice 4.3 extends the worker … see P4-3." No other row changed. |
| Reason if Not Required | `DESIGN_SYSTEM.md` is unchanged: 4.3 has no UI change. |

## Real-device and deployed-build checklist (owner) — all PENDING
- iPhone, installed app after the 4.3 update: PENDING cold start works; PENDING the offline fallback still appears in airplane mode; PENDING website data for the site stays small (Settings, Safari, Advanced, Website Data).
- Android Chrome, installed app: PENDING the same three checks.
- Deployed build, after an owner-approved merge: PENDING DevTools Application, Cache Storage shows only `woffiz-offline-v1` and `woffiz-shell-4.3.0`, with allowlisted entries.
These are part of the 4.8 matrix and do not block this merge.

## Known Issues / Limitations
- The local PGlite test database is unstable under load: it caused 16 first-run e2e failures (and one earlier pair) in fixtures and seeding, all passing after a restart of the local database server. A fully clean single run needs standard PostgreSQL, which the CI job provides.
- The e2e update path registers the same worker under a second URL; the real trigger (a `SW_VERSION` bump) is the same mechanism the 4.2 manual two-build check verified. It was not re-run for 4.3.
- The icons enter the cache only when something requests them (installing the app, or `apple-touch-icon` use), not during ordinary browsing.
- 4.3 makes no performance claim; measurement belongs to slice 4.7.
- An existing 4.2 installation keeps the 4.2 worker (no new caching) until the owner taps "לעדכן עכשיו".

## Scope Compliance
- Only slice 4.3 was implemented: `public/sw.js`, its unit test, the e2e cases, README and `P4-3`. No change to `next.config.ts`, `public/offline.html`, the manifest, icons, artwork, layout, `src/components/pwa/*`, `src/lib/pwa/*`, `playwright.config.ts`, `.env.example`, `vitest.config.ts`, `prisma/`, `package.json`, `package-lock.json` or `src/server/`.
- `/art/*` is outside the cache (owner decision). No private data is cached: the caches are exactly the offline page and allowlisted public build assets.
- The offline fallback and the owner-activated update (banner, tap, one reload) are preserved and covered by the unchanged `offline.spec.ts` cases and the existing `pwa.spec.ts` update cases.
- `MEDIA_REQUIRED` stays off (unset), video production stays paused, techniques stay DRAFT, no media code changed, no media state changed.
- No production data or environment change, no paid resource, local test database only. **Nothing was pushed, no PR was opened, nothing was merged or deployed.** After the owner approves: push once, open the draft PR, and report CI on the final head.

## Developer Declaration
I, Sarah (SW Developer), declare that slice 4.3 of PHASE=4 was implemented within the approved scope (manager revision 1), with the interpretations listed above flagged for the Architect. `npm run check` passed in a clean worktree; the unit tests (285), the negative check and the e2e suite (217 of 217, 23 of them on a rerun after restarting the local database) are recorded above; the deployed-build and real-device items are PENDING for the owner. The branch is ready for Manager review and the owner's decision on the push. CI cannot be reported until the push is approved.

---

## Slice 4.2 record (closed)

### Phase Identifier
PHASE=4

Slice: **4.2** (install guidance, owner-activated update, production gate for `?state=` previews). Manager design: revision 2.
Branch: `feature/phase-4-install-update`. Original base `d8add95` (`origin/main` verified as `d8add95` before branching, 2026-11-11).
- Checkpoint commit (4.2 files only): `cb4b5df`.
- Merge commit (M0b): `d5218af`, parents `cb4b5df` + `505e2db`. `origin/main` verified as `505e2db` before merging. No rebase, no force push, nothing pushed.
- Follow-up commit after the merge: `6a028f5` (banner `role="status"` fix, see "Implementation Summary").
- `git merge-base HEAD origin/main` → `505e2db40d8df797a2e0167327caedcba891d17a`.

### Status
STATUS (slice 4.2): COMPLETE

### Source References
- `team-Yuri/PHASE.md` (`PHASE=4`), `team-Yuri/plan.md` (APPROVED, slice 4.2), `team-Yuri/arch-phase4.md` (D1-D11), `team-Yuri/manager-phase4.md` (READY_FOR_DEVELOPER, M0-M10).
- `.claude/rules/20-testing.md`, `30-docs.md`, `40-project-structure.md`; DESIGN_SYSTEM.md §5, §8, §9, §10, §11, §12, §14.
- Playwright 1.64.1 typings (`node_modules/playwright-core/types/types.d.ts`): request interception does not cover traffic handled by service workers (issue #1090).

### Implementation Summary
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

### Implemented Milestones

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

### Files Changed

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

### Dependencies Installed

| Dependency / Tool | Command Used | Reason |
|---|---|---|
| None added by 4.2 | `npm ci` after the merge → exit 0, 553 packages | `mp4-muxer` 5.2.2 (devDependency) arrives from `main`. 4.2 adds only the `test:previews-gate` script to `package.json`; `package-lock.json` is identical to `main`. |
| Prisma CLI (local, by path) | `node_modules/.bin/prisma --version`; `node_modules/.bin/prisma generate` | 7.10.1 / 7.10.1; client generated to `src/generated/prisma` |

### Baseline (M0, on `d8add95`, before the merge)
- `npm ci` → exit 0.
- First `npm run check` → typecheck failed only on stale generated files in `.next/types` and `.next/dev/types` left by the Phase 3 branch (routes such as `src/app/admin/media/...` that do not exist on `d8add95`). No `next` server was running; `.next` (build output, gitignored) was removed.
- Second `npm run check` → typecheck PASS; lint FAIL only on files git does not track: a leftover worktree folder `.claude/worktrees/phase-4-offline-recovery/` (166 files, its own `.next`) and the owner's untracked `pilot/mouthing-illustrated-preview/*.js`. `eslint.config.mjs` is not part of this slice and was not changed.
- Baseline per step: `npm run typecheck` PASS; `npx eslint . --ignore-pattern ".claude/**" --ignore-pattern "pilot/**"` PASS; `npm run test:unit` PASS (8 files, 74 tests); `npm run build` PASS.

### Unit Tests

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

### Lint

| Field | Value |
|---|---|
| Command | `npm run check` (typecheck, lint, unit tests, production build) |
| Result | PASS |
| Notes | See below |

- **Clean checkout of HEAD `6a028f5`** (detached worktree outside the repository folder, own `npm ci`, removed afterwards): `npm run check` → **exit 0** (typecheck PASS; lint 0 problems; 18 files / 216 tests; build "Compiled successfully"). The build needs `DATABASE_URL` to be set (`src/server/db.ts`); the clean checkout has no `.env`, so a local dummy value was passed (`postgres://build:build@localhost:1/build`; the build never connects). The first attempt without it failed at the build step with "DATABASE_URL is not set".
- **This working copy:** `npm run check` stops at lint because eslint also scans files git does not track: the leftover `.claude/worktrees/phase-4-offline-recovery/` folder (166 files, listed in `.git/info/exclude`) and five untracked `pilot/mouthing-illustrated-preview/*.js` scripts. Per step here: `npm run typecheck` PASS; `npx eslint . --ignore-pattern ".claude/**" --ignore-pattern "pilot/**"` PASS (0 problems); `npm run test:unit` PASS (216); `npm run build` PASS. Stale `.next` output from another session's dev server was removed first (no server was running).

### Integration Tests

| Field | Value |
|---|---|
| Command | `npm run test:integration` (local test database, `localhost:51218`, PGlite) |
| Result | PASS: 151 passed, 29 skipped, 0 failed (in two runs, see notes) |
| Notes | Skipped = the concurrency / row-locking tests that run only on standard PostgreSQL (`TEST_DB_KIND=postgres`, CI); they are reported as skipped, not passed |

- Full run: 15 files, 180 tests → 140 passed, 29 skipped, **11 failed** (540 s). All 11 are in the last two files (`onboarding.test.ts` 10, `data-api-lock.test.ts` 1), which failed within about 100 ms with "Server has closed the connection" / "Connection terminated unexpectedly": the local PGlite server dropped its connection.
- After restarting the test database: `npm run test:integration -- test/integration/onboarding.test.ts test/integration/data-api-lock.test.ts` → 2 files, **11 passed** (23 s).
- An earlier attempt was aborted by me (stopping the database while the suite was still running, because its 10-minute silence looked like a hang); it is not counted.

### E2E

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

### Production previews gate (M2)

Command: `npm run test:previews-gate` on the post-merge production build (HEAD `6a028f5`) → exit 0. Same four lines as before the merge:

```text
PASS A (Vercel shape) [APP_ENV=production, BETTER_AUTH_URL=https://woffiz.example]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS B (APP_ENV=local, public URL) [APP_ENV=local, BETTER_AUTH_URL=https://woffiz.example]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS C (APP_ENV=preview, localhost) [APP_ENV=preview, BETTER_AUTH_URL=http://localhost:3101]: state=error: 307 → /, preview absent; state=empty: 307 → /, preview absent
PASS D (positive control: this machine) [APP_ENV=local, BETTER_AUTH_URL=http://localhost:3101]: state=error: 307 → /, preview shown; state=empty: 307 → /, preview shown
```

Adjustment (allowed by M2): the first run failed case D because it expected status 200. Every unauthenticated request to a `(main)` page gets the layout's `redirect('/')` (307), but Next.js renders the page in parallel and its payload is in the same response body. So the preview text in the body is the signal, and the status is recorded only. With the gate open (D) the text is present; with it closed (A-C) it is absent, so the check tells the cases apart. All gate variables are set explicitly per case, so `.env` cannot reopen the gate.

### Update-flow evidence (M8)

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

### Functional Testability Evidence

| Field | Value |
|---|---|
| Method | End-to-end flow (Playwright + manual two-build check), page screenshots, CLI |
| Steps | Local production build → `/puppy#install` per browser case → new worker version → banner → "לעדכן עכשיו" → one reload under the new worker → offline → fallback; `npm run test:previews-gate` |
| Expected Result | Correct install case per environment; banner only for a waiting worker, acts only on the tap, one reload; previews off in A-C, on locally |
| Actual Result | PASS |
| Notes | Screenshots at 360 px (local, not committed; shared with the owner in the session): `install-other-360.png`, `install-prompt-360.png`, `install-ios-360.png`, `install-installed-360.png`, `banner-home-360.png` (banner above the bottom nav). |

### Accessibility / RTL
- axe (serious/critical) clean via `expectHealthyPage` on `/puppy` (other, prompt, iOS, reduced motion), on `/home` with the banner, and on the exercise screen with the banner, in all three projects. `html lang="he" dir="rtl"`; no horizontal overflow at 360/768/1280.
- Keyboard: Tab reaches "התקנה" with the 3 px focus outline (asserted). The banner never moves focus (asserted); it comes after the page content in DOM order, so Tab reaches it after the page's own controls.
- Reduced motion: no animation on the card or banner; the banner has no transition of its own.
- Hebrew copy as specified by the Manager; iOS labels remain PENDING the real-device check.

### Documentation Update Evidence

| Field | Value |
|---|---|
| Documentation Updated | YES |
| Files Updated | DESIGN_SYSTEM.md (§8 new "Install guidance and app update" after "Puppy and settings"; §9 two lines after "Do not rely on tooltips…"; §14 rows "Install guidance" and "App update" after "Entire app offline"); docs/DECISIONS.md (`P4-2` row right after `P4-1`); README.md (new "Installation and updates (Phase 4, slice 2)" section right before "## Checks") |
| Reason if Not Required | — |

All three are insertions only (`git diff` shows no removed lines). Not touched: the §9 "Video" line, the §14 "Video" row, DECISIONS rows 9 and P4-1, the provider table, the area before the Phase 4 section, the README end and the `## Checks` block.

### Real-device and deployed-build checklist (owner) — all PENDING

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

### CI on standard PostgreSQL (merge condition C1; manager revision 3)

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

### Media-generation test correction (manager revision 4, "C1 reopened")

Commit `f38ed53`, test-only: `test/integration/media-generation.test.ts` (+173/−4) and `scripts/required-pg-tests.json` (+2, the two new PostgreSQL-only titles). `git diff --stat f38ed53~1 f38ed53 -- src` is empty: no production code changed. No 4.2 file is involved.

**Diagnosis: confirmed as a test flaw, by construction; the original CI failure itself was not reproduced.**
- Free-form ordering, constructed: the new test "a generation that starts after the withdrawal committed saves a free-form plan with no binding" withdraws first and then generates. The generation succeeds, the job is `SUCCEEDED`, no exercise version is bound, and `finishedAt >= withdrawnAt`. That is exactly the state the old assertion (`finishedAt <= withdrawnAt` on any success) rejected. It passed in every run below.
- Bound ordering, forced: in the named test a technique-bound plan commits while the withdrawal is observed waiting, and the withdrawal completes afterwards. In no run did a bound plan commit after a withdrawal, and in no run did a withdrawal fail to wait. **No production defect was found.**
- Not shown: which ordering occurred in the failing CI run `43101057240`; its log does not contain the saved plan.

**Synchronization mechanism (test-only).** The test opens its own transaction and takes `LOCK TABLE "Plan" IN SHARE MODE`. Reads pass, but the generation commit's first plan `INSERT` waits. In `completeOnboarding` that `INSERT` comes after `recheckBoundTechniques`, so a commit that waits there already holds the technique row `FOR SHARE`. The lock is taken by the test on a test connection; `src/` has no hook and was not touched. No sleep orders anything: the only pause spaces the polls of `pg_stat_activity`.

What the named test does and observes in the database (`pg_stat_activity` with `pg_blocking_pids`):
1. Generation starts with the clip published. The test waits until a backend is waiting for a lock, blocked by the test's lock holder, with an `INSERT INTO "Plan"` query. It then checks the clip is still `PUBLISHED` and no plan exists.
2. Only then the withdrawal starts. The test waits until another backend is waiting on `"TechniqueVersionState" … FOR UPDATE`, blocked by the generation commit's backend. Neither promise has settled and the clip is still `PUBLISHED`.
3. The test releases its lock (in `finally`, so a failed expectation cannot leave anything locked).

Assertions after that: generation fulfilled (`created: true`) and settled before the withdrawal; job `SUCCEEDED`; exactly one bound exercise version with `techniqueKey`, `techniqueVersion`, `techniqueVariant`, slot `mediaId`, parameters and the catalog rendering; the media version `WITHDRAWN` with `withdrawnAt`, `withdrawnById`, reason and note; `finishedAt <= withdrawnAt`; the stored exercises identical before and after (history not rewritten).

The unsynchronized race is kept as its own test ("a withdrawal racing a generation leaves a refused candidate, a binding that predates it, or a free-form plan") and decides by what was saved: refused candidate (nothing stored, unit refunded), bound plan (timestamp order asserted), or free-form plan (no binding, no timestamp comparison). The two existing "generation commit waits for an in-flight withdrawal / suspension" tests are unchanged, and no existing title in `scripts/required-pg-tests.json` changed.

**Runs on standard PostgreSQL (not PGlite).** No standard PostgreSQL was installed on this machine, so with the owner's approval a throwaway PostgreSQL 17.11 server (`embedded-postgres` npm package, real PostgreSQL binaries) was started from the session scratchpad on `127.0.0.1:54329`, outside the repository, and stopped and deleted afterwards. Nothing was added to the project. `TEST_DB_KIND=postgres`; `DATABASE_POOL_MAX` unset as in CI.

| Run | Result |
|---|---|
| `npm run test:integration -- test/integration/media-generation.test.ts` | 14 passed (14) |
| The PostgreSQL-only group (`-t "media generation on standard PostgreSQL"`, 5 tests, including the named test), **25 consecutive runs** | 25 of 25 green; 125 test executions, 0 failures |
| Full `npm run test:integration` with the JSON reporter | 179 passed, 3 skipped (182); 13 files passed, 2 skipped |

- A first attempt failed for an environment reason, not a code one: the local `.env` sets `DATABASE_POOL_MAX="1"` for PGlite, and with one connection even the two unchanged race tests fail with `P2028`. With the variable unset, as in CI, everything passed.
- `node scripts/assert-required-tests.mjs` on that local report listed only the two `ci-guard.test.ts` cases as skipped; they run only when `CI=true`. Every other required title, including the two new ones, executed and passed. The authoritative check is CI.
- How often the unsynchronized race took each of its three branches was not measured.

**CI on head `afbb030` (the test correction plus its evidence): both runs green, each in a single attempt (attempt 1), job runner `ubuntu-24.04`.**

| Step | Run `43110046263` (push) | Run `43110054197` (pull_request) |
|---|---|---|
| Job "Typecheck, lint, unit tests, build" | success (job `130823347391`) | success (job `130823374355`) |
| Job "Integration and e2e on standard PostgreSQL" | success (job `130823346713`) | success (job `130823373973`) |
| Integration tests (includes concurrency / row locking) | success: 181 passed, 1 skipped (182); 14 files passed, 1 skipped | success: 181 passed, 1 skipped (182); 14 files passed, 1 skipped |
| Require the PostgreSQL-only tests to have executed and passed | success: "All 28 required PostgreSQL tests executed and passed (182 tests in the report)." | same line |
| `npx playwright install --with-deps chromium` | success | success |
| End-to-end tests | success: 210 passed (4.1 min), 2 workers | success: 210 passed (4.1 min), 2 workers |

The previous heads had 26 required tests and 180 tests in the report; the two new titles raise them to 28 and 182. The one skipped test is `ai-live.test.ts` (live model, skipped in CI by design). No test failed or was retried in either run, so the corrected test passed on standard PostgreSQL in CI too. The earlier failing run `43101057240` (head `9b5e973`) was not rerun.

This evidence is committed after `afbb030`; that commit changes only this file, so its own CI runs are expected to repeat the verdict and are checked separately.

### Known Issues / Limitations
- Playwright cannot serve a changed `sw.js` body to the browser's worker update check (spike above). The automated flow uses a script-URL trigger; the real `sw-version` trigger was verified manually with two builds.
- Local PGlite is unstable under load: it dropped connections during the integration suite and produced protocol errors during e2e even with `--workers=2`. Every affected test passed on a rerun after restarting the test database. A fully clean single run needs standard PostgreSQL (CI).
- The integration suite prints nothing for about 9 minutes on PGlite; it is slow, not hung.
- `npm run check` in this working copy fails at lint on untracked files (`.claude/worktrees/` leftover, `pilot/` scripts); it is green on a clean checkout.
- The update banner deviates from M5's wrapper markup (`role="status"` on the visible banner only); see "Implementation Summary".
- `preventDefault()` on `beforeinstallprompt` hides Chromium's own mini-infobar; installation runs through the `/puppy` button or the browser menu (recorded in `P4-2`).
- iOS wording is proposed until the real-iPhone check.

### Scope Compliance
- Only slice 4.2 was implemented. No change to progression, mastery, plans, generation, media, ownership, server APIs, database, environment variables or dependencies beyond what the merge brings from `main`. `MEDIA_REQUIRED` stays off (unset), video production stays paused, and no technique or media state was changed. No `localStorage`/`sessionStorage`/new cache. The offline fallback is unchanged (`woffiz-offline-v1` still holds only `/offline.html`, asserted by the unchanged `offline.spec.ts`).
- Not edited by 4.2: `playwright.config.ts`, `.env.example`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons, `src/app/layout.tsx`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`, `e2e/auth.spec.ts`, `eslint.config.mjs`.
- `src/components/exercise/ExerciseScreen.tsx`: the marker only, as revision 2 allows.
- Nothing was pushed, deployed or merged to `main`.
- Not committed: `.claude/launch.json`, `pilot/`, `scripts/*illustrated-preview*.mjs`, `.claude/rules/`, `.claude/skills/`, `.media-local/`, `e2e/.media/`.

### Developer Declaration
I, Sarah (SW Developer), declare that slice 4.2 of PHASE=4 was implemented within the approved scope (manager revision 2), with one markup deviation flagged for Manager acknowledgement, and that `origin/main` `505e2db` was merged per M0b. `npm run check`, the integration suite, the e2e suite and the previews-gate check were run after the merge with the results recorded above: all pass, and the local-database reruns are reported as reruns. The branch is ready for Manager review; it has not been pushed.
