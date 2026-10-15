// The Warrior: a bare-headed veteran in an engraved breastplate over layered leather, fur at the collar,
// cuffs and boot tops, crossed straps, a mail skirt between leather tassets, engraved knee cops and tall
// strapped boots. Carries the equipped weapon and shield, and wears only the armour
// equipped: without a chest item the quilted gambeson, trousers and boots under it, without a hands item
// bare hands below the gambeson's sleeves. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, mail as mailMaps, cloth as clothMaps, steel as steelMaps, fur as furMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm, groundFeet, runShareOf, disposeGeometries } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { FurSway } from './furSway';
import { LegIK, IK } from './ik';
import { fitArm, solveArm, type ArmResult } from './armIK';
import { bodyShape } from './anatomy';
import { curve, PoseFade, type Keys } from './motion';
import { buildFlask, drink, drinkUp, DRINK_SHEATHED, type DrinkHold } from './flask';
import { taperTube, twist, plate, edgeTube, strap, belt, buckle, stud, disc, furTufts, Skirt, SkirtLimbs, armOffThigh, merge, scaleUV, lod, type SurfaceFn, type JointPoint } from './armor';
import { buildHead, buildNeck, toGroup, handSkin, HEAD_MM } from './head';
import { buildHand, poseHand, hold, seat, fistReach, fistTurn, fistOn, gripTurn, bare, handCapsules, SLANT } from './hands';
import { axe, greataxe, greatsword, mace, maul, sword, type WeaponMaterials } from './weapons';
import { clamp, lerp, mulberry, damp } from '../../util';
import { groundHeight } from '../../world/ground';
import { fromEyes, dirFromEyes, fromScreen, viewAt, ViewFade } from '../viewModel';
import { tunable } from '../../core/tuning';
import {
  TWO_FORE, TWO_BACK, ONE_FORE, ONE_BACK, CUT_FLAT, EYES_TURN, POWER_TWO, SMITE_TWO, POWER_ONE,
  RECOVER_TWO, ONE_DOWN_AT, ONE_DOWN_DIR,
} from './warriorEyes';
import type { ActionState, AnimState, Fist, Gear, LowerGrip, Model } from '../../types';

const ZERO = new THREE.Vector3(), _v = new THREE.Vector3();
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
interface Weapon { group: THREE.Group; len: number; off: number | null; /** the grip's radius, for the fingers */ r: number; /** worn on the belt: the point along it that sits in the frog, and whether it hangs blade down (a sword, from its guard) or head up (an axe or mace, its haft through the ring) */ hang?: { at: number; down: boolean } }
/** the grip turns the weapon's +Y forward and a little up out of the bent arm */
const GRIP = Math.PI / 2 + 0.7;
/** straightens the weapon along the arm, for swings that trace the damage arc */
const ALONG_ARM = Math.PI - GRIP;
/** how far a weapon arm swings at a run (rad), and the share of it the wrist turns back so the blade stays put */
const ARM_SWING = 0.4, WRIST = 0.8;
/** at a run (rig.ts `walkCycle`'s `pump`): how far a weapon arm pumps as a runner's free arm does, and a shield arm
 *  (the shield's weight and breadth: it is carried bent at the side); how much further each is bent at the elbow
 *  (rad), and the share of `WRIST` a weapon's wrist holds it against the forearm's swing with. A blade held thumb up
 *  tilts only as far as the wrist bends sideways: pumped as far as a free arm, low at the back of the swing, it
 *  pointed ahead at the hip and the arm's solve took the elbow forward to keep the wrist within its range, so the
 *  weapon hand is held higher, bent past a right angle, and pumps less */
const RUN_PUMP = 0.5, RUN_SHIELD_PUMP = 0.25, RUN_BEND = 0.85, RUN_SHIELD_BEND = 0.45, RUN_WRIST = 0.5;
/** and how much of the forearm's swing a weapon arm's elbow takes up at a run, the forearm kept near level so its
 *  blade stays up: swung with the arm, the blade pointed 45 degrees ahead at the back of the swing, and cocked back at
 *  the wrist instead, past the wrist's sideways range, the arm's solve held the arm forward */
const RUN_LEVEL = 0.7;
/** a two-hander carried at a run at high port, in the chest's own frame (rig units): the right hand's grip before the
 *  right of the chest, the weapon up past the right shoulder, tipped back and out, the right elbow down and out, the
 *  left hand on the lower grip below; the arms carried by the trunk's turn, not pumping. Held upright before the face
 *  in the right hand, as at a walk, the left let go of its grip out of reach and hung at the side */
const RUN_TWO_AT = new THREE.Vector3(-0.07, 0.14, 0.3), RUN_TWO_DIR = new THREE.Vector3(-0.15, 1, -0.28);
const RUN_TWO_POLE = new THREE.Vector3(-1, -1, -0.2);
/** a two-hander carried on the shoulder out of a fight, in the chest's own frame (rig units), as a person carries a
 *  heavy one: the upper arm hanging by the side, the forearm level ahead and rising a little, the weapon laid back
 *  from the fist up over the front of the shoulder, the wrist straight (the blade leaves a straight fist 130 degrees
 *  from the forearm, `GRIP`), the left hand let go of it and hanging. (Held before him in both hands at rest and
 *  walking, it was too heavy to carry so, #225; the fist before the shoulder bent the wrist back 60 degrees, and
 *  turned to lay the blade's flat on it, 84 sideways: a fist holds a flat along its palm.) Shouldered once he hasn't
 *  fought for `SHOULDER_AFTER` s, lifted onto it over about half a second (`SHOULDER_RATE`); any move but a drink takes
 *  it off at once, the move's own fade bringing it down */
const SHOULDER_AT = new THREE.Vector3(-0.22, 0.14, 0.3), SHOULDER_DIR = new THREE.Vector3(0.06, 0.62, -0.78).normalize();
const SHOULDER_POLE = new THREE.Vector3(-0.2, -1, -0.3), SHOULDER_AFTER = 2, SHOULDER_RATE = 6;
/** Through the eyes (tuned live in a dev build, `--tune warriorEyes.shoulder=...`): the right arm's shoulder in the
 *  view (camera space, m: x right, y up, -z ahead; the left's mirrors it), low beside the camera, as a game's
 *  first-person arms come up from the screen's bottom corners; a two-hander at rest there, as its moves are keyed
 *  (`restOn`, the lower grip's place on the screen, as `oneOn`'s below, the hands under the frame's bottom right
 *  corner; `restDir`, the weapon's way: upright at the frame's right edge, its head in the top right, as Vermintide
 *  2's) and where its right elbow points (`pole`, the chest's frame);
 *  and a one-hander at rest (`oneOn`, its grip's place on the screen, `fromScreen`: across and up from the middle to
 *  the edges and metres ahead, its fist at the bottom right corner, mostly below the frame, as Vermintide 2's are;
 *  `oneDir`, its way, upright at the frame's right edge; a second blade's mirrors it), held from
 *  shoulders of their own (`oneShoulder`); and how far
 *  a fist may turn about its handle (rad, `roll`) for its arm to keep within a body's ranges, and what each degree of
 *  its wrist's bend costs it (armIK's `wristW`, `wrist`) (`fitInView`); and the field of view the arms and weapons
 *  are drawn with (`fov`, vertical degrees: a camera of their own, renderer.ts `drawArms`, narrower than the world's
 *  66 as a game's first-person weapon's) */
const EYES = tunable('warriorEyes', {
  shoulder: [0.22, -0.46, -0.25], restOn: [0.72, -1.8, 0.5], restDir: [0.1, 1, -0.45], pole: [-1, -0.3, 0.3],
  oneOn: [0.58, -1.3, 0.6], oneDir: [0.45, 1, -0.3], bladeOn: [0.76, -0.42, 0.5], bladeDir: [0.4, 1, -0.2],
  bladeFlat: [-0.7, 0, 0.7], oneFlat: [-1, 0, 0.2],
  oneShoulder: [0.3, -0.4, 0.08], roll: 1.2, wrist: 1, fov: 45,
});
const _er = new THREE.Vector3(), _ed = new THREE.Vector3(), _ef = new THREE.Vector3();
const _rf = new THREE.Vector3(), _lf = new THREE.Vector3();
/** a one-hander's rest through the eyes, into `on`, `way` and the way its flat faces (`flat`), and returns how much of
 *  the way that turns it: a sword's (`bladeOn`, `bladeDir`: its hilt and the fist in the corner, the blade up to the
 *  top right, as Vermintide 2's sword; `bladeFlat`, turned on its length so it's seen narrow, as that one is: face on,
 *  it was twice as wide) or a hafted weapon's (`oneOn`, `oneDir`: the fist below the frame, the haft in over its bottom
 *  edge, the head at the right, as its axe; `oneFlat`, its head broadside, the bit towards the middle, as that one's:
 *  left to the fist's own turn, the axe's head was seen edge on, the haft alone) */
function oneRest(w: Weapon, on: THREE.Vector3, way: THREE.Vector3, flat: THREE.Vector3): number {
  const blade = !!w.hang?.down;
  fromScreen(blade ? EYES.bladeOn : EYES.oneOn, on);
  way.fromArray(blade ? EYES.bladeDir : EYES.oneDir).normalize();
  flat.fromArray(blade ? EYES.bladeFlat : EYES.oneFlat).normalize();
  return 1;
}
const _fw = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()), _fwq = new THREE.Quaternion();
/** how long the left hand takes to come onto the lower grip as a two-hander comes off the shoulder (s) */
const TAKE_HOLD = 0.15;
/** the way a shouldered weapon's flat faces, in the chest's frame: sideways, as a straight fist holds it, palm in and
 *  thumb up (left to the turn the weapon was in before, the wrist stopped at its range with the blade upright) */
const SHOULDER_FLAT = new THREE.Vector3(1, 0, 0);
/** a weapon's flat, in its grip's frame: every weapon is built with its blade's width along its own x, and mounted a
 *  quarter turn about the grip (`MOUNT`), so its flat lies along the palm */
const FLAT_IN_GRIP = new THREE.Vector3(1, 0, 0);
/** arm length (upper + fore + hand), before the model's 1.1 scale */
const ARM = 0.63;
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const _grip = new THREE.Vector3(), _pole = new THREE.Vector3(1, -0.7, -0.6), _pw = new THREE.Vector3(), _fq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _eq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _vl = new THREE.Quaternion(), _vr = new THREE.Quaternion();
const _gw = new THREE.Vector3(), _dw = new THREE.Vector3(), _cur = new THREE.Vector3(), _hq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _sq = new THREE.Quaternion();
/** the legs' own blend over the pose this frame (left, right), see `legs.update` */
const _legW: [number, number] = [1, 1];
const IDENT = new THREE.Quaternion(), _va = new THREE.Vector3(), _vd = new THREE.Vector3(), _up = new THREE.Vector3(), _vg = new THREE.Vector3();
const _ra = new THREE.Vector3(), _rd = new THREE.Vector3(), _la = new THREE.Vector3(), _ld = new THREE.Vector3();
const _gs1 = new THREE.Vector3(), _gs2 = new THREE.Vector3(), _gs3 = new THREE.Vector3(), _gsq = new THREE.Quaternion();
/** a weapon's points that can be its lowest, in its group's frame: each corner of its surface once */
const LOW_POINTS = new WeakMap<Weapon, THREE.Vector3[]>();

