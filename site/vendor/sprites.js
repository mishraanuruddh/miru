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
    P: 'pawUp', // raised paw: auto-shaded vs the fur so it reads on solid cats
    G: 'marking', // gray patches: collar, cheek dots, tail + haunch shading
    D: 'shading', // deep creases: inner ear, under the stretch arch
  };

  // ------------------------------------------------------------------ skins
  const CREAM = '#fdf8ec';
  const SKINS = {
    black: {
      label: 'Black',
      headL: '#23212b', headR: '#23212b', muzzle: '#23212b', body: '#23212b',
      chest: '#23212b', paws: '#23212b', tail: '#23212b', tailTip: '#23212b',
      innerEar: '#f2a0b5', nose: '#f2a0b5', iris: '#ffffff', pupil: '#23212b',
      outline: CREAM, marking: '#332f3d', shading: '#413c4d', rim: '#fefefe',
    },
    white: {
      label: 'White',
      headL: '#fefefe', headR: '#fefefe', muzzle: '#fefefe', body: '#fefefe',
      chest: '#fefefe', paws: '#fefefe', tail: '#fefefe', tailTip: '#fefefe',
      innerEar: '#b0b0b0', nose: '#181818', iris: '#ffffff', pupil: '#181818',
      outline: '#181818', marking: '#b0b0b0', shading: '#7d7f7a', rim: '#fefefe',
    },
    gray: {
      label: 'Gray',
      headL: '#9298a5', headR: '#9298a5', muzzle: '#9298a5', body: '#9298a5',
      chest: '#d9dde3', paws: '#9298a5', tail: '#9298a5', tailTip: '#7c8290',
      innerEar: '#f2a0b5', nose: '#e98ba2', iris: '#ffffff', pupil: '#181818',
      outline: '#181818', marking: '#767d8b', shading: '#5d626d', rim: '#fefefe',
    },
    orange: {
      label: 'Orange',
      headL: '#ef9d3e', headR: '#ef9d3e', muzzle: '#f8e0b4', body: '#ef9d3e',
      chest: '#f8e0b4', paws: '#ef9d3e', tail: '#ef9d3e', tailTip: '#d97f23',
      innerEar: '#f7bba8', nose: '#e98b78', iris: '#ffffff', pupil: '#54381c',
      outline: '#181818', marking: '#d97f23', shading: '#b5651d', rim: '#fefefe',
    },
    calico: {
      label: 'Calico',
      headL: '#ef9d3e', headR: '#3a3640', muzzle: '#fefefe', body: '#fefefe',
      chest: '#fefefe', paws: '#fefefe', tail: '#3a3640', tailTip: '#ef9d3e',
      innerEar: '#f5b6c6', nose: '#ef8aa0', iris: '#ffffff', pupil: '#181818',
      outline: '#181818', marking: '#ef9d3e', shading: '#b0742e', rim: '#fefefe',
    },
    tuxedo: {
      label: 'Tuxedo',
      headL: '#2e2b35', headR: '#2e2b35', muzzle: '#f6f3ec', body: '#2e2b35',
      chest: '#f6f3ec', paws: '#f6f3ec', tail: '#2e2b35', tailTip: '#2e2b35',
      innerEar: '#f2a0b5', nose: '#ef8aa0', iris: '#ffffff', pupil: '#2e2b35',
      outline: CREAM, marking: '#3d3947', shading: '#4a4556', rim: '#fefefe',
    },
    siamese: {
      label: 'Siamese',
      headL: '#efe6d2', headR: '#efe6d2', muzzle: '#6b5340', body: '#efe6d2',
      chest: '#efe6d2', paws: '#6b5340', tail: '#5b4634', tailTip: '#5b4634',
      innerEar: '#caa68f', nose: '#4a3527', iris: '#ffffff', pupil: '#3e7eb8',
      outline: '#181818', marking: '#d6c8ac', shading: '#8a7660', rim: '#fefefe',
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
    w: 24, h: 26, pivot: 13, eyes: EYES_FRONT, mouth: MOUTH_FRONT,
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

  // auto-outline: transparent cells 4-adjacent to a solid (non-whisker) cell.
  // Sticker frames (frame.rim) count baked 'w' lines and whiskers as solid,
  // so the ring wraps the whole drawing like a die-cut sticker.
  const outlineCache = new WeakMap();
  function getOutline(frame) {
    let pts = outlineCache.get(frame);
    if (pts) return pts;
    pts = [];
    const { rows, w } = frame;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || y >= rows.length || x >= w) return false;
      const ch = rows[y][x];
      if (ch === 'w') return !!frame.rim;
      return ch !== '.' && REGION_OF[ch] != null;
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
  //   eye: {style: 'open'|'closed'|'happy'|'squint', gx:0..2, gy:0..2, dilate}
  //   mouth: 'none'|'smile'|'open'|'w'|'mlem', blush: bool, freckles: bool
  //   tilt: ±1 curious head-lean (rows shear sideways, strongest at the top)
  function drawCat(ctx, frame, skin, px, ox, oy, opts = {}) {
    const { rows, w } = frame;
    const X = (x) => ox + (opts.flip ? w - 1 - x : x) * px;
    // curious lean (opts.tilt ±1): rows shear sideways, strongest at the top.
    // drag swing (opts.swing, in art cells): rows below frame.pivot shear
    // like a pendulum, strongest at the bottom — the head stays put
    const SH = (y) => {
      let s = opts.tilt ? Math.round(opts.tilt * (rows.length - 1 - y) / 8) * px : 0;
      if (opts.swing && frame.pivot != null && y > frame.pivot) {
        // screen-pixel granularity, not art cells — the swing must be smooth
        s += Math.round(opts.swing * (y - frame.pivot) / Math.max(1, rows.length - 1 - frame.pivot) * px);
      }
      return s;
    };
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

    // outline ring — sticker frames use the skin's rim color instead
    ctx.fillStyle = (frame.rim && skin.rim) || skin.outline || CREAM;
    for (const [x, y] of getOutline(frame)) {
      ctx.fillRect(X(x) + SH(y), oy + y * px, px, px);
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
        let color = skin[region];
        if (!color && region === 'pawUp') {
          const pl = lum(skin.paws);
          color = hex3(mixRgb(hexToRgb(skin.paws), pl > 140 ? [0, 0, 0] : [255, 255, 255], pl > 140 ? 0.2 : 0.3));
        }
        if (!color) color = '#ff00ff';
        if (style !== 'plain' && STRIPEABLE[region]) {
          if (style === 'tabby' && (x + y * 2) % 6 < 2) color = patternColor;
          else if (style === 'spots' && (((x >> 1) * 37 + (y >> 1) * 53) % 23) < 4) color = patternColor;
        }
        ctx.fillStyle = color;
        ctx.fillRect(X(x) + SH(y), oy + y * px, px, px);
      }
    }

    // pixel-level overrides (face markings etc.) — only on front frames
    // where art coordinates line up; only recolors existing pixels
    if (opts.overrides && (w === 24 || w === 30)) {
      for (const key in opts.overrides) {
        const [px2, py2] = key.split(',').map(Number);
        if (!(py2 >= 0 && py2 < rows.length)) continue;
        const ch = rows[py2][px2];
        if (!ch || ch === '.' || ch === 'w') continue;
        ctx.fillStyle = opts.overrides[key];
        ctx.fillRect(X(px2) + SH(py2), oy + py2 * px, px, px);
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
      const Ex = ox + exArt * px + SH(e[1]), Ey = oy + e[1] * px;
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
      let pw = eyes.pw || (size >= 5 ? 3 : 2); // pupil width (frames may pin it)
      let ph = eyes.ph || Math.min(pw, sh);    // pupil height
      if (eye.dilate) {                       // interest/affection: wider, rounder
        pw = Math.min(pw + 1, size - 1);
        ph = Math.min(ph + 1, sh);
      }
      const gx = Math.max(0, Math.min(size - pw, eye.gx ?? 1));
      const gy = Math.max(0, Math.min(sh - ph, eye.gy ?? 1));
      ctx.fillRect(Ex + gx * px, Ey + gy * px, pw * px, ph * px);
      if (size >= 5) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Ex + gx * px, Ey + gy * px, px, px); // main catchlight
        if (pw >= 3 && ph >= 3) {
          // satellite catchlight opposite the main one: wet-eye sparkle
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(Ex + (gx + pw - 1) * px, Ey + (gy + ph - 1) * px, px, px);
        }
      }
    }

    // whisker freckles: two faint dots per cheek, only where fur exists
    if (opts.freckles && eyes.l && eyes.r) {
      const baseAlpha = opts.alpha != null ? opts.alpha : 1;
      ctx.fillStyle = ink;
      ctx.globalAlpha = baseAlpha * 0.3;
      const dots = [
        [eyes.l[0] - 2, eyes.l[1] + 3], [eyes.l[0] - 1, eyes.l[1] + 4],
        [eyes.r[0] + size + 1, eyes.r[1] + 3], [eyes.r[0] + size, eyes.r[1] + 4],
      ];
      for (const [fx, fy] of dots) {
        const ch = rows[fy] && rows[fy][fx];
        if (ch !== 'L' && ch !== 'R') continue;
        ctx.fillRect(X(fx) + SH(fy), oy + fy * px, px, px);
      }
      ctx.globalAlpha = baseAlpha;
    }

    // mouth marks
    if (frame.mouth && opts.mouth && opts.mouth !== 'none') {
      const [mx, my] = frame.mouth;
      const Mx = ox + (opts.flip ? w - mx - 2 : mx) * px + SH(my), My = oy + my * px;
      ctx.fillStyle = opts.faceInk || ink;
      if (opts.mouth === 'open') {
        ctx.fillRect(Mx, My, 2 * px, px * 0.8);
        ctx.fillRect(Mx + px * 0.25, My + px * 0.8, px * 1.5, px * 0.8);
        ctx.fillStyle = '#ef8aa0';
        ctx.fillRect(Mx + px * 0.5, My + px * 1.1, px, px * 0.5);
      } else if (opts.mouth === 'mlem') {
        // tiny tongue poking out, nothing else
        ctx.fillStyle = '#ef8aa0';
        ctx.fillRect(Mx + px * 0.25, My, px, px * 1.35);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(Mx + px * 0.25, My + px, px, px * 0.35);
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
      ctx.fillRect(ox + (eyes.l[0] - 1) * px + SH(eyes.l[1] + size), oy + (eyes.l[1] + size + 0.4) * px, 2.5 * px, px);
      ctx.fillRect(ox + (eyes.r[0] + size - 1.5) * px + SH(eyes.r[1] + size), oy + (eyes.r[1] + size + 0.4) * px, 2.5 * px, px);
    }

    ctx.restore();
  }

  // back-compat body-only draw (used by previews)
  function drawFrame(ctx, frame, skin, px, ox, oy, opts = {}) {
    drawCat(ctx, frame, skin, px, ox, oy, { ...opts, eye: opts.eye || { style: 'open', gx: 1, gy: 1 } });
  }

  // ------------------------------------------------- kawaii set (cute af)
  // 30-wide 3/4 side-sit transcribed cell-for-cell from a yarn-chart
  // reference: white cat, gray markings (G), tail curled to her left. The
  // chart's black interior lines + whiskers are baked as 'w' pixels, so the
  // auto-outline stays quiet on these frames. Eyes/nose/mouth anchors sit
  // where the chart drew them.
  const K30 = (s) => (s + '.'.repeat(30)).slice(0, 30);
  const KHEAD = [ // rows 0-13: ears through chin (tail lives in overlays)
    K30('................ww.....ww'),
    K30('...............wLw....wRw'),
    K30('..............wLiw...wRiw'),
    K30('.............wLiiwwwwwRiw'),
    K30('.............wLiiwLLRRwiw'),
    K30('............wLLLLLLLRRRww'),
    K30('............wLLLLLLLRRRRRw'),
    K30('...........wLLLLLLLLRRRRRw'),
    K30('...........wLLLLLLLLRRRRRw'),
    K30('...........wLLLLLLLLRRRRRRwww'),
    K30('........wwwwLLLLLGLLRRRRGRw'),
    K30('...........wLLLLLLLMMnMMRRwww'),
    K30('........wwwwwLLLLLLMwMwMRRw'),
    K30('.............wLLLLLMMMMMRw'),
  ];
  const KNECK = [ // rows 14-15: chin bottom + neck shadow line
    K30('..............wwCCCCCCCww'),
    K30('..............wGwwwwwww'),
  ];
  const KSIT_BODY = [ // rows 16-25: collar, chest, legs, paws (tail base baked)
    K30('............wwCCCGGGGGw'),
    K30('...........wCCCCCCBBBBw'),
    K30('..........wCCCCCCCBBBBw'),
    K30('..........wCCCCCCwBBBBw'),
    K30('.........wCCCCCCCCwBBGw'),
    K30('....wGTTwwCCCCwCCCwGGww'),
    K30('.....wGGGwFFFFGwFFwwwww'),
    K30('......wwGwFFFFGwFFFwwGw'),
    K30('........wwFFFFFGwFFwGGw'),
    K30('..........wwwwwwwwwwwww'),
  ];
  const KSIT = [...KHEAD, ...KNECK, ...KSIT_BODY]; // 26 rows
  // slim 1x3 chart eyes that can still glance sideways (gx 0..1)
  const KEYES = { l: [17, 8], r: [22, 8], size: 2, h: 3, pw: 1, ph: 3 };
  const KMOUTH = [20, 12];

  const KBLANK = Array(26).fill('.'.repeat(30));
  const KTAIL_REST = overlay(KBLANK, [
    [13, K30('..www')],
    [14, K30('.wtttw')],
    [15, K30('.wtttw')],
    [16, K30('.wTTTw')],
    [17, K30('..wTTTw')],
    [18, K30('..wTTTw')],
    [19, K30('...wTTTw')],
    [20, K30('...wTTTw')],
  ]);
  const KTAIL_MID = overlay(KBLANK, [
    [11, K30('..www')],
    [12, K30('.wtttw')],
    [13, K30('.wtttw')],
    [14, K30('.wTTTw')],
    [15, K30('..wTTTw')],
    [16, K30('..wTTTw')],
    [17, K30('..wTTTw')],
    [18, K30('...wTTTw')],
    [19, K30('...wTTTw')],
    [20, K30('....wTTTw')],
  ]);
  const KTAIL_UP = overlay(KBLANK, [
    [8,  K30('..www')],
    [9,  K30('.wtttw')],
    [10, K30('.wtttw')],
    [11, K30('.wTTTw')],
    [12, K30('.wTTTw')],
    [13, K30('..wTTTw')],
    [14, K30('..wTTTw')],
    [15, K30('...wTTTw')],
    [16, K30('...wTTTw')],
    [17, K30('...wTTTw')],
    [18, K30('....wTTTw')],
    [19, K30('....wTTTw')],
    [20, K30('....wTTTw')],
  ]);

  const KFRAMES = {};
  KFRAMES.sit = { w: 30, h: 26, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_REST) };
  KFRAMES.sit_tail_mid = { w: 30, h: 26, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_MID) };
  KFRAMES.sit_tail_up = { w: 30, h: 26, eyes: KEYES, mouth: KMOUTH, rows: merge(KSIT, KTAIL_UP) };

  // kneading: the pressing paw shades (P) as it pushes into the floor
  KFRAMES.knead_l = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge(overlay(KSIT, [
      [23, K30('......wwGwPPPPGwFFFwwGw')],
      [24, K30('........wwPPPPPGwFFwGGw')],
    ]), KTAIL_REST),
  };
  KFRAMES.knead_r = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge(overlay(KSIT, [
      [23, K30('......wwGwFFFFGwPPPwwGw')],
      [24, K30('........wwFFFFFGwPPwGGw')],
    ]), KTAIL_REST),
  };

  // loaf for sleeping: head on a low blob, tail wrapped around the front
  KFRAMES.loaf = {
    w: 30, h: 20, eyes: KEYES, mouth: KMOUTH,
    rows: [
      ...KHEAD,
      K30('..............wwCCCCCCCww'),
      K30('........wwwwwwCCCGGGGGw'),
      K30('.......wBBCCCCCCCBBBBGw'),
      K30('......wBBBCCCCCCCBBBBGw'),
      K30('.....wTTTTBBBBBBBBBBBGw'),
      K30('.....wtttTTTwwwwwwwwwww'),
    ],
  };

  // dragged / hanging: transcribed cell-for-cell from the dangling chart in
  // pixel-cat-images/sprites.json — held by the scruff, forelegs hanging,
  // long torso, tail curling below. Eyes stay live (same slim chart eyes).
  KFRAMES.hang = {
    w: 21, h: 40, pivot: 15, // body below the neck row swings while dragged
    eyes: { l: [8, 7], r: [13, 7], size: 2, h: 3, pw: 1, ph: 3 },
    mouth: [11, 11],
    rows: [
      '.......ww......ww....',
      '......wLw.....wRw....',
      '......wiw....wRiw....',
      '.....wLiwwwwwwRiw....',
      '.....wLiwLLLRRwiw....',
      '....wLLLLLLLRRRwww...',
      '....wLLLLLLLRRRRRw...',
      '...wLLLLLLLLRRRRRw...',
      '...wLLLLLLLLRRRRRw...',
      '...wLLLLGLLLRRRGRRwww',
      'wwwwLLLLLLMMnMMRRRw..',
      '...wLLLLLLMwMwMRRRwww',
      'wwwwwLLLLLMMMMMRRw...',
      '.....wLLLLLLRRRRRw...',
      '......wwLLLLRRRww....',
      '......wGwwwwwwww.....',
      '......wCCGGGGCCw.....',
      '.....wFFCGCCCFFw.....',
      '.....wFFwCCCwFFw.....',
      '.....wFFwCCCwFFw.....',
      '.....wFFwCCCwFFw.....',
      '.....wGFwCCCwFGw.....',
      '......wGwCCCwGGw.....',
      '.......wCCCCCww......',
      '......wCCCCCCCCw.....',
      '......wCCCCCCCCw.....',
      '......wCCCCCCCCw.....',
      '......wCCCCCCCCw.....',
      '......wGBBwwBBBw.....',
      '......wGBwBwwBGw.....',
      '.......wGwBwwGw......',
      '........wwBwwGw......',
      '..........ww.w.......',
      '.........wTw.........',
      '........wTTw.........',
      '......wwTTGw.........',
      '.....wTTTGw..........',
      '.....wTTGww..........',
      '.....wGGw............',
      '......ww.............',
    ],
  };

  // celebrate: airborne happy hop — feet tucked, tail flung up
  KFRAMES.celebrate = {
    w: 30, h: 24, eyes: KEYES, mouth: KMOUTH,
    rows: merge([
      ...KSIT.slice(0, 22),
      K30('......wwGwFFFFFFFFwGGw'),
      K30('........wwwwwwwwwwwww'),
    ], KTAIL_UP),
  };

  // the big stretch: a play-bow transcribed cell-for-cell from the
  // pixel_cat_stretching.py chart — butt up, tail hooked over the back,
  // chest low, front legs reaching. The face is baked into the art
  // (eyes: {} disables the live face for this two-second pose).
  KFRAMES.stretch_up = {
    w: 32, h: 31, eyes: {}, mouth: null, side: true,
    rows: [
      '........wwww....................',
      '.......wttttww..................',
      '......wtttttGw..................',
      '......wttwwGww..................',
      '.....wTTw..ww...................',
      '.....wTTw.......................',
      '.....wTDw.......................',
      '.....wGGw.......................',
      '.....wGGGwwww...................',
      '......wwBBBBBw..................',
      '.....wBBBBBBBBw.................',
      '....wBBBBBBBBBw.................',
      '....wBBBBBBBBBBw................',
      '....wBBBBBBBBBBw................',
      '....wBBBBBBBBBBww......ww.......',
      '....wBBBBBBBBBwGww....wGw.......',
      '....wBBBBBBBBBwDGww..wDGw.......',
      '....wBBwBBBBBBwDLDwwwwGRw.......',
      '....wBBwBBBBBBwDwLLLLRRRw.......',
      '....wBBwBBBBBBwwLLLLLRRRRw......',
      '.....wBwGBBBBwBLLLLLLRRRRw......',
      '.....wBGwBBBBwBLLwLLLRwRRw......',
      '.....wBBwwBBwwwLLwLLLRwRRwww....',
      '......wBwwGBBBwLGwLLwRwGRw......',
      '......wBGwwBwwwLLLLwLwRRRwww....',
      '.......www.wGFFwLLLLLRRRw.......',
      '............wGFFLwwLLRRRRww.....',
      '.............wDFFFFwwwwGFFFw....',
      '..............wwDGFFFwDwwGFFw...',
      '................wwwFFGw..wwww...',
      '...................www..........',
    ],
  };

  // folded-ear rows shared by the idle ear-flick and the sleep dream-twitch
  const KFLICK_EARS = [
    K30('................ww'),
    K30('...............wLw...ww'),
    K30('..............wLiw..wRRRw'),
    K30('.............wLiiwwwwwRRw'),
  ];
  KFRAMES.sit_flick = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge([...KFLICK_EARS, ...KSIT.slice(4)], KTAIL_REST),
  };
  KFRAMES.loaf_twitch = {
    w: 30, h: 20, eyes: KEYES, mouth: KMOUTH,
    rows: [...KFLICK_EARS, ...KFRAMES.loaf.rows.slice(4)],
  };

  // grooming: a raised foreleg (P = shaded paw) — groom1 licks it at the
  // mouth, groom2 wipes it up over the ear
  KFRAMES.sit_groom1 = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge(merge(KSIT, overlay(KBLANK, [
      [11, K30('................wPPw')],
      [12, K30('................wPPw')],
      [13, K30('................wPPw')],
      [14, K30('................wPPw')],
      [15, K30('................wPPw')],
      [16, K30('................wPPw')],
      [17, K30('................wPPw')],
      [18, K30('................wPPw')],
      [22, K30('...............wCCCw')],
      [23, K30('...............wCCCw')],
      [24, K30('................wCCw')],
    ])), KTAIL_REST),
  };
  KFRAMES.sit_groom2 = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge(merge(KSIT, overlay(KBLANK, [
      [1,  K30('.....................PPw')],
      [2,  K30('....................wPPw')],
      [3,  K30('....................wPPw')],
      [4,  K30('....................wPPw')],
      [5,  K30('....................wPPw')],
      [6,  K30('....................wPPw')],
      [7,  K30('....................wPPw')],
      [8,  K30('....................wPPw')],
      [9,  K30('....................wPPw')],
      [10, K30('....................wPPw')],
      [11, K30('....................wPPw')],
      [12, K30('....................wPPw')],
      [13, K30('....................wPPw')],
      [14, K30('....................wPPw')],
      [15, K30('....................wPPw')],
      [16, K30('....................wPPw')],
      [17, K30('....................wPPw')],
      [22, K30('...............wCCCw')],
      [23, K30('...............wCCCw')],
      [24, K30('................wCCw')],
    ])), KTAIL_REST),
  };

  // contentment: tail sweeps around the front and rests over the paws
  const KTAIL_WRAP = overlay(KBLANK, [
    [22, K30('.....wTTTw')],
    [23, K30('......wTTTTTTTTTttw')],
    [24, K30('........wwTTTTTTtttw')],
  ]);
  KFRAMES.sit_wrap = {
    w: 30, h: 26, eyes: KEYES, mouth: KMOUTH,
    rows: merge(KSIT, KTAIL_WRAP),
  };

  // pounce wind-up: hunkered low, tail mid-air; the renderer adds the
  // butt-wiggle oscillation
  KFRAMES.crouch = {
    w: 30, h: 19, eyes: KEYES, mouth: KMOUTH,
    rows: merge([
      ...KHEAD,
      K30('..............wwCCCCCCCww'),
      K30('.........wwwwwCCCGGGGGw'),
      K30('........wCCCCCCCCCwBBGw'),
      K30('........wwFFFFFwFFFwGGw'),
      K30('.........wwwwwwwwwwwwww'),
    ], overlay(Array(19).fill('.'.repeat(30)), [
      [10, K30('..www')],
      [11, K30('.wtttw')],
      [12, K30('.wtttw')],
      [13, K30('.wTTTw')],
      [14, K30('..wTTTw')],
      [15, K30('..wTTTw')],
      [16, K30('...wTTTww')],
    ])),
  };

  // side-view action frames borrowed from classic (cloned so the sticker
  // rim below doesn't leak into the classic set's outline cache)
  KFRAMES.run_a = { ...FRAMES.run_a };
  KFRAMES.run_b = { ...FRAMES.run_b };
  KFRAMES.leap = { ...FRAMES.leap };

  // every kawaii frame is a die-cut sticker: white rim around the whole cat
  for (const id in KFRAMES) KFRAMES[id].rim = true;

  const SPRITE_SETS = { kawaii: KFRAMES, classic: FRAMES };
  function framesFor(style) {
    return SPRITE_SETS[style] || SPRITE_SETS.kawaii;
  }

  const API = { FRAMES, KFRAMES, SPRITE_SETS, framesFor, SKINS, REGION_OF, drawCat, drawFrame, hexToRgb, getOutline, autoInk };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Sprites = API;
})(typeof window !== 'undefined' ? window : globalThis);
