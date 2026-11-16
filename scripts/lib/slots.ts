/**
 * The 30 level slots: board size, what may appear, and how hard it must be.
 * Difficulty ramps inside every set of five and a little from set to set.
 */
import type { Spec } from './construct';

export interface Targets {
  minPar: number;
  maxPar: number;
  maxRepos: number;
  maxSetup: number;
  minRepos: number;
  minSetup: number;
  /** Max success rate of the one-move-lookahead novice. */
  maxLook: number;
  /** Max success rate of the eager novice. */
  maxEager: number;
  /** Max number of first moves that keep par reachable. */
  maxParFirst: number;
  /** Preferred position of the key moment (fraction of the solution). */
  keyAt: 'early' | 'late' | 'any';
}

export interface Slot {
  index: number;
  set: number;
  name: string;
  tip?: string;
  spec: Spec;
  targets: Targets;
  /** Climbs to run, iterations each. */
  climbs: number;
  iters: number;
}

export const SET_NAMES = ['Basics', 'Stonework', 'One Way', 'Deep Freeze', 'Layers', 'Shifting Gates'];

const NAMES = [
  // basics
  'Opening Moves', 'Traffic Jam', 'Elbow Room', 'Gridlock', 'The Long Way Round',
  // walls / holes
  'Pillars', 'Bitten Box', 'Courtyard', 'Keyhole', 'Fortress',
  // one-way
  'Tramlines', 'Cross Traffic', 'Rails', 'Junction', 'Switchyard',
  // ice
  'Cold Start', 'Thaw', 'Permafrost', 'Ice Queue', 'Glacier',
  // layers
  'Onion', 'Shell Game', 'Peel Order', 'Nesting', 'Matryoshka',
  // shifting + mix
  'Turnstile', 'Carousel', 'Tidewater', 'Clockwork', 'Grand Finale',
];

const TIPS: Record<number, string> = {
  1: 'Drag a block to slide it. Push it into a gate of the same colour to send it out. It has to fit: the gate must be at least as wide as the block. Clear the box in as few moves as you can.',
  6: 'Stone pillars and missing floor never move. Plan your routes around them.',
  11: 'Striped blocks with arrows only slide one way: left/right or up/down. They can only leave through a gate in that direction.',
  16: 'Frozen blocks can’t move. Every block that leaves the box chips the ice down by one. The number shows how many more exits it needs.',
  21: 'Layered blocks: send one out through its outer colour and only the shell leaves. The core stays where it stopped and needs its own gate.',
  26: 'Shifting gates change colour every time a block leaves. The dots show the order of colours.',
};

const SHAPES_ALL = { mono: 1, domino: 3, I3: 2, V3: 2, O4: 1.2, L4: 1.2, T4: 1, S4: 0.6, I4: 0.4 };

/** Base targets by position within the set (0..4). */
function targets(pos: number, set: number, keyAt: Targets['keyAt']): Targets {
  const ramp = Math.min(set, 4) * 0.5; // later sets a bit tougher
  return {
    minPar: [9, 11, 12, 13, 14][pos] + Math.floor(ramp),
    maxPar: [16, 19, 21, 24, 27][pos] + Math.floor(ramp),
    maxRepos: [6, 8, 9, 11, 12][pos] + (set >= 2 ? 1 : 0),
    maxSetup: [4, 5, 6, 7, 8][pos],
    minRepos: [3, 4, 5, 5, 6][pos] + (set >= 2 ? 1 : 0),
    minSetup: [2, 2, 3, 3, 4][pos],
    maxLook: [0.45, 0.32, 0.22, 0.14, 0.08][pos] - set * 0.01,
    maxEager: [0.15, 0.1, 0.06, 0.04, 0.02][pos],
    maxParFirst: [6, 6, 5, 5, 4][pos],
    keyAt,
  };
}

type Partial2 = Omit<Spec, 'index'>;

