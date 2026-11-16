/**
 * The rules of Blockers Gonna Block, as a pure TypeScript engine.
 *
 * A puzzle is compiled once into lookup tables (which anchors each block can
 * occupy, which exits are geometrically possible from each anchor), after
 * which game states are cheap typed arrays. The same engine is used by the
 * game scenes, the solver, the level generator and the tests, so there is a
 * single source of truth for the rules.
 *
 * Rules:
 *  - One drag = one move. A dragged block follows the finger cell by cell, in
 *    any direction (turning corners included), through free floor cells. It
 *    can therefore end on any anchor reachable through free space.
 *  - One-way blocks only move along their axis.
 *  - A frozen block (ice n) cannot move until n blocks have left the board.
 *  - A block leaves when it is pushed against a gate whose current colour is
 *    the block's current (outer) colour and whose span covers the block's
 *    whole width along that edge. The cells it sweeps through on the way out
 *    must be free.
 *  - A layered block leaving through its shell colour loses the shell and
 *    stays where it is (touching the gate), now showing its core colour.
 *  - Shifting gates advance one colour every time a block leaves the board.
 *  - Clear every block to win.
 */
import type { Axis, BlockDef, GateDef, Move, Puzzle, Side } from './types';

export const SIDES: Side[] = ['N', 'E', 'S', 'W'];

export interface ExitOption {
  gate: number;
  /** Cells (indices) swept on the way out, excluding the block's own cells. */
  sweep: Int16Array;
}

export interface CBlock {
  def: BlockDef;
  dx: Int8Array;
  dy: Int8Array;
  bw: number;
  bh: number;
  colors: number[];
  /** 0 = free, 1 = horizontal only, 2 = vertical only. */
  axis: 0 | 1 | 2;
  ice: number;
  /** Per anchor: cell indices if the block fits statically, else null. */
  cellsAt: (Int16Array | null)[];
  /** Per anchor: geometrically possible exits (colour checked later). */
  exitsAt: (ExitOption[] | null)[];
  start: number;
}

export interface Compiled {
  puzzle: Puzzle;
  w: number;
  h: number;
  size: number;
  /** 1 = wall or void. */
  blocked: Uint8Array;
  blocks: CBlock[];
  gates: GateDef[];
  shifting: boolean;
  layered: boolean;
  /** Symmetry group per block: identical blocks share a group id. */
  group: Int16Array;
  hasSymmetry: boolean;
  // scratch buffers
  occ: Int16Array;
  seen: Int32Array;
  stamp: number;
  queue: Int16Array;
}

export interface State {
  /** Anchor index per block, -1 once the block has left. */
  pos: Int16Array;
  /** Number of layers peeled per block. */
  layer: Uint8Array;
  /** Blocks that have left the board. */
  exits: number;
}

/** Internal move: anchor index, gate (-1 = plain reposition). */
export interface IMove {
  b: number;
  a: number;
  g: number;
}

const axisCode = (a?: Axis): 0 | 1 | 2 => (a === 'h' ? 1 : a === 'v' ? 2 : 0);

