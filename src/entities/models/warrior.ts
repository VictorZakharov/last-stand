// The Warrior: a bare-headed veteran in an engraved breastplate over layered leather, fur at the collar,
// cuffs and boot tops, crossed straps, a mail skirt between leather tassets, engraved knee cops and tall
// strapped boots, with a cloth cape. Carries the equipped weapon and shield. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, mail as mailMaps, cloth as clothMaps, steel as steelMaps, fur as furMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm, groundFeet } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { FurSway } from './furSway';
import { LegIK, IK } from './ik';
import { curve, PoseFade, type Keys } from './motion';
import { buildFlask, drink, drinkUp, DRINK_SHEATHED, type DrinkHold } from './flask';
import { taperTube, twist, plate, edgeTube, strap, belt, buckle, stud, disc, furTufts, Skirt, merge, scaleUV, lod, type SurfaceFn } from './armor';
import { buildHead, buildNeck, toGroup, HEAD_MM } from './head';
import { buildHand, poseHand, hold, seat, fistReach } from './hands';
import { clamp, lerp, mulberry, damp } from '../../util';
import { SkeletonCape } from './cape';
import { fromEyes, dirFromEyes } from '../viewModel';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { ActionState, AnimState, Gear, Model } from '../../types';

const ZERO = new THREE.Vector3(), _v = new THREE.Vector3();
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
interface Weapon { group: THREE.Group; len: number; off: number | null; /** the grip's radius, for the fingers */ r: number; /** worn on the belt: the point along it that sits in the frog, and whether it hangs blade down (a sword, from its guard) or head up (an axe or mace, its haft through the ring) */ hang?: { at: number; down: boolean } }
/** the grip turns the weapon's +Y forward and a little up out of the bent arm */
const GRIP = Math.PI / 2 + 0.7;
/** straightens the weapon along the arm, for swings that trace the damage arc */
const ALONG_ARM = Math.PI - GRIP;
/** how far a weapon arm swings at a run (rad), and the share of it the wrist turns back so the blade stays put */
const ARM_SWING = 0.4, WRIST = 0.8;
/** arm length (upper + fore + hand), before the model's 1.1 scale */
const ARM = 0.63;
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const _grip = new THREE.Vector3(), _pole = new THREE.Vector3(1, -0.7, -0.6);
const _gw = new THREE.Vector3(), _dw = new THREE.Vector3(), _cur = new THREE.Vector3(), _hq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _sq = new THREE.Quaternion();
/** the legs' own blend over the pose this frame (left, right), see `legs.update` */
const _legW: [number, number] = [1, 1];
const IDENT = new THREE.Quaternion(), _va = new THREE.Vector3(), _vd = new THREE.Vector3(), _up = new THREE.Vector3(), _vg = new THREE.Vector3();
const _ra = new THREE.Vector3(), _rd = new THREE.Vector3(), _la = new THREE.Vector3(), _ld = new THREE.Vector3();
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
const TAIL: Record<string, number> = { chop: 0.3, buff: 0.55, flurry: 0.15 }, TAIL_OUT: Record<string, number> = { chop: 0.55, buff: 0.6, flurry: 0.35 };
/** the wrist's turn that holds a blade at rest edge on to the foe (rad) */
const EDGE = 1.95, EDGE_TWO = Math.PI / 2;
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
/** the elbow: cocked, thrown straight into the blow, giving a little after it (a two-hander's stays bent, both hands on the grip) */
const SW_ELBOW: Keys = [[0, -1.0], [0.45, -1.25], [0.62, -0.15], [0.8, -0.1], [1, -0.55]];
const SW_ELBOW2: Keys = [[0, -0.9], [0.45, -1.1], [0.62, -0.5], [1, -0.6]];
/** the wrist: cocked back, then snapped through so the blade leads the hand */
const SW_WRIST: Keys = [[0, 0.6], [0.48, 0.45], [0.62, 1], [1, 0.95]];
/** the pelvis: back onto the rear foot and loading as it winds, forward and down into the blow */
const SW_FWD: Keys = [[0, -0.02], [0.45, -0.05], [0.65, 0.06], [0.9, 0.08], [1, 0.06]];
const SW_DIP: Keys = [[0, -0.02], [0.45, -0.04], [0.66, -0.085], [1, -0.06]];
/** the trunk: drawn up as it winds, crunching over into the blow; the shoulders tipping from the high side to the low */
const SW_BEND: Keys = [[0, 0], [0.45, -0.06], [0.7, 0.16], [1, 0.18]];
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

