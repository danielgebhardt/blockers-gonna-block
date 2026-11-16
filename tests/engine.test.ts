import { describe, expect, it } from 'vitest';
import {
  applyMove,
  checkMove,
  compile,
  fromMove,
  initialState,
  isWon,
  legalMoves,
  replay,
} from '../src/core/engine';
import { solve } from '../src/core/solver';
import type { Puzzle } from '../src/core/types';

const I2H: [number, number][] = [
  [0, 0],
  [1, 0],
];
const ONE: [number, number][] = [[0, 0]];

describe('engine basics', () => {
  // 4x3 board, red 1x2 on row 0, gate red on east rows 0..0
  const p: Puzzle = {
    w: 4,
    h: 3,
    grid: ['....', '....', '....'],
    blocks: [{ cells: I2H, x: 0, y: 0, colors: [0] }],
    gates: [{ side: 'E', start: 0, len: 1, colors: [0] }],
  };

  it('a block can reach any free anchor and exit through a matching gate', () => {
    const c = compile(p);
    const s = initialState(c);
    const moves = legalMoves(c, s);
    // 3 cols x 3 rows of anchors = 9, minus the start = 8 repositions + 1 exit
    expect(moves.filter((m) => m.g < 0)).toHaveLength(8);
    expect(moves.filter((m) => m.g >= 0)).toHaveLength(1);
    const exit = moves.find((m) => m.g >= 0)!;
    expect(exit.a).toBe(2); // x=2,y=0 touches the east edge
    expect(isWon(applyMove(c, s, exit))).toBe(true);
  });

  it('gate width must fit the block', () => {
    const c = compile({ ...p, blocks: [{ cells: [[0, 0], [0, 1]], x: 0, y: 0, colors: [0] }] });
    const s = initialState(c);
    expect(legalMoves(c, s).some((m) => m.g >= 0)).toBe(false);
    expect(solve(c).solvable).toBe(false);
  });

  it('colour must match', () => {
    const c = compile({ ...p, blocks: [{ cells: I2H, x: 0, y: 0, colors: [1] }] });
    expect(solve(c).solvable).toBe(false);
  });

  it('blocks stop each other and walls block movement', () => {
    const c = compile({
      w: 4,
      h: 1,
      grid: ['..#.'],
      blocks: [
        { cells: ONE, x: 0, y: 0, colors: [0] },
        { cells: ONE, x: 1, y: 0, colors: [1] },
      ],
      gates: [{ side: 'W', start: 0, len: 1, colors: [1] }],
    });
    const s = initialState(c);
    // block 0 is boxed in (wall at 2 stops block 1 from making space); block 1 can't pass block 0
    expect(legalMoves(c, s)).toHaveLength(0);
    expect(solve(c).solvable).toBe(false);
  });

  it('exit sweep needs free cells (L shape passing a notch)', () => {
    // L: cells (0,1),(1,1),(1,0) — the (0,0) cell above the foot must be free to exit north
    const L: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    const base: Puzzle = {
      w: 2,
      h: 2,
      grid: ['..', '..'],
      blocks: [{ cells: L, x: 0, y: 0, colors: [0] }],
      gates: [{ side: 'N', start: 0, len: 2, colors: [0] }],
    };
    expect(solve(compile(base)).moves).toHaveLength(1);
    const notched = { ...base, grid: ['#.', '..'] };
    expect(solve(compile(notched)).solvable).toBe(false);
  });

  it('one-way blocks only move along their axis, and only exit along it', () => {
    const c = compile({
      w: 3,
      h: 3,
      grid: ['...', '...', '...'],
      blocks: [{ cells: ONE, x: 1, y: 1, colors: [0], axis: 'h' }],
      gates: [{ side: 'N', start: 0, len: 3, colors: [0] }],
    });
    const s = initialState(c);
    expect(legalMoves(c, s).map((m) => m.a).sort()).toEqual([3, 5]);
    expect(solve(c).solvable).toBe(false);
  });

  it('ice blocks wait for exits', () => {
    const c = compile({
      w: 3,
      h: 1,
      grid: ['...'],
      blocks: [
        { cells: ONE, x: 0, y: 0, colors: [0], ice: 1 },
        { cells: ONE, x: 2, y: 0, colors: [1] },
      ],
      gates: [
        { side: 'W', start: 0, len: 1, colors: [0] },
        { side: 'E', start: 0, len: 1, colors: [1] },
      ],
    });
    const s = initialState(c);
    expect(legalMoves(c, s).every((m) => m.b === 1)).toBe(true);
    const r = solve(c);
    expect(r.moves.map((m) => m.b)).toEqual([1, 0]);
  });

  it('layered blocks peel and stay, then leave through the core colour', () => {
    const c = compile({
      w: 3,
      h: 1,
      grid: ['...'],
      blocks: [{ cells: ONE, x: 1, y: 0, colors: [0, 1] }],
      gates: [
        { side: 'W', start: 0, len: 1, colors: [0] },
        { side: 'E', start: 0, len: 1, colors: [1] },
      ],
    });
    const r = solve(c);
    expect(r.moves).toEqual([
      { b: 0, x: 0, y: 0, g: 0 },
      { b: 0, x: 2, y: 0, g: 1 },
    ]);
  });

  it('shifting gates advance on every exit', () => {
    // one gate cycling red->blue; two blocks: blue must wait for red to leave first
    const c = compile({
      w: 3,
      h: 1,
      grid: ['...'],
      blocks: [
        { cells: ONE, x: 0, y: 0, colors: [1] },
        { cells: ONE, x: 2, y: 0, colors: [0] },
      ],
      gates: [{ side: 'E', start: 0, len: 1, colors: [0, 1] }],
    });
    const s = initialState(c);
    expect(checkMove(c, s, fromMove(c, { b: 0, x: 1, y: 0, g: 0 }))).toBeTruthy();
    const r = solve(c);
    expect(r.moves.map((m) => m.b)).toEqual([1, 0]);
    expect(isWon(replay(c, r.moves))).toBe(true);
  });
});
