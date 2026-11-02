# Woffiz (puppy-training)

Hebrew, RTL, mobile-first PWA for puppy training. Product spec: [PRD.md](PRD.md), phases: [ROADMAP.md](ROADMAP.md), UI contract: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

**Status: Phase 1 — persistent practice and progression.** Owners register and sign in with email and password, answer the onboarding questions, and get one fixed mixed-topic path. Practice reports and explicit mastery confirmations are stored on the server. The training content is **labeled development content** (not AI-generated, not reviewed) and there are no videos yet. No AI, billing or reminders. Email (Resend) is used only for **mandatory address verification and password reset**, and during the test phase only for `TESTER_EMAIL`.

## Run locally

Requires Node 24 (see `.nvmrc`). No Docker or PostgreSQL install is needed: development uses Prisma's local PGlite server.

```bash
npm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (see the comment in the file)
npm run db:dev              # local database + migration shadow database (data persists between runs)
npm run db:migrate          # apply migrations
npm run dev
```

Open http://localhost:3000. **Every account must verify its email address** before it can sign in or reach any owner data; accounts created before verification existed are not marked verified and must verify too (sign-in → "לשליחת קישור חדש").

### Authentication email

All email settings are server-only environment variables (see `.env.example`). Pick one:

| Mode | Settings | Who can register | Where mail goes |
|---|---|---|---|
| **Resend** (test phase) | `RESEND_API_KEY`, `EMAIL_FROM`, `TESTER_EMAIL`, `BETTER_AUTH_URL` | only `TESTER_EMAIL`, in every environment, enforced on the server (direct API calls too) | only `TESTER_EMAIL`; other addresses get the same neutral answer and no mail |
| **Local outbox** | `EMAIL_TRANSPORT=outbox` (+ `LOCAL_SIGNUP=true`, `APP_ENV=local`, localhost `BETTER_AUTH_URL`) | any address, this machine only | JSON files in `EMAIL_OUTBOX_DIR` (default `.email-outbox/`, git-ignored); open the `url` field to follow a link |
| **None** | anything else | nobody (registration closed) | nothing |

Missing or partial email settings never open registration or skip verification. The outbox is ignored outside a local machine.

Resend setup for the test phase:

1. Create an API key in Resend (sending access is enough). Do not verify a domain yet.
2. In `.env`: `RESEND_API_KEY=re_…`, `EMAIL_FROM="Woffiz <onboarding@resend.dev>"`, `TESTER_EMAIL=<the address of your Resend account>` (the shared `onboarding@resend.dev` sender only delivers to that address), and remove `EMAIL_TRANSPORT` if set.
3. Restart `npm run dev` (settings are read at startup).

Links in emails always use `BETTER_AUTH_URL` (which is also the only trusted origin). Verification links last one hour and sign the owner in once; reset links last one hour, work once and sign out every device. Sign-up, resend and reset requests are limited to 3 per IP per minute and 3 per address per 15 minutes. The counters live in PostgreSQL (`EmailRateLimit`, hashed keys only), so every server instance shares them. Every answer to these requests takes at least one second. A provider failure is logged on the server and the owner gets the same neutral answer as for an unknown address; the screens never claim that a message was sent ("אמור להגיע…").

Preview states with `?state=loading|empty|error|offline` (map, review) or `?state=generating|generation-error` (onboarding). Development only.

## AI plans (Phase 2)

Plans are generated on the server by `src/server/ai` and validated before anything is stored (decisions 46-52). Mastery stays with the owner: AI code can only add a new version of the current exercise or replace locked future levels, and a test forbids it from touching mastery.