export function compile(p: Puzzle): Compiled {
  const { w, h } = p;
  const size = w * h;
  if (p.grid.length !== h) throw new Error('grid height mismatch');
  const blocked = new Uint8Array(size);
  for (let y = 0; y < h; y++) {
    if (p.grid[y].length !== w) throw new Error(`grid row ${y} width mismatch`);
    for (let x = 0; x < w; x++) blocked[y * w + x] = p.grid[y][x] === '.' ? 0 : 1;
  }
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !blocked[y * w + x];
  const inRect = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const blocks: CBlock[] = p.blocks.map((def) => {
    const n = def.cells.length;
    const dx = new Int8Array(n);
    const dy = new Int8Array(n);
    let bw = 0;
    let bh = 0;
    let minX = 99;
    let minY = 99;
    def.cells.forEach(([cx, cy], i) => {
      dx[i] = cx;
      dy[i] = cy;
      bw = Math.max(bw, cx + 1);
      bh = Math.max(bh, cy + 1);
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
    });
    if (minX !== 0 || minY !== 0) throw new Error('block cells must be normalised');
    const cellsAt: (Int16Array | null)[] = new Array(size).fill(null);
    const exitsAt: (ExitOption[] | null)[] = new Array(size).fill(null);
    const ax = axisCode(def.axis);
    for (let y = 0; y + bh <= h; y++) {
      for (let x = 0; x + bw <= w; x++) {
        let ok = true;
        const cells = new Int16Array(n);
        for (let i = 0; i < n; i++) {
          const cx = x + dx[i];
          const cy = y + dy[i];
          if (!floor(cx, cy)) {
            ok = false;
            break;
          }
          cells[i] = cy * w + cx;
        }
        if (!ok) continue;
        const a = y * w + x;
        cellsAt[a] = cells;
        const own = new Set(cells);
        const exits: ExitOption[] = [];
        p.gates.forEach((g, gi) => {
          let sx = 0;
          let sy = 0;
          let touching = false;
          let fits = false;
          if (g.side === 'N' || g.side === 'S') {
            if (ax === 1) return;
            sy = g.side === 'N' ? -1 : 1;
            touching = g.side === 'N' ? y === 0 : y + bh === h;
            fits = x >= g.start && x + bw <= g.start + g.len;
          } else {
            if (ax === 2) return;
            sx = g.side === 'W' ? -1 : 1;
            touching = g.side === 'W' ? x === 0 : x + bw === w;
            fits = y >= g.start && y + bh <= g.start + g.len;
          }
          if (!touching || !fits) return;
          const steps = sx !== 0 ? bw : bh;
          const sweep = new Set<number>();
          for (let k = 1; k <= steps; k++) {
            for (let i = 0; i < n; i++) {
              const cx = x + dx[i] + sx * k;
              const cy = y + dy[i] + sy * k;
              if (!inRect(cx, cy)) continue;
              if (!floor(cx, cy)) return; // a wall/void cell is in the way
              const ci = cy * w + cx;
              if (!own.has(ci)) sweep.add(ci);
            }
          }
          exits.push({ gate: gi, sweep: Int16Array.from(sweep) });
        });
        if (exits.length) exitsAt[a] = exits;
      }
    }
    const start = def.y * w + def.x;
    if (!cellsAt[start]) throw new Error('block does not fit at its start position');
    return {
      def,
      dx,
      dy,
      bw,
      bh,
      colors: def.colors.slice(),
      axis: ax,
      ice: def.ice ?? 0,
      cellsAt,
      exitsAt,
      start,
    };
  });

  // Identical blocks are interchangeable: the solver canonicalises them.
  const sig = blocks.map((b) =>
    JSON.stringify([b.def.cells, b.colors, b.axis, b.ice]),
  );
  const group = new Int16Array(blocks.length);
  const seenSig = new Map<string, number>();
  let hasSymmetry = false;
  sig.forEach((s, i) => {
    if (seenSig.has(s)) hasSymmetry = true;
    else seenSig.set(s, seenSig.size);
    group[i] = seenSig.get(s)!;
  });

  return {
    puzzle: p,
    w,
    h,
    size,
    blocked,
    blocks,
    gates: p.gates,
    shifting: p.gates.some((g) => g.colors.length > 1),
    layered: blocks.some((b) => b.colors.length > 1),
    group,
    hasSymmetry,
    occ: new Int16Array(size),
    seen: new Int32Array(size),
    stamp: 0,
    queue: new Int16Array(size),
  };
}

export function initialState(c: Compiled): State {
  const s: State = {
    pos: new Int16Array(c.blocks.length),
    layer: new Uint8Array(c.blocks.length),
    exits: 0,
  };
  c.blocks.forEach((b, i) => (s.pos[i] = b.start));
  return s;
}

export function cloneState(s: State): State {
  return { pos: s.pos.slice(), layer: s.layer.slice(), exits: s.exits };
}

