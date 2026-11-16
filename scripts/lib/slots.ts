/**
 * The 160 level slots: board size, what may appear, and how hard it must be.
 *
 * Sets: Basics (10), then 30 each of Stonework, One Way, Deep Freeze, Layers,
 * Shifting Gates. Positions 1-5 of each set are the first release (frozen).
 * Later positions come in waves of five that ramp like the first five, with a
 * small bump per wave, and increasingly mix in obstacles from earlier sets.
 */
import { SETS, levelId, levelNumber } from '../../src/core/sets';
import { fnv1a, mulberry32 } from '../../src/core/rng';
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
  id: string;
  index: number;
  set: number;
  pos: number;
  name: string;
  tip?: string;
  spec: Spec;
  targets: Targets;
  /** Climbs to run, iterations each. */
  climbs: number;
  iters: number;
}

const NAMES: Record<string, string[]> = {
  basics: ['Opening Moves', 'Traffic Jam', 'Elbow Room', 'Gridlock', 'The Long Way Round',
    'Bottleneck', 'Tight Squeeze', 'Shuffle', 'Pile-Up', 'Knot'],
  stone: ['Pillars', 'Bitten Box', 'Courtyard', 'Keyhole', 'Fortress',
    'Rubble', 'Quarry', 'Cloister', 'Hedge Maze', 'Ruins', 'Bastion', 'Moat', 'Crypt', 'Archway', 'Cairn',
    'Battlements', 'Gatehouse', 'Labyrinth', 'Flagstones', 'Monolith', 'Rampart', 'Catacombs', 'Masonry',
    'Dry Stone', 'Henge', 'Ziggurat', 'Keep', 'Portcullis', 'Cornerstone', 'Citadel'],
  oneway: ['Tramlines', 'Cross Traffic', 'Rails', 'Junction', 'Switchyard',
    'Sidings', 'Monorail', 'Points', 'Shunting', 'Level Crossing', 'Turntable', 'Freight', 'Signal Box',
    'Branch Line', 'Gauge', 'Sleeper', 'Express', 'Roundhouse', 'Coupling', 'Viaduct', 'Buffers', 'Loop Line',
    'Marshalling Yard', 'Cable Car', 'Funicular', 'Conveyor', 'Lanes', 'Zip Line', 'Escalator', 'Terminus'],
  ice: ['Cold Start', 'Thaw', 'Permafrost', 'Ice Queue', 'Glacier',
    'Frostbite', 'Icicle', 'Hailstorm', 'Snowdrift', 'Black Ice', 'Floe', 'Tundra', 'Rime', 'Sleet',
    'Cold Snap', 'Iceberg', 'Avalanche', 'Blizzard', 'Hoarfrost', 'Polar Night', 'Meltwater', 'Igloo',
    'Snowplough', 'Crevasse', 'Ice Shelf', 'Whiteout', 'Frozen Lake', 'Deep Winter', 'Ice Breaker', 'Absolute Zero'],
  layers: ['Onion', 'Shell Game', 'Peel Order', 'Nesting', 'Matryoshka',
    'Husk', 'Zest', 'Nutshell', 'Pearl', 'Geode', 'Chrysalis', 'Eggshell', 'Artichoke', 'Kernel', 'Seed',
    'Bark', 'Rind', 'Cocoon', 'Wrapper', 'Gift Box', 'Gobstopper', 'Jawbreaker', 'Bonbon', 'Layer Cake',
    'Strata', 'Sediment', 'Parfait', 'Lasagne', 'Mille-Feuille', 'Core Memory'],
  shift: ['Turnstile', 'Carousel', 'Tidewater', 'Clockwork', 'Grand Rehearsal',
    'Revolving Door', 'Kaleidoscope', 'Lighthouse', 'Metronome', 'Pendulum', 'Tides', 'Seasons',
    'Traffic Lights', 'Merry-Go-Round', 'Rotation', 'Sundial', 'Moon Phases', 'Prism', 'Chameleon',
    'Mood Ring', 'Ferris Wheel', 'Spin Cycle', 'Roulette', 'Weathervane', 'Hourglass', 'Orbit', 'Equinox',
    'Perpetual Motion', 'Full Circle', 'Encore'],
};

const TIPS: Record<string, string> = {
  basics: 'Drag a block to slide it. Push it into a gate of the same colour to send it out. It has to fit: the gate must be at least as wide as the block. Clear the box in as few moves as you can. Dragging the same block again still counts as one move.',
  stone: 'Stone pillars and missing floor never move. Plan your routes around them.',
  oneway: 'Striped blocks with arrows only slide one way: left/right or up/down. They can only leave through a gate in that direction.',
  ice: 'Frozen blocks can’t move. Every block that leaves the box chips the ice down by one. The number shows how many more exits it needs.',
  layers: 'Layered blocks: send one out through its outer colour and only the shell leaves. The core stays where it stopped and needs its own gate.',
  shift: 'Shifting gates change colour every time a block leaves. The dots show the order of colours.',
};

