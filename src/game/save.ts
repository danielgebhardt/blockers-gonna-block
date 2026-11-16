/** Saved progress and settings (Capacitor Preferences, localStorage on the web). */
import { SETS, legacyId, parseId } from '../core/sets';
import { setHaptics, storeGet, storeSet } from './platform';

export interface LevelProgress {
  stars: number;
  best: number;
}

export interface SaveData {
  version: 2;
  /** Keyed by permanent level id (e.g. "stone-07"). */
  levels: Record<string, LevelProgress>;
  sound: boolean;
  haptics: boolean;
  /** Tips already shown (level ids). */
  tipsSeen: string[];
}

const KEY_V1 = 'bgb.save.v1';
const KEY = 'bgb.save.v2';

let data: SaveData = { version: 2, levels: {}, sound: true, haptics: true, tipsSeen: [] };

/** v1 saves were keyed by the first release's level numbers (1..30). */
export function migrateV1(d: {
  levels?: Record<string, LevelProgress>;
  sound?: boolean;
  haptics?: boolean;
  tipsSeen?: number[];
}): SaveData {
  const levels: Record<string, LevelProgress> = {};
  for (const [k, v] of Object.entries(d.levels ?? {})) levels[legacyId(Number(k))] = v;
  return {
    version: 2,
    levels,
    sound: d.sound ?? true,
    haptics: d.haptics ?? true,
    tipsSeen: (d.tipsSeen ?? []).map((i) => legacyId(i)),
  };
}

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await storeGet(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d?.version === 2) data = { ...data, ...d };
    } else {
      const old = await storeGet(KEY_V1);
      if (old) {
        data = migrateV1(JSON.parse(old));
        persist();
      }
    }
  } catch {
    /* corrupt save: start fresh */
  }
  setHaptics(data.haptics);
  return data;
}

export const save = () => data;

export function persist() {
  void storeSet(KEY, JSON.stringify(data));
}

/** Record a clear; keeps the best stars and best move count. */
export function recordClear(id: string, stars: number, moves: number): boolean {
  const old = data.levels[id];
  const improved = !old || stars > old.stars || moves < old.best;
  data.levels[id] = { stars: Math.max(old?.stars ?? 0, stars), best: Math.min(old?.best ?? Infinity, moves) };
  persist();
  return improved;
}

const clearedIn = (progress: Record<string, LevelProgress>, set: number) =>
  Object.keys(progress)
    .map(parseId)
    .filter((p): p is { set: number; pos: number } => !!p && p.set === set);

/** Levels of the previous set you must clear before a set opens. */
export const SET_GATE = 5;

/** A set opens once SET_GATE levels of the set before it are cleared. */
export function isSetOpen(set: number, progress = data.levels): boolean {
  if (set <= 1) return true;
  return clearedIn(progress, set - 1).length >= Math.min(SET_GATE, SETS[set - 2].size);
}

/** Inside an open set, levels open two ahead of the furthest one cleared. */
export function isUnlocked(id: string, progress = data.levels): boolean {
  if (progress[id]) return true;
  const p = parseId(id);
  if (!p || !isSetOpen(p.set, progress)) return false;
  const furthest = Math.max(0, ...clearedIn(progress, p.set).map((c) => c.pos));
  return p.pos <= furthest + 2;
}

export const clearedCount = (set: number) => clearedIn(data.levels, set).length;

export const setStars = (set: number) =>
  Object.entries(data.levels)
    .filter(([id]) => parseId(id)?.set === set)
    .reduce((a, [, l]) => a + l.stars, 0);

export const totalStars = () => Object.values(data.levels).reduce((a, l) => a + l.stars, 0);