export const isWon = (s: State) => s.pos.every((p) => p < 0);

export const blockColor = (c: Compiled, s: State, i: number) => c.blocks[i].colors[s.layer[i]];

export const gateColor = (c: Compiled, s: State, g: number) => {
  const cols = c.gates[g].colors;
  return cols[s.exits % cols.length];
};

/** Remaining ice on a block (0 = free to move). */
export const iceLeft = (c: Compiled, s: State, i: number) => Math.max(0, c.blocks[i].ice - s.exits);

export const canMove = (c: Compiled, s: State, i: number) => s.pos[i] >= 0 && c.blocks[i].ice <= s.exits;

/** Fill c.occ with block ids (+1) for the given state. */
export function fillOccupancy(c: Compiled, s: State): Int16Array {
  const occ = c.occ;
  occ.fill(0);
  for (let i = 0; i < c.blocks.length; i++) {
    const a = s.pos[i];
    if (a < 0) continue;
    const cells = c.blocks[i].cellsAt[a]!;
    for (let k = 0; k < cells.length; k++) occ[cells[k]] = i + 1;
  }
  return occ;
}

/**
 * Anchors block i can reach in one drag (including its current anchor, which
 * is first). Assumes c.occ is filled for the current state.
 */
export function reachable(c: Compiled, s: State, i: number): Int16Array {
  const b = c.blocks[i];
  const start = s.pos[i];
  const { w, occ, seen, queue } = c;
  const stamp = ++c.stamp;
  const me = i + 1;
  const fits = (a: number) => {
    const cells = b.cellsAt[a];
    if (!cells) return false;
    for (let k = 0; k < cells.length; k++) {
      const o = occ[cells[k]];
      if (o !== 0 && o !== me) return false;
    }
    return true;
  };
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = stamp;
  const maxX = c.w - b.bw;
  const maxY = c.h - b.bh;
  while (head < tail) {
    const a = queue[head++];
    const x = a % w;
    const y = (a - x) / w;
    if (b.axis !== 2) {
      if (x > 0 && seen[a - 1] !== stamp && fits(a - 1)) {
        seen[a - 1] = stamp;
        queue[tail++] = a - 1;
      }
      if (x < maxX && seen[a + 1] !== stamp && fits(a + 1)) {
        seen[a + 1] = stamp;
        queue[tail++] = a + 1;
      }
    }
    if (b.axis !== 1) {
      if (y > 0 && seen[a - w] !== stamp && fits(a - w)) {
        seen[a - w] = stamp;
        queue[tail++] = a - w;
      }
      if (y < maxY && seen[a + w] !== stamp && fits(a + w)) {
        seen[a + w] = stamp;
        queue[tail++] = a + w;
      }
    }
  }
  return queue.slice(0, tail);
}

/** Exit gate usable by block i from anchor a right now, or -1. Needs c.occ. */
export function exitFrom(c: Compiled, s: State, i: number, a: number): number {
  const opts = c.blocks[i].exitsAt[a];
  if (!opts) return -1;
  const col = blockColor(c, s, i);
  const me = i + 1;
  for (const o of opts) {
    if (gateColor(c, s, o.gate) !== col) continue;
    let clear = true;
    for (let k = 0; k < o.sweep.length; k++) {
      const v = c.occ[o.sweep[k]];
      if (v !== 0 && v !== me) {
        clear = false;
        break;
      }
    }
    if (clear) return o.gate;
  }
  return -1;
}

/** Whether the move removes the block entirely (vs peeling a layer). */
export const isFinalLayer = (c: Compiled, s: State, i: number) => s.layer[i] === c.blocks[i].colors.length - 1;

/**
 * All legal moves. Full exits are reported once per block (where it leaves
 * from does not matter); peels once per distinct anchor.
 */
