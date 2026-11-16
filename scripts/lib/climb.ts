/** Simulated-annealing hill climb toward harder levels for one spec. */
import { mulberry32 } from '../../src/core/rng';
import type { Puzzle } from '../../src/core/types';
import { type Spec, construct } from './construct';
import type { Slot } from './slots';
import { type Eval, evaluate } from './evaluate';
import { mutate, pruneGates } from './mutate';

export function obstacleCounts(p: Puzzle) {
  let walls = 0;
  let voids = 0;
  for (const row of p.grid)
    for (const ch of row) {
      if (ch === '#') walls++;
      if (ch === ' ') voids++;
    }
  return {
    walls,
    voids,
    oneway: p.blocks.filter((b) => b.axis).length,
    ice: p.blocks.filter((b) => b.ice).length,
    layered: p.blocks.filter((b) => b.colors.length > 1).length,
    shifting: p.gates.filter((g) => g.colors.length > 1).length,
  };
}

/** How far the puzzle is from the spec's minimum obstacle counts. */
export function specShortfall(p: Puzzle, spec: Spec): number {
  const c = obstacleCounts(p);
  let s = 0;
  const need = (have: number, r?: [number, number]) => (r ? Math.max(0, r[0] - have) : 0);
  s += need(p.blocks.length, spec.blocks) * 1.5;
  s += need(c.walls, spec.walls);
  s += need(c.voids, spec.voids);
  if (spec.walls || spec.voids) s += need(c.walls + c.voids, [1, 99]);
  // use the colours the spec asks for
  const cols = new Set(p.blocks.flatMap((b) => b.colors)).size;
  s += Math.max(0, spec.colors - cols) * 2;
  s += need(c.oneway, spec.oneway);
  s += need(c.ice, spec.ice);
  s += need(c.layered, spec.layered);
  s += need(c.shifting, spec.shifting);
  return s;
}

/** Blocks beyond a fair share per colour (lots of one colour reads as mush). */
export function colourImbalance(p: Puzzle): number {
  const m = new Map<number, number>();
  for (const b of p.blocks) m.set(b.colors[0], (m.get(b.colors[0]) ?? 0) + 1);
  const fair = Math.ceil(p.blocks.length / Math.max(1, m.size)) + 1;
  let x = 0;
  for (const v of m.values()) x += Math.max(0, v - fair);
  return x;
}

export interface ClimbResult {
  puzzle: Puzzle;
  eval: Eval;
}

export function climb(slot: Slot, seed: number, iters: number, log = false): ClimbResult | null {
  const spec = slot.spec;
  const t = slot.targets;
  const rng = mulberry32(seed);
  const quick = { runs: 24, maxNodes: 40_000, audit: true };
  const over = (v: number, cap: number) => Math.max(0, v - cap);
  const fit = (p: Puzzle, e: Eval) =>
    e.score -
    // hard but not a slog: what exceeds the caps doesn't count, and costs
    over(e.repositions, t.maxRepos) * 2 -
    over(Math.min(e.longestSetup, 6), t.maxSetup) * 3 -
    over(e.repositions, t.maxRepos) * 4 -
    over(e.par, t.maxPar) * 3 -
    over(e.longestSetup, t.maxSetup) * 4 -
    specShortfall(p, spec) * 10 -
    colourImbalance(p) * 1.5 +
    (t.keyAt === 'late' ? 5 * e.keyAt : t.keyAt === 'early' ? 5 * (1 - e.keyAt) : 0);
  let cur: Puzzle | null = null;
  let ce: Eval | null = null;
  for (let t = 0; t < 200 && !ce; t++) {
    cur = construct(rng, spec, true);
    ce = evaluate(cur, rng, quick);
  }
  if (!cur || !ce) return null;
  let cf = fit(cur, ce);
  let best = cur;
  let be = ce;
  let bf = cf;
  for (let it = 0; it < iters; it++) {
    const temp = 3 * (1 - it / iters);
    const cand = mutate(rng, cur, spec);
    const e = evaluate(cand, rng, quick);
    if (!e) continue;
    const f = fit(cand, e);
    if (f >= cf - temp * rng()) {
      cur = cand;
      ce = e;
      cf = f;
      if (f > bf) {
        best = cand;
        be = e;
        bf = f;
        if (log)
          console.log(
            `  it ${it} fit ${f.toFixed(1)} par ${e.par} repo ${e.repositions} setup ${e.longestSetup} look ${e.lookRate.toFixed(2)} eager ${e.eagerRate.toFixed(2)} nodes ${e.nodes} deco ${e.decorative}`,
          );
      }
    }
  }
  // drop gates no block can ever use (they'd be pure decoration)
  return { puzzle: pruneGates(best), eval: be };
}
