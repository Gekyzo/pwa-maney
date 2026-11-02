// Writes the PNG icons of the PWA from the art of icons/source.png. No dependencies.
// Run: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { encodePng, decodePng, clearWhite, resizeRgba } from './png.mjs';

const WHITE = [255, 255, 255];
const SAMPLES = 4;

const outDir = new URL('../icons/', import.meta.url);
const art = decodePng(readFileSync(new URL('source.png', outDir)));

// Colour of the art at a point of the 0..1 square, between its four nearest pixels.
// The background of the art is white, and so is each point outside it.
const sampleArt = (u, v) => {
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return WHITE;
  const x = Math.max(0, Math.min(art.width - 1, u * art.width - 0.5));
  const y = Math.max(0, Math.min(art.height - 1, v * art.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(art.width - 1, x0 + 1);
  const y1 = Math.min(art.height - 1, y0 + 1);
  const pixel = (px, py, c) => art.rgba[(py * art.width + px) * 4 + c];
  return WHITE.map((_, c) => {
    const top = pixel(x0, y0, c) + (pixel(x1, y0, c) - pixel(x0, y0, c)) * (x - x0);
    const bottom = pixel(x0, y1, c) + (pixel(x1, y1, c) - pixel(x0, y1, c)) * (x - x0);
    return top + (bottom - top) * (y - y0);
  });
};

const insideRoundedSquare = (x, y, radius) => {
  const cx = Math.max(radius, Math.min(1 - radius, x));
  const cy = Math.max(radius, Math.min(1 - radius, y));
  return Math.hypot(x - cx, y - cy) <= radius;
};

// `radius` rounds the background; `scale` is the side of the art as a part of the icon.
const drawIcon = (size, { radius, scale }) => {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let alpha = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (x + (sx + 0.5) / SAMPLES) / size;
          const v = (y + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedSquare(u, v, radius)) continue;
          alpha++;
          sampleArt((u - 0.5) / scale + 0.5, (v - 0.5) / scale + 0.5).forEach((value, c) => (sum[c] += value));
        }
      }
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[offset + c] = alpha ? Math.round(sum[c] / alpha) : 0;
      rgba[offset + 3] = Math.round((alpha / SAMPLES ** 2) * 255);
    }
  }
  return encodePng(size, rgba);
};

mkdirSync(outDir, { recursive: true });

// The art fills 0.94 of its square. At 0.64 its corners stay in the maskable safe zone,
// a circle of radius 0.4.
const ICONS = [
  ['icon-192.png', 192, { radius: 0.22, scale: 0.84 }],
  ['icon-512.png', 512, { radius: 0.22, scale: 0.84 }],
  ['icon-maskable-512.png', 512, { radius: 0, scale: 0.64 }],
];

ICONS.forEach(([name, size, options]) => {
  writeFileSync(new URL(name, outDir), drawIcon(size, options));
  console.log(`icons/${name}`);
});

// The logo of the walkthrough: the art with no background, three times its 96 px on screen.
const LOGO_SIZE = 288;
const logo = resizeRgba({ ...art, rgba: clearWhite(art) }, LOGO_SIZE);
writeFileSync(new URL('logo.png', outDir), encodePng(LOGO_SIZE, logo));
console.log('icons/logo.png');
