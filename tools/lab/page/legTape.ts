// tools/lab `legtape`: every call the game makes to the leg IK (models/ik.ts `LegIK`) written down as the hero walks,
// turns and stops among walking foes, each call's arguments, the rig's joints before and after it and what it gave
// back, for Bulwark's port of it (`src/motion/legs/`) to replay with no browser (`cargo run --profile harness --bin
// legs -- <tape>`): there the port is held to the page's joints call for call, and timed natively.
import { LegIK } from '../../../src/entities/models/ik';
import { LEGS_RUST } from '../../../src/entities/models/rustLegs';
import type { Joints } from '../../../src/entities/models/rig';
import type { Node } from '../../../src/engine/api/index.ts';
import { GROUND_EDGES, GROUND_LEVELS, reliefNow } from '../../../src/world/ground';
import { Vec3 } from '../../../src/engine/api/index.ts';
import type { EnemyId } from '../../../src/data/enemies';
import type { Lab, Report } from './lab';

/** What `lab legtape` takes. */
export interface LegTapeOptions {
  /** frames of each leg of the hero's walk (forward, round, back, standing) */
  frames?: number;
  /** the canary: one update's joints given back turned, which the replay must find unlike the port's */
  canary?: boolean;
  /** the game's bodies doing their leg IK by the engine's port (`rustLegs.ts`), the calls as they hand them over: its
   *  replay holds what the game handed over and took back to the port's own; by default the script's own IK */
  engine?: boolean;
}

/** What `lab legtape` gives back: its report and the tape, base64 (node writes it to a file). */
export interface LegTapeReport extends Report {
  tape: string;
}

/** the tape's first eight bytes (its format's name and version) */
const MAGIC = 'LEGS1\0\0\0';
/** frames of each leg of the walk by default */
const FRAMES = 90;
/** the foes that walk at him, each from a spot by the arena's edge */
const FOES: [EnemyId, number, number][] = [['husk', -14, 6], ['brute', 14, -4], ['imp', -6, -16], ['husk', 10, 16]];
/** the canary's call (an update), and how far it turns the first joint's quaternion's x */
const CANARY_UPDATE = 40;
const CANARY_TURN = 0.01;

/** the rig's joints by name, in the order the port's `Named` takes them */
const NAMED = [
  'root', 'body', 'hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
] as const;
/** euler orders as the port numbers them (`Order::from_index`) */
const ORDERS = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];

/** The calls on the tape, as the replay numbers them. */
const KIND = {
  intend: 0, stance: 1, reset: 2, setOff: 3, captureArms: 4, holdArms: 5, update: 6, bodyPhase: 7, thighForward: 8,
  cadence: 9, lean: 10, hipsTurn: 11, pelvisYaw: 12, walking: 13,
} as const;
type Kind = (typeof KIND)[keyof typeof KIND];

/** the calls that read or write the joints: the rig is written before and after them */
const READS_JOINTS = new Set<Kind>([KIND.setOff, KIND.captureArms, KIND.holdArms, KIND.update]);

/** One body's rig: the nodes from its root on the ways to its named joints, depth first. */
interface Rig {
  legs: LegIK;
  nodes: Node[];
  parents: number[];
  named: number[];
  thigh: number;
  shin: number;
  /** first seen as made: no frame of the leg IK's before the tape began (a body that had some is replayed by
   *  nothing, its state unknown) */
  pristine: boolean;
}

/** One call as made: its body, kind, arguments, the joints before and after, what it gave back. */
interface Call {
  rig: number;
  kind: Kind;
  args: number[];
  before: number[] | null;
  after: number[] | null;
  result: number;
}

/** A body's joints, its legs' private side the page doesn't show (read for the tape alone). */
function jointsOf(legs: LegIK): Joints {
  return (legs as unknown as { j: Joints }).j;
}

/** The nodes from `root` on the ways down to `wanted`, depth first, each with its parent's index. */
function nodesOver(root: Node, wanted: Set<Node>): { nodes: Node[]; parents: number[] } {
  const leads = (node: Node): boolean => wanted.has(node) || node.children.some((kid) => leads(kid as Node));
  const nodes: Node[] = [];
  const parents: number[] = [];
  const walk = (node: Node, parent: number): void => {
    const index = nodes.length;
    nodes.push(node);
    parents.push(parent);
    for (const kid of node.children) {
      if (leads(kid as Node)) walk(kid as Node, index);
    }
  };
  walk(root, -1);
  return { nodes, parents };
}

