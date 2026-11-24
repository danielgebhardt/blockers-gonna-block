/**
 * On-device diagnostics, off by default. A DOM panel (not drawn by Phaser, so it
 * keeps updating even if the canvas stops repainting) showing the game loop,
 * tweens, the dragged block, input and any errors.
 *
 * Turn on: open the page with ?debug, or tap the top-left corner 5 times quickly
 * (works in the Home Screen app, where there is no address bar). The choice is
 * remembered; tap 5 times again to turn it off.
 */
import type Phaser from 'phaser';

const KEY = 'bgb-debug';
const errors: string[] = [];

function record(msg: string) {
  errors.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (errors.length > 6) errors.shift();
}

// Capture errors from the very start, whether or not the panel is shown.
window.addEventListener('error', (e) => record(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
window.addEventListener('unhandledrejection', (e) => record(`promise: ${String((e as PromiseRejectionEvent).reason)}`));

// Count page-level events that differ between a Safari tab and a Home Screen web app.
const counts: Record<string, number> = {};
const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
for (const ev of ['resize', 'orientationchange', 'blur', 'focus', 'pageshow', 'pagehide', 'scroll'])
  window.addEventListener(ev, () => bump(ev), { passive: true });
document.addEventListener('visibilitychange', () => bump(`vis-${document.visibilityState}`));
window.visualViewport?.addEventListener('resize', () => bump('vv-resize'));
for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointercancel'])
  window.addEventListener(ev, () => bump(ev), { passive: true, capture: true });

let panel: HTMLPreElement | null = null;
let timer = 0;

const on = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

function setOn(v: boolean, game: Phaser.Game) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (v) show(game);
  else hide();
}

function hide() {
  clearInterval(timer);
  panel?.remove();
  panel = null;
}

const n = (v: unknown, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : String(v));

function show(game: Phaser.Game) {
  if (panel) return;
  panel = document.createElement('pre');
  panel.style.cssText =
    'position:fixed;left:4px;right:4px;bottom:calc(4px + env(safe-area-inset-bottom,0px));z-index:9;margin:0;padding:6px;' +
    'font:10px/1.3 ui-monospace,Menlo,monospace;color:#cfe;background:rgba(0,0,0,.72);border-radius:6px;' +
    'pointer-events:none;white-space:pre-wrap;word-break:break-all;max-height:42vh;overflow:hidden';
  document.body.appendChild(panel);
  let lastFrame = 0;
  let lastT = performance.now();
  let fps = 0;
  const tick = () => {
    if (!panel) return;
    const loop = game.loop;
    const now = performance.now();
    fps = ((loop.frame - lastFrame) * 1000) / Math.max(1, now - lastT);
    lastFrame = loop.frame;
    lastT = now;
    const canvas = game.canvas;
    const r = game.renderer as unknown as { type: number; contextLost?: boolean; gl?: WebGLRenderingContext };
    const scenes = game.scene.getScenes(true).map((s) => s.scene.key);
    const standalone =
      (navigator as unknown as { standalone?: boolean }).standalone ?? matchMedia('(display-mode: standalone)').matches;
    const vv = window.visualViewport;
    const lines = [
      `standalone ${standalone}  paused ${game.isPaused} hasFocus ${game.hasFocus} inFocus ${loop.inFocus}  ` +
        `vv ${n(vv?.width, 0)}x${n(vv?.height, 0)} top ${n(vv?.offsetTop, 0)} scale ${n(vv?.scale, 2)}`,
      `events ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ') || 'none'}`,
      `loop frame ${loop.frame}  fps~${n(fps, 0)}  delta ${n(loop.delta)} raw ${n(loop.rawDelta)}  running ${loop.running}`,
      `scenes [${scenes}]  vis ${document.visibilityState} focus ${document.hasFocus()}`,
      `renderer ${r.type === 2 ? 'WebGL' : 'Canvas'} lost ${r.contextLost ?? r.gl?.isContextLost?.()}  ` +
        `canvas ${canvas.width}x${canvas.height} css ${canvas.style.width}x${canvas.style.height}  dpr ${devicePixelRatio}  win ${innerWidth}x${innerHeight}`,
    ];
    const play = game.scene.getScene('play') as unknown as {
      sys?: { isActive(): boolean };
      tweens?: Phaser.Tweens.TweenManager;
      drag?: { i: number; cur: number; start: number } | null;
      views?: { c: Phaser.GameObjects.Container; anchor: number }[];
      session?: { moves: number; state: { pos: number[] } };
      busy?: number;
      overlay?: unknown;
    } | null;
    if (play?.sys?.isActive()) {
      const tw = play.tweens!;
      lines.push(
        `tweens ${tw.getTweens().length} time ${n(tw.time, 2)} paused ${tw.paused}  busy ${play.busy} overlay ${!!play.overlay} moves ${play.session?.moves}`,
      );
      const d = play.drag;
      const i = d ? d.i : 0;
      const v = play.views?.[i];
      if (v)
        lines.push(
          `block ${i}${d ? ` DRAG start ${d.start} cur ${d.cur}` : ''}  view x ${n(v.c.x, 0)} y ${n(v.c.y, 0)} s ${n(v.c.scale, 2)} ` +
            `vis ${v.c.visible} a ${n(v.c.alpha, 2)} anchor ${v.anchor} pos ${play.session?.state.pos[i]}`,
        );
    }
    const p = game.input.activePointer;
    lines.push(`pointer #${p.id} ${p.wasTouch ? 'touch' : 'mouse'} x ${n(p.x, 0)} y ${n(p.y, 0)} down ${p.isDown}`);
    lines.push(errors.length ? `errors:\n${errors.join('\n')}` : 'errors: none');
    panel.textContent = lines.join('\n');
  };
  tick();
  timer = window.setInterval(tick, 250);
}

export function initDebug(game: Phaser.Game) {
  game.events.on('relayout', () => bump('RELAYOUT'));
  if (new URLSearchParams(location.search).has('debug')) setOn(true, game);
  else if (on()) show(game);
  // 5 quick taps in the top-left corner toggle the panel
  let taps: number[] = [];
  window.addEventListener(
    'touchend',
    (e) => {
      const t = e.changedTouches[0];
      if (!t || t.clientX > 60 || t.clientY > 90) return;
      const now = performance.now();
      taps = taps.filter((x) => now - x < 2000);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        setOn(!panel, game);
      }
    },
    { passive: true },
  );
}
