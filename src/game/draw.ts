/**
 * Procedural drawing: every block, gate, wall and icon is drawn with Phaser
 * Graphics. No image files.
 */
import type Phaser from 'phaser';
import { type BlockColor, COLORS, UI, mix } from './palette';

type G = Phaser.GameObjects.Graphics;
type Cells = [number, number][];

const has = (set: Set<string>, x: number, y: number) => set.has(`${x},${y}`);

/**
 * Fill the union of polyomino cells, inset by `d` from the cell edges, with
 * rounded convex corners. Bridges join neighbouring cells so the shape reads
 * as one piece with crisp concave corners.
 */
export function fillUnion(g: G, cells: Cells, cs: number, d: number, r: number, ox = 0, oy = 0) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const rr = Math.max(0, Math.min(r, cs / 2 - d));
  for (const [x, y] of cells) {
    const L = has(set, x - 1, y);
    const R = has(set, x + 1, y);
    const U = has(set, x, y - 1);
    const D = has(set, x, y + 1);
    const x0 = x * cs + d + ox;
    const y0 = y * cs + d + oy;
    const w = cs - 2 * d;
    g.fillRoundedRect(x0, y0, w, w, {
      tl: !L && !U ? rr : 0,
      tr: !R && !U ? rr : 0,
      bl: !L && !D ? rr : 0,
      br: !R && !D ? rr : 0,
    });
    if (R) g.fillRect((x + 1) * cs - d - 0.5 + ox, y0, 2 * d + 1, w);
    if (D) g.fillRect(x0, (y + 1) * cs - d - 0.5 + oy, w, 2 * d + 1);
    if (R && D && has(set, x + 1, y + 1)) g.fillRect((x + 1) * cs - d - 0.5 + ox, (y + 1) * cs - d - 0.5 + oy, 2 * d + 1, 2 * d + 1);
  }
}

/** Cell closest to the shape's centroid (where the glyph goes). */
export function centreCell(cells: Cells): [number, number] {
  const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length;
  const cy = cells.reduce((a, c) => a + c[1], 0) / cells.length;
  let best = cells[0];
  let bd = Infinity;
  for (const c of cells) {
    const d = (c[0] - cx) ** 2 + (c[1] - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function drawGlyph(g: G, kind: BlockColor['glyph'], cx: number, cy: number, r: number, color: number, alpha = 1) {
  g.fillStyle(color, alpha);
  switch (kind) {
    case 'circle':
      g.fillCircle(cx, cy, r * 0.85);
      break;
    case 'square':
      g.fillRoundedRect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5, r * 0.25);
      break;
    case 'triangle':
      g.fillTriangle(cx, cy - r * 0.95, cx + r * 0.95, cy + r * 0.7, cx - r * 0.95, cy + r * 0.7);
      break;
    case 'diamond':
      g.fillTriangle(cx, cy - r, cx + r * 0.8, cy, cx - r * 0.8, cy);
      g.fillTriangle(cx, cy + r, cx + r * 0.8, cy, cx - r * 0.8, cy);
      break;
    case 'cross': {
      const t = r * 0.38;
      g.fillRect(cx - r * 0.9, cy - t, r * 1.8, t * 2);
      g.fillRect(cx - t, cy - r * 0.9, t * 2, r * 1.8);
      break;
    }
    case 'star':
      drawStarShape(g, cx, cy, r * 1.05, r * 0.45);
      break;
  }
}

export function drawStarShape(g: G, cx: number, cy: number, ro: number, ri: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? ri : ro;
    pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad });
  }
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
}

export interface BlockLook {
  cells: Cells;
  colors: number[];
  layer: number;
  axis?: 'h' | 'v';
  ice: number;
  /** For crack pattern variety. */
  seed: number;
}

