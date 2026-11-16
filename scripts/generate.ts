/**
 * Level factory.
 *
 *   npx tsx scripts/generate.ts                 # all unfrozen slots
 *   npx tsx scripts/generate.ts --slots 1-5,9   # some slots
 *   npx tsx scripts/generate.ts --climbs 12 --select-only
 *
 * For every slot it runs several simulated-annealing climbs in parallel
 * worker threads, fully evaluates each climb's best puzzle (exact par, novice
 * success rates over 300 runs, obstacle audit, number of par-keeping first
 * moves), keeps candidates in scripts/out/, and selects the best candidate that
 * meets the slot's targets while differing from its neighbours.
 *
 * Frozen levels (src/levels/levels.lock.json) are never regenerated.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { familyOf } from '../src/core/shapes';
import type { LevelDef, Puzzle } from '../src/core/types';
import { levelHash } from '../src/core/levelhash';
import { ascii } from './lib/ascii';
import type { Eval } from './lib/evaluate';
import { SLOTS, type Slot } from './lib/slots';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(here, 'out');
const levelsFile = join(root, 'src/levels/levels.json');
const lockFile = join(root, 'src/levels/levels.lock.json');

interface Candidate {
  seed: number;
  puzzle: Puzzle;
  eval: Eval;
  parFirst: number;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const slotsArg = get('--slots');
  let slots = SLOTS.map((s) => s.index);
  if (slotsArg) {
    slots = [];
    for (const part of slotsArg.split(',')) {
      const [x, y] = part.split('-').map(Number);
      for (let i = x; i <= (y ?? x); i++) slots.push(i);
    }
  }
  return {
    slots,
    climbs: get('--climbs') ? Number(get('--climbs')) : undefined,
    seed: Number(get('--seed') ?? Date.now() % 100000),
    selectOnly: a.includes('--select-only'),
    threads: Number(get('--threads') ?? Math.max(1, cpus().length)),
  };
}

const readJson = <T>(f: string, d: T): T => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);

export function violations(slot: Slot, c: Candidate): string[] {
  const t = slot.targets;
  const e = c.eval;
  const v: string[] = [];
  if (e.par < t.minPar) v.push(`par ${e.par}<${t.minPar}`);
  if (e.par > t.maxPar) v.push(`par ${e.par}>${t.maxPar}`);
  if (e.repositions > t.maxRepos) v.push(`repos ${e.repositions}>${t.maxRepos}`);
  if (e.longestSetup > t.maxSetup) v.push(`setup ${e.longestSetup}>${t.maxSetup}`);
  if (e.repositions < t.minRepos) v.push(`repos ${e.repositions}<${t.minRepos}`);
  if (e.longestSetup < t.minSetup) v.push(`setup ${e.longestSetup}<${t.minSetup}`);
  if (e.lookRate > t.maxLook) v.push(`look ${e.lookRate.toFixed(2)}>${t.maxLook.toFixed(2)}`);
  if (e.eagerRate > t.maxEager) v.push(`eager ${e.eagerRate.toFixed(2)}>${t.maxEager}`);
  if (c.parFirst > t.maxParFirst) v.push(`parFirst ${c.parFirst}>${t.maxParFirst}`);
  if (e.decorative > 0) v.push(`decorative ${e.audit.filter((a) => !a.matters).map((a) => a.obstacle).join(',')}`);
  if (slot.spec.colors > new Set(c.puzzle.blocks.flatMap((b) => b.colors)).size) v.push('too few colours');
  const need = (have: number, r?: [number, number]) => r && have < r[0];
  const ob = c.puzzle;
  if (need(ob.blocks.filter((b) => b.axis).length, slot.spec.oneway)) v.push('missing one-way');
  if (need(ob.blocks.filter((b) => b.ice).length, slot.spec.ice)) v.push('missing ice');
  if (need(ob.blocks.filter((b) => b.colors.length > 1).length, slot.spec.layered)) v.push('missing layers');
  if (need(ob.gates.filter((g) => g.colors.length > 1).length, slot.spec.shifting)) v.push('missing shifting');
  const walls = ob.grid.join('').split('#').length - 1;
  const voids = ob.grid.join('').split(' ').length - 1;
  if (need(walls, slot.spec.walls) || need(voids, slot.spec.voids)) v.push('missing walls/voids');
  if ((slot.spec.walls || slot.spec.voids) && walls + voids === 0) v.push('no walls/voids');
  return v;
}

function shapeMix(p: Puzzle): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of p.blocks) {
    const f = familyOf(b.cells);
    m.set(f, (m.get(f) ?? 0) + 1);
  }
  return m;
}

/** 0 = nothing alike, 1 = same mix */
function similarity(a: Puzzle, b: Puzzle): number {
  const ma = shapeMix(a);
  const mb = shapeMix(b);
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  let inter = 0;
  let uni = 0;
  for (const k of keys) {
    inter += Math.min(ma.get(k) ?? 0, mb.get(k) ?? 0);
    uni += Math.max(ma.get(k) ?? 0, mb.get(k) ?? 0);
  }
  const sizeSame = a.w === b.w && a.h === b.h ? 0.3 : 0;
  return (inter / uni) * 0.7 + sizeSame;
}

