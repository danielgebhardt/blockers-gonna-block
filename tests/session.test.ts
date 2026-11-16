import { describe, expect, it } from 'vitest';
import { compile, fromMove, initialState } from '../src/core/engine';
import { Session, starsFor } from '../src/core/session';
import type { LevelDef } from '../src/core/types';

const ONE: [number, number][] = [[0, 0]];
// 4x2 board: red 1x1 at (0,0) with a red gate east on row 0; blue 1x1 at (3,1) with blue gate west on row 1
const level: LevelDef = {
  id: 'basics-01',
  index: 1,
  set: 1,
  pos: 1,
  name: 't',
  w: 4,
  h: 2,
  grid: ['....', '....'],
  blocks: [
    { cells: ONE, x: 0, y: 0, colors: [0] },
    { cells: ONE, x: 3, y: 1, colors: [1] },
    { cells: ONE, x: 1, y: 1, colors: [0, 1] },
  ],
  gates: [
    { side: 'E', start: 0, len: 1, colors: [0] },
    { side: 'W', start: 1, len: 1, colors: [1] },
  ],
  par: 0,
  solution: [],
  stats: {} as LevelDef['stats'],
};
const mv = (s: Session, b: number, x: number, y: number, g?: number) =>
  s.play(fromMove(s.c, { b, x, y, ...(g !== undefined ? { g } : {}) }));

describe('session move counting', () => {
  it('consecutive drags of the same block are one move', () => {
    const s = new Session(level);
    expect(mv(s, 0, 1, 0)).toBe(true);
    expect(mv(s, 0, 2, 0)).toBe(true);
    expect(s.moves).toBe(1);
    expect(mv(s, 1, 2, 1)).toBe(true);
    expect(s.moves).toBe(2);
  });

  it('a reposition followed by the same block leaving is one move', () => {
    const s = new Session(level);
    mv(s, 0, 1, 0);
    mv(s, 0, 3, 0, 0);
    expect(s.moves).toBe(1);
    expect(s.state.pos[0]).toBe(-1);
  });

  it('dragging a block back where it started cancels the move', () => {
    const s = new Session(level);
    mv(s, 0, 2, 0);
    mv(s, 0, 0, 0);
    expect(s.moves).toBe(0);
  });

  it('a peel ends the move: moving the core afterwards is a new move', () => {
    const s = new Session(level);
    mv(s, 0, 3, 0, 0); // red leaves (1)
    mv(s, 2, 3, 0, 0); // layered block peels red shell at the east gate (2)
    expect(s.moves).toBe(2);
    expect(s.state.layer[2]).toBe(1);
    mv(s, 2, 1, 0); // core repositions: new move (3)
    expect(s.moves).toBe(3);
    mv(s, 2, 0, 0); // same block again: still move 3
    expect(s.moves).toBe(3);
  });

  it('undo takes back the whole merged move', () => {
    const s = new Session(level);
    mv(s, 1, 2, 1);
    mv(s, 0, 1, 0);
    mv(s, 0, 2, 0);
    s.undo();
    expect(s.moves).toBe(1);
    expect(Array.from(s.state.pos)).toEqual([0, 6, 5]);
    expect(s.usedUndo).toBe(true);
  });

  it('stars', () => {
    expect(starsFor(10, 10, false, false)).toBe(3);
    expect(starsFor(12, 10, false, false)).toBe(2);
    expect(starsFor(13, 10, false, false)).toBe(1);
    expect(starsFor(10, 10, true, true)).toBe(1);
    expect(initialState(compile(level)).pos.length).toBe(3);
  });
});

describe('save migration and unlocking', async () => {
  const { migrateV1, isSetOpen, isUnlocked } = await import('../src/game/save');
  it('maps first-release level numbers to permanent ids', () => {
    const v2 = migrateV1({ levels: { 1: { stars: 3, best: 15 }, 6: { stars: 2, best: 14 }, 30: { stars: 1, best: 20 } }, tipsSeen: [1, 6] });
    expect(Object.keys(v2.levels).sort()).toEqual(['basics-01', 'shift-05', 'stone-01']);
    expect(v2.tipsSeen).toEqual(['basics-01', 'stone-01']);
  });
  it('a set opens after five clears in the set before; levels open two ahead', () => {
    const p = (ids: string[]) => Object.fromEntries(ids.map((i) => [i, { stars: 3, best: 1 }]));
    expect(isUnlocked('basics-02', p([]))).toBe(true);
    expect(isUnlocked('basics-03', p([]))).toBe(false);
    expect(isSetOpen(2, p(['basics-01', 'basics-02', 'basics-03', 'basics-04']))).toBe(false);
    const five = p(['basics-01', 'basics-02', 'basics-03', 'basics-04', 'basics-05']);
    expect(isSetOpen(2, five)).toBe(true);
    expect(isUnlocked('basics-07', five)).toBe(true);
    expect(isUnlocked('basics-08', five)).toBe(false);
    expect(isUnlocked('stone-02', five)).toBe(true);
    expect(isUnlocked('stone-03', five)).toBe(false);
  });
});
