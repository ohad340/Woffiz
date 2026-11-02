# Puppy Training App Product Requirements

Version: 1.0 | Date: 2026-10-29 | Implementation environment: Claude Code
Document language: English | Product language: Hebrew | Status: implementation draft

## 1. Product overview
Build a mobile-first, installable web app that helps puppy owners practice consistently through a personalized, AI-generated training plan. The home screen is a single winding level map inspired by progression games, with original visual assets and a calm, polished personality.

The AI generates the plan and exercise instructions from puppy age, experience, difficulties and subsequent owner reports. It is not a chat product. Each exercise includes an AI-produced demonstration video and concise Hebrew instructions. Progress depends on owner-reported mastery, not on watching a video, elapsed time or tapping a completion button.

### Confirmed requirements
- Audience: puppy owners; everyday guidance and daily practice.
- One continuous path mixing toilet habits, biting, sleep, being alone and basic commands.
- AI chooses the order based on the puppy profile and adjusts exercises using feedback.
- The next level unlocks only after the owner reports mastery of the current exercise.
- Previously completed exercises remain available for practice.
- Demonstration videos are produced using AI.
- No conversational AI interface.
- Mobile-first website with home-screen installation support.
- Hebrew-only product at launch, with full right-to-left layout.
- Playful, polished design with pleasant colors and small animations.
- Free first release; monetization is undecided.
- Development happens in Claude Code.

### Proposed defaults
These are implementation recommendations, not additional user decisions.
- Working project identifier: puppy-training; the product name is Woffiz (owner-confirmed 2026-10-31).
- One puppy per account in the MVP; owner-only account and a separate administrator role.
- Email and password sign-in (owner decision, 2026-10-31); a single protected account owns the puppy and progress. Email verification is mandatory before any access to owner data, and password reset is by emailed one-time link (Resend). During the test phase registration and all authentication mail are limited to one tester address.
- Pre-generate videos into a reviewed media library rather than generate them during a session.
- Short, age-appropriate sessions; durations are exercise-specific and configurable.
- No forced one-level-per-day limit. Mastery is the gate; rest guidance remains visible.
- No notifications, payments, leaderboards, public profiles or multi-user households in MVP.
- Technology and operational defaults below may change during Phase 0 if the project already has suitable infrastructure.

## 2. Problem and value
The product hypothesis is that new puppy owners struggle to choose what to practice, follow instructions consistently and recognize when to repeat an exercise. A personalized next action, a visual demonstration and a visible path may make practice easier.

This is a product hypothesis, not a validated competitor claim. Validate it with pilot owners before expanding scope. The value is a clear daily loop: see the next task, practice, report the result and receive an appropriate next step.

## 3. Scope and priorities
P0 means required for the public MVP. P1 means a later improvement. P2 means an optional future direction.

| Priority | Capability | Required result |
|---|---|---|
| P0 | Account and puppy profile | Private, persistent progress across sessions |
| P0 | Personal plan generation | Ordered, validated levels based on profile |
| P0 | Winding map | Exactly one current level and a locked future suffix |
| P0 | Exercise detail | Matching video, preparation, short steps and mastery criterion |
| P0 | Feedback and mastery | Owner report persisted before progression |
| P0 | Adaptive practice | Easier guidance within a difficult current level |
| P0 | Review | Replay completed exercises without changing the frontier |
| P0 | Media administration | Review, publish, replace and withdraw video versions |
| P0 | Reliability and limits | Safe generation failures and bounded AI usage |
| P0 | Hebrew PWA and accessibility | Usable RTL product across mobile and desktop |
| P1 | Optional reminders | User-controlled practice notifications |
| P1 | Multiple puppies | Separate plans and histories |
| P2 | Monetization | Decide after pilot evidence; no billing implementation now |

Explicit exclusions: native store apps, chat, owner video assessment, social features, professional trainer marketplace, automatic diagnosis and live AI video generation per user.

## 4. User journeys
### First visit
The owner sees a concise explanation, signs in and completes a short onboarding flow. Collect puppy name, approximate birth date or age, existing skills, priority difficulties, relevant limitations and available practice time. Allow “not sure” for uncertain experience; do not require exact breed or a photo.

