/**
 * Plays shipped levels like a person would: Pixel 7 viewport, real touch
 * drags (CDP touch events, cell by cell along the block's route), then checks
 * the board is cleared in exactly `par` moves. Takes screenshots on the way.
 *
 *   npx tsx e2e/play.ts                 # every level
 *   npx tsx e2e/play.ts 1 6 11          # some levels
 *   npx tsx e2e/play.ts --shots 1,2,6   # screenshots only for these
 *
 * Needs a Chromium: uses PW_CHROMIUM or /opt/pw-browsers/chromium if present.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CDPSession, type Page, chromium, devices } from 'playwright';
import { build, preview } from 'vite';
import type { LevelDef, Side } from '../src/core/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const levels: LevelDef[] = JSON.parse(readFileSync(join(root, 'src/levels/levels.json'), 'utf8'));
const shotsDir = join(root, 'e2e/shots');
mkdirSync(shotsDir, { recursive: true });

const args = process.argv.slice(2);
const shotsArg = args.indexOf('--shots');
const shotSet = new Set(shotsArg >= 0 ? args[shotsArg + 1].split(',').map(Number) : []);
const only = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== '--shots').map(Number);
const todo = only.length ? levels.filter((l) => only.includes(l.index)) : levels;

interface Info {
  index: number;
  w: number;
  h: number;
  cs: number;
  ox: number;
  oy: number;
  moves: number;
  won: boolean;
  busy: boolean;
  overlay: boolean;
  pos: number[];
  layer: number[];
}

const info = (page: Page) => page.evaluate(() => (window as any).__bgb.play.info() as Info);

async function waitIdle(page: Page) {
  for (let t = 0; t < 100; t++) {
    const i = await info(page);
    if (!i.busy) return i;
    await page.waitForTimeout(50);
  }
  throw new Error('board stayed busy');
}

async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }],
  });
}

const DIR: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

/** Drag block b along its route to anchor (x, y), then out through gate g if given. */
async function dragMove(page: Page, cdp: CDPSession, lvl: LevelDef, m: { b: number; x: number; y: number; g?: number }) {
  const i = await waitIdle(page);
  const a = m.y * lvl.w + m.x;
  const path: number[] | null = await page.evaluate(([b, a]) => (window as any).__bgb.play.path(b, a), [m.b, a]);
  if (!path) throw new Error(`no drag path for ${JSON.stringify(m)}`);
  const cell = lvl.blocks[m.b].cells[0];
  const from = i.pos[m.b];
  const fx = from % lvl.w;
  const fy = Math.floor(from / lvl.w);
  // finger on the block's first cell, a little off-centre like a real thumb
  let x = i.ox + (fx + cell[0] + 0.45) * i.cs;
  let y = i.oy + (fy + cell[1] + 0.55) * i.cs;
  await touch(cdp, 'touchStart', x, y);
  await page.waitForTimeout(30);
  let px = fx;
  let py = fy;
  for (const step of path.slice(1)) {
    const sx = step % lvl.w;
    const sy = Math.floor(step / lvl.w);
    const dx = (sx - px) * i.cs;
    const dy = (sy - py) * i.cs;
    for (let k = 1; k <= 2; k++) await touch(cdp, 'touchMove', x + (dx * k) / 2, y + (dy * k) / 2);
    x += dx;
    y += dy;
    px = sx;
    py = sy;
    await page.waitForTimeout(12);
  }
  if (m.g !== undefined) {
    const [ddx, ddy] = DIR[lvl.gates[m.g].side];
    for (let k = 1; k <= 6; k++) await touch(cdp, 'touchMove', x + ddx * i.cs * 0.2 * k, y + ddy * i.cs * 0.2 * k);
  }
  await touch(cdp, 'touchEnd', x, y);
  await page.waitForTimeout(m.g !== undefined ? 340 : 120);
}

async function main() {
  // test the production build, like the APK ships it
  if (!process.env.E2E_NO_BUILD) await build({ root, logLevel: 'error' });
  const server = await preview({ root, preview: { port: 4321, strictPort: false }, logLevel: 'error' });
  const url = server.resolvedUrls!.local[0];
  const exe = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const dbg = (m: string) => process.env.E2E_DEBUG && console.log(m);
  dbg('server ' + url);
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  dbg('browser');
  // Pixel 7 viewport and touch; full device pixel ratio only when screenshots are wanted
  // (software GL in CI is slow at 2.6x)
  const ctx = await browser.newContext({ ...devices['Pixel 7'], ...(shotSet.size ? {} : { deviceScaleFactor: 1 }) });
  dbg('context');
  let failures = 0;
  for (const lvl of todo) {
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (process.env.E2E_DEBUG) console.log('open', url, lvl.index);
    await page.goto(`${url}?level=${lvl.index}`);
    await page.waitForFunction(() => (window as any).__bgb?.play?.info().index > 0, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const shoot = shotSet.has(lvl.index);
    if (shoot && lvl.tip) await page.screenshot({ path: join(shotsDir, `L${String(lvl.index).padStart(2, '0')}-tip.png`) });
    await page.evaluate(() => (window as any).__bgb.play.closeOverlay());
    if (shoot) await page.screenshot({ path: join(shotsDir, `L${String(lvl.index).padStart(2, '0')}-start.png`) });
    const cdp = await ctx.newCDPSession(page);
    const t0 = Date.now();
    try {
      for (let k = 0; k < lvl.solution.length; k++) {
        await dragMove(page, cdp, lvl, lvl.solution[k]);
        const now = await waitIdle(page);
        if (now.moves !== k + 1) throw new Error(`move ${k + 1} not registered (moves=${now.moves})`);
        if (shoot && k === Math.floor(lvl.solution.length / 2))
          await page.screenshot({ path: join(shotsDir, `L${String(lvl.index).padStart(2, '0')}-mid.png`) });
      }
      await page.waitForTimeout(1500);
      const end = await info(page);
      if (!end.won) throw new Error('board not cleared');
      if (end.moves !== lvl.par) throw new Error(`took ${end.moves}, par ${lvl.par}`);
      if (shoot) await page.screenshot({ path: join(shotsDir, `L${String(lvl.index).padStart(2, '0')}-win.png`) });
      if (errors.length) throw new Error('page errors: ' + errors.join('; '));
      console.log(`✓ level ${lvl.index} cleared in ${end.moves} drags (par ${lvl.par}) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
      failures++;
      console.log(`✗ level ${lvl.index}: ${(e as Error).message}`);
      await page.screenshot({ path: join(shotsDir, `FAIL-L${lvl.index}.png`) });
    }
    await page.close();
  }
  await browser.close();
  await server.close();
  process.exit(0);
  if (failures) {
    console.log(`${failures} level(s) failed`);
    process.exit(1);
  }
}

main();