/** A body's rig, as the replay builds it. */
function rigOf(legs: LegIK): Rig {
  const j = jointsOf(legs);
  const named = NAMED.map((name) => j[name] as Node);
  const { nodes, parents } = nodesOver(j.root, new Set(named));
  const indices = named.map((node) => nodes.indexOf(node));
  return { legs, nodes, parents, named: indices, thigh: j.P.thighL, shin: j.P.shinL, pristine: pristine(legs) };
}

/** Whether a body's leg IK is as made: never updated, its feet never placed. */
function pristine(legs: LegIK): boolean {
  const inside = legs as unknown as { w: number; sp: number; lastPhase: number; last: Vec3 };
  const feetUnplaced = legs.feet.every((foot) => foot.P.x === 0 && foot.P.y === 0 && foot.P.z === 0);
  const still = inside.w === 0 && inside.sp === 0 && inside.lastPhase === 0;
  return still && feetUnplaced && inside.last.x === 0 && inside.last.z === 0;
}

/** A rig's state as the replay reads it: its root's matrix in the world, then each node's place, angles, their
 *  order, quaternion and size (both turns read fresh). */
function stateOf(rig: Rig): number[] {
  const out: number[] = [...rig.nodes[0].matrixWorld.elements];
  for (const node of rig.nodes) {
    const { position: p, rotation: r, quaternion: q, scale: s } = node;
    out.push(p.x, p.y, p.z, r.x, r.y, r.z, ORDERS.indexOf(r.order), q.x, q.y, q.z, q.w, s.x, s.y, s.z);
  }
  return out;
}

/** The browser's own clock (the page's `performance.now` is the lab's, standing still within a frame). */
function realNow(): number {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  return clock.realNow();
}

/** Records every call to every body's leg IK into `calls` while on. */
class Recorder {
  readonly rigs: Rig[] = [];
  readonly calls: Call[] = [];
  private readonly ids = new WeakMap<LegIK, number>();
  /** the browser's time spent in the leg IK's own calls (ms), the tape's writing left out */
  spent = 0;
  private readonly undo: (() => void)[] = [];

  /** The body's rig's index, its rig written the first time it's seen. */
  rigFor(legs: LegIK): number {
    let id = this.ids.get(legs);
    if (id === undefined) {
      id = this.rigs.length;
      this.rigs.push(rigOf(legs));
      this.ids.set(legs, id);
    }
    return id;
  }

  /** `kind`'s call made by `run` on `legs` with `args` (as numbers), its rig written round it where it reads it. */
  record(legs: LegIK, kind: Kind, args: number[], run: () => unknown): unknown {
    const rig = this.rigFor(legs);
    const reads = READS_JOINTS.has(kind);
    // (what the game sets on it directly: whether it's on this frame, whether its planted feet are held)
    if (kind === KIND.update) args.push(legs.active ? 1 : 0, legs.rooted ? 1 : 0);
    const before = reads ? stateOf(this.rigs[rig]) : null;
    const start = realNow();
    const result = run();
    this.spent += realNow() - start;
    // (the root's matrix as the call left it: a call that brings it up to date reads it so, and none moves it)
    if (before) before.splice(0, 16, ...this.rigs[rig].nodes[0].matrixWorld.elements);
    const after = reads ? stateOf(this.rigs[rig]) : null;
    this.calls.push({ rig, kind, args, before, after, result: Number(result ?? 0) });
    return result;
  }

  /** `name`'s method on every `LegIK` wrapped, its arguments made numbers by `argsOf`. */
  method(name: keyof LegIK & string, kind: Kind, argsOf: (args: unknown[]) => number[]): void {
    const proto = LegIK.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const original = proto[name];
    const recorder = this;
    proto[name] = function (this: LegIK, ...args: unknown[]) {
      return recorder.record(this, kind, argsOf(args), () => original.apply(this, args));
    };
    this.undo.push(() => {
      proto[name] = original;
    });
  }

