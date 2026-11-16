/** Local edits used by the hill climber. Each returns a new puzzle or null. */
import type { Rng } from '../../src/core/rng';
import type { Axis, Puzzle } from '../../src/core/types';
import {
  type Spec,
  clone,
  connected,
  fitsAt,
  gateOk,
  hasFittingGate,
  occupancy,
  pick,
  randInt,
  randomGate,
  randomShape,
  shuffle,
  staticOk,
} from './construct';

const usedColors = (p: Puzzle) => [...new Set(p.gates.flatMap((g) => g.colors))];

function spotsFor(p: Puzzle, cells: [number, number][], skip: number) {
  const occ = occupancy(p, skip);
  const out: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (fitsAt(p, cells, x, y, occ)) out.push([x, y]);
  return out;
}

const count = (p: Puzzle, f: (b: Puzzle['blocks'][number]) => boolean) => p.blocks.filter(f).length;

function setCell(p: Puzzle, x: number, y: number, ch: string) {
  p.grid[y] = p.grid[y].slice(0, x) + ch + p.grid[y].slice(x + 1);
}

function blocksFitGrid(p: Puzzle) {
  const occ = new Set<string>();
  for (const b of p.blocks)
    for (const [dx, dy] of b.cells) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (x < 0 || y < 0 || x >= p.w || y >= p.h || p.grid[y][x] !== '.') return false;
      const k = `${x},${y}`;
      if (occ.has(k)) return false;
      occ.add(k);
    }
  return true;
}

function gatesOk(p: Puzzle) {
  return p.gates.every((g) => gateOk(p, g, p.gates));
}

type Op = (rng: Rng, p: Puzzle, spec: Spec) => Puzzle | null;

