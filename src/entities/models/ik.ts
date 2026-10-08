// Leg IK for the humanoid rig: feet that stay where they are put. The procedural walk cycle (rig.ts `walkCycle`) swings
// the legs as rotations, which slides every foot along the floor; this runs after the pose and takes the legs over:
// a planted foot is held at a spot in the world while the body moves over it, a swinging foot arcs from where it left
// to where it will land (ahead of the body, predicted from its speed), a standing character re-steps when its feet
// have fallen far from under it or it turns, the pelvis drops when a foot would be out of reach, and a foot lies level
// on the ground (`groundHeight`, so the dais steps work). Each leg is then solved as two-bone IK (`reachArm`, hinged
// the other way) and blended over the pose it replaces. The stride's timing still comes from the walk cycle's own
// phase (the arms swing by it too), which the gait rate keeps in step with the speed (`gaitRate`).
//
// A frame of `LegIK.update` goes: the body's lean and the pelvis's turn (`leanIntoMotion`, `turnPelvis`), its motion
// and the gait's timing (`followMotion`), each foot stepped (`stepFoot`: a stride started or carried on, a step
// taken, a planted foot tended, the ankle's target placed), the pelvis dropped until both feet are in reach
// (`dropPelvis`), and each leg solved onto its target (`solveLeg`). What the steps share is the frame's `GaitFrame`.
//
// `LookAt` turns the neck and head onto a point of interest, within limits.
import * as THREE from 'three';
import type { Joints } from './rig';
import { reachArm } from './rig';
import { groundHeight } from '../../world/ground';
import { angleDamp, damp } from '../../util';
import { ROM, ROM_ON, clampAnkle, clampAnkleRoll, twistAngle } from './anatomy';

/** `?ik=0` keeps the walk cycle's own legs and its old gait, for A/B comparison */
export const IK = typeof location === 'undefined' || !/[?&]ik=0/.test(location.search);
/** the ankle joint's height above the sole, the same as `groundFeet`'s */
const FOOT_H = 0.07;

/** A foot's extent from its ankle, in the ankle's own frame (rig units). */
export interface FootShape {
  /** how far its sole hangs below the ankle */
  sole: number;
  /** how far it reaches ahead of the ankle, and behind it */
  toe: number;
  heel: number;
}

/** How a foot's sole hangs below its ankle, and how far it reaches ahead of it and behind it (rig units), from the
 *  bounds of the meshes on its ankle and of the skinned vertices the ankle owns. */
export function footShape(ankle: THREE.Object3D, root: THREE.Object3D): FootShape {
  const bounds = { sole: 0, toe: 0, heel: 0, any: false };
  const point = new THREE.Vector3();
  const take = (p: THREE.Vector3): void => {
    bounds.sole = Math.max(bounds.sole, -p.y);
    bounds.toe = Math.max(bounds.toe, p.z);
    bounds.heel = Math.max(bounds.heel, -p.z);
    bounds.any = true;
  };
  ankle.updateMatrix();
  const walk = (parent: THREE.Object3D, matrix: THREE.Matrix4): void => {
    for (const child of parent.children) {
      child.updateMatrix();
      const childMatrix = matrix.clone().multiply(child.matrix);
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry && (child as THREE.Mesh).isMesh && child.visible) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          take(point.fromBufferAttribute(positions, i).applyMatrix4(childMatrix));
        }
      }
      walk(child, childMatrix);
    }
  };
  walk(ankle, new THREE.Matrix4());
  // skinned pieces (a shin ending below the ankle): the vertices this bone owns, in the bone's own space at the bind
  // pose
  const bind = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.visible) return;
    const bone = mesh.skeleton.bones.indexOf(ankle as THREE.Bone);
    if (bone < 0) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!skinIndex || !skinWeight) return;
    bind.copy(mesh.skeleton.boneInverses[bone]).multiply(mesh.bindMatrix);
    for (let i = 0; i < position.count; i += 3) {
      let weight = 0;
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === bone) weight += skinWeight.getComponent(i, k);
      if (weight >= 0.999) take(point.fromBufferAttribute(position, i).applyMatrix4(bind));
    }
  });
  if (!bounds.any) return { sole: FOOT_H, toe: 0.14, heel: 0.05 };
  return {
    sole: Math.min(0.25, Math.max(0.03, bounds.sole)),
    toe: Math.min(0.4, Math.max(0.05, bounds.toe)),
    heel: Math.min(0.2, Math.max(0.02, bounds.heel)),
  };
}

const TAU = Math.PI * 2;
/** radians of forward lean per m/s of speed */
const LEAN = 0.045;
/** the fastest a foot's target may move (m/s at the scale of a man: a base and a share of the body's speed; a running
 *  swing peaks near twice it) */
const FOOT_V = 4, FOOT_VK = 2.5;
/** a foot in the air clears what is under it by this much, looking this far ahead along its way to its landing, in
 *  this many steps (m at a man's scale), and rising over what is ahead at this slope (m a metre) */
const CLEAR = 0.03, CLEAR_AHEAD = 0.35, CLEAR_STEPS = 7, CLEAR_SLOPE = 1;
/** how quickly a foot in the air settles once past a higher level (1/s) */
const CLEAR_DOWN = 12;
/** how far along its stride a moving foot's landing may move to keep its toes off a riser, in steps of (m at a man's
 *  scale) */
const RISER_SHIFT = 0.3, RISER_STEP = 0.01;
/** how far a planted foot may be turned from the body's facing (rad) */
const YAW_MAX = 0.5;
/** how far the pelvis may turn from the chest (rad) to face the way the body travels while its chest faces the aim */
const TWIST = 0.8;
/** a planted foot's way from its knee's at most (rad, inside the ankle's twist), and how far the knee turns from the
 *  hips' way at most (the hip's turn) */
const KNEE_FOOT = (ROM['ankle.twist'][1] - 6) * Math.PI / 180, HIP_TURN = (ROM['hip.rotation'][1] - 5) * Math.PI / 180;
/** how much sooner than those two together a planted foot pivots after the hips (rad: the knee's pole sits off its
 *  line, so the ankle measured 12 degrees more twisted than they add up to) */
const PIVOT_EARLY = 0.2;
/** a planted foot's twist on its shin at most (rad: a little past the ankle's range, within what the body's watch lets
 *  by; at the range or inside it, a foot pivoted at ordinary turns and the gait broke its rhythm and crossed its legs
 *  more) */
const ANKLE_TWIST = (ROM['ankle.twist'][1] + 3) * Math.PI / 180;
/** how far back from the pelvis a foot in the air's thigh goes at most (rad, a little inside the hip's extension) */
const HIP_BACK = (ROM['hip.flexion'][0] + 2) * Math.PI / 180;
/** how far a knee folds at most to keep its thigh within that (rad, between the thigh and the line to the foot), and
 *  how fast that fold comes and goes (rad/s) */
const FOLD_MOST = 1.4, FOLD_RATE = 3;
/** how far a foot in the air's thigh goes in across the body and out to its side at most (rad, a little inside the
 *  hip's adduction and abduction) */
const HIP_IN = (ROM['hip.abduction'][0] + 1) * Math.PI / 180, HIP_OUT = (ROM['hip.abduction'][1] - 1) * Math.PI / 180;
/** how far a planted foot's ankle may fall short of its target before it counts as dragged (m at a man's scale) */
const DRAG_SLACK = 0.03;
/** the share of the cycle on the ground from which the gait is a walk, a foot always down */
const WALK_SUPPORT = 0.5;
/** how much further behind its hip than its planned stance leaves it a planted foot is left behind (a share) */
const BEHIND_SPARE = 1.2;
/** how fast the pelvis sinks or rises for the legs' reach at most (m/s) */
const DROP_RATE = 1.5;
/** the most the pelvis sinks for the stance the gait plans (leg lengths: a stalking walk's bent knees) */
const CROUCH_MOST = 0.12;
/** how far a planted foot's heel lifts at most for a shin leaning over it (rad of pitch, as `peel`'s) */
const HEEL_MOST = 1.15;
/** how far a planted foot's heel lifts past what the ankle's bend needs (rad: the pitch moves the ankle, and the
 *  shin with it) */
const HEEL_SPARE = 0.02;
/** how many times a planted foot's pitch is set again for its ankle's bend */
const HEEL_PASSES = 3;
/** how far the chest may turn on the pelvis (rad, a little inside the trunk's range) */
const TRUNK = (ROM['spine.rotation'][1] - 3) * Math.PI / 180;
/** how long the legs go backwards along the pelvis's line after a reversal before it turns round to the new way (s) */
const BACK_HOLD = 0.7;
/** choosing whether the legs walk forwards or backwards along the pelvis: what a radian of the pelvis's turn costs
 *  against a radian of the legs going off its line, and how much better the other way must be to switch */
const TURN_COST = 0.4, HYST = 0.15;
/** how fast the pelvis may turn on the legs (rad/s) */
const TWIST_RATE = 4.5;
/** how fast the pelvis turns in the world at most (rad/s): the body's facing swung round onto the way it goes at a
 *  reversal by up to 42 degrees a frame, and the pelvis, turned from it, snapped round 35 degrees in one; the trunk
 *  takes the rest, within its turn, as a person turning round leads with the chest */
const PELVIS_TURN_MOST = 10;
/** how far off the pelvis's line the legs step before it turns towards the way they go (rad): a diagonal is walked
 *  with the hips half turned, as a person does, so going from forwards to backwards along it turns them less */
const SLACK = 0.35;
/** the tightest curve a landing is put on (1/m, for legs 0.9 m long), how far the way the body goes may turn in a frame
 *  and still count as a curve (rad: more is a reversal's flip), and how quickly the curve is followed (1/s) */
const CURVE_MOST = 1.8, CURVE_FLIP = 0.3, CURVE_RATE = 8;
/** how far ahead along the curve the pelvis looks for the way the body will go (s: about the lag of the smoothed
 *  velocity and of the pelvis's own easing together) */
const CURVE_LEAD = 0.18;
/** where the ball of the foot is, as a share of the way from the ankle to the toes: a planted foot turns about it */
const BALL = 0.7;
/** how far past its window a foot that missed it still goes late (a share of the time on the ground between its
 *  windows) */
const LATE_SHARE = 0.5;
/** how far before its window (a share of the window) a stride may start, when the body would otherwise leave the
 *  planted foot behind */
const EARLY = -1;
/** the shortest a stride takes (s): about half a sprinter's swing */
const SWING_LEAST = 0.2;
/** the longest a stride takes (s): a slow walk's swing. A stride goes on with the cycle, and at least at the pace
 *  that has it land in the time planned as it left (followed alone, the cycle stalled as the body slowed through a
 *  reversal, and a foot hung in the air a whole second, twice its swing, as if the body were hung from a string) */
const SWING_MOST = 0.55;
/** the first stride from standing (the body stood this much: `standK`) takes at most this long (s) */
const STOOD = 0.5, FIRST_STRIDE = 0.2;
/** the shortest a stride re-aimed takes from where the foot is (s) */
/** how far through a swing its landing starts to settle where it is */
const LAND_SETTLE = 0.5;
/** a stride further on than this lands rather than being aimed again */
const REAIM_UNTIL = 0.85;
const REAIM_LEAST = 0.1;
/** how long the other foot is in the air before a planted one may leave the ground too (s): both leaving together
 *  is a hop (a run's feet leave half a cycle apart) */
const HOP_GAP = 0.1;
/** how long a foot is down before the body leaving it may send it on its stride (s): sooner than a foot out of reach
 *  re-steps on its own (0.04 s, in `tendPlantedFoot`), or that extra step comes first and the same foot leaves twice
 *  running (5 times in the warrior's walk across the steps, at each reversal) */
const STRIDE_AFTER = 0.03;
/** how far out of the pelvis's middle a foot lands at least, and how far across it a planted foot may be before it
 *  steps back (m at a man's scale) */
const GAP = 0.05, CROSS = 0.08;
/** standing, a planted foot out of reach steps only to a spot at least this far off (a share of the leg): one landing
 *  where it already is lands out of reach again (the pelvis rose while it was up), and on a dais step it beat up and
 *  down 5 times a second */
const NEAR_STEP = 0.03;
/** standing, a foot's spot by an edge moves to the nearest place it fits on the body's level, looked for in rings this
 *  far apart (m at a man's scale), at most this many, each this many places round */
const EDGE_RING = 0.01, EDGE_RINGS = 30, EDGE_ROUND = 24;
/** how far inside its level's edge a standing foot's ball is put at least, along the foot and across it, and its heel
 *  and toes clear of a higher level (m at a man's scale): put down on the edge itself, the 2 cm it rolls on landing
 *  took its ball over it, or its toes into the riser */
const EDGE_MARGIN = 0.03;
/** how far the pelvis is lifted over the pose (rig units) before the reach limit brings it back: the rest pose stands
 *  with bent knees */
const RISE = 0.03;
/** the share of the body's speed a planted foot moves at during a run */
const SLIP = +(typeof location === 'undefined' ? '0' : (new URLSearchParams(location.search).get('slip') ?? '0'));
/** the most ground a planted foot passes under the body in one contact (leg lengths): faster, the contact is shorter,
 *  as a runner's is, rather than the foot sliding to keep up; a walk's, its legs near straight, takes more */
const STANCE = +(typeof location === 'undefined'
  ? '0.9'
  : (new URLSearchParams(location.search).get('stance') ?? '0.9'));
const WALK_STANCE = 1.05;
/** how far ahead of its hip a foot may land, in leg lengths */
const AHEAD = 0.4;
/** a walk's: it lands about half its stance ahead and leaves half behind (held to a run's, a fast walk's stance left
 *  each foot 0.6 m behind its hip, the hip 6 degrees past its extension, and the knee folded at once as it rose) */
