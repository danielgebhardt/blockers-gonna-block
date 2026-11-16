/** Layout (device pixels, safe area) and small UI widgets. */
import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import { drawIcon, type IconName } from './draw';
import { haptic, readInsets } from './platform';
import { UI, hex } from './palette';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface Layout {
  dpr: number;
  /** Full canvas size in device pixels. */
  W: number;
  H: number;
  /** Safe rectangle in device pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** One CSS pixel in device pixels (= dpr). */
  u: number;
}

export function layout(scene: Phaser.Scene): Layout {
  const dpr = (scene.game.registry.get('dpr') as number) ?? 1;
  const W = scene.scale.width;
  const H = scene.scale.height;
  const ins = readInsets();
  const top = Math.max(ins.top, 8) * dpr;
  const bottom = Math.max(ins.bottom, 8) * dpr;
  const left = ins.left * dpr;
  const right = ins.right * dpr;
  return { dpr, W, H, x: left, y: top, w: W - left - right, h: H - top - bottom, u: dpr };
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size: number,
  color = UI.text,
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; wrap?: number; origin?: [number, number]; alpha?: number } = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${Math.round(size)}px`,
    fontStyle: opts.bold === false ? 'normal' : 'bold',
    color: hex(color),
    align: opts.align ?? 'center',
    wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
    lineSpacing: size * 0.18,
  });
  const o = opts.origin ?? [0.5, 0.5];
  t.setOrigin(o[0], o[1]);
  if (opts.alpha !== undefined) t.setAlpha(opts.alpha);
  return t;
}

export interface ButtonOpts {
  icon?: IconName;
  label?: string;
  fill?: number;
  fillLight?: number;
  ink?: number;
  fontSize?: number;
  sub?: string;
  disabled?: boolean;
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): void;
  redraw(o: Partial<ButtonOpts>): void;
}

/** Chunky rounded button with optional icon and label. (x, y) is the centre. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: ButtonOpts,
  onClick: () => void,
): Button {
  const c = scene.add.container(x, y) as Button;
  const g = scene.add.graphics();
  c.add(g);
  let o = { ...opts };
  let label: Phaser.GameObjects.Text | null = null;
  let sub: Phaser.GameObjects.Text | null = null;
  const draw = () => {
    g.clear();
    const r = Math.min(h * 0.32, w * 0.3);
    const fill = o.fill ?? UI.button;
    const light = o.fillLight ?? UI.buttonLight;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + h * 0.08, w, h, r);
    g.fillStyle(light, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2 + h * 0.05, -h / 2 + h * 0.08, w - h * 0.1, h - h * 0.13, r * 0.85);
    const ink = o.ink ?? UI.text;
    const hasLabel = !!o.label;
    if (o.icon) {
      const s = Math.min(h * 0.62, w * 0.62);
      const ix = hasLabel ? -w / 2 + h * 0.55 : 0;
      drawIcon(g, o.icon, ix, 0, s, ink);
    }
    label?.destroy();
    sub?.destroy();
    label = null;
    sub = null;
    if (hasLabel) {
      const fs = o.fontSize ?? h * 0.36;
      const lx = o.icon ? h * 0.3 : 0;
      label = text(scene, lx, o.sub ? -h * 0.1 : 0, o.label!, fs, ink);
      c.add(label);
      if (o.sub) {
        sub = text(scene, lx, h * 0.22, o.sub, fs * 0.55, ink, { bold: false, alpha: 0.75 });
        c.add(sub);
      }
    }
    c.setAlpha(o.disabled ? 0.4 : 1);
  };
  draw();
  c.setSize(w, h);
  // Phaser offsets a container's hit area by its display origin (half its size),
  // so the rectangle is given in top-left-based coordinates.
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
  c.on('pointerdown', () => {
    if (o.disabled) return;
    unlockAudio();
    c.setScale(0.94);
  });
  c.on('pointerout', () => c.setScale(1));
  c.on('pointerup', () => {
    if (o.disabled) return;
    c.setScale(1);
    sfx.button();
    haptic.tick();
    onClick();
  });
  c.setEnabled = (on: boolean) => {
    o.disabled = !on;
    draw();
  };
  c.redraw = (p: Partial<ButtonOpts>) => {
    o = { ...o, ...p };
    draw();
  };
  return c;
}

/** Background: vertical gradient with faint diagonal pattern. */
export function background(scene: Phaser.Scene) {
  const g = scene.add.graphics();
  const { width: W, height: H } = scene.scale;
  const bands = 24;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(UI.bgTop),
      Phaser.Display.Color.ValueToColor(UI.bg),
      100,
      t * 100,
    );
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    g.fillRect(0, (H * i) / bands, W, H / bands + 1);
  }
  g.fillStyle(0xffffff, 0.025);
  const step = Math.max(W, H) / 14;
  for (let k = -H; k < W + H; k += step) g.fillTriangle(k, 0, k + step * 0.5, 0, k - H + step * 0.5, H);
  g.setDepth(-10);
  return g;
}

/** Dimmed modal panel; returns the container (centre at panel centre). */
export function modal(scene: Phaser.Scene, L: Layout, w: number, h: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(100);
  const dim = scene.add.graphics();
  dim.fillStyle(0x05060f, 0.72);
  dim.fillRect(0, 0, L.W, L.H);
  dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, L.W, L.H), Phaser.Geom.Rectangle.Contains);
  c.add(dim);
  const p = scene.add.container(L.W / 2, L.y + L.h / 2);
  const g = scene.add.graphics();
  const r = 18 * L.u;
  g.fillStyle(0x000000, 0.4);
  g.fillRoundedRect(-w / 2, -h / 2 + 8 * L.u, w, h, r);
  g.fillStyle(UI.frameLight, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(UI.frame, 1);
  g.fillRoundedRect(-w / 2 + 4 * L.u, -h / 2 + 4 * L.u, w - 8 * L.u, h - 8 * L.u, r * 0.8);
  p.add(g);
  c.add(p);
  (c as unknown as { panel: Phaser.GameObjects.Container }).panel = p;
  p.setScale(0.85);
  p.setAlpha(0);
  scene.tweens.add({ targets: p, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  return c;
}

export const panelOf = (m: Phaser.GameObjects.Container) => (m as unknown as { panel: Phaser.GameObjects.Container }).panel;
