/** Synthesised sound effects (WebAudio). No audio files. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let noiseBuf: AudioBuffer | null = null;

export function setSound(on: boolean) {
  enabled = on;
}

/** Must be called from a user gesture at least once (autoplay policies). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    // gentle limiter so stacked sounds never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 8;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ready(): AudioContext | null {
  if (!enabled || !ctx || !master) return null;
  return ctx;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; to?: number; vol?: number; delay?: number; attack?: number } = {},
) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; vol?: number; delay?: number } = {}) {
  const c = ready();
  if (!c || !noiseBuf) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.setValueAtTime(opts.freq ?? 1000, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// pentatonic scale for rising exit chimes
const PENTA = [0, 2, 4, 7, 9];
const note = (step: number, base = 523.25) =>
  base * Math.pow(2, (PENTA[step % 5] + 12 * Math.floor(step / 5)) / 12);

export const sfx = {
  pick() {
    tone(520, 0.07, { to: 380, vol: 0.18, type: 'triangle' });
  },
  step(n = 0) {
    noise(0.03, { type: 'highpass', freq: 2500 + (n % 3) * 400, vol: 0.12 });
    tone(220 + (n % 4) * 15, 0.03, { vol: 0.06, type: 'square' });
  },
  drop() {
    tone(300, 0.08, { to: 200, vol: 0.15, type: 'triangle' });
    noise(0.05, { type: 'lowpass', freq: 600, vol: 0.12 });
  },
  bump() {
    tone(130, 0.12, { to: 60, vol: 0.35 });
  },
  frozen() {
    for (let i = 0; i < 3; i++) tone(2400 + Math.random() * 1600, 0.05, { vol: 0.06, delay: i * 0.03 });
    tone(110, 0.12, { to: 70, vol: 0.25 });
  },
  exit(k: number) {
    noise(0.32, { freq: 400, to: 2600, q: 0.8, vol: 0.22 });
    tone(note(k), 0.35, { vol: 0.16, type: 'triangle', delay: 0.06 });
    tone(note(k + 2), 0.4, { vol: 0.1, type: 'sine', delay: 0.12 });
  },
  peel() {
    noise(0.12, { type: 'highpass', freq: 1800, vol: 0.25 });
    tone(880, 0.12, { to: 1400, vol: 0.12, type: 'triangle', delay: 0.04 });
    tone(330, 0.2, { to: 520, vol: 0.12, delay: 0.08 });
  },
  iceCrack() {
    for (let i = 0; i < 4; i++) tone(2800 + Math.random() * 2200, 0.04, { vol: 0.07, delay: i * 0.035 });
  },
  iceShatter() {
    noise(0.35, { type: 'highpass', freq: 3000, vol: 0.25 });
    for (let i = 0; i < 7; i++) tone(2000 + Math.random() * 3000, 0.08, { vol: 0.06, delay: i * 0.025 });
  },
  gateShift() {
    tone(330, 0.18, { to: 495, vol: 0.08, type: 'square', attack: 0.03 });
    tone(495, 0.18, { to: 660, vol: 0.06, type: 'sine', delay: 0.08 });
  },
  unlock() {
    tone(1047, 0.08, { vol: 0.12, type: 'square' });
    tone(1568, 0.25, { vol: 0.12, type: 'triangle', delay: 0.06 });
    noise(0.06, { type: 'highpass', freq: 4000, vol: 0.1 });
  },
  plate(open: boolean) {
    tone(open ? 220 : 180, 0.12, { to: open ? 330 : 120, vol: 0.18, type: 'square', attack: 0.01 });
    noise(0.08, { type: 'lowpass', freq: 900, vol: 0.12 });
  },
  undo() {
    tone(480, 0.09, { to: 300, vol: 0.14, type: 'triangle' });
  },
  button() {
    tone(660, 0.05, { vol: 0.12, type: 'triangle' });
  },
  hint() {
    tone(784, 0.14, { vol: 0.12, type: 'sine' });
    tone(1175, 0.2, { vol: 0.1, type: 'sine', delay: 0.08 });
  },
  stuck() {
    tone(392, 0.22, { vol: 0.16, type: 'triangle' });
    tone(311, 0.32, { vol: 0.16, type: 'triangle', delay: 0.18 });
  },
  win() {
    [0, 2, 4, 5, 7].forEach((s, i) => tone(note(s, 523.25), 0.45, { vol: 0.15, type: 'triangle', delay: i * 0.09 }));
    noise(0.6, { type: 'highpass', freq: 6000, vol: 0.08, delay: 0.4 });
    tone(note(10, 523.25), 0.8, { vol: 0.12, delay: 0.48 });
  },
  star(i: number) {
    tone(note(5 + i * 2, 523.25), 0.25, { vol: 0.14, type: 'triangle' });
  },
};
