import Phaser from 'phaser';
import { setSound, unlockAudio } from '../audio';
import { blockWordWidth, drawBlockWord, fillUnion } from '../draw';
import { LEVELS } from '../levels';
import { COLORS, UI, mix } from '../palette';
import { setHaptics } from '../platform';
import { isUnlocked, persist, save, totalStars } from '../save';
import { type Layout, background, button, layout, text } from '../ui';
import { SETS, TOTAL_LEVELS } from '../../core/sets';
import { FAMILY_SAMPLES } from './samples';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    const start = this.game.registry.get('startLevel') as number | undefined;
    if (start) {
      this.game.registry.remove('startLevel');
      this.scene.start('play', { index: start });
      return;
    }
    this.build();
    const onRelayout = () => this.scene.restart();
    this.game.events.on('relayout', onRelayout);
    this.events.once('shutdown', () => this.game.events.off('relayout', onRelayout));
  }

  private build() {
    const L = layout(this);
    background(this);
    this.floaters(L);
    const u = L.u;
    const cx = L.x + L.w / 2;

    // title in block letters, sized to fit
    const words = ['BLOCKERS', 'GONNA', 'BLOCK'];
    const maxW = L.w * 0.86;
    const px = Math.min(maxW / blockWordWidth('BLOCKERS', 1), 22 * u);
    let y = L.y + Math.max(L.h * 0.1, 40 * u);
    const g = this.add.graphics();
    words.forEach((wd, wi) => {
      const ww = blockWordWidth(wd, px);
      const scale = wi === 1 ? 0.7 : 1;
      const p = px * scale;
      const w2 = blockWordWidth(wd, p);
      drawBlockWord(g, wd, cx - w2 / 2, y, p, (i) => COLORS[(i + wi * 2) % COLORS.length].base);
      y += p * 6.2;
      void ww;
    });
    this.tweens.add({ targets: g, y: -4 * u, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    y += 8 * u;
    const stars = totalStars();
    text(this, cx, y, `★ ${stars} / ${TOTAL_LEVELS * 3}`, 18 * u, UI.accent);
    y += 40 * u;

    const bw = Math.min(L.w * 0.7, 300 * u);
    const bh = 64 * u;
    // first open level you haven't cleared yet, in play order
    const sv0 = save();
    // ...or, with everything cleared, the first one still short of three stars
    const next =
      LEVELS.find((l) => !sv0.levels[l.id] && isUnlocked(l.id)) ?? LEVELS.find((l) => (sv0.levels[l.id]?.stars ?? 0) < 3);
    const started = Object.keys(sv0.levels).length > 0;
    button(
      this,
      cx,
      y + bh / 2,
      bw,
      bh,
      { icon: 'play', label: !started ? 'Play' : next ? `Continue · ${next.index}` : 'All clear!', fill: 0x2f9e6b, fillLight: 0x46c48a, fontSize: 24 * u },
      () => (next ? this.scene.start('play', { id: next.id }) : this.scene.start('levels')),
    );
    y += bh + 18 * u;
    button(this, cx, y + bh * 0.42, bw, bh * 0.84, { icon: 'grid', label: 'Levels', fontSize: 20 * u }, () =>
      this.scene.start('levels'),
    );
    y += bh + 24 * u;

    const sv = save();
    const tb = 56 * u;
    const snd = button(this, cx - tb * 0.75, y + tb / 2, tb, tb, { icon: sv.sound ? 'sound' : 'mute' }, () => {
      sv.sound = !sv.sound;
      setSound(sv.sound);
      persist();
      snd.redraw({ icon: sv.sound ? 'sound' : 'mute' });
    });
    const hap = button(this, cx + tb * 0.75, y + tb / 2, tb, tb, { icon: sv.haptics ? 'buzz' : 'nobuzz' }, () => {
      sv.haptics = !sv.haptics;
      setHaptics(sv.haptics);
      persist();
      hap.redraw({ icon: sv.haptics ? 'buzz' : 'nobuzz' });
    });

    text(this, cx, L.y + L.h - 14 * u, `${SETS.length} sets · ${LEVELS.length} levels · v${__APP_VERSION__}`, 12 * u, UI.textDim, {
      bold: false,
    });
    this.input.once('pointerdown', () => unlockAudio());
  }

  /** Slowly drifting blocks in the background. */
  private floaters(L: Layout) {
    const cs = 34 * L.u;
    for (let i = 0; i < 9; i++) {
      const sample = FAMILY_SAMPLES[i % FAMILY_SAMPLES.length];
      const g = this.add.graphics();
      // solid colours mixed toward the background (alpha would show seams where shapes overlap)
      const col = COLORS[i % COLORS.length];
      g.fillStyle(mix(col.dark, UI.bg, 0.72), 1);
      fillUnion(g, sample, cs, cs * 0.04, cs * 0.2, 0, cs * 0.05);
      g.fillStyle(mix(col.base, UI.bg, 0.78), 1);
      fillUnion(g, sample, cs, cs * 0.04, cs * 0.2);
      g.setDepth(-5);
      const x = Phaser.Math.Between(0, L.W);
      const y = Phaser.Math.Between(0, L.H);
      g.setPosition(x, y);
      g.setAngle(Phaser.Math.Between(-20, 20));
      this.tweens.add({
        targets: g,
        y: y - L.H * 0.15,
        angle: g.angle + Phaser.Math.Between(-15, 15),
        duration: Phaser.Math.Between(7000, 12000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
