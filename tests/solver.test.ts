import { describe, expect, it } from 'vitest';
import { applyMove, compile, initialState, isWon, legalMoves, replay, stateKey } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import { solve } from '../src/core/solver';
import { construct, type Spec } from '../scripts/lib/construct';

/** Plain BFS over all legal moves: slow, obviously correct reference. */
function bfsPar(p: ReturnType<typeof compile>): number | null | undefined {
  const s0 = initialState(p);
  const seen = new Set([stateKey(p, s0)]);
  let frontier = [s0];
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const s of frontier) {
      if (isWon(s)) return d;
      for (const m of legalMoves(p, s)) {
        const t = applyMove(p, s, m);
        const k = stateKey(p, t);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(t);
      }
    }
    frontier = next;
    if (seen.size > 60_000) return undefined;
  }
  return null;
}

const specs: Spec[] = [
  { index: 0, w: 4, h: 4, colors: 3, blocks: [5, 6], shapes: { domino: 3, V3: 2, I3: 1 } },
  { index: 0, w: 4, h: 5, colors: 3, blocks: [5, 6], shapes: { domino: 3, V3: 1 }, walls: [1, 2], oneway: [1, 2] },
  { index: 0, w: 4, h: 4, colors: 3, blocks: [5, 6], shapes: { domino: 3, V3: 1 }, ice: [1, 2], layered: [1, 1] },
  { index: 0, w: 4, h: 4, colors: 3, blocks: [5, 6], shapes: { domino: 3, V3: 1 }, shifting: [1, 2], layered: [0, 1] },
  { index: 0, w: 4, h: 4, colors: 3, blocks: [5, 6], shapes: { domino: 3, V3: 1 }, locks: [1, 2], layered: [0, 1] },
  { index: 0, w: 4, h: 4, colors: 3, blocks: [4, 6], shapes: { mono: 1, domino: 3, V3: 1 }, plates: [1, 2] },
];

describe('solver is exact', () => {
  it('A* with pruning matches brute-force BFS on random small puzzles', () => {
    const rng = mulberry32(1234);
    let checked = 0;
    for (const spec of specs) {
      for (let i = 0; i < 25; i++) {
        const p = construct(rng, spec);
        const c = compile(p);
        const ref = bfsPar(c);
        if (ref === undefined) continue; // state space too big for the reference
        const a = solve(c);
        const b = solve(c, undefined, { noPrune: true });
        if (spec.locks) expect(c.hasLocks || !p.gates.some((g) => g.lock !== undefined)).toBe(true);
        expect(a.solvable).toBe(ref !== null);
        expect(b.solvable).toBe(ref !== null);
        if (ref !== null) {
          expect(a.moves.length).toBe(ref);
          expect(b.moves.length).toBe(ref);
          expect(isWon(replay(c, a.moves))).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(60);
  }, 120_000);
});

describe('dead ends', () => {
  it('only shifting gates can make a solvable level unsolvable (random walks)', () => {
    const rng = mulberry32(77);
    const noShift: Spec[] = specs.slice(0, 3);
    let walks = 0;
    for (const spec of noShift) {
      for (let i = 0; i < 12; i++) {
        const c = compile(construct(rng, spec));
        if (!solve(c).solvable) continue;
        let s = initialState(c);
        for (let k = 0; k < 8; k++) {
          const ms = legalMoves(c, s);
          if (!ms.length) break;
          s = applyMove(c, s, ms[Math.floor(rng() * ms.length)]);
          expect(solve(c, s).solvable).toBe(true);
        }
        walks++;
      }
    }
    expect(walks).toBeGreaterThan(10);
  });
});
