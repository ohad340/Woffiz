# Demonstration media: playback QA (Phase 3E, playback-verification part)

Status legend: **PASSED (automated)** = a test runs it on every change; **PENDING** = not done yet, nobody has checked it. A row becomes PASSED only when it was actually done; record the date, device, OS/browser version and who did it.

## What the automated checks use

`test/media/playable/clip.mp4` + `poster.webp`: a **synthetic test clip, not training content**. H.264 (High) + AAC-LC mono, 1280x720, 20 s, faststart, about 1 MB. It shows a moving square, a pulsing circle, a timer, a progress bar and the label "SYNTHETIC TEST MEDIA / NOT TRAINING CONTENT". The audio is 440 Hz tones at the narrator lines and 880 Hz tones at the demonstrator lines of the `name-look` fixture bundle. There is no speech, no dog and no technique.

It was generated locally by `scripts/make-playable-fixture.mjs` (Chrome WebCodecs plus the pure-JS `mp4-muxer` package, installed with `--no-save`; no network service, no paid call) and committed, so CI needs no encoder. It is published only as a `test-fixture` bundle, which the system refuses outside a local machine or tests.

## A. Automated desktop playback (Chromium via Playwright, `e2e/demo-video.spec.ts`, project desktop-1280)

| Check | Status |
|---|---|
| Nothing autoplays; `preload="none"`, native controls | PASSED (automated) |
| Metadata loads on play: 1280x720, duration about 20 s | PASSED (automated) |
| Starting from the native control (focus + Space) plays; `currentTime` advances in real time | PASSED (automated) |
| Video and audio samples are actually decoded (`webkitVideoDecodedByteCount`, `webkitAudioDecodedByteCount` > 0) | PASSED (automated) |
| Hebrew captions track loads (6 cues, `lang=he`) and the right cue is active at the demonstrator line | PASSED (automated) |
| Playback reaches `ended` | PASSED (automated) |
| Expired signed link: first start fails, one silent refresh, next start plays | PASSED (automated) |
| Persistent failure: honest error state with retry, transcript and written instructions | PASSED (automated) |
| Watching sends no progression/plan/onboarding request and no non-GET request | PASSED (automated) |
| Transcript collapsed by default, keyboard toggle; axe, RTL and no horizontal overflow at 360/768/1280 | PASSED (automated) |
| Owner-only links (another account gets 404), published-only captions, paused/unavailable states | PASSED (automated) |

Limits of these checks:
- Chromium only, desktop, headless, with the synthetic clip. They prove the container, the signed-URL and range handling and the player logic work with a real H.264/AAC file. They say nothing about how any real clip looks or sounds.
- Headless Chromium ignored synthetic mouse clicks on the native controls, so playback is started with a real key press on the focused player. A **finger tap or mouse click on the play button is a manual check** (B1, B2).
- Decoded-byte counters prove audio is decoded, not that it is audible, well mixed or intelligible.

Layout was inspected visually (screenshots at 360/768/1280 of the exercise screen while playing, with and without the transcript, and of the admin list and detail pages). Two concrete issues were found and fixed: the transcript was always expanded (`display:flex` overrode `hidden`), and the admin tables were squeezed to one word per line at 360 px (they now scroll sideways).

## B. Manual checks (all PENDING; need real devices and, for content rows, a real clip)

| # | Check | Device / browser | Status |
|---|---|---|---|
| B1 | Finger tap on the play button starts playback; inline playback (no forced fullscreen) | iPhone Safari | PENDING |
| B2 | Same | Android Chrome | PENDING |
| B3 | Fullscreen enter/exit, rotation, controls usable one-handed | iPhone, Android | PENDING |
| B4 | Volume/mute work; silent-mode switch behaviour understood and acceptable | iPhone | PENDING |
| B5 | Hebrew captions render RTL with correct punctuation and readable size | iPhone, Android, desktop | PENDING |
| B6 | Understandable when muted (captions alone carry every instruction) | any | PENDING |
| B7 | Audible sound quality: loudness, no clipping, narrator and demonstrator clearly distinct | headphones and phone speaker | PENDING |
| B8 | Hebrew narration: pronunciation, naturalness, pacing (needs a real narrated clip) | owner | PENDING |
| B9 | Audio/video and caption sync within about 0.3 s on a real clip | any | PENDING |
| B10 | Transcript toggle with VoiceOver and TalkBack | iPhone, Android | PENDING |
| B11 | Slow network / offline: loading label, error state, retry; link refresh after the app sat open longer than the link lifetime | phone | PENDING |
| B12 | Firefox and desktop Safari playback | desktop | PENDING |
| B13 | Real training content review: each demonstrated step matches the rendered instructions; no aversive handling; puppy at ease (the admin CONTENT checklist) | owner, per clip | PENDING |

The production package for the first real pilot (script, prompts, providers and costs, assembly, local and iPhone steps) is `docs/PILOT_MOUTHING_STANDARD.md`. A bare-page phone check of a clip is `scripts/device-check-server.mjs`; it checks the clip only, not the app.

## C. Not done by design in this step

`MEDIA_REQUIRED` stays off, both real techniques stay DRAFT, nothing is approved or published, and no real clip, paid video or TTS call exists.

## D. First real pilot: what is still needed

1. Owner decisions on the draft technique defaults (numerical ranges) and approval of `mouthing-redirect-toy@1` or `name-look@1`; refresh the lock file only then.
2. Vendor choice and budget approval for video (no speech) and Hebrew TTS (two voices); confirm current prices on the official pages. One pilot clip first.
3. Produce the clip against the storyboard in `docs/PHASE_3_PLAN.md`; assemble with a local encoder to the clip spec (H.264 + AAC, faststart, 1280x720, 12-25 s) and write the manifest, Hebrew WebVTT and transcript.
4. Ingest as DRAFT (`scripts/media-ingest.ts`, no `--fixture`) and validate; the owner then watches and listens to it in full, completes both checklists, marks it reviewed and publishes in `/admin/media`.
5. Hosted private storage (`SUPABASE_*`, `MEDIA_BUCKET`) before any cloud use; re-check the REST endpoints against the current docs.
6. Run B1-B13 on real devices with the real clip and record the results here.
7. Only then consider `MEDIA_REQUIRED=true`, after the required catalog is published.