const WALK_AHEAD = 0.55;
/** a swing lands with this share of the stance's backward stroke (relative to the hip), so a foot never skids as it
 *  takes the ground and paws back a little as it lands, as a runner's does; it leaves with less, or it trails far
 *  behind the hip before it comes forward */
const STROKE_IN = 0.8, STROKE_OUT = 0.5;

const smooth = (t: number): number => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

/** The turn from `from` to `to` (rad), the short way round. */
function turnBetween(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Where leg `i` (0 the left) is in its own cycle at the walk cycle's `phase`, 0..1 with its swing centred on 0.5: the
 *  left foot swings through as the walk cycle's own left thigh comes forward past the hip (phase 0, rig.ts
 *  `walkCycle`), so the arms, the hips' and the chest's turn it swings by the same phase go against the legs, as a
 *  person's do (half a cycle the other way, every walker swung each arm forward with the leg on its side, and a hand
 *  hanging by the thigh met it). */
const legU = (phase: number, i: number): number => ((phase / TAU + (1 - i) * 0.5) % 1 + 1) % 1;

/** Sets `out` (on the ground) to the point `length` along a curve from `from` (x, z) heading `yaw`, turning `curve`
 *  a metre (+ towards +x from +z). */
function alongCurve(out: THREE.Vector3, from: THREE.Vector3, yaw: number, curve: number, length: number): void {
  const turn = curve * length;
  if (Math.abs(turn) < 1e-4) {
    out.set(from.x + Math.sin(yaw) * length, 0, from.z + Math.cos(yaw) * length);
    return;
  }
  const x = from.x + (Math.cos(yaw) - Math.cos(yaw + turn)) / curve;
  out.set(x, 0, from.z + (Math.sin(yaw + turn) - Math.sin(yaw)) / curve);
}

/** How far the pelvis turns towards a way the legs go `off` its line (rad): none within `SLACK`, at most `TWIST` (with
 *  the body's ranges on, as far as the trunk lets it, which the caller holds it to). */
function pelvisTurnFor(off: number): number {
  const most = ROM_ON ? Math.PI : TWIST;
  return Math.sign(off) * Math.min(most, Math.max(0, Math.abs(off) - SLACK));
}

/** A body walks up to this speed and runs from this one, changing over between (m/s for legs 0.9 m long, a man's;
 *  in proportion for others). A person walks to about 2.2 m/s, but a hero slowed to 0.45 of his run by a shot drawn
 *  moves at 2.8 to 3.2, and jogging there, more than a third of the time in the air with his legs dangling under a
 *  body that glided on, he read as hung from a string: an archer moving with a shot drawn walks, in long steps. */
const WALK_TOP = 3.4, RUN_FROM = 4.6;
/** a walk's step at most (leg lengths): its stance must take the body over that ground within the legs' reach */
const WALK_STEP = 0.9;
/** the share of the cycle a walk's foot is on the ground: a stroll's, and at its fastest (both feet down a while) */
const STROLL_DUTY = 0.62, FAST_WALK_DUTY = 0.53;
/** how high a walk lifts a foot in the air at most (m at a man's scale: its toes just clear the ground) */
const WALK_LIFT = 0.06;

/** How far the gait at `speed` (m/s) has changed from a walk to a run, for legs `leg` long (0..1). */
function runShare(speed: number, leg: number): number {
  const asAMan = speed * 0.9 / Math.max(0.1, leg);
  return smooth((asAMan - WALK_TOP) / (RUN_FROM - WALK_TOP));
}

/** How far a half stride (one foot's step) is at `speed` (m/s) for legs `leg` long (world m): walks take short steps,
 *  runs long ones, and a walk's no longer than its stance can reach; the walk cycle's phase then advances π per step
 *  (`gaitRate`). */
export function stepLength(speed: number, leg: number): number {
  const step = speed / (1.7 + 0.32 * speed) * (leg / 0.9);
  const run = Math.min(1.65 * leg, Math.max(0.3 * leg, step));
  const walk = Math.min(run, WALK_STEP * leg);
  return walk + (run - walk) * runShare(speed, leg);
}

/** The share of the cycle a foot is on the ground at `speed` (m/s) for legs `leg` long, as the gait would have it
 *  (the legs' reach may make it less): a walk's above a half, a run's down to a third. */
function dutyAt(speed: number, leg: number): number {
  const walkK = Math.min(1, Math.max(0, (speed * 0.9 / Math.max(0.1, leg) - 1.5) / (WALK_TOP - 1.5)));
  const walk = STROLL_DUTY + (FAST_WALK_DUTY - STROLL_DUTY) * walkK;
  const run = Math.min(0.62, Math.max(0.31, 0.62 - 0.19 * (speed - 1.5)));
  return walk + (run - walk) * runShare(speed, leg);
}

/** the walk cycle's phase change per metre travelled at `speed`: a half cycle (π) per step */
export const gaitRate = (speed: number, leg: number): number => IK ? Math.PI / stepLength(speed, leg) : 2.1;

/** a model's leg length in world metres (its thigh and shin at the root's scale), 0.9 for one with no skeleton */
export function legLength(m: { joints?: Joints; root: THREE.Object3D }): number {
  return m.joints ? (m.joints.P.thighL + m.joints.P.shinL) * m.root.scale.x : 0.9;
}

type State = 'plant' | 'swing' | 'timed';

/** One foot as the gait has it. */
class Foot {
  state: State = 'plant';
  /** where it is planted: the ankle's spot on the floor (x, z) and the level it stands on (y) */
  P = new THREE.Vector3();
  /** where the current step began, and where it will land */
  A = new THREE.Vector3();
  B = new THREE.Vector3();
  /** the way it is turned planted, and the way it was turned as its step began */
  yaw = 0;
  yawA = 0;
  /** progress of a step 0..1; a timed step (a re-step, or a step stopped short) runs `dur` seconds */
  t = 0;
  dur = 0.25;
  /** how long it has been planted (s) */
  stance = 0;
  /** a timed step taken at a run: quick, and eased out like a swing, so a foot left behind catches up with the body */
  fast = false;
  /** how far ahead of its hip (along the way it travels) the foot was when its swing began */
  rel0 = 0;
  /** the ankle's target this frame, in the world */
  pos = new THREE.Vector3();
  pitch = 0;
  /** the ankle's pitch as last shown, and as the step began; and the height over the ground the step began with: a
   *  step eases from them, so stopping mid-stride never snaps */
  shown = 0;
  pitch0 = 0;
  carry = 0;
  /** the sole's line under the ankle of a foot in the air, as its swing has it, and how much higher it is held to
   *  clear what it passes over (m) */
  swung = 0;
  clear = 0;
  /** the way it points as last shown (rad, world), and how far it is tipped toe down (rad: in the air within the
   *  ankle's range, it hangs from the shin, which tips it further than its pitch) */
  shownYaw = 0;
  tip = 0;
  /** how far along its stride its landing is moved to keep its toes off a riser (m), and which way, kept for the
   *  stride (0 until it needs one) */
  landShift = 0;
  riserSide = 0;
  /** the leg as the pose had it, for the blend */
  fk = { thigh: new THREE.Quaternion(), knee: new THREE.Quaternion(), ankle: new THREE.Quaternion() };
  /** this leg's own blend over the pose (`update`'s `legW`), smoothed, and whether the pose owned it last frame */
  lw = 1;
  own = false;
  /** where a standing body wants this foot (`LegIK.stance`): in the root's own frame, and turned out by `syaw`; null
   *  under its hip */
  stand: THREE.Vector3 | null = null;
  syaw = 0;
  /** where the ankle's target was last frame, if it was the gait's */
  last = new THREE.Vector3();
  seen = false;
  /** where in its window (0..1) the swing began: its arc runs over what was left of the window */
  tw0 = 0;
  /** how much of the cycle the current stride takes (from where it began to its window's end) */
  span = 0.5;
  /** the least share of the stride it goes on by a second (its planned time's inverse) */
  pace = 2;
  /** how long it has been in the air (s) */
  air = 0;
  /** the way the stride is drawn along: turning towards the way the body goes, not snapping to it (the foot would
   *  whip across) */
  dir = new THREE.Vector3();
  dirYaw = 0;
  /** the body went out of its reach last frame: a planted foot steps at once */
  over = false;
  /** where it was against its swing's window this frame, moving (0 to 1 within it, under 0 before it, over 1 after
   *  it; read by the lab) */
  window = 0;
  /** why its last stride began: in its window, or early, and why (for the lab's measures) */
  leftFor = '';
  /** planted, but further from its hip than even its toes reach, or its hip past its extension: it must go */
  dragged = false;
  /** how far the knee is folded past the solve's to keep the hip within its extension (rad), eased in */
  fold = 0;
  /** down while the body stood: its next stride is the first of a walk */
  fromStand = false;
}

/** A leg's joints, hip down. */
interface LegJoints {
  thigh: THREE.Object3D;
  knee: THREE.Object3D;
  ankle: THREE.Object3D;
}

/** What a frame of the gait works from, worked out at its start and shared by its steps (one, reused: a crowd runs
 *  this every frame). */
class GaitFrame {
  dt = 0;
  phase = 0;
  /** the root's world matrix and scale, and where it stands on the ground */
  rootMatrix = new THREE.Matrix4();
  scale = 1;
  rootX = 0;
  rootZ = 0;
  /** the legs' lengths (rig units), and their reach in the world */
  thigh = 0;
  shin = 0;
  legReach = 0;
  /** the way the body faces, and the way the pelvis faces turned towards the way it travels (rad) */
  facing = 0;
  pelvisYaw = 0;
  /** the pelvis's side axis (towards +x when it faces +z) and its middle, in the world */
  readonly pelvisSide = new THREE.Vector3();
  readonly pelvisAt = new THREE.Vector3();
  /** the ground speed (smoothed) and the way the body travels (a unit vector, or none) */
  speed = 0;
  readonly travel = new THREE.Vector3();
  /** how much the way it travels turns a metre (1/m, + towards +x from +z, smoothed): the curve it is on */
  curve = 0;
  /** the share of the cycle a foot is on the ground, half the share it swings, and the cycle's length (s) */
  duty = 0;
  halfSwing = 0;
  cycle = 0;
  /** how far ahead of its hip a swing lands (m), and the share of the body's speed a planted foot creeps on at */
  landAhead = 0;
  slip = 0;
  /** the leg being stepped: its hip joint in the world, and its side of the pelvis's middle (1 or -1) */
  readonly hip = new THREE.Vector3();
  legSide = 1;
}

const _rootAt = new THREE.Vector3(), _rootScale = new THREE.Vector3(), _facing = new THREE.Vector3();
const _velocity = new THREE.Vector3(), _spot = new THREE.Vector3(), _ankleAt = new THREE.Vector3();
const _point = new THREE.Vector3(), _target = new THREE.Vector3(), _toFoot = new THREE.Vector3();
const _peelAt = new THREE.Vector3(), _candidate = new THREE.Vector3(), _hipsForward = new THREE.Vector3();
const _hipsAt = new THREE.Vector3(), _hipsScale = new THREE.Vector3(), _hipsTurn = new THREE.Quaternion();
const _hipsInverse = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _handTurn = new THREE.Quaternion();
const _pole = new THREE.Vector3(), _e = new THREE.Euler(), _thighDown = new THREE.Vector3();
const _leavesAt = new THREE.Vector3(), _hipAt = new THREE.Vector3();
const _hipForward = new THREE.Vector3(0, 0, 1), _toes = new THREE.Vector3(), _ankleHeld = new THREE.Quaternion();
const _heelUp = new THREE.Vector3(), _landWas = new THREE.Vector3();
/** along the foot and across it, both ways: where a standing foot's ball must have its level round it
 *  (`EDGE_MARGIN`) */
const MARGIN_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const UP = new THREE.Vector3(0, 1, 0);

export interface LegOpts {
  /** 0 = the walk cycle's own legs, 1 = fully IK; a fixed share, or (state) a per-frame one */
  weight?: number;
}

export class LegIK {
  readonly feet = [new Foot(), new Foot()];
  /** false: the walk cycle's own legs this frame (an enemy off screen or far away), restarting under the hips when it
   *  is back */
  active = true;
  private readonly legs: LegJoints[];
  private readonly frame = new GaitFrame();
  /** where the root stood last frame, and its velocity, smoothed */
  private readonly last = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  /** the ground speed, smoothed as a number (the vector's length collapses when the direction flips), and as a vector
   *  along the way it travels */
  private sp = 0;
  private readonly gv = new THREE.Vector3();
  /** the walk cycle's phase last frame, its rate (smoothed), and how far it moved this frame (a share of a cycle) */
  private lastPhase = 0;
  private dphase = 0;
  /** the body's facing last frame (rad), and whether there was one: the pelvis's turn in the world is capped */
  private facingWas = 0;
  private facingSeen = false;
  /** how fast the cycle moves, either way (rad/s, smoothed): the cycle's length. Read from `dphase`, it passed through
   *  nothing as a walk turned from forwards to backwards, the cycle read seconds long and the stance's reach cut the
   *  share of it on the ground under a half (a foot swung 470 frames by the plan) */
  private rate = 0;
  private dU = 0;
  private moving = false;
  private fresh = true;
  /** the pose owned the legs last frame */
  private owned = false;
  /** how far the pelvis is dropped so both feet are in reach (smoothed) */
  private drop = 0;
  private dropWanted = 0;
  /** the way the body faced last frame, and how fast it keeps turning on the curve it goes round (rad/s, smoothed) */
  private lastYaw = 0;
  private yawRate = 0;
  /** the body's lean into its motion (forward, sideways), damped */
  private leanX = 0;
  private leanZ = 0;
  /** how far the pelvis is turned from the way the body faces, towards the way it travels (rad), damped */
  private twist = 0;
  /** the speed, smoothed slowly (a reversal's moment at a standstill doesn't count), and whether the pelvis is keeping
   *  its line with the legs going backwards along it (a reversal), for how long */
  private spSlow = 0;
  private backing = false;
  private backT = 0;
  /** 1 standing, 0 moving, eased: how far the knees follow the way the feet point */
  private standK = 1;
  /** the way the body went last frame (rad), and whether there was one, and the curve it is on (`GaitFrame.curve`) */
  private travelWas = 0;
  private travelSeen = false;
  private curve = 0;
  private shape: FootShape[] | null = null;
  /** the hands' world turn as the pose left it (`captureArms`) */
  private readonly hq = [new THREE.Quaternion(), new THREE.Quaternion()];
  private armsCaptured = false;
  /** the smoothed blend over the walk cycle's legs */
  private w = 0;