- **Provider**: Claude Haiku 5.5 (`claude-haiku-5-5`) through the official Anthropic SDK is the default (decision 53). Set `ANTHROPIC_API_KEY` in the ignored `.env` (see `.env.example`); the key is server-only. There is no automatic fallback to another provider or model: without the key the service reports itself unavailable. Gemini remains available for explicit configuration only (`AI_PROVIDER="gemini"`, `GEMINI_API_KEY`).
- **Local development and tests** can use the labeled local generator (`AI_PROVIDER=fake`, explicit; honored only on a local machine or in tests, and used by the e2e and integration suites). It is not a model. `AI_FAKE_MODE=fail|invalid|slow` exercises the failure screens.
- **Limits** (UTC days, persistent and atomic in PostgreSQL, so shared by every server instance): **3** generation/adaptation requests per account (`AI_DAILY_ACCOUNT_MAX`) and **100** calls to the model for the whole system (`AI_DAILY_CALLS_MAX`). Initial plans, adaptations and revisions share the 3. Only one generation can be active per puppy.
- **Timing and recovery** (decision 57): the plan routes run up to 300 s (`maxDuration`). One operation is at most two provider attempts (the SDK never retries) plus a short delay, bounded by a deadline (`2 x AI_TIMEOUT_MS + retry delay + 30 s`, so 122 s by default; `AI_TIMEOUT_MS` is capped at 100 s). A running job holds a lease that it renews; if its worker dies the lease expires (about 75 s) and the same request, asked again with the same `Idempotency-Key`, takes the job over. A worker that lost ownership can never commit.
- **Refunds and reuse:** a job that ends without a committed result gives the account's unit back once; provider calls are never refunded. A repeated request returns the stored result (or "pending" while the job runs) without another model call or charge. Saved plans are never touched by a refused or failed request.
- **Evaluation**: `docs/AI_EVALS.md`. `npm run ai:ping` makes one minimal access check; `npm run ai:eval` calls the live model once per case (a few cents) and records the outputs in `test/ai/recorded/<model>/`; the normal test run re-validates the recordings offline.
- **Deploying**: apply the new migration to Supabase with `prisma migrate deploy`, then set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL_ID`) in Vercel production before redeploying; leave `AI_PROVIDER` unset or `anthropic`.

## Deployment (Vercel + Supabase, tester only)

Hosting is Vercel (project `woffiz`, region `cdg1`, Node 24) and the database is Supabase PostgreSQL (eu-west-3). Authentication stays Better Auth with Prisma; Supabase Auth and the Supabase client libraries are not used.

- **Runtime `DATABASE_URL`**: the Supabase *transaction* pooler (port 6543). The app uses `@prisma/adapter-pg`, so the old `?pgbouncer=true` flag is not needed. Leave `DATABASE_POOL_MAX` unset.
- **Migrations `DIRECT_URL`**: the *session* pooler (port 5432), which `prisma.config.ts` prefers over `DATABASE_URL`. Apply migrations by hand with `prisma migrate deploy` (never `migrate reset` or `db push`), not during the Vercel build. Keep both strings, with the database password, in an ignored file such as `.env.cloud.local`.
- **Production variables** (set in Vercel, never committed): `DATABASE_URL`, `BETTER_AUTH_SECRET` (fresh, never reused from local), `BETTER_AUTH_URL` (the stable HTTPS address; also the only trusted origin and the base of every emailed link), `RESEND_API_KEY`, `EMAIL_FROM`, `TESTER_EMAIL`. Do **not** set `APP_ENV`, `LOCAL_SIGNUP`, `EMAIL_TRANSPORT`, `EMAIL_OUTBOX_DIR`, `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL` or `TEST_DB_KIND`.
- **Data API lock**: the app tables are private. Migration `20261101120000_lock_public_data_api` enables Row Level Security without policies and revokes the `anon` and `authenticated` roles. A new table needs the same in its migration; `test/integration/data-api-lock.test.ts` fails otherwise.
- **Never run the integration or e2e suites against Supabase**: they truncate tables. Keep `TEST_DATABASE_URL` on the local `woffiz-test` database or CI PostgreSQL.
- Registration stays limited to `TESTER_EMAIL` while Resend is configured, and the sender is the shared `onboarding@resend.dev` (messages may land in spam). A verified sending domain is needed before anyone else can register.

## Checks

```bash
npm run check                     # typecheck, lint, unit tests, production build
npm run db:test:dev               # second local database for tests (wiped by the suites)
npm run test:integration          # progression, idempotency, ownership, passwords, sessions, verification and reset (email mocked)
npm run test:e2e                  # Playwright at 360/768/1280: registration + emailed links (local outbox), reset, practice loop, axe, RTL
```

`.env` needs `TEST_DATABASE_URL` for the last two (the printed URL of `npm run db:test:dev`).

Locally, if PGlite drops connections under parallel load (`ConnectionClosed`, `P2028`), restart it (`npm run db:test:stop && npm run db:test:dev`) and use `npm run test:e2e -- --workers=2`. No test ever sends real email.

**Concurrency and row-locking tests run only on standard PostgreSQL.** PGlite serves one connection, so locally they are skipped and reported as skipped, not passed. The GitHub Actions workflow (`.github/workflows/ci.yml`) runs them against a `postgres:17` service with `TEST_DB_KIND=postgres`.

## Layout

- `prisma/` — schema and migrations (`prisma.config.ts` at the root)
- `src/server/` — server-only code: auth, email (`email/`: config, Hebrew templates, Resend/outbox transport, request guard), progression (`progress.ts`), onboarding, idempotency, queries
- `src/app/api/` — route handlers (auth, onboarding, attempts, mastery)
- `src/components/` — UI (`ui`, `map`, `exercise`, `onboarding`, `auth`, `art`)
- `src/fixtures/devPlan.ts` — the labeled development plan used to create every plan
- `src/styles/tokens.css` — design tokens (keep in sync with DESIGN_SYSTEM.md)
- `test/integration/` and `e2e/` — database and browser tests

## Reviewed demonstration media (Phase 3, slice 3A: foundations only)

Plan: [docs/PHASE_3_PLAN.md](docs/PHASE_3_PLAN.md); decisions 58-67. Slice 3A adds the technique catalog (`src/domain/techniques`, both techniques are **draft**), the media schema with database integrity rules, bundle validation (MP4 metadata, Hebrew WebVTT, voice/caption/transcript agreement, fingerprints), a private storage adapter, administrator checks and a draft-only ingest command. There are **no videos, no admin pages, no player and no publication yet**; exercises still show the "no demonstration" placeholder.

```bash
npx tsx scripts/grant-admin.ts --email you@example.com      # owner only, by hand; prints the database host
npx tsx scripts/media-ingest.ts <folder> --admin-email you@example.com   # DRAFT only; add --fixture for synthetic test bundles (local machine only)
```

Automated checks are **metadata validation**: they cannot tell whether the voice is intelligible Hebrew or whether picture and sound line up. That is the owner's review of the actual clip. Real-device playback checks are pending (slice 3E).