/** `w`'s points that can be its lowest (worked out the first time they're needed) */
function lowPoints(w: Weapon): THREE.Vector3[] {
  let points = LOW_POINTS.get(w);
  if (points) return points;
  points = [];
  const seen = new Set<string>(), into = new THREE.Matrix4(), p = new THREE.Vector3();
  w.group.updateWorldMatrix(true, true);
  const from = w.group.matrixWorld.clone().invert();
  w.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    into.multiplyMatrices(from, mesh.matrixWorld);
    const at = mesh.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      p.fromBufferAttribute(at, i).applyMatrix4(into);
      // (to the millimetre: a surface's triangles share their corners)
      const key = `${Math.round(p.x * 1e3)},${Math.round(p.y * 1e3)},${Math.round(p.z * 1e3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points!.push(p.clone());
    }
  });
  LOW_POINTS.set(w, points);
  return points;
}
const _hw1 = new THREE.Vector3(), _hw2 = new THREE.Vector3(), _hw3 = new THREE.Vector3();
/** `rollFlat`'s: the flat as it is and as it's wanted, across the weapon, their cross, and the roll between them */
const _fn = new THREE.Vector3(), _ft = new THREE.Vector3(), _fc = new THREE.Vector3(), _fr = new THREE.Quaternion();
const SHIELD_SIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const SHIELD_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const SIDE_POS = new THREE.Vector3(0.07, -0.02, 0), FRONT_POS = new THREE.Vector3(0, -0.1, 0);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- the basic swing (third person), keyed over the cast. The tip goes round in units of half the arc
// (-1 wound to the start side, +1 at the far side): it winds, loads a little deeper, crosses the arc from
// 0.55 to 0.85 in step with the trail (skills/cleave swingArc) and carries on past it. The body leads it:
// the hips turn first, then the spine and chest, the arm and wrist come last.
/** where the feet stand (left x, z, turn, then right), rig units: at rest, fighting, Power Strike's step in, behind the shield */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
const TAIL: Record<string, number> = { chop: 0.3, smite: 0.3, buff: 0.55, flurry: 0.15 }, TAIL_OUT: Record<string, number> = { chop: 0.55, smite: 0.5, buff: 0.6, flurry: 0.35 };
/** a blade's turn in the fist about its own length (third person): its flats along the palm, its edge (an axe's bit) out over the knuckles, as a real one is held */
const MOUNT = -Math.PI / 2;
/** drinking: the elbow raised out to the side, the wrist out to the left of the chin (as from a horn: the shield on that forearm turns edge on beside the head, not over the face) */
const DRINK: DrinkHold = { wrist: new THREE.Vector3(0.1, -0.06, 0.2), tipped: new THREE.Vector3(0.09, 0.1, 0.19), pole: new THREE.Vector3(1, -0.2, 0) };
const REST_FEET = [0.13, 0.09, 0.15, -0.14, -0.1, -0.55], FIGHT_FEET = [0.13, 0.22, 0.15, -0.14, -0.15, -0.55];
/** Twin Fangs: the share of it that is the lunge (skills/twinFangs LUNGE / (LUNGE + HOLD)), and the lunge stance after it */
const FANG_LUNGE = 0.39, FANG_FEET = [0.13, 0.34, 0.1, -0.15, -0.25, -0.5];
const BRACE_FEET = [0.13, 0.2, 0.1, -0.15, -0.3, -0.4], SKID_FEET = [0.18, 0.3, 0.2, -0.17, -0.12, -0.5];
const WIDE_FEET = [0.2, 0.08, 0.35, -0.2, -0.06, -0.45];
const CHOP_FEET = [0.12, 0.36, 0.1, -0.15, -0.2, -0.6], GUARD_FEET = [0.13, 0.26, 0.3, -0.13, -0.2, -0.7];
const SW_TIP: Keys = [[0, -1.3], [0.3, -1.25], [0.5, -1.35], [0.55, -1], [0.85, 1], [0.95, 1.3], [1, 1.35]];
/** the upper arm's pitch: raised as it winds, level through the blow, dropping as it carries on */
const SW_PITCH: Keys = [[0, -1.3], [0.45, -1.45], [0.58, -1.35], [0.72, -1.2], [0.88, -0.95], [1, -0.75]];
/** the elbow: cocked, thrown straight into the blow, giving a little after it */
const SW_ELBOW: Keys = [[0, -1.0], [0.45, -1.25], [0.62, -0.15], [0.8, -0.1], [1, -0.55]];
/** the wrist: cocked back, then snapped through so the blade leads the hand */
const SW_WRIST: Keys = [[0, 0.6], [0.48, 0.45], [0.62, 1], [1, 0.95]];
/** the pelvis: back onto the rear foot and loading as it winds, forward and down into the blow */
const SW_FWD: Keys = [[0, -0.02], [0.45, -0.05], [0.65, 0.06], [0.9, 0.08], [1, 0.06]];
const SW_DIP: Keys = [[0, -0.02], [0.45, -0.04], [0.66, -0.085], [1, -0.06]];
/** the trunk: drawn up as it winds, crunching over into the blow; the shoulders tipping from the high side to the low */
const SW_BEND: Keys = [[0, 0], [0.45, -0.06], [0.7, 0.16], [1, 0.18]];
/** the forearm's roll that leads a swing with the edge (rad): a forehand palm up, a backhand (share of it) palm down */
/** a one-hander at the ready (shoulder pitch, elbow, wrist, over the stance's arm): the forearm angled down and the
 *  wrist nearly straight, so the blade rises from the fist (the grip tips it forward of square to the hand, GRIP);
 *  a two-hander's (then the arm's turn in) held before the middle of the body, where the left hand reaches its lower grip */
const REST_ARM = [-0.35, 0.25, -0.5], REST_TWO = [-0.3, 0.2, -0.45, 0.4];
const SW_ROLL = Math.PI / 2, SW_BACK = 0.75, FANG_ROLL = -0.8;
/** a two-handed swing placed by the weapon in the chest's own frame, as a person swings one: both hands kept before
 *  the chest, round it by `SW2_ROUND` of the swing's turn (`SW_TIP`, rad), reaching out through the cut and drawn in
 *  at either end (`SW2_OUT`, `SW2_IN`, rig units: 38 cm out through it, the lower grip came 14 cm before the chest and
 *  the left arm let go of it), high by the shoulder at either end and low through the cut (`SW2_HIGH`, `SW2_LOW`);
 *  the blade leading them round (`SW2_LEAD` times their angle), rising `SW2_LEVEL` through the cut and `SW2_RISE`
 *  over the shoulder at either end (rad: a fist holds a blade near square to its forearm, so from the hands before
 *  the chest a level blade lay along the forearms, which no wrist bends to, and the arm's fit stood it upright and
 *  pulled the lower grip out of reach), the palm up on a forehand and down on a backhand so the edge leads; the
 *  trunk's turn sweeps it wide. (Keyed by the right arm's turns, the arm swung 90 degrees each way: the lower grip
 *  went out of the left arm's reach and back through the chest, and the left hand let go of it on every swing.) */
const SW2_ROUND = 0.75, SW2_OUT = 0.47, SW2_IN = 0.32, SW2_LOW = -0.12, SW2_HIGH = 0.15, SW2_LEAD = 2, SW2_LEVEL = 0.5, SW2_RISE = 0.9;
const SW2_POLE = new THREE.Vector3(-0.5, -1, -0.2);
/** the edge leads through the cut, and past it the wrists roll back over (the swing's turn, `SW_TIP`, rad: easing off
 *  from the first to none at the second). Led with the edge to the end of the follow-through, the forearm was asked to
 *  turn near the far side of its range, stopped at whichever end was nearer, and turned the hand over in a frame,
 *  178 degrees, as the swing ended */
const SW2_EDGE = [0.9, 1.3];
/** Steel Tempest with a two-hander, held as a person spins one, in the chest's frame: both hands low before the belly
 *  and a little to his right (trailing the hips, as the one-hander's arm), the arms reaching down and out, the blade
 *  out ahead and to his right, rising a little (a fist holds it near square to the forearm: see SW2_*), its edge
 *  leading the turn (he turns to his left: palm up, as a forehand's). (Spun in the right hand alone, the arms flung
 *  out to either side, the left hand let go of it.) */
const SPIN2_AT = new THREE.Vector3(-0.15, -0.2, 0.42), SPIN2_DIR = new THREE.Vector3(-0.5, 0.3, 0.8).normalize();
const SPIN2_FLAT = new THREE.Vector3(0, 1, 0);
const SW_TILT: Keys = [[0, 0.08], [0.45, 0.12], [0.7, -0.02], [1, -0.1]];

// --- Power Strike (third person), keyed over its 1.5s cast, the blow at 0.9 (the skill's fireAt): a step in
// as the weapon goes up, the body rising and arching back over the rear foot while the charge gathers (the
// knees loading), then everything thrown down onto the front foot, the trunk crunching over the blow
const PS_PITCH: Keys = [[0, -1.3], [0.25, -2.95], [0.86, -3.05], [0.9, -2.75], [0.95, -1.3], [0.975, -1.08], [1, -1.12]];
const PS_WRIST: Keys = [[0, 1], [0.92, 1], [0.975, 0.15], [1, 0.1]];
const PS_ELBOW: Keys = [[0, -0.35], [0.25, -0.55], [0.86, -0.7], [0.93, -0.15], [1, -0.12]];
const PS_BEND: Keys = [[0, 0], [0.25, -0.18], [0.86, -0.26], [0.9, -0.2], [0.95, 0.42], [0.975, 0.52], [1, 0.48]];
const PS_FWD: Keys = [[0, 0], [0.25, -0.05], [0.86, -0.08], [0.95, 0.13], [1, 0.14]];
const PS_DIP: Keys = [[0, 0], [0.25, 0.01], [0.86, -0.05], [0.9, -0.03], [0.96, -0.19], [0.98, -0.21], [1, -0.2]];
/** the hips open towards the weapon side as it rises and drive square into the blow */
const PS_HIPS: Keys = [[0, 0], [0.25, -0.15], [0.86, -0.22], [0.95, 0.1], [1, 0.08]];

// --- Thunder Crescent (third person), keyed over its cast, the blow into the ground at 0.55 (the skill's fireAt): the
// great weapon swung up overhead as the weight goes back, a moment at the top, then driven down before him, the trunk
// crunching over it and the knees giving under it; the ground stops it (`groundStop`), and it stays there a moment
const SM_PITCH: Keys = [[0, -1.3], [0.34, -2.65], [0.42, -2.7], [0.5, -2], [0.55, -1.1], [0.62, -1.05], [1, -1.08]];
const SM_ELBOW: Keys = [[0, -0.55], [0.34, -0.65], [0.42, -0.65], [0.52, -0.3], [0.56, -0.2], [1, -0.25]];
const SM_BEND: Keys = [[0, 0], [0.34, -0.16], [0.42, -0.18], [0.5, 0.2], [0.56, 0.5], [0.64, 0.56], [1, 0.5]];
const SM_FWD: Keys = [[0, 0], [0.34, -0.05], [0.42, -0.06], [0.55, 0.12], [1, 0.13]];
const SM_DIP: Keys = [[0, 0], [0.34, 0.01], [0.42, 0], [0.55, -0.13], [0.62, -0.16], [1, -0.15]];
const SM_HIPS: Keys = [[0, 0], [0.34, -0.15], [0.42, -0.17], [0.55, 0.1], [1, 0.08]];
/** the weapon arm's turn in (a two-hander's): over the middle of the head as it's raised, less as it comes down before
 *  him (turned in as far, the arm swept across the body while still high, past what the shoulder allows there) */
const SM_YAW: Keys = [[0, 0.7], [0.42, 0.7], [0.5, 0.4], [1, 0.4]];
/** the blade in the upright plane ahead of him all through it (`aimAtFloor`), taken from the pose's own over the
 *  first of these shares of the cast: pointing this far up (rad over level ahead), up and back over his head as it's
 *  raised, then falling from there over these shares, faster as it comes, until it points at the floor */
const SM_TAKE = [0, 0.12], SM_FALL = [0.45, 0.55];
const SM_BLADE: Keys = [[0, 1.1], [0.34, 2], [0.42, 2.05]];
/** where the blow ends: from these shares of the cast the hands come to rest together before the middle of him, this
 *  far ahead of his feet and this high over the floor (m at a man's size), the elbows out and down (chest's frame) */
const SM_LAND = [0.47, 0.55], SM_AHEAD = 0.6, SM_HIGH = 0.8;
const SM_POLE = new THREE.Vector3(-1, -0.6, -0.5);
/** the overhead blows through the eyes: the weapon raised by `lift` of the cast, coming down from `from` to `to` (as
 *  their keys in models/warriorEyes.ts, landing where the skill fires), and how much it trembles as it's held up
 *  (Power Strike's charge) */
const OVERHEAD: Record<string, { lift: number; from: number; to: number; shake: number }> = {
  chop: { lift: 0.3, from: 0.8, to: 0.9, shake: 0.02 },
  smite: { lift: 0.34, from: 0.42, to: 0.55, shake: 0 },
};

// --- the breastplate: a torso-shaped shell over the gambeson, as broad as a strong man's chest (ANSUR
// II: 29 cm across, 25 deep, plus padding and steel), with a gentle keel and pectoral swell, its top
// dipping a little at the collar (chest joint space)
const bpRx = (y: number) => 0.148 + 0.034 * sm(-0.07, 0.12, y) - 0.024 * sm(0.17, 0.25, y);
const bpRz = (y: number) => 0.128 + 0.026 * sm(-0.07, 0.1, y) - 0.028 * sm(0.16, 0.25, y);
const BP_A = 1.75;
/** the pauldrons' size against the shoulder */
const PAULDRON = 0.7;
const bpTop = (a: number) => 0.235 - 0.03 * Math.cos(a) ** 2;
function bpPoint(a: number, y: number, out: THREE.Vector3, lift = 0): THREE.Vector3 {
  const x = Math.sin(a) * (bpRx(y) + lift);
  const G = (dx: number, dy: number, s: number) => Math.exp(-(dx * dx + dy * dy) / (s * s));
  const pec = 0.012 * G(Math.abs(x) - 0.075, y - 0.12, 0.07) + 0.007 * Math.exp(-((x / 0.025) ** 2)) * sm(-0.07, 0.05, y);
  return out.set(x, y, Math.cos(a) * (bpRz(y) + lift) + (Math.cos(a) > 0 ? pec * Math.cos(a) : 0));
}
const breast: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 2 * BP_A; return bpPoint(a, lerp(-0.07, bpTop(a), v), out); };
const back: SurfaceFn = (u, v, out) => { const a = Math.PI + (u - 0.5) * 2 * 1.45; return bpPoint(a, lerp(-0.05, 0.21, v), out); };
/** a point on the breastplate's front at x, y, `lift` above it */
function onPlate(x: number, y: number, lift = 0.004): THREE.Vector3 {
  const a = Math.asin(clamp(x / bpRx(y), -1, 1));
  return bpPoint(a, y, new THREE.Vector3(), lift);
}

export function buildWarrior(): Model {
  const kit = createKit(0xffa040);
  const rng = mulberry(11);
  const tex = (maps: ReturnType<typeof steelMaps>, rep: number, ns = 1) => { const m = pbrMaterialMaps(maps, rep, ns); return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale }; };
  const E = engravedSteel();
  const engraved = kit.std({ color: 0xc4c8cf, metalness: 0.92, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap, normalScale: new THREE.Vector2(1.4, 1.4) });
  const plateM = kit.std({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8) });
  // blades: a thin blade turned away from the lights only mirrors its surroundings, and the dark ground
  // and horizon of a night sky turn it black: a cool rim of light on its bevels keeps the steel readable
  const bladeM = kit.rim({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8), roughnessMap: null }, 0x9aa8c0, 0.3);
  const darkSteel = kit.std({ color: 0x5b5f68, metalness: 0.9, roughness: 1, ...tex(steelMaps(), 1, 0.6) });
  const brass = kit.std({ color: 0xb08a4a, metalness: 1, roughness: 0.38 });
  const leather = kit.std({ color: 0x4e3222, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const leatherDark = kit.std({ color: 0x2c1d14, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const cloth = kit.rim({ color: 0x323c56, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x3a4a70, 0.35);
  const mail = kit.std({ color: 0x8e949e, metalness: 0.85, roughness: 1, ...tex(mailMaps(), 1, 1.6) });
  const furM = kit.std({ color: 0x75644f, roughness: 1, map: pbrMaterialMaps(furMaps(), 1).map, normalMap: pbrMaterialMaps(furMaps(), 1).normalMap });
  const wood = kit.std({ color: 0x8a6446, roughness: 1, ...tex(woodMaps(), 1, 1) });
  const skinTip = kit.rim({ color: 0xc9957c, roughness: 0.6 }, 0x6a2a1c, 0.25);
  // bare hands and wrists
  const bareSkin = handSkin(kit, 'warrior');
  // the fuller only glows while a skill charges
  const edge = kit.glow(0xffb070, 0, false);

  const j = buildHumanoid({ skin: leather }, {
    chestW: 0.18, chestD: 0.14, waistW: 0.16, shoulderW: 0.21, shoulderY: 0.45, upperR: 0.068, foreR: 0.058, handR: 0.058,
    thighR: 0.1, shinR: 0.078, headR: 0.125, shinL: 0.41,
  });
  stripRig(j.root);
  // fur casts no shadow: hundreds of thin tufts would add much to the shadow pass for little
  const S = new Sculpt().glow(furM);
  // the armour, on meshes of its own so it comes off (setGear): the chest item's (breastplate, pauldrons, mail skirt,
  // tassets, knee cops), the hands item's (bracers, gloves), and what shows without the latter (the forearm's sleeve)
  const A = new Sculpt().glow(furM), H = new Sculpt().glow(furM), B = new Sculpt();

  // --- torso: a quilted gambeson under it all, layered leather at the waist, the breastplate on top
  S.add(scaleUV(lathe([[0.14, -0.12], [0.152, -0.02], [0.165, 0.1], [0.162, 0.18], [0.14, 0.25], [0.08, 0.29]], 24), 3, 1.5), cloth, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]);
  S.add(scaleUV(lathe([[0.14, -0.05], [0.145, 0.08], [0.152, 0.2], [0.155, 0.26]], 24), 3, 1), leatherDark, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) S.add(belt(0.16 + g, 0.137 + g, y, 0.06, 0.01), leather, j.spine);
  // rivets along each band
  const studs: THREE.BufferGeometry[] = [];
  const studAt = (p: THREE.Vector3, n: THREE.Vector3, r: number) => {
    const g = stud(r), m = new THREE.Matrix4().lookAt(ZERO, n, V(0, 1, 0));
    // lookAt aims -Z at n: turn it round so the dome (+Z) faces out
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).applyMatrix4(m).translate(p.x, p.y, p.z);
    studs.push(g);
  };
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) for (let k = 0; k < 14; k++) {
    const a = (k / 14 - 0.5) * 2.6;
    studAt(V(Math.sin(a) * (0.165 + g), y - 0.02, Math.cos(a) * (0.142 + g)), V(Math.sin(a), 0, Math.cos(a)), 0.005);
  }
  S.add(merge(studs.splice(0)), brass, j.spine);
  // the breastplate, engraved across the front (projected straight on), and a plain back plate
  const bp = plate(breast, 28, 14, 0.008);
  projectUV(bp, steelRegion('chest'), (x, y) => [(x + 0.22) / 0.44, (y + 0.12) / 0.42]);
  A.add(bp, engraved, j.chest);
  A.add(plate(back, 20, 10, 0.008), plateM, j.chest);
  A.add(edgeTube(breast, 'v1', 0.008, 28), plateM, j.chest);
  A.add(edgeTube(back, 'v1', 0.008, 20), plateM, j.chest);
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16 - 0.5) * 2 * BP_A * 0.96, p = bpPoint(a, -0.05, new THREE.Vector3(), 0.008);
    studAt(p, V(Math.sin(a), 0, Math.cos(a)), 0.006);
  }
  A.add(merge(studs.splice(0)), plateM, j.chest);
  // side straps joining front and back plates under the arms
  for (const s of [1, -1]) for (const y of [0.02, 0.1]) A.add(strap([V(s * 0.155, y, 0.1), V(s * 0.188, y, 0), V(s * 0.155, y, -0.1)], 0.028, 0.006), leather, j.chest);
  // crossed straps over the chest, each with a buckle; they run on over the shoulders
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [V(s * 0.1, 0.27, -0.1), V(s * 0.115, 0.29, -0.02), V(s * 0.105, 0.25, 0.09)];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(onPlate(lerp(s * 0.1, -s * 0.16, t), lerp(0.2, -0.04, t), 0.004)); }
    A.add(strap(pts, 0.04, 0.007), leather, j.chest);
    const mid = onPlate(s * -0.01, 0.1, 0.012);
    A.add(buckle(0.05, 0.05), plateM, j.chest, mid.toArray(), [0, 0, s * 0.62]);
  }

  // --- fur collar round the neck and over the shoulder tops
  S.add(furTufts(rng, 280, (i, o) => {
    const a = rng() * Math.PI * 2, r = 0.55 + rng() * 0.45, sa = Math.sin(a), ca = Math.cos(a);
    o.p.set(sa * (0.09 + 0.1 * r), 0.24 + rng() * 0.04 - Math.abs(sa) * r * 0.02, ca * (0.09 + 0.045 * r));
    o.d.set(sa, 0.5 + rng() * 0.5, ca);
  }, 0.06, 0.011), furM, j.chest);
  // a high collar of the gambeson inside the fur, and the neck
  S.add(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 20, 1, true), cloth, j.chest, [0, 0.27, 0]);

  // --- pauldrons: three steel lames over each shoulder with a rolled rim, an engraved medallion on the
  // top one, fur spilling out from under it
  for (const [s, joint0] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    // sized to sit over a man's deltoid (they were cut for a far broader frame)
    const sh = joint(joint0);
    sh.scale.setScalar(PAULDRON);
    const lame = (R: number, lat0: number, lat1: number, y: number): SurfaceFn => (u, v, out) => {
      const lon = (u - 0.5) * 3.3, lat = lerp(lat0, lat1, v);
      return out.set(s * Math.cos(lat) * Math.cos(lon) * R * 1.12 + s * 0.02, Math.sin(lat) * R * 0.78 + y, Math.cos(lat) * Math.sin(lon) * R);
    };
    const lames = [lame(0.14, -0.35, 0.0, -0.01), lame(0.135, -0.05, 0.45, 0), lame(0.13, 0.35, 1.45, 0.01)];
    for (const [i, L] of lames.entries()) {
      A.add(plate(L, 18, 6, 0.007), i === 2 ? plateM : darkSteel, sh);
      A.add(edgeTube(L, 'v0', 0.006, 18), plateM, sh);
    }
    const md = disc(0.04, 0.014);
    projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.04 + 1) / 2, (y / 0.04 + 1) / 2]);
    A.add(md, engraved, sh, [s * 0.095, 0.07, 0.07], [-0.5, s * 0.75, 0]);
    A.add(furTufts(rng, 44, (i, o) => {
      const a = (rng() - 0.5) * 3; o.p.set(s * (0.1 + Math.cos(a) * 0.04), -0.06, Math.sin(a) * 0.1); o.d.set(s * 0.6, -0.8, Math.sin(a) * 0.5);
    }, 0.045, 0.009), furM, sh);
  }

  // --- arms: navy sleeves strapped at the upper arm, fur at the elbow, leather bracers with a steel
  // plate, fingerless gloves (the hands item: without it the sleeves run on to the wrist, the hands bare)
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // the sleeve, thigh and shin run on past their joints under the bracer, the knee cop and the boot, and follow the lower limb there
    S.skin(scaleUV(limb(0.38, 0.078, 0.064, 0.12, 0.24, 14), 2, 1), cloth, sh, el, 0.2, 0.32);
    for (const y of [-0.13, -0.21]) S.add(belt(0.078, 0.078, y, 0.024, 0.006, 0, 14), leather, sh);
    H.add(furTufts(rng, 40, (i, o) => { const a = (i / 40) * Math.PI * 2; o.p.set(Math.sin(a) * 0.06, -0.035, Math.cos(a) * 0.06); o.d.set(Math.sin(a), 0.6, Math.cos(a)); }, 0.035, 0.009), furM, el);
    H.add(scaleUV(lathe([[0.052, -0.26], [0.06, -0.2], [0.066, -0.1], [0.07, -0.05], [0.068, -0.035]], 16), 2, 1), leather, el);
    // its top closed under the elbow's fur (through the eyes, with the fur hidden, it would show open)
    H.add(new THREE.CircleGeometry(0.069, 16).rotateX(-Math.PI / 2), leather, el, [0, -0.037, 0]);
    const vb: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 1.8, y = lerp(-0.24, -0.06, v), r = 0.066 + 0.01 * sm(-0.24, -0.08, y) + 0.004; return out.set(s * Math.cos(a) * r, y, Math.sin(a) * r); };
    H.add(plate(vb, 10, 8, 0.005), plateM, el);
    for (const y of [-0.09, -0.2]) H.add(belt(0.072, 0.072, y, 0.018, 0.006, 0, 14), leatherDark, el);
    // the glove's cuff: from under the bracer down over the wrist into the palm, following the hand, so the hand joins the forearm (the bracer ends above the wrist)
    H.skin(scaleUV(lathe([[0.041, -0.315], [0.043, -0.29], [0.045, -0.265], [0.048, -0.235], [0.052, -0.2]], 16), 2, 1), leather, el, hd, 0.25, 0.29);
    // bare: the gambeson's sleeve on down the forearm (its top inside the upper sleeve's end, which follows the
    // forearm), a turned-back cuff at the wrist, and the wrist into the palm
    B.add(scaleUV(lathe([[0.05, -0.245], [0.052, -0.2], [0.057, -0.12], [0.061, -0.04], [0.06, 0]], 16), 2, 1), cloth, el);
    B.add(scaleUV(lathe([[0.049, -0.25], [0.056, -0.245], [0.058, -0.215], [0.055, -0.205]], 16), 2, 0.3), cloth, el);
    B.skin(lathe([[0.036, -0.315], [0.037, -0.29], [0.039, -0.265], [0.042, -0.235]], 16), bareSkin, el, hd, 0.25, 0.29);
  }
  const handL = buildHand(j.handL, 1, leather, skinTip, 1.08, bareSkin), handR = buildHand(j.handR, -1, leather, skinTip, 1.08, bareSkin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });

  // --- legs: leather trousers, engraved knee cops, tall boots with fur tops, straps and a steel toe
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.skin(scaleUV(limb(0.54, 0.108, 0.078, 0.14, 0.26, 14), 2, 1.5), leatherDark, th, kn, 0.32, 0.46);
    S.skin(scaleUV(limb(0.46, 0.076, 0.058, 0.1, 0.32, 12), 2, 1.5), leatherDark, kn, an, 0.3, 0.41);
    const cop: SurfaceFn = (u, v, out) => { const lon = (u - 0.5) * 2.5, lat = lerp(-0.95, 1.05, v); return out.set(Math.sin(lon) * Math.cos(lat) * 0.082, Math.sin(lat) * 0.085, Math.cos(lon) * Math.cos(lat) * 0.075 + 0.012); };
    const kg = plate(cop, 14, 12, 0.006);
    projectUV(kg, steelRegion('knee'), (x, y) => [(x / 0.082 + 1) / 2, (y / 0.085 + 1) / 2]);
    A.add(kg, engraved, kn, [0, -0.01, 0]);
    for (const y of [0.05, -0.075]) A.add(belt(0.082, 0.07, y, 0.02, 0.006, 0, 14), leather, kn);
    // the boot's shaft from below the knee to the ankle, and a fur cuff over its top
    S.add(scaleUV(lathe([[0.056, -0.42], [0.062, -0.37], [0.072, -0.27], [0.078, -0.16], [0.082, -0.11], [0.08, -0.1]], 18), 2, 1.5), leather, kn, [0, 0, 0.005], [0, 0, 0], [1, 1, 1.06]);
    S.add(furTufts(rng, 48, (i, o) => { const a = (i / 48) * Math.PI * 2; o.p.set(Math.sin(a) * 0.08, -0.105, Math.cos(a) * 0.085); o.d.set(Math.sin(a), 0.7, Math.cos(a)); }, 0.04, 0.01), furM, kn);
    for (const y of [-0.23, -0.34]) {
      const r = 0.08 + (y + 0.16) * 0.1;
      S.add(belt(r, r * 1.06, y, 0.02, 0.006, 0, 16), leatherDark, kn);
      S.add(buckle(0.026, 0.026, 0.005), plateM, kn, [r + 0.006, y, 0], [0, Math.PI / 2, 0]);
    }
    // the foot: a rounded boot on a thick sole, a steel cap over the toe
    const foot = [V(0, -0.028, -0.05), V(0, -0.03, 0.04), V(0, -0.037, 0.14), V(0, -0.046, 0.21)];
    S.add(scaleUV(taperTube(foot, (t) => 0.05 - 0.02 * t * t, 12, 12), 1, 2), leather, an, [0, 0, 0], [0, 0, 0], [1.12, 0.82, 1]);
    S.add(taperTube(foot.map((p) => V(0, 0, p.z)), (t) => 0.056 - 0.02 * t * t, 12, 12), leatherDark, an, [0, -0.064, 0], [0, 0, 0], [1.15, 0.2, 1.04]);
    S.add(new THREE.SphereGeometry(0.047, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), plateM, an, [0, -0.042, 0.165], [0.5, 0, 0], [1.1, 0.9, 1.3]);
  }

  // --- below the belt: a mail skirt with leather tassets over it
  S.add(belt(0.168, 0.145, 0.01, 0.06, 0.012), leather, j.spine);
  const bk = disc(0.046, 0.016);
  projectUV(bk, steelRegion('disc'), (x, y) => [(x / 0.046 + 1) / 2, (y / 0.046 + 1) / 2]);
  S.add(bk, engraved, j.spine, [0, 0.01, 0.152]);
  // a second belt slung lower across the hips, and a pouch on it
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * Math.PI * 2; return V(Math.sin(a) * 0.2, 0.02 - 0.05 * Math.sin(a + 0.8) - 0.02 * Math.cos(a), Math.cos(a) * 0.17); }), 0.04, 0.01, true), leather, j.hips);
  S.add(new THREE.BoxGeometry(0.08, 0.1, 0.045), leatherDark, j.hips, [-0.18, -0.05, 0.08], [0, -0.8, 0]);
  S.add(new THREE.BoxGeometry(0.086, 0.04, 0.05), leather, j.hips, [-0.18, -0.005, 0.08], [0, -0.8, 0]);
  // (its top gathered under the waist belt, against the leather there: hung below the belt and wider than it, the ring between
  // the two was open, and the trousers' tops showed through it at the sides, standing too; the hips' flare is the drape's; seven
  // rows, as the hand on the shield's grip lay between two of six)
  const skirt = new Skirt({ r0: 0.145, r1: 0.25, len: 0.39, depth: 0.8, folds: 7, foldAmp: 0.03, flare: 0.7, rows: 7 });
  const skirtMesh = new THREE.Mesh(skirt.geo, mail);
  skirtMesh.position.y = 0.07; skirtMesh.castShadow = skirtMesh.receiveShadow = true;
  j.hips.add(skirtMesh);
  // what it is draped over, in its own space: the trousers' thighs (they bulge to 11 cm) and the shins over the boots (their
  // fur cuffs stand 11 cm off the shin, over the knee cops) from inside, the hands and the forearms' lower halves (a bracer's
  // plate or the sleeve) from outside, with the cloth's gap. Swung by the thighs alone, the mail was narrower than the
  // trousers at its sides and they came through it in every frame, standing too.
  const legBodies = new SkirtLimbs(), handBodies = new SkirtLimbs(), GAP = 0.018, HAND_GAP = 0.012, O = () => new THREE.Vector3();
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    legBodies.add([th, O()], [kn, O()], 0.112 + GAP, 0.084 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.115 + GAP, 0.065 + GAP);
  }
  const capsL = handCapsules(handL);
  for (const [a, b, r] of [...capsL, ...handCapsules(handR)]) handBodies.add(a, b, r + HAND_GAP);
  const cuffR = () => (gloved ? [0.075, 0.055] : [0.058, 0.058]);
  const fores = ([[j.elbowL, j.handL], [j.elbowR, j.handR]] as const).map(([el, hd]) => handBodies.add([el, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [hd, O()], 0));
  // (a left hand with no weapon in it, empty or on the shield's grip, swung out just enough to rest on the mail rather than in it:
  // armOffThigh)
  const freePts = [...capsL.flatMap(([a, b, r]) => [[a, r], [b, r]] as [JointPoint, number][]), [[j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], 0], [[j.handL, O()], 0]] as [JointPoint, number][];
  const placeBodies = (free: boolean) => {
    const [ra, rb] = cuffR();
    for (const f of fores) { f.ra = ra + HAND_GAP; f.rb = rb + HAND_GAP; }
    legBodies.place(skirtMesh);
    if (free) { freePts[freePts.length - 2][1] = ra; freePts[freePts.length - 1][1] = rb; armOffThigh(skirtMesh, j.shoulderL, 1, legBodies.list[0], HAND_GAP, freePts); }
    handBodies.place(skirtMesh);
  };
  const tassets: { g: THREE.Group; s: number }[] = [];
  for (const s of [1, -1]) {
    for (const [k, off] of [[0, 0.55], [1, 1.05]] as const) {
      const g = joint(j.hips, s * Math.sin(off) * 0.2, 0.05, Math.cos(off) * 0.172);
      g.rotation.order = 'YXZ'; g.rotation.y = s * off;
      const tf: SurfaceFn = (u, v, out) => { const x = (u - 0.5) * 0.12, yb = -0.3 + k * 0.04 + 0.03 * (2 * u - 1) ** 2; return out.set(x, lerp(yb, 0, v), 0.012 * Math.sin(u * Math.PI)); };
      const ta = new Sculpt();
      ta.add(plate(tf, 6, 8, 0.008, undefined, V(0, -0.15, -0.1)), leather, g);
      ta.add(edgeTube(tf, 'v0', 0.004, 8, 0.02), leatherDark, g);
      for (let q = 0; q < 4; q++) { const p = tf(0.2 + q * 0.2, 0.85, new THREE.Vector3()); ta.add(stud(0.006), plateM, g, [p.x, p.y, p.z + 0.008]); }
      ta.build();
      tassets.push({ g, s });
    }
  }

  // --- the head, with shoulder-length wavy hair, and an open-faced helmet worn over it when a head item is
  // equipped: a steel skull with a low crest, bands riveted over it and round the brow, a nasal down the nose,
  // cheek guards over the ears and a mail curtain over the nape. It is shaped on the head itself (padded over
  // the scalp); the face stays bare.
  const head = buildHead(j.head, kit, 'warrior', { hair: 'loose' });
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, 'warrior', j.P.neckL);
  // (worn only with a head item equipped: bareheaded, the hair shows; setGear)
  const helm = new THREE.Group(); helm.name = 'helm'; head.group.add(helm); helm.visible = false;
  {
    const h = new Sculpt(), C = toGroup(0, 128, -12), M = HEAD_MM;
    /** the shell towards `a` round the head (0 the face) and `el` up it, padded over the scalp, with a
     *  low crest along the middle; `lift` mm further out */
    const shell = (a: number, el: number, lift = 0, out = new THREE.Vector3()) => {
      const x = Math.sin(a) * Math.cos(el), y = Math.sin(el);
      return head.surface(a, el, 12 + lift + 4.5 * Math.exp(-((x / 0.12) ** 2)) * sm(0.1, 0.8, y), out);
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // the rim: just above the brows, over the ears at the sides, down to the nape behind
    const rimEl = (a: number) => Math.asin(lerp(0.36, -0.35, sm(0.5, 2.7, Math.abs(wrap(a)))));
    const out = (p: THREE.Vector3, o: THREE.Vector3) => o.subVectors(p, C).normalize();
    const dome = new THREE.SphereGeometry(1, lod(56, 28), lod(20, 10)), dp = dome.attributes.position, duv = dome.attributes.uv;
    for (let i = 0; i < dp.count; i++) {
      // round from the back (the sphere's seam) the same way the sphere winds, from the rim to the top
      const a = wrap(duv.getX(i) * Math.PI * 2 + Math.PI);
      shell(a, lerp(rimEl(a), Math.PI / 2, duv.getY(i)), 0, _v);
      dp.setXYZ(i, _v.x, _v.y, _v.z);
    }
    dome.computeVertexNormals();
    h.add(scaleUV(dome, 4, 1.5), plateM, helm);
    const ring = (el: (a: number) => number, lift: number, n: number) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 - Math.PI; return shell(a, el(a), lift); });
    // a rolled rim, the brow band over it, four bands meeting at the crown and a rivet on top
    const rim = ring(rimEl, 1, 48);
    h.add(taperTube([...rim, rim[0]], () => 0.0055, lod(96, 48), 6), plateM, helm);
    h.add(strap(ring((a) => rimEl(a) + 0.13, 0, 48), 0.032, 0.0035, true, out, 96), darkSteel, helm);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      h.add(strap(Array.from({ length: 10 }, (_, q) => shell(a, lerp(rimEl(a) + 0.26, Math.PI / 2 - 0.02, q / 9), 0)), 0.022, 0.003, false, out), darkSteel, helm);
      for (let q = 0; q < 3; q++) { const e = lerp(rimEl(a) + 0.4, 1.35, q / 2); studAt(shell(a, e, 3), out(shell(a, e), V(0, 0, 0)), 0.0038); }
    }
    for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2 - Math.PI, e = rimEl(a) + 0.13; studAt(shell(a, e, 3.5), out(shell(a, e), V(0, 0, 0)), 0.0036); }
    const top = shell(0, Math.PI / 2, 3);
    h.add(new THREE.SphereGeometry(0.009, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), plateM, helm, top.toArray(), [0, 0, 0], [1, 0.7, 1]);
    // the nasal: a ridged bar from the brow band down the bridge of the nose, clear of it, narrowing to
    // a rounded end
    const nTop = shell(0, rimEl(0) + 0.22, 4.5), nTopY = nTop.y / M;
    const nasal: SurfaceFn = (u, v, o) => {
      const c = 2 * u - 1, w = lerp(5.5, 9, v) * Math.sqrt(1 - (1 - sm(0, 0.12, v)) ** 2 * 0.75), x = c * w;
      const y = lerp(100, nTopY, v), z = lerp(head.midZ(y) + 4, nTop.z / M + 5, sm(0.55, 1, v));
      return toGroup(x, y, z + 2.5 * (1 - c * c) - x * x * 0.04, o);
    };
    h.add(plate(nasal, 6, 12, 0.003, undefined, C), plateM, helm);
    studAt(nasal(0.5, 0.88, new THREE.Vector3()).add(V(0, 0, 0.002)), V(0, 0, 1), 0.0035);
    // cheek guards over the ears, their lower edge tucked in over the beard, their front edge clear of
    // the face
    for (const s of [1, -1]) {
      const guard: SurfaceFn = (u, v, o) => {
        const a = s * lerp(0.95, 2.0, u), e0 = lerp(-0.62, -0.3, u) - 0.1 * Math.sin(u * Math.PI), el = lerp(e0, rimEl(a) + 0.08, v);
        return shell(a, el, 1.2 - 3 * sm(-0.2, -0.6, Math.sin(el)), o);
      };
      h.add(plate(guard, lod(12, 6), lod(12, 6), 0.005, undefined, C), plateM, helm);
      h.add(edgeTube(guard, 'v0', 0.0035, 16), plateM, helm);
      h.add(edgeTube(guard, 'u0', 0.0035, 12), plateM, helm);
      for (const [u, v] of [[0.3, 0.82], [0.7, 0.82], [0.45, 0.25]]) { const p = guard(u, v, new THREE.Vector3()); studAt(p.addScaledVector(out(p, _v), 0.004), out(p, V(0, 0, 0)), 0.0035); }
    }
    // mail hanging from under the rim behind the cheek guards, over the nape
    const aventail: SurfaceFn = (u, v, o) => {
      const a = Math.PI + (u - 0.5) * 2.7, p = shell(a, rimEl(a) + 0.05, -2, o), r = V(p.x, 0, p.z - C.z).normalize();
      return p.addScaledVector(r, 0.03 * (1 - v)).add(V(0, -0.09 * (1 - v), 0));
    };
    h.add(scaleUV(plate(aventail, lod(28, 12), 4, 0.003, undefined, C), 3, 3), mail, helm);
    h.add(merge(studs.splice(0)), plateM, helm);
    h.build();
  }

  // --- weapons in the right hand, built along the grip's +Y (blade up); setGear shows the equipped one.
  // The grip turns +Y to point forward, slightly up, out of the bent arm.
  const grip = joint(j.handR, 0, -0.06, 0.01);
  grip.rotation.x = GRIP;
  const weapons = new Map<string, Weapon>();
  const add = (name: string, len: number, off: number | null, r: number, build: (w: Sculpt, g: THREE.Group) => void, hang?: Weapon['hang']) => {
    const g = new THREE.Group();
    g.name = name;
    grip.add(g);
    const w = new Sculpt(`warrior-${name}`);
    build(w, g);
    w.glow(edge).build();
    g.visible = false;
    weapons.set(name, { group: g, len, off, r, hang });
  };
  // (each made as models/weapons.ts makes it, a sculpt of its own kind: a hero built again replays its pieces)
  const M: WeaponMaterials = {
    steel: plateM, dark: darkSteel, blade: bladeM, engraved, brass, wood, leather, leatherDark, glow: edge,
  };
  add('Sword', 1.12, null, 0.024, (w, g) => sword(w, g, M), { at: 0.115, down: true });
  add('Axe', 0.74, null, 0.024, (w, g) => axe(w, g, M), { at: 0.44, down: false });
  add('Mace', 0.72, null, 0.026, (w, g) => mace(w, g, M), { at: 0.52, down: false });
  add('Greatsword', 1.62, -0.24, 0.026, (w, g) => greatsword(w, g, M));
  add('Greataxe', 1.12, -0.3, 0.028, (w, g) => greataxe(w, g, M));
  add('Maul', 1.1, -0.28, 0.029, (w, g) => maul(w, g, M));
  const tip = joint(grip, 0, 1.12, 0);
  // where the left hand holds a two-handed weapon
  const offGrip = joint(grip, 0, -0.24, 0);
  let held: Weapon | null = null;

  // dual-wielding: a one-hander in the left fist too, the mirror image of the right grip (the
  // copies share geometry and materials)
  const gripL = joint(j.handL, 0, -0.06, 0.01);
  gripL.rotation.x = GRIP;
  gripL.scale.x = -1;
  const offWeapons = new Map<string, Weapon>();
  for (const [name, w] of weapons) {
    if (w.off != null) continue;   // two-handers
    const g = w.group.clone();
    gripL.add(g);
    offWeapons.set(name, { ...w, group: g });
  }
  let offHeld: Weapon | null = null;
  const tipL = joint(gripL, 0, 1, 0);
  /** Seen through its own eyes (entities/viewModel.ts) the weapons are posed to be seen but keep the middle
   *  of the view clear (measured on screen): at rest low in its corners, blades angled in (a two-hander,
   *  under the moves that don't place it in the view, low on the right, blade out) (added to shoulder
   *  pitch, elbow, wrist pitch, wrist roll, shoulder roll); the swings and the overhead blows are keyed in the view
   *  (models/warriorEyes.ts); the raised shield higher, its rim just under the crosshair (added to shoulder and
   *  elbow) */
  let fp = false;
  const FP_STANCE = [-0.6, 0, 0.7, 0, -0.2];
  const FP_STANCE_TWO = [-0.2, -0.2, 1.3, -1.0, -0.3];
  const FP_BLOCK = [-0.25, 0.05], NO_BLOCK = [0, 0];
  /** a two-hander at rest through the eyes, in both hands and both seen: where the left hand holds it in the
   *  view (camera space, metres; the right hand is further up the grip, however long), the weapon's
   *  direction there (up and out to the right, its head in the frame's corner), and where the right elbow points
   *  (down, so the forearm rises from the bottom of the view rather than lying across it). (Up and out at 45
   *  degrees, the handle ran along the left forearm, and a greataxe's and a maul's lower hand let go of it, the
   *  wrist 40 degrees past its range; upright it split the view, the heads out of the frame) */
  /** where a two-hander rests through the eyes, as the moves there are keyed (the lower grip's place in the view, the
   *  weapon's way: `EYES`, read each frame) */
  const FP_TWO_AT = V(0, 0, 0), FP_TWO_DIR = V(0, 1, 0), FP_TWO_POLE = V(0, -1, 0);
  /** a blade's flat turned to the eyes (camera space): a cut seen broadside */
  const FACE_EYES = V(0, 0, 1);
  /** One-handed moves through the eyes, placed in the view (the right hand's grip and its blade's direction,
   *  camera space; the left hand's mirrors it): Twin Fangs cuts each blade from high on its own side down
   *  across the view; Bull Rush draws the blades back, drives them ahead through the rush and flings them out
   *  to the sides as it lands.
   *  (Posed by joint angles the raised arms loomed over the camera and the blades went out of the frame.) */
  const FP_CUT = { up: [V(0.36, -0.06, -0.6), V(-0.6, 0.45, -0.65)], down: [V(-0.14, -0.3, -0.5), V(-0.85, -0.25, -0.45)] };
  const FP_RUSH = { back: [V(0.38, -0.4, -0.4), V(0.35, 0.55, -0.75)], ahead: [V(0.28, -0.34, -0.6), V(-0.12, 0.18, -0.98)], out: [V(0.45, -0.22, -0.5), V(0.75, 0.4, -0.5)] };
  const FP_TWO_RUSH = { ahead: [V(0.12, -0.3, -0.55), V(-0.3, 0.3, -0.9)], out: [V(0.24, -0.22, -0.5), V(0.85, 0.35, -0.4)] };
  /** Bull Rush: the share of its pose that is the brace before it goes, and where the rush ends (skills/bullRush BRACE, RUN, HOLD); the rest is the follow-through */
  const BRACE = 0.16, RUSH = 0.58, STRIDES = 2.5;
  /** where each elbow points while the arm is placed in the view (chest space: out to its side, down) */
  const POLE_VR = V(-0.6, -1, 0), POLE_VL = V(0.6, -1, 0);

  // --- round shield on the left fist: planks behind a painted navy face, a steel rim with rivets and a
  // domed boss. At rest it hangs at the side facing outwards; raised (or charging) it swings round in
  // front of the fist, facing out of the hand. Its face is local +Z.
  const shield = joint(j.handL, 0, -0.1, 0);
  shield.name = 'shield';
  shield.visible = false;
  {
    const w = new Sculpt();
    const paint = kit.std({ color: 0x2c3a58, roughness: 1, ...tex(woodMaps(), 1, 1.5) });
    w.add(scaleUV(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 36), 2, 2), wood, shield, [0, 0, 0], [Math.PI / 2, 0, 0]);
    w.add(scaleUV(new THREE.CylinderGeometry(0.315, 0.315, 0.006, 36), 2, 2), paint, shield, [0, 0, 0.016], [Math.PI / 2, 0, 0]);
    // plank seams
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) { const h = 2 * Math.sqrt(0.315 ** 2 - x * x); w.add(new THREE.BoxGeometry(0.004, h, 0.004), leatherDark, shield, [x + 0.05, 0, 0.019]); }
    w.add(new THREE.TorusGeometry(0.325, 0.02, 8, 40), plateM, shield, [0, 0, 0.01]);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.add(stud(0.01), plateM, shield, [Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.018]); }
    w.add(lathe([[0.1, 0], [0.098, 0.015], [0.08, 0.035], [0.05, 0.055], [0.001, 0.065]], 20), plateM, shield, [0, 0, 0.015], [Math.PI / 2, 0, 0]);
    w.build();
    // four iron straps radiating from the boss
    const bars = new Sculpt();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      bars.add(new THREE.BoxGeometry(0.035, 0.18, 0.008), darkSteel, shield, [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.021], [0, 0, a - Math.PI / 2]);
      bars.add(stud(0.008), plateM, shield, [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.025]);
      bars.add(stud(0.008), plateM, shield, [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.025]);
    }
    bars.build();
  }
  const palm = joint(shield, 0, 0, 0.1);

  // the fur sways: a spring on each collar and cuff lags the joint's acceleration (furSway.ts)
  const legs = new LegIK(j);
  /** smooths every cut between poses: an action starting, restarting or ending */
  const fade = new PoseFade(j);
  // (through the eyes the weapons are placed after the pose's fade, so they fade on their own: the two-hander's, each
  // hand's)
  const eyesTwo = new ViewFade(), eyesR = new ViewFade(), eyesL = new ViewFade();
  const clothes = S.build(), gloves = H.build(), sleeves = B.build(), plates = A.build();
  const harness: THREE.Object3D[] = [...plates, skirtMesh, ...tassets.map((t) => t.g)];
  const furs = [...clothes, ...plates, ...gloves].filter((m) => m.material === furM).map((m) => { m.userData.fur = true; return new FurSway(m, furM); });
  const elbowFur = [j.elbowL, j.elbowR].flatMap((e) => e.children.filter((c) => c.userData.fur));
  /** a hands item worn (the elbows' fur is the bracers') */
  let gloved = true;

  const root = j.root;
  root.scale.setScalar(1.1);

  // right-arm swings and chops yaw last, so the straight arm sweeps around the vertical axis
  // (with no yaw this order poses exactly like the default)
  j.shoulderR.rotation.order = 'YXZ';
  j.shoulderL.rotation.order = 'YXZ';

  // swings alternate forehand / backhand; a new swing starts when the action restarts. With a
  // weapon in each hand they alternate hands instead: the backhand side is the left hand's forehand
  let side = 1, lastK = 1, lastName = '';
  let tailName = '', tailT = 0;
  /** when a swing last ended, and whether this one follows straight on from it (it starts wound, where the last one finished) */
  let swingEnd = -9, chain = false;
  /** when the last attack was: the feet keep the fighting stance a while after it */
  let fightT = -9;
  /** where an action puts the feet this frame (standing): the left foot's spot and turn, then the right's (LegIK.stance); null the fighting stance */
  let feet: readonly number[] | null = null;
  /** through the eyes, how far Power Strike's blow is still held after the cast (1 at the end, fading) */
  let chopTail = 0;

  function setGear(gear: Gear): void {
    for (const w of weapons.values()) w.group.visible = false;
    held = gear.weapon ? weapons.get(gear.weapon) ?? weapons.get('Sword')! : null;
    if (held) held.group.visible = true;
    if (held?.off != null) offGrip.position.y = held.off;
    shield.visible = gear.shield;
    helm.visible = gear.helm; for (const m of head.hair) m.visible = !gear.helm;
    for (const o of harness) o.visible = gear.chest;
    gloved = gear.hands;
    for (const o of gloves) o.visible = gloved;
    for (const o of sleeves) o.visible = !gloved;
    for (const f of elbowFur) f.visible = gloved && !fp;
    bare(handL, !gloved); bare(handR, !gloved);
    for (const w of offWeapons.values()) { w.group.visible = false; gripL.add(w.group); w.group.position.set(0, 0, 0); }
    sheathed = false;
    offHeld = gear.offWeapon ? offWeapons.get(gear.offWeapon) ?? offWeapons.get('Sword')! : null;
    mountAll();
    frog.visible = !!offHeld; rings[0].visible = !!offHeld?.hang?.down; rings[1].visible = !!offHeld && !offHeld.hang?.down;
    if (offHeld) offHeld.group.visible = true;
    // each seated in its fist, the hand on its wrist
    if (held) seat(handR, grip, held.r);
    if (offHeld) { seat(handL, gripL, offHeld.r); tipL.position.y = offHeld.len; }
    tipOn(false);
  }

  /** The weapon arm, `k` of the way, where a blow into the ground ends: the grip before the middle of him (`SM_AHEAD`,
   *  `SM_HIGH`), the weapon from there to the floor straight ahead as far off as its length reaches. */
  function holdAtFloor(k: number): void {
    root.updateMatrixWorld(true);
    const s = root.scale.x, len = tip.position.y * s;
    const way = _hw2.set(0, 0, 1).transformDirection(root.matrixWorld), level = Math.hypot(way.x, way.z) || 1;
    const fx = way.x / level, fz = way.z / level;
    const feet = root.getWorldPosition(_hw1);
    const ax = feet.x + fx * SM_AHEAD * s, az = feet.z + fz * SM_AHEAD * s;
    const ay = groundHeight(ax, az) + SM_HIGH * s;
    const drop = Math.min(len * 0.98, ay - groundHeight(ax + fx * len * 0.8, az + fz * len * 0.8));
    const down = -Math.asin(drop / len);
    _hw1.set(ax, ay, az);
    _hw2.set(fx * Math.cos(down), Math.sin(down), fz * Math.cos(down));
    holdInWorld(ARM_R, _hw1, _hw2, SM_POLE, k);
  }

  /** The weapon turned in the fist, `k` of the way, to point in the upright plane straight ahead, `u` of the way down
   *  from pointing `up` (rad over level ahead) to the floor as far off as its length reaches: a blow driven into the
   *  ground ends with its tip on it, whatever the weapon's length (the arm is fitted within its ranges after). */
  function aimAtFloor(k: number, up: number, u: number): void {
    const from = grip.getWorldPosition(_gs1), len = tip.position.y * root.scale.x;
    // (straight ahead of the body, level)
    const way = _gs2.set(0, 0, 1).transformDirection(root.matrixWorld), level = Math.hypot(way.x, way.z) || 1;
    const fx = way.x / level, fz = way.z / level;
    let drop = from.y - groundHeight(from.x + fx * len * 0.8, from.z + fz * len * 0.8);
    // (a grip held higher than the weapon is long points it down, a little ahead)
    drop = Math.min(drop, len * 0.98);
    const down = lerp(up, -Math.asin(drop / len), u);
    _gs2.set(fx * Math.cos(down), Math.sin(down), fz * Math.cos(down));
    _gs3.set(0, 1, 0).transformDirection(grip.matrixWorld);
    // (turned about the line square to both ways; nearly opposite, where that line is lost and a frame turned the
    // forearm round the other way, about the line across the body, through ahead of him)
    _gs1.crossVectors(_gs3, _gs2);
    if (_gs1.lengthSq() < 1e-4) _gs1.set(-fz, 0, fx);
    _gsq.setFromAxisAngle(_gs1.normalize(), _gs3.angleTo(_gs2) * k).multiply(j.handR.getWorldQuaternion(_pq));
    j.handR.quaternion.copy(j.elbowR.getWorldQuaternion(_hq).invert().multiply(_gsq));
  }

  /** The weapon arm turned up about its shoulder, `k` of the way, until no point of the weapon is under the floor:
   *  the floor stops a blow driven into it, and once it has `landed` it rests there (turned down onto it too, until
   *  a point of it touches). It turns in the upright plane through the shoulder and the tip, so the weapon comes up
   *  as it would on the ground, along the line the blow came down. (Stopped by its tip alone, an axe's or a maul's
   *  head went into the floor to its middle; by its lowest point, turned each its own way, the haft's end behind
   *  the hands was pulled down to the floor as the blow landed, and the lower hand let go.) */
  function groundStop(k: number, landed: boolean): void {
    const at = tip.getWorldPosition(_gs1), sh = j.shoulderR.getWorldPosition(_gs2);
    const dx = at.x - sh.x, dz = at.z - sh.z, out = Math.hypot(dx, dz);
    if (out < 1e-3) return;
    const turn = floorTurn(sh, dx / out, dz / out);
    if (turn === null || (turn <= 0 && !landed)) return;
    // (about the level line across the way to the tip, turned into the shoulder's parent's space: a positive turn
    // lifts what's ahead of the shoulder)
    const parent = j.shoulderR.parent!.getWorldQuaternion(_gsq).invert();
    _gs3.set(-dz / out, 0, dx / out).applyQuaternion(parent);
    j.shoulderR.quaternion.premultiply(_gsq.setFromAxisAngle(_gs3, turn * k));
  }

  /** The least turn about the level line through the shoulder `sh` across the way (`wx`, `wz`) that leaves every
   *  point of the weapon ahead of the shoulder at or over the floor under it (rad, up; less than 0, down until
   *  the first touches), or none if no point of it can reach the floor. */
  function floorTurn(sh: THREE.Vector3, wx: number, wz: number): number | null {
    held!.group.updateWorldMatrix(true, false);
    let turn: number | null = null;
    for (const p of lowPoints(held!)) {
      _gs3.copy(p).applyMatrix4(held!.group.matrixWorld);
      // (in the upright plane across the line the turn is about: out along the way, and up)
      const along = (_gs3.x - sh.x) * wx + (_gs3.z - sh.z) * wz, up = _gs3.y - sh.y, r = Math.hypot(along, up);
      const floor = groundHeight(_gs3.x, _gs3.z) - sh.y;
      // (a point behind the shoulder goes down as the weapon comes up; one nearer it than the floor never meets it:
      // counted as turned at most straight down, a maul's butt below the shoulder held the blow off the floor)
      if (along <= 0 || r < -floor) continue;
      const need = Math.asin(clamp(floor / r, -1, 1)) - Math.atan2(up, along);
      if (turn === null || need > turn) turn = need;
    }
    return turn;
  }

  /** The tip the skills read (trail, cast point): the left weapon's during a left-hand swing. */
  function tipOn(left: boolean): void {
    const at = left && offHeld ? gripL : grip;
    if (tip.parent !== at) at.add(tip);
    tip.position.y = (left && offHeld ? offHeld : held)?.len ?? 0;
  }

  const shY = j.shoulderL.position.y;
  // the healing draught, in the left fist while it is drunk
  const flask = buildFlask(kit, brass, leatherDark); flask.name = 'flask'; j.handL.add(flask); flask.position.set(0, -0.07, 0.03); flask.rotation.x = Math.PI;
  let flaskOut = 0, shieldHang = 0, drinkOn = 0;
  /** how far a two-hander is on the shoulder (`SHOULDER_AT`), and how long the left hand has left to take its lower
   *  grip as it comes off (s: `TAKE_HOLD`) */
  let shouldered = 0, takingHold = 0;
  /** a two-handed move placed by the weapon this frame, in the chest's frame: its grip, its way, its flat's and how far
   *  it takes the arm (`holdInChest`, after the whole body is posed) */
  const twoHold = { at: new THREE.Vector3(), dir: new THREE.Vector3(), flat: new THREE.Vector3(), pole: SW2_POLE, k: 0, flatK: 0 };
  /** how surely the left hand holds a two-hander's lower grip: it lets go of one no turn of the hand keeps the arm within its ranges for */
  let twoGood = 1;
  /** the lower grip as the left hand held it this frame (`Model.lowerGrip`) */
  const grasp: LowerGrip = { held: false, free: false, short: 0, past: 0, into: 0 };
  /** each hand's slant on its handle this frame (rad, armIK.ts) */
  let slantR = 0, slantL = 0;
  // a weapon in the left hand hangs on the belt while the hand is busy with the flask: in a leather frog at the
  // left hip, worn whenever there is a second weapon. A sword sits in it by its guard, the hilt forward and up
  // and the blade raked back along the outside of the thigh, flat to it; an axe or mace by its haft, head up.
  const frog = joint(j.hips, 0.212, -0.012, 0.03); frog.name = 'frog';
  const hangDown = joint(frog), hangUp = joint(frog);
  const basis = (o: THREE.Object3D, y: THREE.Vector3) => {
    const z = V(1, 0, 0).addScaledVector(y, -y.x).normalize(), x = new THREE.Vector3().crossVectors(y, z);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  basis(hangDown, V(0.16, -0.72, -0.68).normalize()); basis(hangUp, V(0.06, 0.97, 0.22).normalize());
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.034), leather); tab.position.set(0.004, 0.012, 0); frog.add(tab);
  const ring = (o: THREE.Object3D, r: number, sx: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 6, 14), leatherDark); m.rotation.x = Math.PI / 2; m.scale.set(sx, 1, 1); m.position.y = -0.01; o.add(m); return m; };
  const rings = [ring(hangDown, 0.034, 1.5), ring(hangUp, 0.03, 1)];
  for (const m of [tab, ...rings]) m.castShadow = false;
  frog.visible = false;
  let sheathed = false;
  const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _s5 = new THREE.Vector3(), _sm = new THREE.Matrix4(), _shq = new THREE.Quaternion();
  /** seat every weapon in its fist the way a real one is held, through the eyes too (left as the poses there were
   *  keyed before, a blade's edge lay in the palm: turned narrow to the eyes at rest, the fist showed its palm and
   *  its fingers splayed past the hilt) */
  function mountAll(): void { for (const w of [...weapons.values(), ...offWeapons.values()]) w.group.rotation.y = w === offHeld && sheathed ? 0 : MOUNT; }
  /** turn a hand by `ang` about the length of the weapon in its grip */
  const edgeOn = (hand: THREE.Object3D, g: THREE.Object3D, ang: number): void => {
    _hd.set(0, 1, 0).applyQuaternion(g.quaternion);
    hand.quaternion.multiply(_hq.setFromAxisAngle(_hd, ang));
  };
  const ARM_R = { shoulder: j.shoulderR, elbow: j.elbowR, hand: j.handR, grip }, ARM_L = { shoulder: j.shoulderL, elbow: j.elbowL, hand: j.handL, grip: gripL };

  /** Through the eyes, a weapon held where it's seen: the arm reaches so its grip sits at `at` in the view
   *  (camera space) and the wrist turns the weapon onto `dir` (the least turn from the forearm, so the fist
   *  keeps its roll). `k` blends it in over the pose so far. */
  function holdInView(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = 0): void {
    const { shoulder, elbow, hand, grip: g } = arm;
    root.updateMatrixWorld(true);
    fromEyes(root, j.neck, at, _gw).lerp(g.getWorldPosition(_cur), 1 - k);
    dirFromEyes(root, dir, _dw).normalize().lerp(_cur.set(0, 1, 0).transformDirection(g.matrixWorld), 1 - k).normalize();
    const flatW = flat && flatK > 0 ? dirFromEyes(root, flat, _hw3).normalize() : null;
    hand.quaternion.slerp(IDENT, k);
    // (the grip sits a little off the wrist: a few rounds of reaching, then turning, settle it)
    for (let i = 0; i < 3; i++) {
      hand.getWorldPosition(_hp).add(_gw).sub(g.getWorldPosition(_cur));
      reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), pole);
      shoulder.updateMatrixWorld(true);
      _cur.set(0, 1, 0).transformDirection(g.matrixWorld);
      _hq.setFromUnitVectors(_cur, _dw).multiply(hand.getWorldQuaternion(_pq));
      if (flatW) rollFlat(_hq, g, flatW, flatK);
      hand.quaternion.copy(elbow.getWorldQuaternion(_pq).invert().multiply(_hq));
      hand.updateMatrixWorld(true);
    }
  }

  /** Through the eyes, an arm holding a weapon where it's seen brought within a body's ranges (armIK.ts), as third
   *  person's are (`fitArm`): the grip and the weapon's way kept, the fist turned about the handle up to `EYES.roll`
   *  and the handle slanted across the palm up to `slant`, and the elbow round to where neither the forearm's turn nor
   *  the wrist goes past its range. `vis`: the hand's turn on its joint (`gripTurn`). (Placed by the reach and the
   *  least turn of the weapon alone, the wrist bent 126 degrees towards the little finger over a one-hander at rest,
   *  96 past its range, the hand cocked like a hook) */
  function fitInView(left: boolean, g: THREE.Object3D, vis: THREE.Quaternion, slant?: number): ArmResult {
    const hd = left ? j.handL : j.handR, el = left ? j.elbowL : j.elbowR, sh = left ? j.shoulderL : j.shoulderR;
    root.updateMatrixWorld(true);
    const wrist = hd.getWorldPosition(_fw[0]), hand = hd.getWorldQuaternion(_fwq).multiply(vis);
    const axis = _fw[1].set(0, 1, 0).transformDirection(g.matrixWorld), at = g.getWorldPosition(_fw[2]);
    const pole = el.getWorldPosition(_fw[3]).sub(sh.getWorldPosition(_fw[4]));
    const shoulder = _fw[5].copy(sh.position);
    return solveArm(j, left, { wrist, hand, vis, pole, slant, shoulder, roll: { axis, range: EYES.roll, at }, wristW: EYES.wrist });
  }

  /** The shoulders' own places on the chest, and whether the eyes have moved them (`armsFromBelow`). */
  const shoulderRest = [j.shoulderR.position.clone(), j.shoulderL.position.clone()];
  let shouldersMoved = false;
  /** Through the eyes, the arms' shoulders low beside and just behind the camera (`EYES.shoulder`), as a game's
   *  first-person arms come up from the screen's bottom corners: an arm bends to what it holds wherever the eyes see
   *  it, and its shoulder is never seen. Out of the eyes, back on the chest. (From the body's own shoulders, a weapon
   *  held to be seen was at arm's length, "physically impossible", and one held as a body holds it was out of the
   *  frame or a slab beside the face) */
  function armsFromBelow(eyes: boolean, two: boolean): void {
    if (!eyes) {
      if (shouldersMoved) { j.shoulderR.position.copy(shoulderRest[0]); j.shoulderL.position.copy(shoulderRest[1]); }
      shouldersMoved = false;
      return;
    }
    root.updateMatrixWorld(true);
    const [x, y, z] = two ? EYES.shoulder : EYES.oneShoulder;
    j.shoulderR.position.copy(j.chest.worldToLocal(fromEyes(root, j.neck, _hw1.set(x, y, z), _hw2)));
    j.shoulderL.position.copy(j.chest.worldToLocal(fromEyes(root, j.neck, _hw1.set(-x, y, z), _hw2)));
    shouldersMoved = true;
  }

  /** The weapon arm placed by a point and a way in the chest's own frame, by `k` from the pose's own: the grip at `at`,
   *  the weapon along `dir` (its flat facing `flat`, if given, `flatK` of the way), the arm reaching by IK with its
   *  elbow towards `pole` (third person's `holdInView`). */
  function holdInChest(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = k): void {
    root.updateMatrixWorld(true);
    const flatW = flat && _hw3.copy(flat).transformDirection(j.chest.matrixWorld);
    holdInWorld(arm, j.chest.localToWorld(_hw1.copy(at)), _hw2.copy(dir).transformDirection(j.chest.matrixWorld), pole, k, flatW, flatK);
  }

  /** `holdInChest` with the grip's place, the weapon's way and its flat's in the world (the elbow's `pole` in the
   *  chest's frame). */
  function holdInWorld(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = k): void {
    const { shoulder, elbow, hand, grip: g } = arm;
    root.updateMatrixWorld(true);
    _gw.copy(at).lerp(g.getWorldPosition(_cur), 1 - k);
    _dw.copy(dir).lerp(_cur.set(0, 1, 0).transformDirection(g.matrixWorld), 1 - k).normalize();
    for (let i = 0; i < 3; i++) {
      hand.getWorldPosition(_hp).add(_gw).sub(g.getWorldPosition(_cur));
      reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), pole);
      shoulder.updateMatrixWorld(true);
      _cur.set(0, 1, 0).transformDirection(g.matrixWorld);
      _hq.setFromUnitVectors(_cur, _dw).multiply(hand.getWorldQuaternion(_pq));
      if (flat) rollFlat(_hq, g, flat, flatK);
      hand.quaternion.copy(elbow.getWorldQuaternion(_pq).invert().multiply(_hq));
      hand.updateMatrixWorld(true);
    }
  }

  /** The hand's world turn `q` rolled about the weapon's way (`_dw`) by `k` of the way until its flat faces `flat`:
   *  that side of it, the palm's (either side, the least roll turned the palm out, past the forearm's turn). The
   *  grip's turn in the hand is its own, so the flat follows `q`. */
  function rollFlat(q: THREE.Quaternion, g: THREE.Object3D, flat: THREE.Vector3, k: number): void {
    // (the flat as `q` would have it: the grip's turn in the hand, then `q`)
    _fn.copy(FLAT_IN_GRIP).applyQuaternion(g.quaternion).applyQuaternion(q);
    _fn.addScaledVector(_dw, -_fn.dot(_dw)).normalize();
    _ft.copy(flat).addScaledVector(_dw, -flat.dot(_dw));
    if (_ft.lengthSq() < 1e-6) return;
    _ft.normalize();
    const angle = Math.atan2(_fc.crossVectors(_fn, _ft).dot(_dw), _fn.dot(_ft));
    q.premultiply(_fr.setFromAxisAngle(_dw, angle * k));
  }

  /** a one-handed move's place in the view between two poses (`u` 0..1), into the right hand's target and
   *  the left's, its mirror image */
  function inView(p: { up: THREE.Vector3[]; down: THREE.Vector3[] }, u: number, right: boolean, left: boolean): void {
    if (right) { _ra.lerpVectors(p.up[0], p.down[0], u); _rd.copy(p.up[1]).normalize().lerp(_vg.copy(p.down[1]).normalize(), u); }
    if (left) { _la.lerpVectors(p.up[0], p.down[0], u); _la.x = -_la.x; _ld.copy(p.up[1]).normalize().lerp(_vg.copy(p.down[1]).normalize(), u); _ld.x = -_ld.x; }
  }

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;
    const two = held?.off != null;
    twoHold.k = 0;

    // base stance: weapon forward at the hip (a two-hander held across the body), shield up in front
    idle(j, t, 1 - move * 0.6);
    // a fighter's stance: side-on with the left side forward (the feet, below), the knees soft, the weight
    // settling from foot to foot and the body swaying over them, the chest and head turned back to the front
    if (!fp) {
      const amt = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.5) + 0.35 * Math.sin(t * 1.13 + 1), br = Math.sin(t * 1.8);
      j.hips.rotation.y += -0.3 * amt; j.spine.rotation.y += 0.1 * amt; j.chest.rotation.y += 0.12 * amt; j.neck.rotation.y += 0.08 * amt;
      j.body.position.x += 0.02 * sway * amt; j.hips.rotation.z += 0.045 * sway * amt; j.spine.rotation.z += -0.03 * sway * amt; j.neck.rotation.z += -0.02 * sway * amt;
      j.body.position.y += -0.035 * amt; j.spine.rotation.x += 0.05 * amt;
      // (the shoulders rise with each breath)
      j.shoulderL.position.y = j.shoulderR.position.y = shY + 0.006 * br * amt;
    }
    // (through the eyes the arms barely swing with the stride: a swinging arm sweeps a weapon across the view)
    const cy0 = j.chest.rotation.y, hy0 = j.hips.rotation.y, eL0 = j.elbowL.rotation.x, eR0 = j.elbowR.rotation.x;
    // the arms pump against the legs, the hands (and so the blades) held steady by the wrists: a weapon arm swings by 0.4 at a run, a shield arm less, a two-hander's hardly (the left hand is on its grip)
    const armR = fp ? 0.03 : two ? 0.12 : ARM_SWING, armL = fp ? 0.03 : two ? lerp(0.12, ARM_SWING, shouldered) : shield.visible ? 0.6 * ARM_SWING : ARM_SWING;
    // (and at a run a weapon arm pumps as a runner's arm does, a little less than a free one, the shield arm hardly)
    const pump = fp || two ? 0 : held ? RUN_PUMP : 1, pumpL = fp ? 0 : two ? shouldered : shield.visible ? RUN_SHIELD_PUMP : offHeld ? RUN_PUMP : 1;
    // (a hand round a grip or a shield's is held steady by its wrist; a free one flops)
    const looseR = held ? 0 : 1, looseL = shield.visible || offHeld ? 0 : 1;
    const swung = walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: armR, armL, bob: 0.08, dir, run: true, pump, pumpL, looseR, looseL });
    const runK = fp ? 0 : runShareOf(move);
    // (the wrists against each forearm's swing, the shoulder's and the elbow's together)
    const wrist = WRIST * (1 - (1 - RUN_WRIST) * runK), levelR = held && !two ? RUN_LEVEL * runK : 0, levelL = offHeld ? RUN_LEVEL * runK : 0;
    if (!fp) {
      j.elbowR.rotation.x += -swung.forearmR * levelR; j.elbowL.rotation.x += -swung.forearmL * levelL;
      j.handR.rotation.x += -swung.forearmR * (1 - levelR) * wrist;
      if (shield.visible || offHeld) j.handL.rotation.x += -swung.forearmL * (1 - levelL) * wrist;
    }
    if (fp) {
      const k = 0.2;
      j.chest.rotation.y = cy0 + (j.chest.rotation.y - cy0) * k; j.hips.rotation.y = hy0 + (j.hips.rotation.y - hy0) * k;
      j.elbowL.rotation.x = eL0 + (j.elbowL.rotation.x - eL0) * k; j.elbowR.rotation.x = eR0 + (j.elbowR.rotation.x - eR0) * k;
    }
    // (the body leans into its stride, models/ik.ts: the hands are held where this pose puts them through it, `holdArms`, so the weapon and shield keep their angle)
    if (two) { j.shoulderR.rotation.x += -0.5; j.shoulderR.rotation.z += 0.2; j.elbowR.rotation.x += -1.0; }
    // (at a run the arm's own pump bends it: held forward and bent too, it stood out before the body unmoving)
    else { j.shoulderR.rotation.x += -0.3 * (1 - runK); j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // shield carried low at the side, the arm held a little out so it clears the leg, and bent further at a run; a
    // second weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35 - RUN_SHIELD_BEND * runK; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3 * (1 - runK); j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // through the eyes the weapons are held higher and further out, or the hands sit below the frame
    if (fp) {
      // (a two-hander, held upright in both hands, would split the view: it rests low on the right, blade out)
      const S = two ? FP_STANCE_TWO : FP_STANCE;
      j.shoulderR.rotation.x += S[0]; j.elbowR.rotation.x += S[1]; j.handR.rotation.x += S[2]; j.handR.rotation.z += S[3]; j.shoulderR.rotation.z += S[4];
      if (offHeld) { j.shoulderL.rotation.x += S[0]; j.elbowL.rotation.x += S[1]; j.handL.rotation.x += S[2]; j.handL.rotation.z -= S[3]; j.shoulderL.rotation.z -= S[4]; }
    }
    let guard = 0;   // 0: shield at the side, 1: in front
    // standing, at the ready: the blade raised before the body, the shield half up, a second blade the mirror of the first, a two-hander across the body
    if (!fp) {
      const ia = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.7) * 0.03;
      if (two) { j.shoulderR.rotation.x += (REST_TWO[0] + sway) * ia; j.elbowR.rotation.x += REST_TWO[1] * ia; j.handR.rotation.x += REST_TWO[2] * ia; j.shoulderR.rotation.y += REST_TWO[3] * ia; }
      else { j.shoulderR.rotation.x += (REST_ARM[0] + sway) * ia; j.shoulderR.rotation.z += 0.08 * ia; j.elbowR.rotation.x += REST_ARM[1] * ia; j.handR.rotation.x += REST_ARM[2] * ia; }
      if (shield.visible) { j.shoulderL.rotation.x += (-0.3 - sway) * ia; j.shoulderL.rotation.z += -0.12 * ia; j.elbowL.rotation.x += -0.95 * ia; guard = 0.45 * ia; }
      else if (offHeld) { j.shoulderL.rotation.x += (REST_ARM[0] - sway) * ia; j.shoulderL.rotation.z += -0.08 * ia; j.elbowL.rotation.x += REST_ARM[1] * ia; j.handL.rotation.x += REST_ARM[2] * ia; }
    }
    // (not through the eyes: the camera stays level, so a lean only tips the weapons into the middle of the view)
    j.spine.rotation.x += move * (fp ? 0 : IK ? 0.05 : 0.14) * dir; if (!fp && IK) j.neck.rotation.x -= move * 0.05 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const raw = st.action;
    // (the tail: the last move's end pose held a moment after it, unless the body moves off or another action starts)
    if (!raw && lastName !== '' && (TAIL[lastName] ?? 0) > 0 && !fp) { tailName = lastName; tailT = TAIL[lastName]; }
    if (raw || move > 0.3) { if (tailT > 0 && !raw) fade.cut(0.25); tailT = 0; }
    let inTail = !raw && tailT > 0;
    // (over on the frame its cut fades from it: held a frame longer, a blow turned to the floor and stopped by it
    // after the fade was turned and stopped again over the arms it had drawn, which the cut fades from, and the
    // arm's solve swung the elbow round 30 degrees in two frames, the greatsword's tip 52 cm)
    if (inTail) { tailT -= dt; if (tailT <= 0) { fade.cut(TAIL_OUT[tailName] ?? 0.4); inTail = false; } }
    const a: ActionState | null = raw ?? (inTail ? { name: tailName, t: 1 } : null);
    // a two-hander through the eyes: how far a move posed in the hero's own space takes over from holding it
    // in the view, and how far a move placed in the view takes it from rest there (to _va, _vd)
    let aw = 0, vw = 0;
    // and how far a move placed in the view turns each blade's flat to the eyes (the two-hander's, each hand's)
    let viewFlat = 0, flatR = 0, flatL = 0;
    // a one-handed move placed in the view (through the eyes): how far it takes each arm over (to _ra, _rd / _la, _ld)
    let wR = 0, wL = 0;
    // how far the pose owns the legs (a lunge, a charge: the body leaves its feet behind at a dash's speed, so the leg IK would kneel): the pose's own legs show until the dash is over, and the feet start again under the hips
    let legOwn = 0;
    // how far a blow driven into the ground is stopped by it (groundStop), and its blade turned to the floor ahead
    // (aimAtFloor)
    let stop = 0, aimDown = 0, fall = 0, bladeUp = 0;
    // and how far it owns one leg (a step in, a lunge) while the other stands: standing only, moving the IK steps
    let ownL = 0, ownR = 0;
    const still = 1 - Math.min(1, move * 4);
    feet = null;
    let flaskWant = 0, drinkLift = 0;
    // (the off-hand weapon on the hip while drinking: hung there as the hand reaches the belt, drawn again as it comes back)
    const sheathe = !!offHeld && a?.name === 'drink' && !fp && a.t > DRINK_SHEATHED[0] && a.t < DRINK_SHEATHED[1];
    if (offHeld && sheathe !== sheathed) {
      sheathed = sheathe;
      const h = offHeld.hang ?? { at: 0.1, down: true };
      (sheathe ? (h.down ? hangDown : hangUp) : gripL).add(offHeld.group);
      offHeld.group.position.set(0, sheathe ? -h.at : 0, 0); offHeld.group.rotation.y = sheathe ? 0 : MOUNT;
    }
    if (chopTail > 0) chopTail = Math.max(0, chopTail - dt / 0.3);
    const began = !!raw && (raw.name !== lastName || raw.t < lastK - 0.2), ended = !raw && lastName !== '';
    if ((ended || began) && lastName === 'swing') swingEnd = t;
    if (began && raw.name === 'swing') { side = -side; chain = t - swingEnd < 0.25; }
    // (a swing straight after a swing starts where that one ended: a short fade; out of an action back to the stance, a slow one)
    if (began) fade.cut(chain && raw.name === 'swing' ? 0.08 : 0.14); else if (ended && !inTail) fade.cut(0.3);
    // (through the eyes a move goes on from where the last ended, its hands seen the whole way)
    if (began) { eyesTwo.cut(0.14); eyesR.cut(0.14); eyesL.cut(0.14); }
    else if (ended && !inTail) { eyesTwo.cut(0.3); eyesR.cut(0.3); eyesL.cut(0.3); }
    if (a && a.name !== 'buff' && a.name !== 'cast' && a.name !== 'stagger' && a.name !== 'drink') fightT = t;
    // (a two-hander onto the shoulder out of a fight; off it at once for a move, which the move's fade brings down)
    const shoulderIt = two && !fp && (!a || a.name === 'drink') && t - fightT > SHOULDER_AFTER;
    if (!shoulderIt && shouldered > 0.5) takingHold = TAKE_HOLD;
    else takingHold = Math.max(0, takingHold - dt);
    shouldered = shoulderIt ? damp(shouldered, 1, SHOULDER_RATE, dt) : 0;
    lastName = raw?.name ?? ''; lastK = raw?.t ?? 1;
    armsFromBelow(fp && st.dead < 0, two);
    if (fp && two) { fromScreen(EYES.restOn, FP_TWO_AT); FP_TWO_DIR.fromArray(EYES.restDir).normalize(); FP_TWO_POLE.fromArray(EYES.pole); }
    // Twin Fangs strikes right, then left (in step with skills/twinFangs STRIKES)
    const left = !!offHeld && ((a?.name === 'swing' && side < 0) || (a?.name === 'flurry' && a.t > 0.5));
    tipOn(left);
    // the swinging arm: the left one mirrors the right (the same pitch, the yaw and roll turned over)
    const R = left ? j.shoulderL.rotation : j.shoulderR.rotation;
    if (a) {
      const k = a.t;
      if (a.name === 'swing' && !fp) {
        // the arm and weapon sweep the damage arc, led by the body: see the keys (SW_*)
        const s = side, w = chain ? 1 : ramp(k, 0, 0.25), U = curve(SW_TIP, k), theta = s * 1.2 * U;
        // (a two-hander turns more with the body, keeping the grip before the chest in the left hand's reach)
        const share = two ? 1.3 : 1, hy = s * 0.3 * share * curve(SW_TIP, k + 0.07), sy = s * 0.14 * share * curve(SW_TIP, k + 0.04), cy = s * 0.26 * share * curve(SW_TIP, k + 0.02);
        j.hips.rotation.y += hy * w; j.spine.rotation.y += sy * w; j.chest.rotation.y += cy * w;
        const body = hy + sy + cy;
        if (two) {
          // (placed by the weapon, once the body is posed: see SW2_*)
          const up = Math.min(1, (U / 1.3) ** 2), round = s * U * SW2_ROUND, lead = round * SW2_LEAD, rise = lerp(SW2_LEVEL, SW2_RISE, up);
          const out = lerp(SW2_OUT, SW2_IN, up);
          twoHold.at.set(Math.sin(round) * out, lerp(SW2_LOW, SW2_HIGH, up), Math.cos(round) * out);
          twoHold.dir.set(Math.sin(lead) * Math.cos(rise), Math.sin(rise), Math.cos(lead) * Math.cos(rise));
          twoHold.flat.set(0, s, 0); twoHold.pole = SW2_POLE; twoHold.k = w; twoHold.flatK = w * (1 - ramp(Math.abs(U), SW2_EDGE[0], SW2_EDGE[1]));
        } else {
          R.x = lerp(R.x, curve(SW_PITCH, k), w); R.z = lerp(R.z, 0, w); R.y = (theta - body) * w;
          const elbow = left ? j.elbowL : j.elbowR, hand = left ? j.handL : j.handR;
          elbow.rotation.x = lerp(elbow.rotation.x, curve(SW_ELBOW, k), w);
          hand.rotation.x += ALONG_ARM * curve(SW_WRIST, k) * w;
          // (the forearm rolls the edge into the cut: palm up on a forehand, down on a backhand)
          edgeOn(hand, left ? gripL : grip, s * SW_ROLL * ((left ? s < 0 : s > 0) ? 1 : SW_BACK) * w);
        }
        // the weight: back onto the rear foot, then forward and down into the blow (less while moving: the legs are stepping)
        const ws = w * (0.4 + 0.6 * still), bend = curve(SW_BEND, k);
        j.body.position.z += curve(SW_FWD, k) * ws; j.body.position.y += curve(SW_DIP, k) * ws;
        j.spine.rotation.x += bend * w; j.chest.rotation.z += -s * curve(SW_TILT, k) * w;
        // the head stays on the foe through it all
        j.neck.rotation.y -= 0.7 * body * w; j.neck.rotation.x -= 0.5 * bend * w;
        // the other arm pulls back against the blow, and swings out of its way as a forehand carries across to it
        if (!two) {
          const O = left ? j.shoulderR.rotation : j.shoulderL.rotation, oe = left ? j.elbowR : j.elbowL, out = left ? -1 : 1, fore = left ? s < 0 : s > 0;
          // (a shield stays before the body as the blow winds up across it, dropping out of its way)
          if (shield.visible && !left) O.x += (U > 0 ? 0.25 * U : 0.15 * -U) * w; else { O.x += 0.25 * U * w; oe.rotation.x += -0.3 * Math.max(0, -U) * w; }
          O.z += out * (fore ? 0.4 * Math.max(0, U) : 0.15 * Math.max(0, -U)) * w;
        }
      } else if (a.name === 'swing') {
        // through the eyes: the weapon is placed in the view, keyed as the eyes see a cut, its flat to them through
        // the blow (models/warriorEyes.ts); the trunk turns into it a little, wound back to the starting side, then
        // across as the blade crosses the view
        const w = ramp(k, 0, 0.3) * (1 - ramp(k, 0.9, 1));
        const theta = side * 1.2 * EYES_TURN * (2 * ramp(k, 0.48, 0.68) - 1);
        j.spine.rotation.y += 0.3 * theta * w;
        j.chest.rotation.y += 0.7 * theta * w;
        // (a one-handed blade taken from the arm as drawn, a swing straight after a swing too: the frames between them
        // place no hand to fade from, and it jumped to the next swing's start; a two-hander's moves start from its rest
        // in the view)
        const fw = ramp(k, 0, 0.12);
        const flat = ramp(k, CUT_FLAT[0], CUT_FLAT[1]) * (1 - ramp(k, CUT_FLAT[2], CUT_FLAT[3]));
        if (two) { viewAt(side > 0 ? TWO_FORE : TWO_BACK, k, _va, _vd); vw = 1; viewFlat = flat; }
        else if (left) { viewAt(ONE_FORE, k, _la, _ld, true); wL = fw; flatL = flat; }
        else { viewAt(side > 0 ? ONE_FORE : ONE_BACK, k, _ra, _rd); wR = fw; flatR = flat; }
        // the leg opposite the swinging arm steps in
        (left ? j.thighR : j.thighL).rotation.x += -0.3 * w; (left ? j.kneeL : j.kneeR).rotation.x += 0.3 * w;
        if (left) ownR = w * still; else ownL = w * still;
      } else if (a.name === 'flurry') {
        // Twin Fangs: a low lunge, each blade cutting down across the body from high on its own side,
        // right then left (the left arm mirrors the right: the same pitch, yaw turned over)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.9, 1));
        aw = w; legOwn = ramp(k, 0, 0.1);
        j.spine.rotation.x += 0.3 * w; j.neck.rotation.x += -0.2 * w;
        j.thighL.rotation.x += -0.55 * w; j.kneeL.rotation.x += 0.5 * w;
        j.thighR.rotation.x += 0.35 * w; j.kneeR.rotation.x += 0.5 * w;
        j.body.position.y += -0.12 * w;
        const cut = (arm: THREE.Euler, elbow: THREE.Object3D, hand: THREE.Object3D, s: number, from: number, to: number): void => {
          const up = ramp(k, from - 0.15, from), down = ramp(k, from, to), aw = up * (1 - ramp(k, to + 0.05, to + 0.25));
          arm.x = lerp(arm.x, lerp(-2.4, -0.7, down), aw);
          arm.y = s * lerp(0.5, -0.7, down) * aw;
          arm.z = lerp(arm.z, 0, aw);
          elbow.rotation.x = lerp(elbow.rotation.x, -0.25, aw);
          hand.rotation.x += ALONG_ARM * aw;
          // (the forearm rolls the edge down into the cut, the palm turning down)
          if (!fp) edgeOn(hand, s > 0 ? grip : gripL, s * FANG_ROLL * aw);
          j.chest.rotation.y += s * lerp(0.35, -0.35, down) * aw;
        };
        cut(j.shoulderR.rotation, j.elbowR, j.handR, 1, 0.3, 0.52);
        cut(j.shoulderL.rotation, j.elbowL, j.handL, -1, 0.7, 0.92);
        if (!fp) {
          // the body leads each cut: the hips turn into it a beat ahead, the trunk crunches over it and the body
          // drops into it; the lunge over, the feet are the leg IK's again, planted wide with the left forward
          for (const [s, from, to] of [[1, 0.3, 0.52], [-1, 0.7, 0.92]] as const) {
            const lead = ramp(k, from - 0.18, from - 0.02) * (1 - ramp(k, to + 0.1, to + 0.3)), d = ramp(k, from - 0.05, to - 0.06), hit = Math.sin(Math.PI * ramp(k, from, to + 0.06));
            j.hips.rotation.y += s * lerp(0.28, -0.32, d) * lead;
            j.spine.rotation.x += 0.16 * hit; j.neck.rotation.x += -0.1 * hit; j.body.position.y += -0.05 * hit;
            // (the other arm draws back as this one cuts)
            (s > 0 ? j.shoulderL : j.shoulderR).rotation.x += 0.35 * hit * (offHeld ? 0.4 : 1);
          }
          legOwn = ramp(k, 0, 0.1) * (1 - ramp(k, FANG_LUNGE, FANG_LUNGE + 0.06));
          if (k > FANG_LUNGE) feet = FANG_FEET;
        }
        // (through the eyes each blade is placed in the view, cutting down across it from high on its side)
        if (fp && !two) {
          const cw = (from: number, to: number) => ramp(k, from - 0.15, from) * (1 - ramp(k, to + 0.05, to + 0.25));
          inView(FP_CUT, ramp(k, 0.3, 0.52), true, false); wR = cw(0.3, 0.52);
          if (offHeld) { inView(FP_CUT, ramp(k, 0.7, 0.92), false, true); wL = cw(0.7, 0.92); }
        }
      } else if (a.name === 'chop' && !fp) {
        // Power Strike (PS_*): the arms raise the weapon overhead and tremble while the charge builds, then bring it down
        const w = ramp(k, 0, 0.1), blow = ramp(k, 0.9, 0.97), lift = ramp(k, 0, 0.3);
        const shake = (1 - blow) * lift * Math.sin(t * 45) * 0.02 * (0.5 + ramp(k, 0.3, 0.88));
        const pitch = curve(PS_PITCH, k) + shake, bend = curve(two ? [[0, -0.55], [1, -0.55]] : PS_ELBOW, k);
        R.x = lerp(R.x, pitch, w); R.z = lerp(R.z, 0, w); R.y = (two ? 0.7 : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, bend, w);
        // (the wrists cock back as the blow lands, so a one-hander finishes pointing ahead, not into the ground)
        const wr = ALONG_ARM * (two ? 1 : curve(PS_WRIST, k)) * w;
        j.handR.rotation.x += wr;
        if (offHeld) {
          const L = j.shoulderL.rotation;
          L.x = lerp(L.x, pitch, w); L.z = lerp(L.z, 0, w); L.y = -0.25 * w;
          j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, bend, w);
          j.handL.rotation.x += wr;
        } else if (shield.visible) {
          // the shield arm swings back and out as the body arches, and is thrown down and back with the blow
          j.shoulderL.rotation.x += (0.35 * lift - 0.1 * blow) * w; j.shoulderL.rotation.z += 0.3 * lift * w;
        }
        const sb = curve(PS_BEND, k), ws = w * (0.4 + 0.6 * still);
        j.spine.rotation.x += sb * w; j.neck.rotation.x -= 0.55 * sb * w;
        j.hips.rotation.y += curve(PS_HIPS, k) * w; j.chest.rotation.y -= 0.6 * curve(PS_HIPS, k) * w;
        j.body.position.z += curve(PS_FWD, k) * ws; j.body.position.y += curve(PS_DIP, k) * ws;
        // (a step in with the left foot as the weapon rises; the right stays back, turned out)
        feet = CHOP_FEET;
      } else if (a.name === 'smite' && !fp) {
        // Thunder Crescent (SM_*): the great weapon raised overhead and driven down into the ground before him (a
        // two-hander raised over the middle of the head, within the left hand's reach, as Power Strike's is)
        const w = ramp(k, 0, 0.1);
        R.x = lerp(R.x, curve(SM_PITCH, k), w); R.z = lerp(R.z, 0, w); R.y = (two ? curve(SM_YAW, k) : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, curve(SM_ELBOW, k), w);
        j.handR.rotation.x += ALONG_ARM * w;
        const sb = curve(SM_BEND, k), ws = w * (0.4 + 0.6 * still);
        j.spine.rotation.x += sb * w; j.neck.rotation.x -= 0.55 * sb * w;
        j.hips.rotation.y += curve(SM_HIPS, k) * w; j.chest.rotation.y -= 0.6 * curve(SM_HIPS, k) * w;
        j.body.position.z += curve(SM_FWD, k) * ws; j.body.position.y += curve(SM_DIP, k) * ws;
        feet = CHOP_FEET;
        stop = w; aimDown = w * ramp(k, SM_TAKE[0], SM_TAKE[1]); fall = ramp(k, SM_FALL[0], SM_FALL[1]);
        bladeUp = curve(SM_BLADE, k);
        // (and from just before it lands, the hands out before him where a blow into the ground ends)
        const end = w * ramp(k, SM_LAND[0], SM_LAND[1]);
        if (end > 0 && held) holdAtFloor(end);
      } else if (a.name === 'chop' || a.name === 'smite') {
        // the overhead blows through the eyes (OVERHEAD; third person's are above), keyed in the view
        // (models/warriorEyes.ts): the weapon raised high, the fists seen at the top of the view, trembling while Power
        // Strike's charge builds, then over the top and down through it to the skill's fireAt, its flat to the eyes;
        // after the blow the blades stay down a moment (chopTail). (The trunk stays upright: bent into the blow, it
        // took the shoulders from under the hands the keys place)
        const o = OVERHEAD[a.name];
        const w = ramp(k, 0, 0.12);
        const lift = ramp(k, 0, o.lift), blow = ramp(k, o.from, o.to);
        const shake = (1 - blow) * lift * Math.sin(t * 45) * o.shake;
        const flat = ramp(k, o.from - 0.05, o.from);
        if (blow > 0) chopTail = 1;
        if (two) {
          viewAt(a.name === 'chop' ? POWER_TWO : SMITE_TWO, k, _va, _vd);
          _va.x += shake * 0.5; _va.y += shake * 0.5;
          vw = 1; viewFlat = flat;
        } else {
          // (two weapons: both rise and come down together, the left the mirror image of the right)
          viewAt(POWER_ONE, k, _ra, _rd);
          _ra.x += shake * 0.5; _ra.y += shake;
          wR = w; flatR = flat;
          if (offHeld) {
            viewAt(POWER_ONE, k, _la, _ld, true);
            _la.x -= shake * 0.5; _la.y += shake;
            wL = w; flatL = flat;
          }
        }
        j.body.position.y += -0.16 * blow * w;
        j.kneeL.rotation.x += 0.55 * blow * w; j.kneeR.rotation.x += 0.4 * blow * w;
        j.thighL.rotation.x += -0.45 * blow * w;
        ownL = blow * w * still;
      } else if (a.name === 'spin') {
        // Steel Tempest: spin with the weapon held out, pivoting on both feet in a wide, low stance (the legs
        // turn with the body: feet can't step at this speed), the trunk leaning out over the blade and the
        // chest and arm trailing the hips so the weapon is dragged round
        aw = 1; legOwn = 1;
        j.body.rotation.y += a.turn ?? 0;
        if (two && !fp) {
          // (placed by the weapon, once the body is posed: see SPIN2_*; through the eyes, the arms' own keys)
          twoHold.at.copy(SPIN2_AT); twoHold.dir.copy(SPIN2_DIR); twoHold.flat.copy(SPIN2_FLAT);
          twoHold.pole = SW2_POLE; twoHold.k = 1; twoHold.flatK = 1;
        } else {
          R.x += -0.1; R.z += -1.35; R.y += -0.3; j.elbowR.rotation.x += 0.7;
          j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9; j.elbowL.rotation.x += 0.5;
        }
        j.spine.rotation.x += 0.15; j.spine.rotation.z += -0.12; j.chest.rotation.y += -0.25; j.neck.rotation.y += 0.25; j.neck.rotation.z += 0.08;
        j.thighL.rotation.set(-0.35, 0, 0.22); j.thighR.rotation.set(-0.35, 0, -0.22);
        j.kneeL.rotation.x = 0.6; j.kneeR.rotation.x = 0.6; j.ankleL.rotation.set(-0.25, 0, -0.2); j.ankleR.rotation.set(-0.25, 0, 0.2);
        j.body.position.y += -0.1 + 0.015 * Math.sin(t * 30);
      } else if (a.name === 'block') {
        // Raise Shield: side-on behind the shield, left foot forward and low, the shield drawn in tight
        // before the chest and chin, the weapon cocked over it; a blocked blow jolts it all back
        const w = k, stance = w * (1 - move * 0.7), jolt = st.blockHit ?? 0;
        // (standing, the guard's own stance shows: left foot forward, right back; moving, the leg IK steps)
        guard = lerp(guard, 1, w); aw = w; legOwn = fp ? w * (1 - Math.min(1, move * 4)) : 0;
        if (w > 0.3) feet = GUARD_FEET;
        j.chest.rotation.y += -0.35 * w; j.spine.rotation.y += -0.15 * w;
        j.spine.rotation.x += (0.18 - 0.2 * jolt) * w; j.neck.rotation.x += (-0.2 + 0.1 * jolt) * w;
        // the forearm points forward so the shield (facing out of the fist) faces the foe; the yaw
        // undoes the chest's turn
        const L = j.shoulderL.rotation;
        // (seen through the eyes, raised higher: at its usual height it stays below the view)
        const bg = fp ? FP_BLOCK : NO_BLOCK;
        L.x = lerp(L.x, -0.35 + bg[0] + 0.25 * jolt, w); L.z = lerp(L.z, -0.3, w); L.y = 0.5 * w;
        j.elbowL.rotation.set(lerp(j.elbowL.rotation.x, -1.35 + bg[1] + 0.35 * jolt, w), 0, 0);
        R.x = lerp(R.x, -1.7, w); R.z = lerp(R.z, -0.35, w); R.y = 0.2 * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -1.2, w);
        j.handR.rotation.x += 0.5 * w;
        j.thighL.rotation.x += -0.4 * stance; j.kneeL.rotation.x += 0.5 * stance;
        j.thighR.rotation.x += 0.35 * stance; j.kneeR.rotation.x += 0.45 * stance;
        j.body.position.y += (-0.1 * stance - 0.03 * jolt);
        // (the hips turn side-on behind the shield, the weight back over the rear foot until a blow lands on it)
        if (!fp) { j.hips.rotation.y += -0.2 * w; j.body.position.z += -0.03 * stance; }
        j.body.position.z += -0.06 * jolt * w;
      } else if (a.name === 'charge') {
        // shoulder into the charge, weapon back; as it lands (RUSH) the weapons sweep out to both sides
        // (third person: a brace, low and coiled with the weight on the rear foot, then the rush: the whole
        // body leaning into it from the feet, the shield shoulder leading, huge bounding strides, then a skid
        // into the stop, braced wide and leaning back against it)
        const brace = ramp(k, 0, BRACE * 0.7) * (1 - ramp(k, BRACE, BRACE + 0.04)), run = ramp(k, BRACE - 0.02, BRACE + 0.03) * (1 - ramp(k, RUSH - 0.02, RUSH + 0.03));
        const skid = ramp(k, RUSH - 0.03, RUSH) * (1 - ramp(k, 0.8, 1));
        const w = fp ? Math.min(1, k * 6 / RUSH) * (1 - ramp(k, RUSH - 0.05, RUSH + 0.05)) : Math.max(brace, run);
        const hw = ramp(k, RUSH - 0.04, RUSH + 0.04) * (1 - ramp(k, 0.85, 1)), hu = ramp(k, RUSH, RUSH + 0.2);
        guard = shield.visible ? lerp(guard, 1, Math.max(w, hw)) : 0; aw = Math.max(w, hw); legOwn = fp ? Math.min(1, k * 10) * (1 - ramp(k, RUSH, RUSH + 0.03)) : run;
        if (!fp) {
          const cp = clamp((k - BRACE) / (RUSH - BRACE), 0, 1) * STRIDES * Math.PI, sc = Math.sin(cp), cc = Math.cos(cp);
          // the brace
          j.body.position.y += -0.14 * brace; j.body.position.z += -0.07 * brace; j.hips.rotation.y += -0.25 * brace;
          if (brace > 0.3) feet = BRACE_FEET;
          // the rush: leaning from the feet, low, bobbing over each stride
          j.body.rotation.x += 0.32 * run; j.body.position.y += (-0.08 + 0.06 * Math.abs(cc)) * run;
          j.chest.rotation.y += -0.2 * run; j.chest.rotation.z += -0.1 * run; j.neck.rotation.y += 0.45 * Math.max(brace, run); j.neck.rotation.x += -0.3 * run;
          const lerpX = (o: THREE.Object3D, v: number) => { o.rotation.x = lerp(o.rotation.x, v, run); };
          lerpX(j.thighL, -0.35 - 0.85 * sc); lerpX(j.thighR, -0.35 + 0.85 * sc);
          lerpX(j.kneeL, 0.35 + 1.2 * Math.max(0, cc)); lerpX(j.kneeR, 0.35 + 1.2 * Math.max(0, -cc));
          lerpX(j.ankleL, 0.25 * sc); lerpX(j.ankleR, -0.25 * sc);
          j.thighL.rotation.z = lerp(j.thighL.rotation.z, 0.06, run); j.thighR.rotation.z = lerp(j.thighR.rotation.z, -0.06, run);
          // (an arm with no shield pumps with the strides; a shield is driven up before the leading shoulder)
          if (!shield.visible && !offHeld) { j.shoulderL.rotation.x += 0.5 * sc * run; }
          if (shield.visible) { j.shoulderL.rotation.x += -0.95 * run; j.elbowL.rotation.x += 0.3 * run; }
          // the skid: braced wide, leaning back against the stop
          j.spine.rotation.x += -0.2 * skid; j.body.position.y += -0.12 * skid; j.body.position.z += -0.05 * skid;
          if (skid > 0.2) feet = SKID_FEET;
        }
        j.spine.rotation.x += 0.45 * w; j.neck.rotation.x += -0.3 * w;
        j.chest.rotation.y += -0.3 * w;
        const L = j.shoulderL.rotation;
        // (the shield stays up in front through the landing; through the eyes a little lower as the body
        // straightens, or it rises over half the view)
        if (shield.visible) { const sw = Math.max(w, hw), low = fp ? 0.45 * hw * (1 - w) : 0; L.x = lerp(L.x, -0.5 + low, sw); L.z = lerp(L.z, -0.2, sw); L.y = 0.4 * sw; j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -1.2, sw); }
        // (a second weapon trails the same as the first)
        else if (offHeld) { L.x += 0.6 * w; j.elbowL.rotation.x += 0.4 * w; }
        else { L.x += -0.7 * w; j.elbowL.rotation.x += 0.3 * w; }
        R.x += 0.6 * w; j.elbowR.rotation.x += 0.4 * w;
        // the sweep out: the arm raised level ahead and turned out to its side, the weapon along it
        const out = (arm: THREE.Euler, elbow: THREE.Object3D, hand: THREE.Object3D, s: number): void => {
          arm.x = lerp(arm.x, -1.35, hw); arm.z = lerp(arm.z, 0, hw); arm.y = lerp(arm.y, s * lerp(0.2, -1.3, hu), hw);
          elbow.rotation.x = lerp(elbow.rotation.x, -0.15, hw);
          hand.rotation.x += ALONG_ARM * hw;
        };
        // (third person: each blade raised high on its own side through the last stride, then cut down across
        // the front as it lands, the two crossing; through the eyes a two-hander still sweeps out)
        const cu = ramp(k, RUSH - 0.12, RUSH - 0.02), cd = ramp(k, RUSH - 0.01, RUSH + 0.1), cw = cu * (1 - ramp(k, 0.82, 1));
        const cross = (arm: THREE.Euler, elbow: THREE.Object3D, hand: THREE.Object3D, s: number): void => {
          arm.x = lerp(arm.x, lerp(-2.4, -0.7, cd), cw); arm.y = lerp(arm.y, s * lerp(0.5, -0.7, cd), cw); arm.z = lerp(arm.z, 0, cw);
          elbow.rotation.x = lerp(elbow.rotation.x, -0.25, cw);
          hand.rotation.x += ALONG_ARM * cw;
        };
        if (fp && two) { if (held) out(R, j.elbowR, j.handR, 1); }
        else {
          if (held) cross(R, j.elbowR, j.handR, 1);
          if (offHeld) cross(j.shoulderL.rotation, j.elbowL, j.handL, -1);
          if (!fp) { j.spine.rotation.x += 0.25 * cd * cw; j.neck.rotation.x += -0.15 * cd * cw; }
        }
        // (through the eyes placed in the view: drawn back, driven ahead through the rush, flung out)
        if (fp && !two) {
          const u = ramp(k, 0.06, 0.2), P = FP_RUSH;
          _va.lerpVectors(P.back[0], P.ahead[0], u);
          _vd.copy(P.back[1]).normalize().lerp(_vg.copy(P.ahead[1]).normalize(), u);
          // (a jolt as the rush lands)
          _va.z += 0.06 * Math.sin(Math.PI * ramp(k, RUSH - 0.06, RUSH + 0.06));
          // (then the blades cut down across the view, crossing, as in Twin Fangs)
          inView(FP_CUT, cd, true, !!offHeld);
          _ra.lerpVectors(_va, _ra, cu); _rd.lerpVectors(_vd, _rd, cu);
          if (offHeld) { _vg.copy(_va); _vg.x = -_vg.x; _la.lerpVectors(_vg, _la, cu); _vg.copy(_vd); _vg.x = -_vg.x; _ld.lerpVectors(_vg, _ld, cu); }
          const vw2 = Math.min(1, k * 8) * (1 - ramp(k, 0.85, 1));
          wR = held ? vw2 : 0;
          if (offHeld) wL = vw2;
        }
        // (a two-hander the same way: levelled ahead across the view through the rush, swept out to the right)
        if (fp && two) {
          const u = ramp(k, 0.06, 0.2), P = FP_TWO_RUSH;
          _va.lerpVectors(FP_TWO_AT, P.ahead[0], u).lerp(P.out[0], hu);
          _vd.copy(FP_TWO_DIR).lerp(_vg.copy(P.ahead[1]).normalize(), u).lerp(_vg.copy(P.out[1]).normalize(), hu);
          vw = 1; aw = 0;
        }
      } else if (a.name === 'drink' && !fp) {
        // the healing draught: the free hand takes the flask from the belt and drinks it (models/flask.ts); the shield
        // stays on its arm, a two-hander's left hand lets go of the grip (out of its reach)
        flaskWant = drink(j, k, mouth, DRINK); aw = 1; guard = 0; drinkLift = drinkUp(k);
      } else if (a.name === 'buff') {
        // war cry: gathered in, hunched over the fists, then thrown open, chest out, arms flung wide and up,
        // head back in the roar (held as the cast ends: the fade out of it is slow)
        const g = ramp(k, 0, 0.3) * (1 - ramp(k, 0.4, 0.6)), r = ramp(k, 0.38, 0.62);
        aw = Math.max(g, r);
        j.shoulderL.rotation.x += -0.5 * g + 0.15 * r; R.x += -0.5 * g + 0.15 * r;
        j.shoulderL.rotation.z += -0.1 * g + 1.15 * r; R.z += 0.1 * g - 1.15 * r;
        j.elbowL.rotation.x += -1.1 * g - 0.25 * r; j.elbowR.rotation.x += -0.9 * g;
        j.spine.rotation.x += 0.25 * g - 0.1 * r; j.chest.rotation.x += -0.08 * r; j.neck.rotation.x += 0.15 * g - 0.3 * r;
        j.body.position.y += -0.07 * g + 0.02 * r; j.body.position.z += -0.03 * r;
        feet = WIDE_FEET;
      } else if (a.name === 'stagger') {
        // guard broken: thrown back with the arms flung open, then hunched and reeling until it passes
        const hit = 1 - ramp(k, 0, 0.3), reel = ramp(k, 0.1, 0.3) * (1 - ramp(k, 0.8, 1));
        const sway = Math.sin(t * 7) * reel;
        aw = Math.max(hit, reel);
        j.spine.rotation.x += -0.45 * hit + 0.3 * reel; j.neck.rotation.x += -0.35 * hit + 0.15 * reel;
        j.spine.rotation.z += 0.12 * sway; j.neck.rotation.z += -0.1 * sway;
        j.shoulderL.rotation.set(-0.2 * reel, 0, 0.9 * hit + 0.35 * reel); j.elbowL.rotation.set(-0.3 - 0.4 * reel, 0, 0);
        R.x += 0.4 * hit + 0.5 * reel; R.z += -0.6 * hit - 0.2 * reel; j.elbowR.rotation.x += 0.4 * hit;
        j.body.position.y += -0.05 * reel;
        j.kneeL.rotation.x += 0.35 * hit + 0.2 * reel; j.kneeR.rotation.x += 0.15 * hit + 0.2 * reel;
        j.thighR.rotation.x += 0.35 * hit;
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        aw = w;
        R.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    // a two-hander at a run, carried at high port
    // (out of a fight on the shoulder, at a run too; in one, at high port)
    const onShoulder = shouldered;
    if (!fp && two && !a && runK > 0 && st.dead < 0) holdInChest(ARM_R, RUN_TWO_AT, RUN_TWO_DIR, RUN_TWO_POLE, runK * (1 - onShoulder));
    if (!fp && two && onShoulder > 0 && st.dead < 0) holdInChest(ARM_R, SHOULDER_AT, SHOULDER_DIR, SHOULDER_POLE, onShoulder, SHOULDER_FLAT);
    // (a two-handed move placed by the weapon)
    if (!fp && two && twoHold.k > 0 && st.dead < 0) holdInChest(ARM_R, twoHold.at, twoHold.dir, twoHold.pole, twoHold.k, twoHold.flat, twoHold.flatK);
    if (st.dead < 0) fade.apply(dt); else fade.reset();
    st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead, -1); legs.reset(); }
    else {
      // the legs: planted feet, a pelvis that follows them (ik.ts); then a crouch bends the knees instead of sinking the feet
      if (!fp) legs.captureArms();
      _legW[0] = 1 - ownL; _legW[1] = 1 - ownR;
      // the feet: side-on, the left forward and the right back and turned out; fighting, the left steps further in
      const F = feet ?? (t - fightT < 1.6 ? FIGHT_FEET : REST_FEET);
      legs.stance(0, F[0], F[1], F[2]); legs.stance(1, F[3], F[4], F[5]);
      legs.update(dt, st.phase, st.dead, 1 - legOwn, fp ? 0 : 1, _legW);
      groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    // through the eyes a two-hander rests in both hands where both are seen (held out on the right, the
    // left hand on the lower grip), and the attacks take it from there
    // after Power Strike's blow the blades stay down a moment, then come back to rest (the cast ends right
    // after it): one-handed by a blend, a two-hander by a move of its own (RECOVER_TWO)
    if (fp && chopTail > 0 && a?.name !== 'chop' && a?.name !== 'smite') {
      const u = chopTail * chopTail * (3 - 2 * chopTail);
      if (two) { viewAt(RECOVER_TWO, 1 - chopTail, _va, _vd); vw = 1; }
      else {
        _ra.set(...ONE_DOWN_AT); _rd.set(...ONE_DOWN_DIR).normalize(); wR = u;
        if (offHeld) { _la.set(-ONE_DOWN_AT[0], ONE_DOWN_AT[1], ONE_DOWN_AT[2]); _ld.copy(_rd); _ld.x = -_ld.x; wL = u; }
      }
    }
    if (fp && two && st.dead < 0) {
      _va.lerpVectors(FP_TWO_AT, _va, vw); _vd.lerpVectors(FP_TWO_DIR, _vd.normalize(), vw);
      eyesTwo.apply(_va, _vd, dt);
      _vg.copy(_vd).normalize().multiplyScalar(-offGrip.position.y * root.scale.x).add(_va);
      holdInView(ARM_R, _vg, _vd, FP_TWO_POLE, 1 - aw, FACE_EYES, lerp(1, viewFlat, vw));
    }
    if (fp && !two && st.dead < 0) {
      // (at rest each blade is held low on its own side of the view, `oneRest`, a move's place over it by its weight:
      // left to the stance's own angles, the arms' shoulders moved under the camera put the hilts under the frame)
      // (and its flat turned as the rest has it, a move's to the eyes over it by the move's weight)
      if (held) {
        const k = oneRest(held, _er, _ed, _ef);
        _ra.lerpVectors(_er, _ra, wR); _rd.lerpVectors(_ed, _rd.normalize(), wR);
        _rf.lerpVectors(_ef, FACE_EYES, wR).normalize(); flatR = lerp(k, flatR, wR); wR = 1;
      }
      if (offHeld) {
        const k = oneRest(offHeld, _er, _ed, _ef); _er.x = -_er.x; _ed.x = -_ed.x; _ef.x = -_ef.x;
        _la.lerpVectors(_er, _la, wL); _ld.lerpVectors(_ed, _ld.normalize(), wL);
        _lf.lerpVectors(_ef, FACE_EYES, wL).normalize(); flatL = lerp(k, flatL, wL); wL = 1;
      }
      if (held && wR > 0) { eyesR.apply(_ra, _rd, dt); holdInView(ARM_R, _ra, _rd, POLE_VR, wR, _rf, flatR); }
      if (offHeld && wL > 0) { eyesL.apply(_la, _ld, dt); holdInView(ARM_L, _la, _ld, POLE_VL, wL, _lf, flatL); }
    }
    // (a hand not placed in the view this frame has no place there to fade from)
    if (!fp || two || st.dead >= 0 || !held || wR === 0) eyesR.reset();
    if (!fp || two || st.dead >= 0 || !offHeld || wL === 0) eyesL.reset();
    if (!fp || !two || st.dead >= 0) eyesTwo.reset();

    shield.quaternion.slerpQuaternions(SHIELD_SIDE, SHIELD_FRONT, guard);
    shield.position.lerpVectors(SIDE_POS, FRONT_POS, guard);
    // drinking, the forearm comes up across the face: the shield hangs from it before the chest instead, facing
    // ahead and shifted towards the elbow, the face and the flask clear above it
    shieldHang = damp(shieldHang, drinkLift, 12, dt); drinkOn = damp(drinkOn, a?.name === 'drink' ? 1 : 0, 12, dt);
    if (shieldHang > 0.01 && shield.visible) {
      root.updateMatrixWorld(true);
      j.elbowL.getWorldPosition(_s1); j.handL.getWorldPosition(_s2);
      const a = _s3.subVectors(_s2, _s1).normalize(), n = _s4.set(0, 0, 1).transformDirection(root.matrixWorld);
      n.addScaledVector(a, -a.dot(n)).normalize();
      _sm.makeBasis(_s5.crossVectors(a, n), a, n);
      _sq.setFromRotationMatrix(_sm).premultiply(j.handL.getWorldQuaternion(_shq).invert());
      shield.quaternion.slerp(_sq, shieldHang);
      _s1.lerp(_s2, 0.3).addScaledVector(_s4.set(0, -1, 0), 0.26 * root.scale.x).addScaledVector(n, 0.07 * root.scale.x);
      shield.position.lerp(j.handL.worldToLocal(_s1), shieldHang);
    }

    // the weapon arm within a body's ranges, its hand where the pose put it (armIK.ts); first, as a two-hander's lower
    // grip goes wherever it takes the weapon. A two-hander's upper hand holds it square (slanted, it moved the lower
    // grip and that wrist bent further). (Not through the eyes, where the arms are placed where they're seen: fitted,
    // a two-hander held square couldn't point its blade ahead of the arms, where the eyes see it, and stood upright)
    slantR = 0; slantL = 0;
    if (aimDown > 0 && held && !fp && st.dead < 0) aimAtFloor(aimDown, bladeUp, fall * fall);
    if (!fp && st.dead < 0) slantR = fitArm(j, false, held ? gripTurn(handR, grip, _vr) : undefined, body, held && !two ? SLANT : undefined).slant;
    // (a two-hander through the eyes is held as its moves are keyed, `EYES.restOn`: fitted so, its weapon turned off its
    // place and the lower grip went out of the left hand's reach)
    else if (fp && st.dead < 0 && held && !two) slantR = fitInView(false, grip, gripTurn(handR, grip, _vr), SLANT).slant;
    // (the weapon seated in the fist as it holds it, its handle diagonal across the palm by that slant: before a lower grip is taken)
    if (held) seat(handR, grip, held.r, slantR);
    if (stop > 0 && held && st.dead < 0) groundStop(stop, fall >= 1);

    // a two-hander: the left hand follows the grip wherever the right arm takes the weapon, and lets go
    // where it can't reach (a pose that flings the arms apart), the arm easing back to the pose's own
    let twoHeld = false;
    if (two) {
      root.updateMatrixWorld(true);
      offGrip.getWorldPosition(_grip);
      j.chest.worldToLocal(_grip);
      const fore = j.P.foreL + j.P.handR, out = _grip.distanceTo(j.shoulderL.position) - (j.P.upperL + fore);
      // (a few cm short doesn't show: the stances hold it at full stretch; drinking, it lets go halfway to the flask,
      // and the arm eases back from the grip after; and it lets go as the right hand lifts the weapon onto the
      // shoulder, easing back to hang on the way. Eased back while still holding, the hand slid off the grip and the
      // wrist bent 52 degrees; held halfway to the shoulder, the lower grip's turn bent it 30)
      let k = (1 - ramp(out, 0.07, 0.2)) * Math.min(1, 2 * (1 - drinkOn)) * (1 - onShoulder);
      const reach = out < 0.07 && drinkOn < 0.5 && onShoulder === 0;
      if (k > 0) {
        _sq.copy(j.shoulderL.quaternion); _eq.copy(j.elbowL.quaternion); _wq.copy(j.handL.quaternion);
        // the wrist where the fist closes round the lower grip (a hand stays on its wrist), the hand's length along
        // the line to the shoulder, turned about the handle as far as the arm needs to stay within a body's ranges
        // (armIK.ts); a grip no turn makes possible, or one the arm reaches only through the body, it lets go of
        // (held turned to the shoulder, the wrist bent 130 degrees and the forearm went 17 cm into the chest)
        j.shoulderL.getWorldPosition(_up).sub(offGrip.getWorldPosition(_gw));
        _hd.set(0, 1, 0).transformDirection(grip.matrixWorld);
        fistReach(handL, _hd, _up, held!.r, _cur);
        fistTurn(handL, _hd, _up, _fq);
        // (the handle may run diagonally across the lower palm, as a person's lower hand holds one: held square, that
        // wrist bent 73 degrees sideways, 43 past its range, through the two-handed swing)
        // (through the eyes, from its shoulder under the camera, `armsFromBelow`)
        const shoulder = fp ? _fw[5].copy(j.shoulderL.position) : undefined;
        const fit = solveArm(j, true, { wrist: _cur.negate().add(_gw), hand: _fq, roll: { axis: _hd, range: 1.1, at: _gw }, pole: _pw.copy(_pole).applyQuaternion(j.chest.getWorldQuaternion(_cq)), body, slant: SLANT, shoulder });
        slantL = fit.slant;
        _up.applyAxisAngle(_hd, fit.roll);
        // (a grip out of reach for a frame or two is held through: a hand doesn't let go for 50 ms; and while the hand
        // comes onto it off the shoulder, it's taking hold, not failing to: counted so, it was still easing back after)
        twoGood = takingHold > 0 ? 1 : damp(twoGood, reach && fit.excess < 15 && fit.depth < 0.03 ? 1 : 0, 6, dt);
        twoHeld = reach && twoGood > 0.5;
        grasp.past = fit.excess; grasp.into = fit.depth;
        // (the arm eases back to the pose's own only once the hand has let go: easing it back while still holding bent the wrist)
        if (!twoHeld) k *= Math.min(1, 2 * twoGood);
        if (k < 1) { j.shoulderL.quaternion.slerp(_sq, 1 - k); j.elbowL.quaternion.slerp(_eq, 1 - k); j.handL.quaternion.slerp(_wq, 1 - k); }
      } else { grasp.past = 0; grasp.into = 0; }
      grasp.held = twoHeld; grasp.free = drinkOn >= 0.5 || onShoulder > 0 || (takingHold > 0 && !twoHeld); grasp.short = out;
    }

    // the other arm within a body's ranges too, its hand where the pose put it
    if (!fp && st.dead < 0 && !twoHeld) { slantL = fitArm(j, true, offHeld && !sheathed ? gripTurn(handL, gripL, _vl) : undefined, body, offHeld && !sheathed ? SLANT : undefined).slant; }
    else if (fp && st.dead < 0 && offHeld && !sheathed) slantL = fitInView(true, gripL, gripTurn(handL, gripL, _vl), SLANT).slant;
    // (a cut out of a blow turned to the floor and stopped by it, after the fade, fades from the arms as drawn; every
    // other from the pose's own: from the arms as fitted, the cut into a two-handed swing blended two elbows, and the
    // lower grip went 9 cm out of the left arm's reach)
    if (!fp && st.dead < 0 && (aimDown > 0 || stop > 0)) fade.drawnArms();
    // (and through the eyes, where the arms are placed after the fade, from the arms as drawn: a one-handed swing over,
    // the arm was back in the stance in a frame)
    if (fp && st.dead < 0) fade.drawnArms();

    // the mail skirt swings with the legs, draped over them and the hands; the tassets on each side ride their own thigh
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    for (const ta of tassets) ta.g.rotation.x = -(0.12 + Math.max(-0.05, ta.s > 0 ? fL : fR) * 0.75 + move * 0.05);
    root.updateMatrixWorld(true);
    placeBodies(!fp && st.dead < 0 && !(offHeld && !sheathed) && !twoHeld);
    // (through the eyes the body isn't drawn, nor its shadow: the mail swings undraped)
    skirt.update(fL, fR, move, t, dt, fp ? undefined : legBodies.list, fp ? undefined : handBodies.list);

    // fists round whatever they hold; an empty hand hangs loosely curled
    const along = (g: THREE.Object3D) => _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
    // (each handle diagonal across its palm by the slant the arm took, the weapon seated in that fist)
    if (held) hold(handR, along(grip), held.r, undefined, slantR);
    else poseHand(handR, 0.5 + Math.sin(t * 1.3) * 0.05, 0.1);
    if (offHeld && !sheathed) { seat(handL, gripL, offHeld.r, slantL); hold(handL, along(gripL), offHeld.r, undefined, slantL); }
    else if (twoHeld && held) hold(handL, along(grip), held.r, _up, slantL);
    else poseHand(handL, lerp(shield.visible ? 1.35 : 0.5 + Math.sin(t * 1.3 + 1) * 0.05, 1.1, flaskOut), 0.08);
    // the flask comes out of the fist and is put away again
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));

    if (dt > 0) for (const f of furs) f.update(dt);

    // the blade's fuller glows while a skill charges
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, palm, height: 2.05, setGear,
    get swing() { return side; },
    get offTip() { return offHeld ? tipL : null; },
    get reach() { return (ARM + (held?.len ?? 0)) * root.scale.x; },
    get lowerGrip() { return held?.off != null ? grasp : null; },
    get offGrip() { return held?.off != null ? offGrip : null; },
    get fists() {
      const fists: Fist[] = [];
      if (held) fists.push({ hand: 'right', ...fistOn(handR, grip, held.r) });
      if (offHeld && !sheathed) fists.push({ hand: 'left', ...fistOn(handL, gripL, offHeld.r) });
      else if (held?.off != null && grasp.held) fists.push({ hand: 'left', ...fistOn(handL, grip, held.r) });
      return fists;
    },
    reset: () => { legs.reset(); fade.reset(); },
    // through the eyes the fur at the elbows passes right by the camera: a ring of spikes filling the view
    armsFov: () => EYES.fov,
    firstPerson: (on) => { fp = on; for (const f of elbowFur) f.visible = !on && gloved; },
    dispose() {
      kit.dispose();
      for (const f of furs) f.dispose();
      disposeGeometries(root);
    },
  };
}