  constructor(private readonly j: Joints) {
    this.legs = [
      { thigh: j.thighL, knee: j.kneeL, ankle: j.ankleL },
      { thigh: j.thighR, knee: j.kneeR, ankle: j.ankleR },
    ];
    // (read by probes)
    j.root.userData.legs = this;
  }

  /** whether the body is moving as the gait sees it (read by the lab) */
  get walking(): boolean {
    return this.moving;
  }

  /** the way the gait's pelvis faces, which the feet land turned to (rad, world; read by the lab) */
  get pelvisYaw(): number {
    return this.frame.pelvisYaw;
  }

  /** the walk cycle as the gait reads it: its phase (rad), how fast it moves (rad/s, signed, smoothed) and whether
   *  the legs walk backwards along the pelvis's line (read by the lab) */
  get cycleNow(): { phase: number; rate: number; backing: boolean } {
    return { phase: this.lastPhase, rate: this.dphase, backing: this.backing };
  }

  /** how far the pelvis is dropped for the feet to reach, and how far they asked for this frame (m, read by the lab) */
  get pelvisDrop(): { dropped: number; wanted: number } {
    return { dropped: this.drop, wanted: this.dropWanted };
  }

  /** how far the body leans forward this frame (rad): a pose that holds something at an angle in the world eases its
   *  arms by it */
  get lean(): number {
    return IK ? this.leanX : 0;
  }

  /**
   * Where a standing body puts its feet (a fighting stance, a step in): each foot's spot in the root's own frame
   * (x left, z forward, rig units) and how far it is turned out (rad, + to the left); null puts it under its hip.
   * A planted foot further than a few cm from its spot steps there, one foot at a time; moving, the gait ignores it.
   */
  stance(i: number, x: number | null, z = 0, yaw = 0): void {
    const f = this.feet[i];
    if (x === null) {
      f.stand = null;
      f.syaw = 0;
      return;
    }
    (f.stand ??= new THREE.Vector3()).set(x, 0, z);
    f.syaw = yaw;
  }

  /**
   * Call after the pose has put the hands where it wants them and before `update`: the hands' turn in the
   * world is kept through whatever `update` does to the body (the lean, the pelvis dropping), see `holdArms`.
   */
  captureArms(): void {
    if (!IK) return;
    const j = this.j;
    j.root.updateMatrixWorld(true);
    j.handL.getWorldQuaternion(this.hq[0]);
    j.handR.getWorldQuaternion(this.hq[1]);
    this.armsCaptured = true;
  }

