import Phaser from 'phaser';
import { drawBlock, drawIcon, drawStar } from '../draw';
import { LEVELS } from '../levels';
import { COLORS, UI } from '../palette';
import { isUnlocked, save, totalStars } from '../save';
import { SET_BLURBS, SET_NAMES } from '../setnames';
import { background, button, layout, text } from '../ui';

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

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('levels');
  }

  create() {
    const L = layout(this);
    const u = L.u;
    background(this).setScrollFactor(0);
    const cx = L.x + L.w / 2;
    const top = L.y;
    const headerH = 64 * u;

    const content = this.add.container(0, 0);
    const sets = SET_NAMES.length;
    const pad = 16 * u;
    const tile = Math.min((L.w - pad * 2 - 4 * 10 * u) / 5, 76 * u);
    const gapX = (L.w - pad * 2 - tile * 5) / 4;
    const rowH = tile + 64 * u;
    let y = top + headerH + 8 * u;
    const sv = save();

    for (let s = 1; s <= sets; s++) {
      const eg = this.add.graphics();
      const ecs = 22 * u;
      emblem(eg, s, ecs);
      eg.setPosition(L.x + pad, y + 2 * u);
      content.add(eg);
      content.add(text(this, L.x + pad + ecs * 2.4, y + ecs * 0.5, `${s}. ${SET_NAMES[s - 1]}`, 18 * u, UI.text, { origin: [0, 0.5] }));
      content.add(
        text(this, L.x + L.w - pad, y + ecs * 0.5, SET_BLURBS[s - 1], 13 * u, UI.textDim, { origin: [1, 0.5], bold: false }),
      );
      const ty = y + 34 * u;
      for (let k = 0; k < 5; k++) {
        const idx = (s - 1) * 5 + k + 1;
        const lvl = LEVELS.find((l) => l.index === idx);
        const tx = L.x + pad + k * (tile + gapX);
        const open = !!lvl && isUnlocked(idx);
        const prog = sv.levels[idx];
        const g = this.add.graphics();
        const col = COLORS[(s - 1) % COLORS.length];
        const r = tile * 0.22;
        g.fillStyle(0x000000, 0.35);
        g.fillRoundedRect(tx, ty + tile * 0.07, tile, tile, r);
        if (open) {
          g.fillStyle(prog ? col.light : UI.buttonLight, 1);
          g.fillRoundedRect(tx, ty, tile, tile, r);
          g.fillStyle(prog ? col.base : UI.button, 1);
          g.fillRoundedRect(tx + tile * 0.05, ty + tile * 0.07, tile * 0.9, tile * 0.86, r * 0.85);
        } else {
          g.fillStyle(UI.frame, 1);
          g.fillRoundedRect(tx, ty, tile, tile, r);
        }
        content.add(g);
        if (open) {
          content.add(text(this, tx + tile / 2, ty + tile * 0.42, String(idx), tile * 0.36, prog ? col.dark : UI.text));
          const sg = this.add.graphics();
          for (let q = 0; q < 3; q++) drawStar(sg, tx + tile * (0.24 + q * 0.26), ty + tile * 0.76, tile * 0.1, (prog?.stars ?? 0) > q);
          content.add(sg);
          const hit = this.add.zone(tx + tile / 2, ty + tile / 2, tile, tile).setInteractive();
          hit.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (Math.abs(p.getDistanceY()) > 10 * u) return; // was a scroll
            this.scene.start('play', { index: idx });
          });
          content.add(hit);
        } else {
          const lg = this.add.graphics();
          drawIcon(lg, 'lock', tx + tile / 2, ty + tile / 2, tile * 0.5, UI.textDim);
          content.add(lg);
        }
      }
      y += rowH;
    }
    const contentBottom = y + 16 * u;

    // header (fixed)
    const hg = this.add.graphics().setScrollFactor(0);
    hg.fillStyle(UI.bgTop, 0.96);
    hg.fillRect(0, 0, L.W, top + headerH);
    button(this, L.x + pad + 22 * u, top + headerH / 2, 44 * u, 44 * u, { icon: 'back' }, () => this.scene.start('menu')).setScrollFactor(
      0,
    );
    text(this, cx, top + headerH / 2, 'Levels', 22 * u).setScrollFactor(0);
    text(this, L.x + L.w - pad, top + headerH / 2, `★ ${totalStars()}/${LEVELS.length * 3}`, 16 * u, UI.accent, {
      origin: [1, 0.5],
    }).setScrollFactor(0);

    // vertical drag scrolling when the list is taller than the screen
    const cam = this.cameras.main;
    const maxScroll = Math.max(0, contentBottom - (L.y + L.h));
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
    const onRelayout = () => this.scene.restart();
    this.game.events.on('relayout', onRelayout);
    this.events.once('shutdown', () => this.game.events.off('relayout', onRelayout));
  }
}
