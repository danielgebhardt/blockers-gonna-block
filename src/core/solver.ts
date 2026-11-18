/**
 * Exact shortest-solution solver.
 *
 * A* over game states (block anchors + peeled layers; exit count, ice and
 * gate colours are derived from which blocks are gone). Every move costs 1.
 *
 * Heuristic (admissible and consistent): every remaining layer needs its own
 * exit/peel move, plus one more when exits alone cannot clear the board even
 * in a relaxed game (gates accept any colour of their cycle, a block counts as
 * gone as soon as it can leave or peel). The +1 is computed lazily when a node
 * is popped, so generating children stays O(1) each.
 *
 * Sound pruning:
 *  1. When gates never change colour, taking a block off the board can only
 *     help (it frees cells and melts ice sooner), so if any block can leave
 *     right now, leaving is an optimal next move and the other successors are
 *     skipped. Padlocks only ever open, so they keep this safe. Disabled with
 *     shifting gates (exit order changes colours) and pressure plates (a block
 *     leaving a plate can close a door).
 *     Peels are never forced: the core stays behind and may get in the way.
 *  2. A block that was just repositioned is not moved again: whatever it could
 *     reach next it could have reached in the previous drag (nothing else
 *     moved), so the pair of moves is never shorter than one.
 *
 * States are hashed with 64-bit Zobrist keys into an open-addressing table.
 * Identical blocks share Zobrist tables and the per-block keys are summed, so
 * swapping two identical blocks gives the same key (symmetry reduction).
 */
import {
  type Compiled,
  type IMove,
  type State,
  canMove,
  exitFrom,
  fillOccupancy,
  initialState,
  isFinalLayer,
  reachable,
  relaxedClear,
  legalMoves,
  toMove,
} from './engine';
import { mulberry32 } from './rng';
import type { Move } from './types';

export interface SolveOptions {
  maxNodes?: number;
  /** Disable the forced-exit pruning (used by tests to cross-check). */
  noPrune?: boolean;
}

export interface SolveResult {
  /** true = proven solvable, false = proven unsolvable, null = gave up. */
  solvable: boolean | null;
  moves: Move[];
  imoves: IMove[];
  /** Nodes expanded. */
  nodes: number;
}

interface Zobrist {
  hi: Int32Array[];
  lo: Int32Array[];
}

const zcache = new WeakMap<Compiled, Zobrist>();

function zobrist(c: Compiled): Zobrist {
  let z = zcache.get(c);
  if (z) return z;
  const rng = mulberry32(0x5eed);
  const r32 = () => (rng() * 4294967296) | 0;
  const groups = Math.max(...Array.from(c.group)) + 1;
  const codes = c.size * 4 + 1;
  z = { hi: [], lo: [] };
  for (let g = 0; g < groups; g++) {
    const hi = new Int32Array(codes);
    const lo = new Int32Array(codes);
    for (let k = 1; k < codes; k++) {
      hi[k] = r32();
      lo[k] = r32();
    }
    // code 0 (gone) hashes to 0 so removed blocks vanish from the sum
    z.hi.push(hi);
    z.lo.push(lo);
  }
  zcache.set(c, z);
  return z;
}

/** Growable open-addressing hash table: 64-bit key -> node index. */
class Table {
  cap: number;
  hi: Int32Array;
  lo: Int32Array;
  val: Int32Array;
  n = 0;
  constructor(cap = 1 << 16) {
    this.cap = cap;
    this.hi = new Int32Array(cap);
    this.lo = new Int32Array(cap);
    this.val = new Int32Array(cap).fill(-1);
  }
  private slot(hi: number, lo: number): number {
    const mask = this.cap - 1;
    let i = (lo ^ Math.imul(hi, 0x9e3779b1)) & mask;
    while (this.val[i] !== -1 && (this.hi[i] !== hi || this.lo[i] !== lo)) i = (i + 1) & mask;
    return i;
  }
  get(hi: number, lo: number): number {
    return this.val[this.slot(hi, lo)];
  }
  set(hi: number, lo: number, v: number) {
    let i = this.slot(hi, lo);
    if (this.val[i] === -1) {
      if ((this.n + 1) * 2 > this.cap) {
        this.grow();
        i = this.slot(hi, lo);
      }
      this.n++;
    }
    this.hi[i] = hi;
    this.lo[i] = lo;
    this.val[i] = v;
  }
  private grow() {
    const { hi, lo, val, cap } = this;
    this.cap = cap * 2;
    this.hi = new Int32Array(this.cap);
    this.lo = new Int32Array(this.cap);
    this.val = new Int32Array(this.cap).fill(-1);
    for (let i = 0; i < cap; i++) {
      if (val[i] === -1) continue;
      const j = this.slot(hi[i], lo[i]);
      this.hi[j] = hi[i];
      this.lo[j] = lo[i];
      this.val[j] = val[i];
    }
  }
}

