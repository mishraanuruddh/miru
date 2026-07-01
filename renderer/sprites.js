'use strict';
// Pixel-art cat sprites. Each frame is ASCII rows; chars map to color REGIONS,
// regions map to colors per SKIN. A cream outline is auto-generated around the
// silhouette. Eyes/nose/mouth/blush are drawn by drawCat at frame anchors.
//
// Region chars:
//   .  transparent       L  head left half     R  head right half
//   M  muzzle            i  inner ear          n  nose
//   B  body              C  chest/belly        F  paws/feet
//   T  tail              t  tail tip           w  whisker (outline color)
(function (global) {

  const REGION_OF = {
    L: 'headL', R: 'headR', M: 'muzzle', i: 'innerEar', n: 'nose',
    B: 'body', C: 'chest', F: 'paws', T: 'tail', t: 'tailTip', w: 'outline',
  };

  // ------------------------------------------------------------------ skins
  const CREAM = '#fdf8ec';
  const SKINS = {
    black: {
      label: 'Black',
      headL: '#23212b', headR: '#23212b', muzzle: '#23212b', body: '#23212b',
      chest: '#23212b', paws: '#23212b', tail: '#23212b', tailTip: '#23212b',
      innerEar: '#f2a0b5', nose: '#f2a0b5', iris: '#ffffff', pupil: '#23212b',
      outline: CREAM,
    },
    white: {
      label: 'White',
      headL: '#f6f3ec', headR: '#f6f3ec', muzzle: '#f6f3ec', body: '#f6f3ec',
      chest: '#f6f3ec', paws: '#f6f3ec', tail: '#f6f3ec', tailTip: '#e6e0d2',
      innerEar: '#f5b6c6', nose: '#ef8aa0', iris: '#ffffff', pupil: '#3a3644',
      outline: '#8f89a0',
    },
    gray: {
      label: 'Gray',
      headL: '#9298a5', headR: '#9298a5', muzzle: '#9298a5', body: '#9298a5',
      chest: '#d9dde3', paws: '#9298a5', tail: '#9298a5', tailTip: '#7c8290',
      innerEar: '#f2a0b5', nose: '#e98ba2', iris: '#ffffff', pupil: '#2e3138',
      outline: CREAM,
    },
    orange: {
      label: 'Orange',
      headL: '#ef9d3e', headR: '#ef9d3e', muzzle: '#f8e0b4', body: '#ef9d3e',
      chest: '#f8e0b4', paws: '#ef9d3e', tail: '#ef9d3e', tailTip: '#d97f23',
      innerEar: '#f7bba8', nose: '#e98b78', iris: '#ffffff', pupil: '#54381c',
      outline: CREAM,
    },
    calico: {
      label: 'Calico',
      headL: '#ef9d3e', headR: '#3a3640', muzzle: '#f6f3ec', body: '#f6f3ec',
      chest: '#f6f3ec', paws: '#f6f3ec', tail: '#3a3640', tailTip: '#ef9d3e',
      innerEar: '#f5b6c6', nose: '#ef8aa0', iris: '#ffffff', pupil: '#3a3644',
      outline: '#8f89a0',
    },
    tuxedo: {
      label: 'Tuxedo',
      headL: '#2e2b35', headR: '#2e2b35', muzzle: '#f6f3ec', body: '#2e2b35',
      chest: '#f6f3ec', paws: '#f6f3ec', tail: '#2e2b35', tailTip: '#2e2b35',
      innerEar: '#f2a0b5', nose: '#ef8aa0', iris: '#ffffff', pupil: '#2e2b35',
      outline: CREAM,
    },
    siamese: {
      label: 'Siamese',
      headL: '#efe6d2', headR: '#efe6d2', muzzle: '#6b5340', body: '#efe6d2',
      chest: '#efe6d2', paws: '#6b5340', tail: '#5b4634', tailTip: '#5b4634',
      innerEar: '#caa68f', nose: '#4a3527', iris: '#ffffff', pupil: '#3e7eb8',
      outline: '#8f89a0',
    },
  };

  // ----------------------------------------------------------------- frames
  // Front-facing frames live on a 24-wide grid. Head: cols 2-21, ears on top,
  // whiskers poke out at rows 8 and 10. Eyes are 4x4 sockets (anchors below).
  const HEAD = [
    '....L..............R....',
    '...LLL............RRR...',
    '...LiLL..........RRiR...',
    '...LLLLLLLLLLRRRRRRRR...',
    '..LLLLLLLLLLLRRRRRRRRR..',
    '..LLLLLLLLLLLRRRRRRRRR..',
    '..LLLLLLLLLLLRRRRRRRRR..',
    '..LLLLLLLLLLLRRRRRRRRR..',
    'wwLLLLLLLLLLLRRRRRRRRRww',
    '..LLLLLLLLLLLRRRRRRRRR..',
    'wwLLLLLLMMMnnMMMRRRRRRww',
    '...LLLLLMMMMMMMMRRRRR...',
    '....LLLLLMMMMMMRRRRR....',
  ];
  const EYES_FRONT = { l: [4, 5], r: [16, 5], size: 4 }; // 4x4 sockets
  const MOUTH_FRONT = [11, 11];

  // sit body (no tail) rows 13..20
  const SIT_BODY = [
    '.....BBBBBBBBBBBBBB.....',
    '....BBBBBCCCCCCBBBBB....',
    '....BBBBCCCCCCCCBBBB....',
    '...BBBBBCCCCCCCCBBBBB...',
    '...BBBBBCCCCCCCCBBBBB...',
    '...BBBBBCCCCCCCCBBBBB...',
    '...BBFFFFBCCCCBFFFFBB...',
    '.....FFF........FFF.....',
  ];

  // plump comma tails as overlays (24-wide rows aligned to full 21-row frame)
  function overlay(base, patches) {
    const rows = base.slice();
    for (const [idx, str] of patches) rows[idx] = str;
    return rows;
  }
  function merge(base, over) {
    return base.map((row, y) => {
      const o = over[y];
      if (!o) return row;
      let out = '';
      for (let x = 0; x < row.length; x++) out += o[x] && o[x] !== '.' ? o[x] : row[x];
      return out;
    });
  }
  const BLANK21 = Array(21).fill('.'.repeat(24));

  const TAIL_REST = overlay(BLANK21, [
    [14, '.....................tt.'],
    [15, '....................TTtt'],
    [16, '....................TTTT'],
    [17, '....................TTTT'],
    [18, '...................TTTT.'],
    [19, '..................TTTT..'],
  ]);
  const TAIL_MID = overlay(BLANK21, [
    [13, '.....................tt.'],
    [14, '....................TTt.'],
    [15, '....................TTT.'],
    [16, '....................TTT.'],
    [17, '...................TTTT.'],
    [18, '...................TTT..'],
    [19, '..................TTT...'],
  ]);
  const TAIL_UP = overlay(BLANK21, [
    [11, '....................tt..'],
    [12, '....................tt..'],
    [13, '....................TT..'],
    [14, '....................TT..'],
    [15, '....................TT..'],
    [16, '....................TTT.'],
    [17, '...................TTT..'],
    [18, '...................TTT..'],
    [19, '..................TTT...'],
  ]);

  const SIT_FULL = [...HEAD, ...SIT_BODY];

  const FRAMES = {};

  FRAMES.sit = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: merge(SIT_FULL, TAIL_REST),
  };
  FRAMES.sit_tail_mid = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: merge(SIT_FULL, TAIL_MID),
  };
  FRAMES.sit_tail_up = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: merge(SIT_FULL, TAIL_UP),
  };

  // kneading: one front paw lifts
  const KNEAD_BASE = [...HEAD, ...SIT_BODY];
  FRAMES.knead_l = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: merge(overlay(KNEAD_BASE, [
      [18, '...BBBBBBCCCCCCBBBBB....'],
      [19, '...BBFFFFBCCCCBFFFFBB...'],
      [20, '................FFF.....'],
    ]), TAIL_REST),
  };
  FRAMES.knead_r = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: merge(overlay(KNEAD_BASE, [
      [18, '....BBBBBCCCCCCBBBBBB...'],
      [19, '...BBFFFFBCCCCBFFFFBB...'],
      [20, '.....FFF................'],
    ]), TAIL_REST),
  };

  // loaf for sleeping: head + squat blob, tail wrapped around the front
  FRAMES.loaf = {
    w: 24, h: 18, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: [
      ...HEAD,
      '....BBBBBBBBBBBBBBBB....',
      '...BBBBBBBBBBBBBBBBBB...',
      '...BBBBBBBBBBBBBBBBBB...',
      '..TTTTTTBBBBBBBBBBBBB...',
      '..tttTTTTTT.............',
    ],
  };

  // dragged / hanging (mochi): long narrow body, paws up by chest, feet dangle
  FRAMES.hang = {
    w: 24, h: 26, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: [
      ...HEAD,
      '......BFFBBBBBBFFB......',
      '......BFFBCCCCBFFB......',
      '......BBBCCCCCCBBB......',
      '......BBBCCCCCCBBB......',
      '......BBBCCCCCCBBB..T...',
      '......BBBCCCCCCBBB..T...',
      '......BBBCCCCCCBBB.T....',
      '......BBBBCCCCBBBBT.....',
      '.......BBBBBBBBBBt......',
      '.......BFFB..BFFB.......',
      '........FF....FF........',
      '........................',
      '........................',
    ],
  };

  // celebrate: airborne happy hop — feet tucked, tail flung up (comnyang style)
  FRAMES.celebrate = {
    w: 24, h: 21, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
    rows: [
      ...HEAD,
      '.....BBBBBBBBBBBBB.tt...',
      '....BBBBBCCCCCCBBB.tt...',
      '....BBBBCCCCCCCCBBB.TT..',
      '...BBBBBCCCCCCCCBBB.TT..',
      '...BBBBBCCCCCCCCBBTTT...',
      '...BBBBBCCCCCCCCBBB.....',
      '....BFFFFBCCCCBFFFFB....',
      '........................',
    ],
  };

  // standing stretch, arms way up (28 wide)
  const pad2 = (r) => '..' + r + '..';
  {
    const rows = [];
    rows.push('.FF......................FF.');
    rows.push('.FF......................FF.');
    rows.push('.BB......................BB.');
    rows.push('.BB.' + HEAD[0].slice(2, 22) + '.BB.');
    rows.push('.BB.' + HEAD[1].slice(2, 22) + '.BB.');
    rows.push('.BB.' + HEAD[2].slice(2, 22) + '.BB.');
    rows.push('.BB.' + HEAD[3].slice(2, 22) + '.BB.');
    rows.push('.BB.' + HEAD[4].slice(2, 22) + '.BB.');
    for (let i = 5; i < HEAD.length; i++) rows.push(pad2(HEAD[i]));
    rows.push('.BBBBBBBBBBBBBBBBBBBBBBBBBB.');
    rows.push(pad2('.....BBBBCCCCCCCCBBBB...'));
    rows.push(pad2('.....BBBBCCCCCCCCBBBB.t.'));
    rows.push(pad2('.....BBBBCCCCCCCCBBBB.T.'));
    rows.push(pad2('.....BBBBCCCCCCCCBBBB.T.'));
    rows.push(pad2('.....BBBBCCCCCCCCBBBTT..'));
    rows.push(pad2('......BBBBBBBBBBBBBB....'));
    rows.push(pad2('......BFFB......BFFB....'));
    rows.push(pad2('.......FF........FF.....'));
    FRAMES.stretch_up = {
      w: 28, h: rows.length, eyes: { l: [6, 8], r: [18, 8], size: 4 }, mouth: [13, 14],
      rows,
    };
  }

  // run frames, side view, facing RIGHT (28 wide). Big single eye socket.
  FRAMES.run_a = {
    w: 28, h: 18, eyes: { l: [21, 5], r: null, size: 3 }, mouth: null, side: true,
    rows: [
      '....................L...R...'.slice(0, 28),
      '...................LL..RR...',
      '..ttt..............LLLLRR...',
      '..ttTT.............LLLLLL...',
      '...TTTT...........LLLLLLLL..',
      '....TTT...........LLLLLLLL..',
      '......BBBBBBBBBBBBLLLLLLLL..',
      '.....BBBBBBBBBBBBBLLLLLLLL..',
      '.....BBBBBBBBBBBBBBLLLLLL...',
      '.....BBBBBBBBBBBBBBBLLLL....',
      '....BBBBBBBBBBBBBBBB........',
      '....BFFB.........BFFB.......',
      '...BFF.............FFB......',
      '...FF...............FF......',
      '............................',
      '............................',
      '............................',
      '............................',
    ],
  };
  FRAMES.run_b = {
    w: 28, h: 18, eyes: { l: [21, 6], r: null, size: 3 }, mouth: null, side: true,
    rows: [
      '............................',
      '....................L...R...',
      '...................LL..RR...',
      '..ttt..............LLLLRR...',
      '..ttTT.............LLLLLL...',
      '...TTTT...........LLLLLLLL..',
      '....TTT...........LLLLLLLL..',
      '......BBBBBBBBBBBBLLLLLLLL..',
      '.....BBBBBBBBBBBBBLLLLLLLL..',
      '.....BBBBBBBBBBBBBBLLLLLL...',
      '.....BBBBBBBBBBBBBBBLLLL....',
      '......BBBBBBBBBBBBBB........',
      '.......BFFBBB..BBFFB........',
      '........FFF......FFF........',
      '............................',
      '............................',
      '............................',
      '............................',
    ],
  };
  FRAMES.leap = {
    w: 28, h: 18, eyes: { l: [21, 4], r: null, size: 3 }, mouth: null, side: true,
    rows: [
      '....................L...R...',
      '...................LL..RR...',
      '..tt...............LLLLRR...',
      '..ttT..............LLLLLL...',
      '...TTT............LLLLLLLL..',
      '....TTT...........LLLLLLLL..',
      '.....BBBBBBBBBBBBBLLLLLLLL..',
      '....BBBBBBBBBBBBBBLLLLLLLL..',
      '...BFFBBBBBBBBBBBBBLLLLFF...',
      '..BFF..BBBBBBBBBBBBBB..FF...',
      '..FF........................',
      '............................',
      '............................',
      '............................',
      '............................',
      '............................',
      '............................',
      '............................',
    ],
  };

  // ---------------------------------------------------------------- drawing
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // auto-outline: transparent cells 4-adjacent to a solid (non-whisker) cell
  const outlineCache = new WeakMap();
  function getOutline(frame) {
    let pts = outlineCache.get(frame);
    if (pts) return pts;
    pts = [];
    const { rows, w } = frame;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || y >= rows.length || x >= w) return false;
      const ch = rows[y][x];
      return ch !== '.' && ch !== 'w' && REGION_OF[ch] != null;
    };
    for (let y = -1; y <= rows.length; y++) {
      for (let x = -1; x <= w; x++) {
        const ch = y >= 0 && y < rows.length && x >= 0 && x < w ? rows[y][x] : '.';
        if (ch !== '.' && ch !== undefined) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          pts.push([x, y]);
        }
      }
    }
    outlineCache.set(frame, pts);
    return pts;
  }

  function lum(hex) {
    const [r, g, b] = hexToRgb(String(hex));
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }
  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function hex3(c) {
    return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  // face marks (closed eyes, mouth) need contrast against the fur
  function autoInk(skin) {
    return Math.abs(lum(skin.pupil) - lum(skin.headL)) > 50 ? skin.pupil : skin.iris;
  }

  // Draw the full cat. Fur is always the skin's true colors — overheat is
  // conveyed by steam/panting in the renderer, never by tinting pixels. opts:
  //   flip, alpha,
  //   eye: {style: 'open'|'closed'|'happy'|'squint', gx:0..2, gy:0..2}
  //   mouth: 'none'|'smile'|'open'|'w', blush: bool
  function drawCat(ctx, frame, skin, px, ox, oy, opts = {}) {
    const { rows, w } = frame;
    const X = (x) => ox + (opts.flip ? w - 1 - x : x) * px;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    // outline
    ctx.fillStyle = skin.outline || CREAM;
    for (const [x, y] of getOutline(frame)) {
      ctx.fillRect(X(x), oy + y * px, px, px);
    }

    // body pixels (+ optional pattern overlay: tabby stripes / spots)
    const STRIPEABLE = { headL: 1, headR: 1, body: 1, tail: 1 };
    const style = opts.style || 'plain';
    const patternColor = skin.patternColor || hex3(mixRgb(hexToRgb(skin.body), [0, 0, 0], 0.35));
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const region = REGION_OF[ch];
        if (!region) continue;
        let color = skin[region] || '#ff00ff';
        if (style !== 'plain' && STRIPEABLE[region]) {
          if (style === 'tabby' && (x + y * 2) % 6 < 2) color = patternColor;
          else if (style === 'spots' && (((x >> 1) * 37 + (y >> 1) * 53) % 23) < 4) color = patternColor;
        }
        ctx.fillStyle = color;
        ctx.fillRect(X(x), oy + y * px, px, px);
      }
    }

    // pixel-level overrides (face markings etc.) — only on 24-wide front
    // frames where art coordinates line up; only recolors existing pixels
    if (opts.overrides && w === 24) {
      for (const key in opts.overrides) {
        const [px2, py2] = key.split(',').map(Number);
        if (!(py2 >= 0 && py2 < rows.length)) continue;
        const ch = rows[py2][px2];
        if (!ch || ch === '.' || ch === 'w') continue;
        ctx.fillStyle = opts.overrides[key];
        ctx.fillRect(X(px2), oy + py2 * px, px, px);
      }
    }

    if (opts.skipFace) { ctx.restore(); return; }

    // ---- face
    const eye = opts.eye || { style: 'open', gx: 1, gy: 1 };
    const eyes = frame.eyes || {};
    const size = eyes.size || 4;
    const ink = opts.faceInk || autoInk(skin);
    for (const k of ['l', 'r']) {
      const e = eyes[k];
      if (!e) continue;
      let exArt = e[0];
      if (opts.flip) exArt = w - exArt - size;
      const Ex = ox + exArt * px, Ey = oy + e[1] * px;
      if (eye.style === 'closed' || eye.style === 'squint') {
        ctx.fillStyle = ink;
        ctx.fillRect(Ex, Ey + ((eyes.h || size) - 1.4) * px, size * px, px);
        if (eye.style === 'squint') ctx.fillRect(Ex + px * 0.5, Ey + (size - 2.2) * px, (size - 1) * px, px * 0.6);
        continue;
      }
      if (eye.style === 'happy') {
        // ∪ flipped arc (∩): two side dots + raised middle
        ctx.fillStyle = ink;
        ctx.fillRect(Ex, Ey + (size - 2) * px, px, px);
        ctx.fillRect(Ex + px, Ey + (size - 3) * px, (size - 2) * px, px);
        ctx.fillRect(Ex + (size - 1) * px, Ey + (size - 2) * px, px, px);
        continue;
      }
      // open: white socket + pupil at gaze position (+ sparkle on big eyes);
      // dark cats get a lightened-fur pupil so the big eyes still read
      const sh = eyes.h || size;
      ctx.fillStyle = skin.iris;
      ctx.fillRect(Ex, Ey, size * px, sh * px);
      const lowC = Math.abs(lum(skin.pupil) - lum(skin.iris)) < 60;
      ctx.fillStyle = lowC ? skin.pupil
        : Math.abs(lum(skin.pupil) - lum(skin.headL)) < 50 && size >= 5
          ? hex3(mixRgb(hexToRgb(skin.headL), [110, 116, 138], 0.45))
          : skin.pupil;
      let pw = size >= 5 ? 3 : 2;            // pupil width
      let ph = Math.min(pw, sh);             // pupil height
      if (eye.dilate) {                       // interest/affection: wider, rounder
        pw = Math.min(pw + 1, size - 1);
        ph = Math.min(ph + 1, sh);
      }
      const gx = Math.max(0, Math.min(size - pw, eye.gx ?? 1));
      const gy = Math.max(0, Math.min(sh - ph, eye.gy ?? 1));
      ctx.fillRect(Ex + gx * px, Ey + gy * px, pw * px, ph * px);
      if (size >= 5) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Ex + gx * px, Ey + gy * px, px, px); // glint
      }
    }

    // mouth marks
    if (frame.mouth && opts.mouth && opts.mouth !== 'none') {
      const [mx, my] = frame.mouth;
      const Mx = ox + (opts.flip ? w - mx - 2 : mx) * px, My = oy + my * px;
      ctx.fillStyle = opts.faceInk || ink;
      if (opts.mouth === 'open') {
        ctx.fillRect(Mx, My, 2 * px, px * 0.8);
        ctx.fillRect(Mx + px * 0.25, My + px * 0.8, px * 1.5, px * 0.8);
        ctx.fillStyle = '#ef8aa0';
        ctx.fillRect(Mx + px * 0.5, My + px * 1.1, px, px * 0.5);
      } else if (opts.mouth === 'w') {
        ctx.fillRect(Mx - px, My + px * 0.2, px, px * 0.5);
        ctx.fillRect(Mx, My + px * 0.55, 2 * px, px * 0.5);
        ctx.fillRect(Mx + 2 * px, My + px * 0.2, px, px * 0.5);
      } else if (opts.mouth === 'smile') {
        ctx.fillRect(Mx, My + px * 0.3, 2 * px, px * 0.5);
      }
    }

    // blush
    if (opts.blush && eyes.l && eyes.r) {
      ctx.fillStyle = 'rgba(244,114,140,0.8)';
      ctx.fillRect(ox + (eyes.l[0] - 1) * px, oy + (eyes.l[1] + size + 0.4) * px, 2.5 * px, px);
      ctx.fillRect(ox + (eyes.r[0] + size - 1.5) * px, oy + (eyes.r[1] + size + 0.4) * px, 2.5 * px, px);
    }

    ctx.restore();
  }

  // back-compat body-only draw (used by previews)
  function drawFrame(ctx, frame, skin, px, ox, oy, opts = {}) {
    drawCat(ctx, frame, skin, px, ox, oy, { ...opts, eye: opts.eye || { style: 'open', gx: 1, gy: 1 } });
  }

  // ------------------------------------------------- kawaii set (cute af)
  // Same 24-wide grid + head bounds as classic, so pixel overrides and photo
  // markings land identically. Bigger glint eyes, cheek bulge, bean body.
  const KHEAD = [
    '....LL............RR....',
    '...LLLL..........RRRR...',
    '...LiiL..........RiiR...',
    '..LLLLLLLLLLRRRRRRRRRR..',
    '.LLLLLLLLLLLRRRRRRRRRRR.',
    '.LLLLLLLLLLLRRRRRRRRRRR.',
    'wLLLLLLLLLLLRRRRRRRRRRRw',
    '.LLLLLLLLLLLRRRRRRRRRRR.',
    'wLLLLLLLLLLLRRRRRRRRRRRw',
    '.LLLLLLLLLnnRRRRRRRRRRR.',
    '..LLLLLLLMMMMRRRRRRRRR..',
    '...LLLLLLMMMMRRRRRRRR...',
  ];
  const KEYES = { l: [3, 6], r: [16, 6], size: 5, h: 4 }; // low-set, baby schema
  const KMOUTH = [11, 10];

  // pusheen-style loaf: no neck, body continues the head
  const KSIT_BODY = [
    '..BBBBBBBBBBBBBBBBBBBB..',
    '..BBBBBCCCCCCCCCCBBBBB..',
    '..BBBBBCCCCCCCCCCBBBBB..',
    '..BBBBBCCCCCCCCCCBBBBB..',
    '..BBFFFBCCCCCCCCBFFFBB..',
    '...FFFF..........FFFF...',
  ];
  const KBLANK = Array(18).fill('.'.repeat(24));
  const KTAIL_REST = overlay(KBLANK, [
    [11, '....................TTT.'],
    [12, '...................TTTTT'],
    [13, '...................TTtTT'],
    [14, '...................TTTTT'],
    [15, '....................TTT.'],
  ]);
  const KTAIL_MID = overlay(KBLANK, [
    [10, '.....................TT.'],
    [11, '....................TTTT'],
    [12, '...................TTTTT'],
    [13, '...................TTtT.'],
    [14, '...................TTTT.'],
    [15, '....................TT..'],
  ]);
  const KTAIL_UP = overlay(KBLANK, [
    [8,  '.....................tt.'],
    [9,  '....................TTTT'],
    [10, '....................TTTT'],
    [11, '....................TTT.'],
    [12, '...................TTT..'],
    [13, '...................TTT..'],
    [14, '...................TT...'],
  ]);
  const KSIT = [...KHEAD, ...KSIT_BODY];

  const KFRAMES = {};
  KFRAMES.sit = { w: 24, h: 18, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_REST) };
  KFRAMES.sit_tail_mid = { w: 24, h: 18, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_MID) };
  KFRAMES.sit_tail_up = { w: 24, h: 18, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_UP) };
  KFRAMES.knead_l = {
    w: 24, h: 18, eyes: KEYES, mouth: KMOUTH,
    rows: merge(overlay(KSIT, [
      [16, '..BBFFFCCCCCCCCCCFFFB...'],
      [17, '....BBFF.........FFFF...'],
    ]), KTAIL_REST),
  };
  KFRAMES.knead_r = {
    w: 24, h: 18, eyes: KEYES, mouth: KMOUTH,
    rows: merge(overlay(KSIT, [
      [16, '...BFFFCCCCCCCCCCFFFBB..'],
      [17, '...FFFF.........FFBB....'],
    ]), KTAIL_REST),
  };
  KFRAMES.loaf = {
    w: 24, h: 17, eyes: KEYES, mouth: KMOUTH,
    rows: [
      ...KHEAD,
      '..BBBBBBBBBBBBBBBBBBBB..',
      '..BBBBBBBBBBBBBBBBBBBB..',
      '..BBBBBBBBBBBBBBBBBBBB..',
      '.TTTTTBBBBBBBBBBBBBBBB..',
      '.tttTTTT................',
    ],
  };
  KFRAMES.hang = {
    w: 24, h: 24, eyes: KEYES, mouth: KMOUTH,
    rows: [
      ...KHEAD,
      '......BFFBBBBBBFFB......',
      '......BFFBCCCCBFFB......',
      '.......BBCCCCCCBB..T....',
      '.......BBCCCCCCBB..T....',
      '.......BBCCCCCCBB.T.....',
      '.......BBBCCCCBBBT......',
      '........BBBBBBBBt.......',
      '........FF...FF.........',
      '........FF...FF.........',
      '........................',
      '........................',
      '........................',
    ],
  };
  KFRAMES.celebrate = {
    w: 24, h: 18, eyes: KEYES, mouth: KMOUTH,
    rows: [
      ...KHEAD,
      '..BBBBBBBBBBBBBBBBB.tt..',
      '..BBBBBCCCCCCCCCCBB.tt..',
      '..BBBBBCCCCCCCCCCBBTT...',
      '..BBBBBCCCCCCCCCCBTT....',
      '...BFFFBCCCCCCCCBFFFB...',
      '........................',
    ],
  };
  {
    const pad2k = (r) => '..' + r + '..';
    const rows = [];
    rows.push('.FF......................FF.');
    rows.push('.FF......................FF.');
    rows.push('.BB......................BB.');
    rows.push('.BB.' + KHEAD[0].slice(2, 22) + '.BB.');
    rows.push('.BB.' + KHEAD[1].slice(2, 22) + '.BB.');
    rows.push('.BB.' + KHEAD[2].slice(2, 22) + '.BB.');
    rows.push('.BB.' + KHEAD[3].slice(2, 22) + '.BB.');
    for (let i = 4; i < KHEAD.length; i++) rows.push(pad2k(KHEAD[i]));
    rows.push('.BBBBBBBBBBBBBBBBBBBBBBBBBB.');
    rows.push(pad2k('.....BBBCCCCCCCCCCBB....'));
    rows.push(pad2k('.....BBBCCCCCCCCCCBB.t..'));
    rows.push(pad2k('.....BBBCCCCCCCCCCBB.T..'));
    rows.push(pad2k('.....BBBCCCCCCCCCCBBTT..'));
    rows.push(pad2k('......BBBBBBBBBBBB......'));
    rows.push(pad2k('......BFFB....BFFB......'));
    KFRAMES.stretch_up = {
      w: 28, h: rows.length, eyes: { l: [5, 9], r: [18, 9], size: 5, h: 4 }, mouth: [13, 13],
      rows,
    };
  }
  {
    const flickHead = KHEAD.slice();
    flickHead[0] = '..................RR....';
    flickHead[1] = '...LLL...........RRRR...';
    flickHead[2] = '...LiiLL.........RiiR...';
    KFRAMES.sit_flick = {
      w: 24, h: 18, eyes: KEYES, mouth: KMOUTH,
      rows: merge([...flickHead, ...KSIT_BODY], KTAIL_REST),
    };
  }

  // side-view action frames shared with classic (they read well at speed)
  KFRAMES.run_a = FRAMES.run_a;
  KFRAMES.run_b = FRAMES.run_b;
  KFRAMES.leap = FRAMES.leap;

  const SPRITE_SETS = { kawaii: KFRAMES, classic: FRAMES };
  function framesFor(style) {
    return SPRITE_SETS[style] || SPRITE_SETS.kawaii;
  }

  const API = { FRAMES, KFRAMES, SPRITE_SETS, framesFor, SKINS, REGION_OF, drawCat, drawFrame, hexToRgb, getOutline, autoInk };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Sprites = API;
})(typeof window !== 'undefined' ? window : globalThis);