/** Draw a block in local coordinates (anchor at 0,0). */
export function drawBlock(g: G, b: BlockLook, cs: number) {
  g.clear();
  const outer = COLORS[b.colors[b.layer]];
  const core = b.layer < b.colors.length - 1 ? COLORS[b.colors[b.colors.length - 1]] : null;
  const d = cs * 0.045;
  const r = cs * 0.2;
  // drop shadow + bevel
  g.fillStyle(0x000000, 0.22);
  fillUnion(g, b.cells, cs, d, r, cs * 0.03, cs * 0.07);
  g.fillStyle(outer.dark, 1);
  fillUnion(g, b.cells, cs, d, r, 0, cs * 0.035);
  g.fillStyle(outer.light, 1);
  fillUnion(g, b.cells, cs, d, r, 0, -cs * 0.01);
  g.fillStyle(outer.base, 1);
  fillUnion(g, b.cells, cs, d + cs * 0.04, r * 0.85, 0, cs * 0.012);
  const [gx, gy] = centreCell(b.cells);
  const ccx = (gx + 0.5) * cs;
  const ccy = (gy + 0.5) * cs;
  if (core) {
    // shell rim with a recessed core
    const ci = cs * 0.2;
    g.fillStyle(outer.dark, 0.9);
    fillUnion(g, b.cells, cs, ci - cs * 0.02, r * 0.6, 0, -cs * 0.015);
    g.fillStyle(core.dark, 1);
    fillUnion(g, b.cells, cs, ci, r * 0.55, 0, cs * 0.01);
    g.fillStyle(core.base, 1);
    fillUnion(g, b.cells, cs, ci + cs * 0.03, r * 0.5, 0, cs * 0.02);
    drawGlyph(g, core.glyph, ccx, ccy + cs * 0.02, cs * 0.12, core.dark, 0.85);
    // small shell glyphs in the rim so the outer colour reads without hue
    for (const [x, y] of b.cells) drawGlyph(g, outer.glyph, x * cs + cs * 0.135, y * cs + cs * 0.135, cs * 0.05, outer.dark, 0.9);
  } else {
    drawGlyph(g, outer.glyph, ccx, ccy + cs * 0.01, cs * 0.15, outer.dark, 0.55);
  }
  if (b.axis) drawAxis(g, b, cs, outer);
  if (b.ice > 0) drawIce(g, b, cs);
}

function drawAxis(g: G, b: BlockLook, cs: number, col: BlockColor) {
  const set = new Set(b.cells.map(([x, y]) => `${x},${y}`));
  const ink = mix(col.dark, 0x000000, 0.25);
  g.fillStyle(ink, 0.75);
  const t = cs * 0.035;
  for (const [x, y] of b.cells) {
    const x0 = x * cs;
    const y0 = y * cs;
    if (b.axis === 'h') {
      // rails
      const ext0 = has(set, x - 1, y) ? 0 : cs * 0.18;
      const ext1 = has(set, x + 1, y) ? 0 : cs * 0.18;
      g.fillRect(x0 + ext0, y0 + cs * 0.3 - t / 2, cs - ext0 - ext1, t);
      g.fillRect(x0 + ext0, y0 + cs * 0.7 - t / 2, cs - ext0 - ext1, t);
      if (!has(set, x - 1, y)) g.fillTriangle(x0 + cs * 0.08, y0 + cs * 0.5, x0 + cs * 0.24, y0 + cs * 0.36, x0 + cs * 0.24, y0 + cs * 0.64);
      if (!has(set, x + 1, y))
        g.fillTriangle(x0 + cs * 0.92, y0 + cs * 0.5, x0 + cs * 0.76, y0 + cs * 0.36, x0 + cs * 0.76, y0 + cs * 0.64);
    } else {
      const ext0 = has(set, x, y - 1) ? 0 : cs * 0.18;
      const ext1 = has(set, x, y + 1) ? 0 : cs * 0.18;
      g.fillRect(x0 + cs * 0.3 - t / 2, y0 + ext0, t, cs - ext0 - ext1);
      g.fillRect(x0 + cs * 0.7 - t / 2, y0 + ext0, t, cs - ext0 - ext1);
      if (!has(set, x, y - 1)) g.fillTriangle(x0 + cs * 0.5, y0 + cs * 0.08, x0 + cs * 0.36, y0 + cs * 0.24, x0 + cs * 0.64, y0 + cs * 0.24);
      if (!has(set, x, y + 1))
        g.fillTriangle(x0 + cs * 0.5, y0 + cs * 0.92, x0 + cs * 0.36, y0 + cs * 0.76, x0 + cs * 0.64, y0 + cs * 0.76);
    }
  }
}

