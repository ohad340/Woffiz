# Decision log

Short record of Phase 0 decisions. Proposed = reversible default; Open = needs the owner.

## Phase 0 — 2026-10-31

| # | Decision | Status | Notes |
|---|---|---|---|
| 1 | Next.js 16.4.3 (App Router), React 19.3.1, TypeScript 5.9.3 | Proposed | TS 7 (native) and 6 exist, but `typescript-eslint` supports `<6.1`; stay on 5.9 until the lint toolchain catches up. |
| 2 | ESLint 9.39.5 + `eslint-config-next` 16.4.3 (flat config) | Proposed | ESLint 10 skipped: `eslint-plugin-react` peer range ends at 9. |
| 3 | Plain CSS custom properties + CSS Modules, no Tailwind | Proposed | Tokens live once in `src/styles/tokens.css`, mirroring DESIGN_SYSTEM.md. Logical properties for RTL. |
| 4 | Heebo self-hosted via `@fontsource/heebo` 5.3.0 (400/500/700) | Proposed | SIL Open Font License 1.1. No runtime request to Google. |
| 5 | Lucide icons (`lucide-react` 1.66.0) | Proposed | Directional icons chosen per RTL (back = arrow pointing right). |
| 6 | PWA: Next built-in `app/manifest.ts`; icons are the Woffiz logo on a light background (`public/icons`) | Confirmed | No service worker in Phase 0 — public-asset caching is Phase 4. |
| 7 | Tests: Vitest 5 (domain rules), Playwright 1.64 + axe-core at 360/768/1280 | Proposed | `npx playwright install chromium` once per machine. |
| 8 | All exact versions pinned (`--save-exact`); Node 24 in `.nvmrc`, `>=20.9` in engines | Proposed | |
| 9 | Dev state preview via `?state=` (loading, empty, error, offline, generating, generation-error) | Proposed | Development-only; remove or gate before any public deployment. |
| 10 | App name and logo: **Woffiz** (owner-supplied logo in `public/art/logo.webp`, app icons in `public/icons`) | Confirmed | Replaces the working title. Package id stays `puppy-training`. |
| 11 | Onboarding draft stored in `sessionStorage` only | Proposed | Server persistence is Phase 1. |
| 12 | Map: semantic `<ol>` of buttons + decorative per-step SVG connector (`aria-hidden`); bounded window (3 before / 4 after current) with load-earlier/later; ordered list layout when the path container is ≤300px (narrow phones, 200% zoom) | Proposed | |

## Redesign v2 — 2026-10-31

| # | Decision | Status | Notes |
|---|---|---|---|
| 13 | Playful adventure look per owner reference mockup; DESIGN_SYSTEM.md v2 | Confirmed | Replaces the v1 cream/green palette. |
| 14 | Home screen at `/home`; nav becomes בית / המפה / חזרה / הגור שלי | Confirmed | PRD §9 updated. Manifest start_url `/home`. |
| 15 | Map uses the owner's painted map image with real nodes over eight fixed path places and a sliding window | Confirmed | Painted art has a fixed path, so plans of any length are shown 8 levels at a time. Replace with real high-resolution art before launch. |
| 16 | No looping animations | Confirmed | Owner feedback. Only press feedback and panel transitions. |
| 17 | Coins, stars and prize chest from the mockup omitted | Confirmed | No reward system exists; no fake achievements. Progress chip shows real completed/total. |
| 18 | Map direction bottom-to-top follows the artwork; DOM order stays level order | Proposed | Keyboard and screen readers still go 1 → n. |

## Phase 1 — 2026-10-31

