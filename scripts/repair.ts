/**
 * Repair existing candidates: strip decorative obstacles and re-evaluate.
 * Adds the repaired versions to scripts/out/cand-<id>.json.
 *   npx tsx scripts/repair.ts '^oneway-(24|27)$'
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finish } from './lib/finish';
import { SLOTS } from './lib/slots';

const outDir = join(import.meta.dirname, 'out');
const re = new RegExp(process.argv[2] ?? '^$');
for (const slot of SLOTS.filter((s) => re.test(s.id))) {
  const f = join(outDir, `cand-${slot.id}.json`);
  if (!existsSync(f)) continue;
  const list = JSON.parse(readFileSync(f, 'utf8'));
  const fresh = [];
  for (const c of list) {
    if (!c.eval.decorative || c.repaired) continue;
    const r = finish(c.puzzle, c.seed);
    if (!r) continue;
    console.log(`${slot.id} seed ${c.seed}: stripped ${r.stripped.join(',') || 'nothing'} -> par ${r.eval.par}, decorative ${r.eval.decorative}`);
    fresh.push({ seed: c.seed, puzzle: r.puzzle, eval: r.eval, parFirst: r.parFirst, repaired: true });
  }
  writeFileSync(f, JSON.stringify([...list, ...fresh]));
}