function seeded(seed: number) {
  let a = seed * 9301 + 49297;
  return () => {
    a = (a * 9301 + 49297) % 233280;
    return a / 233280;
  };
}

function drawIce(g: G, b: BlockLook, cs: number) {
  // opaque frost tinted by the block colour (translucent overlaps would show seams)
  const col = COLORS[b.colors[b.layer]];
  const d = cs * 0.03;
  g.fillStyle(mix(col.base, UI.ice, 0.62), 1);
  fillUnion(g, b.cells, cs, d, cs * 0.18, 0, 0);
  g.fillStyle(mix(col.base, 0xffffff, 0.82), 1);
  fillUnion(g, b.cells, cs, d + cs * 0.1, cs * 0.12, -cs * 0.015, -cs * 0.025);
  g.fillStyle(mix(col.base, UI.ice, 0.5), 1);
  fillUnion(g, b.cells, cs, d + cs * 0.14, cs * 0.1, cs * 0.01, cs * 0.015);
  const rnd = seeded(b.seed + 7);
  g.lineStyle(Math.max(1, cs * 0.022), 0xffffff, 0.95);
  for (const [x, y] of b.cells) {
    for (let k = 0; k < 2; k++) {
      const px = (x + 0.22 + rnd() * 0.56) * cs;
      const py = (y + 0.22 + rnd() * 0.56) * cs;
      const a = rnd() * Math.PI;
      const l = cs * (0.1 + rnd() * 0.1);
      g.lineBetween(px - Math.cos(a) * l, py - Math.sin(a) * l, px + Math.cos(a) * l, py + Math.sin(a) * l);
    }
  }
  const [gx, gy] = centreCell(b.cells);
  // snowflake badge behind the counter
  g.fillStyle(0xffffff, 1);
  g.fillCircle((gx + 0.5) * cs, (gy + 0.5) * cs, cs * 0.25);
  g.lineStyle(Math.max(1, cs * 0.03), mix(col.dark, UI.ice, 0.3), 1);
  g.strokeCircle((gx + 0.5) * cs, (gy + 0.5) * cs, cs * 0.25);
}

/** Board floor, walls and frame (static layer), in board-local coordinates. */
export function drawBoard(
  g: G,
  w: number,
  h: number,
  grid: string[],
  cs: number,
  frame: number,
  plates: [number, number][] = [],
) {
  g.clear();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] !== ' ';
  // frame: union of expanded non-void cells
  const fr = frame;
  g.fillStyle(0x000000, 0.35);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (solid(x, y)) g.fillRoundedRect(x * cs - fr, y * cs - fr + cs * 0.12, cs + 2 * fr, cs + 2 * fr, fr * 0.9);
  g.fillStyle(UI.frameDark, 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (solid(x, y)) g.fillRoundedRect(x * cs - fr, y * cs - fr + cs * 0.05, cs + 2 * fr, cs + 2 * fr, fr * 0.9);
  g.fillStyle(UI.frame, 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (solid(x, y)) g.fillRoundedRect(x * cs - fr, y * cs - fr, cs + 2 * fr, cs + 2 * fr, fr * 0.9);
  g.fillStyle(UI.frameLight, 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (solid(x, y)) g.fillRoundedRect(x * cs - fr * 0.55, y * cs - fr * 0.55, cs + fr * 1.1, cs + fr * 1.1, fr * 0.5);
  g.fillStyle(UI.frameDark, 1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (solid(x, y)) g.fillRect(x * cs - cs * 0.04, y * cs - cs * 0.04, cs + cs * 0.08, cs + cs * 0.08);
  // floor
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (ch === ' ') continue;
      g.fillStyle((x + y) % 2 ? UI.floorAlt : UI.floor, 1);
      g.fillRect(x * cs, y * cs, cs, cs);
    }
  g.lineStyle(Math.max(1, cs * 0.012), UI.floorLine, 0.8);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (grid[y][x] !== ' ') g.strokeRect(x * cs, y * cs, cs, cs);
  // walls: raised stone blocks
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== '#') continue;
      const x0 = x * cs;
      const y0 = y * cs;
      g.fillStyle(UI.wallDark, 1);
      g.fillRoundedRect(x0 + cs * 0.03, y0 + cs * 0.06, cs * 0.94, cs * 0.94, cs * 0.12);
      g.fillStyle(UI.wallLight, 1);
      g.fillRoundedRect(x0 + cs * 0.03, y0 + cs * 0.02, cs * 0.94, cs * 0.9, cs * 0.12);
      g.fillStyle(UI.wall, 1);
      g.fillRoundedRect(x0 + cs * 0.08, y0 + cs * 0.08, cs * 0.84, cs * 0.8, cs * 0.1);
      const rnd = seeded(x * 31 + y * 17);
      g.fillStyle(UI.wallDark, 0.6);
      for (let k = 0; k < 4; k++) g.fillCircle(x0 + cs * (0.25 + rnd() * 0.5), y0 + cs * (0.25 + rnd() * 0.5), cs * (0.03 + rnd() * 0.04));
      g.lineStyle(Math.max(1, cs * 0.02), UI.wallDark, 0.8);
      g.lineBetween(x0 + cs * 0.2, y0 + cs * 0.48, x0 + cs * 0.8, y0 + cs * 0.48);
      g.lineBetween(x0 + cs * 0.5, y0 + cs * 0.12, x0 + cs * 0.5, y0 + cs * 0.48);
    }
  plates.forEach(([x, y], k) => drawPlate(g, x, y, k, cs));
}

