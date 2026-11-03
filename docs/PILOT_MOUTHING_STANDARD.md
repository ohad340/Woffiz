# Pilot production package: `mouthing-redirect-toy@1` STANDARD

Prepared 2026-11-03. **Nothing here was generated, approved, published or paid for.** The technique is still `draft` (`techniques.lock.json` is `{}`), `MEDIA_REQUIRED` is off, and one successful pilot does not change that: it stays off until the required catalog coverage exists.

Everything under "Verified" below was read from the named official page on 2026-11-03. Anything I could not read is marked **unverified**.

## 1. Sources: what was actually read

| Source | How it was read | Date/status of the source |
|---|---|---|
| Dogs Trust, "Mouthing, nipping and puppy biting" (https://www.dogstrust.org.uk/dog-advice/unwanted-behaviours/stop-your-dog-chewing-mouthing) | Raw HTML downloaded and its full text extracted; the relevant sections read line by line | Live page; no publication date was read |
| RSPCA (UK), "Understanding mouthing and play-biting behaviour" (rspca.org.uk PDF) | Whole PDF extracted with `pdftotext` and read | "Last updated: November 2015", adopter leaflet |
| Dogs for Good, "Puppy biting, nipping, and mouthing" (family dog programme PDF) | Whole PDF extracted with `pdftotext` and read | 2015 handout |

Not read: the owner has not read them yet. They are recorded in the catalog as `extracted-text` ("full text extracted and read by the assistant, not by the owner"), a new label that is distinct from `fetched-summary` and from `owner-read`. The admin screen shows it in Hebrew.

A correction to earlier work: the first tool summary of the Dogs Trust page contained a claim ("activities around ten minutes") that is **not on the page**. The earlier `fetched-summary` label was therefore right to be cautious. The summary in the catalog was rewritten from the raw text.

### What the sources actually say

| Topic | Dogs Trust | RSPCA UK | Dogs for Good |
|---|---|---|---|
| Don't pull the hand away fast | Yes: it turns into a game | Implied: "keep that part of your body still" | Yes: stand very still when the puppy holds clothing |
| Redirect to a toy | "Stay still and redirect when there's a brief pause"; "Redirect your dog's mouth onto an age-appropriate toy or dog-safe chew" | "Distract them **at once** by offering a toy instead"; keep a toy in your hand; keep it interesting by moving it | "When they let go redirect them onto something suitable" |
| Praise chewing the toy | "Praise them well" | Implied (toys more fun than hands) | "Praise them verbally" |
| Don't | Raised voices, pushing down, pulling clothing away | Don't smile or laugh at the mouthing; no rough games without toys | Nothing aversive, no shouting, no scruff, no hands/arms as toys |
| Seconds, repetitions, mastery criterion | **None** | **None** | **None** |

**Divergence the owner should know about.** Dogs Trust's own numbered ladder is different from our sequence: stay still; *drop or hide a toy you are holding*; turn away with crossed arms; step away; reward calm. RSPCA UK and Dogs for Good (and Dogs Trust's "redirect" section) support offering a toy during the mouthing. Our STANDARD sequence follows the redirect guidance. It is a synthesis, not a copy of any single page.

## 2. Exact proposed content (from `src/domain/techniques/catalog.ts`, unchanged)

Hebrew text is what users will see. "Supported" means at least one source above says it; "Product default" means no source gives it and the owner must decide.

### Steps (demonstrated in this order)

| # | Id | Hebrew instruction | Status |
|---|---|---|---|
| 1 | `stay-still` | כשהגור נוגס ביד או בבגדים, לא מושכים את היד במהירות. נשארים במקום בלי תנועה כ-{stillSeconds} שניות. | Staying still and not pulling away: **supported** (3 sources). The number of seconds: **product default** (RSPCA says "at once", Dogs Trust "a brief pause", Dogs for Good "when they let go") |
| 2 | `offer-toy` | מקרבים לפה של הגור צעצוע מתאים. | **Supported** (RSPCA, Dogs Trust, Dogs for Good) |
| 3 | `praise-chewing` (demonstrator says a praise line) | כשהגור לועס את הצעצוע, משבחים אותו בקול רך. | Praising chewing the toy: **supported**. "In a soft voice": **product default** consistent with the sources' warnings against raised voices |

