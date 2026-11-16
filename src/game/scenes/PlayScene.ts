import Phaser from 'phaser';
import {
  type IMove,
  type State,
  canMove,
  dragPath,
  exitFrom,
  fillOccupancy,
  gateColor,
  iceLeft,
  isFinalLayer,
  reachable,
  stateKey,
} from '../../core/engine';
import { Session, starsFor } from '../../core/session';
import type { LevelDef, Side } from '../../core/types';
import { sfx, unlockAudio } from '../audio';
import { centreCell, drawBlock, drawBoard, drawGate, drawStar, fillUnion } from '../draw';
import { solveFrom } from '../hints';
import { LEVELS, levelByIndex } from '../levels';
import { COLORS, UI } from '../palette';
import { haptic } from '../platform';
import { persist, recordClear, save } from '../save';
import { SET_NAMES } from '../setnames';
import { type Button, type Layout, background, button, layout, modal, panelOf, text } from '../ui';

interface View {
  c: Phaser.GameObjects.Container;
  g: Phaser.GameObjects.Graphics;
  ice: Phaser.GameObjects.Text | null;
  anchor: number;
  layer: number;
  iceShown: number;
  alive: boolean;
}

interface Drag {
  i: number;
  start: number;
  cur: number;
  px0: number;
  py0: number;
  ax0: number;
  ay0: number;
  reach: Set<number>;
  exits: Map<number, number>;
  steps: number;
  lastBump: number;
}

const DIR: Record<Side, [number, number]> = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

