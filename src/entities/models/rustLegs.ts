// A body's leg IK done by the engine (Bulwark's port of `ik.ts`'s `LegIK`, `motion/legs`, held to this script's own
// numbers by `npm run lab -- legtape`): its rig's joints handed over before each call that reads them and taken back
// after, the floor handed over as it changes. VictorZakharov/last-stand#973: the animation moves into Rust whole.
// `--tune legsRust.on=0` keeps the script's own, to compare.
import type { Node } from '../../engine/api/index.ts';
import type { Legs } from '../../engine/pkg/bulwark';
import { rustCalls } from '../../engine/rustCalls';
import { tunable } from '../../core/tuning';
import { GROUND_EDGES, GROUND_LEVELS, reliefNow, reliefStamp } from '../../world/ground';
import type { Joints } from './rig';

/** Whether a body's leg IK is the engine's (read as each body's IK is made). */
export const LEGS_RUST = tunable('legsRust', { on: 1 });

/** the rig's joints by name, in the order the engine's `Named` takes them */
const NAMED = [
  'root', 'body', 'hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
] as const;
/** euler orders as the engine numbers them (`Order::from_index`) */
const ORDERS = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'] as const;
/** the numbers a joint is handed over with, and taken back with (those and which turn it wrote) */
const PUT = 14;
const TAKEN = 15;
/** the numbers a foot is read back with (`Legs::feet`) */
const FOOT = 18;
/** a foot's state as the engine numbers it */
export const FOOT_STATES = ['plant', 'swing', 'timed'] as const;
/** why a foot's last stride left as the engine numbers it (`LeftFor`), in the words the script's IK keeps; an early
 *  one's reason after `early: ` */
const LEFT_FOR = ['', 'closing the stop', 'late, past its window', 'its window', 'early: '];
const EARLY_BECAUSE = ['out of reach', 'dragged, or its leg past a range', 'across the pelvis', 'far behind'];

/** A stride's reason by its engine code (`LeftFor`). */
function leftFor(code: number): string {
  return LEFT_FOR[code] ?? `early: ${EARLY_BECAUSE[code - LEFT_FOR.length]}`;
}

/** each body's engine side let go as its script's side is collected (a foe's body, dissolved) */
const FREED = new FinalizationRegistry<Legs>((legs) => legs.free());

/** the floor's relief as last handed to the engine (`reliefStamp`), -1 none yet */
let groundSent = -1;

