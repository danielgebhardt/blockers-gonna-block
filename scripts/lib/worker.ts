/** Worker thread: run one climb for a slot and fully evaluate the result. */
import { parentPort } from 'node:worker_threads';
import { climb } from './climb';
import { finish } from './finish';
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
  const f = finish(r.puzzle, job.seed);
  parentPort!.postMessage({
    job,
    ms: Date.now() - t0,
    result: f && { puzzle: f.puzzle, eval: f.eval, parFirst: f.parFirst, stripped: f.stripped },
  });
});