/** Growable node pool. */
class Pool {
  B: number;
  cap = 1 << 14;
  n = 0;
  codes: Int16Array;
  parent: Int32Array;
  move: Int32Array;
  g: Uint16Array;
  hi: Int32Array;
  lo: Int32Array;
  flags: Uint8Array;
  constructor(B: number) {
    this.B = B;
    this.codes = new Int16Array(this.cap * B);
    this.parent = new Int32Array(this.cap);
    this.move = new Int32Array(this.cap);
    this.g = new Uint16Array(this.cap);
    this.hi = new Int32Array(this.cap);
    this.lo = new Int32Array(this.cap);
    this.flags = new Uint8Array(this.cap);
  }
  alloc(): number {
    if (this.n === this.cap) {
      this.cap *= 2;
      const grow = <T extends Int16Array | Int32Array | Uint16Array | Uint8Array>(a: T, k = 1): T => {
        const b = new (a.constructor as { new (n: number): T })(this.cap * k);
        b.set(a);
        return b;
      };
      this.codes = grow(this.codes, this.B);
      this.parent = grow(this.parent);
      this.move = grow(this.move);
      this.g = grow(this.g);
      this.hi = grow(this.hi);
      this.lo = grow(this.lo);
      this.flags = grow(this.flags);
    }
    return this.n++;
  }
}

const F_REFINED = 1;
const F_PEEL = 2; // last move was a peel

const packMove = (m: IMove) => m.b | (m.a << 5) | ((m.g + 1) << 20);
const unpackMove = (v: number): IMove => ({ b: v & 31, a: (v >> 5) & 0x7fff, g: (v >> 20) - 1 });

function stateFromCodes(codes: Int16Array, off: number, B: number, s: State) {
  let exits = 0;
  for (let i = 0; i < B; i++) {
    const v = codes[off + i];
    if (v === 0) {
      s.pos[i] = -1;
      s.layer[i] = 0;
      exits++;
    } else {
      s.pos[i] = (v - 1) >> 2;
      s.layer[i] = (v - 1) & 3;
    }
  }
  s.exits = exits;
}

