# Woffiz (puppy-training)

Hebrew, RTL, mobile-first PWA for puppy training. Product spec: [PRD.md](PRD.md), phases: [ROADMAP.md](ROADMAP.md), UI contract: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

**Status: Phase 0 shell.** All data is a labeled development fixture (`src/fixtures`). No auth, persistence, AI or video yet.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — routes: `/`, `/onboarding`, `/map`, `/review`, `/puppy`.
Preview states with `?state=loading|empty|error|offline` (map, review) or `?state=generating|generation-error` (onboarding).

## Checks

```bash
npm run check            # typecheck, lint, unit tests, production build
npx playwright install chromium   # once
npm run test:e2e         # RTL, overflow, axe, keyboard, reduced motion at 360/768/1280
```

## Layout

- `src/styles/tokens.css` — design tokens (keep in sync with DESIGN_SYSTEM.md)
- `src/components/ui` — Button, fields, choice cards, card/badge/skeleton, sheet, state messages
- `src/components/map` — winding level map
- `src/domain` — level types and single-path invariants
- `e2e/` — Playwright UI tests