Save onboarding progress. Present a summary for correction, then request plan generation. Show a clear loading state and a retry action if generation fails. Do not show invented progress or a fake plan. The first valid plan opens on its first level.

### Daily practice
The map opens at the current level. The owner reads the goal, watches the demonstration, checks preparation and follows short numbered instructions. Watching is optional and does not count as mastery. The owner taps “תרגלנו” and chooses “הצליח לבד”, “הצליח עם עזרה” or “עדיין מתקשה”.

A successful attempt is not automatically mastery. Show the exercise-specific mastery criterion and a separate explicit confirmation: “כן, שולט בתרגיל לפי הקריטריון”. Only this confirmation can complete the level. A habit can require observation over several sessions or days; elapsed time alone never unlocks it.

### Difficulty and repetition
If the puppy needs help, keep the same level current and provide a simpler version or adjusted practice instructions. Preserve the level identity and learning goal. Repeated difficulty can trigger a supportive message and relevant professional referral. It cannot silently unlock the next level or introduce parallel paths.

### Returning owner and review
Restore progress from the server. Completed nodes open in review mode and never move the current-level pointer. A difficult review report is recorded and may inform future planning, but does not automatically erase mastery or relock completed levels.

### Finishing the plan
After the final level, show completion and a review action. Do not regenerate a never-ending path automatically. Additional programs are outside MVP.

## 5. Progression contract
1. Each active plan contains one ordered sequence with stable level IDs and unique positions.
2. Before completion, exactly one level is current; every earlier level is completed and every later level is locked.
3. Submitting practice feedback alone records an attempt; it cannot unlock a level.
4. Mastery confirmation must reference the current level, a saved attempt and the displayed criterion version.
5. The server verifies ownership, current level and plan version, then atomically completes the level and advances the frontier.
6. Duplicate requests return the same result. Concurrent confirmations cannot unlock two levels.
7. A review submission never advances the frontier.
8. AI may adapt the current exercise and reorder or replace locked future content. It cannot rewrite completed history or mark mastery.
9. Future-plan changes use version checks; stale jobs cannot overwrite newer progress.
10. No payment, clock, streak or AI confidence score can bypass mastery.
11. If current guidance is unsafe or its only video is withdrawn, pause access to that guidance and offer a reviewed replacement serving the same goal. Preserve history; never auto-complete the level.
12. Show concrete mastery criteria before practice. Criteria must be suitable for the goal; do not use one global success percentage for every behavior.

Server states: locked, current, completed. Session states: draft, submitted. UI loading, review and unavailable states are presentation states rather than mastery states.

## 6. AI architecture
### Responsibilities
Separate a planning service from the progression service. Planning produces structured content; deterministic server logic owns authorization and unlocking. Claude Code is the development tool, not the runtime AI subscription or credential.

Proposed runtime provider: Anthropic through a provider interface. Select and record an available model ID during Phase 0; do not hard-code an unverified model or assume Claude Code usage pays for runtime calls. Alternative providers remain possible without changing the domain model.

### Generation inputs and output
Inputs: sanitized puppy profile, known skills, limitations, recent attempt summaries, immutable completed-level summaries, current plan version, published media metadata and policy version. Treat owner-entered text as untrusted data.

Output schema:
- plan: schema_version, plan_version, locale, rationale_he, levels.
- level: stable_key, position, topic, goal_he, prerequisites, estimated_minutes.
- exercise: title_he, preparation_he, steps_he, success_criterion_he, stop_conditions_he, easier_variant_he.
- media binding: published media ID and compatible exercise variant.
- explanation: short owner-facing reason for an adaptation; no hidden reasoning.

Prompt families: initial_plan(profile, catalog, policy), adapt_current(profile, attempts, current_level, catalog, policy), revise_future(profile, progress, locked_levels, catalog, policy). Require Hebrew user-facing strings and structured JSON. Keep prompt, policy and model versions in generation records.

### Validation and failure handling
Validate schema, bounded field lengths, level count, unique positions, prerequisites, age/context suitability, content policy and published media compatibility on the server. Structured output validates shape; it does not prove training correctness.

Never accept arbitrary URLs or render model HTML. The model may generate wording and sequence, but deployable exercises must match an available reviewed demonstration and its permitted variants. If no compatible video exists, reject that candidate and request a compatible alternative; do not publish mismatched media.