function slot(index: number, spec: Partial2, keyAt: Targets['keyAt'] = 'any', climbs = 6, iters = index > 25 ? 320 : 480): Slot {
  const set = Math.floor((index - 1) / 5) + 1;
  const pos = (index - 1) % 5;
  return {
    index,
    set,
    name: NAMES[index - 1],
    tip: TIPS[index],
    spec: { index, ...spec },
    targets: targets(pos, set - 1, keyAt),
    climbs,
    iters,
  };
}

export const SLOTS: Slot[] = [
  // ---- 1-5 basics
  slot(1, { w: 5, h: 6, colors: 3, blocks: [7, 9], shapes: { mono: 1, domino: 3, I3: 2, V3: 2, O4: 1 } }, 'early'),
  slot(2, { w: 5, h: 7, colors: 3, blocks: [8, 10], shapes: SHAPES_ALL }, 'any'),
  slot(3, { w: 6, h: 6, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL }, 'late'),
  slot(4, { w: 6, h: 7, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL }, 'any'),
  slot(5, { w: 6, h: 8, colors: 4, blocks: [10, 13], shapes: SHAPES_ALL }, 'late'),
  // ---- 6-10 walls and non-rectangular boards
  slot(6, { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, walls: [1, 3] }, 'early'),
  slot(7, { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, voids: [2, 5] }, 'any'),
  slot(8, { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, walls: [1, 3], voids: [0, 3] }, 'late'),
  slot(9, { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, walls: [2, 4], voids: [0, 4] }, 'any'),
  slot(10, { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, walls: [1, 4], voids: [2, 6] }, 'late'),
  // ---- 11-15 one-way blocks
  slot(11, { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, oneway: [2, 3] }, 'early'),
  slot(12, { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, oneway: [2, 4] }, 'any'),
  slot(13, { w: 6, h: 7, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, oneway: [3, 5] }, 'late'),
  slot(14, { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, oneway: [3, 5], walls: [0, 2] }, 'any'),
  slot(15, { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, oneway: [3, 6], voids: [0, 3] }, 'late'),
  // ---- 16-20 frozen blocks
  slot(16, { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, ice: [1, 2] }, 'early'),
  slot(17, { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, ice: [2, 3] }, 'late'),
  slot(18, { w: 6, h: 7, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, ice: [2, 3], oneway: [0, 1] }, 'any'),
  slot(19, { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, ice: [2, 4], walls: [0, 2] }, 'late'),
  slot(20, { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, ice: [3, 4], oneway: [0, 2] }, 'any'),
  // ---- 21-25 layered blocks
  slot(21, { w: 5, h: 7, colors: 3, blocks: [7, 9], shapes: SHAPES_ALL, layered: [1, 2] }, 'early'),
  slot(22, { w: 6, h: 7, colors: 4, blocks: [8, 10], shapes: SHAPES_ALL, layered: [2, 3] }, 'any'),
  slot(23, { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, layered: [2, 3], ice: [0, 1] }, 'late'),
  slot(24, { w: 6, h: 8, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, layered: [2, 4], oneway: [0, 2] }, 'any'),
  slot(25, { w: 6, h: 8, colors: 4, blocks: [10, 12], shapes: SHAPES_ALL, layered: [2, 3], walls: [0, 2] }, 'late'),
  // ---- 26-30 shifting gates + everything
  slot(26, { w: 5, h: 6, colors: 3, blocks: [6, 8], shapes: SHAPES_ALL, shifting: [1, 1] }, 'any'),
  slot(27, { w: 6, h: 6, colors: 4, blocks: [7, 9], shapes: SHAPES_ALL, shifting: [1, 2] }, 'late'),
  slot(28, { w: 6, h: 7, colors: 4, blocks: [7, 10], shapes: SHAPES_ALL, shifting: [1, 2], ice: [1, 1], oneway: [0, 2] }, 'any'),
  slot(29, { w: 6, h: 7, colors: 4, blocks: [8, 10], shapes: SHAPES_ALL, shifting: [1, 2], layered: [1, 2], walls: [0, 2] }, 'late'),
  slot(30, { w: 6, h: 8, colors: 5, blocks: [8, 11], shapes: SHAPES_ALL, shifting: [1, 2], layered: [1, 1], ice: [1, 1], oneway: [1, 2], voids: [0, 3] }, 'any'),
];