export interface GateLook {
  side: 'N' | 'E' | 'S' | 'W';
  start: number;
  len: number;
  colors: number[];
  current: number;
  /** Padlock colour, and whether it is still locked. */
  lock?: number;
  locked?: boolean;
  /** Pressure plate index, and whether the gate is barred right now. */
  plate?: number;
  barred?: boolean;
}

/** A padlock in a block colour (with its glyph), centred at (cx, cy), height ~s. */
export function drawPadlock(g: G, cx: number, cy: number, s: number, color: number, open = false) {
  const col = COLORS[color];
  const bw = s * 0.72;
  const bh = s * 0.56;
  const by = cy - bh * 0.15;
  // shackle
  g.lineStyle(Math.max(2, s * 0.13), 0x2a2d3e, 1);
  g.beginPath();
  g.arc(cx, by, bw * 0.3, Math.PI, 0);
  g.strokePath();
  g.lineStyle(Math.max(1.5, s * 0.08), 0xd9dcef, 1);
  g.beginPath();
  if (open) g.arc(cx + bw * 0.12, by - s * 0.14, bw * 0.3, Math.PI * 1.1, -0.2);
  else g.arc(cx, by, bw * 0.3, Math.PI, 0);
  g.strokePath();
  // body
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(cx - bw / 2, by + s * 0.04, bw, bh, s * 0.12);
  g.fillStyle(col.dark, 1);
  g.fillRoundedRect(cx - bw / 2, by, bw, bh, s * 0.12);
  g.fillStyle(col.base, 1);
  g.fillRoundedRect(cx - bw / 2 + s * 0.05, by + s * 0.04, bw - s * 0.1, bh - s * 0.1, s * 0.09);
  drawGlyph(g, col.glyph, cx, by + bh * 0.46, s * 0.14, col.dark, 0.95);
}

/** k+1 small dots in a row (pressure plate / barred gate link marker). */
export function drawPlateDots(g: G, cx: number, cy: number, k: number, r: number, color = 0x1d2033) {
  const n = k + 1;
  g.fillStyle(color, 1);
  for (let i = 0; i < n; i++) g.fillCircle(cx + (i - (n - 1) / 2) * r * 2.6, cy, r);
}