export class PlayScene extends Phaser.Scene {
  private session!: Session;
  private level!: LevelDef;
  private L!: Layout;
  private cs = 0;
  private ox = 0;
  private oy = 0;
  private frame = 0;
  private views: View[] = [];
  private gatesG!: Phaser.GameObjects.Graphics;
  private hintG!: Phaser.GameObjects.Graphics;
  private movesText!: Phaser.GameObjects.Text;
  private parText!: Phaser.GameObjects.Text;
  private starsG!: Phaser.GameObjects.Graphics;
  private undoBtn!: Button;
  private hintBtn!: Button;
  private toast: Phaser.GameObjects.Container | null = null;
  private drag: Drag | null = null;
  private busy = 0;
  private overlay: Phaser.GameObjects.Container | null = null;
  private hintCache = new Map<string, IMove[]>();
  private stuckToken = 0;
  private hintVisitUsed = false;
  private tipTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('play');
  }

  init(data: { index: number; keepHint?: boolean }) {
    const lvl = levelByIndex(data.index) ?? LEVELS[0];
    this.level = lvl;
    this.session = new Session(lvl);
    this.views = [];
    this.drag = null;
    this.busy = 0;
    this.overlay = null;
    this.toast = null;
    this.hintCache = new Map();
    if (!data.keepHint) this.hintVisitUsed = false;
    this.session.usedHint = this.hintVisitUsed;
    // seed the hint cache with the shipped optimal solution
    this.cacheSolution(this.session.state, lvl.solution.map((m) => ({ b: m.b, a: m.y * lvl.w + m.x, g: m.g ?? -1 })));
  }

  create() {
    this.build();
    const onRelayout = () => {
      // keep the session across a resize
      const s = this.session;
      this.build(true);
      this.session = s;
      this.syncViews(false);
      this.updateHud();
    };
    this.game.events.on('relayout', onRelayout);
    this.events.once('shutdown', () => this.game.events.off('relayout', onRelayout));
    (window as unknown as { __bgb: Record<string, unknown> }).__bgb.play = this.testApi();
  }

  // ------------------------------------------------------------------ layout

  private build(rebuild = false) {
    if (rebuild) this.children.removeAll(true);
    this.views = [];
    const L = (this.L = layout(this));
    const u = L.u;
    background(this);
    const lvl = this.level;

    const headerH = 56 * u;
    const infoH = 46 * u;
    const bottomH = 92 * u;
    const top = L.y + headerH + infoH;
    const availH = L.h - headerH - infoH - bottomH;
    const marg = 1.9; // frame + shifting-gate dots, in cells
    this.cs = Math.floor(Math.min(L.w / (lvl.w + marg), availH / (lvl.h + marg), 92 * u));
    const cs = this.cs;
    this.frame = cs * 0.48;
    this.ox = Math.round(L.x + (L.w - lvl.w * cs) / 2);
    this.oy = Math.round(top + (availH - lvl.h * cs) / 2);

    // header
    button(this, L.x + 34 * u, L.y + headerH / 2, 48 * u, 44 * u, { icon: 'back' }, () => this.scene.start('levels'));
    button(this, L.x + L.w - 34 * u, L.y + headerH / 2, 48 * u, 44 * u, { icon: 'restart' }, () => this.restart());
    const title = text(this, L.x + L.w / 2, L.y + headerH * 0.36, `${lvl.index}. ${lvl.name}`, 19 * u);
    const titleRoom = L.w - 2 * 120 * u;
    if (title.width > titleRoom) title.setScale(titleRoom / title.width);
    text(this, L.x + L.w / 2, L.y + headerH * 0.78, SET_NAMES[lvl.set - 1], 12 * u, UI.textDim, { bold: false });
    if (this.tipFor()) button(this, L.x + 88 * u, L.y + headerH / 2, 40 * u, 40 * u, { label: '?' }, () => this.showTip());

    // info row
    const iy = L.y + headerH + infoH / 2;
    this.movesText = text(this, L.x + 20 * u, iy, '', 17 * u, UI.text, { origin: [0, 0.5] });
    this.parText = text(this, L.x + L.w / 2, iy, `Par ${lvl.par}`, 17 * u, UI.textDim);
    this.starsG = this.add.graphics();

    // board
    const bg = this.add.graphics();
    bg.setPosition(this.ox, this.oy);
    drawBoard(bg, lvl.w, lvl.h, lvl.grid, cs, this.frame);
    this.gatesG = this.add.graphics().setPosition(this.ox, this.oy);
    this.hintG = this.add.graphics().setPosition(this.ox, this.oy).setDepth(30);
    this.drawGates();

    // blocks
    this.session.c.blocks.forEach((b, i) => {
      const g = this.add.graphics();
      const c = this.add.container(0, 0, [g]).setDepth(10);
      g.setPosition((-b.bw * cs) / 2, (-b.bh * cs) / 2);
      const v: View = { c, g, ice: null, anchor: -1, layer: -1, iceShown: -1, alive: true };
      this.views.push(v);
      this.placeView(i, this.session.state.pos[i]);
      this.redrawView(i);
    });

    // bottom bar
    const by = L.y + L.h - bottomH / 2;
    const bw = (L.w - 3 * 16 * u) / 2;
    this.undoBtn = button(this, L.x + 16 * u + bw / 2, by, bw, 62 * u, { icon: 'undo', label: 'Undo', sub: '' }, () => this.undo());
    this.hintBtn = button(this, L.x + L.w - 16 * u - bw / 2, by, bw, 62 * u, { icon: 'hint', label: 'Hint', sub: '' }, () =>
      this.hint(),
    );

    this.input.removeAllListeners();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));

    this.updateHud();
    if (!rebuild && lvl.tip && !save().tipsSeen.includes(lvl.index)) this.tipTimer = this.time.delayedCall(250, () => this.showTip());
  }

  private anchorCentre(i: number, a: number): [number, number] {
    const b = this.session.c.blocks[i];
    const x = a % this.level.w;
    const y = Math.floor(a / this.level.w);
    return [this.ox + (x + b.bw / 2) * this.cs, this.oy + (y + b.bh / 2) * this.cs];
  }

  private placeView(i: number, a: number) {
    const v = this.views[i];
    if (a < 0) {
      v.c.setVisible(false);
      v.alive = false;
      return;
    }
    const [x, y] = this.anchorCentre(i, a);
    v.c.setPosition(x, y).setVisible(true).setAlpha(1).setScale(1);
    v.anchor = a;
    v.alive = true;
  }

  private redrawView(i: number) {
    const v = this.views[i];
    const s = this.session.state;
    const b = this.session.c.blocks[i];
    const ice = iceLeft(this.session.c, s, i);
    drawBlock(v.g, { cells: b.def.cells, colors: b.colors, layer: s.layer[i], axis: b.def.axis, ice, seed: i }, this.cs);
    v.layer = s.layer[i];
    v.iceShown = ice;
    if (ice > 0) {
      const [gx, gy] = centreCell(b.def.cells);
      const tx = (gx + 0.5) * this.cs - (b.bw * this.cs) / 2;
      const ty = (gy + 0.5) * this.cs - (b.bh * this.cs) / 2;
      if (!v.ice) {
        v.ice = text(this, tx, ty, '', this.cs * 0.42, 0x1d4f7a);
        v.c.add(v.ice);
      }
      v.ice.setText(String(ice)).setPosition(tx, ty).setVisible(true);
    } else if (v.ice) v.ice.setVisible(false);
  }

  private drawGates(glowGate = -1) {
    const s = this.session.state;
    this.gatesG.clear();
    this.level.gates.forEach((g, gi) => {
      drawGate(
        this.gatesG,
        { ...g, current: s.exits % g.colors.length },
        this.level.w,
        this.level.h,
        this.cs,
        this.frame,
        gi === glowGate ? 1 : 0,
      );
    });
  }

  private updateHud() {
    const s = this.session;
    const u = this.L.u;
    this.movesText.setText(`Moves ${s.moves}`);
    const max = starsFor(s.moves, s.level.par, s.usedUndo, s.usedHint);
    this.starsG.clear();
    const r = 11 * u;
    const x0 = this.L.x + this.L.w - 20 * u - r * 5.2;
    const y = this.L.y + 56 * u + 23 * u;
    for (let k = 0; k < 3; k++) drawStar(this.starsG, x0 + k * r * 2.6, y, r, k < max);
    this.undoBtn.redraw({ sub: s.usedUndo ? 'free now' : s.moves ? '−1 ★' : '', disabled: s.moves === 0 });
    this.hintBtn.redraw({ sub: s.usedHint ? 'free now' : '−1 ★' });
  }

  // ------------------------------------------------------------------ input

  private cellAt(p: Phaser.Input.Pointer): [number, number] | null {
    const fx = (p.x - this.ox) / this.cs;
    const fy = (p.y - this.oy) / this.cs;
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= this.level.w || y >= this.level.h) return null;
    return [x, y];
  }

  private onDown(p: Phaser.Input.Pointer) {
    unlockAudio();
    if (this.busy || this.overlay || this.session.won) return;
    const cell = this.cellAt(p);
    if (!cell) return;
    const c = this.session.c;
    const s = this.session.state;
    const occ = fillOccupancy(c, s);
    const i = occ[cell[1] * this.level.w + cell[0]] - 1;
    if (i < 0) return;
    if (!canMove(c, s, i)) {
      this.frozenFeedback(i);
      return;
    }
    const reach = reachable(c, s, i);
    const exits = new Map<number, number>();
    for (const a of reach) {
      const g = exitFrom(c, s, i, a);
      if (g >= 0) exits.set(a, g);
    }
    const a0 = s.pos[i];
    this.drag = {
      i,
      start: a0,
      cur: a0,
      px0: p.x,
      py0: p.y,
      ax0: a0 % this.level.w,
      ay0: Math.floor(a0 / this.level.w),
      reach: new Set(reach),
      exits,
      steps: 0,
      lastBump: 0,
    };
    const v = this.views[i];
    v.c.setDepth(20);
    this.tweens.killTweensOf(v.c);
    this.tweens.add({ targets: v.c, scale: 1.06, duration: 90, ease: 'Quad.easeOut' });
    sfx.pick();
    haptic.light();
    this.clearHint();
  }

  private onMove(p: Phaser.Input.Pointer) {
    const d = this.drag;
    if (!d || !p.isDown) return;
    const W = this.level.w;
    const b = this.session.c.blocks[d.i];
    const tx = d.ax0 + (p.x - d.px0) / this.cs;
    const ty = d.ay0 + (p.y - d.py0) / this.cs;
    let moved = false;
    for (let it = 0; it < 64; it++) {
      const cx = d.cur % W;
      const cy = Math.floor(d.cur / W);
      const cand: number[] = [];
      if (b.axis !== 2) cand.push(d.cur - 1, d.cur + 1);
      if (b.axis !== 1) cand.push(d.cur - W, d.cur + W);
      const dist = (a: number) => {
        const x = a % W;
        const y = Math.floor(a / W);
        return (x - tx) ** 2 + (y - ty) ** 2;
      };
      let best = d.cur;
      let bd = (cx - tx) ** 2 + (cy - ty) ** 2;
      for (const a of cand) {
        if (!d.reach.has(a)) continue;
        // guard against row wrap for horizontal neighbours
        if ((a === d.cur - 1 || a === d.cur + 1) && Math.floor(a / W) !== cy) continue;
        const dd = dist(a);
        if (dd < bd - 1e-6) {
          bd = dd;
          best = a;
        }
      }
      if (best === d.cur) break;
      d.cur = best;
      d.steps++;
      moved = true;
      sfx.step(d.steps);
    }
    const v = this.views[d.i];
    if (moved) {
      haptic.tick();
      const [x, y] = this.anchorCentre(d.i, d.cur);
      this.tweens.add({ targets: v.c, x, y, duration: 55, ease: 'Quad.easeOut' });
      v.anchor = d.cur;
    }
    // exit: keep pulling outward through a matching gate
    const cx = d.cur % W;
    const cy = Math.floor(d.cur / W);
    const g = d.exits.get(d.cur);
    if (g !== undefined) {
      const side = this.level.gates[g].side;
      const [dx, dy] = DIR[side];
      const over = (tx - cx) * dx + (ty - cy) * dy;
      if (over > 0.55) {
        this.drag = null;
        this.doExit(d.i, d.cur, g);
        return;
      }
    }
    // bump feedback when pulling against something
    const rx = tx - cx;
    const ry = ty - cy;
    const now = this.time.now;
    if (!moved && Math.max(Math.abs(rx), Math.abs(ry)) > 0.75 && now - d.lastBump > 350) {
      d.lastBump = now;
      const [x, y] = this.anchorCentre(d.i, d.cur);
      const k = this.cs * 0.06;
      const n = Math.hypot(rx, ry);
      this.tweens.add({ targets: v.c, x: x + (rx / n) * k, y: y + (ry / n) * k, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
      sfx.bump();
    }
  }

  private onUp(_p: Phaser.Input.Pointer) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const v = this.views[d.i];
    v.c.setDepth(10);
    const [x, y] = this.anchorCentre(d.i, d.cur);
    this.tweens.add({ targets: v.c, x, y, scale: 1, duration: 90, ease: 'Quad.easeOut' });
    if (d.cur === d.start) return;
    this.session.play({ b: d.i, a: d.cur, g: -1 });
    sfx.drop();
    this.afterMove();
  }

  private frozenFeedback(i: number) {
    const v = this.views[i];
    const [x] = this.anchorCentre(i, this.session.state.pos[i]);
    this.tweens.killTweensOf(v.c);
    v.c.x = x;
    this.tweens.add({ targets: v.c, x: x + this.cs * 0.05, duration: 40, yoyo: true, repeat: 3 });
    sfx.frozen();
    haptic.warn();
    const n = iceLeft(this.session.c, this.session.state, i);
    this.showToast(`Frozen — ${n} more block${n === 1 ? '' : 's'} must leave first`, 1600);
  }

  // ------------------------------------------------------------------ moves

  private doExit(i: number, a: number, g: number) {
    const s0 = this.session.state;
    const final = isFinalLayer(this.session.c, s0, i);
    const shellColor = this.session.c.blocks[i].colors[s0.layer[i]];
    if (!this.session.play({ b: i, a, g })) {
      this.syncViews(true);
      return;
    }
    const v = this.views[i];
    const side = this.level.gates[g].side;
    const [dx, dy] = DIR[side];
    const b = this.session.c.blocks[i];
    const dist = ((dx ? b.bw : b.bh) + 0.8) * this.cs;
    const [x, y] = this.anchorCentre(i, a);
    this.busy++;
    this.drawGates(g);
    this.burst(x + dx * (dx ? b.bw : b.bh) * this.cs * 0.5, y + dy * (dy ? b.bh : b.bw) * this.cs * 0.5, shellColor, side);
    if (final) {
      sfx.exit(this.session.state.exits);
      haptic.medium();
      v.c.setDepth(25);
      this.tweens.killTweensOf(v.c);
      v.c.setPosition(x, y);
      this.tweens.add({
        targets: v.c,
        x: x + dx * dist,
        y: y + dy * dist,
        alpha: 0,
        scale: 0.9,
        duration: 260,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          v.c.setVisible(false).setDepth(10);
          v.alive = false;
          this.busy--;
          this.afterMove(true);
        },
      });
    } else {
      // peel: the shell flies out, the core stays put
      sfx.peel();
      haptic.medium();
      const shell = this.add.graphics().setDepth(25);
      drawBlock(shell, { cells: b.def.cells, colors: [shellColor], layer: 0, ice: 0, seed: i }, this.cs);
      shell.setPosition(x - (b.bw * this.cs) / 2, y - (b.bh * this.cs) / 2);
      this.tweens.add({
        targets: shell,
        x: shell.x + dx * dist,
        y: shell.y + dy * dist,
        alpha: 0,
        duration: 300,
        ease: 'Cubic.easeIn',
        onComplete: () => shell.destroy(),
      });
      this.tweens.killTweensOf(v.c);
      v.c.setPosition(x, y).setDepth(10);
      v.anchor = a;
      this.redrawView(i);
      v.c.setScale(0.8);
      this.tweens.add({
        targets: v.c,
        scale: 1,
        duration: 260,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.busy--;
          this.afterMove();
        },
      });
    }
  }

  /** Called after every committed move (and after exit animations). */
  private afterMove(exited = false) {
    this.clearHint();
    this.hideToast();
    if (exited) {
      // ice and shifting gates react to the exit
      const s = this.session.state;
      this.session.c.blocks.forEach((_, i) => {
        const v = this.views[i];
        if (s.pos[i] < 0 || v.iceShown <= 0) return;
        const now = iceLeft(this.session.c, s, i);
        if (now === v.iceShown) return;
        if (now === 0) {
          sfx.iceShatter();
          this.shards(v.c.x, v.c.y);
        } else sfx.iceCrack();
        this.redrawView(i);
        this.tweens.add({ targets: v.c, scale: 1.08, duration: 90, yoyo: true });
      });
      if (this.level.gates.some((g) => g.colors.length > 1)) {
        sfx.gateShift();
      }
      this.drawGates();
    }
    this.updateHud();
    if (this.session.won) {
      this.win();
      return;
    }
    this.checkStuck();
  }

  private undo() {
    if (this.busy || this.overlay || !this.session.moves) return;
    this.session.undo();
    sfx.undo();
    haptic.light();
    this.clearHint();
    this.hideToast();
    this.syncViews(true);
    this.drawGates();
    this.updateHud();
  }

  private restart() {
    if (this.busy) return;
    this.overlay?.destroy();
    this.overlay = null;
    this.session.restart();
    this.session.usedHint = this.hintVisitUsed;
    this.clearHint();
    this.hideToast();
    this.syncViews(true);
    this.drawGates();
    this.updateHud();
  }

  /** Bring every view in line with the session state. */
  private syncViews(animate: boolean) {
    const s = this.session.state;
    this.views.forEach((v, i) => {
      const a = s.pos[i];
      this.tweens.killTweensOf(v.c);
      if (a < 0) {
        v.c.setVisible(false);
        v.alive = false;
        return;
      }
      const [x, y] = this.anchorCentre(i, a);
      const needRedraw = v.layer !== s.layer[i] || v.iceShown !== iceLeft(this.session.c, s, i);
      if (needRedraw) this.redrawView(i);
      if (!v.alive || !v.c.visible) {
        v.c.setPosition(x, y).setVisible(true).setDepth(10);
        v.alive = true;
        v.anchor = a;
        if (animate) {
          v.c.setAlpha(0).setScale(0.6);
          this.tweens.add({ targets: v.c, alpha: 1, scale: 1, duration: 200, ease: 'Back.easeOut' });
        } else v.c.setAlpha(1).setScale(1);
        return;
      }
      v.c.setAlpha(1).setDepth(10);
      if (v.anchor !== a || v.c.x !== x || v.c.y !== y) {
        v.anchor = a;
        if (animate) this.tweens.add({ targets: v.c, x, y, scale: 1, duration: 160, ease: 'Quad.easeOut' });
        else v.c.setPosition(x, y).setScale(1);
      } else v.c.setScale(1);
    });
  }

  // ------------------------------------------------------------------ hints & stuck

  private cacheSolution(from: State, moves: IMove[]) {
    // remember the remaining plan at every state along it
    const c = this.session.c;
    let s = from;
    for (let k = 0; k < moves.length; k++) {
      this.hintCache.set(stateKey(c, s), moves.slice(k));
      const m = moves[k];
      const n = { pos: s.pos.slice(), layer: s.layer.slice(), exits: s.exits };
      if (m.g < 0) n.pos[m.b] = m.a;
      else if (isFinalLayer(c, s, m.b)) {
        n.pos[m.b] = -1;
        n.exits++;
      } else {
        n.pos[m.b] = m.a;
        n.layer[m.b]++;
      }
      s = n;
    }
  }

  private async solveCurrent(): Promise<IMove[] | null | 'unknown'> {
    const s = this.session.state;
    const key = stateKey(this.session.c, s);
    const cached = this.hintCache.get(key);
    if (cached) return cached;
    const r = await solveFrom(`L${this.level.index}`, this.level, s);
    if (r.solvable === null) return 'unknown';
    if (!r.solvable) return null;
    this.cacheSolution(s, r.moves);
    return r.moves;
  }

  private async checkStuck() {
    const token = ++this.stuckToken;
    const res = await this.solveCurrent();
    if (token !== this.stuckToken || this.session.won) return;
    if (res === null) {
      sfx.stuck();
      haptic.warn();
      this.showToast('No way out from here. Undo a few moves.', 0);
      this.tweens.add({ targets: this.undoBtn, scale: 1.08, duration: 260, yoyo: true, repeat: 3 });
    }
  }

  private async hint() {
    if (this.busy || this.overlay || this.session.won) return;
    this.hintBtn.redraw({ sub: 'thinking…' });
    const res = await this.solveCurrent();
    this.hintVisitUsed = true;
    this.session.usedHint = true;
    this.updateHud();
    if (res === 'unknown') {
      this.showToast('Too tangled to see from here. Try undoing a little.', 2200);
      return;
    }
    if (res === null) {
      sfx.stuck();
      this.showToast('No way out from here. Undo a few moves.', 0);
      return;
    }
    sfx.hint();
    this.showHint(res[0]);
  }

  private showHint(m: IMove) {
    const g = this.hintG;
    g.clear();
    const c = this.session.c;
    const s = this.session.state;
    const b = c.blocks[m.b];
    const cs = this.cs;
    const W = this.level.w;
    const from = s.pos[m.b];
    const fx = (from % W) * cs;
    const fy = Math.floor(from / W) * cs;
    const tx = (m.a % W) * cs;
    const ty = Math.floor(m.a / W) * cs;
    const col = COLORS[b.colors[s.layer[m.b]]];
    // glow on the block to move
    g.fillStyle(0xffffff, 0.35);
    fillUnion(g, b.def.cells, cs, -cs * 0.04, cs * 0.24, fx, fy);
    // ghost at the destination
    if (m.a !== from) {
      g.fillStyle(col.light, 0.45);
      fillUnion(g, b.def.cells, cs, cs * 0.08, cs * 0.2, tx, ty);
    }
    // route along the drag path, then out of the gate
    const path = dragPath(c, s, m.b, m.a) ?? [from, m.a];
    const pts = path.map((a) => [((a % W) + b.bw / 2) * cs, (Math.floor(a / W) + b.bh / 2) * cs]);
    if (m.g >= 0) {
      const [dx, dy] = DIR[this.level.gates[m.g].side];
      const last = pts[pts.length - 1];
      pts.push([last[0] + dx * ((dx ? b.bw : b.bh) / 2 + 0.9) * cs, last[1] + dy * ((dy ? b.bh : b.bw) / 2 + 0.9) * cs]);
    }
    g.lineStyle(cs * 0.09, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.strokePath();
    if (pts.length >= 2) {
      const [ax, ay] = pts[pts.length - 1];
      const [bx, by] = pts[pts.length - 2];
      const ang = Math.atan2(ay - by, ax - bx);
      const L = cs * 0.28;
      g.fillStyle(0xffffff, 0.95);
      g.fillTriangle(
        ax + Math.cos(ang) * L * 0.4,
        ay + Math.sin(ang) * L * 0.4,
        ax + Math.cos(ang + 2.5) * L,
        ay + Math.sin(ang + 2.5) * L,
        ax + Math.cos(ang - 2.5) * L,
        ay + Math.sin(ang - 2.5) * L,
      );
    }
    g.setAlpha(0);
    this.tweens.add({ targets: g, alpha: 1, duration: 200 });
    this.tweens.add({ targets: g, alpha: 0.55, duration: 600, yoyo: true, repeat: -1, delay: 200 });
  }

  private clearHint() {
    this.tweens.killTweensOf(this.hintG);
    this.hintG.clear();
  }

  // ------------------------------------------------------------------ feedback

  private showToast(msg: string, ms: number) {
    this.hideToast();
    const L = this.L;
    const u = L.u;
    const c = this.add.container(L.x + L.w / 2, this.oy - this.frame - 26 * u).setDepth(60);
    const t = text(this, 0, 0, msg, 15 * u, UI.text, { wrap: L.w - 60 * u });
    const w = Math.min(L.w - 24 * u, t.width + 32 * u);
    const h = t.height + 18 * u;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(-w / 2, -h / 2 + 3 * u, w, h, 12 * u);
    g.fillStyle(0x3b2a55, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 12 * u);
    c.add([g, t]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 160 });
    this.toast = c;
    if (ms) this.time.delayedCall(ms, () => this.toast === c && this.hideToast());
  }

  private hideToast() {
    if (!this.toast) return;
    const c = this.toast;
    this.toast = null;
    this.tweens.add({ targets: c, alpha: 0, duration: 150, onComplete: () => c.destroy() });
  }

  private burst(x: number, y: number, color: number, side: Side) {
    const col = COLORS[color];
    const [dx, dy] = DIR[side];
    for (let k = 0; k < 14; k++) {
      const g = this.add.graphics().setDepth(40);
      const s = this.cs * (0.05 + Math.random() * 0.07);
      g.fillStyle(k % 3 ? col.base : col.light, 1);
      g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.3);
      g.setPosition(x, y);
      const spread = (Math.random() - 0.5) * 2;
      const dist = this.cs * (0.6 + Math.random() * 0.9);
      this.tweens.add({
        targets: g,
        x: x + (dx * 1 + (dy ? spread : 0) * 0.8) * dist,
        y: y + (dy * 1 + (dx ? spread : 0) * 0.8) * dist,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 380 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  private shards(x: number, y: number) {
    for (let k = 0; k < 12; k++) {
      const g = this.add.graphics().setDepth(40);
      const s = this.cs * (0.06 + Math.random() * 0.08);
      g.fillStyle(0xffffff, 0.9);
      g.fillTriangle(0, -s, s * 0.6, s * 0.5, -s * 0.6, s * 0.5);
      g.setPosition(x, y);
      const a = Math.random() * Math.PI * 2;
      const d = this.cs * (0.4 + Math.random() * 0.7);
      this.tweens.add({
        targets: g,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        angle: Math.random() * 360,
        alpha: 0,
        duration: 450,
        ease: 'Quad.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ overlays

  private tipFor(): string | undefined {
    if (this.level.tip) return this.level.tip;
    return LEVELS.find((l) => l.set === this.level.set && l.tip)?.tip;
  }

  private showTip() {
    if (this.overlay) return;
    const L = this.L;
    const u = L.u;
    const w = Math.min(L.w - 32 * u, 380 * u);
    const tipText = this.tipFor()!;
    const probe = text(this, 0, 0, tipText, 16 * u, UI.text, { wrap: w - 48 * u, bold: false });
    const h = probe.height + 190 * u;
    probe.destroy();
    const m = modal(this, L, w, h);
    const p = panelOf(m);
    p.add(text(this, 0, -h / 2 + 34 * u, `New: ${SET_NAMES[this.level.set - 1]}`, 20 * u, UI.accent));
    const ex = this.add.graphics();
    const demoCs = 40 * u;
    const demos = [
      { cells: [[0, 0], [1, 0]] as [number, number][], colors: [1] },
      { cells: [[0, 0]] as [number, number][], colors: [2] },
      { cells: [[0, 0], [1, 0]] as [number, number][], colors: [3], axis: 'h' as const },
      { cells: [[0, 0]] as [number, number][], colors: [0], ice: 2 },
      { cells: [[0, 0]] as [number, number][], colors: [4, 5] },
      { cells: [[0, 0]] as [number, number][], colors: [5] },
    ];
    const d = demos[this.level.set - 1];
    drawBlock(ex, { cells: d.cells, colors: d.colors, layer: 0, axis: d.axis, ice: d.ice ?? 0, seed: 3 }, demoCs);
    const dw = (Math.max(...d.cells.map((c) => c[0])) + 1) * demoCs;
    ex.setPosition(-dw / 2, -h / 2 + 62 * u);
    p.add(ex);
    if (d.ice) p.add(text(this, 0, -h / 2 + 62 * u + demoCs / 2, String(d.ice), demoCs * 0.42, 0x1d4f7a));
    p.add(text(this, 0, -h / 2 + 120 * u, tipText, 16 * u, UI.text, { wrap: w - 48 * u, bold: false, origin: [0.5, 0] }));
    p.add(
      button(this, 0, h / 2 - 40 * u, 160 * u, 50 * u, { label: 'Got it', fill: 0x2f9e6b, fillLight: 0x46c48a }, () => {
        const sv = save();
        if (!sv.tipsSeen.includes(this.level.index)) sv.tipsSeen.push(this.level.index);
        persist();
        m.destroy();
        this.overlay = null;
      }),
    );
    this.overlay = m;
  }

  private win() {
    const s = this.session;
    const stars = s.stars();
    recordClear(this.level.index, stars, s.moves);
    sfx.win();
    haptic.success();
    this.confetti();
    this.time.delayedCall(550, () => this.showWin(stars));
  }

  private showWin(stars: number) {
    const L = this.L;
    const u = L.u;
    const s = this.session;
    const w = Math.min(L.w - 32 * u, 360 * u);
    const h = 330 * u;
    const m = modal(this, L, w, h);
    this.overlay = m;
    const p = panelOf(m);
    p.add(text(this, 0, -h / 2 + 40 * u, 'Box cleared!', 26 * u, UI.text));
    const sg = this.add.graphics();
    p.add(sg);
    const r = 26 * u;
    for (let k = 0; k < 3; k++) {
      const one = this.add.graphics();
      drawStar(one, 0, 0, r, k < stars);
      one.setPosition((k - 1) * r * 2.6, -h / 2 + 104 * u - (k === 1 ? 10 * u : 0));
      one.setScale(0);
      p.add(one);
      this.tweens.add({
        targets: one,
        scale: 1,
        duration: 320,
        delay: 250 + k * 180,
        ease: 'Back.easeOut',
        onStart: () => k < stars && sfx.star(k),
      });
    }
    const par = s.level.par;
    let msg: string;
    if (stars === 3) msg = s.moves < par ? 'Better than par! How?!' : 'Perfect: matched par.';
    else if (s.moves > par) msg = `Par is ${par}. Can you find a shorter way?`;
    else msg = 'Par matched, but help was used. Try it clean!';
    p.add(text(this, 0, -h / 2 + 158 * u, `${s.moves} moves · par ${par}`, 18 * u, UI.textDim));
    p.add(text(this, 0, -h / 2 + 190 * u, msg, 15 * u, UI.text, { wrap: w - 40 * u, bold: false }));
    const bw = (w - 64 * u) / 3;
    const by = h / 2 - 48 * u;
    p.add(button(this, -bw - 12 * u, by, bw, 54 * u, { icon: 'grid' }, () => this.scene.start('levels')));
    p.add(button(this, 0, by, bw, 54 * u, { icon: 'restart' }, () => this.restart()));
    const next = levelByIndex(this.level.index + 1);
    if (next)
      p.add(
        button(this, bw + 12 * u, by, bw, 54 * u, { icon: 'next', fill: 0x2f9e6b, fillLight: 0x46c48a }, () =>
          this.scene.start('play', { index: next.index }),
        ),
      );
  }

  private confetti() {
    const L = this.L;
    for (let k = 0; k < 60; k++) {
      const g = this.add.graphics().setDepth(90);
      const col = COLORS[k % COLORS.length];
      const s = (6 + Math.random() * 8) * L.u;
      g.fillStyle(col.base, 1);
      g.fillRect(-s / 2, -s / 4, s, s / 2);
      const x = L.x + Math.random() * L.w;
      g.setPosition(x, L.y - 20 * L.u - Math.random() * 200 * L.u);
      this.tweens.add({
        targets: g,
        y: L.y + L.h + 40 * L.u,
        x: x + (Math.random() - 0.5) * 120 * L.u,
        angle: Math.random() * 720 - 360,
        duration: 1600 + Math.random() * 1200,
        ease: 'Sine.easeIn',
        onComplete: () => g.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ test hook

  private testApi() {
    return {
      /** Board geometry in CSS pixels. */
      info: () => {
        const dpr = this.L.dpr;
        return {
          index: this.level.index,
          w: this.level.w,
          h: this.level.h,
          cs: this.cs / dpr,
          ox: this.ox / dpr,
          oy: this.oy / dpr,
          moves: this.session.moves,
          won: this.session.won,
          busy: this.busy > 0,
          overlay: !!this.overlay,
          pos: Array.from(this.session.state.pos),
          layer: Array.from(this.session.state.layer),
        };
      },
      /** Drag path (anchors) for a move from the current state. */
      path: (b: number, a: number) => dragPath(this.session.c, this.session.state, b, a),
      blockCells: (b: number) => this.session.c.blocks[b].def.cells,
      closeOverlay: () => {
        this.tipTimer?.remove();
        this.overlay?.destroy();
        this.overlay = null;
      },
      gateColor: (g: number) => gateColor(this.session.c, this.session.state, g),
    };
  }
}