| # | Decision | Status | Notes |
|---|---|---|---|
| 19 | Prisma **7.10.1** (stable) with `@prisma/adapter-pg` 7.10.1 and `pg` 8.23.1 | Confirmed | Prisma 8 is only a release candidate (8.0.0-rc.29): not used. Engines: Node ^20.19 / ^22.12 / >=24; this repo pins Node 24. |
| 20 | Better Auth **1.7.14** with email and password (scrypt hashes, 8–128 characters). Magic-link sign-in was built first and then **replaced** at the owner's request | Confirmed | Sessions are cookies; sign-in errors for a wrong password and an unknown email are identical; 5 attempts per IP per minute on sign-in/sign-up. |
| 21 | zod 4.6.7 validates every API body (strict: unknown fields rejected) | Confirmed | |
| 22 | Local DB: `prisma dev` (PGlite) with named servers `woffiz` and `woffiz-test`; state persists per name; migration shadow DB on its own port | Confirmed | PGlite serves one connection: `DATABASE_POOL_MAX=1` locally. Dev and test data are separate. |
| 23 | Concurrency / row-locking acceptance tests run on standard PostgreSQL only (CI `postgres:17`, `TEST_DB_KIND=postgres`); locally they are skipped and reported as skipped | Confirmed | A PGlite pass is never counted as verifying them. |
| 24 | Registration is open only when **all** hold: `LOCAL_SIGNUP=true`, `APP_ENV=local`, `BETTER_AUTH_URL` on localhost. Otherwise sign-up is rejected by the server and hidden in the UI | Confirmed | Owner decision: block sign-up in a published environment until there is an email provider with mandatory address verification and password reset. Until then email addresses are **unverified**, so anyone local can register any address. |
| 25 | Idempotency keys: unique per (user, operation, key), bound to a SHA-256 of the canonical payload; saved result commits in the same transaction as the mutation; reuse with another payload is rejected (422) | Confirmed | A retry returns the original result even after the plan advanced. |
| 26 | Progression only in `src/server/progress.ts` under a plan row lock; DB constraints back it (one ACTIVE plan per puppy, one CURRENT level per plan, one MasteryEvent per level) | Confirmed | |
| 27 | Mastery needs a CURRENT-mode, INDEPENDENT attempt by the owner's puppy on the current level, against the latest exercise and displayed criterion version, plus a fresh plan revision. Review attempts never qualify | Confirmed | |
| 28 | Onboarding completion is idempotent (locks the puppy row; unique owner/plan constraints); new accounts are OWNER; `role` is not client-settable | Confirmed | |
| 29 | "צריך להקל?" shows a predefined easier variant stored with the exercise; no AI | Confirmed | |
| 30 | One Prisma client per process (`globalThis`) even in production | Confirmed | Next bundles routes separately; each bundle would otherwise open its own pool. |

## Password sign-in — 2026-10-31

| # | Decision | Status | Notes |
|---|---|---|---|
| 31 | Replace the email-link sign-in with email + password; remove the development inbox | Confirmed | Fewer moving parts; no mail needed locally. |
| 32 | Email verification and password reset are **not implemented** | Superseded by 34–42 | |
| 33 | Known limits: in-memory rate limiting for sign-in / sign-up / reset-password attempts (per server instance), no account lockout, no "show password" toggle | Open | The email-sending limits moved to PostgreSQL (41). Password-attempt limits are still per instance. |

## Resend email authentication — 2026-10-31

| # | Decision | Status | Notes |
|---|---|---|---|
| 34 | Resend via its REST API (`POST https://api.resend.com/emails`, `fetch`, 10 s timeout, idempotency key), no SDK dependency. Settings only from server env: `RESEND_API_KEY`, `EMAIL_FROM`, `TESTER_EMAIL` | Confirmed | Sender `onboarding@resend.dev` for the test phase. Logs carry the status and Resend error name only: never the recipient, link or key. |
| 35 | Better Auth 1.7.14 built-in flows: `requireEmailVerification`, `sendOnSignUp`, no send on sign-in, `autoSignInAfterVerification`, 1 h verification JWT; `sendResetPassword`, 1 h single-use reset token, `revokeSessionsOnPasswordReset` | Confirmed | Verification links are stateless JWTs: reusing one after verification changes nothing and creates no session (tested). Reset tokens are consumed on use. |
| 36 | Unverified accounts are blocked from all owner data: pages redirect to `/verify-email`, APIs answer 403 `EMAIL_NOT_VERIFIED`. Existing accounts are **not** auto-verified | Confirmed | Checked on every request (not only at sign-in) because sessions created before this change still exist. |
| 37 | Test phase: with Resend configured, registration is limited to `TESTER_EMAIL` in every environment (hook before `/sign-up/email` + database hook), and mail is delivered only to `TESTER_EMAIL` | Confirmed | Other recipients get the same neutral answer and no mail. Incomplete settings close registration; they never skip verification. |
| 38 | Local outbox transport (`EMAIL_TRANSPORT=outbox`) writes JSON files instead of sending; honored only on a local machine. With `LOCAL_SIGNUP=true` it keeps open local registration. e2e uses it; integration tests mock delivery | Confirmed | The old local flags alone no longer open registration: without a way to verify, an account would be unusable. |
| 39 | Enumeration and abuse: duplicate sign-up, resend and reset answers are identical for known and unknown addresses; email endpoints answer in ≥ 1 s; 3 requests per IP per minute and 3 per address per 15 min (counted for every address, so a 429 reveals nothing; storage: 41) | Confirmed | Re-registering an unverified address re-sends the link (recovers from a failed send). |
| 40 | ~~Provider failures answer 503 `EMAIL_SEND_FAILED`~~ | Superseded by 42 | A 503 happened only for an existing address, so it revealed the account. |
| 41 | Email rate limits in PostgreSQL (`EmailRateLimit`): one `INSERT … ON CONFLICT DO UPDATE … RETURNING` per counter, fixed windows on the database clock, SHA-256 keys (no address or IP stored), occasional pruning after 24 h | Confirmed | Atomic under concurrency and shared by all instances. Client IP is the first `x-forwarded-for` hop, as in Better Auth: trustworthy only behind a proxy that sets it (Vercel). The atomicity test runs on standard PostgreSQL only (CI). |
| 42 | Provider failures: `sendAuthEmail` logs the failure (no address, link or key) and never throws, so sign-up, resend and reset return exactly the answer given for an unknown address. Copy is neutral ("הבקשה התקבלה… אמור להגיע…") and never claims delivery | Confirmed | Owner decision: identical public status and body for existing and unknown accounts outrank surfacing the outage. Operators see it in the server log. |

