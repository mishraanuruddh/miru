'use strict';
// Photo -> skin pipeline test: renders [photo | palette | resulting cat] rows
// for each test photo so the "match my cat" heuristics can be judged visually.
//
// Fixtures (not shipped): /tmp/catphotos/<name>.bin — a big-endian uint32 w,
// uint32 h header followed by raw RGBA bytes. From any image, e.g.:
//   python3 -c "from PIL import Image; import struct, sys; \
//     im = Image.open(sys.argv[1]).convert('RGBA'); \
//     open('/tmp/catphotos/mycat.bin','wb').write( \
//       struct.pack('>II', *im.size) + im.tobytes())" photo.jpg
// Then: node tools/test-photo.js   ->   /tmp/pixelpaw-photo-test.png
const fs = require('fs');
const { encodePNG } = require('../lib/png');
const { FRAMES, SKINS, drawCat } = require('../renderer/sprites');
const { extractPalette, paletteToSkin } = require('../renderer/palette');

function parseColor(c) {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] != null ? Math.round(p[3] * 255) : 255]; }
  return [255, 0, 255, 255];
}
class Ctx {
  constructor(w, h, bg) {
    this.w = w; this.h = h; this.data = Buffer.alloc(w * h * 4);
    this.fillStyle = '#000'; this.globalAlpha = 1;
    if (bg) { this.fillStyle = bg; this.fillRect(0, 0, w, h); }
  }
  save() {} restore() { this.globalAlpha = 1; }
  fillRect(x, y, w, h) {
    const [r, g, b, a] = parseColor(this.fillStyle);
    const al = (a / 255) * this.globalAlpha;
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      if (yy < 0 || yy >= this.h) continue;
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        if (xx < 0 || xx >= this.w) continue;
        const i = (yy * this.w + xx) * 4;
        this.data[i] = Math.round(r * al + this.data[i] * (1 - al));
        this.data[i + 1] = Math.round(g * al + this.data[i + 1] * (1 - al));
        this.data[i + 2] = Math.round(b * al + this.data[i + 2] * (1 - al));
        this.data[i + 3] = 255;
      }
    }
  }
}

const names = ['user', 'black', 'orange', 'calico', 'siamese', 'gray', 'tuxedo'];
const ROW_H = 150, COL_PHOTO = 140, COL_PAL = 120, COL_CAT = 160;
const W = COL_PHOTO + COL_PAL + COL_CAT, H = names.length * ROW_H;
const ctx = new Ctx(W, H, '#3e4e62');

let row = 0;
for (const name of names) {
  const p = `/tmp/catphotos/${name}.bin`;
  if (!fs.existsSync(p)) { row++; continue; }
  const buf = fs.readFileSync(p);
  const w = buf.readUInt32BE(0), h = buf.readUInt32BE(4);
  const px = buf.subarray(8);

  const oy = row * ROW_H;
  // photo thumb (nearest-neighbor fit into COL_PHOTO x ROW_H)
  const scale = Math.min((COL_PHOTO - 10) / w, (ROW_H - 10) / h);
  const tw = Math.floor(w * scale), th = Math.floor(h * scale);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = ((Math.floor(y / scale) * w) + Math.floor(x / scale)) * 4;
      ctx.fillStyle = `rgba(${px[si]},${px[si + 1]},${px[si + 2]},1)`;
      ctx.fillRect(5 + x, oy + 5 + y, 1, 1);
    }
  }

  const clusters = extractPalette(px, w, h);
  const skin = paletteToSkin(clusters);

  // palette swatches with score bars
  clusters.slice(0, 6).forEach((c, i) => {
    ctx.fillStyle = c.hex;
    ctx.fillRect(COL_PHOTO + 6, oy + 6 + i * 23, 34, 20);
    ctx.fillStyle = '#14131a';
    ctx.fillRect(COL_PHOTO + 44, oy + 12 + i * 23, 60, 7);
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(COL_PHOTO + 44, oy + 12 + i * 23, Math.max(1, c.score * 160), 7);
  });

  // resulting cat
  if (skin) {
    const f = FRAMES.sit;
    drawCat(ctx, f, { ...SKINS.black, ...skin }, 5, COL_PHOTO + COL_PAL + (COL_CAT - f.w * 5) / 2, oy + ROW_H - f.h * 5 - 8, {
      eye: { style: 'open', gx: 1, gy: 1 },
    });
  }
  row++;
}

fs.writeFileSync('/tmp/pixelpaw-photo-test.png', encodePNG(ctx.w, ctx.h, ctx.data));
console.log('wrote /tmp/pixelpaw-photo-test.png — rows: ' + names.join(', '));