  /**
   * Call after `update`: each wrist turns back so the hand is turned in the world as `captureArms` saw it, and
   * a weapon or shield in it keeps its angle while the body leans and dips. The arms themselves follow the
   * body (pinning the hands' positions too folds the elbows up into the chest as the trunk leans onto them).
   * `weight` 0..1 blends over the hand as posed.
   */
  holdArms(weight = 1): void {
    if (!IK || !this.armsCaptured) return;
    this.armsCaptured = false;
    if (weight <= 0) return;
    const j = this.j;
    j.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const shoulder = i === 0 ? j.shoulderL : j.shoulderR;
      const elbow = i === 0 ? j.elbowL : j.elbowR;
      const hand = i === 0 ? j.handL : j.handR;
      _q.copy(hand.quaternion);
      j.chest.getWorldQuaternion(_handTurn).multiply(shoulder.quaternion).multiply(elbow.quaternion).invert();
      _handTurn.multiply(this.hq[i]);
      hand.quaternion.copy(_q).slerp(_handTurn, weight);
    }
  }

  /** the next frame starts from the pose as it stands (a teleport, a respawn) */
  reset(): void {
    this.fresh = true;
  }

  /**
   * Take the legs over, after the pose and before anything reads their world matrices. `phase` is the walk
   * cycle's; `dead` the death progress (-1 alive: the fall stays as posed). `weight` blends both legs and the
   * body's lean, twist and pelvis over the pose; `legW` (left, right) blends one leg more: a leg under a half is
   * the pose's (a step in, a lunge), its foot planted where the pose puts it, while the other one steps.
   */
  update(dt: number, phase: number, dead: number, weight = 1, lean = 1, legW?: readonly [number, number]): void {
    if (!IK) return;
    if (dead >= 0 || !this.active) {
      this.fresh = true;
      this.w = 0;
      return;
    }
    if (dt <= 0) return;
    // a pose that owns the legs (a lunge, a charge) takes them from the IK: its own legs show, and the feet follow
    // them (restarting each frame where the pose has them) so the gait picks up from there when it gives them back
    this.w = damp(this.w, weight, 10, dt);
    // (and once more on the frame it gives them back: the pose has changed by then)
    if (weight < 0.5 || this.owned) this.fresh = true;
    this.owned = weight < 0.5;
    // only the chain down to the hips is brought up to date here (the renderer updates the rest): a crowd pays for
    // this every frame
    const root = this.j.root;
    root.updateWorldMatrix(true, false);
    // far off the ground (rising out of it at spawn): nothing to plant a foot on, the pose stands (the body lags the
    // dais steps by up to their height, which the pelvis and dragged feet absorb)
    const at = _rootAt.setFromMatrixPosition(root.matrixWorld);
    if (Math.abs(at.y - groundHeight(at.x, at.z)) > 0.5) {
      this.fresh = true;
      this.w = 0;
      return;
    }
    const g = this.readBody(dt, phase, at);
    this.leanIntoMotion(g, lean);
    // (how fast the body keeps turning, smoothed over a third of a second: an attack's snap onto its aim doesn't
    // count, wheeling round to face the way it goes does, and lets a foot step out of turn; but not its turn with the
    // curve it goes round, last frame's: counted, running round in circles its feet stepped out of turn, and left the
    // ground and landed together five times in three laps)
    const turned = turnBetween(this.lastYaw, g.facing) - this.curve * this.sp * dt;
    this.yawRate = damp(this.yawRate, Math.abs(turned) / dt, 3, dt);
    this.lastYaw = g.facing;
    this.turnPelvis(g, lean);
    this.placePelvis(g);
    if (this.fresh || (g.rootX - this.last.x) ** 2 + (g.rootZ - this.last.z) ** 2 > 4) this.start(g);
    this.followMotion(g);
    for (let i = 0; i < 2; i++) this.stepFoot(g, i, legW);
    this.takeAlongFeetInAir(g);
    this.dropPelvis(g);
    this.j.hips.matrixWorld.decompose(_hipsAt, _hipsTurn, _hipsScale);
    _hipsForward.set(0, 0, 1).applyQuaternion(_hipsTurn);
    const hipsYaw = Math.atan2(_hipsForward.x, _hipsForward.z);
    for (let i = 0; i < 2; i++) this.solveLeg(g, i, hipsYaw);
  }

  // --- the body ----------------------------------------------------------------------------------------------------

  /** The frame's start: the root's matrix, scale and place, the legs' lengths and the way the body faces. */
  private readBody(dt: number, phase: number, rootAt: THREE.Vector3): GaitFrame {
    const j = this.j, g = this.frame;
    g.dt = dt;
    g.phase = phase;
    g.rootMatrix = j.root.matrixWorld;
    g.scale = _rootScale.setFromMatrixScale(g.rootMatrix).x;
    g.rootX = rootAt.x;
    g.rootZ = rootAt.z;
    this.shape ??= [footShape(j.ankleL, j.root), footShape(j.ankleR, j.root)];
    g.thigh = j.P.thighL;
    g.shin = j.P.shinL;
    g.legReach = (g.thigh + g.shin) * g.scale;
    _facing.set(0, 0, 1).transformDirection(g.rootMatrix);
    g.facing = Math.atan2(_facing.x, _facing.z);
    return g;
  }

  /** Leaning into the motion, like a body falling forward onto its feet: the whole body tips about the ground under
   *  it, the head stays level. */
  private leanIntoMotion(g: GaitFrame, lean: number): void {
    const j = this.j, v = this.v;
    const ahead = Math.sin(this.lastYaw) * v.x + Math.cos(this.lastYaw) * v.z;
    const aside = Math.cos(this.lastYaw) * v.x - Math.sin(this.lastYaw) * v.z;
    const k = LEAN * lean * this.w;
    this.leanX = damp(this.leanX, Math.max(-0.12, Math.min(0.3, ahead * k)), 6, g.dt);
    this.leanZ = damp(this.leanZ, Math.max(-0.12, Math.min(0.12, -aside * k)), 6, g.dt);
    j.body.rotation.x += this.leanX;
    j.body.rotation.z += this.leanZ;
    j.neck.rotation.x -= this.leanX * 0.5;
    j.head.rotation.x -= this.leanX * 0.3;
  }

  /** A body that travels sideways to where it faces (aiming, casting) turns its pelvis and legs towards the way it
   *  goes, the chest staying on the aim, instead of crossing its feet. */
  private turnPelvis(g: GaitFrame, lean: number): void {
    const j = this.j;
    const [least, most] = this.trunkTurns();
    const want = this.pelvisTurnWanted(g, lean, least, most);
    // (no faster than hips really turn: flipped round at once between walking forwards and backpedalling, it twitches)
    const eased = damp(this.twist, want * this.w, 9, g.dt);
    const turned = Math.max(-TWIST_RATE * g.dt, Math.min(TWIST_RATE * g.dt, eased - this.twist));
    const facingTurned = this.facingSeen ? turnBetween(this.facingWas, g.facing) : 0;
    const fastest = PELVIS_TURN_MOST * g.dt;
    const inWorld = Math.max(-fastest, Math.min(fastest, facingTurned + turned));
    this.twist += inWorld - facingTurned;
    this.facingWas = g.facing;
    this.facingSeen = true;
    // (and never past the trunk's turn, however quickly the pose twists the chest: following it at the hips' own rate
    // alone, the spine turned 9 degrees past its range as a tapped shot's draw closed the chest)
    this.twist = Math.max(least * this.w, Math.min(most * this.w, this.twist));
    j.hips.rotation.y += this.twist;
    j.spine.rotation.y -= this.twist * 0.5;
    j.chest.rotation.y -= this.twist * 0.5;
  }

  /** How far the pelvis would turn towards the way the body goes (rad), within the trunk's turn. */
  private pelvisTurnWanted(g: GaitFrame, lean: number, least: number, most: number): number {
    // (a quick reversal, left and right again, doesn't swing the pelvis round through the aim each time: it keeps its
    // line and the legs go backwards along it, turning round only if the body keeps going the new way)
    let want = 0;
    this.spSlow = damp(this.spSlow, this.sp, 3, g.dt);
    const going = this.spSlow > 0.6 && lean > 0;
    // (mid-reversal the smoothed velocity collapses and swings through every direction: the pelvis holds its turn till
    // it has one again)
    if (going && this.v.length() < 0.6 * this.sp) want = this.twist / Math.max(this.w, 1e-3);
    else if (going) want = this.pelvisTurnTowardsTravel(g, least, most);
    else this.backing = false;
    return Math.max(least, Math.min(most, want));
  }

  /** The least and most the pelvis may turn (rad, as `pelvisTurnWanted`'s): within the trunk's turn, the pose's own
   *  twist of the chest on the hips and this one together; past it the legs step more across the way the pelvis faces,
   *  as a person's do. The two together twisted the spine 84 degrees. (A pose turning the chest side-on, an archer's
   *  at the shot, lets the hips turn round to his side, as an archer walks along his side-on line: held to `TWIST` of
   *  the aim, strafing drawn, his legs went 42 degrees off the pelvis's line, each stride cut short and pushed out
   *  wide at its middle.) */
  private trunkTurns(): [number, number] {
    if (!ROM_ON) return [-Infinity, Infinity];
    const pose = twistAngle(_q.copy(this.j.spine.quaternion).multiply(this.j.chest.quaternion), UP);
    const w = Math.max(this.w, 1e-3);
    return [(pose - TRUNK) / w, (pose + TRUNK) / w];
  }

  /** The pelvis's turn for the way the body travels: walking forwards or backwards along its line, whichever turns it
   *  less and keeps the legs nearer its line, with a reversal walked backwards a while. */
  private pelvisTurnTowardsTravel(g: GaitFrame, least: number, most: number): number {
    // (going round, towards where the way it goes will be by the time the pelvis has turned: turned after the way it
    // went, the pelvis lagged it by 40 to 60 degrees going round in circles drawn, and the feet landed out to the side)
    const ahead = this.curve * this.sp * CURVE_LEAD;
    const rel = turnBetween(g.facing, Math.atan2(this.v.x, this.v.z) + ahead);
    const back = turnBetween(0, rel + Math.PI);
    // (the legs walk along the pelvis's line, forwards or backwards: going back and to the side it turns the other way
    // and backpedals, rather than turning towards the way it goes and stepping sideways backwards across it; each way
    // as far as the trunk lets it turn)
    const forwards = Math.max(least, Math.min(most, pelvisTurnFor(rel)));
    const backwards = Math.max(least, Math.min(most, pelvisTurnFor(back)));
    const now = this.twist / Math.max(this.w, 1e-3);
    // (each way's cost: how far the legs go off the pelvis's line, and how far the pelvis has to turn to get there)
    const offForwards = Math.abs(rel - forwards), offBackwards = Math.abs(back - backwards);
    const costForwards = offForwards + TURN_COST * Math.abs(forwards - now);
    const costBackwards = offBackwards + TURN_COST * Math.abs(backwards - now);
    if (!this.backing && costBackwards + HYST < costForwards) {
      this.backing = true;
      this.backT = 0;
    } else if (this.backing) {
      // (a reversal's backing turns round once the body keeps going the new way and walking forwards fits it as well)
      this.backT += g.dt;
      const turnRound = this.backT > BACK_HOLD && offForwards <= offBackwards + 0.1;
      if (costForwards + HYST < costBackwards || turnRound) this.backing = false;
    }
    return (this.backing ? backwards : forwards) * smooth((this.spSlow - 0.6) / 1.2);
  }

  /** The pelvis's way, its side axis (no foot lands or swings across its middle, whatever way the body goes) and its
   *  middle in the world. */
  private placePelvis(g: GaitFrame): void {
    const j = this.j;
    g.pelvisYaw = g.facing + this.twist;
    g.pelvisSide.set(Math.cos(g.pelvisYaw), 0, -Math.sin(g.pelvisYaw));
    j.body.updateWorldMatrix(false, false);
    j.hips.updateWorldMatrix(false, false);
    g.pelvisAt.setFromMatrixPosition(j.hips.matrixWorld);
  }

  /** The body's own velocity and the cycle's rate, smoothed, and the gait's timing from them. */
  private followMotion(g: GaitFrame): void {
    const dt = g.dt;
    _velocity.set(g.rootX - this.last.x, 0, g.rootZ - this.last.z).divideScalar(dt);
    const k14 = 1 - Math.exp(-dt * 14);
    this.v.lerp(_velocity, k14);
    this.sp += (_velocity.length() - this.sp) * k14;
    this.last.set(g.rootX, 0, g.rootZ);
    // (how far the cycle moved this frame, either way: a stride only ever goes on)
    this.dU = Math.abs(g.phase - this.lastPhase) / TAU;
    this.dphase += ((g.phase - this.lastPhase) / dt - this.dphase) * (1 - Math.exp(-dt * 14));
    this.rate += (Math.abs(g.phase - this.lastPhase) / dt - this.rate) * (1 - Math.exp(-dt * 14));
    this.lastPhase = g.phase;
    const speed = this.sp;
    g.speed = speed;
    this.moving = speed > (this.moving ? 0.25 : 0.55);
    this.standK = damp(this.standK, this.moving ? 0 : 1, 6, dt);
    // the way it travels: the smoothed velocity's, or (through a reversal, when that is nearly nothing) the latest
    const lv = this.v.length();
    if (speed > 0.05) g.travel.copy(lv > 0.35 * speed ? this.v : _velocity).normalize();
    else g.travel.set(0, 0, 0);
    this.gv.copy(g.travel).multiplyScalar(speed);
    this.followCurve(g);
    // the share of the cycle on the ground: less as the speed rises (a run has both feet in the air a while), so the
    // stance's travel stays within the legs' reach
    const firstCycle = TAU / Math.max(this.rate, 0.5);
    const stance = WALK_STANCE + (STANCE - WALK_STANCE) * runShare(speed, g.legReach);
    const reachDuty = Math.max(0.2, stance * g.legReach / Math.max(0.1, speed * firstCycle));
    g.duty = Math.min(dutyAt(speed, g.legReach), reachDuty);
    g.halfSwing = (1 - g.duty) / 2;
    g.cycle = TAU / Math.max(this.rate, 0.5);
    // at a run a planted foot creeps on with the body a little (SLIP of its speed), so the stance keeps to a range the
    // legs can take without the splits
    g.slip = SLIP * smooth((speed - 2) / 3.5);
    const ahead = WALK_AHEAD + (AHEAD - WALK_AHEAD) * runShare(speed, g.legReach);
    g.landAhead = Math.min(speed * g.duty * g.cycle * 0.5 * (1 - g.slip), ahead * g.legReach);
  }

  /** The curve the body is on: how much the way it travels turns for the ground it covers, smoothed (a reversal's
   *  flip of the way doesn't count). */
  private followCurve(g: GaitFrame): void {
    // (mid-reversal the smoothed velocity collapses and swings through every way a little a frame: no curve, or a
    // running reversal's landing went out along one and the warrior's hip opened 10 degrees past its range)
    const reversing = this.v.length() < 0.6 * this.sp;
    const going = g.speed > 0.5 && !reversing && (g.travel.x !== 0 || g.travel.z !== 0);
    const yaw = Math.atan2(g.travel.x, g.travel.z);
    const turned = this.travelSeen && going ? turnBetween(this.travelWas, yaw) : 0;
    const most = CURVE_MOST * 0.9 / g.legReach;
    const now = Math.abs(turned) < CURVE_FLIP ? turned / (Math.max(0.5, g.speed) * g.dt) : 0;
    const wanted = going ? Math.max(-most, Math.min(most, now)) : 0;
    this.curve = damp(this.curve, wanted, CURVE_RATE, g.dt);
    g.curve = this.curve;
    this.travelWas = yaw;
    this.travelSeen = going;
  }

  // --- each foot ---------------------------------------------------------------------------------------------------

  /** One foot's frame: its stride or step, a planted foot tended, the ankle's target placed and its speed capped. */
  private stepFoot(g: GaitFrame, i: number, legW?: readonly [number, number]): void {
    const f = this.feet[i], leg = this.legs[i];
    f.fk.thigh.copy(leg.thigh.quaternion);
    f.fk.knee.copy(leg.knee.quaternion);
    f.fk.ankle.copy(leg.ankle.quaternion);
    const own = this.followPose(g, f, i, legW);
    // (the hip joint, and which side of the pelvis's middle this leg is)
    g.hip.copy(leg.thigh.position).applyMatrix4(this.j.hips.matrixWorld);
    const across = (g.hip.x - g.pelvisAt.x) * g.pelvisSide.x + (g.hip.z - g.pelvisAt.z) * g.pelvisSide.z;
    g.legSide = Math.sign(across) || (i === 0 ? 1 : -1);
    if (this.moving && !own) {
      // (a foot re-stepping does not take the other one's swing with it, or both leave the ground at once and the body
      // drops between them; at a walk the other waits)
      if (f.state !== 'timed') this.walkFoot(g, f, i);
    } else if (f.state === 'swing') {
      this.finishStoppedStride(g, f, i);
    }
    if (f.state === 'timed') {
      f.t += g.dt / f.dur;
      if (f.t >= 1) this.land(f, g.pelvisYaw + (this.moving ? 0 : f.syaw));
    }
    if (f.state === 'plant') this.tendPlantedFoot(g, f, i, own);
    const inAir = f.state === 'swing' || f.state === 'timed';
    if (inAir) f.air += g.dt;
    if (inAir) this.moveFootInAir(g, f, i);
    else this.placePlantedFoot(g, f, i);
    this.capFootSpeed(g, f, own);
    // (cleared where it is once its speed is capped: cleared where its swing would have put it, a foot the cap held
    // back over a step's edge was left at the height for the level beyond and went 9 to 12 cm into the riser)
    if (inAir) f.pos.y += this.clearStep(g, f, i, f.shownYaw, f.swung, g.pelvisYaw + (this.moving ? 0 : f.syaw));
  }

  /** A leg the pose owns: its foot stays where the pose puts it (and once more as it gives it back), so the gait picks
   *  up from there. Returns whether the pose owns it this frame. */
  private followPose(g: GaitFrame, f: Foot, i: number, legW?: readonly [number, number]): boolean {
    const share = legW ? legW[i] : 1, own = share < 0.5;
    f.lw = damp(f.lw, share, 10, g.dt);
    if (own || f.own) {
      const ankle = this.legs[i].ankle;
      ankle.updateWorldMatrix(true, false);
      _point.setFromMatrixPosition(ankle.matrixWorld);
      f.state = 'plant';
      f.P.set(_point.x, this.under(i, _point.x, _point.z, g.pelvisYaw, g.scale), _point.z);
      f.yaw = g.pelvisYaw;
      f.t = 0;
      f.stance = 0;
    }
    f.own = own;
    return own;
  }

  /** Moving: a planted foot starts its stride in its window (or early, when the body is leaving it), a swinging one
   *  carries on by however far the cycle moved. */
  private walkFoot(g: GaitFrame, f: Foot, i: number): void {
    const other = this.feet[1 - i];
    const u = legU(g.phase, i), inWindow = Math.abs(u - 0.5) < g.halfSwing;
    const intoWindow = (u - (0.5 - g.halfSwing)) / (2 * g.halfSwing);
    const where = this.dphase < 0 ? 1 - intoWindow : intoWindow;
    f.window = where;
    // (a planted foot the body is about to leave out of reach before its turn takes its stride early, stretched to land
    // over a whole swing, rather than an extra step that would break the rhythm; the other may be in the air, as in a
    // run)
    const toCome = this.toNextWindow(g, where);
    const behind = f.state === 'plant' ? this.leftBehind(g, f) : '';
    const beforeWindow = !inWindow && toCome > EARLY && toCome < 0;
    const early = f.state === 'plant' && beforeWindow && other.state !== 'timed' && f.stance > STRIDE_AFTER
      && behind !== '';
    // (a foot only just down doesn't go again: a reversal can bring its window round at once; unless the body has left
    // it out of reach already, as the first step from standing lands behind a body on its way: held till it settled,
    // it stood on its toes 8 frames, the pelvis sinking 10 cm)
    const settled = f.stance > 0.5 * g.duty * g.cycle || (f.over && f.stance > STRIDE_AFTER);
    const otherStepping = other.state === 'timed' && g.duty > 0.45;
    const otherJustLeft = other.state !== 'plant' && other.air < HOP_GAP;
    // (at a walk a foot is always down: one waits for the other to land, on its toes if it must, rather than both
    // swinging at once; leaving early for its reach or the pelvis's line, half the time in the air. But not dragged:
    // held, a foot was left a metre behind the body as it set off, and jumped 44 cm in its first frame up)
    const walking = g.duty >= WALK_SUPPORT && other.state !== 'plant' && !f.dragged;
    const held = otherStepping || otherJustLeft || walking;
    // (a foot past its window, held there by the other's swing or a reversal, goes as soon as it may, late: counted
    // against the window to come alone, strafing drawn the feet ran a quarter of a window behind the cycle and never
    // caught up, every stride early or a re-step landing under the hip)
    const late = !inWindow && where > 1 && where < 1 + LATE_SHARE * (1 / (2 * g.halfSwing) - 1);
    if ((((inWindow || late) && settled) || early) && f.state === 'plant' && !held) {
      this.beginStride(g, f, early ? toCome : where, early);
      f.leftFor = early ? `early: ${behind}` : late ? 'late, past its window' : 'its window';
    } else if (f.state === 'swing') {
      this.carryOnStride(g, f, i);
    }
  }

  /** Where a foot is against its next window, from `where` against its last (in shares of a window: under 0 before
   *  it). Past a window's end it is counted against the one to come, a cycle on: counted against the one behind it
   *  until the phase wrapped round, a foot planted just after its window, as at a reversal, couldn't take its next
   *  stride early however far the body left it, and stood out of reach on its toes, the pelvis sinking onto it, for
   *  the first half of its stance (9 to 13 frames strafing drawn up and down the dais's steps): as if caught on a
   *  nail. */
  private toNextWindow(g: GaitFrame, where: number): number {
    return where > 1 ? where - 1 / (2 * g.halfSwing) : where;
  }

  /** Whether the body is leaving a planted foot behind: out of reach, across the pelvis's middle, or further from its
   *  hip than the stance the gait plans leaves it (at a fast walk the stance's own end lay at the old 0.57 m, and a
   *  foot past its window went early into the other's, both swinging and landing together). */
  private leftBehind(g: GaitFrame, f: Foot): string {
    const planned = g.speed * g.duty * g.cycle * (1 - g.slip) - g.landAhead;
    const far = Math.max(0.9 * Math.max(0.55 * g.legReach, g.landAhead + 0.3 * g.legReach), BEHIND_SPARE * planned);
    if (f.over) return 'out of reach';
    if (f.dragged) return 'dragged, or its leg past a range';
    if (this.lateral(f.P) < 0) return 'across the pelvis';
    if (Math.hypot(f.P.x - g.hip.x, f.P.z - g.hip.z) > far) return 'far behind';
    return '';
  }

  /** A stride from where the foot is, over what is left of its window; an early one over a whole swing's time, landing
   *  that much before its window ends (stretched to land at its end, an early stride took up to 1.8 swings, landed
   *  late, was left out of reach before its next turn and went early again: strafing drawn, the feet were both in the
   *  air half the time, the legs dangling under a body that glided on). */
  private beginStride(g: GaitFrame, f: Foot, where: number, early: boolean): void {
    const travel = g.travel, progress = Math.min(1, Math.max(0, where));
    f.state = 'swing';
    f.A.set(f.pos.x, f.P.y, f.pos.z);
    f.yawA = f.yaw;
    f.carry = 0;
    f.pitch0 = f.shown;
    f.rel0 = (f.pos.x - g.hip.x) * travel.x + (f.pos.z - g.hip.z) * travel.z;
    f.t = 0;
    // (a run's stride begun late in its window lands at its end, keeping the rhythm's flight; a walk's takes a whole
    // swing, landing late by as much, and the walk's time on both feet takes the lateness back over the next steps:
    // squeezed into what was left of its window by waiting for the other foot to land, it landed short, the body
    // left it out of reach at once, and it went again early with the other still in the air, a step after step that
    // had both feet up a third of the time going round in circles drawn)
    const whole = early || g.duty >= WALK_SUPPORT;
    f.span = 2 * g.halfSwing * (whole ? 1 : Math.max(0.15, 1 - Math.min(0.85, progress)));
    // (and never shorter than a swing can be: begun at its window's very end, a running stride took 3 frames, the foot
    // rising 29 cm in one and moving 33 cm a frame)
    f.span = Math.max(f.span, SWING_LEAST / g.cycle);
    f.pace = 1 / Math.min(SWING_MOST, Math.max(SWING_LEAST, f.span * g.cycle));
    // (the first from standing is quick, as a person's is: over a walk's whole swing, the body on its way left the
    // other foot dragging and both were off the ground as he set off)
    if (f.fromStand) f.pace = Math.max(f.pace, 1 / FIRST_STRIDE);
    f.fromStand = false;
    f.over = false;
    f.riserSide = 0;
    f.dirYaw = Math.atan2(travel.x, travel.z);
    f.dir.copy(travel);
  }

  /** The stride goes on by however far the cycle moves, whichever way it runs (a reversal turns the phase back:
   *  following it, the foot would swing back the way it came), landing at its end. */
  private carryOnStride(g: GaitFrame, f: Foot, i: number): void {
    // (the way the body goes turned round under a stride, quicker than the stride turns after it: the same stride is
    // aimed afresh from where the foot is, in the time it has left. Against the way it went as the stride began,
    // going round in circles turned it that far within a swing, and each swing began again near its end)
    // (a stride all but down lands where it was going: aimed again a frame from landing, at a reversal, a foot swung
    // on 5 frames more with the other stretched behind)
    if (f.t < REAIM_UNTIL && f.dir.dot(g.travel) < 0.3) this.reaimStride(g, f, i);
    f.t = Math.min(1, f.t + Math.max(this.dU / f.span, f.pace * g.dt));
    if (f.t >= 1) {
      this.land(f, g.pelvisYaw);
      return;
    }
    f.dirYaw = angleDamp(f.dirYaw, Math.atan2(g.travel.x, g.travel.z), 10, g.dt);
    f.dir.set(Math.sin(f.dirYaw), 0, Math.cos(f.dirYaw));
    if (Number.isNaN(f.rel0)) f.rel0 = (f.pos.x - g.hip.x) * f.dir.x + (f.pos.z - g.hip.z) * f.dir.z;
  }

  /** A stride started again from where the foot is, the way the body now goes, in the time it has left. */
  private reaimStride(g: GaitFrame, f: Foot, i: number): void {
    const ground = this.under(i, f.pos.x, f.pos.z, f.yawA, g.scale);
    f.carry = Math.max(0, f.pos.y - ground - this.shape![i].sole * g.scale);
    f.A.set(f.pos.x, ground, f.pos.z);
    f.pitch0 = f.shown;
    f.span = Math.max(0.7 * g.halfSwing, f.span * (1 - f.t));
    f.pace = 1 / Math.max(REAIM_LEAST, (1 - f.t) / f.pace);
    f.t = 0;
    f.dirYaw = Math.atan2(g.travel.x, g.travel.z);
    f.dir.copy(g.travel);
    f.rel0 = NaN;
    f.riserSide = 0;
  }

  /** It stopped mid-stride: the step is finished in time from where the foot is now, landing under the hip. */
  private finishStoppedStride(g: GaitFrame, f: Foot, i: number): void {
    f.yawA += turnBetween(f.yawA, g.pelvisYaw) * smooth(f.t);
    const ground = this.under(i, f.pos.x, f.pos.z, f.yawA, g.scale);
    f.carry = Math.max(0, f.pos.y - ground - this.shape![i].sole * g.scale);
    f.pitch0 = f.shown;
    f.A.copy(f.pos);
    f.A.y = ground;
    f.state = 'timed';
    f.dur = 0.22;
    f.t = 0;
    f.fast = false;
  }

  /** A planted foot: it creeps at a run, pivots with the body, and steps when it has fallen too far from its spot (a
   *  turn, a sudden start), across the pelvis's middle, or out of reach. */
  private tendPlantedFoot(g: GaitFrame, f: Foot, i: number, own: boolean): void {
    const other = this.feet[1 - i], reach = g.legReach;
    f.stance += g.dt;
    // (stood a while: slowed through a reversal, a body stands for a frame or two)
    if (!this.moving && this.standK > STOOD) f.fromStand = true;
    if (this.moving && g.slip > 0) {
      f.P.x += this.gv.x * g.slip * g.dt;
      f.P.z += this.gv.z * g.slip * g.dt;
    }
    // a foot pivots with the body when it turns, rather than staying across the leg (about the ball of the foot, which
    // stays where it is: turned about the ankle, the toes and heel would sweep the ground)
    const footYaw = g.pelvisYaw + (this.moving ? 0 : f.syaw), off = turnBetween(f.yaw, footYaw);
    if (Math.abs(off) > YAW_MAX) this.turnOnBall(f, i, footYaw - Math.sign(off) * YAW_MAX, g.scale);
    const spot = this.spotFor(g, f, i, footYaw);
    const turnedOff = !this.moving && f.stand ? 0.15 * reach * Math.abs(turnBetween(f.yaw, footYaw)) : 0;
    const dev = Math.hypot(f.P.x - spot.x, f.P.z - spot.z) + turnedOff;
    // (a foot the pelvis has turned past, onto the other leg's side, steps back to its own: the legs never stay
    // crossed)
    const crossed = this.lateral(f.P) < -CROSS * g.scale;
    // (one the body has gone out of reach of steps at once, whatever the other foot is doing: dragged along, it would
    // slide; standing, only to somewhere else: on its spot already, the pelvis sinks onto it or the heel lifts)
    const outOfReach = f.over && f.stance > 0.04 && (this.moving || dev > NEAR_STEP * reach);
    f.over = false;
    // (moving, a foot in trouble takes its stride early instead, in `walkFoot`: an extra step would break the left,
    // right rhythm; only one left far behind, or a body wheeling round on its feet, steps on its own)
    const nearHip = Math.hypot(f.P.x - g.hip.x, f.P.z - g.hip.z) < 0.9 * reach;
    if ((this.moving && this.yawRate < 3 && nearHip) || own) return;
    const tooFar = this.moving ? Math.max(0.55 * reach, g.landAhead + 0.3 * reach) : (f.stand ? 0.07 : 0.1) * reach;
    const otherDown = this.moving
      ? other.state !== 'timed'
      : other.state === 'plant' || (other.state === 'timed' && other.t > 0.2);
    const settled = f.stance > (this.moving ? 0.12 : 0.05);
    // (at a walk, not while the other foot is in the air, unless dragged: both off the ground at once is a hop)
    if (this.moving && g.duty >= WALK_SUPPORT && other.state !== 'plant' && !f.dragged) return;
    if (outOfReach || ((crossed || dev > tooFar) && otherDown && settled)) this.beginStep(g, f, spot, dev);
  }

  /** Where a planted foot should be: standing, the stance's spot (off any edge, onto the body's level); else under
   *  the hip. */
  private spotFor(g: GaitFrame, f: Foot, i: number, footYaw: number): THREE.Vector3 {
    const spot = !this.moving && f.stand ? _spot.copy(f.stand).applyMatrix4(g.rootMatrix) : _spot.copy(g.hip);
    if (!this.moving) this.onBodyLevel(spot, i, footYaw, g.scale, g.rootX, g.rootZ, true);
    return spot;
  }

  /** A timed step to `spot` (`dev` away), a quick one at a run. */
  private beginStep(g: GaitFrame, f: Foot, spot: THREE.Vector3, dev: number): void {
    f.state = 'timed';
    f.t = 0;
    f.fast = this.moving;
    f.dur = this.moving ? Math.min(0.3, Math.max(0.12, (1 - g.duty) * g.cycle)) : Math.min(0.4, 0.16 + dev * 0.3);
    // (from where the ankle is: from where the foot was put down, a foot dragged or up on its toes jumped 34 cm in its
    // first frame up)
    f.A.set(f.pos.x, f.P.y, f.pos.z);
    f.yawA = f.yaw;
    f.carry = 0;
    f.pitch0 = f.shown;
    f.B.set(spot.x + g.travel.x * g.landAhead, 0, spot.z + g.travel.z * g.landAhead);
    f.stance = 0;
  }

  /** A foot in the air: its landing aimed, and the ankle on its arc from where it left to there. */
  private moveFootInAir(g: GaitFrame, f: Foot, i: number): void {
    const shape = this.shape![i], sc = g.scale, speed = g.speed;
    const landYaw = g.pelvisYaw + (this.moving ? 0 : f.syaw);
    this.aimLanding(g, f, i, landYaw);
    const e = f.fast ? 0.6 * f.t * (2 - f.t) + 0.4 * smooth(f.t) : smooth(f.t), run = smooth((speed - 2) / 3.5);
    // (a run lifts the foot higher, and later in the swing: the heel comes up under the seat; a walk's only just clears
    // the ground: lifted as a jog's, 15 cm at a walk with a shot drawn, its knee folded up behind and it skipped)
    const runLift = (1 + 0.5 * run) * Math.min(0.2, Math.max(0.05, 0.04 + 0.03 * speed));
    const height = (WALK_LIFT + (runLift - WALK_LIFT) * runShare(speed, g.legReach)) * sc;
    const lift = height * Math.sin(Math.PI * Math.pow(Math.min(1, f.t), 1 - 0.2 * run));
    f.pos.set(f.A.x + (f.B.x - f.A.x) * e, 0, f.A.z + (f.B.z - f.A.z) * e);
    if (f.state === 'swing' && speed > 0.5) this.swingInHipFrame(g, f);
    // (back out to its own side over the first half of its swing: at once, a foot leaving from across the pelvis's
    // middle jumped 19 cm sideways in its first frame up)
    this.keepToSide(f.pos, smooth(f.t * 2));
    const groundA = f.A.y, groundB = this.under(i, f.B.x, f.B.z, landYaw, sc);
    // (the sole's line under the ankle, its lowest point on the swing's way)
    const tilt = this.tilt(shape, f.pitch) * sc;
    f.swung = groundA + (groundB - groundA) * e + lift + f.carry * (1 - e) + tilt;
    f.pos.y = f.swung + shape.sole * sc;
    // toe down as it leaves, up as it lands
    f.pitch = 0.32 * (1 - smooth(f.t * 2.5)) - 0.2 * smooth((f.t - 0.7) / 0.3);
    // (from the pitch the foot had as it left: a heel already peeled up carries on into the swing)
    f.pitch = f.pitch0 + (f.pitch - f.pitch0) * smooth(f.t * 3);
    f.stance = 0;
  }

  /** How much higher than its swing has it (`swung`, the sole's line under the ankle) a foot in the air is held to
   *  clear what is under it and ahead of it on its way, each point of its sole as the foot is tipped: as a person
   *  lifts a foot over a step, rising as it nears it, and eased down once past (swung between the levels it left and
   *  lands on alone, a foot went through the dais step's riser, up to 17 cm deep for 9 frames; cleared as if level,
   *  the toe of a foot hanging from its shin still caught the step's edge 6 cm deep). The margin comes in as it leaves
   *  and goes as it lands, and as it lands it comes down onto the level it lands on (`landYaw` its way then: held up
   *  to the last frame over a step its heel had been over, a foot landing on the floor beside it dropped 15 cm). */
  private clearStep(g: GaitFrame, f: Foot, i: number, yaw: number, swung: number, landYaw: number): number {
    const shape = this.shape![i], sc = g.scale;
    const toX = f.B.x - f.pos.x, toZ = f.B.z - f.pos.z, way = Math.hypot(toX, toZ);
    const looked = Math.min(way, CLEAR_AHEAD * sc);
    const margin = CLEAR * sc * smooth(f.t / 0.25) * (1 - smooth((f.t - 0.75) / 0.25));
    const across = Math.cos(f.tip) * sc, down = Math.sin(f.tip) * sc;
    let lowest = -Infinity;
    for (let k = 0; k <= CLEAR_STEPS; k++) {
      const ahead = looked * k / CLEAR_STEPS, s = way > 1e-6 ? ahead / way : 0;
      const x = f.pos.x + toX * s, z = f.pos.z + toZ * s;
      for (const along of [-shape.heel, 0, 0.5 * shape.toe, shape.toe]) {
        const ground = groundHeight(x + Math.sin(yaw) * along * across, z + Math.cos(yaw) * along * across);
        lowest = Math.max(lowest, ground + margin + along * down - ahead * CLEAR_SLOPE);
      }
    }
    const landing = smooth((f.t - 0.75) / 0.25);
    if (landing > 0) lowest += (this.under(i, f.pos.x, f.pos.z, landYaw, sc) - lowest) * landing;
    const need = Math.max(0, lowest - swung);
    f.clear = need >= f.clear || landing > 0 ? need : damp(f.clear, need, CLEAR_DOWN, g.dt);
    return f.clear;
  }

  /** How far a leg's foot is tipped toe down in the world (rad). */
  private tipOf(leg: LegJoints): number {
    _q.copy(_hipsTurn).multiply(leg.thigh.quaternion).multiply(leg.knee.quaternion).multiply(leg.ankle.quaternion);
    const ahead = _toFoot.set(0, 0, 1).applyQuaternion(_q);
    return Math.asin(Math.max(-1, Math.min(1, -ahead.y)));
  }

  /** How far along its stride a moving foot's landing (turned `yaw`) moves so its toes are over no higher level than
   *  the rest of its sole rests on: on up onto that level or back short of it, whichever is nearer, and the same way
   *  for the rest of the stride, so the landing doesn't flip between the two as the gait's prediction moves (m, along
   *  the stride; `f.B` is moved with it). Late in a swing it is where the foot is that lands, not the prediction: the
   *  leg's reach and the pelvis's side keep it off where the gait put it. (Landed where the gait put it, a foot coming
   *  down the dais's step backwards stood with its toes up to 16 cm inside the dais.) */
  private offRiser(g: GaitFrame, f: Foot, i: number, yaw: number): number {
    const sc = g.scale, way = f.state === 'swing' ? f.dir : g.travel, B = f.B;
    const late = f.state === 'swing' && f.t > 0.6;
    const atX = late ? f.pos.x - way.x * f.landShift : B.x, atZ = late ? f.pos.z - way.z * f.landShift : B.z;
    if (!this.straddles(i, atX, atZ, yaw, sc)) return 0;
    const sides = f.riserSide ? [f.riserSide] : [1, -1];
    for (let shift = RISER_STEP; shift <= RISER_SHIFT; shift += RISER_STEP) {
      for (const side of sides) {
        const along = shift * side * sc;
        if (this.straddles(i, atX + way.x * along, atZ + way.z * along, yaw, sc)) continue;
        f.riserSide = side;
        B.set(B.x + way.x * along, 0, B.z + way.z * along);
        return along;
      }
    }
    return 0;
  }

  /** Whether a foot at (x, z), turned `yaw`, has its toes over a higher level than the rest of its sole rests on. */
  private straddles(i: number, x: number, z: number, yaw: number, sc: number): boolean {
    return this.soleTop(i, x, z, yaw, sc) > this.under(i, x, z, yaw, sc) + 1e-3;
  }

  /** The highest level under any of a foot's sole at (x, z), turned `yaw`: its heel, ankle, ball and toes. */
  private soleTop(i: number, x: number, z: number, yaw: number, sc: number): number {
    const shape = this.shape![i];
    const toeX = x + Math.sin(yaw) * shape.toe * sc, toeZ = z + Math.cos(yaw) * shape.toe * sc;
    return Math.max(this.under(i, x, z, yaw, sc), groundHeight(toeX, toeZ));
  }

  /** Where a foot in the air will land: under where its hip will be by then, a half stance ahead (standing, on its
   *  stance's spot), on its own side of the pelvis's middle and, standing, off any edge. */
  private aimLanding(g: GaitFrame, f: Foot, i: number, landYaw: number): void {
    // (a phase that has all but stopped, turning round, would put the landing metres off)
    const left = f.state === 'swing' ? (1 - f.t) * (1 - g.duty) * g.cycle : (1 - f.t) * f.dur;
    const remain = Math.min(0.6, left);
    if (!this.moving && f.stand && f.state === 'timed') {
      f.B.copy(f.stand).applyMatrix4(g.rootMatrix);
    } else {
      // (along the curve the body is on: going round in circles, a foot landed straight on from the way the body
      // went, outside the curve, and the body left it out of reach in half its stance)
      const ahead = f.state === 'swing' ? g.landAhead : 0;
      _landWas.copy(f.B);
      alongCurve(f.B, g.hip, Math.atan2(g.travel.x, g.travel.z), g.curve, g.speed * remain + ahead);
      // (and late in a swing it settles where it is, as a foot is put down on a spot: following the body's way to
      // the last frame, going round, it swung sideways 5 cm a frame, and the foot landed moving sideways and stopped
      // dead, its way turned 100 degrees in its last frame; along the stride the swing lands it, in the hip's frame)
      const settle = f.state === 'swing' ? smooth((f.t - LAND_SETTLE) / (1 - LAND_SETTLE)) : 0;
      if (settle > 0) f.B.lerp(_landWas, settle);
    }
    this.keepToSide(f.B);
    if (this.moving) f.landShift = damp(f.landShift, this.offRiser(g, f, i, landYaw), 20, g.dt);
    // (standing, the step lands where the spot it is measured against is: off the edge)
    if (!this.moving) this.onBodyLevel(f.B, i, landYaw, g.scale, g.rootX, g.rootZ, true);
  }

  /** The swing in the hip's frame, along the way it travels: it leaves with the stance's backward stroke, passes under
   *  the hip and reaches ahead, then paws back as it lands, so it never skids. */
  private swingInHipFrame(g: GaitFrame, f: Foot): void {
    const swingTime = (1 - g.duty) * g.cycle, stroke = -(1 - g.slip) * g.speed * swingTime;
    const s1 = f.t, s2 = s1 * s1, s3 = s2 * s1;
    const leaves = (2 * s3 - 3 * s2 + 1) * f.rel0;
    const outStroke = (s3 - 2 * s2 + s1) * STROKE_OUT * stroke;
    const lands = (-2 * s3 + 3 * s2) * (g.landAhead + f.landShift);
    const inStroke = (s3 - s2) * STROKE_IN * stroke;
    const x = leaves + outStroke + lands + inStroke;
    const way = f.dir, along = (f.pos.x - g.hip.x) * way.x + (f.pos.z - g.hip.z) * way.z;
    f.pos.x += way.x * (x - along);
    f.pos.z += way.z * (x - along);
  }

  /** A planted foot's ankle: the foot rolls over the ground instead of sliding on it (the heel stays put as the foot
   *  lands and flattens, the toes as the heel peels up, the ankle moving only round them). */
  private placePlantedFoot(g: GaitFrame, f: Foot, i: number): void {
    const shape = this.shape![i], sc = g.scale;
    f.pitch = this.stancePitch(i, g.phase, g.halfSwing);
    const roll = this.roll(shape, f.pitch) * sc;
    const y = f.P.y + shape.sole * sc + this.tilt(shape, f.pitch) * sc;
    f.pos.set(f.P.x + Math.sin(f.yaw) * roll, y, f.P.z + Math.cos(f.yaw) * roll);
  }

  /** No step moves a foot faster than a running swing does: when the plan jumps (the phase or the way the body goes
   *  turning round as an attack turns the body onto its aim while it strafes or backs up), the foot catches up over a
   *  few frames instead of teleporting. */
  private capFootSpeed(g: GaitFrame, f: Foot, own: boolean): void {
    if (f.seen && !own) {
      const dx = f.pos.x - f.last.x, dz = f.pos.z - f.last.z, d = Math.hypot(dx, dz);
      const most = (FOOT_V + FOOT_VK * g.speed) * g.scale * g.dt;
      if (d > most) {
        f.pos.x = f.last.x + dx * most / d;
        f.pos.z = f.last.z + dz * most / d;
      }
    }
    f.last.copy(f.pos);
    f.seen = !own;
  }

  /** How far `q` is out from the pelvis's middle on the side of the leg being stepped (m; under 0 across it). */
  private lateral(q: THREE.Vector3): number {
    const g = this.frame;
    return ((q.x - g.pelvisAt.x) * g.pelvisSide.x + (q.z - g.pelvisAt.z) * g.pelvisSide.z) * g.legSide;
  }

  /** Moves `q` out to `GAP` from the pelvis's middle on the side of the leg being stepped, if it is nearer. */
  private keepToSide(q: THREE.Vector3, share = 1): void {
    const g = this.frame, short = (GAP * g.scale - this.lateral(q)) * share;
    if (short > 0) {
      q.x += g.pelvisSide.x * g.legSide * short;
      q.z += g.pelvisSide.z * g.legSide * short;
    }
  }

  /** Turns a planted foot to `yaw` about the ball of the foot, which stays where it is (or about its heel, when the
   *  ball is out over a lower level). */
  private turnOnBall(f: Foot, i: number, yaw: number, sc: number): void {
    const pivot = this.pivotAlong(f, i, sc);
    f.P.x += pivot * (Math.sin(f.yaw) - Math.sin(yaw));
    f.P.z += pivot * (Math.cos(f.yaw) - Math.cos(yaw));
    f.yaw = yaw;
  }

  /** Where along a planted foot its turn is about (m from the ankle, forwards): the ball of the foot, or its heel
   *  when the ball is out over a lower level, as a foot's is with its toes past a step's edge (turned about a ball in
   *  the air, the rest of the sole skidded 4 to 7 cm over the step). */
  private pivotAlong(f: Foot, i: number, sc: number): number {
    const shape = this.shape![i], ball = BALL * shape.toe * sc;
    const ballX = f.P.x + Math.sin(f.yaw) * ball, ballZ = f.P.z + Math.cos(f.yaw) * ball;
    return groundHeight(ballX, ballZ) < f.P.y - 1e-3 ? -shape.heel * sc : ball;
  }

  // --- the pelvis and the legs -------------------------------------------------------------------------------------

  /** A body thrown away from its feet (an attack's lunge or lean, a hit) takes the ones in the air along sideways,
   *  rather than sinking to reach them; a planted one keeps its spot (rising onto its toes if it must, in `reachFor`)
   *  and steps: taken along, it would slide. */
  private takeAlongFeetInAir(g: GaitFrame): void {
    const reach = g.legReach;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const hip = _point.copy(this.legs[i].thigh.position).applyMatrix4(this.j.hips.matrixWorld);
      // as far out as the leg reaches with the pelvis dropped a little (a foot out wider or farther back would squat
      // the body)
      const dy = Math.max(0, hip.y - f.pos.y - 0.1 * reach), most = 0.97 * reach;
      const dx = f.pos.x - hip.x, dz = f.pos.z - hip.z, h = Math.hypot(dx, dz);
      const hmax = Math.min(0.7 * reach, Math.max(0.2 * reach, Math.sqrt(Math.max(0, most * most - dy * dy))));
      if (h > hmax && f.state === 'plant') {
        f.over = true;
      } else if (h > hmax) {
        const k = hmax / h;
        f.pos.x = hip.x + dx * k;
        f.pos.z = hip.z + dz * k;
      }
    }
  }

  /** The pelvis stands as tall as the legs allow (the rig's rest pose has the knees bent by a third of a radian), and
   *  drops until both feet are in reach, never more than a crouch (a lunge or a leap takes the body away from its
   *  feet, and the feet then follow it). Leaves the hips' inverse in `_hipsInverse`. */
  private dropPelvis(g: GaitFrame): void {
    const j = this.j;
    j.body.position.y += RISE * this.w;
    j.body.updateWorldMatrix(false, false);
    j.hips.updateWorldMatrix(false, false);
    let need = 0;
    _hipsInverse.copy(j.hips.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      // (the pose's own leg: its foot is where it reaches)
      if (this.feet[i].own) continue;
      const thigh = this.legs[i].thigh;
      const foot = _point.copy(this.reachedAt(g, i)).applyMatrix4(_hipsInverse);
      const dx = foot.x - thigh.position.x, dy = foot.y - thigh.position.y, dz = foot.z - thigh.position.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz), lmax = 0.98 * (g.thigh + g.shin);
      if (d > lmax) need = Math.max(need, (d - lmax) / Math.max(0.35, -dy / d));
    }
    need = Math.max(need, this.plannedDrop(g));
    this.dropWanted = need;
    const dropped = damp(this.drop, Math.min(need, 0.2 * g.legReach + RISE), need > this.drop ? 30 : 9, g.dt);
    // (no quicker than a body sinks: a foot far out of reach as a run reversed sank the hips 5 cm in a frame)
    this.drop += Math.max(-DROP_RATE * g.dt, Math.min(DROP_RATE * g.dt, dropped - this.drop));
    const dip = this.drop * this.w;
    if (dip > 1e-4) {
      j.body.position.y -= dip;
      j.body.updateWorldMatrix(false, false);
      j.hips.updateWorldMatrix(false, false);
      _hipsInverse.copy(j.hips.matrixWorld).invert();
    }
  }

  /** Where a foot is reached from, for how far the pelvis sinks: its ankle, or for a planted foot behind its hip, its
   *  ankle with the heel up as far as a push off lifts it (`peel` lifts it as far as the leg needs). Sunk for the foot
   *  flat, the hips fell 12 cm at the end of each stance of a walk strafing drawn and came back up as it left. */
  private reachedAt(g: GaitFrame, i: number): THREE.Vector3 {
    const f = this.feet[i];
    if (f.state !== 'plant' || !this.moving || !this.shape) return f.pos;
    _hipAt.copy(this.legs[i].thigh.position).applyMatrix4(this.j.hips.matrixWorld);
    const behind = (f.P.x - _hipAt.x) * g.travel.x + (f.P.z - _hipAt.z) * g.travel.z < 0;
    const pitch = Math.max(f.pitch, this.pushPitch());
    if (!behind || pitch <= f.pitch) return f.pos;
    const shape = this.shape[i], sc = g.scale, roll = this.roll(shape, pitch) * sc;
    const y = f.P.y + shape.sole * sc + this.tilt(shape, pitch) * sc;
    return _heelUp.set(f.P.x + Math.sin(f.yaw) * roll, y, f.P.z + Math.cos(f.yaw) * roll);
  }

  /**
   * How far the pelvis sinks, moving, for the stance the gait plans to stay within the legs' reach: a foot lands
   * `landAhead` before its hip and leaves the rest of the stance's ground behind it, its heel up for the push off.
   * A walk of long steps is a stalking walk, its knees bent all through: with the hips held at their height, each
   * foot went out of reach before its turn, took its stride early stretched to land on time, landed late and went
   * early again, and the feet hung in the air half the time (the pelvis sank only once a foot was out of reach).
   */
  private plannedDrop(g: GaitFrame): number {
    if (!this.moving || !this.shape) return 0;
    const sc = g.scale, behind = g.speed * g.duty * g.cycle * (1 - g.slip) - g.landAhead;
    if (behind <= 0) return 0;
    const lmax = 0.98 * (g.thigh + g.shin);
    let need = 0;
    for (let i = 0; i < 2; i++) {
      if (this.feet[i].own) continue;
      const shape = this.shape[i], push = this.pushPitch();
      _hipAt.copy(this.legs[i].thigh.position).applyMatrix4(this.j.hips.matrixWorld);
      const back = behind - this.roll(shape, push) * sc;
      const x = _hipAt.x - g.travel.x * back, z = _hipAt.z - g.travel.z * back;
      const y = groundHeight(x, z) + shape.sole * sc + this.tilt(shape, push) * sc;
      const foot = _leavesAt.set(x, y, z).applyMatrix4(_hipsInverse).sub(this.legs[i].thigh.position);
      const d = foot.length();
      if (d > lmax) need = Math.max(need, (d - lmax) / Math.max(0.35, -foot.y / d));
    }
    return Math.min(need, CROUCH_MOST * g.legReach);
  }

  /** A leg solved onto its foot's target: the foot lies level, turned as it was planted (or, in a swing, towards where
   *  the body faces) within the hip's turn and the ankle's twist, the knee bends over it, and the leg is blended over
   *  the pose. */
  private solveLeg(g: GaitFrame, i: number, hipsYaw: number): void {
    const f = this.feet[i], { thigh, knee, ankle } = this.legs[i];
    const target = this.reachFor(g, f, i);
    const landYaw = g.pelvisYaw + (this.moving ? 0 : f.syaw);
    let yawNow = f.state === 'plant' ? f.yaw : f.yawA + turnBetween(f.yawA, landYaw) * smooth(f.t);
    // (standing only, and only ever outwards: a running knee pointed off the stride twists the thigh across the body;
    // but a planted foot's knee turns at least far enough for the foot to be within the ankle's twist on the shin:
    // left along the hips, the foot was twisted 50 degrees against it)
    let rel = turnBetween(hipsYaw, yawNow);
    // (a planted foot the hips have turned further from than the hip's turn and the ankle's twist on the shin together
    // pivots on its ball after them: held, the ankle twisted 37 degrees as the hips swung round over it mid-stride)
    const far = Math.abs(rel) - (HIP_TURN + KNEE_FOOT - PIVOT_EARLY);
    if (ROM_ON && f.state === 'plant' && far > 0 && this.shape) {
      this.turnOnBall(f, i, f.yaw + -Math.sign(rel) * far, g.scale);
      yawNow = f.yaw;
      rel = turnBetween(hipsYaw, yawNow);
    }
    let kneeYaw = this.standK * (i === 0 ? Math.max(-0.1, Math.min(0.9, rel)) : Math.max(-0.9, Math.min(0.1, rel)));
    if (ROM_ON && f.state === 'plant') {
      const withinAnkle = Math.max(rel - KNEE_FOOT, Math.min(rel + KNEE_FOOT, kneeYaw));
      kneeYaw = Math.max(-HIP_TURN, Math.min(HIP_TURN, withinAnkle));
    } else if (ROM_ON) {
      // (a foot in the air turns no further from the hips than the hip and the ankle let it: as the body wheeled round
      // onto a shot behind it, a stepping foot kept the way it left the ground and the hip turned 56 degrees, 11 past
      // its range; and moving, no further from the knee than the ankle lets it: a stride's foot turned onto a
      // strafe's way twisted 37)
      kneeYaw = Math.max(-HIP_TURN, Math.min(HIP_TURN, kneeYaw));
      const lim = Math.min(kneeYaw + KNEE_FOOT, Math.max(kneeYaw - KNEE_FOOT, rel)) - rel;
      if (lim) yawNow += lim;
    }
    _pole.set(Math.sin(kneeYaw) + (i === 0 ? 0.12 : -0.12), 0, Math.cos(kneeYaw));
    reachArm(thigh, knee, g.thigh, g.shin, target, _pole, -1);
    if (ROM_ON && f.state !== 'plant') this.holdHip(g, f, i, target);
    f.shown = f.pitch;
    f.shownYaw = yawNow;
    this.levelAnkle(f, this.legs[i], yawNow);
    // (and as far again as the ankle's twist on the shin, as measured, is past its range: with the leg stretched out
    // behind, the hips swinging back round over it at a reversal twisted it 13 degrees past all the same)
    if (ROM_ON && f.state === 'plant' && this.shape) {
      const twist = twistAngle(ankle.quaternion, UP), past = Math.abs(twist) - ANKLE_TWIST;
      if (past > 0) {
        this.turnOnBall(f, i, f.yaw + -Math.sign(twist) * past, g.scale);
        this.levelAnkle(f, this.legs[i], f.yaw);
      }
    }
    if (ROM_ON && f.state === 'plant' && this.shape) this.liftHeel(g, f, i);
    // (within the ankle's range: a foot in the air hangs from the shin, as a runner's does, rather than staying level
    // and turned to the way the body faces whatever the leg does; held level and turned, it bent 85 degrees up at the
    // ankle under a knee bent back, and twisted 100 degrees against it. A planted foot stays as it lies, but on its
    // edge under a shin leaning out further than the ankle rolls: turned on the floor its contact slid)
    if (f.state !== 'plant') clampAnkle(ankle.quaternion, i === 0, false);
    else clampAnkleRoll(ankle.quaternion, i === 0);
    f.tip = this.tipOf(this.legs[i]);
    if (f.state === 'plant') this.noteDragged(f, i, g.scale);
    const blend = this.w * f.lw;
    if (blend < 0.999) {
      thigh.quaternion.copy(f.fk.thigh).slerp(thigh.quaternion, blend);
      knee.quaternion.copy(f.fk.knee).slerp(knee.quaternion, blend);
      ankle.quaternion.copy(f.fk.ankle).slerp(ankle.quaternion, blend);
    }
  }

  /** A planted foot the leg falls short of (the body has gone beyond even its toes' reach) is dragged after it: its
   *  target becomes where the ankle is, so a stride leaves from there (from where the foot was put down, the first
   *  frame up jumped 44 cm as the body set off). One whose leg is solved past a range must go too: held while the
   *  other foot was up, the hips crossed in 15 degrees past, extended 8 past and the ankles bent 10 to 16 past. */
  private noteDragged(f: Foot, i: number, sc: number): void {
    const leg = this.legs[i];
    if (ROM_ON && this.pastInStance(i)) f.dragged = true;
    leg.thigh.updateWorldMatrix(false, true);
    const ankle = leg.ankle.getWorldPosition(_ankleAt);
    if (ankle.distanceTo(f.pos) <= DRAG_SLACK * sc) return;
    f.dragged = true;
    f.pos.copy(ankle);
  }

  /** A planted foot under a shin leaning further over it than an ankle bends lifts its heel, pivoting on its toes,
   *  which stay where they lie, and the leg reaches for the ankle raised round them (laid flat, a foot landed behind
   *  a bent knee as the warrior backed up bent his ankle 11 degrees past). */
  private liftHeel(g: GaitFrame, f: Foot, i: number): void {
    // (again as the pitch moves the ankle, and the shin with it: once, the warrior's lower walk still bent it 12
    // degrees past)
    for (let pass = 0; pass < HEEL_PASSES; pass++) {
      if (!this.pitchWithinAnkle(g, f, i)) return;
    }
  }

  /** One pass of `liftHeel`: a planted foot bent up past its ankle's lift pitched up onto its toes by as much, one
   *  pointed down past it (up on its toes too far) pitched back down. Returns whether it pitched it. */
  private pitchWithinAnkle(g: GaitFrame, f: Foot, i: number): boolean {
    const leg = this.legs[i], ankle = leg.ankle;
    _ankleHeld.copy(ankle.quaternion);
    if (!clampAnkle(_ankleHeld, i === 0, true, true)) return false;
    // (a foot bent up too far has its toes come down the shin as it is held)
    const toesUp = _toes.set(0, 0, 1).applyQuaternion(ankle.quaternion).y;
    const bentUp = _toes.set(0, 0, 1).applyQuaternion(_ankleHeld).y < toesUp;
    const past = _ankleHeld.angleTo(ankle.quaternion) + HEEL_SPARE;
    const pitch = bentUp ? Math.min(HEEL_MOST, f.pitch + past) : Math.max(0, f.pitch - past);
    if (pitch === f.pitch) return false;
    const shape = this.shape![i], sc = g.scale;
    f.pitch = pitch;
    const roll = this.roll(shape, f.pitch) * sc;
    const y = f.P.y + shape.sole * sc + this.tilt(shape, f.pitch) * sc;
    f.pos.set(f.P.x + Math.sin(f.yaw) * roll, y, f.P.z + Math.cos(f.yaw) * roll);
    const target = _target.copy(f.pos).applyMatrix4(_hipsInverse);
    reachArm(leg.thigh, leg.knee, g.thigh, g.shin, target, _pole, -1);
    f.shown = f.pitch;
    this.levelAnkle(f, leg, f.yaw);
    return true;
  }

  /** A foot in the air keeps its hip within its ranges: its thigh is swung in or out to within the hip's abduction,
   *  then its knee folds until the thigh is within its extension. `target` is in the hips' frame. */
  private holdHip(g: GaitFrame, f: Foot, i: number, target: THREE.Vector3): void {
    const swung = this.holdHipSide(g, i, target);
    const folded = this.holdHipBack(g, f, i, target);
    if (swung || folded) f.pos.copy(target).applyMatrix4(this.j.hips.matrixWorld);
  }

  /** A foot in the air whose thigh the solve took further across the body or out to its side than a hip goes swings
   *  in or out about the hip until it is within (a running reversal flung the warrior's foot 2 degrees past across
   *  the body, the mage's 1 past out). True if it moved the foot. */
  private holdHipSide(g: GaitFrame, i: number, target: THREE.Vector3): boolean {
    const { thigh, knee } = this.legs[i], left = i === 0;
    const side = this.hipOut(i);
    const off = side < HIP_IN ? HIP_IN - side : side > HIP_OUT ? HIP_OUT - side : 0;
    if (!off) return false;
    target.sub(thigh.position).applyAxisAngle(_hipForward, left ? off : -off).add(thigh.position);
    reachArm(thigh, knee, g.thigh, g.shin, target, _pole, -1);
    return true;
  }

  /** A foot in the air whose thigh the solve took further back from the pelvis than a hip extends comes in towards
   *  the hip along its line, the knee folding further, until it is within (a leg left behind as the body sets off the
   *  other way kicks its heel up: reaching back for where the swing had it, a mage's tapping reversal took the hip 7
   *  degrees past). True if it moved the foot. */
  private holdHipBack(g: GaitFrame, f: Foot, i: number, target: THREE.Vector3): boolean {
    const { thigh, knee } = this.legs[i];
    const past = HIP_BACK - this.hipFlexion(i);
    // (eased in and out: all at once, a foot leaving from behind a hip past its extension jumped 34 cm up as it rose)
    f.fold = past > 0 ? Math.min(past, f.fold + FOLD_RATE * g.dt) : Math.max(0, f.fold - FOLD_RATE * g.dt);
    if (f.fold <= 0) return false;
    _toFoot.copy(target).sub(thigh.position);
    const reach = _toFoot.length();
    const fold = this.foldAt(g, reach);
    const wanted = Math.min(FOLD_MOST, fold + f.fold);
    const shorter = this.reachAtFold(g, wanted);
    if (shorter >= reach) return false;
    target.copy(thigh.position).addScaledVector(_toFoot, shorter / reach);
    reachArm(thigh, knee, g.thigh, g.shin, target, _pole, -1);
    return true;
  }

  /** Whether a planted leg is solved past a range a stance would take it: the hip's extension, its crossing in or
   *  opening out (a foot a reversal left out wide as the pelvis turned opened the warrior's hip 8 to 12 degrees past
   *  its range), or the ankle's bend either way. */
  private pastInStance(i: number): boolean {
    const out = this.hipOut(i);
    if (this.hipFlexion(i) < HIP_BACK || out < HIP_IN || out > HIP_OUT) return true;
    _ankleHeld.copy(this.legs[i].ankle.quaternion);
    return clampAnkle(_ankleHeld, i === 0, true, true);
  }

  /** The hip's abduction as the leg is solved now (rad: out to its side; across the body, under 0). */
  private hipOut(i: number): number {
    const down = _thighDown.set(0, -1, 0).applyQuaternion(this.legs[i].thigh.quaternion);
    return Math.asin(Math.max(-1, Math.min(1, i === 0 ? down.x : -down.x)));
  }

  /** The hip's flexion as the leg is solved now (rad: the thigh forward of the pelvis; behind it, under 0). */
  private hipFlexion(i: number): number {
    const down = _thighDown.set(0, -1, 0).applyQuaternion(this.legs[i].thigh.quaternion);
    return Math.atan2(down.z, -down.y);
  }

  /** The angle between the thigh and the line from the hip to a foot `reach` from it (rad, the law of cosines). */
  private foldAt(g: GaitFrame, reach: number): number {
    const cos = (reach * reach + g.thigh * g.thigh - g.shin * g.shin) / (2 * reach * g.thigh);
    return Math.acos(Math.max(-1, Math.min(1, cos)));
  }

  /** How far from the hip a foot is when the thigh is `fold` from the line to it (m, the inverse of `foldAt`). */
  private reachAtFold(g: GaitFrame, fold: number): number {
    const across = g.thigh * Math.sin(fold);
    return g.thigh * Math.cos(fold) + Math.sqrt(Math.max(0, g.shin * g.shin - across * across));
  }

  /** The foot's target in the hips' frame, within the leg's reach: a foot in the air eases into the leg's full
   *  stretch (a knee snapping straight and stopping dead reads as a jerk); a planted one the body has pulled out of
   *  reach rises onto its toes, which stay put, rather than sliding after it, or is dragged after the body if even
   *  that won't do. */
  private reachFor(g: GaitFrame, f: Foot, i: number): THREE.Vector3 {
    const thigh = this.legs[i].thigh, hipsMatrix = this.j.hips.matrixWorld;
    const target = _target.copy(f.pos).applyMatrix4(_hipsInverse);
    _toFoot.copy(target).sub(thigh.position);
    const reach = _toFoot.length(), full = g.thigh + g.shin, rmax = 0.99 * full, soft = 0.93 * full;
    f.dragged = false;
    if (f.state !== 'plant' && reach > soft) {
      const r = soft + (rmax - soft) * Math.tanh((reach - soft) / (rmax - soft));
      target.copy(thigh.position).addScaledVector(_toFoot, r / reach);
      f.pos.copy(target).applyMatrix4(hipsMatrix);
    } else if (reach > rmax && f.state === 'plant' && this.peel(f, i, thigh.position, rmax, g.scale)) {
      f.over = true;
      target.copy(f.pos).applyMatrix4(_hipsInverse);
    } else if (reach > rmax) {
      target.copy(thigh.position).addScaledVector(_toFoot, rmax / reach).applyMatrix4(hipsMatrix);
      if (f.state === 'plant') f.over = true;
      f.pos.x = target.x;
      f.pos.z = target.z;
      target.copy(f.pos).applyMatrix4(_hipsInverse);
    }
    return target;
  }

  /** The ankle turned so the foot lies with its pitch as shown and `yaw` in the world, whatever the leg above it
   *  does. */
  private levelAnkle(f: Foot, leg: LegJoints, yaw: number): void {
    _e.set(f.shown, yaw, 0, 'YXZ');
    _q2.setFromEuler(_e);
    _q.copy(_hipsTurn).multiply(leg.thigh.quaternion).multiply(leg.knee.quaternion).invert();
    leg.ankle.quaternion.copy(_q.multiply(_q2));
  }

  /** A planted foot out of the leg's reach `rmax` from the hip (`hip`, the hips' own frame) lifts its heel, pivoting on
   *  its toes, as far as it must (up to ~65 deg): its ankle's target and pitch are set; false if even that won't do. */
  private peel(f: Foot, i: number, hip: THREE.Vector3, rmax: number, sc: number): boolean {
    const shape = this.shape![i], level = f.P.y;
    for (let pitch = Math.max(0, f.pitch); pitch <= 1.15; pitch += 0.05) {
      const r = this.roll(shape, pitch) * sc;
      const x = f.P.x + Math.sin(f.yaw) * r, z = f.P.z + Math.cos(f.yaw) * r;
      const y = level + shape.sole * sc + this.tilt(shape, pitch) * sc;
      _peelAt.set(x, y, z).applyMatrix4(_hipsInverse);
      if (_peelAt.distanceTo(hip) <= rmax) {
        f.pitch = pitch;
        f.pos.set(x, y, z);
        return true;
      }
    }
    return false;
  }

  // --- the foot and the ground -------------------------------------------------------------------------------------

  /** How far forward the ankle moves when the foot is pitched by `p` about the edge it stands on (the toes for a heel
   *  up, the heel for a toe up), that edge staying put. */
  private roll(shape: FootShape, p: number): number {
    return (p > 0 ? shape.toe : -shape.heel) * (1 - Math.cos(p)) + shape.sole * Math.sin(p);
  }

  /** How much a foot pitched by `p` (toe down positive) must be raised so its toe or heel stays out of the floor. */
  private tilt(shape: FootShape, p: number): number {
    const a = Math.abs(p);
    return shape.sole * (Math.cos(a) - 1) + (p > 0 ? shape.toe : shape.heel) * Math.sin(a);
  }

  /** How far a planted foot is pitched up onto its toes as it pushes off (rad): further at a run. */
  private pushPitch(): number {
    return 0.35 + 0.25 * smooth((this.sp - 2) / 3.5);
  }

  /** A planted foot's pitch over the stance, moving: heel down at the landing, toe pushing off at its end (the walk
   *  cycle's own phase). */
  private stancePitch(i: number, phase: number, halfSwing: number): number {
    if (!this.moving) return 0;
    const u = legU(phase, i);
    const intoStance = (((u - (0.5 + halfSwing)) % 1) + 1) % 1;
    const sp = intoStance / Math.max(0.05, 1 - 2 * halfSwing);
    const at = 0.75 - 0.15 * smooth((this.sp - 2) / 3.5);
    if (sp > at && sp < 1) return this.pushPitch() * smooth((sp - at) / (1 - at));
    if (sp < 0.15) return -0.2 * (1 - smooth(sp / 0.15));
    return 0;
  }

  /**
   * The ground a foot turned `yaw` with its ankle over (x, z) stands on: the highest level under its heel, its ankle or
   * the ball of the foot, which bear its weight. Over an edge it rests on the edge, the rest of it out over the lower
   * level, as on a stair (by the level under the ankle alone, a foot whose ball or heel was over the dais stood on the
   * step below with its toes or heel up to 25 cm into the riser).
   */
  private under(i: number, x: number, z: number, yaw: number, sc: number): number {
    const shape = this.shape?.[i];
    if (!shape) return groundHeight(x, z);
    const sx = Math.sin(yaw) * sc, sz = Math.cos(yaw) * sc, ball = BALL * shape.toe;
    const heel = groundHeight(x - sx * shape.heel, z - sz * shape.heel);
    return Math.max(groundHeight(x, z), heel, groundHeight(x + sx * ball, z + sz * ball));
  }

  /**
   * Moves a standing foot's spot `p` (x, z), turned `yaw`, to the nearest place where its ball is on the level the body
   * over (bx, bz) stands on and no part of its sole (heel, ankle, toes) is over a higher one, as a person by a ledge
   * keeps a foot on it rather than reaching down the step with it; else to the nearest where it rests with its toes
   * over nothing higher. With `keepSide`, each place but the spot itself is first put where a step would land on it
   * (on its own side of the pelvis's middle), so the foot lands where its spot is. (Stood on the level under its
   * ankle, a foot was put down the dais's step with its toes or heel up to 25 cm into the riser; slid along itself onto
   * the level under its ball, its spot jumped 20 cm as the ball crossed the edge, or lay out of the leg's reach down
   * the step; drawn in towards the body, a step landed it back out on its own side; each time the foot stepped for its
   * spot again and again.)
   */
  private onBodyLevel(
    p: THREE.Vector3, i: number, yaw: number, sc: number, bx: number, bz: number, keepSide: boolean,
  ): void {
    const shape = this.shape?.[i];
    if (!shape) return;
    const level = groundHeight(bx, bz), sx = Math.sin(yaw), sz = Math.cos(yaw);
    const ball = BALL * shape.toe * sc, margin = EDGE_MARGIN * sc, toes = (shape.toe + EDGE_MARGIN) * sc;
    // (on the body's level: its ball well inside the level's edge, nothing of it over a higher one)
    const onLevel = (x: number, z: number): boolean => {
      const ballX = x + sx * ball, ballZ = z + sz * ball;
      if (groundHeight(ballX, ballZ) !== level) return false;
      for (const [u, v] of MARGIN_DIRS) {
        const x = ballX + (sx * u + sz * v) * margin, z = ballZ + (sz * u - sx * v) * margin;
        if (groundHeight(x, z) !== level) return false;
      }
      for (const along of [-shape.heel - EDGE_MARGIN, 0, shape.toe + EDGE_MARGIN]) {
        if (groundHeight(x + sx * along * sc, z + sz * along * sc) > level + 1e-3) return false;
      }
      return true;
    };
    // (else on whatever it rests on there, its toes over nothing higher: up the step a body stands at, its toes kept to
    // its own side of the pelvis's middle went into the riser wherever it was put on the body's level)
    const restsThere = (x: number, z: number): boolean => {
      return groundHeight(x + sx * toes, z + sz * toes) <= this.under(i, x, z, yaw, sc) + 1e-3;
    };
    const x0 = p.x, z0 = p.z;
    for (const fits of [onLevel, restsThere]) {
      for (let ring = 0; ring <= EDGE_RINGS; ring++) {
        const round = ring ? EDGE_ROUND : 1, r = ring * EDGE_RING * sc;
        for (let k = 0; k < round; k++) {
          const a = k / round * TAU;
          _candidate.set(x0 + Math.sin(a) * r, 0, z0 + Math.cos(a) * r);
          // (the spot itself as it is: where it fits, nothing changes)
          if (ring && keepSide) this.keepToSide(_candidate);
          if (fits(_candidate.x, _candidate.z)) {
            p.x = _candidate.x;
            p.z = _candidate.z;
            return;
          }
        }
      }
    }
  }

  /** The foot down where its ankle came down, which a capped step may have left short of its target: it never slides
   *  on after it lands; the spot is the flat foot's, under the heel it lands on. */
  private land(f: Foot, yaw: number): void {
    const i = this.feet.indexOf(f), sc = this.j.root.scale.x, shape = this.shape?.[i];
    const r = shape ? this.roll(shape, f.pitch) * sc : 0;
    f.state = 'plant';
    f.air = 0;
    f.fold = 0;
    f.P.set(f.pos.x - Math.sin(yaw) * r, 0, f.pos.z - Math.cos(yaw) * r);
    f.P.y = this.under(i, f.P.x, f.P.z, yaw, sc);
    f.yaw = yaw;
    f.t = 0;
    f.stance = 0;
    f.carry = 0;
    f.clear = 0;
    f.landShift = 0;
  }

  /** The gait started afresh: each foot planted where the pose has it (a lunge's stance stays put, and the re-steps
   *  bring it in), off any edge, and the body's motion forgotten. */
  private start(g: GaitFrame): void {
    const sc = this.j.root.scale.x;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this.legs[i].ankle.getWorldPosition(_ankleAt);
      this.onBodyLevel(_ankleAt, i, g.pelvisYaw, sc, g.rootX, g.rootZ, false);
      f.state = 'plant';
      f.P.set(_ankleAt.x, this.under(i, _ankleAt.x, _ankleAt.z, g.pelvisYaw, sc), _ankleAt.z);
      f.yaw = f.yawA = g.pelvisYaw;
      f.t = 0;
      f.stance = 0;
      f.seen = false;
    }
    this.last.set(g.rootX, 0, g.rootZ);
    this.leanX = this.leanZ = 0;
    this.v.set(0, 0, 0);
    this.gv.set(0, 0, 0);
    this.sp = 0;
    this.twist = 0;
    this.facingSeen = false;
    this.dphase = 0;
    this.rate = 0;
    this.curve = 0;
    this.travelSeen = false;
    this.lastPhase = g.phase;
    this.moving = false;
    this.drop = 0;
    this.fresh = false;
  }
}