## Cloud deployment — 2026-11-01

| # | Decision | Status | Notes |
|---|---|---|---|
| 43 | Supabase PostgreSQL used as plain PostgreSQL. Runtime `DATABASE_URL` = transaction pooler (6543); migrations use `DIRECT_URL` = session pooler (5432) through `prisma.config.ts` and are applied manually with `prisma migrate deploy` | Confirmed | The direct host is IPv6-only. The app connects as the `postgres` role, which bypasses RLS; a dedicated least-privilege role is a later hardening step. |
| 44 | Data API lock: RLS enabled without policies on every public table and `anon` / `authenticated` privileges revoked (migration `20261101120000`), guarded by an integration test | Confirmed | Better Auth sessions are not Supabase Auth sessions, so no client-side Data API access is wanted. |
| 45 | Vercel project `woffiz` (region `cdg1`, next to Supabase; Node 24). Production variables only; pushes to `feature/*` do not auto-deploy. Registration stays tester-only | Confirmed | Personal testing deployment. |

## Phase 2 — personalized AI plans — 2026-11-01

| # | Decision | Status | Notes |
|---|---|---|---|
| 46 | ~~Runtime model: Google Gemini `gemini-2.5-flash-lite` through the Gemini REST API (`generateContent`, JSON structured output), behind a provider interface (`src/server/ai`) so another provider can replace it~~ | Superseded as the default by 53 | Google's model page says the 2.5 family is served until further notice but only to users who already used it, and recommends `gemini-3.5-flash-lite` for new projects; switching is a config change (`AI_MODEL_ID`). Free-tier content is used by Google to improve products, paid-tier content is not: use a paid-tier key with a Google-side spend cap. `minLength`, `maxLength` and `uniqueItems` are ignored by structured output, so every bound is enforced by our zod and semantic validation. The Gemini adapter stays for explicit configuration. |
| 47 | ~~Spend ceiling by count, not money: 5 generations per account and 50 for the whole system per UTC day, counted atomically in PostgreSQL (`AiUsageDay`, hashed keys). The one automatic retry belongs to the same unit~~ | Superseded by 56 | A hit keeps all existing content and shows a truthful "try again tomorrow" state. Raising the limits needs no code change. |
| 48 | Generation runs inside the request that asks for it (`maxDuration = 300`: Fluid Compute is on and Hobby allows 300 s) and never inside a database transaction: job row first (one `PENDING` job per puppy, enforced by a partial unique index), provider call, validation, then one short commit. Superseded in its timing and ownership rules by 57 | Confirmed | The simplest correct design on Vercel without a queue; no workflow infrastructure for the private pilot. |
| 49 | Validation is server-side and never repairs: schema, 12-16 levels, contiguous positions, unique stable keys, prerequisites only on earlier levels, at most two same-topic levels in a row, every listed difficulty covered, minutes within the practice time, age heuristics, a vet or trainer stop condition on every exercise, banned wording (physical or aversive methods, guaranteed outcomes), no links or markup, Hebrew text, media only from the offered catalog. A failing candidate is retried once, then rejected: kept 30 days for review, nothing is created | Confirmed | The age and wording rules are initial heuristics, not a substitute for the qualified reviewer required before launch. |
| 50 | AI may only (a) append a new `ExerciseVersion` to the CURRENT level (adapt_current) or (b) replace LOCKED levels that have no attempts (revise_future). Both are owner-initiated, run under the plan row lock, require the `Plan.revision` the owner saw, and bump it. A test forbids AI code from referencing mastery or level state changes | Confirmed | Adapting invalidates a pending mastery confirmation for the previous version (`ATTEMPT_INVALID`): the owner practises the new version. No automatic background triggers in this phase. |
| 51 | A missing key or provider reports the service unavailable at onboarding; it never falls back to the fixture, to another provider or to another model. The labeled local generator (`fake`, derived from the development fixture) is used only when `AI_PROVIDER=fake` is set explicitly, on a local machine or in tests (e2e, integration) | Confirmed | Deploy this code to production only after the key is set. Amended by 53: the local generator is no longer an implicit default. |
| 56 | Daily limits (UTC), persistent and atomic in PostgreSQL (`AiUsageDay`, hashed keys, one conditional upsert per unit: `INSERT … ON CONFLICT DO UPDATE … WHERE count < max`, so exactly the maximum is ever granted under any concurrency and a refused attempt changes nothing): **3 generation/adaptation requests per account per day** (`AI_DAILY_ACCOUNT_MAX`; initial plan, adapt_current and revise_future share it) and **100 provider calls per day for the whole system** (`AI_DAILY_CALLS_MAX`; every call to the model counts, the retry is its own call, so a request costs 1 or 2; a unit is taken before the call and kept even when the call times out or its response is lost). **One active generation per puppy** (partial unique index on `PENDING` jobs, any kind). **Repeated requests reuse the stored result**: adapt and revise require an `Idempotency-Key`, the result is saved in the same transaction as the change and a repeat returns it without a job, a call or a unit, even after the plan moved on; the same key with a different request is rejected (422); a repeated onboarding completion returns the existing plan. A failed request stores no result, so its key may be retried (and costs a new unit). A request refused for lack of the call budget gives its unit back | Confirmed (owner) | Replaces the earlier 5 per account / 50 per system counts (47). Changing the limits needs no code change. |
| 57 | Job ownership and timing. **Lease and fencing:** every job has a `leaseExpiresAt` and a `generation` (fencing token). A worker renews the lease before each provider attempt and at commit; the commit transaction starts with one UPDATE (`fenceJob`) that matches only while the worker holds the current generation and a live lease, and keeps the row locked, so a worker that lost ownership commits nothing, changes nothing and refunds nothing (it answers `GENERATION_PENDING`). **Reclaim, atomically:** a retry of the same request (same key and kind) that finds an expired job with attempts left takes it over with `generation + 1` and no new charge; any other expired job of the puppy is closed (`lease-expired`); one UPDATE each, so of N simultaneous retries exactly one wins. **Attempts across workers:** an attempt is counted in the database before the call, so at most two provider attempts exist per job whichever workers run them; the SDK itself never retries. **Deadline:** one operation lasts at most two attempt timeouts + the retry delay + 30 s for validation and persistence (`operationPlan`: 45 s timeout gives 122 s, the 100 s ceiling gives 232 s), always below `maxDuration`; each attempt's timeout is cut to what remains, and the commit transaction has its own timeout. **Lease length:** attempt timeout + 30 s, so a crashed worker frees its request about 75 s after its last renewal. **Refund once:** a job that ends without a committed result (failed, rejected, stale, expired, attempts or call budget exhausted) gives its account unit back through one conditional UPDATE on `quotaRefundedAt`, on the UTC day it was charged (`quotaChargedDay`); repeated, concurrent or late-worker attempts cannot refund twice. The global provider-call budget is never refunded. **Reuse:** the client keeps one Idempotency-Key per request across retries and asks again while the answer is `GENERATION_PENDING`; an active job answers pending without a call or a charge, a finished one returns its saved result | Confirmed (owner) | Needs the migration `20261102100000_generation_job_leases`. A refund can be abused to retry for free only at the cost of the system-wide call budget (100 calls a day), which is the intended ceiling. |
| 53 | Default provider: Claude Haiku 5.5 (`claude-haiku-5-5`) through the official `@anthropic-ai/sdk` (1.3.0, pinned), Messages API with `output_config.format` (JSON schema structured output, no beta header). `ANTHROPIC_API_KEY` is server-only | Confirmed (owner) | Replaces Gemini as the default. Verified against Anthropic's models overview (`claude-haiku-5-5`: 1M context, 128K output, adaptive thinking, default effort `medium`, retirement not before 7 Oct 2027, from $0.10 / $0.50 per MTok up to 100K prompt tokens) and the structured-outputs page (Haiku 5.5 supported). |
| 54 | Claude call settings: `effort: low` with the model default adaptive thinking (thinking is billed as output). Turning thinking off was measured and rejected: faster, but 4 of 6 cases passed even after the validator-feedback retry, against 6 of 6 with adaptive thinking (docs/AI_EVALS.md). Prompt version `prompts-v2` asks for concise fields and prefers 12 levels (about 21 % faster, 18 % fewer output tokens), `max_tokens` 16 000, timeout 45 s, SDK `maxRetries: 0` so the generation job's single retry is the only one, and no `temperature`, `top_p` or `top_k` (Haiku 5.5 answers 400 to non-default values). The wire schema drops keywords the endpoint rejects (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `maxItems`, `minItems` above 1); our validation enforces them | Confirmed | A `refusal` stop reason is a non-retryable failure; `max_tokens` and 429, 5xx and 529 are retryable once. Usage reports input and output tokens only; thinking tokens are inside the output count. |
| 55 | No automatic provider or model fallback. `AI_MODEL_ID` must match the provider (`claude-*` for Claude, `gemini-*` for Gemini) or the service is disabled; a Gemini key never enables Claude | Confirmed (owner) | Haiku 5.5 has no server-side refusal fallback; a refused or failed generation keeps the answers and offers a retry. |
| 52 | Media in Phase 2 is an isolated test catalog (`MediaAsset`, `AI_TEST_MEDIA`, local and tests only). The catalog offered to the model is empty in production; `mediaId` stays null and the video placeholder remains until Phase 3 | Confirmed | Unknown or incompatible media ids are rejected by validation. |

