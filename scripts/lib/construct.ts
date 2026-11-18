/**
 * Random construction and mutation of candidate puzzles. Nothing here judges
 * quality; that is evaluate.ts's job.
 */
import { compile } from '../../src/core/engine';
import { FAMILIES, family, type Cells } from '../../src/core/shapes';
import type { Rng } from '../../src/core/rng';
import type { Axis, BlockDef, GateDef, Puzzle, Side } from '../../src/core/types';

export interface Spec {
  index: number;
  w: number;
  h: number;
  colors: number;
  blocks: [number, number];
  /** Shape family weights. */
  shapes: Record<string, number>;
  /** Interior wall cells to scatter (count range). */
  walls?: [number, number];
  /** Void cells carved from the border/corners (count range). */
  voids?: [number, number];
  oneway?: [number, number];
  ice?: [number, number];
  layered?: [number, number];
  shifting?: [number, number];
  /** Padlocked gates. */
  locks?: [number, number];
  /** Pressure plates (each linked to at least one gate). */
  plates?: [number, number];
  /** Extra gates beyond one per colour. */
  extraGates?: [number, number];
  maxGateLen?: number;
}

export const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];
export function shuffle<T>(rng: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clone = (p: Puzzle): Puzzle => JSON.parse(JSON.stringify(p));

function weighted(rng: Rng, w: Record<string, number>): string {
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rng() * tot;
  for (const [k, v] of Object.entries(w)) {
    r -= v;
    if (r < 0) return k;
  }
  return Object.keys(w)[0];
}

export function randomShape(rng: Rng, spec: Spec): Cells {
  return pick(rng, family(weighted(rng, spec.shapes)).variants);
}

export function occupancy(p: Puzzle, skip = -1): Set<string> {
  const s = new Set<string>();
  p.blocks.forEach((b, i) => {
    if (i === skip) return;
    for (const [dx, dy] of b.cells) s.add(`${b.x + dx},${b.y + dy}`);
  });
  return s;
}

const isFloor = (p: Puzzle, x: number, y: number) => x >= 0 && y >= 0 && x < p.w && y < p.h && p.grid[y][x] === '.';

export function fitsAt(p: Puzzle, cells: Cells, x: number, y: number, occ: Set<string>): boolean {
  return cells.every(([dx, dy]) => isFloor(p, x + dx, y + dy) && !occ.has(`${x + dx},${y + dy}`));
}

function setCell(p: Puzzle, x: number, y: number, ch: string) {
  p.grid[y] = p.grid[y].slice(0, x) + ch + p.grid[y].slice(x + 1);
}

const sideLen = (p: Puzzle, s: Side) => (s === 'N' || s === 'S' ? p.w : p.h);

/** Border cell inward of gate position k on side s. */
function borderCell(p: Puzzle, s: Side, k: number): [number, number] {
  if (s === 'N') return [k, 0];
  if (s === 'S') return [k, p.h - 1];
  if (s === 'W') return [0, k];
  return [p.w - 1, k];
}

export function gateOk(p: Puzzle, g: GateDef, others: GateDef[]): boolean {
  if (g.start < 0 || g.len < 1 || g.start + g.len > sideLen(p, g.side)) return false;
  for (let k = g.start; k < g.start + g.len; k++) {
    const [x, y] = borderCell(p, g.side, k);
    if (!isFloor(p, x, y)) return false;
  }
  for (const o of others) {
    if (o === g || o.side !== g.side) continue;
    // keep at least one wall cell between gates on the same side
    if (g.start <= o.start + o.len && o.start <= g.start + g.len) return false;
  }
  return true;
}

export function randomGate(rng: Rng, p: Puzzle, colors: number[], others: GateDef[], maxLen: number): GateDef | null {
  for (let t = 0; t < 60; t++) {
    const side = pick(rng, ['N', 'E', 'S', 'W'] as Side[]);
    const len = randInt(rng, 1, Math.min(maxLen, sideLen(p, side) - 1));
    const start = randInt(rng, 0, sideLen(p, side) - len);
    const g = { side, start, len, colors };
    if (gateOk(p, g, others)) return g;
  }
  return null;
}

function carveVoids(rng: Rng, p: Puzzle, n: number) {
  // bite cells from the border, growing from corners/edges so the box stays connected
  let made = 0;
  for (let t = 0; t < 200 && made < n; t++) {
    const onEdge = rng() < 0.5;
    let x: number, y: number;
    if (onEdge) {
      x = pick(rng, [0, p.w - 1]);
      y = randInt(rng, 0, p.h - 1);
      if (rng() < 0.5) [x, y] = [randInt(rng, 0, p.w - 1), pick(rng, [0, p.h - 1])];
    } else {
      // grow an existing void inward
      const voids: [number, number][] = [];
      for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) if (p.grid[yy][xx] === ' ') voids.push([xx, yy]);
      if (!voids.length) continue;
      const [vx, vy] = pick(rng, voids);
      const [ox, oy] = pick(rng, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
      x = vx + ox;
      y = vy + oy;
    }
    if (!isFloor(p, x, y)) continue;
    setCell(p, x, y, ' ');
    if (!connected(p)) {
      setCell(p, x, y, '.');
      continue;
    }
    made++;
  }
}

function addWalls(rng: Rng, p: Puzzle, n: number) {
  let made = 0;
  for (let t = 0; t < 200 && made < n; t++) {
    const x = randInt(rng, 0, p.w - 1);
    const y = randInt(rng, 0, p.h - 1);
    if (!isFloor(p, x, y)) continue;
    setCell(p, x, y, '#');
    if (!connected(p)) {
      setCell(p, x, y, '.');
      continue;
    }
    made++;
  }
}

export function connected(p: Puzzle): boolean {
  const cells: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.grid[y][x] === '.') cells.push([x, y]);
  if (!cells.length) return false;
  const seen = new Set([cells[0].join(',')]);
  const st = [cells[0]];
  while (st.length) {
    const [x, y] = st.pop()!;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const k = `${nx},${ny}`;
      if (!seen.has(k) && isFloor(p, nx, ny)) {
        seen.add(k);
        st.push([nx, ny]);
      }
    }
  }
  return seen.size === cells.length;
}

