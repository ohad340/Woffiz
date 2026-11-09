# Pilot production package: `mouthing-redirect-toy@1` STANDARD

Updated 2026-11-03. **Nothing here was generated, approved, published or paid for.** The technique is `draft` (`techniques.lock.json` is `{}`), `MEDIA_REQUIRED` is off, and one pilot does not change that: it stays off until the required catalog coverage exists. Clips are produced once and reused; nothing is generated per user.

## 0. Production workflow (confirmed by the owner, supersedes the Google API proposal of decision 85)

1. Claude prepares the storyboard, prompts and reference requirements (this document).
2. The owner generates the footage in ChatGPT through the connected Higgsfield tool. Model, length limits, credits and prices are decided there; nothing here assumes them.
3. The owner returns the selected video file.
4. Claude inspects what the footage actually shows (and reports any mismatch instead of covering it with captions), assembles it, adds the Hebrew voice, builds captions and transcript from the measured timeline, validates the bundle and ingests it as DRAFT.
5. The owner watches and listens, completes the reviews, publishes, and the clip is connected to an exercise through the existing versioning/binding workflow.

No video-provider API, credentials, prepaid credit or automated video-generation call is part of this workflow. The app's plan generation (Anthropic) is unchanged.

## 1. Content approval proposal (still DRAFT until the owner approves)

### What each source actually supports (full texts read 2026-11-03, recorded as `extracted-text`, not yet read by the owner)

