import type { LevelDef } from '../core/types';
import data from '../levels/levels.json';

/** Shipped levels in play order. */
export const LEVELS = (data as unknown as LevelDef[]).slice().sort((a, b) => a.index - b.index);
export const levelById = (id: string) => LEVELS.find((l) => l.id === id);
export const levelByIndex = (i: number) => LEVELS.find((l) => l.index === i);
export const levelsInSet = (set: number) => LEVELS.filter((l) => l.set === set);
/** The next shipped level after this one, in play order. */
export const nextLevel = (l: LevelDef) => LEVELS.find((x) => x.index > l.index);
