/** Block/gate colours. Each colour also has a glyph so it never relies on hue alone. */
export interface BlockColor {
  name: string;
  base: number;
  light: number;
  dark: number;
  glyph: 'circle' | 'square' | 'triangle' | 'star' | 'diamond' | 'cross';
}

export const COLORS: BlockColor[] = [
  { name: 'red', base: 0xf0476a, light: 0xff8aa0, dark: 0xa8213f, glyph: 'circle' },
  { name: 'blue', base: 0x3d8bff, light: 0x8cbcff, dark: 0x1f53b0, glyph: 'square' },
  { name: 'green', base: 0x1fcf8f, light: 0x7af0c2, dark: 0x0c8a5c, glyph: 'triangle' },
  { name: 'yellow', base: 0xffc93d, light: 0xffe597, dark: 0xc08a0a, glyph: 'star' },
  { name: 'purple', base: 0x9d63f0, light: 0xc8a6ff, dark: 0x6532b0, glyph: 'diamond' },
  { name: 'orange', base: 0xff8a3d, light: 0xffbb8c, dark: 0xc0561a, glyph: 'cross' },
];

export const UI = {
  bg: 0x14172b,
  bgTop: 0x1f2444,
  frame: 0x2a2f52,
  frameLight: 0x3a4170,
  frameDark: 0x0e1022,
  floor: 0xe9e2d4,
  floorAlt: 0xdfd6c5,
  floorLine: 0xcfc5b2,
  wall: 0x5b5f7a,
  wallLight: 0x7c809c,
  wallDark: 0x3c3f56,
  text: 0xf4f1ea,
  textDim: 0x9aa0c4,
  accent: 0xffc93d,
  ice: 0xcfeeff,
  button: 0x2f355f,
  buttonLight: 0x434a80,
};

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t)
  );
}
