# Working on Miru

A macOS Electron desktop pet, plain JavaScript, no build step. `main.js` is
the entire main process; `renderer/cat.js` is her state machine; her whole
anatomy is ASCII art in `renderer/sprites.js`.

## Before claiming anything is done

- `npm test` must pass (89 scenarios; the count grows — keep it green, run it
  twice if you touched timing). It boots a real Electron instance in an
  isolated per-PID profile, so it's safe while the user's cat is running.
- `node --check` every file you edit. No linter is configured; match the
  surrounding style (2-space indent, single quotes, trailing commas).

## Test-harness doctrine (hard-won; violate it and the suite flakes)

- **Ambient triggers must be TEST-inert unless a scenario opts in.** Renderer
  rituals gate on `st.testMode` and are triggered via `__catPoke()`; main-side
  schedulers use rewind endpoints (`/test/task-clock`, `/test/away`) or
  opt-in flags (`/test/bond-roll { hour }`), never shortened real timers.
- **Day-rolling scenarios must defuse**: end with
  `POST /test/bond-roll { day, greeted: true }` or the un-greeted morning
  ritual detonates inside a later scenario.
- **Waits must require drawn geometry** (`boxes.length`, `bubbleBox`,
  `dismissBox`), not just state flags — state lands a frame before geometry.
- `/todo` fires an instant `TODO: X` bubble; due-waits must match the
  `DUE: X` prefix exactly.
- Clipboard writes are TEST-gated; keep them that way.

## Sprite rules

- Her looks are **packs** (see `docs/SPRITES.md` for the contract): built-ins
  `sticker` (default) / `classic` / `kawaii` register inside
  `renderer/sprites.js`; user packs are pure-data JSON in the profile's
  `sprite-packs/` dir. **Packs are data, never code** — everything passes
  `lib/validatePack.js` before it reaches a renderer; keep that the single
  source of truth for pack rules.
- After any sprite edit run `node tools/preview.js /tmp/sheet.png plain
  <packId|path/to/pack.json>` and actually look at the contact sheet
  (`npm run preview` renders the default pack).
- The state machine requests poses through `RESOLVED` (cat.js): action poses
  fall back toward `sit`, ritual poses (`sit_groom*`, `sit_flick`,
  `sit_wrap`, `loaf_twitch`) are existence-gated — never fake a ritual on a
  static pose. Only `sit` (with live eyes) is required of a pack.
- Pixel art belongs to the cat and her paper speech surfaces only. Functional
  UI (menu, panels, settings) is modern system-ui. Fur must never tint red
  (a canvas-scan regression test enforces this).
- `site/vendor/` holds verbatim copies of `renderer/sprites.js` and
  `renderer/gifts.js`; refresh with
  `cp renderer/sprites.js renderer/gifts.js site/vendor/` after sprite edits.
- Painted pixels (`pixelOverrides`) are keyed **per pack id**; the editor
  writes only the active pack's slice.

## Product principles (binding for any UX change)

She asks before acting (chips first; typing into a terminal always needs a
click). Everything is undoable. She never guilts — absence gets a reunion,
follow-ups stop after two. Local-first: no telemetry, no accounts, voice
transcribed on-device, the optional `claude -p` brain is capped per day.

## Git

Do not commit or push unless the user asks. Commit messages are plain,
lower-key sentences about what changed for the cat.