/** A pressure plate on the floor (board-local coordinates). */
export function drawPlate(g: G, x: number, y: number, k: number, cs: number) {
  const cx = (x + 0.5) * cs;
  const cy = (y + 0.5) * cs;
  g.fillStyle(0x000000, 0.18);
  g.fillCircle(cx, cy + cs * 0.03, cs * 0.36);
  g.fillStyle(0x8c90a8, 1);
  g.fillCircle(cx, cy, cs * 0.35);
  g.fillStyle(0xb9bdd2, 1);
  g.fillCircle(cx, cy - cs * 0.02, cs * 0.3);
  g.fillStyle(0xa3a7bf, 1);
  g.fillCircle(cx, cy, cs * 0.26);
  drawPlateDots(g, cx, cy, k, cs * 0.045);
}

/** Draw one gate (board-local coordinates). Shifting gates show their colour cycle. */
export function drawGate(g: G, gt: GateLook, w: number, h: number, cs: number, frame: number, glow = 0) {
  const col = COLORS[gt.colors[gt.current % gt.colors.length]];
  const horiz = gt.side === 'N' || gt.side === 'S';
  const depth = frame * 1.02;
  const m = cs * 0.04;
  let x: number, y: number, gw: number, gh: number;
  if (horiz) {
    x = gt.start * cs + m;
    gw = gt.len * cs - 2 * m;
    gh = depth;
    y = gt.side === 'N' ? -depth : h * cs;
  } else {
    y = gt.start * cs + m;
    gh = gt.len * cs - 2 * m;
    gw = depth;
    x = gt.side === 'W' ? -depth : w * cs;
  }
  const rad = Math.min(gw, gh) * 0.42;
  // rounded only on the outer side, square where it meets the floor
  const radii =
    gt.side === 'N'
      ? { tl: rad, tr: rad, bl: 0, br: 0 }
      : gt.side === 'S'
        ? { tl: 0, tr: 0, bl: rad, br: rad }
        : gt.side === 'W'
          ? { tl: rad, tr: 0, bl: rad, br: 0 }
          : { tl: 0, tr: rad, bl: 0, br: rad };
  if (glow > 0) {
    g.fillStyle(col.light, 0.4 * glow);
    g.fillRoundedRect(x - cs * 0.1, y - cs * 0.1, gw + cs * 0.2, gh + cs * 0.2, cs * 0.2);
  }
  g.fillStyle(col.dark, 1);
  g.fillRoundedRect(x, y, gw, gh, radii);
  const inset = depth * 0.13;
  const ix = x + (gt.side === 'E' ? 0 : inset);
  const iy = y + (gt.side === 'S' ? 0 : inset);
  const iw = gw - (horiz ? 2 * inset : inset);
  const ih = gh - (horiz ? inset : 2 * inset);
  g.fillStyle(col.base, 1);
  g.fillRoundedRect(gt.side === 'W' ? x + inset : ix, gt.side === 'N' ? y + inset : iy, iw, ih, {
    tl: radii.tl * 0.8,
    tr: radii.tr * 0.8,
    bl: radii.bl * 0.8,
    br: radii.br * 0.8,
  });
  // outward chevrons, one per covered cell
  g.fillStyle(col.light, 1);
  const s2 = Math.min(depth * 0.3, cs * 0.15);
  for (let k = 0; k < gt.len; k++) {
    const c = (gt.start + k + 0.5) * cs;
    if (gt.side === 'N') g.fillTriangle(c, y + gh * 0.25, c - s2, y + gh * 0.68, c + s2, y + gh * 0.68);
    if (gt.side === 'S') g.fillTriangle(c, y + gh * 0.75, c - s2, y + gh * 0.32, c + s2, y + gh * 0.32);
    if (gt.side === 'W') g.fillTriangle(x + gw * 0.25, c, x + gw * 0.68, c - s2, x + gw * 0.68, c + s2);
    if (gt.side === 'E') g.fillTriangle(x + gw * 0.75, c, x + gw * 0.32, c - s2, x + gw * 0.32, c + s2);
  }
  // colour glyph at the ends of the gate so the colour reads without hue
  const gr = depth * 0.17;
  const ends: [number, number][] = horiz
    ? [
        [x + gr * 1.9, y + gh / 2],
        [x + gw - gr * 1.9, y + gh / 2],
      ]
    : [
        [x + gw / 2, y + gr * 1.9],
        [x + gw / 2, y + gh - gr * 1.9],
      ];
  if (gt.len >= 2) for (const [px, py] of ends) drawGlyph(g, col.glyph, px, py, gr, col.dark, 0.9);
  const mx = x + gw / 2;
  const my = y + gh / 2;
  // padlock: darkened gate with a padlock in the key colour
  if (gt.lock !== undefined) {
    if (gt.locked) {
      // dim, but keep the gate's colour readable: you plan around it
      g.fillStyle(UI.frameDark, 0.38);
      g.fillRoundedRect(x, y, gw, gh, radii);
    }
    const ls = Math.min(cs * 0.5, (horiz ? gh : gw) * 1.05);
    const lx = horiz ? x + gw / 2 : x + gw / 2;
    const ly = horiz ? y + gh / 2 : y + gh / 2;
    drawPadlock(g, lx, ly, ls, gt.lock, !gt.locked);
  }
  // pressure plate: portcullis bars while nobody holds the plate, and the plate's dots
  if (gt.plate !== undefined) {
    if (gt.barred) {
      const n = Math.max(2, gt.len * 2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        g.fillStyle(0x2a2d3e, 1);
        if (horiz) g.fillRect(x + gw * t - cs * 0.045, y, cs * 0.09, gh);
        else g.fillRect(x, y + gh * t - cs * 0.045, gw, cs * 0.09);
        g.fillStyle(0xb9bdd2, 1);
        if (horiz) g.fillRect(x + gw * t - cs * 0.025, y, cs * 0.05, gh);
        else g.fillRect(x, y + gh * t - cs * 0.025, gw, cs * 0.05);
      }
    }
    // dots outside the frame so they read against the dark background
    const out = depth + cs * 0.16;
    const mxx = x + gw / 2;
    const myy = y + gh / 2;
    let px: number, py: number;
    if (gt.side === 'N') [px, py] = [mxx, -out];
    else if (gt.side === 'S') [px, py] = [mxx, h * cs + out];
    else if (gt.side === 'W') [px, py] = [-out, myy];
    else [px, py] = [w * cs + out, myy];
    const pr = cs * 0.05;
    const n = gt.plate + 1;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(px - pr * (1.6 + 1.3 * (n - 1)), py - pr * 1.6, pr * (3.2 + 2.6 * (n - 1)), pr * 3.2, pr * 1.6);
    drawPlateDots(g, px, py, gt.plate, pr, 0xd9dcef);
  }
  // cycle indicator for shifting gates: dots beyond the frame
  if (gt.colors.length > 1) {
    const n = gt.colors.length;
    const dr = cs * 0.11;
    const gap = dr * 2.8;
    const total = gap * (n - 1);
    for (let i = 0; i < n; i++) {
      const ci = (gt.current + i) % n; // current first
      const cc = COLORS[gt.colors[ci]];
      let px: number, py: number;
      const t = -total / 2 + i * gap;
      const out = depth + cs * 0.2;
      if (gt.side === 'N') [px, py] = [mx + t, -out];
      else if (gt.side === 'S') [px, py] = [mx + t, h * cs + out];
      else if (gt.side === 'W') [px, py] = [-out, my + t];
      else [px, py] = [w * cs + out, my + t];
      const rr = i === 0 ? dr * 1.25 : dr * 0.85;
      g.fillStyle(0x000000, 0.4);
      g.fillCircle(px, py + dr * 0.2, rr * 1.15);
      g.fillStyle(cc.base, i === 0 ? 1 : 0.85);
      g.fillCircle(px, py, rr);
      drawGlyph(g, cc.glyph, px, py, rr * 0.55, cc.dark, 0.9);
      if (i === 0) {
        g.lineStyle(Math.max(1, cs * 0.02), 0xffffff, 0.9);
        g.strokeCircle(px, py, rr * 1.3);
      }
    }
  }
}