/** The floor handed to the engine where it changed since. */
function sendGround(): void {
  const stamp = reliefStamp();
  if (stamp === groundSent) return;
  const calls = rustCalls();
  if (!calls) return;
  const relief = reliefNow();
  const heights = relief?.heights ?? new Float32Array(0);
  calls.legs_ground(Float64Array.from(GROUND_LEVELS), Float64Array.from(GROUND_EDGES), heights, relief?.half ?? 0,
    relief?.cell ?? 0, relief?.n ?? 0, relief?.dais !== false);
  groundSent = stamp;
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

/** A foot as the engine reads it back. */
export interface FootRead {
  state: (typeof FOOT_STATES)[number];
  x: number;
  y: number;
  z: number;
  yaw: number;
  stand: { x: number; z: number } | null;
  syaw: number;
  /** where its stride lands, and how far through it it is */
  bx: number;
  by: number;
  bz: number;
  t: number;
  /** what the lab reads: dragged, out of reach, where it is in its window, its pitch, why its last stride left */
  dragged: boolean;
  over: boolean;
  window: number;
  pitch: number;
  leftFor: string;
}

/** The frame's plan as the lab reads it (`GaitFrame`'s). */
export interface PlanRead {
  duty: number;
  cycle: number;
  curve: number;
  speed: number;
}

/** One body's leg IK in the engine: its rig handed over round each call that reads it. */
export class RustLegs {
  private readonly legs: Legs;
  private readonly nodes: Node[];
  private readonly state: Float64Array;
  private readonly taken: Float64Array;
  private readonly footNumbers = new Float64Array(FOOT * 2);
  private readonly readNumbers = new Float64Array(9);
  private shaped = false;

  /** The engine's IK for `j`'s rig, or null where the engine's module hasn't loaded or it's switched off. */
  static of(j: Joints): RustLegs | null {
    const calls = rustCalls();
    if (!LEGS_RUST.on || !calls) return null;
    return new RustLegs(j, calls.Legs);
  }

  private constructor(private readonly j: Joints, LegsOf: typeof Legs) {
    const named = NAMED.map((name) => j[name] as Node);
    const { nodes, parents } = nodesOver(j.root, new Set(named));
    this.nodes = nodes;
    const indices = Uint32Array.from(named.map((node) => nodes.indexOf(node)));
    this.legs = new LegsOf(Int32Array.from(parents), indices, j.P.thighL, j.P.shinL);
    this.state = new Float64Array(16 + nodes.length * PUT);
    this.taken = new Float64Array(nodes.length * TAKEN);
    FREED.register(this, this.legs);
  }

  /** The rig handed over as it stands: the root brought up to date as the script's calls bring it. */
  private put(): void {
    const root = this.j.root;
    root.updateWorldMatrix(true, false);
    const state = this.state;
    state.set(root.matrixWorld.elements);
    let at = 16;
    for (const node of this.nodes) {
      const { position: p, quaternion: q, scale: s } = node;
      // (the quaternion read first: a turn written as angles is made a quaternion as it's read)
      state[at + 7] = q.x;
      state[at + 8] = q.y;
      state[at + 9] = q.z;
      state[at + 10] = q.w;
      const r = node.rotation;
      state[at] = p.x;
      state[at + 1] = p.y;
      state[at + 2] = p.z;
      state[at + 3] = r.x;
      state[at + 4] = r.y;
      state[at + 5] = r.z;
      state[at + 6] = ORDERS.indexOf(r.order as (typeof ORDERS)[number]);
      state[at + 11] = s.x;
      state[at + 12] = s.y;
      state[at + 13] = s.z;
      at += PUT;
    }
    this.legs.put(state);
  }

  /** The joints the call moved written back, each turn as the engine wrote it (so it rounds as the engine's). */
  private take(): void {
    const taken = this.taken;
    this.legs.take(taken);
    const state = this.state;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const at = i * TAKEN;
      const was = 16 + i * PUT;
      if (taken[at] !== state[was] || taken[at + 1] !== state[was + 1] || taken[at + 2] !== state[was + 2]) {
        node.position.set(taken[at], taken[at + 1], taken[at + 2]);
      }
      const written = taken[at + 14];
      if (written === 1) {
        node.rotation.set(taken[at + 3], taken[at + 4], taken[at + 5]);
      } else if (written === 2 || this.turned(at, was)) {
        node.quaternion.set(taken[at + 7], taken[at + 8], taken[at + 9], taken[at + 10]);
      }
    }
  }

  /** Whether a joint's quaternion came back other than it went. */
  private turned(at: number, was: number): boolean {
    const taken = this.taken;
    const state = this.state;
    return taken[at + 7] !== state[was + 7] || taken[at + 8] !== state[was + 8]
      || taken[at + 9] !== state[was + 9] || taken[at + 10] !== state[was + 10];
  }

  intend(x: number, z: number, facesWay: boolean): void {
    this.legs.intend(x, z, facesWay);
  }

  stance(i: number, x: number | null, z: number, yaw: number): void {
    this.legs.stance(i, x === null, x ?? 0, z, yaw);
  }

  reset(): void {
    this.legs.reset();
  }

  setOff(phase: number): number {
    this.put();
    const out = this.legs.set_off(phase);
    this.take();
    return out;
  }

  captureArms(): void {
    this.put();
    this.legs.capture_arms();
  }

  holdArms(weight: number): void {
    this.put();
    this.legs.hold_arms(weight);
    this.take();
  }

  /** `update`, its feet's shapes handed over first (`shape`, the script's `footShape` of each ankle). */
  update(args: UpdateArgs, active: boolean, rooted: boolean, shape: () => number[]): void {
    sendGround();
    if (!this.shaped) {
      this.legs.shape(Float64Array.from(shape()));
      this.shaped = true;
    }
    this.put();
    const { dt, phase, dead, weight, lean, legW } = args;
    this.legs.update(dt, phase, dead, weight, lean, !!legW, legW?.[0] ?? 0, legW?.[1] ?? 0, active, rooted);
    this.take();
  }

  bodyPhase(phase: number, side?: number): number {
    return this.legs.body_phase(phase, side ?? -1);
  }

  thighForward(side: number): number {
    return this.legs.thigh_forward(side);
  }

  get cadence(): number {
    return this.legs.cadence();
  }

  get lean(): number {
    return this.legs.lean();
  }

  get hipsTurn(): number {
    return this.legs.hips_turn();
  }

  get pelvisYaw(): number {
    return this.legs.pelvis_yaw();
  }

  get walking(): boolean {
    return this.legs.walking();
  }

  /** The walk cycle as the gait reads it and the pelvis's drop (the lab's reads). */
  reads(): { phase: number; rate: number; backing: boolean; dropped: number; wanted: number } & PlanRead {
    const out = this.readNumbers;
    this.legs.reads(out);
    const plan = { duty: out[5], cycle: out[6], curve: out[7], speed: out[8] };
    return { phase: out[0], rate: out[1], backing: out[2] === 1, dropped: out[3], wanted: out[4], ...plan };
  }

  /** Each foot as the engine has it, for what the game reads of the feet. */
  feet(): [FootRead, FootRead] {
    const out = this.footNumbers;
    this.legs.feet(out);
    const foot = (at: number): FootRead => ({
      state: FOOT_STATES[out[at]],
      x: out[at + 1],
      y: out[at + 2],
      z: out[at + 3],
      yaw: out[at + 4],
      stand: out[at + 5] === 1 ? { x: out[at + 6], z: out[at + 7] } : null,
      syaw: out[at + 8],
      bx: out[at + 9],
      by: out[at + 10],
      bz: out[at + 11],
      t: out[at + 12],
      dragged: out[at + 13] === 1,
      over: out[at + 14] === 1,
      window: out[at + 15],
      pitch: out[at + 16],
      leftFor: leftFor(out[at + 17]),
    });
    return [foot(0), foot(FOOT)];
  }
}

/** `update`'s arguments as the script's takes them. */
export interface UpdateArgs {
  dt: number;
  phase: number;
  dead: number;
  weight: number;
  lean: number;
  legW?: readonly [number, number];
}
