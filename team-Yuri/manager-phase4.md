# Manager Phase 4

## Phase Identifier
PHASE=4

## Status
STATUS: APPROVED

Scope of this revision: **slice 4.2 only** (install guidance, owner-activated update, production gate for `?state=` previews). Slices 4.3-4.8 are not designed here.

Revision 2 (2026-11-11): Phase 3 (PR #3) is merged and deployed on `main` at `505e2db` with green CI. By owner instruction, the 4.2 branch merges `origin/main` at a safe checkpoint (new milestone M0b), keeping all 4.2 work. This applies D1's rule that whichever branch merges second aligns with `main`. The base, the PR #3 overlap section, acceptance criteria 1, 3, 10 and 11, the evidence list and the risks are updated. The exercise practice-bar marker found during implementation is now part of the design (M5).

## Phase Goal
An owner can (1) find clear, honest, browser-appropriate Hebrew instructions for installing Woffiz on `/puppy`, (2) activate an available app update only by their own tap, with exactly one reload, and (3) never reach the `?state=` demo views in production. Previews stay available under `next dev`, unit tests and the local Playwright production build. The P4-1 offline fallback keeps working unchanged.

## Source References
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

## Architecture Summary
- D1: branch from `origin/main` `d8add95`; PR #3 is neither assumed merged nor used. PR #3 has since merged first, so under D1 the 4.2 branch is the one that aligns with `main` (M0b: merge `505e2db`, keeping both sides of the documentation overlaps).
- D2/D3: `devPreviewsEnabled(env)` in `src/server/local-mode.ts` (development, test, or `isLocalMachine`). `parseDevState(value, enabled)` is the single choke point. In production `?state=` is silently ignored.
- D4/D6: a new worker that finds an active worker **waits**. It is activated only by the page message `{ type: 'SKIP_WAITING' }` sent after the owner taps. The page reloads exactly once after a requested `controllerchange`. First install activates immediately. Rollback workers call `skipWaiting()` themselves.
- D5: "update" means a new worker version. A deployment bumps the worker file. While the app is visible the client calls `registration.update()` at most once per hour.
- D7: offline fallback unchanged (`woffiz-offline-v1`, `/offline.html` only, network-first navigations, errors pass through). `public/offline.html` and `next.config.ts` are not touched.
- D8/D9: four install cases (installed, native prompt, iOS, other), detected on the client by a pure module. The card lives on `/puppy` only, anchored at `#install`. `/home` is unchanged, and there is no dismissal state.
- D10: global non-modal update banner (`role="status"`, polite, no focus steal), with "לעדכן עכשיו" (primary) and "אחר כך" (ghost).
- D11: no server API, database, environment variable or dependency changes.

## Ordered Milestones

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

## Detailed Development Plan

### M0. Branch and baseline
Done before revision 2 (the branch exists on `d8add95`). Kept for the record; the current alignment step is M0b.
1. `git fetch origin`, then confirm `git rev-parse --short origin/main` prints `d8add95`. If it differs, **stop and ask the owner** (D1 names this base explicitly). The local `main` is stale (`379315a`), so do not branch from it.
2. `git switch -c feature/phase-4-install-update d8add95`.
3. The working tree carries changes that belong to other work: modified `.claude/launch.json`, untracked `pilot/…`, `scripts/*illustrated-preview*.mjs`, `.claude/rules/`, `.claude/skills/`, `team-Yuri/`. **None of them goes into 4.2 commits.** Commit only the files listed in this design (plus `dev-phase4.md` if the owner wants Team Yuri artifacts committed; ask at commit time).
4. `npm ci` (or `npm install` if the lockfile requires it), then `npm run check`. Record the result as the baseline.

### M0b. Merge `main` 505e2db (revision 2)
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

### M1. Previews gate (D2, D3)
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

### M2. Production gate check (arch "Production previews")
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

### M3. Service worker update model (D4, D6, D7)
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

### M4. Update controller (D4, D5)
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

### M5. Update banner (D10)
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

### M6. Install detection (D8)
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

### M7. Install card on `/puppy` (D8, D9)
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

### M8. E2E `e2e/pwa.spec.ts`
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

### M9. Documentation (arch "Expected files"; PR #3 overlap rules)
- **DESIGN_SYSTEM.md**
  - §8: new subsection `### Install guidance and app update`, appended after `### Puppy and settings` (end of §8). It covers the four install cases and their copy, the `/puppy` placement and `#install` anchor, no home hint and no dismissal, the honest "some browsers don't support installation" rule, and the banner copy and behavior (owner-activated, one reload, "אחר כך" until the next page load, non-modal, no focus steal).
  - §9: one line for the update banner and one for the install card, placed **after** "Do not rely on tooltips for essential mobile instructions." Do **not** touch the "Video" line (PR #3 rewrites it).
  - §14: two rows, "Install guidance" and "App update", appended right after the "Entire app offline" row and before the "Offline page:" paragraph. Do **not** touch the "Video" row.
- **docs/DECISIONS.md**: a new `P4-2` row directly after `P4-1` in "Phase 4 — PWA quality". It records D2-D10 and states that it supersedes the "remove or gate" note of decision 9 and the auto-activation (`skipWaiting` at install) part of P4-1, with the rollback rule from D6. Rows 9 and P4-1 are **not** edited. The provider table and the area where PR #3 adds rows 58-89 are **not** touched (the provider-table correction is deferred per arch).
- **README.md**: new self-contained section `## Installation and updates (Phase 4, slice 2)` placed immediately **before** `## Checks`. It covers where the install card is; how a deployment triggers the prompt (bump `// sw-version:` in `public/sw.js`); that the owner taps to update and the page reloads once; the hourly check while visible; the one-time prompt for existing installs on the first 4.2 deployment; the rollback worker calling `skipWaiting()` itself; the previews rule (development, tests and local machine only); and `npm run test:previews-gate`. Nothing is appended at the end of the file (PR #3 appends its media sections there), and the `## Checks` block is not edited.
- `.env.example`, `playwright.config.ts`, `next.config.ts`, `public/offline.html`, `src/app/manifest.ts`, icons: **not modified**.

### Documentation overlap with draft PR #3 (re-verified 2026-11-11)
PR #3 head `3ddd5ba`, merge-base `d8add95`, 101 files. No 4.2 code file is changed by PR #3 (checked: `sw.js`, `ServiceWorkerRegistration`, `devState`, `local-mode`, the three preview pages, `puppy/page.tsx`, `layout.tsx`, `e2e/offline|shell`, `lib/pwa`, `components/pwa`, `next.config.ts`). PR #3 still reads `parseDevState` in the same three pages, so after either merge the gated signature applies to them unchanged.

| File | PR #3 hunks | 4.2 region | Resolution when merging second |
|---|---|---|---|
| `DESIGN_SYSTEM.md` | §9 "Video" line (line 157); §14 "Video" row (line 216) | new §8 subsection; §9 line after "Do not rely on tooltips…"; §14 rows after "Entire app offline" | Keep both sides |
| `docs/DECISIONS.md` | +52 lines before the Phase 4 section (rows 58-89); provider table (line 113) | `P4-2` row after `P4-1` | Keep both sides; provider table untouched by 4.2 |
| `README.md` | +23 lines appended after "## Layout" (end of file) | new section before "## Checks" | Separate regions; keep both |
| `playwright.config.ts`, `.env.example` | changed | not edited by 4.2 | No overlap if 4.2 complies |

Whichever PR merges second rebases onto `main` and resolves these three documentation files by keeping both changes. 4.2 performs no merge or rebase onto PR #3.

**Revision 2 status:** PR #3 merged first (`505e2db`), so 4.2 is the branch that aligns. The owner chose a merge of `origin/main` (M0b) rather than a rebase. The table above stays the rule for the documentation conflicts; M0b adds `package.json` and `ExerciseScreen.tsx`. The DECISIONS provider-table correction is no longer blocked by PR #3, but it stays out of 4.2 scope (arch "Out of Scope") until the Architect assigns it.

## Acceptance / Gating Criteria
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

## Functional Testability Criteria

- Page/screen the user can open: `/puppy` (card "התקנה במסך הבית", `#install`); any page (update banner).
- User-visible behavior: browser-appropriate Hebrew install guidance or "כבר מותקנת"; a non-blocking "גרסה חדשה" banner that acts only on the owner's tap; production ignores `?state=`.
- Command-line flow: `npm run check`; `npm run test:e2e`; `npm run build && npm run test:previews-gate`.
- API endpoint / request: none (no new API). The gate is observable as `GET /map?state=error` on the production-mode server (M2).
- Minimal end-to-end flow: local production build → `/puppy` shows guidance → a changed `sw-version` is served → the banner appears → "לעדכן עכשיו" → one reload under the new worker → offline → the fallback still appears.
- Expected observable result: as above; previews visible on the local machine and invisible in cases A-C.

## Required Developer Evidence
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

## Out of Scope
- Slices 4.3-4.8: asset caching, account deletion, pilot allowlist, metrics and alerts, drills and measurements, device matrix and usability.
- Push, background or periodic sync, manifest screenshots or shortcuts, a custom iOS install UI beyond instructions, build-version polling, a home-screen install hint, dismissal persistence.
- Any change to `public/offline.html`, `src/app/manifest.ts`, icons, `next.config.ts`, `playwright.config.ts`, `.env.example`, CI workflow (except the runner pin approved in revision 3), server APIs, database schema or environment variables.
- The DECISIONS provider-table correction (deferred until PR #3 merges).
- Deployment, merge to `main`, production changes or real-device runs (the owner does these after approval). The M0b merge of `main` into the 4.2 branch is in scope.
- Video production, media ingest or publication, technique status changes and the `MEDIA_REQUIRED` switch.

## Risks / Open Questions

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

## Manager Review
MANAGER_REVIEW_STATUS: APPROVED

### Review Notes
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
- C1. Before merging to `main`, the PR's CI must be green on standard PostgreSQL in a single run: the CI job "Integration and e2e on standard PostgreSQL", including `assert-required-tests` for the 29 PostgreSQL-only tests, and the e2e job. A failure there reopens this review.
- C2. Commit `05b9dc9` commits the Team Yuri artifacts (`PHASE.md`, `plan.md`, `arch-phase4.md`, `manager-phase4.md`, `dev-phase4.md`). M0 left that to the owner, and `dev-phase4.md` records no decision. The owner decides whether that commit stays in the PR. This manager document has changed since `05b9dc9` (this review), so if the commit stays, it needs updating. **Resolved 2026-11-11: the owner decided to keep the artifacts in the PR. This reviewed manager document is committed on top as its own commit.**
- C3. Real-device and deployed-build items stay PENDING. They block the pilot release (4.8), not this merge.

### Required Corrections
None.

### Scope amendment (revision 3, 2026-11-11): CI runner pin for PR #5
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
