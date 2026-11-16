/** Polyomino catalogue used by the level generator. */
export type Cells = [number, number][];

export function normalise(cells: Cells): Cells {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]) => [x - mx, y - my] as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export const shapeKey = (cells: Cells) => normalise(cells).map((c) => c.join(',')).join(';');

function variants(cells: Cells): Cells[] {
  const out = new Map<string, Cells>();
  let cur = cells;
  for (let r = 0; r < 4; r++) {
    cur = cur.map(([x, y]) => [-y, x] as [number, number]);
    for (const v of [cur, cur.map(([x, y]) => [-x, y] as [number, number])]) {
      const n = normalise(v);
      out.set(shapeKey(n), n);
    }
  }
  return [...out.values()];
}

const BASE: Record<string, Cells> = {
  mono: [[0, 0]],
  domino: [
    [0, 0],
    [1, 0],
  ],
  I3: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  V3: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  O4: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  L4: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  T4: [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
  S4: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  I4: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  R6: [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
};

export interface ShapeFamily {
  name: string;
  variants: Cells[];
}

export const FAMILIES: ShapeFamily[] = Object.entries(BASE).map(([name, cells]) => ({
  name,
  variants: variants(cells),
}));

export const family = (name: string) => FAMILIES.find((f) => f.name === name)!;

export function familyOf(cells: Cells): string {
  const k = shapeKey(cells);
  for (const f of FAMILIES) if (f.variants.some((v) => shapeKey(v) === k)) return f.name;
  return 'custom';
}
