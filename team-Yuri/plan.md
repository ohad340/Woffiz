# Team Yuri Architecture Plan

## Document Status
STATUS: APPROVED

## Project Objective
Woffiz is a Hebrew-only, RTL, mobile-first installable web app. Puppy owners follow one continuous, AI-personalized, mixed-topic training path, and only an explicit owner mastery confirmation unlocks the next level.

Phases 0-3 of ROADMAP.md exist. This plan covers only the remaining work of **ROADMAP Phase 4: PWA quality and private pilot**, which delivers a reliable private release to pilot owners. Phase numbering follows ROADMAP.md (`PHASE=4`). Phases 0-3 and Phase 4 slice 1 are not re-planned.

Sources of truth: PRD.md (product), ROADMAP.md (phases), DESIGN_SYSTEM.md (UI contract), docs/DECISIONS.md (decisions; Phase 4 rows are numbered `P4-n`), docs/PHASE_3_PLAN.md (media).

## Users and Primary Use Cases
- **Pilot owner** (20-30 consenting puppy owners, subject to recruitment). Installs the app, completes onboarding, receives a plan, practices, reports and confirms mastery, reviews completed levels, and can delete their account.
- **Owner/administrator** (the product owner, ADMIN role). Admits pilot participants, reads the pilot metrics, receives operational alerts, and runs the rollback, backup and spending-limit drills.

## Facts
Verified on 2026-11-10 from the repository, origin/main and docs/DECISIONS.md.

