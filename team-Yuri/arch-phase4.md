# Architecture Phase 4

## Phase Identifier
PHASE=4

## Status
STATUS: APPROVED

Slice 4.2 approved in final review on 2026-11-11 (see "Architect Review"). The next revision of this file designs slice 4.3 and resets this status to DRAFT.

## Phase Goal
Deliver the remaining ROADMAP Phase 4 work (PWA quality and private pilot) as the ordered slices 4.2-4.8 of `team-Yuri/plan.md`.

This revision details **slice 4.2 only**. Slices 4.3-4.8 keep the scope given in plan.md and get their own detailed contract in a later revision of this file, each before it starts.

**Slice 4.2 goal:** an owner can (1) find clear, honest, browser-appropriate instructions for installing Woffiz, (2) activate an available app update safely and only by their own action, and (3) never reach the `?state=` demo views in production. The views stay available in development and tests, and the live offline fallback (P4-1) keeps working unchanged.

## Source References
- `team-Yuri/plan.md` (APPROVED), slice 4.2.
- ROADMAP.md, Phase 4: "Verify HTTPS, manifest, icons, installation guidance and update behavior".
- PRD.md §10, PWA scope: contextual installation guidance; "do not promise identical installation prompts"; cache public static assets only.
- DESIGN_SYSTEM.md: §8 Home and "Puppy and settings", §9 Components and states, §10 Motion (no looping animations, reduced motion), §12 Accessibility and RTL, §14 State matrix.
- docs/DECISIONS.md: 6 (manifest, icons), 9 (`?state=` previews must be gated before public deployment) and P4-1 (offline recovery service worker and its rollback).
- Next.js guide `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` (install prompt pattern, `display-mode: standalone`, service worker headers, `updateViaCache: 'none'`).
- Code baseline: origin/main `d8add95` (`public/sw.js`, `src/components/pwa/ServiceWorkerRegistration.tsx`, `src/lib/devState.ts`, `src/server/local-mode.ts`, `src/app/manifest.ts`, `e2e/offline.spec.ts`, `e2e/shell.spec.ts`).

## Architectural Decisions

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

## Constraints / Non-Negotiables
- Progression invariants untouched: no change to attempts, mastery, plans, generation, media or ownership code.
- The offline fallback behaves exactly as P4-1 (D7). No new cache and no cached page, API, RSC or user data.
- Hebrew RTL copy using DESIGN_SYSTEM tokens and components (Card, Button, StateMessage patterns). 48 px controls, visible focus, no looping animation, reduced motion respected, no horizontal overflow at 360, 768 and 1280 px.
- Previews stay fully available under `next dev`, unit and integration tests, and the Playwright production build on a local machine.
- Pilot scope stays as agreed: no videos (`MEDIA_REQUIRED` off, techniques DRAFT); registration limited to approved emails only after the sender domain is verified (slice 4.5); first-party analytics in slice 4.6. 4.2 adds no analytics, tracking or persistent client storage.
- No deployment, merge or production change is part of this slice's implementation. The deployed-build checks run only after the owner approves a deployment.

## Technical Boundaries / Out of Scope
- Public shell asset caching (slice 4.3). Account deletion (4.4). Pilot allowlist (4.5). Metrics and alerts (4.6). Drills, performance and accessibility measurement (4.7). Device matrix, PRD §11 and usability (4.8).
- Push notifications, background sync, periodic sync, manifest screenshots or shortcuts, a custom install UI on iOS beyond instructions, and build-version polling.
- The DECISIONS provider-table correction (deferred until PR #3 is merged; PR #3 edits that table).
- Any change to `public/offline.html`, `src/app/manifest.ts`, the icons, `next.config.ts`, `playwright.config.ts` or `.env.example`.

## Dependencies and Interfaces

### Expected files (slice 4.2)
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

### Overlap with draft PR #3 (checked 2026-11-10)
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

### Interfaces
- Page → service worker: `postMessage({ type: 'SKIP_WAITING' })`, accepted only by a waiting worker; anything else is ignored.
- Server gate: `devPreviewsEnabled(env = process.env): boolean`, and `parseDevState(value, enabled)`.
- No HTTP API, no database schema, no environment variable.

## Data / State Considerations
- No server data changes and no persistent client storage (no `localStorage` key).
- The `woffiz-offline-v1` cache contents are unchanged (only `/offline.html`).
- The reload-once guard lives in memory or `sessionStorage` and is never persisted across sessions.

## Security / Privacy Considerations
- The previews gate is evaluated on the server, so the client cannot enable previews in production.
- The worker accepts only the one message type. It caches nothing new and keeps the same-origin CSP and no-store headers from P4-1.
- The install UI collects nothing, sends nothing and uses no third-party script.
- UA sniffing is used only to pick instruction text, never for access decisions.

## Testing and Lint Expectations
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

## Functional Testability
- Page/screen the user can open: `/puppy` (install card), any page (update banner).
- User-visible behavior: browser-appropriate Hebrew install steps; an "already installed" state; an update banner that only acts on the owner's tap; production ignores `?state=`.
- Command-line flow: `npm run check`, `npm run test:e2e`.
- API endpoint / request: none (no new API).
- Minimal end-to-end flow: open the local production build → `/puppy` shows install guidance → deploy a changed worker locally → the banner appears → tap update → the page reloads once with the new worker; go offline → the fallback still appears.
- Expected observable result: as above; previews visible locally and invisible in a production-mode server without the local-machine flag.

## Handoff Notes for Manager
- Detail only slice 4.2 from this contract. Slices 4.3-4.8 are not designed yet.
- D9 resolved by the owner: install guidance on `/puppy` only; `/home` is not changed.
- **Flagged before implementation:** PR #3 overlaps 4.2 only in `DESIGN_SYSTEM.md`, `docs/DECISIONS.md` and `README.md` (documentation, separate or adjacent regions). No code overlap. 4.2 must not edit `playwright.config.ts` or `.env.example`.
- Verify the current service-worker lifecycle APIs (`skipWaiting`, `registration.waiting`, `controllerchange`, `beforeinstallprompt`) and the iOS Add to Home Screen behavior against current official documentation during design. The `beforeinstallprompt` event is non-standard and Chromium-only.
- Record decision `P4-2` in docs/DECISIONS.md, superseding the gating note of decision 9 and the auto-activation part of P4-1.

## Architect Review
ARCHITECT_REVIEW_STATUS: APPROVED

### Review Notes
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

### Required Corrections
None.
