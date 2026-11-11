# Puppy Training App Roadmap
Version: 1.0 | 2026-10-29 | Status: proposed implementation sequence
Source of product truth: PRD.md. UI contract: DESIGN_SYSTEM.md.
Build in Claude Code, one phase at a time. Begin each phase in Plan mode.
No delivery dates are promised before repository and provider setup are known.

## Product invariants
- Hebrew-only, RTL, mobile-first installable web app.
- One continuous mixed-topic path; no topic branches.
- Owner-confirmed mastery unlocks the next level; review never advances it.
- AI generates/adapts content but cannot award mastery.
- AI-produced demonstration videos; no user chat; free MVP.

## Proposed technology
- Next.js and TypeScript for web and server endpoints.
- PostgreSQL and Prisma for data; managed email authentication.
- Object storage/CDN for reviewed videos and Hebrew captions.
- Server-only provider adapter for AI; Anthropic is a proposed initial provider.
- Choose providers, model and supported package versions in Phase 0.
- Do not provision paid infrastructure without an agreed budget.

## Phase 0 — Foundation and design contract
Objective: establish a coherent project with a testable Hebrew UI shell.
Inputs: PRD.md, DESIGN_SYSTEM.md, CLAUDE.md and PHASE_0_PROMPT.md.
Tasks:
- Inspect the repository; preserve existing work and document stack decisions.
- Pin compatible dependencies and create an environment example without secrets.
- Configure Hebrew RTL, design tokens, reusable controls and responsive shell.
- Build sign-in, onboarding and map shells with explicitly labeled fixtures.
- Add PWA metadata and placeholder icons labeled as development assets.
Acceptance:
- Typecheck, lint and production build pass.
- Shell works at 360px, 768px and 1280px without horizontal overflow.
- Keyboard focus, Hebrew text and reduced motion are verified.
Exit artifact: running local shell plus a short decision log.

## Phase 1 — Persistent practice and progression
Objective: make the core loop work without a live AI dependency.
Inputs: database/auth configuration or documented local equivalents.
Tasks:
- Implement ownership, schema migrations, profile and onboarding persistence.
- Seed one representative mixed-topic fixture path.
- Build exercise, feedback, explicit mastery, map and review flows.
- Make progress updates transactional, versioned and idempotent.
- Preserve selections on failed saves; restore progress after refresh.
Acceptance:
- Feedback alone cannot unlock; mastery unlocks exactly one level.
- Review and locked-level requests cannot advance progress.
- Retry/concurrent requests and final-level completion are covered by tests.
- Cross-account read/write attempts fail.
Exit artifact: persistent end-to-end practice loop using labeled development content.

## Phase 2 — Personalized AI plans and adaptation
Objective: replace fixture planning with validated, bounded AI generation.
Inputs: chosen runtime model, API credential, policy and spend ceiling.
Development may use an isolated test media catalog; real publication remains blocked until Phase 3.
Tasks:
- Implement initial_plan, adapt_current and revise_future prompt families.
- Add structured output parsing and semantic/media validation.
- Version prompts, policies, plans and immutable exercise snapshots.
- Implement pending-job control, timeout handling, one retry and quotas.
- Preserve completed history and reject stale generation results.
Acceptance:
- Different puppy profiles produce appropriate differentiated Hebrew plans.
- Invalid prerequisites, unsafe outputs and unknown media are rejected.
- An AI outage leaves the last valid plan usable and never changes mastery.
- Budget limits and absence of client-exposed keys are verified.
Exit artifact: personalized planning service and recorded evaluation cases.

## Phase 3 — AI video library and publication
Objective: replace development media with usable reviewed demonstrations.
Inputs: technique definitions with recorded sources, video and voice budget and providers, owner (ADMIN) review time.
Slices: 3A foundations (technique catalog, media schema, bundle validation, storage adapter, admin guards, ingest) →
3B admin review/publish/withdraw → 3C catalog-rendered generation → 3D player, resolver and safety suspension →
3E real-device QA and mandatory-coverage switch. Tests ship inside each slice. Plan: docs/PHASE_3_PLAN.md.
Tasks:
- Generate clips (picture and Hebrew voice) outside the user request path; the owner reviews them against exercise briefs and sources.
- Add Hebrew voice guidance, synchronized captions, transcripts, poster images and published versions.
- Implement a restricted media review/publish/withdraw workflow.
- Match every reachable exercise and easier variant to compatible published media.
- Handle withdrawn media and playback failures without fabricated completion.
Acceptance:
- Every published level has a compatible reviewed video and transcript.
- Unpublished/withdrawn versions cannot be newly assigned.
- Existing affected levels show safe replacement or unavailable state.
- Real mobile playback, audio, captions and timing are reviewed by listening and watching on real devices (recorded as pending until done).
- Approvals are bound to the exact content bundle and technique definition; a safety suspension is atomic with attempts, mastery and generation commits.
Exit artifact: production media catalog with review records.
Dependency note: media work may start earlier; public publishing waits for this gate.

## Phase 4 — PWA quality and private pilot
Objective: deliver a reliable private release to pilot owners.
Inputs: completed prior phases, configured hosting, budgets and real assets.
Tasks:
- Verify HTTPS, manifest, icons, installation guidance and update behavior.
- Test iOS Safari, Android Chrome and desktop at current supported versions.
- Cache public shell assets only; show honest offline states.
- Implement minimal privacy-conscious analytics, deletion and operational alerts.
- Run usability sessions on onboarding, mastery wording and map navigation.
Acceptance:
- Functional cases in PRD section 11 pass end to end.
- No private data leaks through cache, logs or cross-account access.
- Accessibility and proposed performance targets are measured.
- Content rollback, backup restoration and spending limits are exercised.
Exit artifact: private pilot release and a factual results report.

## Phase 5 — Evidence-based launch
Objective: decide whether the product is ready for wider free use.
Inputs: pilot results, unresolved issue list and operating-cost measurements.
Tasks:
- Review activation, day-7 return, stalled levels and video issues.
- Fix blockers and confirm final brand, privacy copy and support contact.
- Re-evaluate the single-path experience without changing it silently.
- Agree launch audience, operational ownership and release scope.
Acceptance:
- No unresolved critical privacy, progression or content defects.
- Real media covers the published experience and operating budget is approved.
- Launch decision and any deferred work are recorded.
Exit artifact: launch-ready build; deployment is a separate explicit step.

## Later backlog
Optional reminders, multiple puppies, household sharing and monetization.
No payments, chat, leaderboards or native apps are authorized by this roadmap.
For each phase, report what changed, checks run and blockers; avoid long reports.