export function legalMoves(c: Compiled, s: State): IMove[] {
  fillOccupancy(c, s);
  const out: IMove[] = [];
  for (let i = 0; i < c.blocks.length; i++) {
    if (!canMove(c, s, i)) continue;
    const r = reachable(c, s, i);
    const final = isFinalLayer(c, s, i);
    let exited = false;
    for (let k = 0; k < r.length; k++) {
      const a = r[k];
      if (k > 0) out.push({ b: i, a, g: -1 });
      if (final && exited) continue;
      const g = exitFrom(c, s, i, a);
      if (g >= 0) {
        out.push({ b: i, a, g });
        exited = true;
      }
    }
  }
  return out;
}

/** Only the exit/peel moves (cheaper than legalMoves when that's all you need). */
export function exitMoves(c: Compiled, s: State, finalOnly = false): IMove[] {
  fillOccupancy(c, s);
  const out: IMove[] = [];
  for (let i = 0; i < c.blocks.length; i++) {
    if (!canMove(c, s, i)) continue;
    const final = isFinalLayer(c, s, i);
    if (finalOnly && !final) continue;
    const r = reachable(c, s, i);
    for (let k = 0; k < r.length; k++) {
      const g = exitFrom(c, s, i, r[k]);
      if (g >= 0) {
        out.push({ b: i, a: r[k], g });
        if (final) break;
      }
    }
  }
  return out;
}

/** Apply a move known to be legal. Returns a new state. */
export function applyMove(c: Compiled, s: State, m: IMove): State {
  const n = cloneState(s);
  if (m.g < 0) {
    n.pos[m.b] = m.a;
  } else if (isFinalLayer(c, s, m.b)) {
    n.pos[m.b] = -1;
    n.exits++;
  } else {
    n.pos[m.b] = m.a;
    n.layer[m.b]++;
  }
  return n;
}

/** Validate a move against the full rules. Returns an error string or null. */
export function checkMove(c: Compiled, s: State, m: IMove): string | null {
  if (m.b < 0 || m.b >= c.blocks.length) return 'no such block';
  if (s.pos[m.b] < 0) return 'block already gone';
  if (!canMove(c, s, m.b)) return 'block is frozen';
  fillOccupancy(c, s);
  const r = reachable(c, s, m.b);
  if (!r.includes(m.a)) return 'target not reachable';
  if (m.g < 0) return m.a === s.pos[m.b] ? 'no-op move' : null;
  const opts = c.blocks[m.b].exitsAt[m.a];
  if (!opts || !opts.some((o) => o.gate === m.g)) return 'cannot exit through that gate from there';
  const o = opts.find((o) => o.gate === m.g)!;
  if (gateColor(c, s, m.g) !== blockColor(c, s, m.b)) return 'gate colour does not match';
  for (const ci of o.sweep) if (c.occ[ci] !== 0 && c.occ[ci] !== m.b + 1) return 'exit path blocked';
  return null;
}

export const toMove = (c: Compiled, m: IMove): Move => {
  const mv: Move = { b: m.b, x: m.a % c.w, y: Math.floor(m.a / c.w) };
  if (m.g >= 0) mv.g = m.g;
  return mv;
};

export const fromMove = (c: Compiled, m: Move): IMove => ({ b: m.b, a: m.y * c.w + m.x, g: m.g ?? -1 });

/** Replay a solution through the rules; throws on the first illegal move. */
export function replay(c: Compiled, moves: Move[], from?: State): State {
  let s = from ? cloneState(from) : initialState(c);
  moves.forEach((mv, k) => {
    const m = fromMove(c, mv);
    const err = checkMove(c, s, m);
    if (err) throw new Error(`move ${k + 1} (${JSON.stringify(mv)}): ${err}`);
    s = applyMove(c, s, m);
  });
  return s;
}

