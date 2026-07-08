'use strict';
// Renders a contact sheet of one pack's frames x skins to a PNG for review.
//   node tools/preview.js [out.png] [furStyle] [packId | path/to/pack.json]
// Cells size themselves to the pack's tallest/widest frame, so a 40-row
// dangle pose gets room instead of clipping. Point it at a pack.json to
// proof a user pack before installing it.
const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../lib/png');
const Sprites = require('../renderer/sprites');
const { SKINS, drawCat, getPack, listPacks, registerPack, resolveSkin } = Sprites;

const packArg = process.argv[4] || 'sticker';
let pack;
if (packArg.includes('/') || packArg.endsWith('.json')) {
  const { validatePack } = require('../lib/validatePack');
  const file = path.resolve(packArg);
  const id = path.basename(file) === 'pack.json'
    ? path.basename(path.dirname(file))
    : path.basename(file, '.json');
  const { pack: def, errors } = validatePack(id, JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!def) {
    console.error('invalid pack:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  pack = registerPack(def);
} else {
  pack = getPack(packArg);
  if (!pack) {
    console.error('unknown pack "' + packArg + '" — available: ' + listPacks().map((p) => p.meta.id).join(', '));
    process.exit(1);
  }
}
const FRAMES = pack.frames;

function parseColor(c) {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p[3] != null ? Math.round(p[3] * 255) : 255];
  }
  return [255, 0, 255, 255];
}

class ShimCtx {
  constructor(w, h, bg) {
    this.w = w; this.h = h;
    this.data = Buffer.alloc(w * h * 4);
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    if (bg) { this.fillStyle = bg; this.fillRect(0, 0, w, h); }
  }
  save() {} restore() { this.globalAlpha = 1; }
  fillRect(x, y, w, h) {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const alpha = (a / 255) * this.globalAlpha;
    const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) {
      if (yy < 0 || yy >= this.h) continue;
      for (let xx = x0; xx < x1; xx++) {
        if (xx < 0 || xx >= this.w) continue;
        const i = (yy * this.w + xx) * 4;
        this.data[i] = Math.round(r * alpha + this.data[i] * (1 - alpha));
        this.data[i + 1] = Math.round(g * alpha + this.data[i + 1] * (1 - alpha));
        this.data[i + 2] = Math.round(b * alpha + this.data[i + 2] * (1 - alpha));
        this.data[i + 3] = 255;
      }
    }
  }
}

const skinIds = Object.keys(SKINS);
const frameIds = Object.keys(FRAMES);
const PX = 6, PAD = 14;
// the sheet's cells fit this pack's biggest frame (rim ring needs +2 cells)
const maxW = Math.max(...frameIds.map((id) => FRAMES[id].w));
const maxH = Math.max(...frameIds.map((id) => FRAMES[id].h));
const CELL_W = (maxW + 4) * PX, CELL_H = (maxH + 4) * PX;

// optional: pick eye style per frame for a livelier sheet
const EYE_BY_FRAME = {
  loaf: { style: 'closed' },
  loaf_twitch: { style: 'closed' },
  sit_groom1: { style: 'happy' },
  sit_groom2: { style: 'happy' },
  crouch: { style: 'open', gx: 1, gy: 1, dilate: true },
  celebrate: { style: 'happy' },
  knead_l: { style: 'open', gx: 1, gy: 2 },
  knead_r: { style: 'open', gx: 1, gy: 2 },
};
const MOUTH_BY_FRAME = { celebrate: 'open' };
const DEFAULT_MOUTH = 'none';

const sheetW = PAD + frameIds.length * (CELL_W + PAD);
const sheetH = PAD + skinIds.length * (CELL_H + PAD);
const ctx = new ShimCtx(sheetW, sheetH, '#4a6a56');

skinIds.forEach((sid, row) => {
  frameIds.forEach((fid, col) => {
    const f = FRAMES[fid];
    const cellX = PAD + col * (CELL_W + PAD), cellY = PAD + row * (CELL_H + PAD);
    ctx.fillStyle = row % 2 ? '#42604e' : '#3c5848';
    ctx.fillRect(cellX, cellY, CELL_W, CELL_H);
    const ox = cellX + Math.floor((CELL_W - f.w * PX) / 2);
    const oy = cellY + (CELL_H - f.rows.length * PX) - PX;
    drawCat(ctx, f, resolveSkin(pack, sid), PX, ox, oy, {
      eye: EYE_BY_FRAME[fid] || { style: 'open', gx: 1, gy: 1 },
      mouth: MOUTH_BY_FRAME[fid] || DEFAULT_MOUTH,
      style: process.argv[3] || 'plain',
      freckles: !!pack.meta.freckles,
    });
  });
});

const out = process.argv[2] || '/tmp/miru-preview.png';
fs.writeFileSync(out, encodePNG(ctx.w, ctx.h, ctx.data));
console.log('pack: ' + pack.meta.id + ' | frames: ' + frameIds.join(', '));
console.log('wrote ' + out + ' (' + ctx.w + 'x' + ctx.h + ')');