/** the farthest a head turns to look at something (m) */
const MAX_LOOK = 20;

/**
 * The head looks at something: the chest, neck and head turn onto a world point (20 / 30 / 50; the neck and head nod
 * 40 / 60), within what a neck allows, eased so it glances rather than snaps, and back ahead when the point is behind
 * the body or out of range. Applied on top of the pose (after `animate`), so it moves only the head and what rides on
 * it; the spine and arms stay as the pose put them. Works from the body's position and facing alone, so it reads no
 * matrices.
 */
export class LookAt {
  private yaw = 0;
  private pitch = 0;
  /** the eyes' height above the root, at the pose's rest */
  private readonly eyeH: number;

  constructor(private readonly j: Joints) {
    this.eyeH = j.body.position.y + j.hips.position.y + j.spine.position.y + j.chest.position.y + j.neck.position.y
      + j.head.position.y;
  }

  reset(): void {
    this.yaw = 0;
    this.pitch = 0;
  }

  /** `from` the body's spot (x, ground y, z) and `facing`; `target` a world point, or null to look ahead; `weight`
   *  0..1 */
  update(dt: number, from: THREE.Vector3, facing: number, target: THREE.Vector3 | null, weight = 1): void {
    if (!IK || dt <= 0) return;
    const j = this.j, sc = j.root.scale.x;
    let ty = 0, tp = 0;
    if (target && weight > 0) {
      const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz);
      if (d > 0.5 && d < MAX_LOOK) {
        let a = Math.atan2(dx, dz) - facing;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        // behind the shoulders it looks ahead again rather than wringing the neck
        if (Math.abs(a) < 1.9) {
          ty = Math.max(-1.15, Math.min(1.15, a)) * (1 - smooth((Math.abs(a) - 1.2) / 0.7));
          tp = Math.max(-0.45, Math.min(0.45, Math.atan2(from.y + this.eyeH * sc - target.y, d)));
        }
      }
    }
    this.yaw = damp(this.yaw, ty * weight, 7, dt);
    this.pitch = damp(this.pitch, tp * weight, 7, dt);
    // (the turn starts low: the chest takes a share, the neck and head the rest)
    j.chest.rotation.y += this.yaw * 0.2;
    j.neck.rotation.y += this.yaw * 0.3;
    j.head.rotation.y += this.yaw * 0.5;
    j.neck.rotation.x += this.pitch * 0.4;
    j.head.rotation.x += this.pitch * 0.6;
  }
}
