/**
 * Scoring a candidate level: exact solve, solution shape, simulated novices,
 * obstacle audit.
 */
import { auditPuzzle, type AuditEntry } from '../../src/core/audit';
import { compile, type Compiled, type IMove } from '../../src/core/engine';
import { successRate } from '../../src/core/players';
import type { Rng } from '../../src/core/rng';
import { solve } from '../../src/core/solver';
import type { Move, Puzzle } from '../../src/core/types';

export interface Eval {
  par: number;
  moves: Move[];
  imoves: IMove[];
  nodes: number;
  repositions: number;
  longestSetup: number;
  /** Fraction (0..1) of the way through the solution where the longest setup starts. */
  keyAt: number;
  keyMove: number;
  eagerRate: number;
  lookRate: number;
  randomRate: number;
  audit: AuditEntry[];
  decorative: number;
  score: number;
}

export const budgetFor = (par: number) => Math.ceil(par * 1.5) + 2;

export function solutionShape(imoves: IMove[]) {
  let longest = 0;
  let keyMove = 0;
  let run = 0;
  imoves.forEach((m, i) => {
    if (m.g < 0) {
      run++;
      if (run > longest) {
        longest = run;
        keyMove = i - run + 1;
      }
    } else run = 0;
  });
  return {
    repositions: imoves.filter((m) => m.g < 0).length,
    longestSetup: longest,
    keyMove,
    keyAt: imoves.length ? keyMove / imoves.length : 0,
  };
}

export interface EvalOptions {
  runs: number;
  maxNodes: number;
  audit: boolean;
  random?: boolean;
}

export function evaluate(p: Puzzle, rng: Rng, o: EvalOptions): Eval | null {
  let c: Compiled;
  try {
    c = compile(p);
  } catch {
    return null;
  }
  const r = solve(c, undefined, { maxNodes: o.maxNodes });
  if (!r.solvable) return null;
  const par = r.moves.length;
  const shape = solutionShape(r.imoves);
  const budget = budgetFor(par);
  const eagerRate = successRate(c, 'eager', budget, o.runs, rng);
  const lookRate = successRate(c, 'lookahead', budget, o.runs, rng);
  const randomRate = o.random ? successRate(c, 'random', budget * 3, o.runs, rng) : 0;
  const audit = o.audit ? auditPuzzle(p, par, o.maxNodes) : [];
  const decorative = audit.filter((a) => !a.matters).length;
  const e: Eval = {
    par,
    moves: r.moves,
    imoves: r.imoves,
    nodes: r.nodes,
    ...shape,
    eagerRate,
    lookRate,
    randomRate,
    audit,
    decorative,
    score: 0,
  };
  e.score = score(e);
  return e;
}

/** Bigger is harder. */
export function score(e: Eval): number {
  return (
    e.repositions * 2 +
    Math.min(e.longestSetup, 6) * 3 +
    (1 - e.lookRate) * 14 +
    (1 - e.eagerRate) * 4 +
    Math.log10(1 + e.nodes) * 1.5 +
    obstacleWeight(e) -
    e.decorative * 15
  );
}

/** How much the obstacles shape the solution: par lost when each is neutralised. */
export function obstacleWeight(e: Eval): number {
  let w = 0;
  for (const a of e.audit) {
    for (const q of a.pars) {
      const d = q === null ? 4 : q === undefined ? 0 : e.par - q - (a.kind === 'layer' ? 1 : 0);
      w += Math.min(Math.max(d, 0), 3) / a.pars.length;
    }
  }
  return w * 1.5;
}
