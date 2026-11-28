// tools/lab `drapetape`: the hero's cloth drape calls (models/armor.ts `Skirt.drape`, the engine's `drape_cloth`,
// Bulwark's cloth.rs) written down as he walks and stands, each call's input and the points it gave back, for the
// engine's own bench to replay with no browser (`cargo run --profile harness --bin drape -- <tape>` in Bulwark): there
// each change to the drape is timed natively and held to the points the page's build gave, call for call.
import { rustCalls, rustCallsReady, type RustCalls } from '../../../src/engine/rustCalls';
import type { Lab, Report } from './lab';

/** What `lab drapetape` takes. */
export interface DrapeTapeOptions {
  /** the hero's frames walking, then as many standing */
  frames?: number;
  /** the canary: one call's points given back moved, which the bench must find unlike the drape's */
  canary?: boolean;
}

/** What `lab drapetape` gives back: its report and the tape, base64 (node writes it to a file). */
export interface DrapeTapeReport extends Report {
  tape: string;
}

/** how many times every call is draped again in the page to time the engine's drape there */
const ROUNDS = 50;
/** frames walking by default, then as many standing */
const FRAMES = 120;
/** the tape's first eight bytes (its format's name and version) */
const MAGIC = 'DRAPE1\0\0';
/** the canary's call, and how far it moves its first hanging point (m) */
const CANARY_CALL = 3;
const CANARY_MOVE = 0.01;

/** One call to the drape: its arguments as given, and the points it gave back. */
interface Call {
  frame: number;
  before: Float32Array;
  after: Float32Array;
  down: Float32Array;
  round: Float32Array;
  limbs: Float64Array;
  hands: number;
  cols: number;
  layer: number;
  slit: boolean;
  tucked: boolean;
  angles: Float32Array;
  passes: number;
}

type Drape = RustCalls['drape_cloth'];

/** `calls`' drape wrapped to write each call into `tape`, `frame` its frame now. */
function recording(original: Drape, tape: Call[], frame: () => number): Drape {
  return (points, down, round, limbs, hands, cols, layer, slit, tucked, angles, passes) => {
    const before = Float32Array.from(points);
    original(points, down, round, limbs, hands, cols, layer, slit, tucked, angles, passes);
    tape.push({
      frame: frame(),
      before,
      after: Float32Array.from(points),
      down: Float32Array.from(down),
      round: Float32Array.from(round),
      limbs: Float64Array.from(limbs),
      hands,
      cols,
      layer,
      slit,
      tucked,
      angles: Float32Array.from(angles),
      passes,
    });
  };
}

/** The bytes a call takes on the tape. */
function callBytes(call: Call): number {
  // (nine u32: its frame, columns, hands, passes, flags and four lengths; its layer an f64)
  const header = 4 * 9 + 8;
  const points = call.before.length * 4 * 2;
  const lengths = (call.down.length + call.round.length + call.angles.length) * 4;
  return header + points + lengths + call.limbs.length * 8;
}

/** Writes each value in turn into a `DataView`, little-endian. */
class TapeWriter {
  private at = 0;
  constructor(private readonly view: DataView) {}

  u32(value: number): void {
    this.view.setUint32(this.at, value, true);
    this.at += 4;
  }

  f64(value: number): void {
    this.view.setFloat64(this.at, value, true);
    this.at += 8;
  }

  f32s(values: Float32Array): void {
    for (const value of values) {
      this.view.setFloat32(this.at, value, true);
      this.at += 4;
    }
  }

  f64s(values: Float64Array): void {
    for (const value of values) this.f64(value);
  }

  bytes(text: string): void {
    for (let i = 0; i < text.length; i++) this.view.setUint8(this.at++, text.charCodeAt(i));
  }
}

/**
 * The tape: `MAGIC`, the calls' count, then each call: its frame, columns, hands, passes and flags (1 slit, 2 tucked)
 * as u32, its layer as f64, the lengths of its points, limbs and angles as u32, then the points before and after,
 * the lengths down and round (one a point), the limbs (f64) and the angles.
 */
