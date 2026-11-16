/**
 * Freeze shipped levels: pin a hash of every level in levels.json that isn't
 * frozen yet. Existing pins are never changed. The test suite fails if a
 * frozen level is edited, and the generator refuses to touch frozen slots.
 *   npx tsx scripts/freeze.ts            # every unfrozen level
 *   npx tsx scripts/freeze.ts '^stone-'  # only ids matching
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { levelHash } from '../src/core/levelhash';
import type { LevelDef } from '../src/core/types';

const levelsFile = new URL('../src/levels/levels.json', import.meta.url);
const lockFile = new URL('../src/levels/levels.lock.json', import.meta.url);
const levels: LevelDef[] = JSON.parse(readFileSync(levelsFile, 'utf8'));
const lock: Record<string, string> = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, 'utf8')) : {};
let added = 0;
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
for (const l of levels) {
  if (lock[l.id] || (only && !only.test(l.id))) continue;
  lock[l.id] = levelHash(l);
  added++;
}
const order = new Map(levels.map((l) => [l.id, l.index]));
const sorted = Object.fromEntries(Object.entries(lock).sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0)));
writeFileSync(lockFile, JSON.stringify(sorted, null, 2) + '\n');
console.log(`froze ${added} level(s); ${Object.keys(sorted).length} frozen in total`);
