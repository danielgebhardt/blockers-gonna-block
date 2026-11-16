/** Saved progress and settings (Capacitor Preferences, localStorage on the web). */
import { setHaptics, storeGet, storeSet } from './platform';

export interface LevelProgress {
  stars: number;
  best: number;
}

export interface SaveData {
  version: 1;
  levels: Record<number, LevelProgress>;
  sound: boolean;
  haptics: boolean;
  /** Tips already shown (by level index). */
  tipsSeen: number[];
}

const KEY = 'bgb.save.v1';

let data: SaveData = { version: 1, levels: {}, sound: true, haptics: true, tipsSeen: [] };

export async function loadSave(): Promise<SaveData> {
  const raw = await storeGet(KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && d.version === 1) data = { ...data, ...d };
    } catch {
      /* corrupt save: start fresh */
    }
  }
  setHaptics(data.haptics);
  return data;
}

export const save = () => data;

export function persist() {
  void storeSet(KEY, JSON.stringify(data));
}

/** Record a clear; keeps the best stars and best move count. Returns true if improved. */
export function recordClear(index: number, stars: number, moves: number): boolean {
  const old = data.levels[index];
  const improved = !old || stars > old.stars || moves < old.best;
  data.levels[index] = { stars: Math.max(old?.stars ?? 0, stars), best: Math.min(old?.best ?? Infinity, moves) };
  persist();
  return improved;
}

export const highestCleared = () => Math.max(0, ...Object.keys(data.levels).map(Number));

/** A level is open if it's within two of the furthest level cleared. */
export const isUnlocked = (index: number) => index <= highestCleared() + 2 || !!data.levels[index];

export const totalStars = () => Object.values(data.levels).reduce((a, l) => a + l.stars, 0);