Preparation (supported): צעצוע רך או חפץ לעיסה מתאים לגור; עוד צעצוע בהישג יד. (Dogs Trust: right size, dog-safe, no small parts or batteries; keep toys in several places.)

### Success criterion (**product default**, no source has one)

ב-{sessionsInRow} מפגשי תרגול רצופים, כשהגור נוגס והצעצוע מוצע לו, הוא עובר ללעוס אותו.

### Parameters

| Parameter | Full range | Default | Clip shows | Compatible with the clip | Basis |
|---|---|---|---|---|---|
| `stillSeconds` (media-bound) | 1-10 | 3 | 3 | 2-5 | Product default |
| `rounds` (media-neutral) | 1-6 | 3 | 1 | 1-6 | Product default |
| `sessionsInRow` (media-neutral) | 2-5 | 3 | 3 | 2-5 | Product default |

Tips (supported by Dogs Trust and Dogs for Good): rotate toys every few days; a tired puppy mouths more (18-20 hours of sleep).
Audience: all age bands, **product default** (no source gives an age limit). Stop condition (existing): if the puppy seems in pain, very frightened or aggressive, stop and see a vet or a certified trainer.

### Decisions on content (needed before anything is generated)

| # | Decision | My recommendation |
|---|---|---|
| C1 | Is the synthesis (stay still, then offer a toy, then praise) acceptable given the Dogs Trust ladder differs? | Yes: two of three sources and Dogs Trust's redirect section support it. Keep the clip's handler calm and never smiling or laughing at the mouthing (RSPCA) |
| C2 | `stillSeconds`: the sources do not give a number and RSPCA says "at once" | Keep 3 shown, compatible 2-5 (a visible, calm pause is easiest for a new owner to copy). Alternative: shown 2, compatible 1-3, closer to "at once". Tell me which; either needs no new video work if decided now |
| C3 | `rounds` 1-6 (default 3) and `sessionsInRow` 2-5 (default 3) | Approve as product defaults |
| C4 | Criterion wording | Approve as written |
| C5 | Age bands: all | Approve (the source gives no limit; teething is the explanation) |
| C6 | Stop-condition wording | Approve as written |
| C7 | The five Hebrew voice lines in section 3 | Review and approve or edit |

Why this must be decided **first**: approval freezes the definition. Any later change (even a range) changes the fingerprint, so the clip's manifest must be rebuilt and both reviews redone; a change to the demonstrated behaviour needs a new version and a new clip.

## 3. Final storyboard, Hebrew lines, captions, transcript

Single continuous take, 20 s, 1280x720, 16:9, locked-off camera at puppy eye level. The video is generated **silent**; all Hebrew is added in post, once. The handler's face is never in frame, so the voice needs no lip sync.

| Time | Timeline | What is seen | Voice (Hebrew) |
|---|---|---|---|
| 0.0-3.0 | setting | Adult sits cross-legged on a rug, hands relaxed in the lap; puppy bounces up to them | Narrator 0.4-2.5: כשהגור נוגס לנו ביד — |
| 3.0-8.0 | `stay-still` | Puppy gently mouths the sweater cuff/hand; the hand stays completely still and relaxed for about 3 s; no pulling away | Narrator 3.2-6.7: לא מושכים את היד. נשארים במקום, בלי תנועה. |
| 8.0-13.0 | `offer-toy` | The other hand brings a soft toy to the puppy's mouth; the puppy lets go of the sleeve and takes the toy | Narrator 8.4-11.0: ומקרבים לפה שלו צעצוע מתאים. |
| 13.0-17.0 | `praise-chewing` | The puppy chews the toy, relaxed | Demonstrator 14.0-15.2: יופי, איזה צעצוע! |
| 17.0-20.0 | setting | Calm play with the toy | Narrator 17.2-19.6: משבחים כשהוא לועס צעצוע — לא ידיים. |

