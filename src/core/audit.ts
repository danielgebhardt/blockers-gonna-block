/**
 * Obstacle audit: an obstacle only earns its place if the level is different
 * without it. Each obstacle is neutralised in turn and the level re-solved.
 *
 *  - wall / void component  -> turned into floor
 *  - one-way block          -> moves freely
 *  - frozen block           -> ice removed
 *  - shifting gate          -> stuck on its first colour
 *  - layered block          -> replaced by a plain block of its core colour,
 *                              and (separately) of its shell colour
 *
 * Verdict: the obstacle matters if neutralising it changes par (or makes the
 * level unsolvable). For layered blocks the shell always costs its own peel
 * move, so it must cost MORE than that: par > neutral par + 1 for both
 * plain-colour versions.
 */
import { compile } from './engine';
import { solve } from './solver';
import type { Puzzle } from './types';

export interface Obstacle {
  name: string;
  kind: 'wall' | 'axis' | 'ice' | 'layer' | 'shift';
  variants: Puzzle[];
}

const clonePuzzle = (p: Puzzle): Puzzle => JSON.parse(JSON.stringify(p));

/** 4-connected components of non-floor cells. Void and walls separately. */
export function obstacleComponents(p: Puzzle): { ch: string; cells: [number, number][] }[] {
  const seen = new Set<number>();
  const out: { ch: string; cells: [number, number][] }[] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const ch = p.grid[y][x];
      if (ch === '.' || seen.has(y * p.w + x)) continue;
      const cells: [number, number][] = [];
      const st = [[x, y]];
      seen.add(y * p.w + x);
      while (st.length) {
        const [cx, cy] = st.pop()!;
        cells.push([cx, cy]);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
          if (p.grid[ny][nx] !== ch || seen.has(ny * p.w + nx)) continue;
          seen.add(ny * p.w + nx);
          st.push([nx, ny]);
        }
      }
      out.push({ ch, cells });
    }
  return out;
}

export function listObstacles(p: Puzzle): Obstacle[] {
  const obs: Obstacle[] = [];
  for (const comp of obstacleComponents(p)) {
    const v = clonePuzzle(p);
    for (const [x, y] of comp.cells) v.grid[y] = v.grid[y].slice(0, x) + '.' + v.grid[y].slice(x + 1);
    const [x0, y0] = comp.cells[0];
    obs.push({ name: `${comp.ch === '#' ? 'wall' : 'void'}@${x0},${y0}`, kind: 'wall', variants: [v] });
  }
  p.blocks.forEach((b, i) => {
    if (b.axis) {
      const v = clonePuzzle(p);
      delete v.blocks[i].axis;
      obs.push({ name: `oneway#${i}`, kind: 'axis', variants: [v] });
    }
    if (b.ice) {
      const v = clonePuzzle(p);
      delete v.blocks[i].ice;
      obs.push({ name: `ice#${i}`, kind: 'ice', variants: [v] });
    }
    if (b.colors.length > 1) {
      const core = clonePuzzle(p);
      core.blocks[i].colors = [b.colors[b.colors.length - 1]];
      const shell = clonePuzzle(p);
      shell.blocks[i].colors = [b.colors[0]];
      obs.push({ name: `layer#${i}`, kind: 'layer', variants: [core, shell] });
    }
  });
  p.gates.forEach((g, i) => {
    if (g.colors.length > 1) {
      const v = clonePuzzle(p);
      v.gates[i].colors = [g.colors[0]];
      obs.push({ name: `shift#${i}`, kind: 'shift', variants: [v] });
    }
  });
  return obs;
}

export interface AuditEntry {
  obstacle: string;
  kind: Obstacle['kind'];
  /** Par of each neutralised variant (null = unsolvable, undefined = gave up). */
  pars: (number | null | undefined)[];
  matters: boolean;
}

export function auditPuzzle(p: Puzzle, par: number, maxNodes = 400_000, stopOnFail = false): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const o of listObstacles(p)) {
    const pars = o.variants.map((v) => {
      let c;
      try {
        c = compile(v);
      } catch {
        return null;
      }
      const r = solve(c, undefined, { maxNodes });
      if (r.solvable === null) return undefined;
      return r.solvable ? r.moves.length : null;
    });
    let matters: boolean;
    if (o.kind === 'layer') matters = pars.every((q) => q === null || (q !== undefined && par > q + 1));
    else matters = pars.every((q) => q === null || (q !== undefined && q !== par));
    out.push({ obstacle: o.name, kind: o.kind, pars, matters });
    if (stopOnFail && !matters) break;
  }
  return out;
}
