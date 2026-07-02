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

  // X = color, o = alt, . = empty
  const ART = {
    leaf:      ['....X....', '...XX....', '..XXX....', '.XXXXX...', '.XXoXX...', '..XoX....', '...o.....', '..o......', '.........'],
    sock:      ['..XXX....', '..XXX....', '..XXX....', '..XXXo...', '.XXXXo...', 'XXXXX....', 'XXXX.....', '.XX......', '.........'],
    bottlecap: ['.o.o.o...', 'oXXXXXo..', '.XXoXX...', 'oXXXXXo..', '.o.o.o...', '.........', '.........', '.........', '.........'],
    acorn:     ['..ooo....', '.ooooo...', '.XXXXX...', '..XXX....', '..XXX....', '...X.....', '.........', '.........', '.........'],
    ribbon:    ['.XX..XX..', 'XXXXXXXX.', '.XXooXX..', 'XXXXXXXX.', '.XX..XX..', '.........', '.........', '.........', '.........'],
    feather:   ['.......X.', '.....XXX.', '....XXX..', '...XXXo..', '..XXXo...', '.XXXo....', '.Xo......', 'o........', '.........'],
    yarn:      ['..XXXX...', '.XoXXoX..', 'XXoXXoXX.', 'XXXooXXX.', 'XXoXXoXX.', '.XoXXoX..', '..XXXX...', '......o..', '.......o.'],
    flower:    ['..o.o....', '.oXoXo...', '..oXo....', '.oXoXo...', '..o.o....', '...X.....', '...X.....', '..XX.....', '.........'],
    beetle:    ['..XXX....', '.XXoXX...', '.XoXoX...', '.XXoXX...', '.XXXXX...', '..X.X....', '.X...X...', '.........', '.........'],
    mouse:     ['.........', '..XX.....', '.XXXX..o.', 'XXXXXX.o.', 'XXoXXXo..', '.XXXX....', '..X.X....', '.........', '.........'],
    fish:      ['.........', '...XXX...', '..XXXXXo.', '.XoXXXXo.', '..XXXXXo.', '...XXX.o.', '.....o...', '.........', '.........'],
    star:      ['....X....', '....X....', '..XXXXX..', '...XXX...', '..XX.XX..', '.X.....X.', '.........', '.........', '.........'],
  };

  const RARITY_WEIGHT = { common: 60, uncommon: 30, rare: 10 };

  function drawGift(ctx, id, x, y, px) {
    const g = GIFTS[id];
    const art = ART[id];
    if (!g || !art) return;
    for (let r = 0; r < art.length; r++) {
      for (let c = 0; c < art[r].length; c++) {
        const ch = art[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'X' ? g.color : g.alt;
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }

  const API = { GIFTS, drawGift, RARITY_WEIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.CatGifts = API;
})(typeof window !== 'undefined' ? window : globalThis);
