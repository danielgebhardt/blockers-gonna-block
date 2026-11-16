/**
 * A play session for one level: current state, history for unlimited undo,
 * move count, and the star rules.
 *
 * Stars:
 *   at or under par            3
 *   within par + 20% (min +2)  2
 *   otherwise                  1
 *   then -1 if undo was used, -1 if a hint was used (never below 1).
 * Restarting gives a clean attempt (undo flag cleared). Hints stay counted for
 * the rest of the visit to the level, since a hint's knowledge survives a restart.
 */
import {
  type Compiled,
  type IMove,
  type State,
  applyMove,
  checkMove,
  cloneState,
  compile,
  initialState,
  isWon,
} from './engine';
import type { LevelDef } from './types';

export interface MoveRecord {
  move: IMove;
  before: State;
}

export function starsFor(moves: number, par: number, usedUndo: boolean, usedHint: boolean): number {
  let s = moves <= par ? 3 : moves <= par + Math.max(2, Math.ceil(par * 0.2)) ? 2 : 1;
  if (usedUndo) s--;
  if (usedHint) s--;
  return Math.max(1, s);
}

export class Session {
  readonly level: LevelDef;
  readonly c: Compiled;
  state: State;
  history: MoveRecord[] = [];
  usedUndo = false;
  usedHint = false;

  constructor(level: LevelDef) {
    this.level = level;
    this.c = compile(level);
    this.state = initialState(this.c);
  }

  get moves() {
    return this.history.length;
  }

  get won() {
    return isWon(this.state);
  }

  /** Apply a move after validating it. Returns false if illegal. */
  play(m: IMove): boolean {
    if (this.won || checkMove(this.c, this.state, m)) return false;
    this.history.push({ move: m, before: cloneState(this.state) });
    this.state = applyMove(this.c, this.state, m);
    return true;
  }

  undo(): MoveRecord | null {
    const r = this.history.pop();
    if (!r) return null;
    this.usedUndo = true;
    this.state = r.before;
    return r;
  }

  restart() {
    this.history = [];
    this.usedUndo = false;
    this.state = initialState(this.c);
  }

  stars(): number {
    return starsFor(this.moves, this.level.par, this.usedUndo, this.usedHint);
  }
}