export function solve(c: Compiled, from?: State, opts: SolveOptions = {}): SolveResult {
  const maxNodes = opts.maxNodes ?? 2_000_000;
  const prune = !opts.noPrune && !c.nonMonotone;
  const B = c.blocks.length;
  if (B > 31) throw new Error('too many blocks');
  const z = zobrist(c);
  const s0 = from ?? initialState(c);
  const pool = new Pool(B);
  const table = new Table();
  const buckets: number[][] = [];
  const grp = c.group;

  const codeOf = (s: State, i: number) => (s.pos[i] < 0 ? 0 : s.pos[i] * 4 + s.layer[i] + 1);
  const layersTotal = (codes: Int16Array, off: number) => {
    let n = 0;
    for (let i = 0; i < B; i++) {
      const v = codes[off + i];
      if (v) n += c.blocks[i].colors.length - ((v - 1) & 3);
    }
    return n;
  };

  // root
  const r = pool.alloc();
  let hi0 = 0;
  let lo0 = 0;
  for (let i = 0; i < B; i++) {
    const v = codeOf(s0, i);
    pool.codes[r * B + i] = v;
    hi0 = (hi0 + z.hi[grp[i]][v]) | 0;
    lo0 = (lo0 + z.lo[grp[i]][v]) | 0;
  }
  pool.parent[r] = -1;
  pool.move[r] = -1;
  pool.g[r] = 0;
  pool.hi[r] = hi0;
  pool.lo[r] = lo0;
  table.set(hi0, lo0, r);
  const h0 = layersTotal(pool.codes, 0);
  if (h0 === 0) return { solvable: true, moves: [], imoves: [], nodes: 0 };
  (buckets[h0] ??= []).push(r);

  const s: State = { pos: new Int16Array(B), layer: new Uint8Array(B), exits: 0 };
  const reach: (Int16Array | null)[] = new Array(B).fill(null);
  const exitAt: Int16Array[] = new Array(B);
  let nodes = 0;
  let f = h0;

  const emit = (parent: number, m: IMove, peel: boolean, last: boolean): number => {
    // child key via incremental Zobrist update
    const off = parent * B;
    const b = m.b;
    const old = pool.codes[off + b];
    let nv: number;
    if (m.g < 0) nv = m.a * 4 + ((old - 1) & 3) + 1;
    else if (last) nv = 0;
    else nv = m.a * 4 + ((old - 1) & 3) + 2; // peel: same anchor index math, layer+1
    const gb = grp[b];
    const hi = (pool.hi[parent] - z.hi[gb][old] + z.hi[gb][nv]) | 0;
    const lo = (pool.lo[parent] - z.lo[gb][old] + z.lo[gb][nv]) | 0;
    const g = pool.g[parent] + 1;
    const ex = table.get(hi, lo);
    if (ex !== -1 && pool.g[ex] <= g) return -1;
    const n = pool.alloc();
    const codes = pool.codes;
    codes.copyWithin(n * B, off, off + B);
    codes[n * B + b] = nv;
    pool.parent[n] = parent;
    pool.move[n] = packMove(m);
    pool.g[n] = g;
    pool.hi[n] = hi;
    pool.lo[n] = lo;
    pool.flags[n] = peel ? F_PEEL : 0;
    table.set(hi, lo, n);
    const h = layersTotal(codes, n * B);
    if (h === 0) return n; // goal
    // pathmax: the refined heuristic is consistent, so a child is never below its parent's f
    (buckets[Math.max(g + h, f)] ??= []).push(n);
    return -1;
  };

  const finish = (goal: number): SolveResult => {
    const im: IMove[] = [];
    for (let p = goal; pool.parent[p] !== -1; p = pool.parent[p]) im.push(unpackMove(pool.move[p]));
    im.reverse();
    return { solvable: true, imoves: im, moves: im.map((m) => toMove(c, m)), nodes };
  };

  while (true) {
    while (f < buckets.length && !(buckets[f] && buckets[f].length)) f++;
    if (f >= buckets.length) return { solvable: false, moves: [], imoves: [], nodes };
    const n = buckets[f].pop()!;
    const key = table.get(pool.hi[n], pool.lo[n]);
    if (key !== n) continue; // superseded by a cheaper path
    stateFromCodes(pool.codes, n * B, B, s);
    fillOccupancy(c, s);

    // which block may not move (just repositioned)
    const lm = pool.move[n];
    const skip = lm >= 0 && (lm >> 20) - 1 < 0 ? lm & 31 : -1;

    // reachability + exits for every movable block
    let anyExit = false;
    let forced: IMove | null = null;
    for (let i = 0; i < B; i++) {
      reach[i] = null;
      if (i === skip || !canMove(c, s, i)) continue;
      const rr = reachable(c, s, i);
      reach[i] = rr;
      const ex = new Int16Array(rr.length);
      const final = isFinalLayer(c, s, i);
      for (let k = 0; k < rr.length; k++) {
        const g = exitFrom(c, s, i, rr[k]);
        ex[k] = g;
        if (g >= 0) {
          anyExit = true;
          if (final && prune && !forced) forced = { b: i, a: rr[k], g };
        }
      }
      exitAt[i] = ex;
    }
    if (!(pool.flags[n] & F_REFINED)) {
      pool.flags[n] |= F_REFINED;
      // lazy heuristic refinement: +1 if exits alone can't clear the board
      if (!anyExit || !relaxedClear(c, s)) {
        // refined f = g + layers + 1; pathmax may already have pushed it this far
        const fr = pool.g[n] + layersTotal(pool.codes, n * B) + 1;
        if (fr > f) {
          (buckets[fr] ??= []).push(n);
          continue;
        }
      }
      fillOccupancy(c, s);
    }
    if (++nodes > maxNodes || pool.n > maxNodes * 40) return { solvable: null, moves: [], imoves: [], nodes };

    if (forced) {
      const goal = emit(n, forced, false, true);
      if (goal >= 0) return finish(goal);
      continue;
    }
    for (let i = 0; i < B; i++) {
      const rr = reach[i];
      if (!rr) continue;
      const ex = exitAt[i];
      const final = isFinalLayer(c, s, i);
      let exited = false;
      for (let k = 0; k < rr.length; k++) {
        const g = ex[k];
        if (g >= 0 && !(final && exited)) {
          exited = true;
          const goal = emit(n, { b: i, a: rr[k], g }, !final, final);
          if (goal >= 0) return finish(goal);
        }
        if (k > 0) emit(n, { b: i, a: rr[k], g: -1 }, false, false);
      }
    }
  }
}

/** Number of distinct first moves from `s` that still finish in `par` total. */
export function optimalFirstMoves(c: Compiled, s: State, par: number, maxNodes = 300_000): number {
  // apply each legal move and solve the rest
  let n = 0;
  const seen = new Set<string>();
  for (const m of legalMoves(c, s)) {
    const t: State = { pos: s.pos.slice(), layer: s.layer.slice(), exits: s.exits };
    if (m.g < 0) t.pos[m.b] = m.a;
    else if (isFinalLayer(c, s, m.b)) {
      t.pos[m.b] = -1;
      t.exits++;
    } else {
      t.pos[m.b] = m.a;
      t.layer[m.b]++;
    }
    const key = Array.from(t.pos).join() + '|' + Array.from(t.layer).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = solve(c, t, { maxNodes });
    if (r.solvable && r.moves.length + 1 === par) n++;
  }
  return n;
}