export type IconName =
  | 'undo'
  | 'restart'
  | 'hint'
  | 'back'
  | 'next'
  | 'grid'
  | 'sound'
  | 'mute'
  | 'buzz'
  | 'nobuzz'
  | 'lock'
  | 'play';

/** Simple line icons centred at (cx, cy) within a box of size s. */
export function drawIcon(g: G, name: IconName, cx: number, cy: number, s: number, color: number) {
  const lw = Math.max(2, s * 0.11);
  g.lineStyle(lw, color, 1);
  g.fillStyle(color, 1);
  const r = s * 0.32;
  const arc = (a0: number, a1: number, rad = r, anticlockwise = false) => {
    g.beginPath();
    g.arc(cx, cy, rad, a0, a1, anticlockwise);
    g.strokePath();
  };
  switch (name) {
    case 'undo': {
      arc(Math.PI * 1.05, Math.PI * 2.35);
      const ax = cx + Math.cos(Math.PI * 1.05) * r;
      const ay = cy + Math.sin(Math.PI * 1.05) * r;
      g.fillTriangle(ax - s * 0.17, ay - s * 0.02, ax + s * 0.13, ay - s * 0.05, ax - s * 0.03, ay + s * 0.2);
      break;
    }
    case 'restart': {
      arc(Math.PI * 1.7, Math.PI * 3.35);
      const ax = cx + Math.cos(Math.PI * 1.7) * r;
      const ay = cy + Math.sin(Math.PI * 1.7) * r;
      g.fillTriangle(ax - s * 0.14, ay - s * 0.14, ax + s * 0.16, ay - s * 0.02, ax - s * 0.06, ay + s * 0.15);
      break;
    }
    case 'hint': {
      // light bulb
      g.strokeCircle(cx, cy - s * 0.08, s * 0.24);
      g.fillRect(cx - s * 0.12, cy + s * 0.18, s * 0.24, s * 0.07);
      g.fillRect(cx - s * 0.09, cy + s * 0.29, s * 0.18, s * 0.06);
      g.lineBetween(cx, cy - s * 0.2, cx, cy + s * 0.02);
      break;
    }
    case 'back':
      g.lineBetween(cx + s * 0.18, cy - s * 0.28, cx - s * 0.12, cy);
      g.lineBetween(cx - s * 0.12, cy, cx + s * 0.18, cy + s * 0.28);
      break;
    case 'next':
      g.lineBetween(cx - s * 0.12, cy - s * 0.28, cx + s * 0.18, cy);
      g.lineBetween(cx + s * 0.18, cy, cx - s * 0.12, cy + s * 0.28);
      break;
    case 'play':
      g.fillTriangle(cx - s * 0.2, cy - s * 0.3, cx + s * 0.3, cy, cx - s * 0.2, cy + s * 0.3);
      break;
    case 'grid':
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++)
          g.fillRoundedRect(cx - s * 0.3 + i * s * 0.33, cy - s * 0.3 + j * s * 0.33, s * 0.27, s * 0.27, s * 0.06);
      break;
    case 'sound':
    case 'mute': {
      g.fillRect(cx - s * 0.32, cy - s * 0.1, s * 0.14, s * 0.2);
      g.fillTriangle(cx - s * 0.2, cy - s * 0.1, cx + s * 0.02, cy - s * 0.3, cx + s * 0.02, cy + s * 0.3);
      g.fillTriangle(cx - s * 0.2, cy + s * 0.1, cx + s * 0.02, cy + s * 0.3, cx - s * 0.2, cy - s * 0.1);
      if (name === 'sound') {
        g.beginPath();
        g.arc(cx + s * 0.05, cy, s * 0.17, -0.8, 0.8);
        g.strokePath();
        g.beginPath();
        g.arc(cx + s * 0.05, cy, s * 0.3, -0.8, 0.8);
        g.strokePath();
      } else {
        g.lineBetween(cx + s * 0.1, cy - s * 0.12, cx + s * 0.32, cy + s * 0.12);
        g.lineBetween(cx + s * 0.32, cy - s * 0.12, cx + s * 0.1, cy + s * 0.12);
      }
      break;
    }
    case 'buzz':
    case 'nobuzz': {
      g.strokeRoundedRect(cx - s * 0.13, cy - s * 0.26, s * 0.26, s * 0.52, s * 0.06);
      if (name === 'buzz') {
        g.lineBetween(cx - s * 0.26, cy - s * 0.12, cx - s * 0.26, cy + s * 0.12);
        g.lineBetween(cx + s * 0.26, cy - s * 0.12, cx + s * 0.26, cy + s * 0.12);
        g.lineBetween(cx - s * 0.36, cy - s * 0.06, cx - s * 0.36, cy + s * 0.06);
        g.lineBetween(cx + s * 0.36, cy - s * 0.06, cx + s * 0.36, cy + s * 0.06);
      } else g.lineBetween(cx - s * 0.3, cy + s * 0.3, cx + s * 0.3, cy - s * 0.3);
      break;
    }
    case 'lock':
      g.fillRoundedRect(cx - s * 0.22, cy - s * 0.04, s * 0.44, s * 0.34, s * 0.06);
      g.beginPath();
      g.arc(cx, cy - s * 0.06, s * 0.15, Math.PI, 0);
      g.strokePath();
      g.lineBetween(cx - s * 0.15, cy - s * 0.06, cx - s * 0.15, cy - s * 0.02);
      g.lineBetween(cx + s * 0.15, cy - s * 0.06, cx + s * 0.15, cy - s * 0.02);
      break;
  }
}

