'use strict';
const { nativeImage } = require('electron');
const { encodePNG } = require('./png');

// 16x12 cat face, drawn as a macOS template image (black + alpha)
const ROWS = [
  '................',
  '..X..........X..',
  '..XX........XX..',
  '..XXX......XXX..',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '.XXXX..XXXX..XX.',
  '.XXXX..XXXX..XX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
];

function raster(scale) {
  const w = 16 * scale, h = 16 * scale;
  const data = Buffer.alloc(w * h * 4);
  const top = 2; // vertical centering within 16
  for (let y = 0; y < ROWS.length; y++) {
    for (let x = 0; x < 16; x++) {
      if (ROWS[y][x] !== 'X') continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x * scale + dx, py = (y + top) * scale + dy;
          const i = (py * w + px) * 4;
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        }
      }
    }
  }
  return encodePNG(w, h, data);
}

function buildTrayIcon() {
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 1, buffer: raster(1) });
  img.addRepresentation({ scaleFactor: 2, buffer: raster(2) });
  img.setTemplateImage(true);
  return img;
}

module.exports = { buildTrayIcon };
