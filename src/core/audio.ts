// Procedural sound effects with WebAudio (no audio files).
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const last: Record<string, number> = {};

/** Called at boot (the context starts suspended: opening the audio device is slow, so it happens
 *  behind the loading screen) and on every user gesture (which lets it resume). */
export function initAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  } catch { return; }
  master = ctx.createGain();
  master.gain.value = 0.45;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setVolume(v: number): void { if (master) master.gain.value = v; }

function throttle(name: string, ms: number): boolean {
  const now = performance.now();
  if (last[name] && now - last[name] < ms) return true;
  last[name] = now;
  return false;
}

function env(g: GainNode, t: number, a: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
}

interface NoiseOpts { dur?: number; freq?: number; q?: number; type?: BiquadFilterType; gain?: number; sweep?: number | null; attack?: number }
function noise({ dur = 0.3, freq = 1200, q = 1, type = 'bandpass', gain = 0.5, sweep = null, attack = 0.005 }: NoiseOpts): void {
  const c = ctx!;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = c.createGain(); env(g, t, attack, gain, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random()); src.stop(t + dur + attack + 0.05);
}

interface ToneOpts { freq?: number; to?: number | null; dur?: number; type?: OscillatorType; gain?: number; attack?: number; delay?: number }
function tone({ freq = 440, to = null, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.005, delay = 0 }: ToneOpts): void {
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain(); env(g, t, attack, gain, dur);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + dur + attack + 0.05);
}

/** Continuous hum (used by channeled skills). Returns a stop() function. */
function hum(freq: number, type: OscillatorType = 'sawtooth'): () => void {
  const c = ctx!;
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 6;
  const lfo = c.createOscillator(); lfo.frequency.value = 7;
  const lg = c.createGain(); lg.gain.value = 300;
  lfo.connect(lg).connect(f.frequency);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
  o.connect(f); o2.connect(f); f.connect(g).connect(master!);
  o.start(); o2.start(); lfo.start();
  return () => {
    const n = c.currentTime;
    g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.15);
    o.stop(n + 0.2); o2.stop(n + 0.2); lfo.stop(n + 0.2);
  };
}

