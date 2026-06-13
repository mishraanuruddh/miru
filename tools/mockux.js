'use strict';
// UX mockups for the "cat as gateway" launcher: 3 variants rendered at real
// window scale so we can judge before implementing.
const fs = require('fs');
const { encodePNG } = require('../lib/png');
const { FRAMES, SKINS, drawCat } = require('../renderer/sprites');
const PixelFont = require('../renderer/font');

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

class Ctx {
  constructor(w, h, bg) {
    this.w = w; this.h = h;
    this.data = Buffer.alloc(w * h * 4);
    this.fillStyle = '#000';
    this.globalAlpha = 1;
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

// ------------------------------------------------------------ pixel icons 9x9
const ICONS = {
  mic: [
    '...XXX...',
    '..XXXXX..',
    '..XXXXX..',
    '..XXXXX..',
    '..XXXXX..',
    'X..XXX..X',
    '.X.....X.',
    '..XXXXX..',
    '....X....',
  ],
  rocket: [
    '....X....',
    '...XXX...',
    '...XXX...',
    '..XXXXX..',
    '..XX.XX..',
    '..XXXXX..',
    '.X XXX X.'.replace(/ /g, '.'),
    'X..XXX..X',
    '...X.X...',
  ],
  tasks: [
    'XXXXXXXXX',
    'X.......X',
    'X.XX..XXX',
    'X.......X',
    'X.XX..X.X',
    'X......XX',
    'X.XX..X.X',
    'X.......X',
    'XXXXXXXXX',
  ],
  msg: [
    '.XXXXXXX.',
    'XXXXXXXXX',
    'X..X.X..X'.replace(/X\.\.X/, 'X..X'),
    'XXXXXXXXX',
    '.XXXXXXX.',
    '...XX....',
    '..XX.....',
    '.X.......',
    '.........',
  ],
  gear: [
    '....X....',
    '.X.XXX.X.',
    '..XXXXX..',
    '.XXX.XXX.',
    'XXX...XXX',
    '.XXX.XXX.',
    '..XXXXX..',
    '.X.XXX.X.',
    '....X....',
  ],
};

function drawIcon(ctx, name, x, y, px, color) {
  const art = ICONS[name];
  ctx.fillStyle = color;
  for (let r = 0; r < art.length; r++) {
    for (let c = 0; c < art[r].length; c++) {
      if (art[r][c] === 'X') ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  }
}

const ITEMS = [
  { icon: 'mic', label: 'VOICE' },
  { icon: 'rocket', label: 'APPS' },
  { icon: 'tasks', label: 'TASKS' },
  { icon: 'msg', label: 'INBOX' },
  { icon: 'gear', label: 'MORE' },
];

const W = 380, H = 330, SCALE = 4;

function base(title) {
  const ctx = new Ctx(W, H, '#3e4e62');
  // cat bottom-center
  const f = FRAMES.sit;
  drawCat(ctx, f, SKINS.black, SCALE, W / 2 - (f.w * SCALE) / 2, H - 12 - f.h * SCALE, {
    eye: { style: 'open', gx: 1, gy: 0 },
  });
  PixelFont.draw(ctx, title, 8, 8, 2, '#ffd400');
  return ctx;
}

function button(ctx, x, y, size, icon, hovered) {
  ctx.fillStyle = '#14131a';
  ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
  ctx.fillStyle = hovered ? '#ffd400' : '#26242e';
  ctx.fillRect(x, y, size, size);
  const px = Math.floor(size / 11);
  const pad = Math.floor((size - 9 * px * 1.0) / 2);
  drawIcon(ctx, icon, x + pad, y + pad, px, hovered ? '#14131a' : '#fdf8ec');
}

function labelChip(ctx, text, cx, y) {
  const w = PixelFont.measure(text, 2) + 10;
  const x = Math.max(3, Math.min(W - w - 3, cx - w / 2));
  ctx.fillStyle = '#14131a';
  ctx.fillRect(x, y, w, 13);
  PixelFont.draw(ctx, text, x + 5, y + 3, 2, '#ffd400');
}

// ---------------------------------------------------------------- variant A
function variantA() {
  const ctx = base('A  PAW ARC');
  const catCx = W / 2, catCy = H - 12 - 10 * SCALE; // cat center-ish
  const R = 92, size = 34;
  const angles = [200, 235, 270, 305, 340]; // degrees, around upper hemisphere
  ITEMS.forEach((it, i) => {
    const a = (angles[i] * Math.PI) / 180;
    const bx = catCx + Math.cos(a) * R - size / 2;
    const by = catCy + Math.sin(a) * R - size / 2 - 18;
    const hovered = i === 0;
    button(ctx, bx, by, size, it.icon, hovered);
    if (hovered) labelChip(ctx, it.label + ' - DICTATE (MURMUR)', bx + size / 2, by - 18);
  });
  return ctx;
}

// ---------------------------------------------------------------- variant B
function variantB() {
  const ctx = base('B  SHELF');
  const size = 32, gap = 6;
  const total = ITEMS.length * (size + gap) + 10;
  const x0 = W / 2 - 12 * SCALE - total + 2; // slides out to the left of the cat
  const y = H - 12 - 12 * SCALE;
  // shelf strip
  ctx.fillStyle = '#14131a';
  ctx.fillRect(x0 - 4, y - 6, total + 14, size + 12);
  ctx.fillStyle = '#1d1c24';
  ctx.fillRect(x0 - 2, y - 4, total + 10, size + 8);
  ITEMS.forEach((it, i) => {
    const bx = x0 + 4 + i * (size + gap);
    const hovered = i === 0;
    button(ctx, bx, y, size, it.icon, hovered);
    if (hovered) labelChip(ctx, it.label + ' - DICTATE', bx + size / 2, y - 22);
  });
  return ctx;
}

// ---------------------------------------------------------------- variant C
function variantC() {
  const ctx = base('C  LIST PANEL');
  const w = 240;
  const x = W / 2 - w / 2;
  const rows = [
    ['mic', 'VOICE', 'DICTATE ANYWHERE'],
    ['rocket', 'APPS', 'VS CODE - ITERM'],
    ['tasks', 'TASKS', '3 OPEN'],
    ['msg', 'INBOX', '2 NEW'],
    ['gear', 'MORE', 'SETTINGS'],
  ];
  const rowH = 24, h = 14 + rows.length * (rowH + 3) + 6;
  const sitTop = H - 12 - 21 * SCALE;
  const y = sitTop - 6 - h - 8;
  ctx.fillStyle = '#14131a';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#fffef8';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(x, y, w, 12);
  PixelFont.draw(ctx, 'CAT MENU', x + 6, y + 3, 2, '#14131a');
  // tail
  ctx.fillStyle = '#14131a';
  ctx.fillRect(W / 2 - 4, y + h + 2, 8, 4);
  rows.forEach(([icon, label, hint], i) => {
    const ry = y + 16 + i * (rowH + 3);
    const hovered = i === 0;
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x + 5, ry - 1, w - 10, rowH + 2);
    ctx.fillStyle = hovered ? '#ffd400' : '#26242e';
    ctx.fillRect(x + 6, ry, w - 12, rowH);
    drawIcon(ctx, icon, x + 11, ry + 3, 2, hovered ? '#14131a' : '#fdf8ec');
    PixelFont.draw(ctx, label, x + 34, ry + 4, 2, hovered ? '#14131a' : '#fdf8ec');
    PixelFont.draw(ctx, hint, x + 34, ry + 15, 1.4, hovered ? '#3a3320' : '#8a8794');
  });
  return ctx;
}

// composite side by side
const variants = [variantA(), variantB(), variantC()];
const PAD = 10;
const SW = variants.length * (W + PAD) + PAD, SH = H + 2 * PAD;
const sheet = new Ctx(SW, SH, '#22262e');
variants.forEach((v, i) => {
  const ox = PAD + i * (W + PAD);
  for (let y = 0; y < H; y++) {
    v.data.copy(sheet.data, ((PAD + y) * SW + ox) * 4, y * W * 4, (y + 1) * W * 4);
  }
});
fs.writeFileSync('/tmp/pixelpaw-ux-variants.png', encodePNG(SW, SH, sheet.data));
console.log('wrote /tmp/pixelpaw-ux-variants.png');
