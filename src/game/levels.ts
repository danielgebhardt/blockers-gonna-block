import type { LevelDef } from '../core/types';
import data from '../levels/levels.json';

export const LEVELS = data as unknown as LevelDef[];
export const levelByIndex = (i: number) => LEVELS.find((l) => l.index === i);