/** Can a block of these cells/colour leave through some gate geometrically? */
export function hasFittingGate(p: Puzzle, cells: Cells, color: number, axis?: Axis): boolean {
  const bw = Math.max(...cells.map((c) => c[0])) + 1;
  const bh = Math.max(...cells.map((c) => c[1])) + 1;
  return p.gates.some((g) => {
    if (!g.colors.includes(color)) return false;
    const vertical = g.side === 'N' || g.side === 'S';
    if (vertical && axis === 'h') return false;
    if (!vertical && axis === 'v') return false;
    return g.len >= (vertical ? bw : bh);
  });
}

/**
 * Static feasibility: every colour layer of every block has a gate it could
 * ever leave through. One-way blocks never change their perpendicular
 * coordinate, so the gate must also lie on their line.
 */
export function staticOk(p: Puzzle): boolean {
  return p.blocks.every((b) => {
    const bw = Math.max(...b.cells.map((c) => c[0])) + 1;
    const bh = Math.max(...b.cells.map((c) => c[1])) + 1;
    return b.colors.every((col) =>
      p.gates.some((g) => {
        if (!g.colors.includes(col)) return false;
        const vertical = g.side === 'N' || g.side === 'S';
        if (vertical) {
          if (b.axis === 'h' || g.len < bw) return false;
          if (b.axis === 'v') return b.x >= g.start && b.x + bw <= g.start + g.len;
          return true;
        }
        if (b.axis === 'v' || g.len < bh) return false;
        if (b.axis === 'h') return b.y >= g.start && b.y + bh <= g.start + g.len;
        return true;
      }),
    );
  });
}

export function placeBlock(rng: Rng, p: Puzzle, cells: Cells, color: number[]): BlockDef | null {
  const occ = occupancy(p);
  const spots: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (fitsAt(p, cells, x, y, occ)) spots.push([x, y]);
  if (!spots.length) return null;
  const [x, y] = pick(rng, spots);
  return { cells, x, y, colors: color };
}

/** Build a random candidate for a spec. */
export function construct(rng: Rng, spec: Spec, sparse = false): Puzzle {
  for (let attempt = 0; ; attempt++) {
    const p: Puzzle = {
      w: spec.w,
      h: spec.h,
      grid: Array.from({ length: spec.h }, () => '.'.repeat(spec.w)),
      blocks: [],
      gates: [],
    };
    if (spec.voids) carveVoids(rng, p, randInt(rng, ...spec.voids));
    if (spec.walls) addWalls(rng, p, randInt(rng, ...spec.walls));
    const colors = shuffle(rng, [0, 1, 2, 3, 4, 5]).slice(0, spec.colors);
    const maxLen = spec.maxGateLen ?? 3;
    let ok = true;
    for (const c of colors) {
      const g = randomGate(rng, p, [c], p.gates, maxLen);
      if (!g) ok = false;
      else p.gates.push(g);
    }
    const extra = spec.extraGates ? randInt(rng, ...spec.extraGates) : 0;
    for (let i = 0; i < extra; i++) {
      const g = randomGate(rng, p, [pick(rng, colors)], p.gates, maxLen);
      if (g) p.gates.push(g);
    }
    if (spec.shifting) {
      const n = randInt(rng, ...spec.shifting);
      shuffle(rng, p.gates.slice())
        .slice(0, n)
        .forEach((g) => {
          const cyc = randInt(rng, 2, Math.min(3, colors.length));
          const others = shuffle(rng, colors.filter((c) => c !== g.colors[0])).slice(0, cyc - 1);
          g.colors = [g.colors[0], ...others];
        });
    }
    if (!ok) continue;
    const nBlocks = sparse ? Math.max(4, spec.blocks[0] - randInt(rng, 2, 3)) : randInt(rng, ...spec.blocks);
    for (let i = 0; i < nBlocks * 4 && p.blocks.length < nBlocks; i++) {
      const cells = randomShape(rng, spec);
      const color = pick(rng, colors);
      if (!hasFittingGate(p, cells, color)) continue;
      const b = placeBlock(rng, p, cells, [color]);
      if (b) p.blocks.push(b);
    }
    if (p.blocks.length < (sparse ? 4 : spec.blocks[0])) continue;
    decorate(rng, p, spec, colors);
    normalisePlatesLocks(p);
    if (!staticOk(p)) continue;
    try {
      compile(p);
    } catch {
      continue;
    }
    return p;
  }
}

