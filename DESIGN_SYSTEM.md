# Puppy Training App Design System
Version: 2.0 | 2026-10-31 | Status: implemented in the shell (v2 "playful adventure")
Confirmed direction: colorful cartoon adventure game look (owner reference mockup, 2026-10-31),
bright sky, green landscape, warm yellow CTA, a recurring puppy mascot, winding climbing trail.
v2 replaces the v1 cream/dark-green palette and three-tab navigation.
All numeric tokens, exact colors and component details below are proposed defaults.
Product language: Hebrew only. Engineering documentation: English.

## 1. Design goal
Help puppy owners immediately identify the next practice action and feel comfortable repeating a difficult exercise. The map communicates progress without pressuring owners to rush their puppy. Use original visual assets, not copied branding from any existing game.

## 2. Visual language
Bright, rounded, cartoon-illustrated and game-like, but calm in motion.
Illustrations are original inline SVG (mascot, hills, trees, river, bridge, trophy) with soft gradients.
Chunky "3D" controls: a darker lip under buttons, tiles and map medallions.
One primary action per screen. Keep operational AI/provider details out of ordinary screens.
Avoid dense dashboards, neon gradients, excessive confetti and guilt-inducing streak loss.
Dark mode is deferred.

## 3. Color tokens
Source of truth in code: `src/styles/tokens.css`.
| Role | CSS token | Value | Use |
|---|---|---|---|
| CTA | --color-cta / --color-cta-edge / --color-on-cta | #FFC22E / #E08A00 / #3D2600 | Main action (yellow, dark text, 3D lip) |
| Primary | --color-primary / --color-primary-hover | #1F6FD1 / #1858A8 | Links, secondary buttons, active nav |
| Sky surface | --color-secondary | #D9EFFF | Light surfaces, active nav pill |
| Background | --color-bg | #E4F4FE | Page (with a sky gradient at the top) |
| Surface | --color-surface | #FFFFFF | Cards, sheets, forms |
| Text / muted | --color-text / --color-text-muted | #1D2B3A / #4E5D6C | Body and supporting text |
| Success / warning / error / info | --color-success etc. | #19703A / #8A5300 / #B42318 / #1F5FAE | Status text and icons |
| Focus | --color-focus | #1F5FAE | 3px focus ring |
| Scene | --scene-* | sky, grass, path, water, wood | Illustrations only |
| Tiles | --card-green/purple/blue/orange | #158A5E / #7046D6 / #1F6FD1 / #B4540A | Home tiles, white text (4.5:1 or better) |
| Map medallions | --node-* and per-tone variables | gold, blue, green done; orange current; grey locked | Level nodes |

Verify combinations: 4.5:1 normal text, 3:1 large text and meaningful controls (axe runs in e2e).
Text on illustrated backgrounds sits on solid plaques, signs or white outlines.
Locked levels remain readable; communicate lock with an icon and a label, not opacity alone.

## 4. Typography
Proposed font: locally hosted Heebo, with Arial and sans-serif fallback.
Use one family, weights 400, 500, 700 and 800 (800 for display titles, buttons and tiles). Obtain the font and license during implementation.
| Style | Size | Weight | Line height |
|---|---|---|---|
| Page title | 28px / 1.75rem | 700 | 1.3 |
| Section title | 22px / 1.375rem | 700 | 1.4 |
| Card title | 18px / 1.125rem | 700 | 1.4 |
| Body | 16px / 1rem | 400 | 1.6 |
| Supporting text | 14px / .875rem | 400 | 1.5 |
| Button label | 16px / 1rem | 700 | 1.4 |
| Small badge | 12px / .75rem | 500 | 1.5 |
Do not put essential instructions in small badges.
Limit instruction paragraphs to approximately 60 characters per line on wide screens.

## 5. Spacing and layout
Base unit: 4px.
Spacing tokens: --space-1=4px, --space-2=8px, --space-3=12px,
--space-4=16px, --space-6=24px, --space-8=32px, --space-12=48px.
Mobile page gutter: 20px; use 16px at 360px and below.
Main exercise/form width: at most 560px. Map width: at most 640px.
Desktop content shell: at most 1120px, centered.
Content must clear sticky controls and bottom navigation with safe-area padding.
Use content-driven heights, not fixed text containers.

## 6. Radius and elevation
| Token | Value | Use |
|---|---|---|
| --radius-sm | 12px | Inputs, small surfaces |
| --radius-md | 16px | Buttons and cards |
| --radius-lg | 24px | Sheets and large panels |
| --radius-full | 9999px | Avatar and map nodes |
| --shadow-card | 0 4px 16px rgba(32,43,38,0.06) | Elevated cards |
| --shadow-overlay | 0 12px 32px rgba(32,43,38,0.14) | Dialogs |
Prefer borders and spacing over stacking multiple shadows.