  /** `name`'s getter on every `LegIK` wrapped. */
  getter(name: string, kind: Kind): void {
    const proto = LegIK.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, name);
    if (!original?.get) throw new Error(`legtape: LegIK has no getter ${name}`);
    const read = original.get;
    const recorder = this;
    Object.defineProperty(proto, name, {
      configurable: true,
      get(this: LegIK) {
        return recorder.record(this, kind, [], () => read.call(this));
      },
    });
    this.undo.push(() => Object.defineProperty(proto, name, original));
  }

  /** Every call the game makes wrapped. */
  install(): void {
    const num = (value: unknown, otherwise: number): number => (typeof value === 'number' ? value : otherwise);
    this.method('intend', KIND.intend, ([goal, facesWay]) => {
      const at = goal as Vec3;
      return [at.x, at.z, facesWay ? 1 : 0];
    });
    this.method('stance', KIND.stance, ([i, x, z, yaw]) => [
      num(i, 0), x === null ? 1 : 0, num(x, 0), num(z, 0), num(yaw, 0),
    ]);
    this.method('reset', KIND.reset, () => []);
    this.method('setOff', KIND.setOff, ([phase]) => [num(phase, 0)]);
    this.method('captureArms', KIND.captureArms, () => []);
    this.method('holdArms', KIND.holdArms, ([weight]) => [num(weight, 1)]);
    this.method('update', KIND.update, ([dt, phase, dead, weight, lean, legW]) => {
      const pair = legW as readonly [number, number] | undefined;
      const given = [num(dt, 0), num(phase, 0), num(dead, 0), num(weight, 1), num(lean, 1)];
      return [...given, pair ? 1 : 0, pair?.[0] ?? 0, pair?.[1] ?? 0];
    });
    this.method('bodyPhase', KIND.bodyPhase, ([phase, side]) => [num(phase, 0), num(side, -1)]);
    this.method('thighForward', KIND.thighForward, ([side]) => [num(side, 0)]);
    this.getter('cadence', KIND.cadence);
    this.getter('lean', KIND.lean);
    this.getter('hipsTurn', KIND.hipsTurn);
    this.getter('pelvisYaw', KIND.pelvisYaw);
    this.getter('walking', KIND.walking);
  }

  /** Every wrap taken off again. */
  uninstall(): void {
    for (const undo of this.undo.splice(0).reverse()) undo();
  }
}

/** Writes each value in turn, little-endian, into a buffer that grows. */
class TapeWriter {
  private bytes = new Uint8Array(1 << 20);
  private view = new DataView(this.bytes.buffer);
  private at = 0;

  private room(more: number): void {
    if (this.at + more <= this.bytes.length) return;
    const grown = new Uint8Array(Math.max(this.bytes.length * 2, this.at + more));
    grown.set(this.bytes);
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }

  u32(value: number): void {
    this.room(4);
    this.view.setUint32(this.at, value, true);
    this.at += 4;
  }

  i32(value: number): void {
    this.room(4);
    this.view.setInt32(this.at, value, true);
    this.at += 4;
  }

  f64(value: number): void {
    this.room(8);
    this.view.setFloat64(this.at, value, true);
    this.at += 8;
  }

  f64s(values: ArrayLike<number>): void {
    for (let i = 0; i < values.length; i++) this.f64(values[i]);
  }

  f32s(values: ArrayLike<number>): void {
    this.room(values.length * 4);
    for (let i = 0; i < values.length; i++) {
      this.view.setFloat32(this.at, values[i], true);
      this.at += 4;
    }
  }

  text(text: string): void {
    this.room(text.length);
    for (let i = 0; i < text.length; i++) this.view.setUint8(this.at++, text.charCodeAt(i));
  }

  done(): Uint8Array {
    return this.bytes.slice(0, this.at);
  }
}

/** A foot's shape as the leg IK read it at its first update (its private side), or none yet. */
function shapeOf(legs: LegIK): number[] | null {
  const inside = legs as unknown as {
    shape: { sole: number; toe: number; heel: number }[] | null;
    rust: unknown;
    shapeNumbers: () => number[];
  };
  // (the engine's port is handed the shapes as the script reads them, and the script keeps none)
  if (inside.rust) return inside.shapeNumbers();
  return inside.shape ? inside.shape.flatMap((foot) => [foot.sole, foot.toe, foot.heel]) : null;
}

/**
 * The tape: `MAGIC`; the ground (its levels and edges as f64, then 1 and its relief's half, cell (f64), n, dais (u32)
 * and heights (f32), or 0); the rigs (each: its nodes' count, each node's parent as i32, its named joints (u32), the
 * thigh and shin (f64), 1 if it was first seen as made (u32), and 1 and its feet's shapes (6 f64) or 0); then the calls (each: its rig, kind and its
 * arguments' count (u32), the arguments, what it gave back (f64), and for a call that reads the joints the state
 * before and after: the root's matrix and each node's 14 numbers, as f64).
 */