On initial failure, retain onboarding and offer retry. On adaptation failure, retain the last valid exercise. Proposed limits: one pending generation per puppy, one automatic retry, configurable per-account and global quotas, and a visible retry-after state. Record latency and usage without logging unnecessary personal data.

### Training content boundary
Use reward-based, age-appropriate guidance. Disallow physical punishment, deprivation, hazardous handling and promises of guaranteed outcomes. Signs of pain, severe distress or aggression should stop the relevant generated exercise and direct the owner to qualified help. The app must not diagnose or invent a treatment plan. Content boundaries require validation by a qualified reviewer before public launch.

## 7. Video production and publication
AI-produced videos are a content production workflow separate from personalized text generation. Proposed clip format: a short, clearly framed demonstration, Hebrew captions and an optional Hebrew voice track. Exact model, vendor, voice and clip length remain production decisions.

Workflow: exercise brief → AI generation → check anatomy, movement, cue/action/reward timing and instruction match → add Hebrew captions and transcript → qualified content review → publish a versioned asset.

Store the exercise family, permitted variants, age/context constraints, caption and transcript assets, reviewer and publication status. Only published assets are selectable. Do not claim videos are professionally approved until review has actually occurred.

Provide accessible play/pause, captions, transcript and replay; do not autoplay sound. A playback outage may show the already reviewed transcript and a retry action, but every published level must have a valid video asset. Missing assets are a launch blocker, not a fabricated success.

No videos are delivered by this requirements package. Generation cost, production capacity and reviewer availability must be settled before Phase 3 publication.

## 8. Data model and access
All IDs are UUIDs unless an external authentication ID is required.

| Entity | Important fields | Ownership and relationships |
|---|---|---|
| Account | id, auth_subject, role, created_at | Owns puppy; auth_subject unique |
| Puppy | id, owner_id, name, age_data, profile_json, revision | One per owner in MVP |
| Plan | id, puppy_id, version, status, current_level_id | One active plan per puppy |
| Level | id, plan_id, position, topic, state, content_version | Unique plan and position |
| ExerciseVersion | id, level_id, content_json, criterion_version, media_id | Immutable content snapshots |
| Attempt | id, puppy_id, level_id, exercise_version_id, outcome, mode, time | Owner report; mode is current or review |
| MasteryEvent | id, level_id, attempt_id, criterion_version, confirmed_at | At most one active completion per level |
| MediaAsset | id, family, variant, storage_key, captions_key, status, version | Administrator-managed catalog |
| GenerationJob | id, puppy_id, expected_plan_version, status, model, usage, policy_version | Private operational record |

Index ownership lookups, ordered plan levels and recent attempts. Scope all reads and writes by authenticated ownership; never trust a client-supplied owner ID. Verify referenced attempt, level and puppy belong together. Administrator permissions must be enforced server-side.

Account deletion deletes personal profiles, plans and attempts and removes linked job payloads. Shared media assets remain. Proposed failed-job payload retention: 30 days; application backups and provider retention must be documented before launch. Never expose private content through shared caches.

## 9. UX and design
Design goal: make the next useful practice action obvious while showing gradual progress. Reward consistency without implying the puppy has failed.

Screens: introduction/sign-in, onboarding, generation state, map, exercise, feedback, completion, puppy/settings and restricted media administration. Bottom navigation uses home, map, review and puppy; review is a list of completed exercises, not an independent training track.

The map is a single vertically winding path. Nodes have number, topic label and state icon; future nodes explain their prerequisite when selected. On long plans, show a bounded region around the current level, with accessible controls to load more. Preserve scroll and keyboard focus.

Exercise layout: title and goal, video, preparation, numbered steps, mastery criterion, optional easier guidance and bottom practice-report action. Feedback contains three outcome choices followed by explicit mastery confirmation when appropriate.

Visual direction (owner-approved 2026-10-31): colorful cartoon adventure style with a recurring puppy mascot, sky-and-hills scenery, yellow CTA and a climbing trail map. No looping animations. Full implementation details: DESIGN_SYSTEM.md.

