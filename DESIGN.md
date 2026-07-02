# Design

Two registers share one identity. The **app** (Electron, `renderer/`) is product register: pixel art belongs to the cat and her speech surfaces; every functional panel is modern and quiet. The **landing page** (`site/`) is brand register: the page IS her desktop, told as one night.

## Visual Theme

**The page is her desktop, and the visit is one night with her.** A single resident cat lives fixed at the bottom edge of the viewport (`.dock`, exactly where she lives on a real screen) and performs each chapter as it scrolls past: settles in at 10 PM, runs a live voice-capture demo at 11:52 PM, wears her agent LED at 2 AM, wakes with a gift at 7 AM, and sleeps at the footer. Chapters are timestamps; **the clock is the accent** (`.when` in chip-yellow inside each H2 — a real sequence, not decorative numbering). The body background eases between scene ambients (dusk → blue 2 AM → warm dawn). Calm, premium, minimal: the small living creature is the loudest thing on the page.

## Color Palette

Sprite-engine colors are canonical (`renderer/sprites.js` SKINS) — never restate them, import them.

| Token | Value | Role |
|---|---|---|
| `--bg` | `oklch(17.5% 0.012 295)` | landing page body (night desk) |
| `--surface` | `oklch(21% 0.014 295)` | raised bands, vignette frames |
| `--surface-2` | `oklch(25.5% 0.016 295)` | chips, kbd (app panel `#2a2933` family) |
| `--cream` | `#fdf8ec` | primary text; the cat's outline color |
| `--paper` | `#fffef8` | speech bubbles, confirm panels |
| `--ink` | `#14131a` | panel frames, text on paper/yellow |
| `--yellow` | `#ffd400` | THE accent: CTA, panel title strips. Budget: once per fold |
| `--pink` | `#f2a0b5` | micro-accent (link underlines, her nose) |
| `--red` `#ff5d52` · amber `#ffb83d` · green `#52d273` · `--blue` `#9fb4d8` | product-semantic only: REC, LED states, dreams |
| `--text-dim` | `oklch(79% 0.012 295)` | secondary text (≥4.5:1 on all surfaces) |
| `--text-faint` | `oklch(66% 0.012 295)` | fineprint only |

Strategy: **drenched dark**, identity-derived. No gradients, no glass, no tints outside her hue family.

## Typography

- **Schibsted Grotesk** (variable, Google Fonts) — the entire page voice. Display 700 at `clamp(2.5rem → 4.35rem)`, `-0.028em`; H2 `clamp(2rem → 3rem)`; body 1.0625rem/1.65. `text-wrap: balance` on headings, `pretty` on prose.
- **Silkscreen** — pixel type, used ONLY inside product recreations (speech bubbles, confirm panels, chips, undo pills). This is the app's own rule: pixel belongs to the cat.
- In-app: `PixelFont` (canvas) for cat surfaces, `system-ui` for DOM panels.

## Components

- **Speech bubble / confirm panel** (`.bubble`, `.panel`): paper bg, 3px ink border, 3px cream halo (`box-shadow: 0 0 0 3px`), hard offset shadow, yellow title strip, Silkscreen uppercase, chip row (`--ink-2` chips, yellow primary label, 3px countdown bar draining under the committing chip).
- **The Resident** (`site/site.js` `Resident extends LiveCat`): the one fixed cat. Scenes (hero/settle/voice/agents/morning/sleep) switch via a mid-viewport IntersectionObserver band (+ a scrolled-to-bottom trigger for the short footer); each scene choreographs her speech (`#dockSay`), the demo panel (`#dockPanel`, single-run drain), LED, and gift. Body background per scene from the `AMBIENT` map (CSS-transitioned). Boopable and pettable everywhere; asleep she answers "...ZZZ."
- **Live cats** (`LiveCat`): vignette modes groom / dream (Z + fish bubble) / gift, plus the wordmark. One shared rAF; offscreen canvases sleep via IntersectionObserver.
- **Buttons**: solid (yellow/ink), ghost (hairline), quiet (small hairline). 8px radius, no shadows.
- **kbd**: surface-2, hairline, 2px bottom border.

## Layout

Content column 1140px; prose ≤62ch. Section spacing `clamp(6.5rem, 13vw, 11rem)`. One idea per fold. Grids: `repeat(auto-fit, minmax(260-300px, 1fr))` for poses/lists/principles; 2-col feature grids collapse at 900px. The dev chapter sits on a full-bleed `--surface` band as the single tonal shift.

## Motion

Calm: one hero entrance (copy stagger + stage settle, 0.8s ease-out-quint), sparse IntersectionObserver reveals (fade + 22px rise, JS-armed so content is visible without JS), and the living cat provides all ambient motion. Product-semantic loops only: REC blink (steps), LED breathe, countdown drain. `prefers-reduced-motion`: reveals never arm, ambient rituals stop, blinking and boops remain.

## Voice

Calm, sincere, second-person about her ("she"). No hype verbs, no exclamation marks outside her bubbles, uppercase only inside pixel surfaces. Em-dashes rationed. Never guilt-flavored copy.
