# Puppy Training App Design System
Version: 1.0 | 2026-10-29 | Status: proposed implementation specification
Confirmed direction: playful and polished, pleasant colors, winding path, small animations.
All numeric tokens, exact colors and component details below are proposed defaults.
Product language: Hebrew only. Engineering documentation: English.

## 1. Design goal
Help puppy owners immediately identify the next practice action and feel comfortable repeating a difficult exercise. The map communicates progress without pressuring owners to rush their puppy. Use original visual assets, not copied Candy Crush branding.

## 2. Visual language
Warm, clear, rounded, calm and lightly playful.
Use generous whitespace, simple outlined icons and restrained success animation.
One primary action per screen. Keep operational AI/provider details out of ordinary screens.
Avoid dense dashboards, neon gradients, excessive confetti and guilt-inducing streak loss.
Dark mode is deferred.

## 3. Color tokens
| Role | CSS token | Value | Use |
|---|---|---|---|
| Primary | --color-primary | #17624F | Main buttons with white text |
| Primary pressed | --color-primary-hover | #104B3D | Hover/pressed |
| Secondary | --color-secondary | #DDF2E8 | Mint surfaces with dark text |
| Accent | --color-accent | #F2AD69 | Small warm accents with dark text |
| Background | --color-bg | #FBF8F1 | Cream page |
| Surface | --color-surface | #FFFFFF | Cards and forms |
| Text | --color-text | #202B26 | Default text |
| Muted | --color-text-muted | #59645F | Supporting text |
| Border | --color-border | #7C8982 | Meaningful input/control boundaries |
| Subtle border | --color-border-subtle | #E0E6E1 | Decorative dividers only |
| Success | --color-success | #17624F | Check icon and completion text |
| Warning | --color-warning | #865000 | Warning text/icons on cream |
| Error | --color-error | #B42318 | Errors on white |
| Info | --color-info | #285B86 | Informational text/icons |
| Focus | --color-focus | #285B86 | Visible focus ring |

Verify final combinations: 4.5:1 normal text, 3:1 large text and meaningful controls.
Mint and orange are background accents, not body text on white.
Locked levels remain readable; communicate lock with an icon and a label, not opacity alone.

## 4. Typography
Proposed font: locally hosted Heebo, with Arial and sans-serif fallback.
Use one family, weights 400, 500 and 700. Obtain the font and license during implementation.
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
Primary navigation: map (המפה), review (חזרה), puppy (הגור שלי).
Review lists completed levels; it is not a separate topic path.
Settings live under puppy. Administrator tools are separate and access-controlled.
Do not add a chat tab, shop, leaderboard or topic tabs.

## 8. Screen composition
### Welcome and sign-in
Brief value statement, one sign-in action and plain privacy/support links.
No unsupported success statistics or trainer endorsements.

### Onboarding
One short group of related inputs per step: puppy basics, current skills, difficulties.
Show progress and back action. Save partially completed answers.
Allow uncertain age/experience and visibly label optional fields.
Use a summary step before plan creation. Do not repeat questions already answered.

### Map
Top: puppy name and small profile/avatar; no mandatory photo.
Below: current-level summary and “ממשיכים לתרגל”.
Main area: one winding vertical path with alternating offsets; only vertical scrolling.
Each node includes level number, short topic label and state symbol.
Current node has a strong ring; completed has a check; locked has a lock.
Use a decorative SVG curve behind semantic buttons, not a canvas-only interface.
DOM order is level order regardless of visual offsets. Hide decorative path from assistive technology.
Center the current region on return without stealing keyboard focus.
For long plans, render a bounded segment and provide accessible load-earlier/load-later controls.
Locked nodes can explain “השלימו את השלב הקודם כדי לפתוח”; they cannot start exercises.
At 200% zoom or narrow layouts, switch to an ordered vertical list without losing content.

### Exercise
Order: back/title, goal, captioned video, preparation, numbered steps, mastery criterion.
Expose a secondary “צריך להקל?” action when a compatible easier variant exists.
Bottom primary action: “תרגלנו”. It opens feedback and does not complete the level.
Display suggested duration without countdown pressure.
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
Bottom nav: three labeled destinations; active state has icon plus text.
Video: poster, native or equivalently accessible controls, Hebrew captions and transcript toggle.
Map node: 64px nominal circle; label area permits wrapping and never overlaps adjacent nodes.
Do not rely on tooltips for essential mobile instructions.

## 10. Iconography and motion
Proposed library: Lucide, 2px stroke, 20px or 24px icons.
Mirror directional navigation in RTL; do not mirror media playback controls or checks.
Transitions: 150ms for buttons, 220ms for panels, 400ms maximum unlock emphasis.
No autoplay audio, looping bounce or required animation to understand state.
Respect prefers-reduced-motion: immediate state changes with a static success message.
Announce new unlocks with a polite live region.

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
| Plan creation | No plan yet | Preparing plan | First level | Retry with saved profile |
| Map | Onboarding action | Stable shell | Current frontier | Reload without resetting |
| Video | Unavailable notice | Poster and spinner | Playback | Transcript and retry |
| Feedback | No option selected | Saving, no duplicate submit | Recorded/unlocked | Retain selection, retry |
| Review | No completed levels | List skeleton | Completed exercises | Retry list |
| Profile | Missing optional fields | Saving | Updated | Retain edits |
| Entire app offline | Cached shell only | No fake progress | Reconnected | Connection notice |

## 15. Remaining design decisions
Final app name, logo and puppy illustration style remain open.
Current tokens are proposed and sufficient to begin Phase 0.
Do not block scaffolding on branding; use a clearly labeled working title.
Any later change to navigation or mastery behavior must also update PRD.md.

