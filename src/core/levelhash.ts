import { fnv1a } from './rng';
import type { LevelDef, Puzzle } from './types';

/** Hash of everything that defines how a level plays (not its name/stats). */
export function levelHash(l: Puzzle & Partial<Pick<LevelDef, 'par'>>): string {
  const core = {
    w: l.w,
    h: l.h,
    grid: l.grid,
    blocks: l.blocks.map((b) => ({ cells: b.cells, x: b.x, y: b.y, colors: b.colors, axis: b.axis ?? null, ice: b.ice ?? 0 })),
    gates: l.gates.map((g) => ({ side: g.side, start: g.start, len: g.len, colors: g.colors })),
    par: l.par ?? null,
  };
  const s = JSON.stringify(core);
  // two independent 32-bit hashes for a 64-bit fingerprint
  return fnv1a(s) + fnv1a(s.split('').reverse().join(''));
}
