# Sprite packs

Miru's looks are **packs**: self-contained sets of ASCII pixel-art frames plus
optional colors and animation hints. Three ship built in — `sticker` (the
default), `classic`, and `kawaii` — and you can add your own without touching
code. Settings → CAT → LOOK lists every pack she knows.

A pack is **pure data**. There is no code in a pack, so packs are safe to
share: the worst an invalid pack can do is be rejected with an error message.

## Where packs live

```
~/Library/Application Support/Miru/sprite-packs/<pack-id>/pack.json
```

The **directory name is the pack id** (lowercase letters, digits, `-`, `_`,
max 32 — `meta.id` inside the file is ignored). Settings → CAT → LOOK has
"packs folder" and "reload" buttons; invalid packs are skipped and their
errors shown there and in `GET /status`.

## pack.json

```json
{
  "meta": { "name": "Round Cat", "author": "you", "version": "1.0", "freckles": false },
  "regions": { "S": "scarf" },
  "regionDefaults": { "scarf": "#c94f4f" },
  "palettes": { "black": { "scarf": "#e0b03a" } },
  "cycles": { "groom": 500 },
  "anims": { "giftPresent": { "frame": "stretch_up", "sparkle": true } },
  "frames": { "sit": { "w": 16, "h": 12, "eyes": { "l": [3, 4], "r": [11, 4], "size": 2, "h": 2 }, "mouth": [7, 7], "rows": ["..."] } }
}
```

Everything except `frames.sit` is optional.

### Frames

Each frame is `{w, h, rows, eyes?, mouth?, pivot?, rim?, side?}`:

- `rows` — exactly `h` strings of exactly `w` characters. `.` is transparent;
  every other character must be a base region or one of your custom regions.
- `eyes` — `{l: [x,y], r: [x,y], size, h?, pw?, ph?}` anchors where the engine
  draws her live eyes (blinks, gaze, dilation). Omit (or use `{}`) to bake the
  face into the art instead — but **`sit` must have live `l` and `r` eyes**;
  the pixel editor and the resting face need them.
- `mouth` — `[x, y]` anchor for yawns, mlems, panting.
- `pivot` — row index for the drag pendulum (only meaningful on `hang`).
- `rim` — die-cut sticker treatment: the auto-outline wraps whiskers too and
  uses the skin's `rim` color.
- `side` — marks side-view frames; they are excluded from pixel-editor paint.

Base region characters (colored by the user's chosen skin):

```
L headL   R headR   M muzzle   i innerEar   n nose
B body    C chest   F paws     T tail       t tailTip
w outline P pawUp   G marking  D shading    p tongue   K keycap
```

### Custom regions and colors

`regions` maps **new** single characters to region names (base characters
can't be redefined). Color them with `regionDefaults` (all skins) and
`palettes` (per-skin overrides). Pack colors only ever apply to your custom
regions — the user's skin choice always wins for base regions, so every pack
works with every coat, pattern, photo palette, and custom color the user has.

### The state contract

The cat asks her pack for poses by name. **Only `sit` is required** — every
action pose degrades to the nearest thing you did draw, ending at `sit`, so a
three-frame pack already lives on the desktop. Add tiers as you go:

| Tier | Frames | What they unlock |
|------|--------|------------------|
| 1 | `sit_tail_mid`, `sit_tail_up` | idle tail sway; the listen pose |
| 2 | `loaf` | sleeping curled instead of sitting |
| 3 | `knead_l` + `knead_r`, `run_a` + `run_b` | typing kneads, scroll, cursor hunts, zoomies |
| 4 | `hang` (+`pivot`), `celebrate`, `stretch_up`, `crouch`, `leap` | drag dangle, hop, play-bow, pounce wind-up |
| 5 | `sit_groom1` + `sit_groom2`, `sit_flick`, `sit_wrap`, `loaf_twitch` | grooming, ear flicks, tail wraps, dream twitches |

Tier 5 frames are **rituals**: if a pack doesn't draw them, the ritual simply
never fires (she won't fake a lick on a static pose). Paired frames
(`knead_l/r`, `run_a/b`, `sit_groom1/2`) must ship together.

`cycles` retunes animation cadences in ms (`run` 90, `zoomies` 80, `knead`
320, `groom` 430, `scroll` 380 by default; min 30). `anims.giftPresent` names
the pose she takes for a moment when presenting an overnight gift — this is
the hook for pack-specific flourishes (the sticker pack play-bows over the
catch).

### Pixel paint

The Settings pixel editor paints on whatever pack is active, keyed per pack —
markings painted on one pack never bleed onto another's grid. Paint lands on
frames that share `sit`'s width and aren't `side` views.

## Limits and validation

Frames ≤ 48×48, ≤ 64 frames per pack, `pack.json` ≤ 512 KB, colors must be
hex (`#rgb`–`#rrggbbaa`). `lib/validatePack.js` is the single source of truth
and runs before a pack ever reaches the renderer. After editing art, run
`npm run preview <pack-id>` and actually look at the contact sheet.

One soft note: the window-level drag/hunt geometry assumes her body center is
roughly 70px above the window bottom (`CAT_ANCHOR_Y`, main.js). Very tall sit
frames shift where she grabs and aims — cosmetic, but keep sits under ~32
rows if you want the hold point to feel right.

## A complete starter pack

`docs/examples/roundcat/pack.json` in this repo is a valid Tier-1 pack (the
same file the test suite uses as its fixture). Copy it into
`sprite-packs/mycat/`, reload packs in Settings, and iterate from there.