Already done (not re-planned):
- **Phase 4 slice 1, offline recovery** (PR #4, commit db60622, merged to main as d8add95; decision P4-1). `public/sw.js` is network-first for GET navigations only and serves the precached static `public/offline.html` on a network failure. The cache `woffiz-offline-v1` holds that one file and nothing is written at runtime. The worker is registered in production builds only, and `/sw.js` is served no-store with a same-origin CSP. E2E: `e2e/offline.spec.ts`. Real iPhone/Safari checks are pending.
- **Manifest** `src/app/manifest.ts`: Hebrew, RTL, standalone, start_url `/home`, 192, 512 and maskable icons with the Woffiz branding (decision 6, commit 21e80ea).
- **Hosting**: Vercel project `woffiz` (cdg1, HTTPS) and Supabase PostgreSQL (eu-west-3). Better Auth, Resend on the shared sender, tester-only registration (README "Deployment").
- **AI spending limits**: daily per-account and global quotas, one pending job per puppy, one retry (decisions 47-57).
- **Offline notice** in the app shell (`src/components/shell/OfflineNotice.tsx`).

Open gaps found in code:
- **Account deletion** is not implemented. `/puppy` says "עריכת פרטים ומחיקת חשבון יתווספו בהמשך". PRD §8 and DESIGN_SYSTEM.md (confirmation dialog with an honest scope statement) require it.
- **`?state=` previews** (`src/lib/devState.ts`, decision 9) are not gated in production. The file itself says it must be removed or gated before any public deployment. Correction (2026-11-10): the only `?state=generating` link in `OnboardingFlow.tsx` sits inside the `generation-error` preview itself; the real generation flow uses component state, not the query parameter.
- **No install guidance, no update behavior** (a new service worker activates silently) and **no public shell asset caching**.
- **No analytics, no operational alerts, no backup or restoration procedure** in code or docs.
- **The provider table in docs/DECISIONS.md** still lists hosting and database as "Open", although both are deployed (documentation drift).

Phase 3 status:
- Phase 3 (slices 3A-3D and the automated part of 3E) is on draft PR #3, branch `feature/phase-3a-media-foundations`, and is **not merged** to main.
- Video production is paused. The mouthing pilot and all techniques stay DRAFT, and `MEDIA_REQUIRED` stays off.
- A separate workstream is preparing the Phase 3 infrastructure release. It is not part of this plan.

Owner decisions for this plan (2026-11-10):
1. Team Yuri uses ROADMAP numbering; `PHASE=4`.
2. **The pilot runs without demonstration videos.** Exercises are free-form and show the honest "no demonstration" state, with `MEDIA_REQUIRED` off. Real media is a Phase 5 launch condition, not a Phase 4 input.
3. **Pilot access is a server-side email allowlist now; a verified sending domain comes later.** Opening the pilot to non-tester addresses is blocked until the owner has a domain verified in Resend.
4. **Pilot analytics are first-party in the app's own database.** No third party, no cookies, no extra cost.

## Assumptions
- A1. Pilot traffic stays inside the current Vercel Hobby and Supabase free tiers. Any paid upgrade is an explicit owner decision.
- A2. Phase 3 is released (PR #3 merged) before or independently of the Phase 4 slices that touch the same files (`next.config.ts`, `src/app/layout.tsx`, `public/sw.js`, docs/DECISIONS.md). Phase 4 work branches from the then-current main.
- A3. The owner performs the real-device checks (iPhone Safari, Android Chrome, desktop) and the usability sessions. The software records them as pending until they are done.
- A4. Operational alerts can be delivered by email to the owner through the existing Resend integration. The channel is still an open question (see below).

## Constraints
- Product invariants from CLAUDE.md and PRD §5: one mixed-topic path; only explicit owner mastery unlocks; reports, elapsed days and video playback never unlock; review never advances the frontier; AI cannot update mastery or rewrite history; no chat, payments, social features or native apps.
- Cache public static assets only. No HTML page, API response, RSC payload, signed media URL or user data in any cache. Full offline training and offline report submission are excluded (PRD §10).
- Hebrew RTL UI following DESIGN_SYSTEM.md tokens and states. Keyboard focus, reduced motion (no looping animations) and no overflow at 360, 768 and 1280 px.
- Secrets server-side only. No paid resources, no public launch, no production database change or deployment without the owner's explicit approval at that step.
- Production migrations are applied by hand with `prisma migrate deploy`, never during the Vercel build, and never `migrate reset` or `db push`. Integration and e2e suites never run against Supabase.
- Every new table enables RLS and revokes `anon` and `authenticated` (`test/integration/data-api-lock.test.ts`).
- One slice per branch and PR; slices are not combined.

## Architectural Principles
- **Honest states over optimistic UI.** Offline, update-available, deleted and unavailable states say exactly what happened. No fabricated progress.
- **Additive and reversible.** Each slice has a documented rollback. Service-worker changes always keep the unregister/cache-purge rollback from P4-1.
- **Derive before collecting.** Pilot metrics are computed from data the app already stores (accounts, onboarding, attempts, mastery, jobs). New event rows are added only where no source exists, and never hold free text or profile data.
- **Server-enforced access.** The allowlist, admin reports and deletion are checked on the server against the database, never trusted from the client.
- **Drills are evidence.** Rollback, backup restoration and spending limits count as done only when exercised and recorded, not when documented.

## Recommended High-Level Architecture
No new runtime services. Phase 4 extends the existing Next.js App Router app, Prisma/PostgreSQL schema, service worker and Resend adapter.

- **Service worker** (`public/sw.js`): keeps network-first navigations with the offline fallback, adds a versioned cache for immutable public build assets only (`/_next/static/*`, icons, fonts), and adds a client-visible update flow (waiting worker, Hebrew "new version" prompt, reload on owner action).
- **Install guidance**: a client component that shows contextual, browser-specific instructions (iOS Safari: Share → Add to Home Screen; Chromium: the native prompt when available). It is never shown when the app already runs standalone, and it never promises an identical prompt across browsers.
- **Account deletion**: a server endpoint in one transaction removes the account's personal data (puppy, profile, onboarding, plans, levels, exercise versions, attempts, mastery events, generation job payloads, sessions, idempotency records), keeps shared media, and signs the user out. The UI is a confirmation dialog per DESIGN_SYSTEM.md.
- **Pilot access**: a server-side allowlist (`PILOT_EMAILS`, server-only) consulted by the existing registration gate next to `TESTER_EMAIL`. Sign-in for existing accounts is unchanged.
- **Pilot metrics**: server-side queries over existing tables, plus a minimal anonymous event table only where needed. Shown on an ADMIN-only page (existing `requireAdminOrNotFound`) and/or a CLI script; aggregates only, no personal data in the output.
- **Operational alerts**: server-side detection of generation failures, quota exhaustion and server errors, delivered to the owner by a channel still to be decided. No personal data in alert payloads or logs.
- **Operations runbook** in `docs/`: production deploy and rollback, content rollback (media withdrawal and suspension, plan revision), database backup and restoration on the current Supabase tier, and spending-limit verification.

## Non-Functional Requirements
- Performance targets (PRD §10, to be **measured**, not assumed): LCP ≤ 2.5 s on an agreed mobile profile; INP ≤ 200 ms; non-AI progress writes p95 < 1 s under pilot load.
- Accessibility: axe clean at 360, 768 and 1280 px; keyboard and screen-reader operable dialogs and prompts; reduced motion respected.
- Privacy: no private data in caches, logs, alerts or analytics output; no cross-account access (PRD §11).
- Compatibility: iOS Safari, Android Chrome and desktop browsers at current supported versions, recorded per device.

## Risks and Mitigations

| Risk | Impact | Mitigation | Owner / Artifact |
|---|---|---|---|
| A cached asset or page leaks private content between accounts | High | Allowlist cache keys to immutable public build paths only; e2e asserts cache contents after a signed-in session; keep the P4-1 rollback | Architect / arch-phase4.md |
| A stale service worker keeps owners on an old build | Medium | Explicit update prompt, versioned cache names, old caches purged on activate, `/sw.js` no-store | arch-phase4.md |
| Account deletion misses a table or touches shared media | High | Deletion test enumerates every owner-scoped table and asserts zero rows remain while shared media is intact | Developer / dev-phase4.md |
| Phase 3 and Phase 4 edit the same files in parallel | Medium | Phase 4 slices branch from main after the Phase 3 merge; DECISIONS rows numbered `P4-n` | Owner (orchestrator) |
| Pilot opening blocked by the missing verified domain | Medium | Allowlist built now; opening the pilot is a separate, explicit owner step once the domain exists | Owner |
| The Supabase free tier may offer no restorable automated backups (to be verified against current Supabase docs in phase design) | High | Restoration drill with a manual `pg_dump` into a local database; document the limitation and the paid option for the owner | arch-phase4.md / runbook |
| Analytics drifts into personal tracking | Medium | Aggregates only, no free text or profile fields, ADMIN-only, documented retention | arch-phase4.md |
| Pilot without videos weakens the exercise experience | Medium | Honest "no demonstration" state already exists; measure in usability sessions; real media is a Phase 5 condition | PRD §7, Phase 5 |

## Phased Delivery Plan
`PHASE=4` covers the remaining Phase 4 work as sequential slices. Each slice is a separate branch and PR with its own tests and a functionally testable outcome. `arch-phase4.md` (the next Architect state) defines the contract for them and may refine their order. Phase 5 is listed only for continuity and is not planned here.

| Slice | Name | Status |
|---|---|---|
| 4.1 | Offline recovery screen | **Done** (PR #4, P4-1) |
| 4.2 | Install guidance, update behavior and production hardening of dev previews | Planned |
| 4.3 | Public shell asset caching | Planned |
| 4.4 | Account deletion | Planned |
| 4.5 | Pilot access allowlist | Planned |
| 4.6 | Pilot metrics and operational alerts | Planned |
| 4.7 | Operations drills: content rollback, backup restoration, spending limits, performance and accessibility measurement | Planned |
| 4.8 | Pilot readiness: device matrix, PRD §11 end to end, usability sessions, results report | Planned (largely owner-run) |

## Phase 4: PWA quality and private pilot (remaining slices 4.2-4.8)

### Goal
Turn the deployed, tester-only app into a reliable private pilot release without videos: installable with honest guidance, safe updates, public-only caching, account deletion, controlled pilot access, privacy-conscious metrics and alerts, exercised operational drills, and a factual pilot results report.

### Scope
- **4.2** Contextual install guidance (Hebrew, browser-specific, hidden when standalone). Service-worker update flow with a Hebrew "new version available" prompt and an owner-triggered reload. Gate `?state=` previews out of production while keeping the real onboarding generating state. Verify HTTPS, manifest and icons on the deployed build.
- **4.3** Cache immutable public build assets (`/_next/static/*`, icons, fonts) in a versioned cache. Never cache HTML, API, RSC, signed media URLs or user data. Purge old caches on activate.
- **4.4** Account deletion per PRD §8: confirmation dialog with an honest scope statement on `/puppy`, server transaction removing all owner-scoped data, sign-out, shared media retained, documented retention of failed-job payloads.
- **4.5** `PILOT_EMAILS` server-side allowlist in the registration gate, alongside `TESTER_EMAIL`. Hebrew copy for addresses not on the list (neutral, as today). Documented in README and `.env.example`. Opening to non-tester addresses stays blocked until a verified domain exists.
- **4.6** First-party pilot metrics (onboarding to first report, active practice days, day-7 return, repeated difficulty per level, mastery-report frequency) as aggregates on an ADMIN-only view or CLI. Operational alerts for generation failures, quota exhaustion and server errors, without personal data.
- **4.7** Runbook and recorded drills: deployment rollback to a previous Vercel deployment, content rollback (withdraw or suspend media, revise future plan), backup and restoration on the current Supabase tier, spending-limit exhaustion showing the honest retry state. Measured LCP, INP, progress-write latency and an accessibility audit.
- **4.8** Device matrix (iOS Safari, Android Chrome, desktop) recorded honestly; PRD §11 functional cases passing end to end; owner-run usability sessions on onboarding, mastery wording and map navigation; factual pilot results report.

### Architectural Direction
Extend the existing app; no new hosted services. The service worker remains a single small file with an allowlist of cacheable paths. Deletion is one server transaction with ownership derived from the session. Access control and admin views reuse the existing registration gate and `requireAdminOrNotFound`. Metrics prefer derivation from existing tables. Drills produce recorded evidence in docs, not only instructions.

### Non-Negotiable Constraints
- Progression invariants unchanged; no slice touches progression, mastery or generation logic beyond reading for metrics and deleting on account deletion.
- No private data in any cache, log, alert or metric output.
- `MEDIA_REQUIRED` stays off; no clips published; techniques stay DRAFT.
- No production migration, deployment, domain purchase, paid tier or opening of registration without explicit owner approval at that step.
- Hebrew RTL UI per DESIGN_SYSTEM.md; any needed design change updates DESIGN_SYSTEM.md first.

### Out of Scope
- Video production, publication, the `MEDIA_REQUIRED` switch and Phase 3 release work (separate workstream).
- Full offline training or offline report submission.
- Push notifications or reminders, profile editing, multiple puppies, payments, chat, social features, native apps.
- Third-party analytics, cookies or tracking.
- Buying or configuring the sending domain (an owner action; only the switch to use it is in scope later).
- Phase 5 launch decisions.

### Dependencies
- Phase 3 PR #3 merged to main before slices that touch shared files (assumption A2).
- The owner's real devices for 4.8 and the real-device rows of 4.1-4.3.
- A verified Resend sending domain before non-tester pilot owners can register (owner).
- Owner approval for each production step: migrations (4.4, 4.6 if they add tables), deployments, opening the allowlist.
- Pilot participants recruited by the owner for usability sessions and the pilot.

### Verification Expectations
- Per slice: typecheck, lint, unit tests, integration tests (local PostgreSQL or PGlite, CI PostgreSQL for required tests) and the Playwright suite at 360, 768 and 1280 px with axe.
- 4.3: e2e asserts cache contents contain only allowlisted public paths after a signed-in session.
- 4.4: integration test proves every owner-scoped table is emptied for the deleted account only, shared media is intact, and another account cannot trigger the deletion.
- 4.5: tests for allowed, not-allowed and tester addresses, including direct API calls.
- 4.6: tests prove metrics output has no personal fields and alerts carry no personal data.
- 4.7 and 4.8: recorded drill and device results in docs; unmet items stay marked pending.
- Every slice documents its rollback and updates README/docs per `.claude/rules/30-docs.md`.

### Functional Testability
- 4.2: open the deployed or local production build on a phone or browser, see install guidance that fits the browser; deploy a new build and see the "new version" prompt; `?state=` has no effect in production.
- 4.3: load the app, go offline, and the static shell assets load from cache while private pages still show the offline screen.
- 4.4: as a test owner, delete the account from `/puppy` and confirm the account can no longer sign in and the data is gone.
- 4.5: register with an allowlisted address (local outbox) and get through; a non-listed address gets the neutral answer.
- 4.6: open the ADMIN metrics view or run the CLI and see aggregate numbers; trigger a generation failure locally and receive the alert.
- 4.7: follow the runbook and see a restored local copy of a backup, a rolled-back deployment target identified, and the quota-exhausted retry state.
- 4.8: a completed device matrix, PRD §11 checklist and pilot results report.

### Handoff Notes for Phase Design
- Phase design (`arch-phase4.md`) should treat 4.2-4.8 as an ordered slice sequence and define each slice's contract, starting with 4.2.
- The production code baseline is origin/main (d8add95); Phase 3 code arrives with PR #3.
- Reuse existing building blocks: `public/sw.js` and its e2e, `ServiceWorkerRegistration`, `OfflineNotice`, `requireAdminOrNotFound`, the Resend registration gate, `data-api-lock` test, and the DESIGN_SYSTEM state table.
- Decisions recorded as `P4-n` in docs/DECISIONS.md; correct the outdated provider table when touching that file.

## Open Questions

| Question | Why It Matters | Required Decision |
|---|---|---|
| Alert channel: email to the owner through Resend, Vercel's built-in notifications, or something else? | Determines 4.6 design and whether any external service or cost is involved | Owner, before 4.6 design |
| Backups on the Supabase free tier: is a manual `pg_dump` drill enough for the pilot, or upgrade for managed backups? | 4.7 acceptance "backup restoration exercised"; an upgrade is a paid decision | Owner, before 4.7 |
| Mobile performance test profile (device, network throttling) for LCP/INP | Targets are meaningless without an agreed profile | Owner/Architect, in arch-phase4.md |
| Pilot recruitment, size and timing; who runs usability sessions | 4.8 scheduling and the results report | Owner, before 4.8 |
| Verified sending domain: which domain and when | Blocks opening the pilot to non-tester addresses | Owner, before opening the pilot |
| Retention period for analytics events and failed-job payloads (PRD proposes 30 days for payloads) | Privacy commitments in 4.4 and 4.6 | Owner, in arch-phase4.md |
