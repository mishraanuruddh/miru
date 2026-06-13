'use strict';
// Photo -> cat skin: k-means palette extraction + region mapping heuristics.
(function (global) {

  function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
  function dist2(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }
  function hex(c) {
    return '#' + [0, 1, 2].map((i) => Math.round(c[i]).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function saturation(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }

  // how plausible is this color as cat fur? (greens/blues/purples are scenery)
  function catness(r, g, b) {
    const s = saturation(r, g, b);
    if (s < 0.25) return 1;                       // grays, blacks, whites, creams
    if (g > r * 1.08 && g > b * 1.08) return 0.06; // vegetation
    if (b > r * 1.15 && b > g * 1.05) return 0.1;  // sky / water / denim
    if (r >= g && g >= b) return 1;                // browns / oranges / creams
    if (r > g && b > g) return s > 0.45 ? 0.25 : 0.7; // magenta-ish: unlikely fur
    return 0.5;
  }

  // pixels: RGBA array; center-weighted, fur-prior, border-tracked k-means
  function extractPalette(pixels, w, h, k = 8) {
    const pts = [];
    const cx = w / 2, cy = h * 0.6; // cats sit in the lower half of photos
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (pixels[i + 3] < 120) continue;
        const dx = (x - cx) / w, dy = (y - cy) / h;
        const centerW = Math.exp(-(dx * dx + dy * dy) * 9); // strongly favor the subject
        const border = x < w * 0.12 || x > w * 0.88 || y < h * 0.12 || y > h * 0.88 ? 1 : 0;
        pts.push({ c: [pixels[i], pixels[i + 1], pixels[i + 2]], w: centerW, border });
      }
    }
    if (!pts.length) return [];

    // init centroids spread across luminance percentiles
    const byLum = [...pts].sort((a, b) => lum(...a.c) - lum(...b.c));
    let centroids = [];
    for (let i = 0; i < k; i++) {
      centroids.push([...byLum[Math.floor(((i + 0.5) / k) * byLum.length)].c]);
    }

    let assign = new Array(pts.length).fill(0);
    for (let iter = 0; iter < 14; iter++) {
      for (let p = 0; p < pts.length; p++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) {
          const d = dist2(pts[p].c, centroids[c]);
          if (d < bd) { bd = d; best = c; }
        }
        assign[p] = best;
      }
      const acc = centroids.map(() => [0, 0, 0, 0]);
      for (let p = 0; p < pts.length; p++) {
        const a = acc[assign[p]], wt = pts[p].w;
        a[0] += pts[p].c[0] * wt; a[1] += pts[p].c[1] * wt; a[2] += pts[p].c[2] * wt; a[3] += wt;
      }
      centroids = acc.map((a, i) => (a[3] > 0 ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : centroids[i]));
    }

    let stats = centroids.map((c) => ({ c, weight: 0, borderW: 0 }));
    for (let p = 0; p < pts.length; p++) {
      const s = stats[assign[p]];
      s.weight += pts[p].w;
      if (pts[p].border) s.borderW += pts[p].w;
    }

    // merge near-identical clusters (k is intentionally high)
    stats = stats.filter((s) => s.weight > 0);
    for (let i = 0; i < stats.length; i++) {
      for (let j = i + 1; j < stats.length; j++) {
        if (dist2(stats[i].c, stats[j].c) < 900) {
          const a = stats[i], b = stats[j], tw = a.weight + b.weight;
          a.c = mix(a.c, b.c, b.weight / tw);
          a.weight = tw;
          a.borderW += b.borderW;
          stats.splice(j, 1); j--;
        }
      }
    }

    const total = stats.reduce((s, x) => s + x.weight, 0) || 1;
    const out = stats.map((s) => {
      const borderFrac = s.weight ? s.borderW / s.weight : 1;
      const fur = catness(...s.c);
      return {
        rgb: s.c.map(Math.round),
        hex: hex(s.c),
        weight: s.weight / total,
        borderFrac,
        fur,
        lum: lum(...s.c),
        // subject score: big + central-ish + plausibly fur (border penalty is
        // soft: close-up cats touch every edge of the photo)
        score: (s.weight / total) * Math.max(0.08, 1 - 0.7 * borderFrac) * fur,
      };
    });

    // near-black clusters in a photo that isn't dark overall are shadows,
    // not fur (wood shadows, doorways) — unless the cat itself is black
    const darkTotal = out.filter((c) => c.lum < 60).reduce((s, c) => s + c.weight, 0);
    if (darkTotal < 0.4) {
      for (const c of out) if (c.lum < 45) c.score *= 0.35;
    }

    return out.sort((a, b) => b.score - a.score);
  }

  // clusters -> region colors for the sprite
  function paletteToSkin(clusters, opts = {}) {
    if (!clusters.length) return null;

    // neutral bicolor mode (gray/white cats): when nothing saturated is in
    // play and darks don't dominate, the lightest tone is the coat and the
    // mid tone is the cap — close-up portraits otherwise pick shadows.
    if (!opts.forceBodyHex) {
      const darkTotal = clusters.filter((c) => c.lum < 60).reduce((s, c) => s + c.weight, 0);
      // a meaningful saturated color ON THE SUBJECT = not a neutral cat
      // (edge-hugging saturated clusters are furniture, not fur)
      const hasColor = clusters.some((c) =>
        saturation(...c.rgb) > 0.28 && c.weight > 0.06 && c.fur > 0.5 &&
        c.borderFrac < 0.5 && c.lum > 60); // saturation is noise in near-blacks
      if (!hasColor && clusters.length >= 2 && darkTotal < 0.4) {
        const lights = clusters.filter((c) => c.lum > 135 && c.score >= clusters[0].score * 0.35);
        const body = lights.sort((a, b) => b.lum - a.lum)[0];
        if (body) {
          const cap = clusters
            .filter((c) => c.lum > 55 && c.lum < body.lum - 40)
            .sort((a, b) => b.score - a.score)[0] || null;
          const darkest = [...clusters].sort((a, b) => a.lum - b.lum)[0];
          const capHex = cap ? cap.hex : hex(mix(body.rgb, [0, 0, 0], 0.4));
          return {
            _mode: 'cap',
            headL: capHex, headR: capHex, muzzle: body.hex, body: body.hex,
            chest: body.hex, paws: body.hex, tail: capHex, tailTip: capHex,
            innerEar: '#e89aae',
            nose: capHex,
            iris: '#ffffff',
            pupil: darkest.lum < 90 ? darkest.hex : '#2a2731',
            outline: body.lum < 110 ? '#fdf8ec' : '#8f89a0',
            patternColor: capHex,
          };
        }
      }
    }

    // body: top score, but prefer a characterful warm fur color over a
    // similar-scoring neutral (pale walls/floors often edge out the cat)
    let body = clusters[0];
    if (opts.forceBodyHex && clusters.some((c) => c.hex === opts.forceBodyHex)) {
      body = clusters.find((c) => c.hex === opts.forceBodyHex);
    } else {
      for (const c of clusters.slice(0, 4)) {
        const [r, g, b] = c.rgb;
        const warm = r > g && g >= b && saturation(r, g, b) >= 0.28;
        if (warm && c.fur >= 0.9 && c.borderFrac < 0.4 &&
            c.score >= clusters[0].score * 0.55 &&
            saturation(...c.rgb) > saturation(...body.rgb) + 0.12) {
          body = c;
        }
      }
    }

    // patch candidates: distinct from body, subject-ish, plausibly fur
    let patches = clusters.filter((c) =>
      c !== body &&
      c.score > body.score * 0.22 &&
      c.borderFrac < 0.55 &&
      c.fur > 0.5 &&
      dist2(c.rgb, body.rgb) > 5000
    ).slice(0, 3);
    // dedupe near-identical patches (two grays = one cap, not a calico)
    patches = patches.filter((c, i) => patches.findIndex((o) => dist2(o.rgb, c.rgb) < 2500) === i).slice(0, 2);

    // bib: a much-lighter neutral patch = tuxedo chest/muzzle/socks
    const bibIdx = patches.findIndex((c) => c.lum > body.lum + 80 && saturation(...c.rgb) < 0.3);
    const bib = bibIdx >= 0 ? patches.splice(bibIdx, 1)[0] : null;

    const all = [body, ...patches, ...(bib ? [bib] : [])];
    const lightest = [...all].sort((a, b) => b.lum - a.lum)[0];
    const darkest = [...all].sort((a, b) => a.lum - b.lum)[0];

    const bodyHex = body.hex;
    const isDark = body.lum < 110;
    const chest = bib ? bib.hex
      : lightest !== body && lightest.lum > body.lum + 35 ? lightest.hex : bodyHex;
    const dark = darkest.lum < body.lum - 30 ? darkest.hex : hex(mix(body.rgb, [0, 0, 0], 0.3));

    const skin = {
      headL: bodyHex, headR: bodyHex, muzzle: bib ? bib.hex : bodyHex, body: bodyHex,
      chest, paws: bib ? bib.hex : bodyHex, tail: bodyHex, tailTip: dark,
      innerEar: isDark ? '#f2a0b5' : '#e89aae',
      nose: isDark ? '#f2a0b5' : '#e2798f',
      iris: '#ffffff',
      pupil: dark === bodyHex ? '#2a2731' : dark,
      outline: isDark ? '#fdf8ec' : '#8f89a0',
      patternColor: hex(mix(body.rgb, darkest.rgb, 0.55)),
    };

    // remaining colored/dark patches: face + tail markings
    if (patches.length === 1 && body.lum > 150 && saturation(...patches[0].rgb) < 0.3) {
      // light cat with one neutral marking = a cap: both ears/eyes + tail
      const p = patches[0];
      skin.headL = p.hex;
      skin.headR = p.hex;
      skin.tail = p.hex;
      skin.tailTip = p.hex;
      skin.nose = p.hex; // gray nose smudge, like the real cat
      skin.pupil = darkest.lum < 80 ? darkest.hex : '#2a2731';
      skin.patternColor = p.hex;
    } else if (patches.length >= 1) {
      const p1 = patches[0];
      skin.headL = p1.hex;
      skin.tail = p1.hex;
      skin.tailTip = body.hex;
      if (patches.length >= 2) {
        const p2 = patches[1];
        skin.headR = p2.hex === skin.headL ? bodyHex : p2.hex;
        skin.tailTip = p2.hex;
      }
      skin.patternColor = p1.hex;
    }
    return skin;
  }

  // classic bicolor face: white blaze up the forehead, white cheeks under the
  // eyes, a little smudge on the chin — the markings that make a cat *theirs*.
  // Coordinates target the shared 24-wide HEAD grid; users refine in the editor.
  function capFaceOverrides(skin) {
    const ov = {};
    const blaze = skin.body, cap = skin.headL;
    for (let y = 2; y <= 9; y++) { ov[`11,${y}`] = blaze; ov[`12,${y}`] = blaze; }
    for (const y of [8, 9]) { ov[`10,${y}`] = blaze; ov[`13,${y}`] = blaze; } // blaze widens at the muzzle
    for (const x of [3, 4, 5, 6, 7, 16, 17, 18, 19, 20]) ov[`${x},9`] = blaze; // cheeks
    ov['11,12'] = cap; // chin smudge
    ov['12,12'] = cap;
    return ov;
  }

  // one-call helper for <canvas> ImageData
  function skinFromImageData(imageData, k) {
    const clusters = extractPalette(imageData.data, imageData.width, imageData.height, k);
    const skin = paletteToSkin(clusters);
    const overrides = skin && skin._mode === 'cap' ? capFaceOverrides(skin) : null;
    if (skin) delete skin._mode;
    return { clusters, skin, overrides };
  }

  const API = { extractPalette, paletteToSkin, skinFromImageData, capFaceOverrides };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.CatPalette = API;
})(typeof window !== 'undefined' ? window : globalThis);
