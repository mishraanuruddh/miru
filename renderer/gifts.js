'use strict';
// The cat's gift catalog: little 9x9 pixel treasures it "catches" overnight.
(function (global) {
  const GIFTS = {
    leaf:      { name: 'A crunchy leaf', rarity: 'common', color: '#8fae5a', alt: '#6d8b42' },
    sock:      { name: 'A lost sock', rarity: 'common', color: '#d9d4c8', alt: '#a9a499' },
    bottlecap: { name: 'A shiny bottlecap', rarity: 'common', color: '#c9cdd4', alt: '#8f949c' },
    acorn:     { name: 'An acorn', rarity: 'common', color: '#a9743c', alt: '#7a5128' },
    ribbon:    { name: 'A red ribbon', rarity: 'common', color: '#e0584e', alt: '#b03c34' },
    feather:   { name: 'A soft feather', rarity: 'uncommon', color: '#9fc4e4', alt: '#6f94b4' },
    yarn:      { name: 'A ball of yarn', rarity: 'uncommon', color: '#e58ab0', alt: '#c06890' },
    flower:    { name: 'A tiny flower', rarity: 'uncommon', color: '#f2c14e', alt: '#e0584e' },
    beetle:    { name: 'A jewel beetle', rarity: 'uncommon', color: '#5ad2b4', alt: '#2e9a7e' },
    mouse:     { name: 'A toy mouse', rarity: 'rare', color: '#b9b4c4', alt: '#8a8596' },
    fish:      { name: 'A golden fish', rarity: 'rare', color: '#f2c14e', alt: '#d99c1e' },
    star:      { name: 'A fallen star', rarity: 'rare', color: '#fff3b0', alt: '#f2c14e' },
  };

  // X = color, o = alt, # = ink detail, . = empty.
  // Silhouettes stay CONNECTED (4-adjacent) — the sticker keyline wraps
  // every island, so stray dots become blobs.
  const ART = {
    leaf:      ['....X....', '...XXX...', '..XXXXX..', '.XXX#XXX.', '.XXX#XXX.', '..XX#XX..', '...X#X...', '....#....', '....#....'],
    sock:      ['..XXX....', '..XXX....', '..XXX....', '..XXXo...', '.XXXXo...', 'XXXXX....', 'XXXX.....', '.XX......', '.........'],
    bottlecap: ['.........', '..XXXXX..', '.XXoooXX.', '.XoXXXoX.', '.XXoooXX.', '..XXXXX..', '.........', '.........', '.........'],
    acorn:     ['....#....', '..ooooo..', '.ooooooo.', '.XXXXXXX.', '.XXXXXXX.', '..XXXXX..', '...XXX...', '.........', '.........'],
    ribbon:    ['.XX..XX..', 'XXXXXXXX.', '.XXooXX..', 'XXXXXXXX.', '.XX..XX..', '.........', '.........', '.........', '.........'],
    feather:   ['.......X.', '.....XXX.', '....XXX..', '...XXX#..', '..XXX#...', '.XXX#....', '.X#......', '#........', '.........'],
    yarn:      ['..XXXX...', '.XoXXoX..', 'XXoXXoXX.', 'XXXooXXX.', 'XXoXXoXX.', '.XoXXoX..', '..XXXX##.', '.........', '.........'],
    flower:    ['..XXX....', '.XXoXX...', '.XoooX...', '.XXoXX...', '..XXX....', '...#.....', '..X#.....', '...#.....', '.........'],
    beetle:    ['..ooo....', '.XXXXX...', '.XX#XX...', '.XX#XX...', '.XX#XX...', '..XXX....', '..#.#....', '.........', '.........'],
    mouse:     ['.........', '.XX..X...', '.XXXXXX..', 'XXXXXXX#.', 'XX#XXXX#.', '.XXXXX#..', '..X..X...', '.........', '.........'],
    fish:      ['.........', '...XXX...', '..XXXXX..', '.X#XXXXo.', '..XXXXXo.', '...XXX...', '.........', '.........', '.........'],
    star:      ['....X....', '...XXX...', '.XXXXXXX.', '..XXXXX..', '..XXoXX..', '.XXX.XXX.', '.........', '.........', '.........'],
  };

  const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 };

  const INK = '#181818', RIM = '#fefefe';

  // Die-cut sticker treatment to match the cat: a dark keyline is
  // auto-drawn hugging the art, then a white rim wraps the keyline.
  // Both rings extend up to two cells beyond the 9x9 grid.
  function drawGift(ctx, id, x, y, px) {
    const g = GIFTS[id];
    const art = ART[id];
    if (!g || !art) return;
    const solid = (c, r) =>
      r >= 0 && r < art.length && c >= 0 && c < art[r].length && art[r][c] !== '.';
    const near = (c, r, f) => f(c - 1, r) || f(c + 1, r) || f(c, r - 1) || f(c, r + 1);
    const keySet = new Set();
    for (let r = -1; r <= art.length; r++) {
      for (let c = -1; c <= art[0].length; c++) {
        if (!solid(c, r) && near(c, r, solid)) keySet.add(c + ',' + r);
      }
    }
    const inKey = (c, r) => keySet.has(c + ',' + r) || solid(c, r);
    ctx.fillStyle = RIM;
    for (let r = -2; r <= art.length + 1; r++) {
      for (let c = -2; c <= art[0].length + 1; c++) {
        if (!inKey(c, r) && near(c, r, inKey)) ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
    ctx.fillStyle = INK;
    for (const key of keySet) {
      const [c, r] = key.split(',').map(Number);
      ctx.fillRect(x + c * px, y + r * px, px, px);
    }
    for (let r = 0; r < art.length; r++) {
      for (let c = 0; c < art[r].length; c++) {
        const ch = art[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'X' ? g.color : ch === 'o' ? g.alt : INK;
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }

  const API = { GIFTS, drawGift, RARITY_WEIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.CatGifts = API;
})(typeof window !== 'undefined' ? window : globalThis);
