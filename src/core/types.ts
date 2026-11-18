/**
 * Plain data types shared by the rules engine, the solver, the level
 * generator and the game scenes. Everything here is JSON-serialisable.
 */

/** Board edge a gate sits on. N = top, E = right, S = bottom, W = left. */
export type Side = 'N' | 'E' | 'S' | 'W';

/** One-way restriction: 'h' = only left/right, 'v' = only up/down. */
export type Axis = 'h' | 'v';

export interface BlockDef {
  /** Cell offsets of the polyomino, normalised so min x = min y = 0. */
  cells: [number, number][];
  /** Anchor position (cell of offset 0,0) on the board. */
  x: number;
  y: number;
  /**
   * Colour layers, outermost first. A plain block has one colour; a layered
   * block has two (shell, core). Leaving through a gate of the current outer
   * colour peels that layer; the last layer leaves the board.
   */
  colors: number[];
  /** One-way block. */
  axis?: Axis;
  /** Frozen: cannot move until this many blocks have left the board. */
  ice?: number;
}

export interface GateDef {
  side: Side;
  /** First border cell covered (column for N/S, row for E/W). */
  start: number;
  /** Number of border cells covered. */
  len: number;
  /**
   * Colour cycle. A normal gate has one colour. A shifting gate advances to
   * the next colour every time a block leaves the board (peeling a shell does
   * not count as leaving).
   */
  colors: number[];
  /**
   * Padlock: the gate stays shut until a block whose final (core) colour is
   * this colour has left the board.
   */
  lock?: number;
  /**
   * Pressure plate (index into Puzzle.plates): the gate is barred unless some
   * other block (not the one going out) is standing on that plate.
   */
  plate?: number;
}

/**
 * The board. `grid` has `h` rows of `w` characters:
 *   '.' floor, '#' wall (fixed obstacle), ' ' void (outside a non-rectangular box).
 * Walls and void are both impassable; they only look different.
 */
export interface Puzzle {
  w: number;
  h: number;
  grid: string[];
  blocks: BlockDef[];
  gates: GateDef[];
  /** Pressure plate cells (floor cells), referenced by GateDef.plate. */
  plates?: [number, number][];
}

/**
 * One drag. Block `b` is dragged to anchor (x, y). If `g` is set the drag
 * continues out through gate `g` from that position (exit or peel).
 */
export interface Move {
  b: number;
  x: number;
  y: number;
  g?: number;
}

export interface LevelStats {
  /** Moves in the shortest solution that are not exits/peels. */
  repositions: number;
  /** Longest run of consecutive non-exit moves in the shortest solution. */
  longestSetup: number;
  /** Index (0-based) of the first move whose block does not leave/peel. */
  keyMove: number;
  /** Success rates of simulated novice players (0..1). */
  randomRate: number;
  eagerRate: number;
  lookaheadRate: number;
  /** Number of different first moves that still allow finishing at par. */
  parFirstMoves: number;
  /** States expanded proving optimality. */
  searchNodes: number;
  /** Per-obstacle audit: name -> par when neutralised (null = unsolvable). */
  audit: { obstacle: string; par: number | null }[];
}

export interface LevelDef extends Puzzle {
  /** Permanent id, e.g. "stone-07". Saves and the freeze lock use it. */
  id: string;
  /** Global display number (fixed by the set layout in sets.ts). */
  index: number;
  /** 1-based set number. */
  set: number;
  /** 1-based position within the set. */
  pos: number;
  name: string;
  tip?: string;
  par: number;
  solution: Move[];
  stats: LevelStats;
}
