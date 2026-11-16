/** Main-thread client for the solver worker. Only the latest request matters. */
import type { IMove, State } from '../core/engine';
import type { Puzzle } from '../core/types';
import type { SolveReply, SolveRequest } from './solver.worker';

export interface HintResult {
  solvable: boolean | null;
  moves: IMove[];
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: HintResult) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SolveReply>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      cb?.({ solvable: e.data.solvable, moves: e.data.moves });
    };
  }
  return worker;
}

export function solveFrom(key: string, puzzle: Puzzle, s: State, maxNodes = 1_500_000): Promise<HintResult> {
  const id = nextId++;
  const req: SolveRequest = { id, key, puzzle, pos: Array.from(s.pos), layer: Array.from(s.layer), maxNodes };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage(req);
  });
}
