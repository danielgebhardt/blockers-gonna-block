import Phaser from 'phaser';
import { SETS, levelId, levelNumber } from '../../core/sets';
import { drawBlock, drawIcon, drawStar } from '../draw';
import { levelById } from '../levels';
import { COLORS, UI } from '../palette';
import { SET_GATE, clearedCount, isSetOpen, isUnlocked, save, setStars, totalStars } from '../save';
import { type Layout, background, button, layout, text } from '../ui';

/** Little emblem per set, drawn as a mini block showing the set's mechanic. */
function emblem(g: Phaser.GameObjects.Graphics, set: number, cs: number) {
  const looks = [
    { cells: [[0, 0], [1, 0]] as [number, number][], colors: [1], layer: 0, ice: 0, seed: 1 },
    { cells: [[0, 0]] as [number, number][], colors: [2], layer: 0, ice: 0, seed: 2 },
    { cells: [[0, 0], [1, 0]] as [number, number][], colors: [3], layer: 0, ice: 0, seed: 3, axis: 'h' as const },
    { cells: [[0, 0]] as [number, number][], colors: [0], layer: 0, ice: 2, seed: 4 },
    { cells: [[0, 0]] as [number, number][], colors: [4, 5], layer: 0, ice: 0, seed: 5 },
    { cells: [[0, 0]] as [number, number][], colors: [5], layer: 0, ice: 0, seed: 6 },
  ];
  drawBlock(g, looks[set - 1], cs);
}

