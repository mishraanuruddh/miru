'use strict';
// 9x9 pixel icons for the paw menu.
(function (global) {
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
      '.X.XXX.X.',
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
      'XXXXXXXXX',
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
    back: [
      '...X.....',
      '..XX.....',
      '.XXXXXXX.',
      'XXXXXXXX.',
      '.XXXXXXX.',
      '..XX.....',
      '...X.....',
      '.........',
      '.........',
    ],
    app: [
      '.XXXXXXX.',
      'X.......X',
      'X.XX.XX.X',
      'X.......X',
      'X.XX.XX.X',
      'X.......X',
      'X.XX.XX.X',
      'X.......X',
      '.XXXXXXX.',
    ],
    check: [
      '.........',
      '.......X.',
      '......XX.',
      '.....XX..',
      'X...XX...',
      'XX.XX....',
      '.XXX.....',
      '..X......',
      '.........',
    ],
    dot: [
      '.........',
      '.........',
      '...XXX...',
      '..XXXXX..',
      '..XXXXX..',
      '..XXXXX..',
      '...XXX...',
      '.........',
      '.........',
    ],
  };

  function drawIcon(ctx, name, x, y, px, color) {
    const art = ICONS[name];
    if (!art) return;
    ctx.fillStyle = color;
    for (let r = 0; r < art.length; r++) {
      for (let c = 0; c < art[r].length; c++) {
        if (art[r][c] === 'X') ctx.fillRect(x + c * px, y + r * px, px, px);
      }
    }
  }

  const API = { ICONS, drawIcon };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PixelIcons = API;
})(typeof window !== 'undefined' ? window : globalThis);
