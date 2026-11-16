/** Worker thread: run one climb for a slot and fully evaluate the result. */
import { parentPort } from 'node:worker_threads';
import { compile, initialState } from '../../src/core/engine';
import { mulberry32 } from '../../src/core/rng';
import { optimalFirstMoves } from '../../src/core/solver';
import { climb } from './climb';
import { evaluate } from './evaluate';
import { SLOTS } from './slots';

export interface Job {
  slot: string;
  seed: number;
}

parentPort!.on('message', (job: Job) => {
  const slot = SLOTS.find((s) => s.id === job.slot)!;
  const t0 = Date.now();
  const r = climb(slot, job.seed, slot.iters);
  if (!r) {
    parentPort!.postMessage({ job, result: null });
    return;
  }
  const rng = mulberry32(job.seed ^ 0xabcdef);
  const full = evaluate(r.puzzle, rng, { runs: 300, maxNodes: 3_000_000, audit: true, random: true });
  let parFirst = -1;
  if (full) {
    const c = compile(r.puzzle);
    parFirst = optimalFirstMoves(c, initialState(c), full.par, 120_000);
  }
  parentPort!.postMessage({
    job,
    ms: Date.now() - t0,
    result: full && { puzzle: r.puzzle, eval: full, parFirst },
  });
});