Accessibility: visible labels, semantic controls, keyboard access, screen-reader state announcements, sufficient contrast and no color-only meaning. Respect reduced motion. Use RTL logical layout and isolate mixed-direction text.

State coverage: empty profile → start onboarding; generating → honest loading; no connection → retained read-only content and retry; report saving → prevent duplicates; save failure → retain selection; video error → transcript and retry; plan complete → review; unavailable content → explain and preserve progress.

## 10. Technical and operational requirements
Proposed stack: Next.js with TypeScript for web UI and server endpoints; PostgreSQL with Prisma for persistence; managed email authentication; object storage/CDN for media; a server-only AI adapter. Resolve hosting, auth provider, database host and exact package versions in Phase 0. Do not create paid resources as part of scaffolding.

PWA scope: manifest, icons, HTTPS deployment and contextual installation guidance. Support depends on browser; do not promise identical installation prompts. Cache public static assets only in MVP. Full offline training and offline progress submission are excluded. Provide a clear offline state and retain unsaved form selections locally for the current session.

Server requirements: authenticated requests, input validation, CSRF protection appropriate to the auth flow, transaction-based progress writes, idempotency keys, optimistic versioning, safe media URLs, rate limits and server-only secrets. No credentials in source control or client bundles.

Proposed performance targets: primary shell LCP at or below 2.5 seconds on an agreed mobile test profile; interaction INP at or below 200 ms; non-AI progress writes p95 below 1 second under the pilot load. These are acceptance targets, not measured results.

Free access does not mean zero operating cost. Before a live pilot, set an owner-approved AI spending ceiling, media storage budget and generation limits. Once a limit is hit, retain valid existing content and show a truthful retry state.

## 11. Acceptance and success measures
### Required functional tests
- A new profile receives a valid Hebrew plan and exactly one current level.
- Watching a video or submitting an ordinary success report does not unlock a level.
- Explicit valid mastery unlocks exactly one next level, including under retries/concurrency.
- Review does not change the frontier; a locked-level API request is rejected.
- Another account cannot read or mutate a puppy, attempts or plan.
- Failed generation retains valid content; stale jobs cannot overwrite progress.
- Unknown or unpublished media cannot appear in a published plan.
- Refresh restores progress; network failure does not falsely show a saved report.
- Final mastery completes the plan without creating a phantom next level.
- RTL, keyboard navigation, captions and reduced motion work on supported browsers.

### Proposed pilot goals
Pilot with 20–30 consenting puppy owners, subject to recruitment. Measure onboarding-to-first-practice conversion, active practice days, day-7 return rate, repeated difficulty at each level, mastery-report frequency and video issues.

Initial hypotheses: at least 60% of completed onboardings lead to a first practice report; at least 35% return in days 6–8; median 3 practice days in the first week. These are decision thresholds to revise after evidence, not promises. Owner-reported mastery is a proxy and must not be presented as objectively verified learning.

## 12. Risks and unresolved decisions
| Risk | Impact | Mitigation |
|---|---|---|
| Single path stalls on a difficult habit | High | Smaller teachable goals and adaptive repeats; measure stalled users |
| AI advice or visuals are incorrect | High | Content boundaries, reviewed media, launch validation and withdrawal controls |
| Self-reports overstate mastery | Medium | Concrete criteria and honest report-based progress labeling |
| AI/media costs exceed the free pilot budget | High | Pre-generated videos, caching, quotas and spending alerts |
| Future regeneration changes history | High | Stable IDs, version checks and immutable completed content |
| PWA installation differs by browser | Medium | Test target devices and provide contextual instructions |

Open decisions: hosting/auth/data providers; runtime model and API budget; video provider and generation budget; qualified reviewer; launch media coverage; pilot audience and timing. Development can begin with clearly labeled fixtures before these are resolved. Public launch cannot proceed without valid content, provider configuration and budget limits.

## 13. Delivery roadmap
See ROADMAP.md for sequential phases, dependencies and acceptance criteria. Complete the deterministic practice loop with fixtures before connecting live AI. Integrate reviewed media before public launch. Each phase is independently reviewable; do not build the entire product in one prompt.

## 14. Technical references
Official references checked on 2026-10-29. Recheck exact APIs and versions during implementation.
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Claude project context: https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts

