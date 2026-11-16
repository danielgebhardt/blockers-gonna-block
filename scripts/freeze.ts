/**
 * Freeze shipped levels: pin a hash of every level in levels.json that isn't
 * frozen yet. Existing pins are never changed. The test suite fails if a
 * frozen level is edited, and the generator refuses to touch frozen slots.
 *   npx tsx scripts/freeze.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { levelHash } from '../src/core/levelhash';
import type { LevelDef } from '../src/core/types';

const levelsFile = new URL('../src/levels/levels.json', import.meta.url);
const lockFile = new URL('../src/levels/levels.lock.json', import.meta.url);
const levels: LevelDef[] = JSON.parse(readFileSync(levelsFile, 'utf8'));
const lock: Record<string, string> = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
let added = 0;
for (const l of levels) {
  if (lock[l.index]) continue;
  lock[l.index] = levelHash(l);
  added++;
}
const sorted = Object.fromEntries(Object.entries(lock).sort((a, b) => Number(a[0]) - Number(b[0])));
writeFileSync(lockFile, JSON.stringify(sorted, null, 2) + '\n');
console.log(`froze ${added} level(s); ${Object.keys(sorted).length} frozen in total`);