/** Canonical key for a state (identical blocks are interchangeable). */
export function stateKey(c: Compiled, s: State): string {
  const n = s.pos.length;
  const codes = new Array<number>(n);
  for (let i = 0; i < n; i++) codes[i] = s.pos[i] < 0 ? 0 : s.pos[i] * 4 + s.layer[i] + 1;
  if (c.hasSymmetry) {
    // sort codes within each symmetry group, keep group order stable
    const byGroup = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const g = c.group[i];
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(codes[i]);
    }
    let k = 0;
    for (const [, list] of [...byGroup.entries()].sort((a, b) => a[0] - b[0])) {
      list.sort((a, b) => a - b);
      for (const v of list) codes[k++] = v;
    }
  }
  return String.fromCharCode(...codes);
}

/** Lower bound on remaining moves: every layer of every block needs a move. */
export function layersLeft(c: Compiled, s: State): number {
  let n = 0;
  for (let i = 0; i < c.blocks.length; i++) if (s.pos[i] >= 0) n += c.blocks[i].colors.length - s.layer[i];
  return n;
}

/**
 * Shortest drag path (anchor sequence) from the block's current anchor to `to`.
 * Used by the UI hint animation and by the e2e player.
 */
export function dragPath(c: Compiled, s: State, i: number, to: number): number[] | null {
  fillOccupancy(c, s);
  const b = c.blocks[i];
  const me = i + 1;
  const fits = (a: number) => {
    const cells = b.cellsAt[a];
    if (!cells) return false;
    for (const ci of cells) if (c.occ[ci] !== 0 && c.occ[ci] !== me) return false;
    return true;
  };
  const prev = new Map<number, number>();
  const start = s.pos[i];
  prev.set(start, -1);
  const q = [start];
  while (q.length) {
    const a = q.shift()!;
    if (a === to) break;
    const x = a % c.w;
    const y = Math.floor(a / c.w);
    const nb: number[] = [];
    if (b.axis !== 2) {
      if (x > 0) nb.push(a - 1);
      if (x < c.w - b.bw) nb.push(a + 1);
    }
    if (b.axis !== 1) {
      if (y > 0) nb.push(a - c.w);
      if (y < c.h - b.bh) nb.push(a + c.w);
    }
    for (const n of nb) {
      if (prev.has(n) || !fits(n)) continue;
      prev.set(n, a);
      q.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const path: number[] = [];
  for (let a = to; a !== -1; a = prev.get(a)!) path.push(a);
  return path.reverse();
}

/**
 * Relaxed clearability: can every block leave using exits only, if gates
 * accepted any colour of their cycle at any time and a block counted as gone
 * as soon as it could leave/peel? This over-approximates what exit-only play
 * can achieve, so `false` proves at least one reposition is still needed.
 * Leaves c.occ in an undefined state.
 */
export function relaxedClear(c: Compiled, s: State): boolean {
  const B = c.blocks.length;
  const t: State = { pos: s.pos.slice(), layer: s.layer, exits: s.exits };
  fillOccupancy(c, t);
  let alive = 0;
  for (let i = 0; i < B; i++) if (t.pos[i] >= 0) alive++;
  let changed = true;
  while (alive > 0 && changed) {
    changed = false;
    for (let i = 0; i < B; i++) {
      if (t.pos[i] < 0 || c.blocks[i].ice > t.exits) continue;
      const col = c.blocks[i].colors[t.layer[i]];
      const r = reachable(c, t, i);
      let ok = false;
      for (let k = 0; k < r.length && !ok; k++) {
        const opts = c.blocks[i].exitsAt[r[k]];
        if (!opts) continue;
        for (const o of opts) {
          if (!c.gates[o.gate].colors.includes(col)) continue;
          let clear = true;
          for (let q = 0; q < o.sweep.length; q++) {
            const v = c.occ[o.sweep[q]];
            if (v !== 0 && v !== i + 1) {
              clear = false;
              break;
            }
          }
          if (clear) {
            ok = true;
            break;
          }
        }
      }
      if (ok) {
        const cells = c.blocks[i].cellsAt[t.pos[i]]!;
        for (let k = 0; k < cells.length; k++) c.occ[cells[k]] = 0;
        t.pos[i] = -1;
        t.exits++;
        alive--;
        changed = true;
      }
    }
  }
  return alive === 0;
}
