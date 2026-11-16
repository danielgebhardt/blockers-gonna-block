/**
 * Every shipped level: well-formed, solvable by replaying its stored solution
 * through the real rules, par proven optimal by the exact solver, every
 * obstacle earns its place, and frozen levels are byte-for-byte unchanged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditPuzzle } from '../src/core/audit';
import { compile, isWon, replay } from '../src/core/engine';
import { levelHash } from '../src/core/levelhash';
import { solve } from '../src/core/solver';
import { SETS, levelId, levelNumber } from '../src/core/sets';
import type { LevelDef } from '../src/core/types';

const levels: LevelDef[] = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
const lockUrl = new URL('../src/levels/levels.lock.json', import.meta.url);
const lock: Record<string, string> = existsSync(lockUrl) ? JSON.parse(readFileSync(lockUrl, 'utf8')) : {};

describe('level set', () => {
  it('follows the set layout: ids, numbers and tips', () => {
    const ids = new Set<string>();
    for (const l of levels) {
      expect(ids.has(l.id), `duplicate ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(l.id).toBe(levelId(l.set, l.pos));
      expect(l.index).toBe(levelNumber(l.set, l.pos));
      expect(l.pos).toBeLessThanOrEqual(SETS[l.set - 1].size);
      expect(!!l.tip, `${l.id} tip`).toBe(l.pos === 1);
    }
    // every set's first five (the first release) are always there
    for (let s = 1; s <= SETS.length; s++) for (let p = 1; p <= 5; p++) expect(ids.has(levelId(s, p))).toBe(true);
  });

  it('frozen levels are unchanged', () => {
    for (const [id, hash] of Object.entries(lock)) {
      const l = levels.find((x) => x.id === id);
      expect(l, `frozen level ${id} missing`).toBeTruthy();
      expect(levelHash(l!), `level ${id} changed after it was frozen`).toBe(hash);
    }
  });

  it('every shipped level is frozen', () => {
    for (const l of levels) expect(lock[l.id], `${l.id} is not frozen`).toBeTruthy();
  });
});

describe.each(levels.map((l) => [l.id, l] as const))('level %s', (_id, l) => {
  it('is well formed', () => {
    const c = compile(l); // throws on bad geometry
    const sideLen = (s: string) => (s === 'N' || s === 'S' ? l.w : l.h);
    for (const g of l.gates) {
      expect(g.start).toBeGreaterThanOrEqual(0);
      expect(g.start + g.len).toBeLessThanOrEqual(sideLen(g.side));
    }
    const used = new Set(l.blocks.flatMap((b) => b.colors));
    for (const g of l.gates) if (g.colors.length === 1) expect(used.has(g.colors[0])).toBe(true);
    expect(c.blocks.length).toBe(l.blocks.length);
  });

  it('its stored solution clears the board in exactly par moves', () => {
    const c = compile(l);
    expect(l.solution.length).toBe(l.par);
    expect(isWon(replay(c, l.solution))).toBe(true);
  });

  it('par is optimal (exact solver)', () => {
    const r = solve(compile(l), undefined, { maxNodes: 4_000_000 });
    expect(r.solvable).toBe(true);
    expect(r.moves.length).toBe(l.par);
  });

  it('every obstacle matters', () => {
    const audit = auditPuzzle(l, l.par, 2_000_000);
    const deco = audit.filter((a) => !a.matters).map((a) => `${a.obstacle} (par ${a.pars.join('/')})`);
    expect(deco).toEqual([]);
  });
});
