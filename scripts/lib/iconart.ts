/**
 * The launcher icon, as shapes in the 108x108 adaptive-icon viewport, plus a
 * tiny rasteriser and PNG encoder for platforms that insist on bitmaps
 * (iOS app icon, web app icons). Used by scripts/icon.ts and vite.config.ts.
 */
import { deflateSync } from 'node:zlib';

/** A filled rounded rectangle in the 108x108 adaptive-icon viewport. */
export interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  fill: string;
}

export const BG = '#14172B';

// 4x4 board inside the adaptive-icon safe zone (centre 66 of 108)
const C = 11; // cell
const O = 32; // origin
const cell = (cx: number, cy: number, w: number, h: number, base: string, dark: string): Shape[] => {
  const x = O + cx * C + 0.8;
  const y = O + cy * C + 0.8;
  const W = w * C - 1.6;
  const H = h * C - 1.6;
  return [
    { x, y: y + 1.2, w: W, h: H, r: 3, fill: dark },
    { x, y, w: W, h: H - 1, r: 3, fill: base },
  ];
};
export const fg: Shape[] = [
  { x: O - 4, y: O - 4, w: 4 * C + 8, h: 4 * C + 8, r: 6, fill: '#2A2F52' },
  { x: O, y: O, w: 4 * C, h: 4 * C, r: 2, fill: '#E9E2D4' },
  // gate on the right (green) beside rows 2..3
  { x: O + 4 * C, y: O + 2 * C + 1, w: 4, h: 2 * C - 2, r: 1.5, fill: '#1FCF8F' },
  ...cell(0, 0, 1, 2, '#F0476A', '#A8213F'),
  ...cell(1, 1, 1, 1, '#F0476A', '#A8213F'),
  ...cell(1, 0, 3, 1, '#3D8BFF', '#1F53B0'),
  ...cell(2, 1, 2, 1, '#FFC93D', '#C08A0A'),
  ...cell(0, 2, 2, 2, '#9D63F0', '#6532B0'),
  ...cell(2, 2, 2, 1, '#1FCF8F', '#0C8A5C'),
  ...cell(2, 3, 1, 1, '#FF8A3D', '#C0561A'),
];


const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/**
 * Rasterise shapes into an RGBA buffer. Viewport unit u maps to pixel
 * (u - cx) * scale + size / 2. Anti-aliased by the rounded rect's signed
 * distance, which is exact enough for axis-aligned shapes.
 */
export function raster(shapes: Shape[], size: number, scale: number, cx: number, bg?: string): Uint8Array {
  const px = new Float32Array(size * size * 4); // premultiplied
  if (bg) {
    const [r, g, b] = hex(bg);
    for (let i = 0; i < size * size; i++) px.set([r, g, b, 255], i * 4);
  }
  for (const s of shapes) {
    const [r, g, b] = hex(s.fill);
    const x0 = (s.x - cx) * scale + size / 2;
    const y0 = (s.y - cx) * scale + size / 2;
    const w = s.w * scale;
    const h = s.h * scale;
    const rad = s.r * scale;
    const hx = w / 2;
    const hy = h / 2;
    const mx = x0 + hx;
    const my = y0 + hy;
    for (let y = Math.max(0, Math.floor(y0) - 1); y < Math.min(size, Math.ceil(y0 + h) + 1); y++) {
      for (let x = Math.max(0, Math.floor(x0) - 1); x < Math.min(size, Math.ceil(x0 + w) + 1); x++) {
        const qx = Math.abs(x + 0.5 - mx) - (hx - rad);
        const qy = Math.abs(y + 0.5 - my) - (hy - rad);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        const a = Math.min(1, Math.max(0, 0.5 - d));
        if (a <= 0) continue;
        const i = (y * size + x) * 4;
        px[i] = r * a + px[i] * (1 - a);
        px[i + 1] = g * a + px[i + 1] * (1 - a);
        px[i + 2] = b * a + px[i + 2] * (1 - a);
        px[i + 3] = 255 * a + px[i + 3] * (1 - a);
      }
    }
  }
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = px[i * 4 + 3];
    for (let k = 0; k < 3; k++) out[i * 4 + k] = a > 0 ? Math.round((px[i * 4 + k] * 255) / a) : 0;
    out[i * 4 + 3] = Math.round(a);
  }
  return out;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** PNG from RGBA; `opaque` drops the alpha channel (iOS app icons must have none). */
export function png(rgba: Uint8Array, size: number, opaque: boolean): Buffer {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc(size * (size * ch + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * ch + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++)
      for (let k = 0; k < ch; k++) raw[row + 1 + x * ch + k] = rgba[(y * size + x) * 4 + k];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = opaque ? 2 : 6; // RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}


/**
 * Opaque square icon with the board filling `fill` of the side (iOS and
 * browsers round the corners themselves). 0.72 suits app icons; 0.5 keeps it
 * inside the circular safe zone of an Android "maskable" icon.
 */
export const squareIcon = (size: number, fill = 0.72) => png(raster(fg, size, (size * fill) / 52, 54, BG), size, true);