function tapeOf(calls: Call[]): Uint8Array {
  const total = MAGIC.length + 4 + calls.reduce((sum, call) => sum + callBytes(call), 0);
  const buffer = new ArrayBuffer(total);
  const writer = new TapeWriter(new DataView(buffer));
  writer.bytes(MAGIC);
  writer.u32(calls.length);
  for (const call of calls) {
    writer.u32(call.frame);
    writer.u32(call.cols);
    writer.u32(call.hands);
    writer.u32(call.passes);
    writer.u32((call.slit ? 1 : 0) | (call.tucked ? 2 : 0));
    writer.f64(call.layer);
    writer.u32(call.before.length);
    writer.u32(call.limbs.length);
    writer.u32(call.angles.length);
    writer.u32(call.down.length);
    writer.f32s(call.before);
    writer.f32s(call.after);
    writer.f32s(call.down);
    writer.f32s(call.round);
    writer.f64s(call.limbs);
    writer.f32s(call.angles);
  }
  return new Uint8Array(buffer);
}

/** `bytes` as base64. */
function base64Of(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}

/** The browser's own clock (the page's `performance.now` is the lab's, standing still within a frame). */
function realNow(): number {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  return clock.realNow();
}

/** Every call draped again `ROUNDS` times by the engine's wasm in this page: its time a call (us), to set beside the
 *  engine's native bench on the same tape. */
function timedInPage(drape: Drape, calls: Call[]): number {
  const scratch = calls.map((call) => Float32Array.from(call.before));
  const start = realNow();
  for (let round = 0; round < ROUNDS; round++) {
    calls.forEach((call, index) => {
      const points = scratch[index];
      points.set(call.before);
      drape(points, call.down, call.round, call.limbs, call.hands, call.cols, call.layer, call.slit, call.tucked,
        call.angles, call.passes);
    });
  }
  return ((realNow() - start) * 1000) / ROUNDS / calls.length;
}

/** The calls' sizes said in a line each kind: how many a frame, their points, limbs and passes. */
function summaryOf(calls: Call[], frames: number): string {
  const kinds = new Map<string, number>();
  for (const call of calls) {
    const key = `${call.before.length / 3} points, ${call.cols} round, ${call.limbs.length / 8} limbs `
      + `(${call.hands} hands), ${call.passes} passes`;
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }
  const lines = [...kinds].map(([key, count]) => `  ${count} calls: ${key}`);
  return [`${calls.length} drape calls over ${frames} frames`, ...lines].join('\n');
}

/** `lab drapetape`: the hero walks and stands, every drape call written down. */
export async function drapeTape(lab: Lab, options: DrapeTapeOptions): Promise<DrapeTapeReport> {
  await lab.setup({ at: [12, 22], facing: 0, wear: ['helm', 'chest'] });
  const original = rustCalls();
  if (!original) return { text: 'the engine\'s module has not loaded', problems: ['drapetape: no engine'], tape: '' };
  const calls: Call[] = [];
  let frame = 0;
  rustCallsReady({ ...original, drape_cloth: recording(original.drape_cloth, calls, () => frame) });
  const frames = options.frames ?? FRAMES;
  try {
    await lab.step(frames, () => {
      frame++;
      return { keys: ['w'] };
    });
    await lab.step(frames, () => {
      frame++;
      return {};
    });
  } finally {
    rustCallsReady(original);
  }
  if (!calls.length) return { text: 'no drape was called', problems: ['drapetape: no drape called'], tape: '' };
  if (options.canary && calls.length > CANARY_CALL) {
    const call = calls[CANARY_CALL];
    call.after[call.cols * 3] += CANARY_MOVE;
  }
  const perCall = timedInPage(original.drape_cloth, calls);
  const timing = `draped again in this page by the engine's wasm: ${perCall.toFixed(1)} us a call (${ROUNDS} rounds)`;
  const text = [summaryOf(calls, frames * 2), timing].join('\n');
  return { text, problems: [], tape: base64Of(tapeOf(calls)) };
}