## Provider decisions

| Area | Recommendation to evaluate | Status |
|---|---|---|
| Hosting | Vercel (native Next.js, HTTPS, previews) | Open — no account/resources created |
| Database | **Supabase** (managed PostgreSQL) or Neon, with Prisma | Open — **not needed for Phase 1**, which is verified on local PGlite plus CI PostgreSQL. See below |
| Auth | Better Auth with email + password (chosen). Resend for verification and reset (test sender, tester address only) | Confirmed for the test phase. A verified sending domain is needed before anyone but the tester can register |
| Runtime AI | Claude Haiku 5.5 via the Anthropic SDK behind a server-only adapter (decision 53); Gemini only by explicit configuration; model ID recorded per job | Chosen — needs `ANTHROPIC_API_KEY`; the spend ceiling is the daily limits (decision 47) |
| Video | AI video vendor + qualified reviewer | Open — Phase 3 |

### When a hosted database is needed (Supabase)

Not provisioned: creating a project is an account and billing decision for the owner. When it is time (a deployed pilot, Phase 4):

1. Create a Supabase project in a region close to the users; keep it on the free tier until the pilot budget is agreed.
2. Use two connection strings: the **direct** connection for `prisma migrate deploy` (`DATABASE_URL` in the migration job) and the **pooled** (Supavisor, transaction mode) one for the running app. Leave `DATABASE_POOL_MAX` unset.
3. Do not use Supabase Auth or its client libraries: authentication stays Better Auth; only the Postgres database is used. Keep Row Level Security **on** with no policies for the app tables, since the app connects server-side with its own role and enforces ownership in code.
4. Never expose the service-role key or the database URL to the browser; set them only as server environment variables.
5. Leave `APP_ENV` unset or not `local` and `LOCAL_SIGNUP` unset. Registration is then closed, or limited to `TESTER_EMAIL` when the Resend settings are present.
