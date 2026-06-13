# PixelPaw 🐾

A pixel cat that lives on your desktop — inspired by [Comnyang](https://comnyang.com/).
Every pixel is drawn by code: no image or audio assets.

## Run it

```bash
npm install
npm start
```

The cat appears bottom-right of your screen and a cat icon appears in the menu bar.

## What it does

| Feature | How |
| --- | --- |
| **Eye follow** | The cat's eyes track your mouse anywhere on screen |
| **Mouse hunt** | Move the cursor really fast and it chases + pounces |
| **Mochi drag** | Drag the cat — it stretches; shake it — it wobbles |
| **Purring pets** | Rub its head with the cursor: purrs, hearts, blush |
| **Boop** | Click it |
| **Keyboard kneading** | Kneads its paws while you type¹ |
| **Overheat mode** | Type too fast: turns red, steam, panting¹ |
| **Paper unroll** | Plays with a paper roll when you scroll¹ |
| **Naps** | Sleeps when you're away, wakes with a "!" |
| **Stretch reminder** | Grows big every N minutes and stretches with you |
| **Pomodoro** | Pixel timer chip next to the cat (click to pause), tray countdown |
| **Reminders** | Daily "meow at a time" messages + a pinned note above its head |
| **Calls you by name** | Set your name in Settings |
| **Name your cat** | It introduces itself and titles its menu ("Mochi's menu") |
| **Fur styles** | Plain · tabby stripes · spots, over any color scheme |
| **Match my cat** | Upload a photo — colors are extracted and mapped onto the pixel cat (click a swatch to override the body color) |
| **AI agent reactions** | Thinking face while Claude Code works, happy jump + meow when done |

¹ needs macOS **Accessibility** permission (see below).

## AI agent integration

**Status LED** — a small pulsing light floats next to the cat whenever an agent
is working (amber), needs you (red, blinking), or just finished (green flash).
Multiple parallel sessions show a count.

**Claude Code** — Settings → AI AGENTS → INSTALL HOOKS writes 6 hooks into
`~/.claude/settings.json` (backup saved alongside):

- `UserPromptSubmit` → working LED + thinking face
- `Stop` → happy jump + meow (quick turns get a quiet hop instead)
- `Notification` → alert with the actual message ("CLAUDE NEEDS YOUR PERMISSION…")
- `PreToolUse[AskUserQuestion]` → **the question + options appear on the cat**
- `PostToolUse[AskUserQuestion]` → panel clears once answered
- `SessionEnd` → session cleanup

Hooks capture each session's tty, so when Claude asks a question you can click
an option **on the cat** — it focuses the exact Terminal.app/iTerm2 tab that
asked and types the option number for you (toggleable; first use triggers
one-time macOS Automation prompts). Embedded terminals (VS Code/Cursor) can't
be tab-targeted; the cat shows "WINDOW NOT FOUND" and you answer manually.

**Codex CLI** — Settings → AI AGENTS → INSTALL NOTIFY adds a `notify` hook to
`~/.codex/config.toml`: happy jump + "CODEX DONE!" when a turn completes.
(Codex only exposes turn-completion to external hooks — no working/question events.)

Any other tool can drive the cat over plain HTTP:

```bash
curl -X POST http://127.0.0.1:41999/agent -H "Content-Type: application/json" \
  -d '{"agent":"codex","state":"done"}'        # thinking | done | alert | idle

curl -X POST http://127.0.0.1:41999/say -H "Content-Type: application/json" \
  -d '{"text":"DEPLOY FINISHED"}'              # make the cat say anything
```

## Talk to the cat from anywhere

| Surface | How |
| --- | --- |
| **CLI** | `pawcat say "deploy done"` · `pawcat todo "review PR"` · `pawcat tasks` · `pawcat agent done --agent ci` · `pawcat menu/show/hide/status` (installed via `npm link`) |
| **URL scheme** | `open "pixelpaw://say?text=hi"` — works from Shortcuts, Raycast, browsers. Commands: `say` `todo` `menu` `show` `hide` `agent?state=…` `pom?action=…` |
| **HTTP** | `POST 127.0.0.1:41999` → `/say` `/todo` `/menu` `/agent` `/show` `/hide` `/url` · `GET /status` |
| **MCP** | `tools/mcp-server.js` registered with Claude Code (user scope): agents can call `cat_say`, `cat_todo`, `cat_list_tasks`, `cat_status` natively |

## macOS permissions

Global **keyboard / scroll** reactions (kneading, overheat, paper) need:

1. System Settings → Privacy & Security → **Accessibility** → enable **Electron** (or PixelPaw if packaged)
2. If still quiet: also enable it under **Input Monitoring**, then restart the app

Mouse reactions (eye follow, hunt, pet, drag) work with **no permissions**.

## The cat menu (launcher)

**Hold the cat ~⅓s**, **right-click it**, or press **⌃⌥C** anywhere — a pixel menu
springs out of the cat. Click anywhere else and it melts back in.

- **VOICE** — toggles [Murmur](../your-transcription-cli) dictation (sends its ⌃⌥T
  shortcut; launches the app first if needed). Speak; words land wherever your cursor is.
- **APPS** — your frequently-used apps (edit in Settings → LAUNCHER)
- **TO-DOS** — a todo list with timed reminders. Add with due times:
  `pawcat todo "standup @ 9:30"` · `"call mom @ +30m"` · or type into the panel itself.
  The cat meows + bubbles when something comes due; overdue items get an amber
  **snooze +10m** chip. Click a task to check it off.
- **INBOX** — recent reminders and `/say` messages with timestamps
- **MORE** — settings · stretch · hide · quit

## Controls

- **Drag** the cat anywhere — position is remembered
- **Right-click** the cat → quick menu · **Double-click** → settings
- Menu bar cat icon → show/hide, pomodoro, settings, quit

## Dev notes

- `npm test` runs 17 automated behavior scenarios in an isolated profile: it
  drives the cat with synthetic typing/scroll/mouse/agent events, asserts on
  internal state (`__catDebug`), and saves a screenshot of every reaction to
  `/tmp/pixelpaw-test/` — safe to run while your real cat is up
- `npm run preview` renders all sprite frames × skins to `/tmp/pixelpaw-preview.png`
- `npm run smoke` boots the app headlessly-ish and self-checks
- Cat window is a transparent, click-through, always-on-top Electron window;
  it becomes interactive only while your cursor is over the cat/timer.
- Sprite style notes: cream auto-outline around the silhouette, whiskers,
  4×4 eye sockets with a 2×2 roaming pupil, plump comma tail — studied from
  comnyang's demo videos.
