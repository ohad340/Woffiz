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

Links in emails always use `BETTER_AUTH_URL` (which is also the only trusted origin). Verification links last one hour and sign the owner in once; reset links last one hour, work once and sign out every device. Resend and reset requests are limited to 3 per IP per minute and 3 per address per 15 minutes, every answer to them takes at least one second, and a provider failure is reported as an error (503), never as "sent".

Preview states with `?state=loading|empty|error|offline` (map, review) or `?state=generating|generation-error` (onboarding). Development only.

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
