# Woffiz (puppy-training)

Hebrew, RTL, mobile-first PWA for puppy training. Product spec: [PRD.md](PRD.md), phases: [ROADMAP.md](ROADMAP.md), UI contract: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

**Status: Phase 1 — persistent practice and progression.** Owners register and sign in with email and password, answer the onboarding questions, and get one fixed mixed-topic path. Practice reports and explicit mastery confirmations are stored on the server. The training content is **labeled development content** (not AI-generated, not reviewed) and there are no videos yet. No AI, billing, reminders or email provider (so no email verification or password reset yet).

## Run locally

Requires Node 24 (see `.nvmrc`). No Docker or PostgreSQL install is needed: development uses Prisma's local PGlite server.

```bash
npm install
cp .env.example .env        # then set BETTER_AUTH_SECRET (see the comment in the file)
npm run db:dev              # local database + migration shadow database (data persists between runs)
npm run db:migrate          # apply migrations
npm run dev
```

Open http://localhost:3000 and register with any email and a password of at least 8 characters (the address is not verified yet). **Registration is open only on a local machine**: it needs `LOCAL_SIGNUP=true`, `APP_ENV=local` **and** `BETTER_AUTH_URL` on localhost. Any deployed environment fails at least one, so nobody can register there until an email provider with mandatory verification and password reset exists (Phase 4). Existing accounts can still sign in anywhere.

Preview states with `?state=loading|empty|error|offline` (map, review) or `?state=generating|generation-error` (onboarding). Development only.

## Checks

```bash
npm run check                     # typecheck, lint, unit tests, production build
npm run db:test:dev               # second local database for tests (wiped by the suites)
npm run test:integration          # progression, idempotency, ownership, passwords and sessions — against PGlite locally
npm run test:e2e                  # Playwright at 360/768/1280: real registration and sign-in, full practice loop, axe, RTL
```

`.env` needs `TEST_DATABASE_URL` for the last two (the printed URL of `npm run db:test:dev`).

**Concurrency and row-locking tests run only on standard PostgreSQL.** PGlite serves one connection, so locally they are skipped and reported as skipped, not passed. The GitHub Actions workflow (`.github/workflows/ci.yml`) runs them against a `postgres:17` service with `TEST_DB_KIND=postgres`.

## Layout

- `prisma/` — schema and migrations (`prisma.config.ts` at the root)
- `src/server/` — server-only code: auth, progression (`progress.ts`), onboarding, idempotency, queries
- `src/app/api/` — route handlers (auth, onboarding, attempts, mastery, dev inbox)
- `src/components/` — UI (`ui`, `map`, `exercise`, `onboarding`, `auth`, `art`)
- `src/fixtures/devPlan.ts` — the labeled development plan used to create every plan
- `src/styles/tokens.css` — design tokens (keep in sync with DESIGN_SYSTEM.md)
- `test/integration/` and `e2e/` — database and browser tests
