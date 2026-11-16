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
  /** 1-based level number. */
  index: number;
  /** 1-based set number (6 sets of 5). */
  set: number;
  name: string;
  tip?: string;
  par: number;
  solution: Move[];
  stats: LevelStats;
}