const SHAPES_ALL = { mono: 1, domino: 3, I3: 2, V3: 2, O4: 1.2, L4: 1.2, T4: 1, S4: 0.6, I4: 0.4 };
const SHAPE_PALETTES: Record<string, number>[] = [
  SHAPES_ALL,
  { mono: 2, domino: 4, I3: 2, V3: 3, O4: 0.5, L4: 0.5 }, // small pieces, many of them
  { domino: 2, I3: 1, O4: 2, L4: 2, T4: 2, S4: 1, I4: 1 }, // chunky
  { domino: 3, I3: 3, I4: 2, L4: 1, V3: 1 }, // long pieces
  { mono: 1, domino: 2, V3: 3, L4: 2, T4: 2, S4: 1 }, // bendy
];

/** Base targets by position within a wave (0..4); `set` is 0-based. */
function targets(pos: number, set: number, keyAt: Targets['keyAt'], wave = 0): Targets {
  const ramp = Math.min(set, 4) * 0.5; // later sets a bit tougher
  const bump = Math.min(wave, 4); // later waves a bit tougher, in the same band
  return {
    minPar: [9, 11, 12, 13, 14][pos] + Math.floor(ramp) + Math.floor(bump / 2),
    maxPar: [16, 19, 21, 24, 27][pos] + Math.floor(ramp) + bump,
    maxRepos: [6, 8, 9, 11, 12][pos] + (set >= 2 ? 1 : 0) + bump,
    maxSetup: [4, 5, 6, 7, 8][pos] + Math.floor(bump / 2),
    minRepos: [3, 4, 5, 5, 6][pos] + (set >= 2 ? 1 : 0) + Math.floor(bump / 2),
    minSetup: [2, 2, 3, 3, 4][pos],
    maxLook: [0.45, 0.32, 0.22, 0.14, 0.08][pos] - set * 0.01,
    maxEager: [0.15, 0.1, 0.06, 0.04, 0.02][pos],
    maxParFirst: [6, 6, 5, 5, 4][pos],
    keyAt,
  };
}

type SpecBody = Omit<Spec, 'index'>;

/** The first release: positions 1-5 of every set (frozen; kept for reference). */
const FIRST: SpecBody[][] = [
  [
    { w: 5, h: 6, colors: 3, blocks: [7, 9], shapes: { mono: 1, domino: 3, I3: 2, V3: 2, O4: 1 } },
    { w: 5, h: 7, colors: 3, blocks: [8, 10], shapes: SHAPES_ALL },
    { w: 6, h: 6, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL },
    { w: 6, h: 7, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL },
    { w: 6, h: 8, colors: 4, blocks: [10, 13], shapes: SHAPES_ALL },
  ],
  [
    { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, walls: [1, 3] },
    { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, voids: [2, 5] },
    { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, walls: [1, 3], voids: [0, 3] },
    { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, walls: [2, 4], voids: [0, 4] },
    { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, walls: [1, 4], voids: [2, 6] },
  ],
  [
    { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, oneway: [2, 3] },
    { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, oneway: [2, 4] },
    { w: 6, h: 7, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, oneway: [3, 5] },
    { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, oneway: [3, 5], walls: [0, 2] },
    { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, oneway: [3, 6], voids: [0, 3] },
  ],
  [
    { w: 5, h: 7, colors: 3, blocks: [7, 10], shapes: SHAPES_ALL, ice: [1, 2] },
    { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, ice: [2, 3] },
    { w: 6, h: 7, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, ice: [2, 3], oneway: [0, 1] },
    { w: 6, h: 8, colors: 4, blocks: [9, 12], shapes: SHAPES_ALL, ice: [2, 4], walls: [0, 2] },
    { w: 7, h: 8, colors: 5, blocks: [10, 13], shapes: SHAPES_ALL, ice: [3, 4], oneway: [0, 2] },
  ],
  [
    { w: 5, h: 7, colors: 3, blocks: [7, 9], shapes: SHAPES_ALL, layered: [1, 2] },
    { w: 6, h: 7, colors: 4, blocks: [8, 10], shapes: SHAPES_ALL, layered: [2, 3] },
    { w: 6, h: 7, colors: 4, blocks: [8, 11], shapes: SHAPES_ALL, layered: [2, 3], ice: [0, 1] },
    { w: 6, h: 8, colors: 4, blocks: [9, 11], shapes: SHAPES_ALL, layered: [2, 4], oneway: [0, 2] },
    { w: 6, h: 8, colors: 4, blocks: [10, 12], shapes: SHAPES_ALL, layered: [2, 3], walls: [0, 2] },
  ],
  [
    { w: 5, h: 6, colors: 3, blocks: [6, 8], shapes: SHAPES_ALL, shifting: [1, 1] },
    { w: 6, h: 6, colors: 4, blocks: [7, 9], shapes: SHAPES_ALL, shifting: [1, 2] },
    { w: 6, h: 7, colors: 4, blocks: [7, 10], shapes: SHAPES_ALL, shifting: [1, 2], ice: [1, 1], oneway: [0, 2] },
    { w: 6, h: 7, colors: 4, blocks: [8, 10], shapes: SHAPES_ALL, shifting: [1, 2], layered: [1, 2], walls: [0, 2] },
    { w: 6, h: 8, colors: 5, blocks: [8, 11], shapes: SHAPES_ALL, shifting: [1, 2], layered: [1, 1], ice: [1, 1], oneway: [1, 2], voids: [0, 3] },
  ],
];