- **Source of truth:** `pilot/mouthing-redirect-toy-1-standard/script.json`. `npx tsx scripts/build-pilot-files.ts pilot/mouthing-redirect-toy-1-standard` generates `manifest.json` (with the definition's fingerprint and the demonstrated parameters), `captions.vtt` (the demonstrator line is prefixed "(המדגים:)") and `transcript.json` (5 speech entries plus 2 visual notes).
- **Verified:** a unit test builds the files from the script and validates the whole bundle with the app's own validator, using the synthetic stand-in clip for the video. It passes: caption sync, voice gaps of at least 300 ms, demonstrator line inside the praise step, transcript agreement.
- **Timing is an estimate.** The voice durations are guesses until the real audio exists. After synthesis, measure each file (`ffprobe`), set `endMs = startMs + duration` in `script.json` (keep at least 300 ms between the demonstrator and the narrator), and rebuild.
- The builder refuses to write final files while the production dates are `0000-00-00`.

## 4. Generation prompts (Gemini Omni Flash; English prompts, silent output)

The model documentation says English is fully supported and other languages are unevaluated, and audio cannot be switched off (it is controlled through the prompt). So: English prompts, "no dialogue, no sound" in every prompt, and the audio track is discarded at assembly (`-an`).

**Character and scene bible (paste identically at the start of every prompt):**

> Bright, tidy living room, pale oak floor, large cream wool rug, soft daylight from a window on the left, plain wall, no signs or text. An 8-week-old golden retriever puppy: pale golden fur, dark round eyes, floppy ears, a small white patch on the chest, relaxed friendly body language, tail loosely wagging. An adult sits cross-legged on the rug facing the puppy. Only the adult's hands, forearms and torso up to the chest are ever visible; the face stays out of frame. The adult wears a plain grey long-sleeved knit sweater with soft cuffs, no jewellery. The toy is a soft blue-and-cream fabric rope chew toy about 20 cm long, no buttons, no squeaker, no small parts. Camera: locked-off, puppy eye level, medium-wide shot from about 1.5 m, 16:9, one continuous unbroken shot, no cuts, no zoom, no camera movement. Natural, realistic, documentary style. No dialogue, no speech, no music, no sound effects.

**Probe prompts (3 short probes first, about 6 s each, to approve the look before any full attempt):** bible + "The puppy bounces up to the seated adult and gently mouths the cuff of the grey sweater while the adult's hand stays completely still." Check realism and consistency of puppy, hands and toy.

**Prompt A (first 10 s):** bible + "0-3 s: the adult sits relaxed, hands in the lap; the puppy trots up and sniffs the adult's hand. 3-8 s: the puppy gently mouths the cuff of the grey sweater on the adult's right forearm; the adult's right hand and forearm stay completely still and relaxed, not pulling away, not pushing, not moving at all. 8-10 s: the adult's left hand slowly brings the soft toy toward the puppy's mouth. Calm, gentle play-mouthing only, no growling, no tension."

**Prompt B (extension of A by 10 s, using the previous interaction):** "Continue the same shot. The puppy lets go of the sleeve, takes the soft toy in its mouth and chews it calmly. The adult's hands stay relaxed and still near the toy. The puppy keeps chewing the toy for the rest of the shot, relaxed, then settles with the toy. Same room, same puppy, same adult, same toy, same camera. No dialogue, no speech, no music, no sound effects."

**Accept a take only if (check frame by frame):**
1. The adult's hand really stays still during the mouthing (about 3 s) and does not jerk away. 2. The toy is offered **while** the puppy is mouthing, not after it stopped. 3. The puppy switches to the toy and chews it. 4. The puppy looks relaxed: no fear, no growling, soft body, no teeth baring. 5. No pushing, scolding, rough play or hands used as toys. 6. Puppy, toy and adult look the same across the whole take; anatomy is correct (legs, paws, hands with five fingers); no text, logos or extra animals. 7. Face of the adult never visible. 8. Roughly 20 s long and framed so nothing important is cropped.

**Retry ladder:** reword the action (one change at a time); use the best frame as an image reference or first frame; split into 5-6 s sub-clips with first/last-frame control; last resort, a different model (for example Kling 3.0 Standard, through Runway) which would be a new vendor decision.

## 5. Providers and prices (official pages, read 2026-11-03)

### Video

| Option | Verified facts | Notes |
|---|---|---|
| **Gemini API, `gemini-omni-1.1-flash`** | Pricing page: output video $17.50 per 1M tokens, 5,792 tokens per second of 720p, "approximately $0.10 per second" (about $0.101). Paid tier only (no free tier for this model). Docs: 360p/720p/1080p/4K, 16:9 or 9:16, image and video references, first/last frame, extension of a generated video up to 40 s total, SynthID invisible watermark, audio on by default (controlled by prompt), English fully supported, no animal restrictions stated | A new model; puppy realism and action fidelity are **unverified until the probes**. Max length of one text-to-video generation is **not stated** (examples go to 10 s), hence 10 s plus one 10 s extension |
| Veo 3.1 on the Gemini API | **Shut down on 22 October 2026** (the API docs say so). My earlier plan to use Veo 3.1 is obsolete | Do not use |
| Runway API (reseller) | $0.01 per credit; lists Gemini Omni Flash 1.1 at 10 credits/s at 720p (3.4 at 360p) = same $0.10/s, Kling 3.0 Standard 9 credits/s without audio ($0.09/s), many others. Minimum purchase **not stated** | No price advantage for Omni; useful only as a fallback vendor |

**Billing rules (Gemini API billing page):** upgrading means adding at least **$5** of prepaid credits; prepay is the default for new accounts; maximum prepay $5,000; at zero balance usage stops (and all keys on that billing account stop); credits expire after 12 months; a project monthly spend cap exists but is labelled experimental with about 10 minutes of latency. Refundability of unused credit: **unverified**.

### Hebrew voice

| Option | Verified | Unverified or limits | Pilot cost |
|---|---|---|---|
| **Azure AI Speech**, `he-IL-HilaNeural` (female), `he-IL-AvriNeural` (male) | Both exist (Standard neural, 24 kHz/48 kHz). Free tier F0: 0.5 million characters per month | The page's dollar amounts did not render for me, so the paid rate is **unverified**; irrelevant for the pilot (free tier). No speaking styles listed | $0 |
| Google Cloud Text-to-Speech, **Chirp 3 HD** | Hebrew (`he-IL`) is listed; 30 voices; free tier 1M characters per month, then $30 per 1M characters (pricing page via search result); SSML, speaking rate 0.25-2.0 | Which voices are enabled for Hebrew: **unverified**. Pause control and custom pronunciations are **not available for he-IL** (docs), so a mispronounced word cannot be fixed with a phoneme tag. Needs Cloud billing enabled | $0 inside the free tier |
| ElevenLabs Eleven v3 / v4 | Hebrew is in the v3 and v4 language lists. API price $0.08 per 1K characters (v3). Multilingual v2 and Flash v2.5 do **not** include Hebrew | Plans start at $6/month (Starter); whether Starter licenses commercial TTS use is **unverified**; Hebrew quality unknown | about $0.25 of API use, or the $6 plan |

The pilot needs about 160 characters per voice take, so any free tier covers dozens of retakes.

### Recommended approach (one)

- **Video:** Gemini API directly with `gemini-omni-1.1-flash`, 720p: official docs and pricing, no middleman, same price as the reseller.
- **Voice:** an audition first, at no cost: synthesize the five lines with Azure `he-IL-HilaNeural` (narrator) and `he-IL-AvriNeural` (demonstrator), and with Chirp 3 HD; you choose by ear. Default if you have no strong preference: **Azure**, because both a female and a male Hebrew voice are confirmed to exist and its free tier covers the pilot many times over. ElevenLabs only if both sound unnatural.
- **Assembly:** local ffmpeg (free).

### Budget and cap

| Item | Calculation | Cost |
|---|---|---|
| Probes | 3 x 6 s x $0.101 | about $1.80 |
| One full attempt (A 10 s + extension 10 s) | 20 s = $2.03 if the extension bills only the new 10 s; **30 s = $3.04 if it bills the whole chain** (billing of extensions is **not stated**; I use the conservative one) | $2.03-$3.04 |
| Expected attempts to get one accepted take | my estimate 6-8 for such a precise action on a new model (**unverified guess**) | $12-$24 |
| Pessimistic: 12 attempts | 12 x $3.04 | $36.50 |
| Voice | free tiers | $0 |
| Assembly | local | $0 |

**Minimum purchase:** $5 prepaid credit. **Proposed cap for the whole pilot: $40**, enforced by buying exactly **$40** of prepaid credit once (a hard stop at zero) and also setting the experimental monthly spend cap to $40. Probes plus 12 conservative attempts come to about $38.50. If the balance runs out, I stop and report; no top-up without your approval. A 360p draft mode may cost about a third (Runway lists 3.4 credits/s); the Gemini page did not list 360p, so confirm in the console before relying on it.

### What I need from you to generate

1. Content decisions C1-C7 (section 2).
2. Approval of the Gemini API with a **$40** prepaid cap (you create the billing and put the key in your local `.env`, never in chat or in git; the existing `GEMINI_API_KEY` is for plans and may not be on a paid tier).
3. Permission to run the 3 probes (about $1.80) first; you approve the puppy/handler look before any full attempt.
4. A voice choice after the free audition (or "default to Azure").
5. Installing ffmpeg on this computer (your action; for example `winget install Gyan.FFmpeg`; I did not install anything).
6. Whether the app should label clips as AI-generated (today nothing is shown; the file carries an invisible SynthID watermark and the manifest records "ai-generated").

## 6. Assembly (ffmpeg; **untested here, there is no ffmpeg on this machine**)

Inputs: `take.mp4` (the accepted video), one mono WAV per voice line `n1.wav n2.wav n3.wav d1.wav n4.wav`.

```bash
# 1. silent, exact 20 s, 1280x720, 30 fps, H.264 High
ffmpeg -i take.mp4 -an -t 20 -vf "scale=1280:720:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -crf 22 -preset slow video_silent.mp4

# 2. place each line at its start time (ms, from script.json), loudness about -16 LUFS, stereo AAC, faststart
ffmpeg -i video_silent.mp4 -i n1.wav -i n2.wav -i n3.wav -i d1.wav -i n4.wav -filter_complex "[1:a]adelay=400|400[a1];[2:a]adelay=3200|3200[a2];[3:a]adelay=8400|8400[a3];[4:a]adelay=14000|14000[a4];[5:a]adelay=17200|17200[a5];[a1][a2][a3][a4][a5]amix=inputs=5:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=20[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k -ar 48000 -ac 2 -t 20 -movflags +faststart video.mp4

# 3. poster (WebP, at most 300 KB)
ffmpeg -ss 4.5 -i video.mp4 -frames:v 1 -c:v libwebp -quality 80 poster.webp

# 4. check
ffprobe -v error -show_entries stream=codec_name,profile,width,height,duration -of default=nw=1 video.mp4

# measuring a voice file to re-time script.json
ffprobe -v error -show_entries format=duration -of csv=p=0 n1.wav
```

`amix normalize=0` needs ffmpeg 4.4 or newer. If a command fails, send me the message; I will adjust it against the actual build. The app's validator then checks codecs, size, duration, faststart and the voice/caption/transcript agreement.

## 7. Ingest, review and test: exact steps

### On this computer (no cloud, no cost)

1. Database and admin: `npm run db:dev`, then `npx tsx scripts/grant-admin.ts --email you@example.com`. In `.env` (local only): `MEDIA_LOCAL_DIR=".media-local"` and `AI_PROVIDER="fake"` (the free local generator; it binds the offered technique to the first level of its topic).
2. **Approve the content (only after C1-C7).** In `src/domain/techniques/catalog.ts` set `review: { status: 'approved', approvedBy: '<you>', approvedOn: '<date>' }` for `mouthing-redirect-toy@1`, and add its line to `src/domain/techniques/techniques.lock.json`. The value comes from `npx tsx scripts/technique-fingerprint.ts mouthing-redirect-toy 1` (today: `673d147a…`; it changes with any edit). Run `npx vitest run src/domain`. I make this commit only on your explicit approval.
3. Put `video.mp4` and `poster.webp` in `pilot/mouthing-redirect-toy-1-standard/`. Fill the production dates and the voice vendor and voice name in `script.json`, re-time the lines to the real audio, then `npx tsx scripts/build-pilot-files.ts pilot/mouthing-redirect-toy-1-standard`.
4. Ingest as a **draft**: `npx tsx scripts/media-ingest.ts pilot/mouthing-redirect-toy-1-standard --admin-email you@example.com` (no `--fixture`). It prints the version id and fingerprint. Metadata checks passing is **not** a review.
5. `npm run dev`, open `/admin/media`, open the version. **Watch and listen to the clip in full**, with captions on and with the sound off once. Fill the TECHNICAL and CONTENT checklists (including "watched and listened in full"), mark reviewed, publish.
6. Register a local account and finish onboarding, then `npx tsx scripts/pilot-bind-local.ts --email you@example.com` (local only; binds the current level to the technique). Open the exercise: tap play, check captions, transcript, the paused/unavailable states by withdrawing and suspending in the admin.

### On an iPhone

**A. The clip itself (possible now, no cloud).** On the computer: `node scripts/device-check-server.mjs <folder with video.mp4, captions.vtt, poster.webp>`. It prints a `http://192.168.x.x:8765/` address; open it in Safari on the phone (same Wi-Fi; allow Node through the Windows firewall on private networks). The page uses the app's player attributes (native controls, `playsinline`, `preload="none"`, Hebrew captions) and logs events. Check rows B1, B3-B7, B9 in `docs/MEDIA_QA.md`: tap play, inline playback, fullscreen and rotation, volume, silent-switch behaviour, captions (CC menu), sound quality, narration, sync. This server was smoke-tested here with the synthetic stand-in clip on desktop Chromium (Range requests, captions, playback); it has **not** been tried on an iPhone. It checks the clip only, not the app.

**B. Inside the app on the iPhone (blocked for now).** Local mode requires `BETTER_AUTH_URL` to be `localhost` and Better Auth trusts only that one origin, so the app cannot be opened from a phone at the computer's LAN address. Two options, **both need your decision**: (1) a small local-only change that adds the computer's LAN origin as trusted (code in `auth.ts` and `local-mode.ts`, I would add tests); (2) the later hosted path: private Supabase bucket plus a preview deployment (cloud actions I have not taken). Until then B is recorded as PENDING.

## 8. The 18 skipped end-to-end tests

CI on `57f4f9f`: 180 listed, **162 passed, 18 skipped**. They were all intended, and every one was a run-time `test.skip`:

- `demo-video.spec.ts`: 8 tests x 2 non-desktop projects = **16**. These share technique-wide state (the published clip and suspension are common to every account in the test database), so they run once, in the desktop project, and resize the page to 360/768/1280 themselves.
- `admin-media.spec.ts` "suspends and lifts a technique": 1 test x 2 projects = **2**, same reason.

The intended matrix is therefore: 51 tests in each of `mobile-360` and `tablet-768`, and 60 in `desktop-1280` (the same 51 plus the 9 desktop-only ones).

Change made (config only, so the count means something): the desktop-only tests are no longer "skipped" at run time. `playwright.config.ts` leaves `demo-video.spec.ts` out of the mobile and tablet projects (`testIgnore`) and excludes tests tagged `@desktop-only` there (`grepInvert`); the admin test carries the tag. Listing now shows **162 tests (51 + 51 + 60)** and **0 skipped** by design. Nothing was added or removed: 162 passed before, 162 are listed now. Not re-run in full here (the local test database crashes under full runs); the CI run of this commit is the check.

Other skips that are not in this count: the integration suite's one live-model test (`ai-live.test.ts`, needs a real key and a paid call) is skipped on purpose.

## 9. What exists and what is pending

Added in this package: three sources recorded (`extracted-text`), `pilot/…/script.json`, `src/server/media/pilot-files.ts` and its test, `scripts/build-pilot-files.ts`, `scripts/device-check-server.mjs`, `scripts/technique-fingerprint.ts`, `scripts/pilot-bind-local.ts`.

Pending: C1-C7, the budget approval, probes, the real clip, the voice audition and audio, assembly, ingest, owner review (watching and listening), publication on the local database, iPhone checks, and everything in `docs/MEDIA_QA.md` section B. `MEDIA_REQUIRED` stays off.