## 7. Information architecture
Primary navigation: home (בית), map (המפה), review (חזרה), puppy (הגור שלי).
Review lists completed levels; it is not a separate topic path.
Settings live under puppy. Administrator tools are separate and access-controlled.
Do not add a chat tab, shop, leaderboard, rewards/prizes tab or topic tabs. No coins, stars or prizes
unless real data and an approved feature exist; the reference art's coins and prize chest are omitted.

## 8. Screen composition
### Welcome and sign-in
Brief value statement, one sign-in action and plain privacy/support links.
No unsupported success statistics or trainer endorsements.
Sign-in offers a "שכחתי סיסמה" link. Registration leads to "בדקו את תיבת הדואר", never straight into the app.

### Account screens (verify email, forgot / reset password)
Same frame for all: logo linking home, one white card (`--radius-lg`, 20px padding), one h1, at most one CTA.
Notices: success on `--color-secondary` with body text (`role=status`), errors on the error fill (`role=alert`).
Every failure names the next action (send a new link, request a new reset link, back to sign-in).
Answers about an address are neutral: never say whether an account exists. Emails are isolated with `dir=ltr`.
Authentication emails are Hebrew RTL HTML with a plain-text part; they copy the token values by hand
(CTA yellow with lip, sky background, white card) because email clients cannot read CSS variables.

### Onboarding
One short group of related inputs per step: puppy basics, current skills, difficulties.
Show progress and back action. Save partially completed answers.
Allow uncertain age/experience and visibly label optional fields.
Use a summary step before plan creation. Do not repeat questions already answered.

### Home
Full-bleed sky scene: profile row (mascot avatar, puppy name, real progress chip), outlined title,
waving mascot and a wooden sign. Yellow CTA “המשך לאימון” opens the current level on the map.
White sheet below with 2x2 colored tiles: map progress, review, today's exercise, puppy.