/** Board sizes per set for new levels (portrait phone friendly). */
const SIZES: [number, number][][] = [
  [[5, 6], [5, 7], [6, 6], [6, 7], [6, 8]],
  [[5, 7], [6, 6], [6, 7], [6, 8], [7, 7], [7, 8]],
  [[5, 7], [6, 6], [6, 7], [6, 8], [7, 7], [7, 8]],
  [[5, 7], [6, 6], [6, 7], [6, 8], [7, 7], [7, 8]],
  [[5, 7], [6, 6], [6, 7], [6, 8]], // layers: big boards came out too easy
  [[5, 6], [5, 7], [6, 6], [6, 7]], // shifting: keep the exact search tractable
];

/** The obstacle each set introduces, as a spec fragment. */
function ownObstacle(set: number, wave: number, rng: () => number): Partial<SpecBody> {
  const w = Math.min(wave, 4);
  switch (set) {
    case 2: {
      const r = rng();
      if (r < 0.35) return { walls: [2, 4 + (w >> 1)] };
      if (r < 0.65) return { voids: [3, 6 + w] };
      return { walls: [1, 3], voids: [2, 5] };
    }
    case 3:
      return { oneway: [2 + (w >> 2), 4 + (w >> 1)] };
    case 4:
      return { ice: [1 + (w >> 2), 3 + (w >> 1)] };
    case 5:
      return { layered: [1 + (w >> 2), 3] };
    case 6:
      return { shifting: [1, 2] };
  }
  return {};
}

/** Earlier sets' obstacles mixed in (each must still matter: the audit checks). */
function mixes(set: number, wave: number, rng: () => number): Partial<SpecBody> {
  const pool = [2, 3, 4, 5].filter((s) => s < set);
  if (!pool.length || wave === 0) return {};
  const chance = [0, 0.45, 0.65, 0.75, 0.85, 0.9][Math.min(wave, 5)];
  let n = rng() < chance ? 1 : 0;
  if (n && wave >= 3 && rng() < 0.4) n = 2;
  const out: Partial<SpecBody> = {};
  for (const s of pool.sort(() => rng() - 0.5).slice(0, n)) {
    if (s === 2) Object.assign(out, rng() < 0.5 ? { walls: [1, 3] } : { voids: [2, 4] });
    if (s === 3) out.oneway = [1, 2];
    if (s === 4) out.ice = [1, 2];
    if (s === 5) out.layered = [1, 2];
  }
  return out;
}

function newSpec(set: number, pos: number): SpecBody {
  const rng = mulberry32(parseInt(fnv1a(levelId(set, pos)), 16));
  const wave = Math.floor((pos - 1) / 5);
  const p = (pos - 1) % 5;
  const sizes = SIZES[set - 1];
  // bigger boards toward the end of a wave, with some randomness
  const k = Math.min(sizes.length - 1, Math.max(0, Math.round((p / 4) * (sizes.length - 1) + (rng() - 0.5) * 2)));
  const [w, h] = sizes[k];
  const area = w * h;
  const lo = Math.round(area / (set === 6 ? 5.2 : 4.6));
  const colors = Math.min(set === 5 || set === 6 ? 4 : 5, 3 + (area >= 36 ? 1 : 0) + (area >= 49 ? 1 : 0));
  return {
    w,
    h,
    colors,
    blocks: [lo, lo + 3],
    shapes: SHAPE_PALETTES[Math.floor(rng() * SHAPE_PALETTES.length)],
    ...mixes(set, wave, rng),
    ...ownObstacle(set, wave, rng),
  };
}

const KEYS: Targets['keyAt'][] = ['early', 'any', 'late'];

export const SLOTS: Slot[] = SETS.flatMap((setDef, si) => {
  const set = si + 1;
  return Array.from({ length: setDef.size }, (_, k) => {
    const pos = k + 1;
    const id = levelId(set, pos);
    const index = levelNumber(set, pos);
    const wave = Math.floor((pos - 1) / 5);
    const body = pos <= 5 ? FIRST[si][pos - 1] : newSpec(set, pos);
    const keyAt = pos <= 5 ? (['early', 'any', 'late', 'any', 'late'] as const)[pos - 1] : KEYS[(pos + set) % 3];
    const heavy = set >= 5 || !!body.layered || !!body.shifting;
    return {
      id,
      index,
      set,
      pos,
      name: NAMES[setDef.key][pos - 1],
      tip: pos === 1 ? TIPS[setDef.key] : undefined,
      spec: { index, ...body },
      targets: targets((pos - 1) % 5, si, keyAt, wave),
      climbs: 4,
      iters: set === 6 ? 300 : heavy ? 380 : 450,
    };
  });
});

export const slotById = (id: string) => SLOTS.find((s) => s.id === id);