/** Add one-way / ice / layers per spec. */
export function decorate(rng: Rng, p: Puzzle, spec: Spec, colors: number[]) {
  const idx = shuffle(
    rng,
    p.blocks.map((_, i) => i),
  );
  let k = 0;
  const take = (r?: [number, number]) => {
    const n = r ? randInt(rng, ...r) : 0;
    const out = idx.slice(k, k + n);
    k += n;
    return out;
  };
  for (const i of take(spec.oneway)) {
    const b = p.blocks[i];
    const first: Axis = rng() < 0.5 ? 'h' : 'v';
    for (const axis of [first, first === 'h' ? 'v' : 'h'] as Axis[]) {
      b.axis = axis;
      if (staticOk(p)) break;
      delete b.axis;
    }
  }
  for (const i of take(spec.ice)) p.blocks[i].ice = randInt(rng, 1, Math.max(1, Math.min(4, p.blocks.length - 2)));
  for (const i of take(spec.layered)) {
    const b = p.blocks[i];
    const shells = colors.filter((c) => c !== b.colors[0] && hasFittingGate(p, b.cells, c, b.axis));
    if (shells.length) {
      b.colors = [pick(rng, shells), b.colors[0]];
      if (!staticOk(p)) b.colors = [b.colors[1]];
    }
  }
  if (spec.locks) {
    const n = randInt(rng, ...spec.locks);
    for (const g of shuffle(rng, p.gates.slice()).slice(0, n)) addLock(rng, p, g);
  }
  if (spec.plates) {
    const n = randInt(rng, ...spec.plates);
    for (let k = 0; k < n; k++) addPlate(rng, p);
  }
}

/** Final colours of the blocks (what can open a padlock). */
export const finalColors = (p: Puzzle) => [...new Set(p.blocks.map((b) => b.colors[b.colors.length - 1]))];

/** Put a padlock on gate g, keyed to some block's final colour (preferably not the gate's own). */
export function addLock(rng: Rng, p: Puzzle, g: GateDef): boolean {
  const keys = finalColors(p);
  const other = keys.filter((c) => !g.colors.includes(c));
  const pool = other.length ? other : keys;
  if (!pool.length) return false;
  g.lock = pick(rng, pool);
  return true;
}

/** Add a pressure plate on a random floor cell and bar a random gate with it. */
export function addPlate(rng: Rng, p: Puzzle): boolean {
  const free = p.gates.filter((g) => g.plate === undefined);
  if (!free.length) return false;
  const cells: [number, number][] = [];
  const taken = new Set((p.plates ?? []).map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) if (p.grid[y][x] === '.' && !taken.has(`${x},${y}`)) cells.push([x, y]);
  if (!cells.length) return false;
  p.plates = [...(p.plates ?? []), pick(rng, cells)];
  pick(rng, free).plate = p.plates.length - 1;
  return true;
}

/**
 * Keep locks and plates consistent: drop padlocks no block can open, drop
 * plates no gate uses (re-indexing the rest), drop plates on non-floor cells.
 */
export function normalisePlatesLocks(p: Puzzle): Puzzle {
  const keys = new Set(finalColors(p));
  for (const g of p.gates) if (g.lock !== undefined && !keys.has(g.lock)) delete g.lock;
  if (p.plates) {
    const keep: number[] = [];
    p.plates.forEach(([x, y], k) => {
      const used = p.gates.some((g) => g.plate === k);
      if (used && p.grid[y]?.[x] === '.') keep.push(k);
    });
    const remap = new Map(keep.map((k, i) => [k, i]));
    for (const g of p.gates) {
      if (g.plate === undefined) continue;
      const nk = remap.get(g.plate);
      if (nk === undefined) delete g.plate;
      else g.plate = nk;
    }
    p.plates = keep.map((k) => p.plates![k]);
    if (!p.plates.length) delete p.plates;
  }
  return p;
}

export { FAMILIES };
