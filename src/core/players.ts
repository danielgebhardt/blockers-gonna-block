/**
 * Simulated novice players, used to rate how hard a level really is.
 *
 *  - random:    picks uniformly among all legal moves.
 *  - eager:     always takes an exit/peel when one exists, otherwise moves a
 *               random block to a random place.
 *  - lookahead: like eager, but when nothing can leave it prefers moves that
 *               let something leave next turn (one move of planning).
 *
 * A run succeeds if it clears the board within the move budget. Players never
 * undo, so dead ends (possible with shifting gates and layers) are failures.
 */
import {
  type Compiled,
  type IMove,
  type State,
  applyMove,
  exitMoves,
  initialState,
  isWon,
  legalMoves,
} from './engine';
import { type Rng } from './rng';

export type PlayerKind = 'random' | 'eager' | 'lookahead';

function pick<T>(rng: Rng, a: T[]): T {
  return a[Math.floor(rng() * a.length)];
}

export function playerMove(c: Compiled, s: State, kind: PlayerKind, rng: Rng): IMove | null {
  const moves = legalMoves(c, s);
  if (!moves.length) return null;
  if (kind === 'random') return pick(rng, moves);
  const exits = moves.filter((m) => m.g >= 0);
  if (exits.length) return pick(rng, exits);
  if (kind === 'lookahead' && rng() < 0.85) {
    // consider a sample of moves, like a person scanning the board
    const sample = moves.length > 24 ? Array.from({ length: 24 }, () => pick(rng, moves)) : moves;
    const good = sample.filter((m) => exitMoves(c, applyMove(c, s, m)).length > 0);
    if (good.length) return pick(rng, good);
  }
  return pick(rng, moves);
}

export function playOnce(c: Compiled, kind: PlayerKind, budget: number, rng: Rng): number | null {
  let s = initialState(c);
  for (let t = 0; t < budget; t++) {
    const m = playerMove(c, s, kind, rng);
    if (!m) return null;
    s = applyMove(c, s, m);
    if (isWon(s)) return t + 1;
  }
  return null;
}

export function successRate(c: Compiled, kind: PlayerKind, budget: number, runs: number, rng: Rng): number {
  let ok = 0;
  for (let r = 0; r < runs; r++) if (playOnce(c, kind, budget, rng) !== null) ok++;
  return ok / runs;
}