/** Wrap a sound so it silently does nothing until audio is unlocked. */
const guard = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A): R | undefined => (ctx ? fn(...a) : undefined);
export const sfx = {
  bolt: guard(() => { if (throttle('bolt', 60)) return; noise({ dur: 0.18, freq: 2400, sweep: 700, q: 2, gain: 0.18 }); tone({ freq: 900, to: 400, dur: 0.15, type: 'triangle', gain: 0.06 }); }),
  boltHit: guard(() => { if (throttle('boltHit', 45)) return; noise({ dur: 0.12, freq: 3000, q: 1.5, gain: 0.12 }); }),
  starfallCall: guard(() => { noise({ dur: 0.5, freq: 400, sweep: 3000, q: 3, gain: 0.12 }); }),
  starfallImpact: guard(() => { if (throttle('sfi', 50)) return; noise({ dur: 0.6, freq: 180, type: 'lowpass', gain: 0.6 }); tone({ freq: 90, to: 35, dur: 0.5, gain: 0.45 }); noise({ dur: 0.3, freq: 4000, q: 0.8, gain: 0.1 }); }),
  lance: guard(() => hum(110)),
  nova: guard(() => { noise({ dur: 0.7, freq: 5000, sweep: 800, q: 1, gain: 0.25 }); [1320, 1760, 2090].forEach((f, i) => tone({ freq: f, dur: 0.8, gain: 0.05, delay: i * 0.04 })); }),
  maelstrom: guard(() => { noise({ dur: 1.2, freq: 300, sweep: 1200, q: 4, gain: 0.25, attack: 0.2 }); }),
  zap: guard(() => { if (throttle('zap', 70)) return; noise({ dur: 0.1, freq: 6000, type: 'highpass', gain: 0.12 }); tone({ freq: 180, to: 60, dur: 0.1, type: 'square', gain: 0.05 }); }),
  aegis: guard(() => { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.9, gain: 0.07, type: 'sine', delay: i * 0.05 })); }),
  potion: guard(() => { noise({ dur: 0.35, freq: 800, sweep: 2500, q: 5, gain: 0.15 }); tone({ freq: 440, to: 880, dur: 0.4, gain: 0.08 }); }),
  hurt: guard(() => { if (throttle('hurt', 120)) return; noise({ dur: 0.18, freq: 500, type: 'lowpass', gain: 0.35 }); tone({ freq: 160, to: 90, dur: 0.15, type: 'square', gain: 0.05 }); }),
  enemyDie: guard(() => { if (throttle('die', 40)) return; noise({ dur: 0.35, freq: 700, sweep: 200, q: 1, gain: 0.18 }); }),
  slam: guard(() => { noise({ dur: 0.8, freq: 120, type: 'lowpass', gain: 0.7 }); tone({ freq: 60, to: 28, dur: 0.6, gain: 0.5 }); }),
  witchCast: guard(() => { if (throttle('wc', 90)) return; tone({ freq: 300, to: 700, dur: 0.3, type: 'sawtooth', gain: 0.03 }); }),
  loot: guard((r: number) => { const base = [520, 620, 740, 880, 1040][r] || 520; tone({ freq: base, dur: 0.35, gain: 0.08 }); if (r >= 3) tone({ freq: base * 1.5, dur: 0.6, gain: 0.07, delay: 0.08 }); if (r >= 4) tone({ freq: base * 2, dur: 0.9, gain: 0.06, delay: 0.16 }); }),
  pickup: guard(() => { if (throttle('pickup', 60)) return; tone({ freq: 1200, to: 1600, dur: 0.08, gain: 0.05 }); }),
  waveStart: guard(() => { tone({ freq: 110, dur: 1.4, type: 'sawtooth', gain: 0.08, attack: 0.2 }); tone({ freq: 165, dur: 1.4, type: 'sawtooth', gain: 0.05, attack: 0.25 }); noise({ dur: 1.0, freq: 200, type: 'lowpass', gain: 0.3, attack: 0.1 }); }),
  waveClear: guard(() => { [392, 494, 587, 784].forEach((f, i) => tone({ freq: f, dur: 1.0, gain: 0.07, type: 'triangle', delay: i * 0.1 })); }),
  death: guard(() => { tone({ freq: 220, to: 55, dur: 2.0, type: 'sawtooth', gain: 0.1 }); noise({ dur: 1.5, freq: 300, type: 'lowpass', gain: 0.3 }); }),
  salvage: guard(() => { noise({ dur: 0.25, freq: 900, sweep: 200, q: 2, gain: 0.25 }); tone({ freq: 300, to: 120, dur: 0.2, type: 'square', gain: 0.04 }); }),
  swing: guard(() => { if (throttle('swing', 70)) return; noise({ dur: 0.2, freq: 900, sweep: 2600, q: 1.4, gain: 0.2, attack: 0.03 }); }),
  clang: guard(() => { if (throttle('clang', 60)) return; noise({ dur: 0.15, freq: 3200, q: 3, gain: 0.14 }); tone({ freq: 1180, to: 900, dur: 0.18, type: 'triangle', gain: 0.04 }); tone({ freq: 220, to: 110, dur: 0.12, type: 'square', gain: 0.04 }); }),
  rush: guard(() => { noise({ dur: 0.45, freq: 220, sweep: 600, type: 'lowpass', gain: 0.45, attack: 0.04 }); tone({ freq: 70, to: 45, dur: 0.4, gain: 0.3 }); }),
  /** a rising hum over a skill's charge-up of `dur` seconds */
  charge: guard((dur: number) => { tone({ freq: 70, to: 260, dur, type: 'sawtooth', gain: 0.05, attack: 0.3 }); noise({ dur, freq: 300, sweep: 2400, q: 3, gain: 0.08, attack: 0.4 }); }),
  roar: guard(() => { tone({ freq: 95, to: 70, dur: 0.9, type: 'sawtooth', gain: 0.1, attack: 0.05 }); tone({ freq: 142, to: 104, dur: 0.9, type: 'sawtooth', gain: 0.06, attack: 0.06 }); noise({ dur: 0.8, freq: 600, q: 0.8, gain: 0.25, attack: 0.06 }); }),
  click: guard(() => tone({ freq: 700, dur: 0.05, gain: 0.04, type: 'triangle' })),
  spawn: guard(() => { if (throttle('spawn', 150)) return; noise({ dur: 0.6, freq: 250, sweep: 1500, q: 6, gain: 0.12, attack: 0.1 }); }),
};
