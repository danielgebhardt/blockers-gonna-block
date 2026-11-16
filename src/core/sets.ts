/**
 * The level sets. A level's permanent id is `${key}-${pos}` (pos is 1-based
 * within its set, two digits). Display numbers are fixed by this layout, so
 * they never shift as levels are generated, and saves are keyed by id.
 */
export interface SetDef {
  key: string;
  name: string;
  blurb: string;
  size: number;
}

export const SETS: SetDef[] = [
  { key: 'basics', name: 'Basics', blurb: 'Colours and gates', size: 10 },
  { key: 'stone', name: 'Stonework', blurb: 'Walls and holes', size: 30 },
  { key: 'oneway', name: 'One Way', blurb: 'Blocks on rails', size: 30 },
  { key: 'ice', name: 'Deep Freeze', blurb: 'Ice that thaws', size: 30 },
  { key: 'layers', name: 'Layers', blurb: 'Shells and cores', size: 30 },
  { key: 'shift', name: 'Shifting Gates', blurb: 'Gates that change', size: 30 },
];

export const TOTAL_LEVELS = SETS.reduce((a, s) => a + s.size, 0);

export const levelId = (set: number, pos: number) => `${SETS[set - 1].key}-${String(pos).padStart(2, '0')}`;

/** Global display number (1-based) of a level. */
export function levelNumber(set: number, pos: number): number {
  let n = 0;
  for (let s = 1; s < set; s++) n += SETS[s - 1].size;
  return n + pos;
}

export function parseId(id: string): { set: number; pos: number } | null {
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  if (!m) return null;
  const set = SETS.findIndex((s) => s.key === m[1]) + 1;
  return set ? { set, pos: Number(m[2]) } : null;
}

/** Ids of the first release (30 levels, 6 sets of 5): old index -> id. */
export function legacyId(index: number): string {
  return levelId(Math.floor((index - 1) / 5) + 1, ((index - 1) % 5) + 1);
}
