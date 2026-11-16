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
import type { LevelDef } from '../src/core/types';

const levels: LevelDef[] = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
const lockUrl = new URL('../src/levels/levels.lock.json', import.meta.url);
const lock: Record<string, string> = existsSync(lockUrl) ? JSON.parse(readFileSync(lockUrl, 'utf8')) : {};

describe('level set', () => {
  it('has 30 levels in 6 sets of 5, with a tip opening each set', () => {
    expect(levels.map((l) => l.index)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    for (const l of levels) {
      expect(l.set).toBe(Math.floor((l.index - 1) / 5) + 1);
      expect(!!l.tip).toBe((l.index - 1) % 5 === 0);
    }
  });

  it('frozen levels are unchanged', () => {
    for (const [idx, hash] of Object.entries(lock)) {
      const l = levels.find((x) => x.index === Number(idx));
      expect(l, `frozen level ${idx} missing`).toBeTruthy();
      expect(levelHash(l!), `level ${idx} changed after it was frozen`).toBe(hash);
    }
  });
});

describe.each(levels.map((l) => [l.index, l] as const))('level %i', (_i, l) => {
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