/**
 * Two views: an overview of the sets (progress, locks), and a grid of one
 * set's levels. `data.set` opens a set directly (used when backing out of a level).
 */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('levels');
  }

  create(data: { set?: number }) {
    const L = layout(this);
    background(this).setScrollFactor(0);
    if (data?.set && isSetOpen(data.set)) this.setGrid(L, data.set);
    else this.overview(L);
    const onRelayout = () => this.scene.restart(data);
    this.game.events.on('relayout', onRelayout);
    this.events.once('shutdown', () => this.game.events.off('relayout', onRelayout));
  }

  private header(L: Layout, title: string, onBack: () => void, right: string) {
    const u = L.u;
    const headerH = 64 * u;
    const hg = this.add.graphics().setScrollFactor(0).setDepth(50);
    hg.fillStyle(UI.bgTop, 0.97);
    hg.fillRect(0, 0, L.W, L.y + headerH);
    button(this, L.x + 38 * u, L.y + headerH / 2, 44 * u, 44 * u, { icon: 'back' }, onBack).setScrollFactor(0).setDepth(51);
    text(this, L.x + L.w / 2, L.y + headerH / 2, title, 22 * u).setScrollFactor(0).setDepth(51);
    text(this, L.x + L.w - 16 * u, L.y + headerH / 2, right, 16 * u, UI.accent, { origin: [1, 0.5] })
      .setScrollFactor(0)
      .setDepth(51);
    return L.y + headerH;
  }

  /** Drag-to-scroll when content is taller than the screen. */
  private scroller(L: Layout, bottom: number) {
    const cam = this.cameras.main;
    const maxScroll = Math.max(0, bottom - (L.y + L.h));
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startScroll = cam.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || maxScroll === 0) return;
      cam.scrollY = Phaser.Math.Clamp(startScroll - (p.y - startY), 0, maxScroll);
    });
  }

  /** Was this pointer-up a tap (not the end of a scroll)? */
  private isTap(p: Phaser.Input.Pointer, u: number) {
    return Math.abs(p.getDistanceY()) < 10 * u && Math.abs(p.getDistanceX()) < 10 * u;
  }

  private overview(L: Layout) {
    const u = L.u;
    const total = SETS.reduce((a, s) => a + s.size, 0);
    let y = this.header(L, 'Levels', () => this.scene.start('menu'), `★ ${totalStars()}/${total * 3}`) + 12 * u;
    const pad = 16 * u;
    const cardW = L.w - pad * 2;
    const cardH = 96 * u;
    SETS.forEach((set, k) => {
      const s = k + 1;
      const open = isSetOpen(s);
      const x0 = L.x + pad;
      const g = this.add.graphics();
      const col = COLORS[k % COLORS.length];
      const r = 18 * u;
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(x0, y + 6 * u, cardW, cardH, r);
      g.fillStyle(open ? UI.buttonLight : UI.frame, 1);
      g.fillRoundedRect(x0, y, cardW, cardH, r);
      g.fillStyle(open ? UI.button : UI.frame, 1);
      g.fillRoundedRect(x0 + 4 * u, y + 5 * u, cardW - 8 * u, cardH - 9 * u, r * 0.85);
      const eg = this.add.graphics();
      const ecs = 30 * u;
      emblem(eg, s, ecs);
      eg.setPosition(x0 + 18 * u, y + cardH / 2 - ecs / 2);
      if (!open) eg.setAlpha(0.35);
      const tx = x0 + 18 * u + ecs * 2.3;
      text(this, tx, y + 28 * u, `${s}. ${set.name}`, 19 * u, open ? UI.text : UI.textDim, { origin: [0, 0.5] });
      text(this, tx, y + 52 * u, set.blurb, 13 * u, UI.textDim, { origin: [0, 0.5], bold: false });
      const cleared = clearedCount(s);
      if (open) {
        // progress bar
        const bw = cardW - (tx - x0) - 20 * u;
        g.fillStyle(UI.frameDark, 1);
        g.fillRoundedRect(tx, y + 70 * u, bw, 8 * u, 4 * u);
        g.fillStyle(col.base, 1);
        if (cleared) g.fillRoundedRect(tx, y + 70 * u, Math.max(8 * u, (bw * cleared) / set.size), 8 * u, 4 * u);
        text(this, x0 + cardW - 18 * u, y + 28 * u, `${cleared}/${set.size}`, 15 * u, UI.text, { origin: [1, 0.5] });
        text(this, x0 + cardW - 18 * u, y + 52 * u, `★ ${setStars(s)}/${set.size * 3}`, 13 * u, UI.accent, {
          origin: [1, 0.5],
        });
        const hit = this.add.zone(x0 + cardW / 2, y + cardH / 2, cardW, cardH).setInteractive();
        hit.on('pointerup', (p: Phaser.Input.Pointer) => this.isTap(p, u) && this.scene.restart({ set: s }));
      } else {
        const lg = this.add.graphics();
        drawIcon(lg, 'lock', x0 + cardW - 34 * u, y + cardH / 2 - 8 * u, 30 * u, UI.textDim);
        text(this, tx, y + 74 * u, `Clear ${SET_GATE} in ${SETS[k - 1].name} to open`, 12 * u, UI.textDim, {
          origin: [0, 0.5],
          bold: false,
        });
      }
      y += cardH + 14 * u;
    });
    this.scroller(L, y + 8 * u);
  }

  private setGrid(L: Layout, s: number) {
    const u = L.u;
    const set = SETS[s - 1];
    let y = this.header(L, set.name, () => this.scene.restart({}), `★ ${setStars(s)}/${set.size * 3}`) + 14 * u;
    const pad = 16 * u;
    const cols = 5;
    const tile = Math.min((L.w - pad * 2 - (cols - 1) * 10 * u) / cols, 76 * u);
    const gapX = (L.w - pad * 2 - tile * cols) / (cols - 1);
    const gapY = 14 * u;
    const sv = save();
    const col = COLORS[(s - 1) % COLORS.length];
    for (let pos = 1; pos <= set.size; pos++) {
      const id = levelId(s, pos);
      const lvl = levelById(id);
      const k = pos - 1;
      const tx = L.x + pad + (k % cols) * (tile + gapX);
      const ty = y + Math.floor(k / cols) * (tile + gapY);
      const open = !!lvl && isUnlocked(id);
      const prog = sv.levels[id];
      const g = this.add.graphics();
      const r = tile * 0.22;
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(tx, ty + tile * 0.07, tile, tile, r);
      if (open) {
        g.fillStyle(prog ? col.light : UI.buttonLight, 1);
        g.fillRoundedRect(tx, ty, tile, tile, r);
        g.fillStyle(prog ? col.base : UI.button, 1);
        g.fillRoundedRect(tx + tile * 0.05, ty + tile * 0.07, tile * 0.9, tile * 0.86, r * 0.85);
        text(this, tx + tile / 2, ty + tile * 0.42, String(levelNumber(s, pos)), tile * 0.32, prog ? col.dark : UI.text);
        const sg = this.add.graphics();
        for (let q = 0; q < 3; q++) drawStar(sg, tx + tile * (0.24 + q * 0.26), ty + tile * 0.76, tile * 0.1, (prog?.stars ?? 0) > q);
        const hit = this.add.zone(tx + tile / 2, ty + tile / 2, tile, tile).setInteractive();
        hit.on('pointerup', (p: Phaser.Input.Pointer) => this.isTap(p, u) && this.scene.start('play', { id }));
      } else {
        g.fillStyle(UI.frame, 1);
        g.fillRoundedRect(tx, ty, tile, tile, r);
        const lg = this.add.graphics();
        if (lvl) drawIcon(lg, 'lock', tx + tile / 2, ty + tile / 2, tile * 0.5, UI.textDim);
        // not generated yet
        else text(this, tx + tile / 2, ty + tile / 2, '…', tile * 0.3, UI.textDim);
      }
    }
    const rows = Math.ceil(set.size / cols);
    this.scroller(L, y + rows * (tile + gapY) + 12 * u);
  }
}