function tapeOf(recorder: Recorder): Uint8Array {
  const writer = new TapeWriter();
  writer.text(MAGIC);
  writer.f64s(GROUND_LEVELS);
  writer.f64s(GROUND_EDGES);
  const relief = reliefNow();
  writer.u32(relief ? 1 : 0);
  if (relief) {
    writer.f64(relief.half);
    writer.f64(relief.cell);
    writer.u32(relief.n);
    writer.u32(relief.dais === false ? 0 : 1);
    writer.f32s(relief.heights);
  }
  writer.u32(recorder.rigs.length);
  for (const rig of recorder.rigs) {
    writer.u32(rig.nodes.length);
    for (const parent of rig.parents) writer.i32(parent);
    for (const index of rig.named) writer.u32(index);
    writer.f64(rig.thigh);
    writer.f64(rig.shin);
    writer.u32(rig.pristine ? 1 : 0);
    const shape = shapeOf(rig.legs);
    writer.u32(shape ? 1 : 0);
    if (shape) writer.f64s(shape);
  }
  writer.u32(recorder.calls.length);
  for (const call of recorder.calls) {
    writer.u32(call.rig);
    writer.u32(call.kind);
    writer.u32(call.args.length);
    writer.f64s(call.args);
    writer.f64(call.result);
    if (call.before && call.after) {
      writer.f64s(call.before);
      writer.f64s(call.after);
    }
  }
  return writer.done();
}

/** `bytes` as base64. */
function base64Of(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}

/** The calls counted by kind, in a line. */
function summaryOf(recorder: Recorder): string {
  const names = Object.fromEntries(Object.entries(KIND).map(([name, kind]) => [kind, name]));
  const counts = new Map<string, number>();
  for (const call of recorder.calls) counts.set(names[call.kind], (counts.get(names[call.kind]) ?? 0) + 1);
  const kinds = [...counts].map(([name, count]) => `${name} ${count}`).join(', ');
  const fresh = recorder.rigs.filter((rig) => rig.pristine).length;
  const bodies = `${recorder.rigs.length} bodies (${fresh} first seen as made)`;
  const updates = recorder.calls.filter((call) => call.kind === KIND.update).length;
  const perFrame = (recorder.spent * 1000) / Math.max(1, updates);
  const time = `in the page: ${perFrame.toFixed(1)} us a body's frame (its calls, an update each; ${updates} updates)`;
  return `${recorder.calls.length} calls on ${bodies}: ${kinds}
${time}`;
}

/** The first joint's quaternion of the `CANARY_UPDATE`th update turned a little, as a port that went wrong would. */
function plantCanary(recorder: Recorder): void {
  const updates = recorder.calls.filter((call) => call.kind === KIND.update && call.after);
  const call = updates[CANARY_UPDATE] ?? updates[updates.length - 1];
  // (the first node's quaternion's x: after the root's matrix, its place and angles and order)
  if (call?.after) call.after[16 + 7] += CANARY_TURN;
}

/** `lab legtape`: the hero walks forward, round, back and stands among walking foes, every leg IK call written. */
export async function legTape(lab: Lab, options: LegTapeOptions): Promise<LegTapeReport> {
  // (on before the set-up, which builds the hero afresh: his leg IK is on the tape from its first call)
  const recorder = new Recorder();
  recorder.install();
  const engineWas = LEGS_RUST.on;
  LEGS_RUST.on = options.engine ? 1 : 0;
  const frames = options.frames ?? FRAMES;
  try {
    await lab.setup({ at: [0, 12], facing: 0 });
    for (const [type, x, z] of FOES) lab.spawnFoe(type, new Vec3(x, 0, z));
    await lab.step(frames, () => ({ keys: ['w'] }));
    await lab.step(frames, () => ({ keys: ['w', 'd'] }));
    await lab.step(frames, () => ({ keys: ['s'] }));
    await lab.step(frames, () => ({}));
  } finally {
    recorder.uninstall();
    LEGS_RUST.on = engineWas;
  }
  if (!recorder.calls.length) return { text: 'no leg IK was called', problems: ['legtape: no calls'], tape: '' };
  if (options.canary) plantCanary(recorder);
  const whose = options.engine ? 'the engine\'s port, as the game hands it over' : 'the script\'s own';
  const text = `${summaryOf(recorder)}\nthe leg IK: ${whose}`;
  return { text, problems: [], tape: base64Of(tapeOf(recorder)) };
}
