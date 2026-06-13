'use strict';
// Tiny pixel font (3-5 px wide, 5 px tall). Glyphs are arrays of 5 bitmask rows.
(function (global) {
  const G = {
    A: [0b010, 0b101, 0b111, 0b101, 0b101],
    B: [0b110, 0b101, 0b110, 0b101, 0b110],
    C: [0b011, 0b100, 0b100, 0b100, 0b011],
    D: [0b110, 0b101, 0b101, 0b101, 0b110],
    E: [0b111, 0b100, 0b110, 0b100, 0b111],
    F: [0b111, 0b100, 0b110, 0b100, 0b100],
    G: [0b011, 0b100, 0b101, 0b101, 0b011],
    H: [0b101, 0b101, 0b111, 0b101, 0b101],
    I: [0b111, 0b010, 0b010, 0b010, 0b111],
    J: [0b001, 0b001, 0b001, 0b101, 0b010],
    K: [0b101, 0b101, 0b110, 0b101, 0b101],
    L: [0b100, 0b100, 0b100, 0b100, 0b111],
    M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001],
    N: [0b1001, 0b1101, 0b1011, 0b1001, 0b1001],
    O: [0b010, 0b101, 0b101, 0b101, 0b010],
    P: [0b110, 0b101, 0b110, 0b100, 0b100],
    Q: [0b0110, 0b1001, 0b1001, 0b1010, 0b0101],
    R: [0b110, 0b101, 0b110, 0b101, 0b101],
    S: [0b011, 0b100, 0b010, 0b001, 0b110],
    T: [0b111, 0b010, 0b010, 0b010, 0b010],
    U: [0b101, 0b101, 0b101, 0b101, 0b011],
    V: [0b101, 0b101, 0b101, 0b010, 0b010],
    W: [0b10001, 0b10001, 0b10101, 0b11011, 0b10001],
    X: [0b101, 0b101, 0b010, 0b101, 0b101],
    Y: [0b101, 0b101, 0b010, 0b010, 0b010],
    Z: [0b111, 0b001, 0b010, 0b100, 0b111],
    '0': [0b111, 0b101, 0b101, 0b101, 0b111],
    '1': [0b010, 0b110, 0b010, 0b010, 0b111],
    '2': [0b111, 0b001, 0b111, 0b100, 0b111],
    '3': [0b111, 0b001, 0b011, 0b001, 0b111],
    '4': [0b101, 0b101, 0b111, 0b001, 0b001],
    '5': [0b111, 0b100, 0b111, 0b001, 0b111],
    '6': [0b111, 0b100, 0b111, 0b101, 0b111],
    '7': [0b111, 0b001, 0b010, 0b010, 0b010],
    '8': [0b111, 0b101, 0b111, 0b101, 0b111],
    '9': [0b111, 0b101, 0b111, 0b001, 0b111],
    ' ': [0, 0, 0, 0, 0],
    '.': [0b0, 0b0, 0b0, 0b0, 0b1],
    ',': [0b00, 0b00, 0b00, 0b01, 0b10],
    '!': [0b1, 0b1, 0b1, 0b0, 0b1],
    '?': [0b111, 0b001, 0b011, 0b000, 0b010],
    ':': [0b0, 0b1, 0b0, 0b1, 0b0],
    "'": [0b1, 0b1, 0b0, 0b0, 0b0],
    '-': [0b000, 0b000, 0b111, 0b000, 0b000],
    '+': [0b000, 0b010, 0b111, 0b010, 0b000],
    '/': [0b001, 0b001, 0b010, 0b100, 0b100],
    '(': [0b01, 0b10, 0b10, 0b10, 0b01],
    ')': [0b10, 0b01, 0b01, 0b01, 0b10],
    '♥': [0b01010, 0b11111, 0b11111, 0b01110, 0b00100],
    '~': [0b00000, 0b01001, 0b10110, 0b00000, 0b00000],
  };
  const WIDTHS = {};
  for (const ch of Object.keys(G)) {
    let w = 1;
    for (const row of G[ch]) w = Math.max(w, 32 - Math.clz32(row));
    if (ch === ' ') w = 2;
    WIDTHS[ch] = w;
  }

  function measure(text, px) {
    let w = 0;
    for (const ch of text.toUpperCase()) {
      const g = G[ch] ? ch : ' ';
      w += (WIDTHS[g] + 1) * px;
    }
    return Math.max(0, w - px);
  }

  function draw(ctx, text, x, y, px, color) {
    ctx.fillStyle = color;
    let cx = x;
    for (const ch of text.toUpperCase()) {
      const key = G[ch] ? ch : ' ';
      const glyph = G[key];
      const w = WIDTHS[key];
      for (let r = 0; r < 5; r++) {
        const bits = glyph[r];
        for (let c = 0; c < w; c++) {
          if (bits & (1 << (w - 1 - c))) ctx.fillRect(cx + c * px, y + r * px, px, px);
        }
      }
      cx += (w + 1) * px;
    }
    return cx - x;
  }

  const API = { measure, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.PixelFont = API;
})(typeof window !== 'undefined' ? window : globalThis);