| Instruction | Dogs Trust (live page) | RSPCA UK (leaflet, 2015) | Dogs for Good (handout, 2015) |
|---|---|---|---|
| Do not pull the hand or clothing away | Yes ("This can be exciting for dogs and turn it into a game") | Yes ("keep that part of your body still") | Yes, for clothing ("quietly stand very still") |
| When to offer the toy | **At a pause**: "stay still and redirect your dog when there's a brief pause in the behaviour" | **At once, during the contact**: "distract them at once by offering a toy instead" | **After release**: "when they let go redirect them onto something suitable" |
| Praise chewing an appropriate item | Yes ("praise them well") | Not stated | Yes ("praise them verbally") |
| Step away if it gets too much | Yes ("step away or separate yourself briefly… return with a safe activity") | Not stated | Yes, for accidental bites ("stop the game and move away… once they are calm, direct them onto… a toy") |
| No punishment, raised voice, pushing; no hands as toys | Yes | Yes (also: don't smile or laugh) | Yes |
| Seconds, repetitions, mastery criterion | None | None | None |

**Correction to the previous version:** Dogs for Good supports redirecting **after the puppy lets go**, not during the mouthing. It is no longer described as supporting redirection during mouthing (catalog summary corrected).

**Remaining contradiction (brief):** RSPCA UK (2015) offers the toy at once, during the contact; Dogs Trust (pause) and Dogs for Good (release) wait. The proposal follows Dogs Trust and Dogs for Good, the current and the more specific guidance.

### Recommended final sequence (the draft catalog now says exactly this)

| # | Step id | Hebrew instruction | Basis |
|---|---|---|---|
| 1 | `stay-still` | כשהגור נוגס ביד או בשרוול, לא מושכים ולא מזיזים את היד. משאירים אותה רפויה ושקטה. | Supported by all three |
| 2 | `offer-toy` | ברגע שהגור עוצר לרגע או משחרר, מקרבים לפה שלו צעצוע מתאים. | Supported: Dogs Trust (pause) and Dogs for Good (release). RSPCA differs on timing |
| 3 | `praise-chewing` (narrated; no demonstrator line, decision 89) | כשהגור לועס את הצעצוע, משבחים אותו בקול רגוע. | Praise supported by Dogs Trust and Dogs for Good; "calm voice" is a product default consistent with all three warning against raised voices |

**No waiting time in seconds.** The previous draft had "about {stillSeconds} seconds" (default 3); no source gives a number, and the toy is tied to the puppy's pause or release, not to a clock. The parameter was removed, so the clip has no media-bound parameter: any length of stillness in the footage matches the instructions as long as the toy comes at the pause or release.

Preparation: צעצוע רך או חפץ לעיסה מתאים לגור; עוד צעצוע בהישג יד; בגד עם שרוול ארוך ועבה עוזר להישאר רגועים (Dogs Trust: thicker clothing reduces the instinct to pull away).

### Parameter proposal (all product defaults; all media-neutral)

| Parameter | Range | Default | Clip shows |
|---|---|---|---|
| `rounds`: repetitions per practice session | 1-6 | 3 | 1 |
| `sessionsInRow`: consecutive sessions for the mastery criterion | 2-5 | 3 | (not shown) |

### Mastery criterion (product default)

ב-{sessionsInRow} מפגשי תרגול רצופים, כשהגור נוגס והיד נשארת שקטה, הוא לוקח את הצעצוע שמוצע לו ולועס אותו.

(Ordinary practice reports never unlock; only the owner's explicit mastery confirmation does. Unchanged product rule.)

### Stop conditions

1. אם הגור נראה כואב, מבוהל מאוד או אגרסיבי, עוצרים את התרגיל ופונים לווטרינר או למאלף מוסמך. (existing, product wording)
2. אם הנשיכות חזקות או שהגור לא נרגע, קמים ומתרחקים לרגע, וחוזרים אליו בשקט עם צעצוע. (new; Dogs Trust and Dogs for Good)

Unchanged: EASIER variant (offer the toy early, at the first play signs; Dogs Trust), tips (rotate toys; enough sleep), all age bands (no source gives a limit). Must never appear in the clip: pulling the hand or clothing away, punishment, raised voice, pushing down, rough play or hands as toys, smiling or laughing at the mouthing, ignoring a brought toy.

**Fingerprint:** the corrected draft is `5fc4f1e9…` (was `7503f788…` before the demonstrator praise line was dropped, decision 89) (`npx tsx scripts/technique-fingerprint.ts mouthing-redirect-toy 1`). v1 was never released, so it was edited in place under the existing rules; approval will freeze it in `techniques.lock.json`, and any later change becomes v2.

**To approve:** reply with "approve as proposed" or the exact changes. I then set `review.status: approved` and add the lock entry in one commit.

## 2. Storyboard (target about 20 s; timing follows the real action and narration)

Single continuous take preferred; same puppy, handler clothing, toy, room and light throughout; handler's face never in frame (no lip sync); generated audio is replaced.

| ~Time | Timeline | Picture | Voice |
|---|---|---|---|
| 0-2.5 s | setting | Puppy trots to the seated adult, mouth goes to the sweater cuff | Narrator: כשהגור נוגס ביד או בשרוול — |
| 2.5-8.5 s | `stay-still` | Puppy gently mouths the cuff; the hand stays relaxed and motionless | Narrator: לא מושכים ולא מזיזים את היד. משאירים אותה רפויה ושקטה. |
| 8.5-13 s | `offer-toy` | Puppy pauses or lets go; the other hand slowly brings the rope toy to its mouth; puppy takes it | Narrator: כשהוא עוצר לרגע, מקרבים לפה שלו צעצוע. |
| 13-17 s | `praise-chewing` | Puppy chews the toy, relaxed; hands still | Narrator only: כשהגור לועס את הצעצוע, משבחים אותו בקול רגוע. (the demonstrator line "יופי, איזה צעצוע!" of the first storyboard was removed by the owner, decision 89) |
| 17-20 s | setting | Calm chewing, puppy settles | Narrator: משבחים בקול רגוע כשהוא לועס צעצוע, לא ידיים. |

Transcript visual notes: [הגור נוגס בשרוול. היד של המבוגר נשארת רפויה ולא זזה] · [הגור משחרר לרגע. היד השנייה מקרבת צעצוע רך, והגור לוקח אותו] · [הגור לועס את הצעצוע, רגוע].

Muted: the captions carry every instruction (no demonstrator line in STANDARD since decision 89; a demonstrator line elsewhere is captioned "(המדגים:) …").

Source of truth: `pilot/mouthing-redirect-toy-1-standard/script.json` (times are **provisional**). `npx tsx scripts/build-pilot-files.ts <folder>` generates `manifest.json`, `captions.vtt` (lines over 42 characters wrap to two) and `transcript.json`.

## 3. Higgsfield prompt package (copy-ready)

Use the same **CHARACTER AND SCENE REFERENCE** text at the start of every prompt. Paste the English as is; the Hebrew lines are explanations only.

### 3.1 CHARACTER AND SCENE REFERENCE

> הסבר: תיאור קבוע של הגור, המטפל, הצעצוע והחדר. מדביקים אותו בתחילת כל פרומפט כדי שהכול יישאר זהה.

```
CHARACTER AND SCENE REFERENCE (keep identical in every shot):
- Puppy: one 9-week-old golden retriever puppy, pale golden fur, dark round eyes, black nose, soft floppy ears, a small white patch on the chest, no collar. Realistic puppy proportions: four legs, one tail, natural paws. Relaxed, playful, friendly body language.
- Handler: one adult sitting cross-legged on the rug, facing the puppy. Only hands, forearms and torso up to the chest are ever visible; the face and head stay out of frame at all times. Plain medium-grey long-sleeved knit sweater with soft thick cuffs, dark-blue jeans, no jewellery, no watch, no nail polish. Natural adult hands with five fingers each.
- Toy: one soft rope chew toy, about 20 cm long, braided blue and cream cotton, knotted at both ends. No buttons, no squeaker, no small parts. It lies on the rug beside the handler's left knee until it is used.
- Room: bright, tidy living room. Pale oak floor, large plain cream wool rug, plain off-white wall, one low grey sofa edge visible in the background. Soft natural daylight from a window on the left, no harsh shadows. No posters, screens, text, logos or brand names anywhere.
- Camera: static tripod, lens at the puppy's eye level (about 35 cm above the floor), medium-wide framing from about 1.5 m, 16:9 landscape. The puppy, the handler's hands and the toy stay fully inside the frame.
- Style: natural, realistic, documentary home video, real-time speed, no slow motion, no filters, no stylisation.
```

### 3.2 Reference image prompt (only if the selected model uses an image reference or a first frame)

> הסבר: תמונת פתיחה אחת שמקבעת את המראה. אם המודל תומך בתמונת ייחוס או בפריים ראשון, מייצרים אותה קודם ובוחרים את הטובה ביותר.

```
[CHARACTER AND SCENE REFERENCE]
A single photorealistic still frame: the puppy sits on the cream rug about 40 cm in front of the seated handler, looking toward the handler's right hand, which rests relaxed on the right knee. The rope toy lies on the rug beside the handler's left knee. The handler's face is out of frame (frame cut at mid-chest). Soft daylight from the left. Sharp focus on the puppy and the hands. No text, no watermark.
```

### 3.3 Initial test prompt (about 5 s; check before the full footage)

> הסבר: בדיקה קצרה וזולה לפני הכול: האם הגור, הידיים והצעצוע נראים אמיתיים, והאם היד באמת נשארת בלי תנועה. אם לא, משנים את הניסוח לפני הצילום המלא.

```
[CHARACTER AND SCENE REFERENCE]
One continuous 5-second shot, no cuts. The puppy steps forward and gently mouths the thick grey cuff of the handler's right sleeve. During the whole shot the handler's right hand and forearm stay completely relaxed and motionless: no pulling away, no pushing, no lifting. The puppy's body stays loose and playful; no growling, no bared teeth. The rope toy stays on the rug beside the left knee. Static camera. No dialogue, no music.
```

### 3.4 Master prompt (the whole demonstration in one generation, about 20 s)

> הסבר: הסרטון כולו בצילום אחד. אם המודל לא מגיע ל-20 שניות או לא שומר על סדר הפעולות, עוברים לחלופה של השוטים (3.5).

```
[CHARACTER AND SCENE REFERENCE]
One continuous, unbroken shot of about 20 seconds, static camera, no cuts, real-time speed. Action in this exact order:
1. (about 0-3 s) The puppy trots up to the seated handler and puts its mouth on the thick grey cuff of the handler's right sleeve.
2. (about 3-8 s) The puppy gently mouths the cuff. The handler's right hand and forearm stay completely relaxed and still the whole time: not pulled away, not pushed, not lifted. The handler's left hand rests on the left knee.
3. (about 8-12 s) The puppy pauses and lets go of the cuff for a moment. Only then the handler's left hand slowly picks up the rope toy from the rug and brings it, low and slow, to the puppy's mouth. The puppy takes the toy in its mouth.
4. (about 12-17 s) The puppy chews the rope toy, relaxed, while the handler's hands rest still near the toy.
5. (about 17-20 s) The puppy lies down on the rug and keeps chewing the toy calmly. End on this calm moment.
Gentle, friendly play only. No dialogue, no speech, no music.
```

### 3.5 Shot-by-shot alternative (if one generation cannot hold the full sequence)

> הסבר: ארבעה שוטים קצרים, אותה מצלמה ואותו מיקום. כל שוט מתחיל בדיוק בתנוחה שבה הקודם נגמר. אם הכלי מאפשר, משתמשים בפריים האחרון של השוט הקודם כפריים הראשון של הבא.

All shots: same static camera position and framing as the reference, same light, no cuts inside a shot.

**Shot 1: approach (about 3 s).** Start: the reference image pose (puppy sitting 40 cm away, toy beside the left knee). End: the puppy's mouth on the right sleeve cuff.
```
[CHARACTER AND SCENE REFERENCE]
One continuous 3-second shot, static camera. Starting pose: the puppy sits on the rug about 40 cm in front of the seated handler; the handler's hands rest on the knees; the rope toy lies beside the left knee. The puppy stands up, takes two steps forward and puts its mouth on the thick grey cuff of the handler's right sleeve. Ending pose: the puppy's mouth on the right cuff, the right hand still on the right knee. No dialogue, no music.
```

**Shot 2: hand stays still (about 5-6 s).** Start: the puppy's mouth on the cuff. End: the puppy lets go and pauses, head slightly back, looking at the hand.
```
[CHARACTER AND SCENE REFERENCE]
One continuous 6-second shot, static camera. Starting pose: the puppy's mouth on the thick grey cuff of the handler's right sleeve. The puppy gently mouths the cuff. The handler's right hand and forearm stay completely relaxed and motionless for the whole shot: no pulling away, no pushing, no lifting, no shaking. The left hand rests on the left knee next to the rope toy. Near the end the puppy lets go of the cuff and pauses, head pulled slightly back. Ending pose: the puppy pausing, mouth off the sleeve, looking at the hand. No dialogue, no music.
```

**Shot 3: toy at the pause (about 4-5 s).** Start: the puppy pausing, mouth off the sleeve. End: the toy in the puppy's mouth.
```
[CHARACTER AND SCENE REFERENCE]
One continuous 5-second shot, static camera. Starting pose: the puppy has just let go of the handler's right sleeve and pauses, looking at the hand. The handler's left hand slowly picks up the rope toy from the rug and brings it low and slowly to the puppy's mouth. The right hand stays still on the right knee. The puppy takes the toy in its mouth. Ending pose: the rope toy in the puppy's mouth, the left hand releasing it. No dialogue, no music.
```

**Shot 4: chewing and calm ending (about 5-6 s).** Start: the toy in the puppy's mouth. End: the puppy lying down, chewing calmly.
```
[CHARACTER AND SCENE REFERENCE]
One continuous 6-second shot, static camera. Starting pose: the rope toy in the puppy's mouth, the handler's hands resting near the knees. The puppy chews the toy calmly, then lies down on the rug holding the toy between its front paws and keeps chewing. The handler's hands stay relaxed and still. Ending pose: the puppy lying down, chewing the toy, relaxed. No dialogue, no music.
```

### 3.6 Constraints (append to every prompt)

> הסבר: איסורים שמונעים שגיאות אנטומיה, החלפת זהות, תנועות בלתי אפשריות, טיפול גס, טקסט וחיתוכים.

```
CONSTRAINTS: exactly one puppy and one adult. Correct anatomy: the puppy has four legs, one tail, two ears and natural paws; each human hand has five fingers; no extra or merging limbs. The puppy, the sweater, the toy, the rug and the room keep the same look, size and colour for the whole video; no morphing or identity change. Physically possible motion only: nothing teleports, nothing passes through anything, the toy only moves when a hand or the puppy moves it. No pulling the hand or sleeve away, no pushing, no grabbing the muzzle, no tug-of-war, no rough play, no scolding gestures, no laughing. The puppy shows no fear and no aggression: no growling, no bared teeth, no stiff body, no cowering. The handler's face never appears. No text, captions, subtitles, logos, watermarks or brand names. No cuts, transitions, zooms or camera movement. No slow motion.
```

### 3.7 Visual acceptance checklist

> הסבר: בודקים כל צילום מועמד פריים-פריים לפני שמחזירים אותו.

1. The hand stays still and relaxed while the puppy mouths, and is never pulled away.
2. The toy arrives **after** the puppy pauses or lets go, not during the mouthing and not long after.
3. The puppy takes the toy and chews it.
4. The puppy is relaxed throughout: no fear, growling, bared teeth or stiff body.
5. No pushing, scolding, rough play, laughing, or hands used as toys.
6. Same puppy, sweater, toy, room and light in every frame and across shots; correct anatomy (legs, tail, paws, five fingers).
7. The handler's face never appears; no text, logo or watermark; no unintended cut or camera move.
8. Enough usable footage for about 20 s of action in the right order.

## 4. Hebrew voice workflow (no charges, no account assumed)

Final lines are in `script.json` (section 2). Where a clip has a demonstrator line (EASIER and other techniques), narrator and demonstrator must be two clearly different voices and the narrator is silent from at least 0.3 s before to 0.3 s after it (the validator enforces it). The STANDARD clip has narration only (decision 89).

| Option | What is verified | Use |
|---|---|---|
| **A. Recorded human voices (recommended)** | Nothing to buy; the assembler decodes M4A/MP3/WAV, trims silence and normalises loudness | Two people record the lines on a phone (for example iPhone Voice Memos): one narrator (4 lines), one demonstrator (1 line). Quiet room, phone about 20 cm away, one file per line, named `line-1.m4a` … `line-5.m4a` in script order |
| B. Azure AI Speech free tier F0 | The official pricing page lists 0.5 million free characters per month for neural voices; the Hebrew voices `he-IL-HilaNeural` and `he-IL-AvriNeural` exist (official voice list) | Only if you already have, or decide to open, an Azure account; eligibility and sign-up terms were **not** checked and no account was created |
| C. Windows built-in voice (Microsoft Asaf, he-IL) | Installed on this computer; `scripts/local-hebrew-tts.ps1` writes one WAV per line | **Provisional only**: timing and the assembly test. Robotic, not for the real clip |

Timing is provisional until real audio exists: the assembler measures each file (`--measure --write-durations` sets `endMs`); start times are then set by watching the actual footage.

## 5. Assembly tooling (resolved and tested here)

ffmpeg is not installed and installing it would mean downloading a binary or accepting package-manager terms, so assembly uses what is already here: local Chrome/Edge WebCodecs (H.264 and AAC encoders) plus the pure-JS `mp4-muxer` 5.2.2 (MIT, now a pinned devDependency; the package notes it is superseded by Mediabunny, but it works and is what the playable fixture uses).

`node scripts/assemble-clip.mjs <bundle folder> --footage <file> --voices <folder> [--from-ms N] [--poster-ms N]` discards the footage audio, cover-fits it to 1280x720 at 30 fps, places each trimmed voice line at its `startMs`, normalises to about -16 LUFS (BS.1770 K-weighting, gated) with a -1.5 dBFS peak ceiling, encodes H.264 High + AAC stereo 48 kHz, faststart, and writes `video.mp4` plus `poster.webp` from a real frame.

**Verified on this computer on 2026-11-03** (Chrome 156, Windows), with the synthetic playable fixture as footage and the five lines spoken by the local Asaf voice: measured and re-timed the lines (it caught a last line that would have run past 20 s), built the files, assembled (15 s), and the app's validator returned **no issues**: avc1 + mp4a, faststart, 20.0 s, 1280x720; Chromium then decoded video and audio. Loudness came out -15.1 LUFS before gain and was peak-limited. **Not verified:** real footage from Higgsfield (frame rate, codec, length), the Linux CI browser (no AAC encoder there, so this is not a CI test), iPhone playback.

## 6. When the footage comes back

1. Save it as `pilot/mouthing-redirect-toy-1-standard/footage/<name>.mp4` (git-ignored). I watch it and write down, with times, what it actually shows for each step. A mismatch (toy during mouthing, a pulled hand, a changed puppy, an anatomy error) is reported to you and the take is rejected or re-generated; captions are never used to describe something the picture does not show.
2. Voice: record or synthesize the lines (section 4) into `pilot/…/voice/` (git-ignored). `node scripts/assemble-clip.mjs pilot/mouthing-redirect-toy-1-standard --voices pilot/mouthing-redirect-toy-1-standard/voice --measure --write-durations`, then adjust the start times in `script.json` to the footage.
3. Fill `production` in `script.json` (dates, the Higgsfield model you used, voice vendor and names), then `npx tsx scripts/build-pilot-files.ts pilot/mouthing-redirect-toy-1-standard`.
4. `node scripts/assemble-clip.mjs pilot/mouthing-redirect-toy-1-standard --footage <footage> --voices <voice folder> --from-ms <start of the usable action> --poster-ms <a representative frame>`.
5. Ingest as DRAFT: `npx tsx scripts/media-ingest.ts pilot/mouthing-redirect-toy-1-standard --admin-email you@example.com`. Rejection lists every problem.
6. Local review: `npm run db:dev`; once, `npx tsx scripts/grant-admin.ts --email you@example.com`; `.env` has `MEDIA_LOCAL_DIR=".media-local"`. `npm run dev`, open `/admin/media`, open the version, **watch and listen in full** (once muted with captions), complete both checklists, mark reviewed. Publishing also needs the approved, locked definition (section 1).
7. Connect it to a local test exercise: `npx tsx scripts/pilot-bind-local.ts --email you@example.com` adds a new exercise version to your local account's current level through the same versioned path the generator uses. Earlier versions, criteria, attempts and mastery history are untouched.
8. iPhone: `node scripts/device-check-server.mjs pilot/mouthing-redirect-toy-1-standard` and open the printed `http://192.168.x.x:8765/` in Safari on the same Wi-Fi (allow Node on private networks in the Windows firewall). It checks the clip itself (tap-to-play, inline, sound, captions, sync), not the app. Inside the app on the phone is still blocked by local mode (localhost-only sign-in); that needs either a local-only trusted LAN origin or the hosted path, each your decision.
9. Viewing/listening approval and every device row in `docs/MEDIA_QA.md` stay PENDING until actually done.

Sources and review records stay internal to the admin workflow. No public sourcing, trainer-approval or AI-generation label is added; the manifest's internal provenance (`production.kind: ai-generated`, vendor, model, dates) is kept.