/** Navy wool cape with a leather trim, matching the sleeves. */
const WARRIOR_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [30, 38, 58] as const,
  trim: [74, 50, 34] as const,
  sheenColor: 0x3a4a6a,
  attachmentColor: 0x3a2a1e,
  materialName: 'Heavy navy warrior cape',
});

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
  // the fuller only glows while a skill charges
  const edge = kit.glow(0xffb070, 0, false);

  const j = buildHumanoid({ skin: leather }, {
    chestW: 0.18, chestD: 0.14, waistW: 0.16, shoulderW: 0.21, shoulderY: 0.45, upperR: 0.068, foreR: 0.058, handR: 0.058,
    thighR: 0.1, shinR: 0.078, headR: 0.125, shinL: 0.41,
  });
  stripRig(j.root);
  // fur casts no shadow: hundreds of thin tufts would add much to the shadow pass for little
  const S = new Sculpt().glow(furM);

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
  S.add(bp, engraved, j.chest);
  S.add(plate(back, 20, 10, 0.008), plateM, j.chest);
  S.add(edgeTube(breast, 'v1', 0.008, 28), plateM, j.chest);
  S.add(edgeTube(back, 'v1', 0.008, 20), plateM, j.chest);
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16 - 0.5) * 2 * BP_A * 0.96, p = bpPoint(a, -0.05, new THREE.Vector3(), 0.008);
    studAt(p, V(Math.sin(a), 0, Math.cos(a)), 0.006);
  }
  S.add(merge(studs.splice(0)), plateM, j.chest);
  // side straps joining front and back plates under the arms
  for (const s of [1, -1]) for (const y of [0.02, 0.1]) S.add(strap([V(s * 0.155, y, 0.1), V(s * 0.188, y, 0), V(s * 0.155, y, -0.1)], 0.028, 0.006), leather, j.chest);
  // crossed straps over the chest, each with a buckle; they run on over the shoulders
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [V(s * 0.1, 0.27, -0.1), V(s * 0.115, 0.29, -0.02), V(s * 0.105, 0.25, 0.09)];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(onPlate(lerp(s * 0.1, -s * 0.16, t), lerp(0.2, -0.04, t), 0.004)); }
    S.add(strap(pts, 0.04, 0.007), leather, j.chest);
    const mid = onPlate(s * -0.01, 0.1, 0.012);
    S.add(buckle(0.05, 0.05), plateM, j.chest, mid.toArray(), [0, 0, s * 0.62]);
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
      S.add(plate(L, 18, 6, 0.007), i === 2 ? plateM : darkSteel, sh);
      S.add(edgeTube(L, 'v0', 0.006, 18), plateM, sh);
    }
    const md = disc(0.04, 0.014);
    projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.04 + 1) / 2, (y / 0.04 + 1) / 2]);
    S.add(md, engraved, sh, [s * 0.095, 0.07, 0.07], [-0.5, s * 0.75, 0]);
    S.add(furTufts(rng, 44, (i, o) => {
      const a = (rng() - 0.5) * 3; o.p.set(s * (0.1 + Math.cos(a) * 0.04), -0.06, Math.sin(a) * 0.1); o.d.set(s * 0.6, -0.8, Math.sin(a) * 0.5);
    }, 0.045, 0.009), furM, sh);
  }

  // --- arms: navy sleeves strapped at the upper arm, fur at the elbow, leather bracers with a steel
  // plate, fingerless gloves
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // the sleeve, thigh and shin run on past their joints under the bracer, the knee cop and the boot, and follow the lower limb there
    S.skin(scaleUV(limb(0.38, 0.078, 0.064, 0.12, 0.24, 14), 2, 1), cloth, sh, el, 0.2, 0.32);
    for (const y of [-0.13, -0.21]) S.add(belt(0.078, 0.078, y, 0.024, 0.006, 0, 14), leather, sh);
    S.add(furTufts(rng, 40, (i, o) => { const a = (i / 40) * Math.PI * 2; o.p.set(Math.sin(a) * 0.06, -0.035, Math.cos(a) * 0.06); o.d.set(Math.sin(a), 0.6, Math.cos(a)); }, 0.035, 0.009), furM, el);
    S.add(scaleUV(lathe([[0.052, -0.26], [0.06, -0.2], [0.066, -0.1], [0.07, -0.05], [0.068, -0.035]], 16), 2, 1), leather, el);
    // its top closed under the elbow's fur (through the eyes, with the fur hidden, it would show open)
    S.add(new THREE.CircleGeometry(0.069, 16).rotateX(-Math.PI / 2), leather, el, [0, -0.037, 0]);
    const vb: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 1.8, y = lerp(-0.24, -0.06, v), r = 0.066 + 0.01 * sm(-0.24, -0.08, y) + 0.004; return out.set(s * Math.cos(a) * r, y, Math.sin(a) * r); };
    S.add(plate(vb, 10, 8, 0.005), plateM, el);
    for (const y of [-0.09, -0.2]) S.add(belt(0.072, 0.072, y, 0.018, 0.006, 0, 14), leatherDark, el);
    // the glove's cuff: from under the bracer down over the wrist into the palm, following the hand, so the hand joins the forearm (the bracer ends above the wrist)
    S.skin(scaleUV(lathe([[0.041, -0.315], [0.043, -0.29], [0.045, -0.265], [0.048, -0.235], [0.052, -0.2]], 16), 2, 1), leather, el, hd, 0.25, 0.29);
  }
  const handL = buildHand(j.handL, 1, leather, skinTip, 1.08), handR = buildHand(j.handR, -1, leather, skinTip, 1.08);

  // --- legs: leather trousers, engraved knee cops, tall boots with fur tops, straps and a steel toe
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.skin(scaleUV(limb(0.54, 0.108, 0.078, 0.14, 0.26, 14), 2, 1.5), leatherDark, th, kn, 0.32, 0.46);
    S.skin(scaleUV(limb(0.46, 0.076, 0.058, 0.1, 0.32, 12), 2, 1.5), leatherDark, kn, an, 0.3, 0.41);
    const cop: SurfaceFn = (u, v, out) => { const lon = (u - 0.5) * 2.5, lat = lerp(-0.95, 1.05, v); return out.set(Math.sin(lon) * Math.cos(lat) * 0.082, Math.sin(lat) * 0.085, Math.cos(lon) * Math.cos(lat) * 0.075 + 0.012); };
    const kg = plate(cop, 14, 12, 0.006);
    projectUV(kg, steelRegion('knee'), (x, y) => [(x / 0.082 + 1) / 2, (y / 0.085 + 1) / 2]);
    S.add(kg, engraved, kn, [0, -0.01, 0]);
    for (const y of [0.05, -0.075]) S.add(belt(0.082, 0.07, y, 0.02, 0.006, 0, 14), leather, kn);
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
  const skirt = new Skirt({ r0: 0.19, r1: 0.25, len: 0.36, depth: 0.8, folds: 7, foldAmp: 0.03, flare: 0.7, rows: 6 });
  const skirtMesh = new THREE.Mesh(skirt.geo, mail);
  skirtMesh.position.y = 0.04; skirtMesh.castShadow = skirtMesh.receiveShadow = true;
  j.hips.add(skirtMesh);
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

  // --- the head, and an open-faced helmet over it: a steel skull with a low crest, bands riveted over
  // it and round the brow, a nasal down the nose, cheek guards over the ears and a mail curtain over the
  // nape. It is shaped on the head itself (padded over the scalp); the face stays bare.
  const head = buildHead(j.head, kit, 'warrior');
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, 'warrior', j.P.neckL);
  {
    const hg = head.group, h = new Sculpt(), C = toGroup(0, 128, -12), M = HEAD_MM;
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
    h.add(scaleUV(dome, 4, 1.5), plateM, hg);
    const ring = (el: (a: number) => number, lift: number, n: number) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 - Math.PI; return shell(a, el(a), lift); });
    // a rolled rim, the brow band over it, four bands meeting at the crown and a rivet on top
    const rim = ring(rimEl, 1, 48);
    h.add(taperTube([...rim, rim[0]], () => 0.0055, lod(96, 48), 6), plateM, hg);
    h.add(strap(ring((a) => rimEl(a) + 0.13, 0, 48), 0.032, 0.0035, true, out, 96), darkSteel, hg);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      h.add(strap(Array.from({ length: 10 }, (_, q) => shell(a, lerp(rimEl(a) + 0.26, Math.PI / 2 - 0.02, q / 9), 0)), 0.022, 0.003, false, out), darkSteel, hg);
      for (let q = 0; q < 3; q++) { const e = lerp(rimEl(a) + 0.4, 1.35, q / 2); studAt(shell(a, e, 3), out(shell(a, e), V(0, 0, 0)), 0.0038); }
    }
    for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2 - Math.PI, e = rimEl(a) + 0.13; studAt(shell(a, e, 3.5), out(shell(a, e), V(0, 0, 0)), 0.0036); }
    const top = shell(0, Math.PI / 2, 3);
    h.add(new THREE.SphereGeometry(0.009, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), plateM, hg, top.toArray(), [0, 0, 0], [1, 0.7, 1]);
    // the nasal: a ridged bar from the brow band down the bridge of the nose, clear of it, narrowing to
    // a rounded end
    const nTop = shell(0, rimEl(0) + 0.22, 4.5), nTopY = nTop.y / M;
    const nasal: SurfaceFn = (u, v, o) => {
      const c = 2 * u - 1, w = lerp(5.5, 9, v) * Math.sqrt(1 - (1 - sm(0, 0.12, v)) ** 2 * 0.75), x = c * w;
      const y = lerp(100, nTopY, v), z = lerp(head.midZ(y) + 4, nTop.z / M + 5, sm(0.55, 1, v));
      return toGroup(x, y, z + 2.5 * (1 - c * c) - x * x * 0.04, o);
    };
    h.add(plate(nasal, 6, 12, 0.003, undefined, C), plateM, hg);
    studAt(nasal(0.5, 0.88, new THREE.Vector3()).add(V(0, 0, 0.002)), V(0, 0, 1), 0.0035);
    // cheek guards over the ears, their lower edge tucked in over the beard, their front edge clear of
    // the face
    for (const s of [1, -1]) {
      const guard: SurfaceFn = (u, v, o) => {
        const a = s * lerp(0.95, 2.0, u), e0 = lerp(-0.62, -0.3, u) - 0.1 * Math.sin(u * Math.PI), el = lerp(e0, rimEl(a) + 0.08, v);
        return shell(a, el, 1.2 - 3 * sm(-0.2, -0.6, Math.sin(el)), o);
      };
      h.add(plate(guard, lod(12, 6), lod(12, 6), 0.005, undefined, C), plateM, hg);
      h.add(edgeTube(guard, 'v0', 0.0035, 16), plateM, hg);
      h.add(edgeTube(guard, 'u0', 0.0035, 12), plateM, hg);
      for (const [u, v] of [[0.3, 0.82], [0.7, 0.82], [0.45, 0.25]]) { const p = guard(u, v, new THREE.Vector3()); studAt(p.addScaledVector(out(p, _v), 0.004), out(p, V(0, 0, 0)), 0.0035); }
    }
    // mail hanging from under the rim behind the cheek guards, over the nape
    const aventail: SurfaceFn = (u, v, o) => {
      const a = Math.PI + (u - 0.5) * 2.7, p = shell(a, rimEl(a) + 0.05, -2, o), r = V(p.x, 0, p.z - C.z).normalize();
      return p.addScaledVector(r, 0.03 * (1 - v)).add(V(0, -0.09 * (1 - v), 0));
    };
    h.add(scaleUV(plate(aventail, lod(28, 12), 4, 0.003, undefined, C), 3, 3), mail, hg);
    h.add(merge(studs.splice(0)), plateM, hg);
    h.build();
  }

  // --- weapons in the right hand, built along the grip's +Y (blade up); setGear shows the equipped one.
  // The grip turns +Y to point forward, slightly up, out of the bent arm.
  const grip = joint(j.handR, 0, -0.06, 0.01);
  grip.rotation.x = GRIP;
  const weapons = new Map<string, Weapon>();
  const add = (name: string, len: number, off: number | null, r: number, build: (w: Sculpt, g: THREE.Group) => void, hang?: Weapon['hang']) => {
    const g = new THREE.Group();
    grip.add(g);
    const w = new Sculpt();
    build(w, g);
    w.glow(edge).build();
    g.visible = false;
    weapons.set(name, { group: g, len, off, r, hang });
  };
  /** a blade along +Y from `at`: a flattened diamond with a fuller (a groove down its middle) tapering to the point */
  const blade = (w: Sculpt, g: THREE.Group, bw: number, len: number, at: number) => {
    const t = bw * 0.2, sec = (k: number, f: number): [number, number][] => [[bw * k, 0], [bw * 0.45 * k, t * k], [bw * 0.18 * k, t * (1 - 0.45 * f) * k], [-bw * 0.18 * k, t * (1 - 0.45 * f) * k], [-bw * 0.45 * k, t * k], [-bw * k, 0], [-bw * 0.45 * k, -t * k], [-bw * 0.18 * k, -t * (1 - 0.45 * f) * k], [bw * 0.18 * k, -t * (1 - 0.45 * f) * k], [bw * 0.45 * k, -t * k]];
    const rows = 10, pos: number[] = [];
    const ring = (i: number) => { const y = i / rows, k = y < 0.82 ? 1 - y * 0.18 : (1 - y) / 0.18 * 0.85, f = y < 0.75 ? 1 : Math.max(0, 1 - (y - 0.75) / 0.1); return sec(Math.max(k, 0.001), f).map(([x, z]) => V(x, at + y * len, z)); };
    for (let i = 0; i < rows; i++) {
      const A = ring(i), B = ring(i + 1);
      // wound so the faces (and the normals made from them) point out of the blade: turned inwards, the
      // inside of the far face was drawn, lit from the wrong side (black against the light)
      for (let q = 0; q < A.length; q++) { const r = (q + 1) % A.length; pos.push(...A[q].toArray(), ...B[q].toArray(), ...A[r].toArray(), ...B[q].toArray(), ...B[r].toArray(), ...A[r].toArray()); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv: number[] = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 3, pos[i + 1] * 3);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    w.add(geo, bladeM, g);
    w.add(new THREE.BoxGeometry(0.004, len * 0.7, bw * 0.3), edge, g, [0, at + len * 0.4, 0]);
  };
  const haft = (w: Sculpt, g: THREE.Group, from: number, to: number, r = 0.022) => {
    w.add(scaleUV(new THREE.CylinderGeometry(r, r * 1.1, to - from, 10), 1, 4), wood, g, [0, (from + to) / 2, 0]);
    w.add(twist(0.2, r * 1.05, 0.006, 5), leatherDark, g, [0, from + 0.28, 0]);
  };
  // an axe blade: a wedge of a disc standing in the haft's plane, centred on +X (or -X), with a bearded edge
  const axeHead = (w: Sculpt, g: THREE.Group, r: number, at: number, side: number) => {
    w.add(new THREE.CylinderGeometry(r, r, 0.022, 20, 1, false, side * Math.PI / 2 - 0.8, 1.6), plateM, g, [side * 0.02, at, 0], [Math.PI / 2, 0, 0]);
    w.add(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.008, 20, 1, false, side * Math.PI / 2 - 0.78, 1.56), darkSteel, g, [side * 0.02, at, 0], [Math.PI / 2, 0, 0]);
  };
  /** a crossguard with quillons curving towards the blade, a wrapped grip and a wheel pommel */
  const hilt = (w: Sculpt, g: THREE.Group, gripL: number, guard: number) => {
    w.add(scaleUV(new THREE.CylinderGeometry(0.02, 0.023, gripL, 10), 1, 3), leatherDark, g, [0, 0.1 - gripL / 2, 0]);
    w.add(twist(gripL * 0.9, 0.023, 0.004, 6), leather, g, [0, 0.1 - gripL * 0.05, 0]);
    for (const s of [1, -1]) w.add(taperTube([V(0, 0, 0), V(s * guard * 0.5, 0.005, 0), V(s * guard, 0.03, 0)], (t) => 0.016 * (1 - t * 0.4), 8, 6), plateM, g, [0, 0.11, 0]);
    w.add(new THREE.BoxGeometry(0.06, 0.03, 0.04), plateM, g, [0, 0.11, 0]);
    w.add(lathe([[0.001, -0.022], [0.034, -0.012], [0.036, 0.012], [0.001, 0.022]], 16), plateM, g, [0, 0.1 - gripL - 0.02, 0], [Math.PI / 2, 0, 0], [1, 1, 0.55]);
    w.add(new THREE.SphereGeometry(0.012, 8, 6), brass, g, [0, 0.1 - gripL - 0.02, 0.012]);
  };

  add('Sword', 1.12, null, 0.024, (w, g) => { hilt(w, g, 0.2, 0.14); blade(w, g, 0.045, 0.94, 0.12); }, { at: 0.115, down: true });
  add('Axe', 0.74, null, 0.024, (w, g) => {
    haft(w, g, -0.14, 0.72);
    axeHead(w, g, 0.2, 0.6, 1);
    w.add(new THREE.BoxGeometry(0.1, 0.05, 0.04), darkSteel, g, [-0.06, 0.6, 0]);
    w.add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), brass, g, [0, 0.6, 0]);
  }, { at: 0.44, down: false });
  add('Mace', 0.72, null, 0.026, (w, g) => {
    haft(w, g, -0.14, 0.62, 0.024);
    w.add(new THREE.SphereGeometry(0.075, 14, 10), darkSteel, g, [0, 0.64, 0]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      w.add(new THREE.BoxGeometry(0.018, 0.17, 0.075), plateM, g, [Math.cos(a) * 0.07, 0.64, Math.sin(a) * 0.07], [0, -a, 0]);
    }
    w.add(new THREE.ConeGeometry(0.025, 0.07, 8), plateM, g, [0, 0.74, 0]);
  }, { at: 0.54, down: false });
  add('Greatsword', 1.62, -0.24, 0.026, (w, g) => {
    hilt(w, g, 0.44, 0.24);
    for (const s of [1, -1]) w.add(new THREE.SphereGeometry(0.022, 8, 6), brass, g, [s * 0.24, 0.14, 0]);
    blade(w, g, 0.062, 1.34, 0.13);
  });
  add('Greataxe', 1.12, -0.3, 0.028, (w, g) => {
    haft(w, g, -0.42, 1.1, 0.026);
    for (const s of [1, -1]) axeHead(w, g, 0.27, 0.9, s);
    w.add(new THREE.CylinderGeometry(0.036, 0.036, 0.1, 10), brass, g, [0, 0.9, 0]);
    w.add(new THREE.ConeGeometry(0.03, 0.12, 6), plateM, g, [0, 1.14, 0]);
  });
  add('Maul', 1.1, -0.28, 0.029, (w, g) => {
    haft(w, g, -0.38, 0.92, 0.027);
    w.add(new THREE.BoxGeometry(0.4, 0.22, 0.22), darkSteel, g, [0, 1.0, 0]);
    for (const s of [1, -1]) {
      w.add(new THREE.BoxGeometry(0.03, 0.24, 0.24), plateM, g, [s * 0.14, 1.0, 0]);
      w.add(new THREE.CylinderGeometry(0.1, 0.11, 0.03, 12), plateM, g, [s * 0.215, 1.0, 0], [0, 0, Math.PI / 2]);
    }
    w.add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), brass, g, [0, 0.84, 0]);
  });
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
   *  pitch, elbow, wrist pitch, wrist roll, shoulder roll);
   *  swings lower, narrower and with the blade standing up, so they cross the view broadside (shoulder
   *  pitch, elbow, how far the blade turns towards the arm, wrist roll, share of the sweep); Power Strike
   *  a high guard, blades spread (shoulder pitch, elbow, blade towards the arm, yaw, wrist roll); the
   *  raised shield higher, its rim just under the crosshair (added to shoulder and elbow) */
  let fp = false;
  const FP_STANCE = [-0.6, 0, 0.7, 0, -0.2];
  const FP_STANCE_TWO = [-0.2, -0.2, 1.3, -1.0, -0.3];
  const FP_SWING = [-1.35, -0.4, 0.5, 0.6, 0.55];
  const FP_SWING_TWO = [-1.2, -0.4, 0.1, 0.6, 0.55];
  const FP_GUARD = [-1.0, -0.8, 0.3, -0.25, 0];
  const FP_BLOCK = [-0.25, 0.05], NO_BLOCK = [0, 0];
  /** a two-hander at rest through the eyes, in both hands and both seen: where the left hand holds it in the
   *  view (camera space, metres; the right hand is further up the grip, however long), the weapon's
   *  direction there (blade up and out to the right), and where the right elbow points (down, so the
   *  forearm rises from the bottom of the view rather than lying across it) */
  const FP_TWO_AT = V(0.15, -0.23, -0.55), FP_TWO_DIR = V(0.6, 0.6, -0.5).normalize(), FP_TWO_POLE = V(0, -1, 0);
  /** its swing there, the blade sweeping round like a wiper across the view: how far it leans out at either
   *  end (rad from upright), and the left hand's place from the swing's left end, through the middle, to its
   *  right (x, z; the right arm can't reach as far across to the left) and its height */
  const FP_TWO_SWING = [1.3, 0.1, 0.16, 0.25, -0.45, -0.5, -0.5, -0.27];
  /** One-handed moves through the eyes, placed in the view (the right hand's grip and its blade's direction,
   *  camera space; the left hand's mirrors it): Power Strike raises both blades to cross over the top of the
   *  view, trembling as the charge builds, then drives them down through it; Twin Fangs cuts each blade from
   *  high on its own side down across the view; Bull Rush draws the blades back, drives them ahead through
   *  the rush and flings them out to the sides as it lands.
   *  (Posed by joint angles the raised arms loomed over the camera and the blades went out of the frame.) */
  const FP_CHOP = { up: [V(0.34, -0.02, -0.5), V(-0.55, 0.62, -0.7)], down: [V(0.24, -0.3, -0.5), V(-0.55, -0.2, -0.8)] };
  const FP_CUT = { up: [V(0.36, -0.06, -0.6), V(-0.6, 0.45, -0.65)], down: [V(-0.14, -0.3, -0.5), V(-0.85, -0.25, -0.45)] };
  const FP_RUSH = { back: [V(0.38, -0.4, -0.4), V(0.35, 0.55, -0.75)], ahead: [V(0.28, -0.34, -0.6), V(-0.12, 0.18, -0.98)], out: [V(0.45, -0.22, -0.5), V(0.75, 0.4, -0.5)] };
  const FP_TWO_RUSH = { ahead: [V(0.12, -0.3, -0.55), V(-0.3, 0.3, -0.9)], out: [V(0.24, -0.22, -0.5), V(0.85, 0.35, -0.4)] };
  /** Bull Rush: the share of its pose that is the brace before it goes, and where the rush ends (skills/bullRush BRACE, RUN, HOLD); the rest is the follow-through */
  const BRACE = 0.16, RUSH = 0.58, STRIDES = 2.5;
  /** where each elbow points while the arm is placed in the view (chest space: out to its side, down) */
  const POLE_VR = V(-0.6, -1, 0), POLE_VL = V(0.6, -1, 0);
  /** Power Strike there: raised to a high guard on the right, blade up and forward, then the blow ahead */
  const FP_TWO_GUARD = [V(0.24, -0.2, -0.52), V(0.3, 0.7, -0.6).normalize()], FP_TWO_BLOW = [V(0.1, -0.27, -0.5), V(0.1, -0.1, -1).normalize()];

  // --- round shield on the left fist: planks behind a painted navy face, a steel rim with rivets and a
  // domed boss. At rest it hangs at the side facing outwards; raised (or charging) it swings round in
  // front of the fist, facing out of the hand. Its face is local +Z.
  const shield = joint(j.handL, 0, -0.1, 0);
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
  const furs = S.build().filter((m) => m.material === furM).map((m) => { m.userData.fur = true; return new FurSway(m, furM); });
  const elbowFur = [j.elbowL, j.elbowR].flatMap((e) => e.children.filter((c) => c.userData.fur));

  const root = j.root;
  root.scale.setScalar(1.1);

  // --- cape pinned under the pauldrons, colliding with the armoured body
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: [0.11, 0.3, -0.165], right: [-0.11, 0.3, -0.165],
    palette: WARRIOR_CAPE_PALETTE,
    settings: { length: 1.2, width: 0.62 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.02, 0.04, 0], b: j.shoulderR, offB: [-0.02, 0.04, 0], radius: 0.12, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.17, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.21, depthRadius: 0.17, clearance: 0.006, faceSampleSpacing: 0.07 },
      { name: 'hips', a: j.hips, offA: [0, 0.02, 0], offB: [0, -0.2, 0], radius: 0.25, depthRadius: 0.22, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'left arm', a: j.shoulderL, offA: [0, -0.02, 0], b: j.elbowL, radius: 0.085, clearance: 0.006 },
      { name: 'right arm', a: j.shoulderR, offA: [0, -0.02, 0], b: j.elbowR, radius: 0.085, clearance: 0.006 },
      { name: 'left thigh', a: j.thighL, offA: [0, -0.1, 0], b: j.kneeL, radius: 0.13 },
      { name: 'left shin', a: j.kneeL, b: j.ankleL, radius: 0.1 },
      { name: 'left boot', a: j.ankleL, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.14], radius: 0.09 },
      { name: 'right thigh', a: j.thighR, offA: [0, -0.1, 0], b: j.kneeR, radius: 0.13 },
      { name: 'right shin', a: j.kneeR, b: j.ankleR, radius: 0.1 },
      { name: 'right boot', a: j.ankleR, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.14], radius: 0.09 },
    ],
  });

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
    for (const w of offWeapons.values()) { w.group.visible = false; gripL.add(w.group); w.group.position.set(0, 0, 0); }
    sheathed = false;
    offHeld = gear.offWeapon ? offWeapons.get(gear.offWeapon) ?? offWeapons.get('Sword')! : null;
    frog.visible = !!offHeld; rings[0].visible = !!offHeld?.hang?.down; rings[1].visible = !!offHeld && !offHeld.hang?.down;
    if (offHeld) offHeld.group.visible = true;
    // each seated in its fist, the hand on its wrist
    if (held) seat(handR, grip, held.r);
    if (offHeld) { seat(handL, gripL, offHeld.r); tipL.position.y = offHeld.len; }
    tipOn(false);
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
  /** turn a hand by `ang` about the length of the weapon in its grip */
  const edgeOn = (hand: THREE.Object3D, g: THREE.Object3D, ang: number): void => {
    _hd.set(0, 1, 0).applyQuaternion(g.quaternion);
    hand.quaternion.multiply(_hq.setFromAxisAngle(_hd, ang));
  };
  const ARM_R = { shoulder: j.shoulderR, elbow: j.elbowR, hand: j.handR, grip }, ARM_L = { shoulder: j.shoulderL, elbow: j.elbowL, hand: j.handL, grip: gripL };

  /** Through the eyes, a weapon held where it's seen: the arm reaches so its grip sits at `at` in the view
   *  (camera space) and the wrist turns the weapon onto `dir` (the least turn from the forearm, so the fist
   *  keeps its roll). `k` blends it in over the pose so far. */
  function holdInView(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number): void {
    const { shoulder, elbow, hand, grip: g } = arm;
    root.updateMatrixWorld(true);
    fromEyes(root, j.neck, at, _gw).lerp(g.getWorldPosition(_cur), 1 - k);
    dirFromEyes(root, dir, _dw).normalize().lerp(_cur.set(0, 1, 0).transformDirection(g.matrixWorld), 1 - k).normalize();
    hand.quaternion.slerp(IDENT, k);
    // (the grip sits a little off the wrist: a few rounds of reaching, then turning, settle it)
    for (let i = 0; i < 3; i++) {
      hand.getWorldPosition(_hp).add(_gw).sub(g.getWorldPosition(_cur));
      reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), pole);
      shoulder.updateMatrixWorld(true);
      _cur.set(0, 1, 0).transformDirection(g.matrixWorld);
      _hq.setFromUnitVectors(_cur, _dw).multiply(hand.getWorldQuaternion(_pq));
      hand.quaternion.copy(elbow.getWorldQuaternion(_pq).invert().multiply(_hq));
      hand.updateMatrixWorld(true);
    }
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
    const armR = fp ? 0.03 : two ? 0.12 : ARM_SWING, armL = fp ? 0.03 : two ? 0.12 : shield.visible ? 0.6 * ARM_SWING : ARM_SWING;
    walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: armR, armL, bob: 0.08, dir, run: true });
    if (!fp) { const sw = Math.sin(st.phase) * dir * move; j.handR.rotation.x += sw * armR * WRIST; if (shield.visible || offHeld) j.handL.rotation.x += -sw * armL * WRIST; }
    if (fp) {
      const k = 0.2;
      j.chest.rotation.y = cy0 + (j.chest.rotation.y - cy0) * k; j.hips.rotation.y = hy0 + (j.hips.rotation.y - hy0) * k;
      j.elbowL.rotation.x = eL0 + (j.elbowL.rotation.x - eL0) * k; j.elbowR.rotation.x = eR0 + (j.elbowR.rotation.x - eR0) * k;
    }
    // (the body leans into its stride, models/ik.ts: the hands are held where this pose puts them through it, `holdArms`, so the weapon and shield keep their angle)
    if (two) { j.shoulderR.rotation.x += -0.5; j.shoulderR.rotation.z += 0.2; j.elbowR.rotation.x += -1.0; }
    else { j.shoulderR.rotation.x += -0.3; j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8; }
    // shield carried low at the side, the arm held a little out so it clears the leg; a second
    // weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3; j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8; }
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
      if (two) { j.shoulderR.rotation.x += (-0.15 + sway) * ia; j.elbowR.rotation.x += -0.25 * ia; }
      else { j.shoulderR.rotation.x += (-0.2 + sway) * ia; j.shoulderR.rotation.z += 0.08 * ia; j.elbowR.rotation.x += -0.3 * ia; j.handR.rotation.x += 0.15 * ia; j.handR.rotation.z += -0.3 * ia; }
      if (shield.visible) { j.shoulderL.rotation.x += (-0.3 - sway) * ia; j.shoulderL.rotation.z += -0.12 * ia; j.elbowL.rotation.x += -0.95 * ia; guard = 0.45 * ia; }
      else if (offHeld) { j.shoulderL.rotation.x += (-0.2 - sway) * ia; j.shoulderL.rotation.z += -0.08 * ia; j.elbowL.rotation.x += -0.3 * ia; j.handL.rotation.x += 0.15 * ia; j.handL.rotation.z += 0.3 * ia; }
    }
    // (not through the eyes: the camera stays level, so a lean only tips the weapons into the middle of the view)
    j.spine.rotation.x += move * (fp ? 0 : IK ? 0.05 : 0.14) * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const raw = st.action;
    // (the tail: the last move's end pose held a moment after it, unless the body moves off or another action starts)
    if (!raw && lastName !== '' && (TAIL[lastName] ?? 0) > 0 && !fp) { tailName = lastName; tailT = TAIL[lastName]; }
    if (raw || move > 0.3) { if (tailT > 0 && !raw) fade.cut(0.25); tailT = 0; }
    const inTail = !raw && tailT > 0;
    if (inTail) { tailT -= dt; if (tailT <= 0) fade.cut(TAIL_OUT[tailName] ?? 0.4); }
    const a: ActionState | null = raw ?? (inTail ? { name: tailName, t: 1 } : null);
    // a two-hander through the eyes: how far a move posed in the hero's own space takes over from holding it
    // in the view, and how far a move placed in the view takes it from rest there (to _va, _vd)
    let aw = 0, vw = 0;
    // a one-handed move placed in the view (through the eyes): how far it takes each arm over (to _ra, _rd / _la, _ld)
    let wR = 0, wL = 0;
    // how far the pose owns the legs (a lunge, a charge: the body leaves its feet behind at a dash's speed, so the leg IK would kneel): the pose's own legs show until the dash is over, and the feet start again under the hips
    let legOwn = 0;
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
      offHeld.group.position.set(0, sheathe ? -h.at : 0, 0);
    }
    if (chopTail > 0) chopTail = Math.max(0, chopTail - dt / 0.3);
    const began = !!raw && (raw.name !== lastName || raw.t < lastK - 0.2), ended = !raw && lastName !== '';
    if ((ended || began) && lastName === 'swing') swingEnd = t;
    if (began && raw.name === 'swing') { side = -side; chain = t - swingEnd < 0.25; }
    // (a swing straight after a swing starts where that one ended: a short fade; out of an action back to the stance, a slow one)
    if (began) fade.cut(chain && raw.name === 'swing' ? 0.08 : 0.14); else if (ended && !inTail) fade.cut(0.3);
    if (a && a.name !== 'buff' && a.name !== 'cast' && a.name !== 'stagger' && a.name !== 'drink') fightT = t;
    lastName = raw?.name ?? ''; lastK = raw?.t ?? 1;
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
        R.x = lerp(R.x, curve(SW_PITCH, k), w); R.z = lerp(R.z, 0, w); R.y = (theta - body + (two ? 0.45 : 0)) * w;
        const elbow = left ? j.elbowL : j.elbowR, hand = left ? j.handL : j.handR;
        elbow.rotation.x = lerp(elbow.rotation.x, curve(two ? SW_ELBOW2 : SW_ELBOW, k), w);
        hand.rotation.x += ALONG_ARM * curve(SW_WRIST, k) * w;
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
        // the straight arm and weapon sweep the damage arc: raised out to the starting side, then the
        // tip crosses it from 0.55 to 0.85 of the cast, in step with the trail (skills/cleave swingArc)
        const w = ramp(k, 0, 0.3) * (1 - ramp(k, 0.9, 1));
        const fs = fp ? (two ? FP_SWING_TWO : FP_SWING) : null;
        // (through the eyes the sweep is narrower: at full width the weapon winds up and finishes out of the view)
        const theta = side * 1.2 * (fs ? fs[4] : 1) * (2 * ramp(k, 0.55, 0.85) - 1);
        // a two-hander turns more with the body and keeps the grip in front of the chest, in the left hand's reach
        const body = two ? 0.75 : 0.45;
        j.spine.rotation.y += 0.3 * body * theta * w;
        j.chest.rotation.y += 0.7 * body * theta * w;
        // (seen through the eyes, a blade along the level arm points away from the camera: a sliver. The
        // arm swings lower with the elbow bent and the blade stands up out of the fist, sweeping across
        // the view broadside)
        R.x = lerp(R.x, fs ? fs[0] : -1.25, w); R.z = lerp(R.z, 0, w); R.y = ((1 - body) * theta + (two ? 0.45 : 0)) * w;
        const elbow = left ? j.elbowL : j.elbowR, hand = left ? j.handL : j.handR;
        elbow.rotation.x = lerp(elbow.rotation.x, fs ? fs[1] : two ? -0.5 : -0.1, w);
        hand.rotation.x += ALONG_ARM * (fs ? fs[2] : 1) * w;
        if (fs) hand.rotation.z += (left ? -1 : 1) * fs[3] * w;
        // (a two-hander through the eyes: placed in the view instead, the blade sweeping across it)
        if (fp && two) {
          const h = -side * (2 * ramp(k, 0.55, 0.85) - 1), b = h * FP_TWO_SWING[0], S = FP_TWO_SWING, i = h < 0 ? 1 : 2, u = h < 0 ? h + 1 : h;
          _vd.set(Math.sin(b) * 0.78, Math.cos(b) * 0.78, -0.62);
          _va.set(lerp(S[i], S[i + 1], u), S[7], lerp(S[i + 3], S[i + 4], u));
          vw = w;
        }
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
      } else if (a.name === 'chop') {
        // Power Strike: the weapon rises overhead and trembles while the charge builds, then comes down
        // in a vertical arc at 0.9 of the cast (the skill's fireAt)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.97, 1));
        const lift = ramp(k, 0, 0.3), blow = ramp(k, 0.9, 0.97);
        const shake = (1 - blow) * lift * Math.sin(t * 45) * 0.02;
        // through the eyes, a weapon raised overhead leaves the view and the raised upper arms loom past
        // the camera: a high guard instead, upper arms forward and low, forearms up, blades standing up in
        // front of the face, and from there the same blow
        const g = FP_GUARD;
        const pitch = fp ? lerp(g[0], -0.8, blow) + shake : lerp(lerp(-1.3, -2.95, lift), -0.8, blow) + shake;
        const bend = fp ? lerp(g[1], -0.1, blow) : two ? -0.55 : -0.1;
        const along = ALONG_ARM * (fp ? lerp(g[2], 1, blow) : 1) * w;
        // a two-hander is raised over the middle of the head, within the left hand's reach
        // (through the eyes the blades stand apart, clear of the middle of the view)
        R.x = lerp(R.x, pitch, w); R.z = lerp(R.z, 0, w); R.y = (fp ? g[3] : two ? 0.7 : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, bend, w);
        j.handR.rotation.x += along;
        if (fp) j.handR.rotation.z += g[4] * w * (1 - blow);
        // two weapons: both rise and come down together, the left arm the mirror image of the right
        if (offHeld) {
          const L = j.shoulderL.rotation;
          L.x = lerp(L.x, pitch, w); L.z = lerp(L.z, 0, w); L.y = -(fp ? g[3] : 0.25) * w;
          j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, bend, w);
          j.handL.rotation.x += along;
          if (fp) j.handL.rotation.z -= g[4] * w * (1 - blow);
        }
        if (fp && !two) {
          inView(FP_CHOP, blow, true, !!offHeld);
          _ra.x += shake * 0.5; _ra.y += shake; _la.x -= shake * 0.5; _la.y += shake;
          // (raised slowly as the charge gathers; after the blow the blades stay down a moment, chopTail)
          wR = lift; wL = offHeld ? lift : 0;
          if (blow > 0) chopTail = 1;
        }
        if (fp && two) {
          if (blow > 0) chopTail = 1;
          _va.copy(FP_TWO_AT).lerp(FP_TWO_GUARD[0], lift).lerp(FP_TWO_BLOW[0], blow);
          _va.x += shake * 0.5; _va.y += shake * 0.5;
          _vd.copy(FP_TWO_DIR).lerp(FP_TWO_GUARD[1], lift).lerp(FP_TWO_BLOW[1], blow);
          vw = w;
        }
        j.spine.rotation.x += ((fp ? 0 : -0.25) * lift * (1 - blow) + 0.45 * blow) * w;
        j.body.position.y += -0.16 * blow * w;
        j.kneeL.rotation.x += 0.55 * blow * w; j.kneeR.rotation.x += 0.4 * blow * w;
        j.thighL.rotation.x += -0.45 * blow * w;
        ownL = blow * w * still;
      } else if (a.name === 'spin') {
        // Steel Tempest: spin with the weapon held out, pivoting on both feet in a wide, low stance (the legs
        // turn with the body: feet can't step at this speed), the trunk leaning out over the blade and the
        // chest and arm trailing the hips so the weapon is dragged round
        aw = 1; legOwn = 1;
        j.body.rotation.y += t * 15;
        R.x += -0.1; R.z += -1.35; R.y += -0.3; j.elbowR.rotation.x += 0.7;
        j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9; j.elbowL.rotation.x += 0.5;
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
    // at rest a blade is held edge on to the foe, not flat: the wrist turns it a quarter turn about its own
    // length (the swings already lead with the edge; starting one fades this out)
    // (not an attack: drinking keeps the blades as they rest, the one on the hip aside)
    const rest = !a || a.name === 'drink';
    if (!fp && rest) { if (held) edgeOn(j.handR, grip, two ? EDGE_TWO : EDGE); if (offHeld && !sheathed) edgeOn(j.handL, gripL, -EDGE); }
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
    // after it)
    if (fp && chopTail > 0 && a?.name !== 'chop') {
      const u = chopTail * chopTail * (3 - 2 * chopTail);
      if (two) { _va.copy(FP_TWO_BLOW[0]); _vd.copy(FP_TWO_BLOW[1]); vw = u; }
      else { inView(FP_CHOP, 1, true, !!offHeld); wR = u; wL = offHeld ? u : 0; }
    }
    if (fp && two && st.dead < 0) {
      _va.lerpVectors(FP_TWO_AT, _va, vw); _vd.lerpVectors(FP_TWO_DIR, _vd.normalize(), vw);
      _vg.copy(_vd).normalize().multiplyScalar(-offGrip.position.y * root.scale.x).add(_va);
      holdInView(ARM_R, _vg, _vd, FP_TWO_POLE, 1 - aw);
    }
    if (fp && !two && st.dead < 0) {
      if (held && wR > 0) holdInView(ARM_R, _ra, _rd, POLE_VR, wR);
      if (offHeld && wL > 0) holdInView(ARM_L, _la, _ld, POLE_VL, wL);
    }

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

    // a two-hander: the left hand follows the grip wherever the right arm takes the weapon, and lets go
    // where it can't reach (a pose that flings the arms apart), the arm easing back to the pose's own
    let twoHeld = false;
    if (two) {
      root.updateMatrixWorld(true);
      offGrip.getWorldPosition(_grip);
      j.chest.worldToLocal(_grip);
      const fore = j.P.foreL + j.P.handR, out = _grip.distanceTo(j.shoulderL.position) - (j.P.upperL + fore);
      // (a few cm short doesn't show: the stances hold it at full stretch; drinking, it lets go for the flask)
      const k = (1 - ramp(out, 0.07, 0.2)) * (1 - drinkOn);
      twoHeld = out < 0.07 && drinkOn < 0.5;
      if (k > 0) {
        _sq.copy(j.shoulderL.quaternion);
        const e0 = j.elbowL.rotation.x;
        reachArm(j.shoulderL, j.elbowL, j.P.upperL, fore, _grip, _pole);
        // then the wrist where the fist closes round the lower grip (a hand stays on its wrist), the hand's
        // length along the line to the shoulder, the wrist bending the rest of the way
        if (twoHeld) {
          j.shoulderL.getWorldPosition(_up).sub(offGrip.getWorldPosition(_gw));
          fistReach(handL, _hd.set(0, 1, 0).transformDirection(grip.matrixWorld), _up, held!.r, _cur);
          reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_gw.sub(_cur)), _pole);
        }
        if (k < 1) { j.shoulderL.quaternion.slerp(_sq, 1 - k); j.elbowL.rotation.x = lerp(e0, j.elbowL.rotation.x, k); }
      }
    }

    // the mail skirt swings with the legs; the tassets on each side ride their own thigh
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    skirt.update(fL, fR, move, t, dt);
    for (const ta of tassets) ta.g.rotation.x = -(0.12 + Math.max(-0.05, ta.s > 0 ? fL : fR) * 0.75 + move * 0.05);

    // fists round whatever they hold; an empty hand hangs loosely curled
    root.updateMatrixWorld(true);
    const along = (g: THREE.Object3D) => _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
    if (held) hold(handR, along(grip), held.r);
    else poseHand(handR, 0.5 + Math.sin(t * 1.3) * 0.05, 0.1);
    if (offHeld && !sheathed) hold(handL, along(gripL), offHeld.r);
    else if (twoHeld && held) hold(handL, along(grip), held.r, _up);
    else poseHand(handL, lerp(shield.visible ? 1.35 : 0.5 + Math.sin(t * 1.3 + 1) * 0.05, 1.1, flaskOut), 0.08);
    // the flask comes out of the fist and is put away again
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));

    if (dt > 0) { cape.update(dt, st.velocity ?? ZERO); for (const f of furs) f.update(dt); }
    cape.setVisible(st.dead < 0.6);

    // the blade's fuller glows while a skill charges
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.05, setGear,
    get swing() { return side; },
    get offTip() { return offHeld ? tipL : null; },
    get reach() { return (ARM + (held?.len ?? 0)) * root.scale.x; },
    worldObjects: [cape.mesh],
    reset: () => { cape.reset(); legs.reset(); fade.reset(); },
    // through the eyes the fur at the elbows passes right by the camera: a ring of spikes filling the view
    firstPerson: (on) => { fp = on; for (const f of elbowFur) f.visible = !on; },
    dispose() {
      kit.dispose();
      for (const f of furs) f.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