### Map
The map is the owner's painted adventure artwork (`public/art/map-painted.webp`) with sign, trophy, puppy,
river, bridge and doghouse. It shows a window of eight levels at a time, bottom to top, on eight fixed places
along the painted path. Real level buttons are laid over those places (covering the artwork's own markers) and
a pager ("הצגת שלבים קודמים / הבאים") slides the window along the plan; the window opens around the current level.
Medallions: green/blue/purple for completed (with a check), larger orange with a halo for current, grey lock
sprite for locked; a small "שלב N" plaque under each. Titles and state are in each button's accessible name and
in the level sheet. The artwork is decorative (aria-hidden); DOM order is level order.
Locked nodes explain “השלימו את השלב הקודם כדי לפתוח” and cannot start exercises.
Stars from the artwork are covered: there is no star data.

### Exercise
Order: back/title, goal, captioned video, preparation, numbered steps, mastery criterion.
Expose a secondary “צריך להקל?” action when a compatible easier variant exists.
Bottom primary action: “תרגלנו”. It opens feedback and does not complete the level.
Display suggested duration without countdown pressure.
After two or more reports on the current version that were not independent, add a secondary “להתאים את התרגיל” action. It asks the server for an easier version of this exercise only; a status note explains the change, and mastery is still confirmed by the owner on the new version.
Video ratio follows the asset; do not crop dog, handler or reward to fit a decorative frame.

### Feedback
Three full-width radio cards: “הצליח לבד”, “הצליח עם עזרה”, “עדיין מתקשה”.
Selecting independent success reveals the concrete mastery criterion and an unchecked confirmation.
Provide “כן, שולט בתרגיל לפי הקריטריון” and a clear “עוד לא” option.
Submit must distinguish practice-only from explicit mastery, with an accurate button label.
Disable duplicate submission while saving; keep the selection if saving fails.
Show the unlock celebration only after server-confirmed completion.

### Review and final completion
Review uses completed-level cards and a visible “תרגול חוזר” label.
Review submissions cannot change the active frontier.
Completion page summarizes completed practice and offers “חוזרים לתרגל”.
Do not label a puppy “fully trained” or objectively certified.

### Puppy and settings
The path card offers “לעדכן את המשך המסלול”: the server rebuilds only the locked future levels; completed levels and the current level do not change.
Edit profile, view recent practice and manage account.
Profile changes do not erase history; explain when locked future levels will be refreshed.
Account deletion uses a confirmation dialog with an honest scope statement.

## 9. Components and states
Buttons: primary filled, secondary outlined, ghost and destructive.
Default minimum height 48px; main mobile CTA 52px. Touch area at least 44px.
States: default, hover, pressed, visible focus, disabled and loading with stable width.
Inputs: permanent visible label above, helper/error below; validate on blur and submit.
Cards: 20px padding, 16px radius; clickable cards use semantic links/buttons.
Dialogs/sheets: named heading, focus trap, Escape dismissal where safe, focus restoration.
Feedback: radio group with accessible group label; selection uses border and check, not color alone.
Toasts: noncritical success only; durable errors remain inline until resolved.
Bottom nav: four labeled destinations on a rounded white bar; active state has a tinted icon pill plus bold text.
Video: poster, native controls (including volume and mute), Hebrew voice guidance, Hebrew captions and transcript toggle. Playback starts only after a tap; no autoplay and no loop. The loading state is a static "loading" label (no spinner, because there are no looping animations). Unavailable, paused-for-review and playback-error states keep the written instructions and the transcript visible and never mention sources, review or AI quality.
Map node: 72px nominal circle (86px current); label area permits wrapping and never overlaps adjacent nodes.
Do not rely on tooltips for essential mobile instructions.

## 10. Iconography and motion
Proposed library: Lucide, 2px stroke, 20px or 24px icons.
Mirror directional navigation in RTL; do not mirror media playback controls or checks.
Transitions: 150ms for buttons, 220ms for panels, 400ms maximum unlock emphasis.
No looping animations at all (owner feedback 2026-10-31): no idle wagging, waving,
pulsing halos, drifting clouds or pop-ins. Allowed: press feedback (button sinks onto its lip),
panel transitions and a one-time unlock emphasis after server-confirmed mastery.
No autoplay audio or required animation to understand state.
Respect prefers-reduced-motion: immediate state changes with a static success message.
Announce new unlocks with a polite live region.

## 10a. Mascot and artwork
Source: the owner's reference mockup and supplied asset sheets (dog_training_map_assets.zip).
Home hero and the round puppy portrait are crops of the mockup; the map is the supplied painted map;
the locked medallion is cut from the markers sheet. Sources are low resolution (upscaled 2x); replace with
original high-resolution art before launch. All art is decorative (alt="" / aria-hidden).

## 11. Responsive rules
| Width | Behavior |
|---|---|
| Below 640px | Single column, bottom nav, full-width feedback options |
| 640–1023px | Centered 560–640px main area, wider side gutters |
| 1024px and above | Compact top navigation; centered map; exercise may place steps beside video |
At 320px, all controls and text remain accessible without horizontal page scrolling.
At 200% zoom, navigation and map labels reflow.
Do not stretch a phone map across an entire desktop screen.
Sticky elements must not obscure focused inputs, captions or validation messages.

## 12. Accessibility and Hebrew RTL
Set html lang=he and dir=rtl. Prefer logical CSS properties.
Right-align prose; isolate emails, URLs and technical identifiers with bidi boundaries.
Format dates in he-IL and store timestamps consistently.
Use semantic headings, landmarks, ordered steps and accessible names.
Provide a 3px focus ring with 2px offset; test it on every surface.
Announce save errors and state changes; move focus only when navigation requires it.
Hebrew captions and transcript are required for all published demonstrations.
Do not cache private pages as public content.
Verify keyboard flow, screen reader announcements, contrast and reduced motion.

## 13. UX principles
1. Always make the next permitted action visible.
2. Keep mastery and practice completion distinct.
3. Treat repetition as normal progress, not failure.
4. Preserve completed history and owner input.
5. Explain locks and errors with a concrete next action.
6. Keep AI background processing truthful and unobtrusive.
7. Reward learning without pressuring speed.
8. Ensure every playful screen has an accessible semantic equivalent.

## 14. State matrix
| Surface | Empty | Loading | Success | Failure |
|---|---|---|---|---|
| Onboarding | Start profile | Save indicator | Summary | Retain input and mark field |
| Plan creation | No plan yet | Preparing plan (focused heading, skeleton, up to about a minute) | First level | Retry with saved profile; daily limit explained with no retry; unavailable service explained |
| Map | Onboarding action | Stable shell | Current frontier | Reload without resetting |
| Video | Unavailable notice (instructions stay) | Poster and static loading label | Tap-to-play with captions and sound | Transcript and retry |
| Feedback | No option selected | Saving, no duplicate submit | Recorded/unlocked | Retain selection, retry |
| Review | No completed levels | List skeleton | Completed exercises | Retry list |
| Profile | Missing optional fields | Saving | Updated | Retain edits |
| Entire app offline | Static offline page when a page cannot load (`public/offline.html`) | No fake progress | Reconnected: "ניסיון חוזר" reloads the same page | Connection notice; the offline page with "ניסיון חוזר" |

Offline page: `public/offline.html` must work with no network, so it is self-contained. It copies the
token values it uses into its own `:root` (kept identical to `src/styles/tokens.css` by `src/lib/offline-page.test.ts`),
inlines the Lucide Wi-Fi-off icon, and renders in the Arial fallback of the font stack when Heebo is unavailable.
It follows the StateMessage layout: warning icon, page title, muted body, one full-width CTA.

## 15. Remaining design decisions
Final app name, logo and puppy illustration style remain open.
Current tokens are proposed and sufficient to begin Phase 0.
Do not block scaffolding on branding; use a clearly labeled working title.
Any later change to navigation or mastery behavior must also update PRD.md.

