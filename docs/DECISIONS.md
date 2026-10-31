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
| 6 | PWA: Next built-in `app/manifest.ts`; placeholder PNG icons generated at build by `ImageResponse`, labeled "DEV" | Proposed | No service worker in Phase 0 — public-asset caching is Phase 4. |
| 7 | Tests: Vitest 5 (domain rules), Playwright 1.64 + axe-core at 360/768/1280 | Proposed | `npx playwright install chromium` once per machine. |
| 8 | All exact versions pinned (`--save-exact`); Node 24 in `.nvmrc`, `>=20.9` in engines | Proposed | |
| 9 | Dev state preview via `?state=` (loading, empty, error, offline, generating, generation-error) | Proposed | Development-only; remove or gate before any public deployment. |
| 10 | Working title "אילוף גורים (שם זמני)" in `src/lib/app.ts`; package `puppy-training` | Proposed | Final brand is open. |
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

## Provider decisions (not needed for Phase 0)

| Area | Recommendation to evaluate | Status |
|---|---|---|
| Hosting | Vercel (native Next.js, HTTPS, previews) | Open — no account/resources created |
| Database | Managed PostgreSQL (e.g. Neon or Supabase) + Prisma | Open — Phase 1 |
| Auth | Email magic link (Auth.js + email provider, or Supabase Auth) | Open — Phase 1 |
| Runtime AI | Anthropic via server-only adapter; model ID chosen and recorded in Phase 2 | Open — needs API key and spend ceiling |
| Video | AI video vendor + qualified reviewer | Open — Phase 3 |

No paid resources were provisioned.
