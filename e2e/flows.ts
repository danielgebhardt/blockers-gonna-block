/**
 * UI flows with real touches on a Pixel 7 viewport:
 *  - undo restores the board and costs a star
 *  - a hint shows the next optimal move and costs a star
 *  - walking into a dead end (found by the solver) triggers the "stuck" warning
 * Saves screenshots to e2e/shots/flow-*.png.
 *
 *   npx tsx e2e/flows.ts
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CDPSession, type Page, chromium, devices } from 'playwright';
import { build, preview } from 'vite';
import { type IMove, applyMove, compile, initialState, legalMoves, toMove } from '../src/core/engine';
import { mulberry32 } from '../src/core/rng';
import { solve } from '../src/core/solver';
import type { LevelDef, Move, Side } from '../src/core/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const levels: LevelDef[] = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8'));
const shots = join(root, 'e2e/shots');
mkdirSync(shots, { recursive: true });
const DIR: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

const info = (page: Page) => page.evaluate(() => (window as any).__bgb.play.info());

async function idle(page: Page) {
  for (let t = 0; t < 200; t++) {
    const i = await info(page);
    if (!i.busy) return i;
    await page.waitForTimeout(50);
  }
  throw new Error('busy');
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}

async function tap(page: Page, cdp: CDPSession, x: number, y: number) {
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(40);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(150);
}

async function drag(page: Page, cdp: CDPSession, lvl: LevelDef, m: Move) {
  const i = await idle(page);
  const path: number[] = await page.evaluate(([b, a]) => (window as any).__bgb.play.path(b, a), [m.b, m.y * lvl.w + m.x]);
  const cell = lvl.blocks[m.b].cells[0];
  let px = i.pos[m.b] % lvl.w;
  let py = Math.floor(i.pos[m.b] / lvl.w);
  let x = i.ox + (px + cell[0] + 0.5) * i.cs;
  let y = i.oy + (py + cell[1] + 0.5) * i.cs;
  await touch(cdp, 'touchStart', x, y);
  for (const a of path.slice(1)) {
    const nx = a % lvl.w;
    const ny = Math.floor(a / lvl.w);
    x += (nx - px) * i.cs;
    y += (ny - py) * i.cs;
    px = nx;
    py = ny;
    await touch(cdp, 'touchMove', x, y);
  }
  if (m.g !== undefined) {
    const [dx, dy] = DIR[lvl.gates[m.g].side];
    for (let k = 1; k <= 5; k++) await touch(cdp, 'touchMove', x + dx * i.cs * 0.25 * k, y + dy * i.cs * 0.25 * k);
  }
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(m.g !== undefined ? 450 : 150);
  await idle(page);
}

/** Find a short sequence of legal moves after which the level is unsolvable. */
function findDeadEnd(lvl: LevelDef): Move[] | null {
  const c = compile(lvl);
  const rng = mulberry32(99);
  for (let attempt = 0; attempt < 400; attempt++) {
    let s = initialState(c);
    const seq: IMove[] = [];
    for (let k = 0; k < 5; k++) {
      const moves = legalMoves(c, s);
      const exits = moves.filter((m) => m.g >= 0);
      const pool = exits.length && rng() < 0.8 ? exits : moves;
      const m = pool[Math.floor(rng() * pool.length)];
      s = applyMove(c, s, m);
      seq.push(m);
      const r = solve(c, s, { maxNodes: 200_000 });
      if (r.solvable === false) return seq.map((x) => toMove(c, x));
    }
  }
  return null;
}

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
  console.log('✓ ' + msg);
}

async function open(ctx: any, url: string, index: number) {
  const page: Page = await ctx.newPage();
  await page.goto(`${url}?level=${index}`);
  await page.waitForFunction(() => (window as any).__bgb?.play?.info().index > 0, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => (window as any).__bgb.play.closeOverlay());
  const cdp = await ctx.newCDPSession(page);
  return { page, cdp };
}

async function main() {
  if (!process.env.E2E_NO_BUILD) await build({ root, logLevel: 'error' });
  const server = await preview({ root, preview: { port: 4323, strictPort: false }, logLevel: 'error' });
  const url = server.resolvedUrls!.local[0];
  const exe = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  let ok = true;
  try {
    // --- undo
    {
      const lvl = levels[0];
      const { page, cdp } = await open(ctx, url, lvl.index);
      await drag(page, cdp, lvl, lvl.solution[0]);
      let i = await info(page);
      check(i.moves === 1, 'a drag counts as one move');
      await tap(page, cdp, i.buttons.undo[0], i.buttons.undo[1]);
      await page.waitForTimeout(300);
      i = await info(page);
      check(i.moves === 0 && i.usedUndo, 'undo takes the move back');
      check(i.stars === 2, 'undo costs a star (3 → 2 max)');
      // --- hint
      await tap(page, cdp, i.buttons.hint[0], i.buttons.hint[1]);
      await page.waitForTimeout(700);
      i = await info(page);
      check(i.hintShown && i.usedHint, 'hint shows the next move');
      check(i.stars === 1, 'hint costs a star too');
      await page.screenshot({ path: join(shots, 'flow-hint.png') });
      await page.close();
    }
    // --- stuck detection on a shifting-gate level
    for (const lvl of levels.filter((l) => l.set === 6)) {
      const dead = findDeadEnd(lvl);
      if (!dead) continue;
      const { page, cdp } = await open(ctx, url, lvl.index);
      for (const m of dead) await drag(page, cdp, lvl, m);
      await page.waitForTimeout(1500);
      const i = await info(page);
      check(/No way out/.test(i.toast), `level ${lvl.index}: dead end after ${dead.length} moves is reported`);
      await page.screenshot({ path: join(shots, 'flow-stuck.png') });
      await tap(page, cdp, i.buttons.undo[0], i.buttons.undo[1]);
      await page.waitForTimeout(400);
      check(!(await info(page)).toast, 'undo clears the warning');
      await page.close();
      break;
    }
  } catch (e) {
    ok = false;
    console.log('✗ ' + (e as Error).message);
  }
  await browser.close();
  await server.close();
  process.exit(ok ? 0 : 1);
}

main();