const ops: [Op, number][] = [
  // move a block
  [
    (rng, p0) => {
      const p = clone(p0);
      const i = randInt(rng, 0, p.blocks.length - 1);
      const s = spotsFor(p, p.blocks[i].cells, i);
      if (!s.length) return null;
      [p.blocks[i].x, p.blocks[i].y] = pick(rng, s);
      return p;
    },
    5,
  ],
  // nudge a block by one cell
  [
    (rng, p0) => {
      const p = clone(p0);
      const i = randInt(rng, 0, p.blocks.length - 1);
      const b = p.blocks[i];
      const [dx, dy] = pick(rng, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
      if (!fitsAt(p, b.cells, b.x + dx, b.y + dy, occupancy(p, i))) return null;
      b.x += dx;
      b.y += dy;
      return p;
    },
    3,
  ],
  // swap positions of two blocks with the same shape, or swap their colours
  [
    (rng, p0) => {
      const p = clone(p0);
      if (p.blocks.length < 2) return null;
      const [i, j] = shuffle(
        rng,
        p.blocks.map((_, k) => k),
      );
      const a = p.blocks[i];
      const b = p.blocks[j];
      [a.colors, b.colors] = [b.colors, a.colors];
      if (!hasFittingGate(p, a.cells, a.colors[0], a.axis) || !hasFittingGate(p, b.cells, b.colors[0], b.axis))
        return null;
      return p;
    },
    3,
  ],
  // reshape a block
  [
    (rng, p0, spec) => {
      const p = clone(p0);
      const i = randInt(rng, 0, p.blocks.length - 1);
      const b = p.blocks[i];
      const cells = randomShape(rng, spec);
      if (!b.colors.every((c) => hasFittingGate(p, cells, c, b.axis))) return null;
      const s = spotsFor(p, cells, i);
      if (!s.length) return null;
      // prefer a spot overlapping the old one
      const near = s.filter(([x, y]) => Math.abs(x - b.x) + Math.abs(y - b.y) <= 1);
      [b.x, b.y] = pick(rng, near.length ? near : s);
      b.cells = cells;
      return p;
    },
    3,
  ],
  // recolour
  [
    (rng, p0) => {
      const p = clone(p0);
      const i = randInt(rng, 0, p.blocks.length - 1);
      const b = p.blocks[i];
      const k = randInt(rng, 0, b.colors.length - 1);
      const opts = usedColors(p).filter(
        (c) => !b.colors.includes(c) && hasFittingGate(p, b.cells, c, b.axis),
      );
      if (!opts.length) return null;
      b.colors[k] = pick(rng, opts);
      return p;
    },
    2,
  ],
  // add / remove a block
  [
    (rng, p0, spec) => {
      const p = clone(p0);
      if (p.blocks.length > spec.blocks[0] && rng() < 0.5) {
        const plain = p.blocks.map((b, i) => [b, i] as const).filter(([b]) => !b.axis && !b.ice && b.colors.length === 1);
        if (!plain.length) return null;
        p.blocks.splice(pick(rng, plain)[1], 1);
        // ice counts may now exceed the blocks that can leave
        for (const b of p.blocks) if (b.ice && b.ice > p.blocks.length - 1) b.ice = p.blocks.length - 1;
        return p;
      }
      if (p.blocks.length >= spec.blocks[1]) return null;
      const cells = randomShape(rng, spec);
      const cols = usedColors(p).filter((c) => hasFittingGate(p, cells, c));
      if (!cols.length) return null;
      const s = spotsFor(p, cells, -1);
      if (!s.length) return null;
      const [x, y] = pick(rng, s);
      p.blocks.push({ cells, x, y, colors: [pick(rng, cols)] });
      return p;
    },
    2,
  ],
  // move / resize a gate
  [
    (rng, p0, spec) => {
      const p = clone(p0);
      const gi = randInt(rng, 0, p.gates.length - 1);
      const g = p.gates[gi];
      const r = rng();
      if (r < 0.4) {
        const others = p.gates.filter((_, k) => k !== gi);
        const ng = randomGate(rng, p, g.colors, others, spec.maxGateLen ?? 3);
        if (!ng) return null;
        p.gates[gi] = ng;
      } else if (r < 0.7) {
        g.start += rng() < 0.5 ? -1 : 1;
      } else {
        g.len += rng() < 0.5 ? -1 : 1;
        if (g.len > (spec.maxGateLen ?? 3)) return null;
        if (rng() < 0.5) g.start -= 0;
      }
      if (!gatesOk(p)) return null;
      // every block layer must still have a gate it fits through
      if (!p.blocks.every((b) => b.colors.every((c) => hasFittingGate(p, b.cells, c, b.axis)))) return null;
      return p;
    },
    3,
  ],
  // walls / voids
  [
    (rng, p0, spec) => {
      const p = clone(p0);
      const kinds: ['#' | ' ', [number, number] | undefined][] = [
        ['#', spec.walls],
        [' ', spec.voids],
      ];
      const av = kinds.filter(([, r]) => r && r[1] > 0);
      if (!av.length) return null;
      const [ch, range] = pick(rng, av);
      const cells: [number, number][] = [];
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.grid[y][x] === ch) cells.push([x, y]);
      const n = cells.length;
      const r = rng();
      if (r < 0.35 && n > range![0]) {
        const [x, y] = pick(rng, cells);
        setCell(p, x, y, '.');
      } else if (r < 0.7 && n < range![1]) {
        const x = randInt(rng, 0, p.w - 1);
        const y = randInt(rng, 0, p.h - 1);
        if (p.grid[y][x] !== '.') return null;
        if (ch === ' ') {
          // voids must touch the outside or another void
          const nb = [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ];
          if (!nb.some(([a, b]) => a < 0 || b < 0 || a >= p.w || b >= p.h || p.grid[b][a] === ' ')) return null;
        }
        setCell(p, x, y, ch);
      } else if (n) {
        const [x, y] = pick(rng, cells);
        setCell(p, x, y, '.');
        const [dx, dy] = pick(rng, [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]);
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h || p.grid[ny][nx] !== '.') return null;
        setCell(p, nx, ny, ch);
      } else return null;
      if (!connected(p) || !blocksFitGrid(p) || !gatesOk(p)) return null;
      return p;
    },
    2,
  ],
  // obstacle attributes
  [
    (rng, p0, spec) => {
      const p = clone(p0);
      const choices: string[] = [];
      if (spec.oneway && spec.oneway[1] > 0) choices.push('axis');
      if (spec.ice && spec.ice[1] > 0) choices.push('ice');
      if (spec.layered && spec.layered[1] > 0) choices.push('layer');
      if (spec.shifting && spec.shifting[1] > 0) choices.push('shift');
      if (!choices.length) return null;
      const what = pick(rng, choices);
      const i = randInt(rng, 0, p.blocks.length - 1);
      const b = p.blocks[i];
      if (what === 'axis') {
        const n = count(p, (x) => !!x.axis);
        if (b.axis) {
          const r = rng();
          if (r < 0.5) b.axis = b.axis === 'h' ? 'v' : 'h';
          else if (n > spec.oneway![0]) delete b.axis;
          else return null;
        } else {
          if (n >= spec.oneway![1]) return null;
          // pick an axis with a usable gate on the block's line; else slide the block onto one
          const axes: Axis[] = rng() < 0.5 ? ['h', 'v'] : ['v', 'h'];
          let ok = false;
          for (const ax of axes) {
            b.axis = ax;
            if (staticOk(p)) {
              ok = true;
              break;
            }
          }
          if (!ok) {
            const spots = shuffle(rng, spotsFor(p, b.cells, i));
            for (const [x, y] of spots) {
              [b.x, b.y] = [x, y];
              if (staticOk(p)) {
                ok = true;
                break;
              }
            }
          }
          if (!ok) return null;
        }
        if (!b.colors.every((c) => hasFittingGate(p, b.cells, c, b.axis))) return null;
      } else if (what === 'ice') {
        const n = count(p, (x) => !!x.ice);
        if (b.ice) {
          const r = rng();
          if (r < 0.6) b.ice += rng() < 0.5 ? -1 : 1;
          else if (n > spec.ice![0]) delete b.ice;
          else return null;
          if (b.ice !== undefined && (b.ice < 1 || b.ice > p.blocks.length - 1)) return null;
        } else {
          if (n >= spec.ice![1]) return null;
          b.ice = randInt(rng, 1, Math.min(4, p.blocks.length - 1));
        }
      } else if (what === 'layer') {
        const n = count(p, (x) => x.colors.length > 1);
        if (b.colors.length > 1) {
          const r = rng();
          if (r < 0.5) {
            const opts = usedColors(p).filter((c) => c !== b.colors[1] && hasFittingGate(p, b.cells, c, b.axis));
            if (!opts.length) return null;
            b.colors[0] = pick(rng, opts);
          } else if (n > spec.layered![0]) b.colors = [b.colors[1]];
          else return null;
        } else {
          if (n >= spec.layered![1]) return null;
          const opts = usedColors(p).filter((c) => c !== b.colors[0] && hasFittingGate(p, b.cells, c, b.axis));
          if (!opts.length) return null;
          b.colors = [pick(rng, opts), b.colors[0]];
        }
      } else {
        const gi = randInt(rng, 0, p.gates.length - 1);
        const g = p.gates[gi];
        const n = p.gates.filter((x) => x.colors.length > 1).length;
        const cols = usedColors(p);
        if (g.colors.length > 1) {
          const r = rng();
          if (r < 0.5) {
            // change one colour in the cycle
            const k = randInt(rng, 0, g.colors.length - 1);
            const opts = cols.filter((c) => !g.colors.includes(c));
            if (!opts.length) return null;
            g.colors[k] = pick(rng, opts);
          } else if (r < 0.75) {
            // rotate cycle (changes the starting colour)
            g.colors.push(g.colors.shift()!);
          } else if (n > spec.shifting![0]) g.colors = [g.colors[0]];
          else return null;
        } else {
          if (n >= spec.shifting![1]) return null;
          const opts = cols.filter((c) => c !== g.colors[0]);
          if (!opts.length) return null;
          g.colors = [g.colors[0], pick(rng, opts)];
        }
        if (!p.blocks.every((b) => b.colors.every((c) => hasFittingGate(p, b.cells, c, b.axis)))) return null;
      }
      return p;
    },
    4,
  ],
];

export function mutate(rng: Rng, p: Puzzle, spec: Spec): Puzzle {
  const tot = ops.reduce((a, [, w]) => a + w, 0);
  for (let t = 0; t < 50; t++) {
    let r = rng() * tot;
    let op = ops[0][0];
    for (const [o, w] of ops) {
      r -= w;
      if (r < 0) {
        op = o;
        break;
      }
    }
    const q = op(rng, p, spec);
    if (q && staticOk(q)) return q;
  }
  return p;
}

/** Remove gates no block can ever use (static gates whose colour no block has). */
export function pruneGates(p: Puzzle): Puzzle {
  const q = clone(p);
  const cols = new Set(q.blocks.flatMap((b) => b.colors));
  q.gates = q.gates.filter((g) => g.colors.length > 1 || cols.has(g.colors[0]));
  return q;
}
