/**
 * Turn a climbed puzzle into a fully evaluated candidate. Decorative obstacles
 * (the audit showed the level plays the same without them) are stripped first,
 * then everything is re-evaluated from scratch, so the candidate's numbers
 * always describe exactly the puzzle that ships.
 */
import { listObstacles } from '../../src/core/audit';
import { compile, initialState } from '../../src/core/engine';
import { mulberry32 } from '../../src/core/rng';
import { optimalFirstMoves } from '../../src/core/solver';
import type { Puzzle } from '../../src/core/types';
import { type Eval, evaluate } from './evaluate';
import { pruneGates } from './mutate';

export interface Finished {
  puzzle: Puzzle;
  eval: Eval;
  parFirst: number;
  stripped: string[];
}

export function finish(puzzle: Puzzle, seed: number): Finished | null {
  const rng = mulberry32(seed ^ 0xabcdef);
  const full = { runs: 300, maxNodes: 3_000_000, audit: true, random: true };
  let p = puzzle;
  let e = evaluate(p, rng, full);
  const stripped: string[] = [];
  for (let k = 0; e && e.decorative > 0 && k < 4; k++) {
    const deco = e.audit.find((a) => !a.matters)!;
    const ob = listObstacles(p).find((o) => o.name === deco.obstacle);
    if (!ob) break;
    // the plain variant: wall -> floor, arrow/ice/shift removed, shell -> core colour
    const q = pruneGates(ob.variants[0]);
    const eq = evaluate(q, rng, full);
    if (!eq) break;
    stripped.push(deco.obstacle);
    p = q;
    e = eq;
  }
  if (!e) return null;
  const c = compile(p);
  const parFirst = optimalFirstMoves(c, initialState(c), e.par, 120_000);
  return { puzzle: p, eval: e, parFirst, stripped };
}