/** Gold star (filled) or empty slot. */
export function drawStar(g: G, cx: number, cy: number, r: number, filled: boolean) {
  if (filled) {
    g.fillStyle(0xb07a00, 1);
    drawStarShape(g, cx, cy + r * 0.08, r, r * 0.48);
    g.fillStyle(UI.accent, 1);
    drawStarShape(g, cx, cy, r, r * 0.48);
    g.fillStyle(0xfff1b8, 0.8);
    drawStarShape(g, cx - r * 0.12, cy - r * 0.14, r * 0.38, r * 0.18);
  } else {
    g.fillStyle(0x000000, 0.3);
    drawStarShape(g, cx, cy + r * 0.06, r, r * 0.48);
    g.fillStyle(0x50557f, 1);
    drawStarShape(g, cx, cy, r, r * 0.48);
  }
}

/**
 * Chunky block-letter font for the title. 5 rows; '#' = block.
 */
const FONT: Record<string, string[]> = {
  A: ['####', '#..#', '####', '#..#', '#..#'],
  B: ['###.', '#..#', '####', '#..#', '###.'],
  C: ['####', '#...', '#...', '#...', '####'],
  E: ['####', '#...', '###.', '#...', '####'],
  G: ['####', '#...', '#.##', '#..#', '####'],
  K: ['#.##', '#.#.', '###.', '#.#.', '#.##'],
  L: ['#...', '#...', '#...', '#...', '####'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['####', '#..#', '#..#', '#..#', '####'],
  R: ['####', '#..#', '####', '#.#.', '#.##'],
  S: ['####', '#...', '####', '...#', '####'],
};

/** Draw a word in block letters (each letter is one chunky polyomino); returns its width. */
export function drawBlockWord(g: G, word: string, x: number, y: number, px: number, colorAt: (i: number) => number): number {
  let cx = x;
  let k = 0;
  for (const ch of word) {
    const rows = FONT[ch];
    if (!rows) {
      cx += px * 2;
      continue;
    }
    const col = colorAt(k++);
    const c = COLORS.find((cc) => cc.base === col) ?? COLORS[0];
    const cells: Cells = [];
    rows.forEach((row, r) => [...row].forEach((v, q) => v === '#' && cells.push([q, r])));
    const d = px * 0.03;
    g.fillStyle(0x000000, 0.25);
    fillUnion(g, cells, px, d, px * 0.3, cx + px * 0.04, y + px * 0.14);
    g.fillStyle(c.dark, 1);
    fillUnion(g, cells, px, d, px * 0.3, cx, y + px * 0.07);
    g.fillStyle(c.light, 1);
    fillUnion(g, cells, px, d, px * 0.3, cx, y - px * 0.02);
    g.fillStyle(c.base, 1);
    fillUnion(g, cells, px, d + px * 0.08, px * 0.24, cx, y + px * 0.02);
    cx += (rows[0].length + 1) * px;
  }
  return cx - x - px;
}

export const blockWordWidth = (word: string, px: number) =>
  [...word].reduce((w, ch) => w + ((FONT[ch]?.[0].length ?? 1) + 1) * px, 0) - px;