function select(slot: Slot, cands: Candidate[], chosen: LevelDef[]): Candidate | null {
  if (!cands.length) return null;
  const neighbours = chosen.filter((l) => Math.abs(l.index - slot.index) <= 2 && l.index !== slot.index);
  const keyOf = (c: Candidate) => {
    const v = violations(slot, c).length;
    const sim = neighbours.reduce((m, l) => Math.max(m, similarity(l, c.puzzle)), 0);
    // key-moment variety: penalise matching a neighbour's key position
    const keySame = neighbours.some((l) => Math.abs((l.stats.keyMove / l.par) - c.eval.keyAt) < 0.08) ? 1 : 0;
    return -v * 1000 + c.eval.score - sim * 6 - keySame * 2;
  };
  return cands.slice().sort((a, b) => keyOf(b) - keyOf(a))[0];
}

function toLevel(slot: Slot, c: Candidate): LevelDef {
  const e = c.eval;
  return {
    index: slot.index,
    set: slot.set,
    name: slot.name,
    ...(slot.tip ? { tip: slot.tip } : {}),
    w: c.puzzle.w,
    h: c.puzzle.h,
    grid: c.puzzle.grid,
    blocks: c.puzzle.blocks,
    gates: c.puzzle.gates,
    par: e.par,
    solution: e.moves,
    stats: {
      repositions: e.repositions,
      longestSetup: e.longestSetup,
      keyMove: e.keyMove,
      randomRate: e.randomRate,
      eagerRate: e.eagerRate,
      lookaheadRate: e.lookRate,
      parFirstMoves: c.parFirst,
      searchNodes: e.nodes,
      audit: e.audit.map((a) => ({ obstacle: a.obstacle, par: a.pars[0] ?? null })),
    },
  };
}

async function runJobs(jobs: { slot: number; seed: number }[], threads: number, onResult: (r: any) => void) {
  let next = 0;
  let done = 0;
  await new Promise<void>((resolve) => {
    if (!jobs.length) return resolve();
    const spawn = () => {
      const w = new Worker(new URL('./lib/worker.ts', import.meta.url));
      const feed = () => {
        if (next >= jobs.length) {
          w.terminate();
          return;
        }
        w.postMessage(jobs[next++]);
      };
      w.on('message', (msg) => {
        onResult(msg);
        done++;
        if (done === jobs.length) resolve();
        feed();
      });
      w.on('error', (e) => {
        console.error('worker error', e);
        done++;
        if (done === jobs.length) resolve();
      });
      feed();
    };
    for (let i = 0; i < Math.min(threads, jobs.length); i++) spawn();
  });
}

async function main() {
  const args = parseArgs();
  mkdirSync(outDir, { recursive: true });
  const lock: Record<string, string> = readJson(lockFile, {});
  const levels: LevelDef[] = readJson(levelsFile, []);
  const slots = SLOTS.filter((s) => args.slots.includes(s.index) && !lock[s.index]);
  const skipped = args.slots.filter((i) => lock[i]);
  if (skipped.length) console.log(`frozen, not touched: ${skipped.join(', ')}`);

  if (!args.selectOnly) {
    const jobs = slots.flatMap((s) =>
      Array.from({ length: args.climbs ?? s.climbs }, (_, k) => ({ slot: s.index, seed: args.seed * 1000 + s.index * 37 + k })),
    );
    console.log(`${jobs.length} climbs on ${args.threads} threads`);
    await runJobs(jobs, args.threads, (msg) => {
      const f = join(outDir, `cand-${msg.job.slot}.json`);
      const list: Candidate[] = readJson(f, []);
      if (msg.result) list.push({ seed: msg.job.seed, ...msg.result });
      writeFileSync(f, JSON.stringify(list));
      const e = msg.result?.eval;
      const slot = SLOTS.find((s) => s.index === msg.job.slot)!;
      const v = msg.result ? violations(slot, { seed: 0, ...msg.result }) : ['none'];
      console.log(
        `slot ${msg.job.slot} seed ${msg.job.seed} ${(msg.ms / 1000).toFixed(0)}s: ` +
          (e
            ? `par ${e.par} repos ${e.repositions} setup ${e.longestSetup} look ${e.lookRate.toFixed(2)} eager ${e.eagerRate.toFixed(2)} pf ${msg.result.parFirst} score ${e.score.toFixed(1)} ${v.length ? '✗ ' + v.join('; ') : '✓'}`
            : 'failed'),
      );
    });
  }

  // selection, in slot order so neighbours can be compared
  const byIndex = new Map(levels.map((l) => [l.index, l]));
  for (const slot of SLOTS) {
    if (!args.slots.includes(slot.index) || lock[slot.index]) continue;
    const cands: Candidate[] = readJson(join(outDir, `cand-${slot.index}.json`), []);
    const best = select(slot, cands, [...byIndex.values()]);
    if (!best) {
      console.log(`slot ${slot.index}: no candidates`);
      continue;
    }
    const v = violations(slot, best);
    const lvl = toLevel(slot, best);
    byIndex.set(slot.index, lvl);
    console.log(`\n=== ${slot.index}. ${slot.name}  par ${lvl.par}  ${v.length ? 'WARN ' + v.join('; ') : 'ok'}  (${cands.length} candidates)`);
    console.log(ascii(lvl));
  }
  const out = [...byIndex.values()].sort((a, b) => a.index - b.index);
  mkdirSync(dirname(levelsFile), { recursive: true });
  writeFileSync(levelsFile, formatLevels(out));
  console.log(`\nwrote ${out.length} levels; hashes:`);
  for (const l of out) console.log(`  ${l.index}: ${levelHash(l)}${lock[l.index] ? ' (frozen)' : ''}`);
}

/** One level per line block, readable diffs. */
export function formatLevels(levels: LevelDef[]): string {
  return '[\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n]\n';
}

main();
