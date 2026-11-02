// PNG encoder and decoder for 8-bit RGBA without interlace. No dependencies: node:zlib only.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 4;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

export const encodePng = (size, rgba) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
  const raw = Buffer.alloc((size * CHANNELS + 1) * size);
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * CHANNELS + 1) + 1, y * size * CHANNELS, (y + 1) * size * CHANNELS);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpLeft = Math.abs(estimate - upLeft);
  if (dLeft <= dUp && dLeft <= dUpLeft) return left;
  return dUp <= dUpLeft ? up : upLeft;
};

// Each row of the raw data starts with the filter that predicts its bytes from the bytes before.
const unfilter = (raw, width, height) => {
  const stride = width * CHANNELS;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= CHANNELS ? rgba[at - CHANNELS] : 0;
      const up = y > 0 ? rgba[at - stride] : 0;
      const upLeft = x >= CHANNELS && y > 0 ? rgba[at - stride - CHANNELS] : 0;
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      rgba[at] = (raw[y * (stride + 1) + 1 + x] + predicted) & 0xff;
    }
  }
  return rgba;
};

export const decodePng = (png) => {
  if (!png.subarray(0, SIGNATURE.length).equals(SIGNATURE)) throw new Error('not a PNG');
  const data = [];
  let header;
  for (let at = SIGNATURE.length; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') header = body;
    if (type === 'IDAT') data.push(body);
    at += length + 12;
  }
  const [depth, colour, , , interlace] = header.subarray(8);
  if (depth !== 8 || colour !== 6 || interlace !== 0) throw new Error('only 8-bit RGBA without interlace');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  return { width, height, rgba: unfilter(inflateSync(Buffer.concat(data)), width, height) };
};

// The least channel of a pixel that counts as the white of the background.
const LIGHT = 240;

// The art with its white background made transparent. The background is the light pixels that
// connect to the edge, so a white inside the art stays. The background and the pixels that touch
// it take back the white they were blended with: alpha is the distance from white.
export const clearWhite = ({ width, height, rgba }) => {
  const out = Buffer.from(rgba);
  const light = (n) => Math.min(rgba[n * 4], rgba[n * 4 + 1], rgba[n * 4 + 2]) >= LIGHT;
  const neighbours = (n) => {
    const x = n % width;
    const y = Math.floor(n / width);
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .filter(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height)
      .map(([nx, ny]) => ny * width + nx);
  };
  const background = new Uint8Array(width * height);
  const queue = [];
  for (let n = 0; n < width * height; n++) {
    const x = n % width;
    const y = Math.floor(n / width);
    const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    if (edge && light(n)) {
      background[n] = 1;
      queue.push(n);
    }
  }
  while (queue.length) {
    for (const next of neighbours(queue.pop())) {
      if (background[next] || !light(next)) continue;
      background[next] = 1;
      queue.push(next);
    }
  }
  for (let n = 0; n < width * height; n++) {
    if (!background[n] && !neighbours(n).some((next) => background[next])) continue;
    const colour = [0, 1, 2].map((c) => rgba[n * 4 + c]);
    const alpha = Math.max(...colour.map((value) => 255 - value)) / 255;
    colour.forEach((value, c) => {
      out[n * 4 + c] = alpha ? Math.round((value - 255 * (1 - alpha)) / alpha) : 0;
    });
    out[n * 4 + 3] = Math.round(alpha * rgba[n * 4 + 3]);
  }
  return out;
};

// A square RGBA image of side `size`, each pixel the average of the pixels it covers. The colour
// is weighed by alpha, so a transparent pixel adds no colour to its neighbours.
export const resizeRgba = ({ width, height, rgba }, size, samples = 4) => {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = Math.floor(((x + (sx + 0.5) / samples) / size) * width);
          const py = Math.floor(((y + (sy + 0.5) / samples) / size) * height);
          const at = (py * width + px) * 4;
          const alpha = rgba[at + 3];
          for (let c = 0; c < 3; c++) sum[c] += rgba[at + c] * alpha;
          sum[3] += alpha;
        }
      }
      const at = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) out[at + c] = sum[3] ? Math.round(sum[c] / sum[3]) : 0;
      out[at + 3] = Math.round(sum[3] / samples ** 2);
    }
  }
  return out;
};
