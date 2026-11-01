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

## Provider decisions

| Area | Recommendation to evaluate | Status |
|---|---|---|
| Hosting | Vercel (native Next.js, HTTPS, previews) | Open — no account/resources created |
| Database | **Supabase** (managed PostgreSQL) or Neon, with Prisma | Open — **not needed for Phase 1**, which is verified on local PGlite plus CI PostgreSQL. See below |
| Auth | Better Auth with email + password (chosen). Resend for verification and reset (test sender, tester address only) | Confirmed for the test phase. A verified sending domain is needed before anyone but the tester can register |
| Runtime AI | Anthropic via server-only adapter; model ID chosen and recorded in Phase 2 | Open — needs API key and spend ceiling |
| Video | AI video vendor + qualified reviewer | Open — Phase 3 |

### When a hosted database is needed (Supabase)

Not provisioned: creating a project is an account and billing decision for the owner. When it is time (a deployed pilot, Phase 4):

1. Create a Supabase project in a region close to the users; keep it on the free tier until the pilot budget is agreed.
2. Use two connection strings: the **direct** connection for `prisma migrate deploy` (`DATABASE_URL` in the migration job) and the **pooled** (Supavisor, transaction mode) one for the running app. Leave `DATABASE_POOL_MAX` unset.
3. Do not use Supabase Auth or its client libraries: authentication stays Better Auth; only the Postgres database is used. Keep Row Level Security **on** with no policies for the app tables, since the app connects server-side with its own role and enforces ownership in code.
4. Never expose the service-role key or the database URL to the browser; set them only as server environment variables.
5. Leave `APP_ENV` unset or not `local` and `LOCAL_SIGNUP` unset. Registration is then closed, or limited to `TESTER_EMAIL` when the Resend settings are present.
