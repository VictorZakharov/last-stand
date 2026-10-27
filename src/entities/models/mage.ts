// The Mage: a battle scholar, lean and clean-shaven, his dark hair cropped short, in a fitted oxblood longcoat with a
// high standing collar, split up the front over a charcoal waistcoat and underskirts, brass-edged, a leather harness
// buckled in brass; his shirt's charcoal sleeves pushed up over forearms inked with runes, a grimoire chained at his hip,
// tall worn boots, and a gnarled staff cradling a floating crystal. The longcoat with its collar, shoulders, harness and
// skirts is the chest item's, the bracers the hands item's: without them the waistcoat and bare forearms. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, cloth as clothMaps, steel as steelMaps, wood as woodMaps, wool as woolMaps, oiled, pbrMaterialMaps, ctx2d } from '../../core/textures';
import { engravedSteel, embroidered, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, pulse, ramp, groundFeet, reachArm, runShareOf, disposeGeometries } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, lod, plate, edgeTube, strap, belt, buckle, stud, disc, stitches, gem as gemGeo, Skirt, SkirtLimbs, armOffThigh, scaleUV, type SurfaceFn, type JointPoint } from './armor';
import { buildHead, buildNeck, toGroup, handSkin, HEAD_MM } from './head';
import { buildHand, poseHand, hold, seat, gripTurn, bare, handCapsules, SLANT } from './hands';
import { clamp, lerp, damp, TAU, mulberry } from '../../util';
import type { BellCloth } from './sleeve';
import { LegIK } from './ik';
import { buildBoot } from './boot';
import { fitArm } from './armIK';
import { bodyShape } from './anatomy';
import { curve, PoseFade, type Keys } from './motion';
import { onTunic, tunicFront, neckHem, necklineBack, TUNIC_Y, WAIST } from './tunic';
import { buildFlask, drink, drinkUp, type DrinkHold } from './flask';
import type { ActionState, AnimState, Gear, Model } from '../../types';

const _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _vr = new THREE.Quaternion();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// the robe's upper body (chest joint space): its half-width (x) at height y, and its depth (z) as a share
// of that: a man's chest (ANSUR II: 29 cm across, 25 deep) with the robe over it, rising to the shoulders
const TORSO: [number, number][] = [[0.145, -0.12], [0.155, -0.02], [0.165, 0.1], [0.168, 0.18], [0.15, 0.245], [0.1, 0.28], [0.075, 0.29]];
const DEPTH = 0.86;
/** the coat's shoulder caps' size against the shoulder */
const SHOULDER_CAP = 0.68;
/** how far the slung belt and the book on it draw in round his hips without the coat (a share of their size over it) */
const SLUNG_IN = 0.9;
function torsoR(y: number): number {
  for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][1]) { const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i]; return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1)); }
  return TORSO[TORSO.length - 1][0];
}
/** a point on the robe's front at x, y, `lift` above it */
function onChest(x: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = torsoR(y), a = Math.asin(clamp(x / r, -1, 1));
  return out.set(Math.sin(a) * (r + lift), y, Math.cos(a) * (r * DEPTH + lift));
}

/** the coat's front panels' embroidery: a column of diamonds, each with a smaller one inside (`embroidered`'s motif) */
function diamondColumn(c: CanvasRenderingContext2D, w: number, h: number): void {
  const m = w / 2;
  c.lineWidth = 4;
  const diamond = (y: number, r: number) => { c.beginPath(); c.moveTo(m, y - r); c.lineTo(m + r * 0.6, y); c.lineTo(m, y + r); c.lineTo(m - r * 0.6, y); c.closePath(); c.stroke(); };
  for (let y = h * 0.42; y < h - 80; y += 150) { diamond(y, 52); diamond(y, 22); }
}

/** The runes inked round a forearm (an alpha-tested texture: the ink opaque, the rest clear), wrapping the lathe's u round
 *  the arm and v along it: a ring of circles with spokes over the inner forearm, a line of small rings and crosses down to
 *  the wrist, as the sheet's. Made once, shared by every build. */
let runes: THREE.CanvasTexture | undefined;
function forearmRunes(): THREE.CanvasTexture {
  if (runes) return runes;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const c = ctx2d(cv);
  c.strokeStyle = '#000'; c.fillStyle = '#000'; c.lineCap = 'round';
  // (drawn twice round the arm, at u = 0.25 and 0.75, so one faces out however the forearm turns; v runs from the wrist (0)
  // to the elbow (1))
  for (const cx of [128, 384]) {
    const ring = (y: number, r: number, lw: number) => { c.lineWidth = lw; c.beginPath(); c.arc(cx, y, r, 0, TAU); c.stroke(); };
    const line = (x0: number, y0: number, x1: number, y1: number, lw: number) => { c.lineWidth = lw; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    const cy = 320;
    ring(cy, 78, 5); ring(cy, 50, 4); ring(cy, 16, 4);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      line(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, cx + Math.cos(a) * 100, cy + Math.sin(a) * 100, 3.5);
    }
    line(cx, 40, cx, cy - 100, 4);
    for (const [y, r] of [[190, 18], [120, 13], [70, 10]] as const) { ring(y, r, 4); line(cx - r - 16, y, cx + r + 16, y, 4); }
    line(cx, cy + 100, cx, 480, 4);
    for (const y of [430, 465]) line(cx - 18, y, cx + 18, y, 4);
  }
  runes = new THREE.CanvasTexture(cv);
  runes.colorSpace = THREE.SRGBColorSpace;
  return runes;
}

/** where the feet stand (left x, z, turn, then right), rig units: at rest, throwing a spell (the left steps in), slamming the ground, aiming the staff (the right forward), bracing for the lance */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
/** the actions that pose the free hand; at every other time it hangs as a relaxed hand does, turned palm to the thigh and thumb
 *  forward (`HAND_HANG`, about its length): turned palm back, its width stood across the body and its thumb's side went into
 *  the hip and the skirt over it */
const FREE_HAND = new Set(['cast', 'summon', 'channel', 'slam', 'buff', 'drink']);
const HAND_HANG = Math.PI / 2;
const TAIL: Record<string, number> = { cast: 0.35, summon: 0.35, slam: 0.4, buff: 0.5 }, TAIL_OUT: Record<string, number> = { cast: 0.45, summon: 0.45, slam: 0.6, buff: 0.5 };
/** drinking: the flask raised straight up before the chin, the elbow down and forward (the bell sleeve falls back off the forearm) */
const DRINK: DrinkHold = { wrist: new THREE.Vector3(0.03, -0.08, 0.22), tipped: new THREE.Vector3(0.03, 0.1, 0.2), pole: new THREE.Vector3(0.4, -1, 0.5) };
const REST_FEET = [0.14, 0.06, 0.22, -0.14, -0.05, -0.35], CAST_FEET = [0.13, 0.2, 0.15, -0.13, -0.1, -0.45];
const SLAM_FEET = [0.2, 0.06, 0.4, -0.2, -0.04, -0.4], AIM_FEET = [0.13, -0.04, 0.35, -0.12, 0.14, -0.05], LANCE_FEET = [0.14, 0.24, 0.1, -0.15, -0.14, -0.55];

// --- a spell thrown from the free hand (cast: Starfall, Maelstrom), keyed over the cast, released at 0.55
// (the skill fires): the body coils away (the right shoulder forward, the weight back) as the hand gathers
// at the chest, then the hips and chest drive round and the arm throws the spell out, the weight forward
const CA_CHEST: Keys = [[0, 0], [0.4, 0.38], [0.5, 0.35], [0.62, -0.28], [0.8, -0.32], [1, -0.25]];
const CA_HIPS: Keys = [[0, 0], [0.38, 0.18], [0.48, 0.15], [0.58, -0.15], [1, -0.12]];
const CA_ARM_X: Keys = [[0, -0.2], [0.4, -0.75], [0.5, -0.8], [0.62, -1.5], [0.8, -1.45], [1, -1.3]];
const CA_ARM_Z: Keys = [[0, 0], [0.4, -0.45], [0.5, -0.45], [0.62, 0.12], [1, 0.08]];
const CA_ELBOW: Keys = [[0, -0.3], [0.4, -1.75], [0.5, -1.8], [0.62, -0.12], [0.8, -0.1], [1, -0.25]];
const CA_FWD: Keys = [[0, 0], [0.42, -0.05], [0.62, 0.06], [1, 0.05]];
const CA_BEND: Keys = [[0, 0], [0.42, -0.06], [0.62, 0.14], [1, 0.1]];

// --- Starfall (summon): the free hand reaches up into the sky, the head and chest lifting after it, the
// staff rising too, then at the release it is pulled down at the target, the body bending after it
const SU_ARM_X: Keys = [[0, -0.2], [0.42, -2.85], [0.5, -2.95], [0.6, -1.3], [0.7, -1.0], [1, -1.08]];
const SU_ARM_Z: Keys = [[0, 0], [0.42, 0.28], [0.5, 0.28], [0.62, 0.02], [1, 0]];
const SU_ELBOW: Keys = [[0, -0.3], [0.42, -0.12], [0.5, -0.35], [0.62, -0.05], [1, -0.1]];
const SU_BEND: Keys = [[0, 0], [0.42, -0.2], [0.5, -0.22], [0.62, 0.2], [1, 0.14]];
const SU_LOOK: Keys = [[0, 0], [0.4, -0.38], [0.5, -0.38], [0.62, 0.08], [1, 0.04]];
const SU_DIP: Keys = [[0, 0], [0.42, 0.03], [0.5, 0.03], [0.62, -0.06], [1, -0.045]];
const SU_FWD: Keys = [[0, 0], [0.42, -0.04], [0.62, 0.07], [1, 0.05]];

// --- Glacial Nova (slam): up on the toes with both arms raised, then driven down into a deep crouch, the
// hands slammed to the ground, held as the cast ends (the fade out of it is slow)
const SL_ARMS: Keys = [[0, -0.3], [0.4, -2.75], [0.5, -2.8], [0.62, -0.9], [0.7, -0.6], [1, -0.65]];
const SL_SPREAD: Keys = [[0, 0], [0.4, 0.3], [0.5, 0.32], [0.65, 0.15], [1, 0.2]];
const SL_DIP: Keys = [[0, 0], [0.4, 0.03], [0.5, 0.03], [0.64, -0.22], [0.72, -0.26], [1, -0.24]];
const SL_BEND: Keys = [[0, 0], [0.4, -0.18], [0.5, -0.18], [0.64, 0.45], [0.72, 0.52], [1, 0.48]];

export function buildMage(): Model {
  const kit = createKit(0x5dffa8);
  const rng = mulberry(5);
  const tex = (maps: ReturnType<typeof clothMaps>, rep: number, ns = 1) => { const m = pbrMaterialMaps(maps, rep, ns); return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale }; };
  // the coat's felted wool: oxblood, its weave seen up close as the sheet's
  const coat = kit.rim({ color: 0x681c22, roughness: 1, ...tex(woolMaps(), 1, 1.2) }, 0x7a2a2a, 0.3);
  const coatD = kit.rim({ color: 0x681c22, roughness: 1, ...tex(woolMaps(), 1, 1.2), side: THREE.DoubleSide }, 0x7a2a2a, 0.3);
  // the waistcoat's and the underskirts' charcoal wool, the shirt's darker red linen, the trousers' charcoal twill
  const charcoal = kit.rim({ color: 0x2b2a2e, roughness: 1, ...tex(woolMaps(), 1, 1.4), side: THREE.DoubleSide }, 0x3a3a44, 0.25);
  const shirt = kit.rim({ color: 0x3a1418, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x5a2a2a, 0.25);
  const sleeve = kit.rim({ color: 0x2e2d32, roughness: 1, ...tex(clothMaps(), 1, 1.1) }, 0x3a3a44, 0.25);
  const trousers = kit.rim({ color: 0x24232a, roughness: 1, ...tex(clothMaps(), 1, 1.2) }, 0x34343c, 0.2);
  // brass, rubbed bright on its edges (the steel map's roughness: worn smooth where it is handled)
  const brass = kit.std({ color: 0xa47a40, metalness: 1, roughness: 0.6, roughnessMap: pbrMaterialMaps(steelMaps(), 1).roughnessMap });
  const gold = brass;
  const E = engravedSteel();
  const goldE = kit.std({ color: 0xc9a058, metalness: 1, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap });
  const blackLeather = kit.std({ color: 0x1a1614, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  // the belts' and the harness's brown leather, worn and creased
  const leather = kit.std({ color: 0x5a3820, roughness: 0.75, ...tex(leatherMaps(), 2, 1.8) });
  const beltLeather = kit.std({ color: 0x3c2414, roughness: 0.75, ...tex(leatherMaps(), 2, 2) });
  // the grimoire: dark tooled leather over its boards, its pages old paper
  const tome = kit.std({ color: 0x2e1c12, roughness: 0.8, ...tex(leatherMaps(), 3, 2.4) });
  const paper = kit.std({ color: 0xb8a882, roughness: 1, ...tex(clothMaps(), 4, 0.6) });
  const linen = kit.rim({ color: 0x9a8e76, roughness: 1, ...tex(clothMaps(), 1, 0.7) }, 0x6a6050, 0.25);
  // the boots: worn, oiled dark brown leather on darker soles, as the sheet's
  const boot = kit.std({ color: 0x4a2c1c, roughness: 1, ...pbrMaterialMaps(oiled(), 1) });
  const bootStrap = kit.std({ color: 0x3a2214, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const sole = kit.std({ color: 0x1e140c, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const wood = kit.std({ color: 0x7a5236, roughness: 0.9, ...tex(woodMaps(), 1, 2) });
  const skinTip = kit.rim({ color: 0xc9957c, roughness: 0.6 }, 0x6a2a1c, 0.25);
  // the hat's charcoal felt and its dark lining
  const felt = kit.rim({ color: 0x2a2628, roughness: 1, ...tex(woolMaps(), 1, 1.4), side: THREE.DoubleSide }, 0x3a3434, 0.25);
  const lining = kit.rim({ color: 0x3a1418, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.BackSide }, 0x5a2a2a, 0.05);
  // the staff's crystal and its rings in the colour of the bolts it shoots (Splintering Bolt's `color`, #197)
  const glow = kit.glow(0xff6fe0, 1.5);
  // the staff's crystal: glowing softly, a little more while casting (animate() sets it each frame)
  const GEM_GLOW = 0.4;
  const gem = kit.phys({ color: 0xff4fd8, emissive: 0xff4fd8, emissiveIntensity: GEM_GLOW, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true });
  // the grimoire's set stone: red, lit from within a little
  const stone = kit.phys({ color: 0x7a0f1a, emissive: 0xff2a3a, emissiveIntensity: 0.5, roughness: 0.08, metalness: 0, clearcoat: 1, flatShading: true });
  // the coat's front panels: oxblood, a brass-thread border and a column of diamonds down each, as the sheet's
  const PW = 256, PH = 1024;
  const panelTex = embroidered(PW, PH, [[0, 0], [PW, 0], [PW, PH], [0, PH]], [0.36, 0.1, 0.12], [0.78, 0.6, 0.32], diamondColumn);
  const panel = kit.rim({ color: 0xffffff, roughness: 1, map: panelTex.map, normalMap: panelTex.normalMap, roughnessMap: panelTex.roughnessMap, side: THREE.DoubleSide }, 0x7a2a2a, 0.3);
  // the runes inked on his forearms (an alpha-tested layer over the skin)
  const ink = kit.std({ color: 0x343846, roughness: 0.6, map: forearmRunes(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  const j = buildHumanoid({ skin: coat }, {
    chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41,
    // (a shorter neck than the rig's: at 0.1 it stood long and thin out of the collar, beside his sheet; at 0.085 the jaw
    // sat on the collar)
    neckL: 0.093,
  });
  stripRig(j.root);
  const S = new Sculpt();
  // what comes off (setGear): the chest item's (the longcoat with its collar, shoulders, harness and skirts) and the
  // waistcoat shown without it, the hands item's (bracers over the forearms' runes)
  const A = new Sculpt(), T = new Sculpt(), H = new Sculpt();
  const bareSkin = handSkin(kit, 'mage');

  // --- the longcoat's body: fitted, open down the front over the charcoal waistcoat and the shirt's red at the throat
  A.add(scaleUV(lathe(TORSO, 28), 3, 1.5), coat, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, DEPTH]);
  A.add(scaleUV(lathe(WAIST, 24), 3, 1), coat, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  /** the coat's front edge on each side (half-width from the middle) at height y: close at the collar, opening down to the waist */
  const edgeX = (y: number) => lerp(0.035, 0.085, clamp((0.27 - y) / 0.37, 0, 1));
  const front: SurfaceFn = (u, v, out) => { const y = lerp(0.27, -0.12, v); return onChest((u - 0.5) * 2 * edgeX(y), y, 0.002, out); };
  A.add(plate(front, 10, 12, 0.003, undefined, V(0, 0.1, 0)), charcoal, j.chest);
  // (the shirt's red at the throat, between the collar's points)
  A.add(plate((u, v, out) => { const y = lerp(0.285, 0.2, v); return onChest((u - 0.5) * 2 * lerp(0.034, 0.012, v), y, 0.004, out); }, 6, 6, 0.002), shirt, j.chest);
  // the waistcoat's brass buttons down its middle, and brass piping down the coat's front edges
  for (const y of [0.17, 0.1, 0.03, -0.04]) A.add(stud(0.0075), brass, j.chest, onChest(0, y, 0.006).toArray());
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const y = lerp(0.275, -0.12, k / 10); pts.push(onChest(s * edgeX(y), y, 0.004)); }
    A.add(taperTube(pts, () => 0.005, 20, 6), brass, j.chest);
  }

  // --- the collar: standing high round the neck and flaring a little, open at the throat, brass along its edges (as the
  // sheet's, higher behind than at its points in front)
  {
    const PHI = 0.62;
    const collar: SurfaceFn = (u, v, out) => {
      const a = lerp(PHI, TAU - PHI, u), back = 0.5 - 0.5 * Math.cos(a);
      // (its foot run down into the coat's body and out under it: from the foot at 0.268 the coat's shoulders, squashed
      // front to back more than the collar, left a gap behind the neck that showed the skin and through it)
      const top = lerp(0.322, 0.372, back), y = lerp(0.235, top, v), r = lerp(0.112, 0.106, v ** 0.6) - 0.016 * Math.sin(Math.PI * v ** 0.8);
      return out.set(Math.sin(a) * r, y, Math.cos(a) * r * 0.95 + necklineBack(y));
    };
    A.add(plate(collar, 36, 6, 0.006, undefined, V(0, 0.3, 0)), coatD, j.chest);
    for (const e of ['u0', 'u1', 'v1'] as const) A.add(edgeTube(collar, e, 0.004, e === 'v1' ? 36 : 8), brass, j.chest);
  }

  // --- the shoulders: a cap of the coat's wool over each, brass-edged, a leather strap with a buckle across it
  for (const [s, joint0] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    const sh = joint(joint0);
    sh.scale.setScalar(SHOULDER_CAP);
    sh.position.x -= s * 0.022;
    const cap: SurfaceFn = (u, v, out) => {
      const lon = (u - 0.5) * 3, lat = lerp(-0.25, 1.45, v), R = 0.14;
      return out.set(s * Math.cos(lat) * Math.cos(lon) * R * 1.1 + s * 0.015, Math.sin(lat) * R * 0.85 + 0.01, Math.cos(lat) * Math.sin(lon) * R);
    };
    A.add(plate(cap, 18, 8, 0.008), coat, sh);
    A.add(edgeTube(cap, 'v0', 0.005, 18), brass, sh);
    const band: SurfaceFn = (u, v, out) => cap(u, 0.28, out).multiplyScalar(1.03);
    const strapPts = Array.from({ length: 12 }, (_, k) => { const p = band(k / 11, 0, new THREE.Vector3()); return p; });
    A.add(strap(strapPts, 0.03, 0.006), leather, sh);
    A.add(buckle(0.026, 0.03, 0.005), brass, sh, band(0.5, 0, new THREE.Vector3()).multiplyScalar(1.02).toArray(), [0, s * Math.PI / 2, 0]);
  }

  // --- the harness: a strap down the front from each shoulder to the belt, buckled at the chest, and crossed behind
  for (const s of [1, -1]) {
    // (from under the collar's foot: laid flat up the shoulders' slope above it, the straps' ends stood out of the coat)
    const down = [0.255, 0.2, 0.14, 0.06, -0.02, -0.1].map((y) => onChest(s * lerp(0.085, 0.1, (0.255 - y) / 0.355), y, 0.008));
    A.add(strap(down, 0.05, 0.008), leather, j.chest);
    A.add(buckle(0.028, 0.034, 0.005), brass, j.chest, onChest(s * 0.088, 0.15, 0.014).toArray());
    const back = [0.255, 0.17, 0.08, -0.02, -0.11].map((y, k) => onChest(s * lerp(0.1, -0.11, k / 4), y, 0.008).multiply(V(1, 1, -1)));
    A.add(strap(back, 0.05, 0.008), leather, j.chest);
  }
  A.add(disc(0.022, 0.008), brass, j.chest, onChest(0, 0.13, 0.012).multiply(V(1, 1, -1)).toArray(), [0, Math.PI, 0]);

  // --- arms: the shirt's charcoal sleeves pushed up to the elbow in a thick roll, a strap round each upper arm, the forearms
  // bare and inked with runes; leather bracers buckled over them (the hands item's), fingerless gloves
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // (its round top sunk into the deltoid: standing 5 cm over the joint, it was the shoulder)
    S.skin(scaleUV(limb(0.33, 0.062, 0.058, 0.05, 0.3, 14), 2, 1), sleeve, sh, el, 0.2, 0.33, [0, -0.025, 0]);
    // (the roll: two thick turns of the cloth bunched round the elbow)
    for (const [y, r, t] of [[-0.008, 0.058, 0.011], [0.016, 0.062, 0.012]] as const) {
      const roll = new THREE.TorusGeometry(r, t, lod(8, 6), lod(22, 14)).rotateX(Math.PI / 2);
      S.add(scaleUV(roll, 4, 1), sleeve, el, [0, y, 0]);
    }
    S.add(belt(0.064, 0.064, -0.17, 0.022, 0.005, 0, 16), leather, sh);
    S.add(buckle(0.018, 0.022, 0.004), brass, sh, [s * 0.066, -0.17, 0], [0, s * Math.PI / 2, 0]);
    // the forearm, from under the roll to the wrist, and its runes over it
    const fore: [number, number][] = [[0.033, -0.3], [0.035, -0.27], [0.04, -0.2], [0.046, -0.12], [0.048, -0.06], [0.046, -0.02]];
    S.skin(lathe(fore, 18), bareSkin, el, hd, 0.25, 0.29);
    S.skin(lathe(fore.map(([r, y]) => [r + 0.0006, y]), 18), ink, el, hd, 0.25, 0.29);
    // the bracer: leather round the lower forearm, two brass-buckled straps
    H.add(scaleUV(lathe([[0.04, -0.27], [0.045, -0.22], [0.051, -0.15], [0.053, -0.12]], 16), 2, 1), leather, el);
    for (const y of [-0.16, -0.235]) {
      H.add(belt(0.054 - (y + 0.16) * 0.12, 0.054 - (y + 0.16) * 0.12, y, 0.012, 0.004, 0, 14), beltLeather, el);
      H.add(buckle(0.014, 0.016, 0.003), brass, el, [s * (0.056 - (y + 0.16) * 0.12), y, 0], [0, s * Math.PI / 2, 0]);
    }
  }
  const handL = buildHand(j.handL, 1, leather, skinTip, 1, bareSkin), handR = buildHand(j.handR, -1, leather, skinTip, 1, bareSkin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });

  // --- without the coat: the waistcoat over the shirt, buttoned in brass, the shirt's collar round the neck
  // (eased out over the shoulders' top and round the neckline: the neck, a man's girth widening into the shoulders,
  // came through it behind)
  T.add(plate((u, v, out) => { const y = lerp(TUNIC_Y[0], TUNIC_Y[1], 1 - (1 - v) ** 1.5); return onTunic((u - 0.5) * TAU, y, 0.008 * clamp((y - 0.2) / 0.06, 0, 1), out); }, 40, 30, 0, undefined, V(0, 0.1, 0)), charcoal, j.chest);
  T.add(scaleUV(lathe(WAIST, 24), 3, 1), charcoal, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  T.add(neckHem(), shirt, j.chest);
  T.add(plate((u, v, out) => out.copy(tunicFront((u - 0.5) * 2 * lerp(0.04, 0.012, v), lerp(0.29, 0.2, v), 0.003)), 6, 6, 0.002), shirt, j.chest);
  for (const y of [0.17, 0.1, 0.03, -0.04]) T.add(stud(0.0075), brass, j.chest, tunicFront(0, y, 0.005).toArray());

  // --- legs: charcoal trousers into tall boots of worn brown leather (models/boot.ts, the ranger's last and sole)
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.add(scaleUV(limb(0.46, 0.09, 0.07, 0.1, 0.3, 12), 2, 1.5), trousers, th);
    S.add(scaleUV(limb(0.12, 0.068, 0.064, 0.04, 0.35, 12), 2, 1.5), trousers, kn);
    buildBoot(S, { leather: boot, sole, strap: bootStrap, metal: brass }, kn, an, th === j.thighL ? 1 : -1);
  }

  // --- the belts: a broad one at the waist with a square brass buckle, a second slung across the hips, and the grimoire
  // hanging from it at his left hip on a brass chain
  S.add(belt(0.166, 0.143, 0.02, 0.06, 0.012), beltLeather, j.spine);
  for (const y of [-0.006, 0.046]) {
    const ring = Array.from({ length: 48 }, (_, k) => { const a = (k / 48) * TAU; return V(Math.sin(a) * 0.174, y, Math.cos(a) * 0.151); });
    S.add(stitches(ring, 0.006, 0.004, 0.0013, true), linen, j.spine);
  }
  S.add(buckle(0.06, 0.05, 0.008), brass, j.spine, [0, 0.02, 0.156]);
  // (the slung belt and the book on it in a group of their own on the hips: sized round the coat, without it they hung
  // in the air off the waistcoat, and the group draws in to it, `SLUNG_IN`)
  const sling = new THREE.Group();
  j.hips.add(sling);
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * TAU; return V(Math.sin(a) * 0.215, -0.01 - 0.05 * Math.sin(a + 0.6) - 0.02 * Math.cos(a), Math.cos(a) * 0.18); }), 0.04, 0.01, true), beltLeather, sling);
  S.add(buckle(0.055, 0.05, 0.008), brass, sling, [-0.07, -0.025, 0.184], [0, -0.3, 0]);
  {
    // (the book's boards and spine round its pages, brass corners, a brass boss with the stone, hung on its side by the hip)
    const at: [number, number, number] = [0.285, -0.17, 0.02], ry = 1.45;
    const W = 0.15, Hh = 0.2, D = 0.06;
    const place = (x: number, y: number, z: number): [number, number, number] =>
      [at[0] + Math.sin(ry) * z + Math.cos(ry) * x, at[1] + y, at[2] + Math.cos(ry) * z - Math.sin(ry) * x];
    S.add(new THREE.BoxGeometry(W - 0.006, Hh - 0.008, D - 0.012), paper, sling, at, [0, ry, 0]);
    for (const z of [D / 2 - 0.004, -D / 2 + 0.004]) S.add(new THREE.BoxGeometry(W, Hh, 0.008), tome, sling, place(0, 0, z), [0, ry, 0]);
    S.add(new THREE.BoxGeometry(0.01, Hh, D), tome, sling, place(-W / 2, 0, 0), [0, ry, 0]);
    for (const cx of [1, -1]) for (const cy of [1, -1]) S.add(new THREE.BoxGeometry(0.022, 0.022, 0.01), brass, sling, place(cx * (W / 2 - 0.009), cy * (Hh / 2 - 0.009), D / 2), [0, ry, 0]);
    S.add(disc(0.026, 0.006), goldE, sling, place(0, 0, D / 2 + 0.003), [0, ry, 0]);
    S.add(gemGeo(0.012), stone, sling, place(0, 0, D / 2 + 0.008), [0, ry, 0]);
    S.add(new THREE.OctahedronGeometry(0.016, 0), brass, sling, place(W / 2 - 0.02, -Hh / 2 - 0.04, D / 2), [0, ry, 0], [0.7, 1.6, 0.7]);
    S.add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 4), brass, sling, place(W / 2 - 0.02, -Hh / 2 - 0.012, D / 2), [0, ry, 0]);
    // the chain: links turned alternately, sagging from the slung belt to the book's top corner
    const a0 = V(0.235, -0.03, 0.09), a1 = V(...place(W / 2 - 0.01, Hh / 2, D / 2));
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const t = k / n, p = a0.clone().lerp(a1, t);
      p.y -= 0.035 * Math.sin(t * Math.PI);
      const link = new THREE.TorusGeometry(0.009, 0.0024, 5, 10).scale(1, 1.5, 1);
      S.add(link, brass, sling, p.toArray(), [0, k % 2 ? Math.PI / 2 : 0, 0.3]);
    }
  }

  // --- skirts: the coat to below the knee, split up the front, brass at its hem, its front panels hanging either side of
  // the split, and the charcoal underskirts showing between them
  const under = new Skirt({ r0: 0.19, r1: 0.28, len: 0.7, depth: 0.84, folds: 13, foldAmp: 0.05, rows: 10, hem: (a) => -0.6 * Math.exp(-((a / 0.32) ** 4)) + 0.02 * Math.sin(a * 5) });
  const over = new Skirt({ r0: 0.2, r1: 0.31, len: 0.74, depth: 0.84, folds: 15, foldAmp: 0.065, rows: 12, trim: 0.03, hem: (a) => -0.74 * Math.exp(-((a / 0.4) ** 4)) + 0.03 * (1 - Math.cos(a)) * 0.5, layer: 0.015 });
  const skirts: THREE.Mesh[] = [];
  for (const [sk, mats] of [[under, [charcoal]], [over, [coat, brass]], [over, [lining, brass]]] as const) {
    const m = new THREE.Mesh(sk.geo, mats.length > 1 ? [...mats] : mats[0]);
    m.position.y = 0.03; m.castShadow = m.receiveShadow = true;
    j.hips.add(m); skirts.push(m);
  }
  // (without the coat the waistcoat's skirt, short over the hips)
  const short = new Skirt({ r0: 0.19, r1: 0.215, len: 0.14, depth: 0.82, folds: 5, foldAmp: 0.02, rows: 4, hem: (a) => 0.04 * Math.max(0, Math.cos(a)) ** 3 });
  const tunicSkirt = new THREE.Mesh(short.geo, charcoal);
  tunicSkirt.position.y = 0.03; tunicSkirt.castShadow = tunicSkirt.receiveShadow = true;
  j.hips.add(tunicSkirt);
  const legs = new LegIK(j);
  /** smooths every cut between poses: an action starting, restarting or ending */
  const fade = new PoseFade(j);
  let lastName = '', lastK = 1;
  let tailName = '', tailT = 0;
  /** a staff shot's kick, 1 as it leaves, dying away */
  let recoil = 0;
  /** no cloth sleeves: the shirt's are rolled up */
  const cloths: BellCloth[] = [];
  // what the skirts keep clear of, in their own space (all of them hang where the tunic's does): the thighs from the hip and
  // the shins over the boots from inside, the hands from outside; the breeches' and the boots' radii (the boot's cuff and its
  // stone stand 10 cm off the shin: sized to the breeches, the shin came through the robe there) and the cloth's gap (with a
  // little over for the flat triangles between its points)
  const legBodies = new SkirtLimbs(), handBodies = new SkirtLimbs(), GAP = 0.018, O = () => new THREE.Vector3();
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    legBodies.add([th, O()], [kn, O()], 0.09 + GAP, 0.07 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.1 + GAP, 0.085 + GAP);
  }
  // (each hand as capsules from its own joints, with a little over for the cloth's flat triangles between its points)
  const segsL = handCapsules(handL), HAND_GAP = 0.012;
  for (const [a, b, r] of [...segsL, ...handCapsules(handR)]) handBodies.add(a, b, r + HAND_GAP);
  // (and the free forearm's lower half, as wide as its bracer's cuff or its sleeve's at the wrist: it hangs by the hip)
  const fore = handBodies.add([j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [j.handL, O()], 0), cuffR = () => (gloved ? 0.074 : 0.05);
  // (the legs placed first: the free arm is kept off the thigh before the hands are)
  const placeBodies = () => {
    fore.ra = cuffR() - 0.012 + HAND_GAP; fore.rb = cuffR() + HAND_GAP;
    handBodies.place(tunicSkirt);
  };
  // (the free arm swung out just enough to keep its hand and its cuff off the thigh and the cloth over it: armOffThigh)
  const handPts = [...segsL.flatMap(([a, b, r]) => [[a, r], [b, r]] as [JointPoint, number][]), [[j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], 0], [[j.handL, new THREE.Vector3()], 0]] as [JointPoint, number][];
  const clearThigh = () => {
    const n = handPts.length;
    handPts[n - 2][1] = cuffR() - 0.012; handPts[n - 1][1] = cuffR();
    armOffThigh(tunicSkirt, j.shoulderL, 1, legBodies.list[0], HAND_GAP + (robed ? 0.015 : 0), handPts);
  };
  const flaps: { g: THREE.Group; knee: THREE.Group; a: number; len: number; w: number }[] = [];
  const hang = (a: number, w: number, len: number, mat: THREE.Material, hemPx: number, texH: number, lift: number) => {
    const g = joint(j.hips, Math.sin(a) * (0.21 + lift), 0.04, Math.cos(a) * (0.175 + lift));
    g.rotation.order = 'YXZ'; g.rotation.y = a;
    // (bending halfway down, where a raised knee lifts the robe under it: the lower half hangs on from there)
    const knee = joint(g, 0, -len / 2, 0);
    const cut = len * (hemPx / texH);
    const pf: SurfaceFn = (u, v, out) => { const yb = -len + cut * Math.abs(2 * u - 1); return out.set((u - 0.5) * w, lerp(yb, 0, v), 0.012 * Math.sin(u * Math.PI)); };
    const f = new Sculpt();
    f.skin(plate(pf, 8, 14, 0, (u, v) => { const yb = -len + cut * Math.abs(2 * u - 1); return [u, 1 + lerp(yb, 0, v) / len]; }), mat, g, knee, len / 2 - 0.06, len / 2 + 0.06);
    f.build();
    flaps.push({ g, knee, a, len, w });
  };
  // (each half of a panel swung out at least as far as the robe under it, a little clear of it: the robe lies over a raised
  // knee, and swung by the thighs' angles alone a panel hung behind it; in one piece, laid along the robe over a knee raised at
  // a run it stood straight out. `swing` its own swing, both halves' angles from straight down in its pivot's frame turned to
  // face out; the upper from a hand's breadth down it, as cloth bends over what is just under its top)
  const overRobe = (f: (typeof flaps)[number], swing: number): [number, number] => {
    const P = (over.geo.attributes.position as THREE.BufferAttribute).array as Float32Array, c = Math.cos(f.a), sn = Math.sin(f.a), hw = f.w / 2 + 0.02, o = f.g.position, h = f.len / 2;
    // (only the robe's columns round the panel's own angle: its seam at the front, the first column's angle 0)
    const C = over.cols, span = Math.ceil(((hw / 0.2) / TAU) * (C - 1)) + 1, i0 = Math.round((((f.a / TAU) % 1 + 1) % 1) * (C - 1));
    const fit = (ay: number, az: number, near: number, far: number, from: number): number => {
      let need = from;
      for (let di = -span; di <= span; di++) for (let k = (((i0 + di) % (C - 1)) + C - 1) % (C - 1) * 3; k < P.length; k += C * 3) {
        const dx = P[k] - o.x, dz = P[k + 2] - o.z, x = dx * c - dz * sn;
        const y = P[k + 1] + 0.03 - o.y - ay, z = dx * sn + dz * c - az, d = Math.sqrt(y * y + z * z);
        if (y > 0 || Math.abs(x) > hw || d > far || d < near) continue;
        need = Math.max(need, Math.atan2(z, -y) + 0.012 / Math.max(d, 0.05));
      }
      return need;
    };
    const up = Math.min(fit(0, 0, 0.15, h, swing), swing + 1);
    return [up, Math.min(fit(-h * Math.cos(up), h * Math.sin(up), 0, h, swing), swing + 1)];
  };
  void hang; void panel;

  // --- the head: face, a full beard, hair, and a wide-brimmed pointed hat (worn with a head item equipped: setGear), its
  // crown bent back by its own weight, a gold band with a stone
  const head = buildHead(j.head, kit, 'mage', { hair: 'short', crop: true });
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, 'mage', j.P.neckL, j.head);
  const hat = new THREE.Group(); hat.name = 'hat'; head.group.add(hat); hat.visible = false;
  {
    // sized to the head (mm, see head.ts): the band round the brow above the ears, over the hair
    const w = new Sculpt(), hg = hat, M = HEAD_MM, at = toGroup(0, 168, -9), tilt: [number, number, number] = [-0.12, 0, 0];
    const RX = 86, DZ = 1.2;
    const brim = lathe(([[RX, 4], [120, 0], [160, -9], [194, -24], [205, -30], [202, -34], [180, -21], [140, -10], [100, -5], [RX, -4]] as [number, number][]).map(([r, y]) => [r * M, y * M]), 40);
    const q = brim.attributes.position;
    // a gentle wave round the brim, dipping at the front and back
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), z = q.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z); q.setY(i, q.getY(i) - (r - RX * M) * (0.12 * Math.cos(2 * a) + 0.05 * Math.sin(a * 5))); }
    brim.computeVertexNormals();
    w.add(scaleUV(brim, 3, 1), felt, hg, at.toArray(), tilt, [1, 1, DZ]);
    w.add(scaleUV(brim.clone(), 3, 1), lining, hg, [at.x, at.y - 0.002, at.z], tilt, [1, 1, DZ]);
    // the crown: tapering up from the band, bent back by its own weight
    const crown: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; crown.push(V(10 * M * Math.sin(t * 4), (t * 300 - t * t * 50) * M, -140 * M * t ** 2.2)); }
    const cg = taperTube(crown, (t) => (RX * M * (1 - t) ** 0.9 + 0.004) * (1 + 0.04 * Math.sin(t * 20)), lod(24, 10), lod(24, 12));
    w.add(scaleUV(cg, 3, 3), felt, hg, at.toArray(), tilt, [1, 1, DZ]);
    // a leather band with gold edges, a gold diamond set with a stone at the front
    const band = (y: number, wd: number, k = 0) => belt((RX + 2 + k) * M, (RX + 2 + k) * M * DZ, y * M, wd * M, 4 * M, 0.004, 28);
    w.add(band(14, 24), leather, hg, at.toArray(), tilt);
    for (const y of [3, 25]) w.add(band(y, 4, 1.5), gold, hg, at.toArray(), tilt);
    const front = V(0, 14 * M, (RX + 6) * M * DZ).applyEuler(new THREE.Euler(...tilt)).add(at);
    w.add(buckle(0.024, 0.02, 0.004), brass, hg, front.toArray(), tilt);
    w.build();
  }

  // --- staff (right hand): a thick gnarled haft bound in engraved gold, its head two gold prongs curving up round a
  // floating crystal
  // turned in the fist so it stands up out of the forward-reaching forearm, the orb up and ahead.
  // Held GRIP up the haft from its foot (less its length below the hand): standing, its foot comes down to the floor
  // beside his right foot and the crystal rides over his head, as the sheet's (gripped higher, its foot stood 25 cm into
  // the floor); aimed, the crystal is level with a foe's chest, so the bolts fly at the foes, not over them.
  const staff = joint(j.handR, 0, -0.05, 0.02);
  const STAFF_PITCH = 1.25, STAFF_R = 0.026;
  staff.rotation.x = STAFF_PITCH;
  const GRIP = 0.44;
  {
    const w = new Sculpt(), pts: THREE.Vector3[] = [];
    // (the haft wandering a little and knotted along its length, its grain twisted round it)
    for (let k = 0; k <= 20; k++) { const y = -0.52 - GRIP + k * 0.088; pts.push(V(Math.sin(k * 0.9) * 0.003, y, Math.cos(k * 1.3) * 0.003)); }
    const knots = (t: number) => 1 + 0.1 * Math.sin(t * 46) + 0.12 * Math.exp(-(((t - 0.33) / 0.02) ** 2)) + 0.14 * Math.exp(-(((t - 0.71) / 0.025) ** 2));
    const haft = taperTube(pts, (t) => 0.033 * (1 - t * 0.15) * knots(t), lod(80, 30), lod(12, 8)), hq = haft.attributes.position;
    for (let i = 0; i < hq.count; i++) {
      const x = hq.getX(i), y = hq.getY(i), z = hq.getZ(i), a = Math.atan2(x, z);
      const k = 1 + 0.06 * Math.sin(a * 5 + y * 9) + 0.03 * Math.sin(a * 9 - y * 23);
      hq.setXYZ(i, x * k, y, z * k);
    }
    haft.computeVertexNormals();
    w.add(scaleUV(haft, 2, 8), wood, staff);
    // engraved gold bands, a pair at the hand and singles along it, a gold ferrule at the foot
    for (const y of [-0.47, 0.02, 0.1, 0.62, 0.96, 1.02]) {
      const ring = lathe([[0.036, -0.022], [0.04, -0.016], [0.04, 0.016], [0.036, 0.022]], lod(20, 12));
      projectUV(ring, steelRegion('chest'), (x, y, z) => [Math.atan2(x, z) / TAU + 0.5, 0.4 + (y + 0.022) / 0.044 * 0.2]);
      w.add(ring, goldE, staff, [0, y - GRIP, 0]);
    }
    w.add(lathe([[0.004, -0.13], [0.026, -0.1], [0.035, -0.03], [0.036, 0]], 12), gold, staff, [0, -0.52 - GRIP, 0]);
    // the head: a gold collar, then two prongs rising out of it, bowed out round the crystal and in again over it, the
    // one's tip curling past the other's (the sheet's; three thin curls read as wire)
    w.add(lathe([[0.034, 0], [0.046, 0.02], [0.042, 0.05], [0.03, 0.07]], 16), gold, staff, [0, 1.06 - GRIP, 0]);
    for (const p of [1, -1]) {
      const prong: THREE.Vector3[] = [];
      for (let q = 0; q <= 14; q++) {
        const t = q / 14, out = Math.sin(t * Math.PI) ** 0.85 * 0.1 + 0.018 * (1 - t) ** 2;
        prong.push(V(p * out, 1.11 - GRIP + t * 0.42, 0.012 * Math.sin(t * Math.PI) * p));
      }
      w.add(taperTube(prong, (t) => 0.028 * (1 - t * 0.8), 28, 10), gold, staff);
    }
    w.build();
  }
  const tip = joint(staff, 0, 1.36 - GRIP, 0);
  const crystal = part(new THREE.OctahedronGeometry(0.095, 0).scale(0.75, 1.6, 0.75), gem, tip);
  crystal.castShadow = false;
  const ringA = part(new THREE.TorusGeometry(0.14, 0.004, 4, 32), glow, tip);
  const ringB = part(new THREE.TorusGeometry(0.11, 0.004, 4, 32), glow, tip);
  ringA.castShadow = ringB.castShadow = false;

  // offhand focus point (left palm)
  const palm = joint(j.handL, 0, -0.08, 0.03);
  S.build();
  const robeParts = A.build(), tunic = T.build(), bracers = H.build();
  // (robed until setGear says otherwise)
  let robed = true, gloved = true;
  for (const o of [...tunic, tunicSkirt]) o.visible = false;

  /** set once a channel's opening completes, for the thrust into the portal */
  let openedAt = -1;
  /** staff shots: how far the staff is lowered at the target (0..1), and when the last shot was */
  let aim = 0, aimV = 0, aimedAt = -9;
  /** how long after a shot the staff stays down */
  const AIM_HOLD = 1.2;
  /** seen through its own eyes (entities/viewModel.ts); per gesture, how far the free hand moves (chest
   *  space: x left, y up, z forward) as the gesture plays */
  let fp = false;
  /** the staff arm through the eyes: added to its shoulder (pitch, roll, yaw), and pitch undone while casting */
  const FP_STAFF = [0.1, -0.3, -0.2, 0.6];
  const FP_POSE: Record<string, number[]> = { cast: [-0.2, 0.35, 0.12], summon: [-0.2, 0.35, 0.12], channel: [0.5, 0.12, -0.1], buff: [-0.25, 0.05, 0.15] };
  /** where the free arm's elbow points when it reaches (out to the left, down and back) */
  const POLE_L = V(1, -0.7, -0.6);
  /** the crystal's casting glow, eased: a held stream of casts keeps it up instead of flashing each one */
  let charged = 0;

  const root = j.root;
  root.scale.setScalar(1.08);

  const shY = j.shoulderL.position.y;
  // the healing draught, in the free fist while it is drunk
  const flask = buildFlask(kit, gold, leather); flask.name = 'flask'; j.handL.add(flask); flask.position.set(0, -0.07, 0.03); flask.rotation.x = Math.PI;
  let flaskOut = 0;
  let feet: readonly number[] | null = null;

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;

    // base stance: staff held at the side, slightly forward
    idle(j, t, 1 - move * 0.6);
    // at rest: the weight on one leg, the other easy (the hips tipping and the shoulders answering them),
    // shifting slowly from foot to foot, leaning a little on the staff; the free hand drifts and the head wanders
    if (!fp) {
      const amt = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.45) + 0.3 * Math.sin(t * 1.07 + 2), br = Math.sin(t * 1.8);
      j.body.position.x += 0.025 * sway * amt; j.hips.rotation.z += 0.055 * sway * amt; j.spine.rotation.z += -0.035 * sway * amt - 0.03 * amt; j.neck.rotation.z += -0.025 * sway * amt;
      j.hips.rotation.y += -0.12 * amt; j.chest.rotation.y += 0.08 * amt;
      j.neck.rotation.y += 0.12 * Math.sin(t * 0.31) * amt; j.neck.rotation.x += 0.04 * Math.sin(t * 0.53 + 1) * amt;
      j.shoulderL.rotation.x += (-0.15 + 0.05 * Math.sin(t * 0.6)) * amt; j.elbowL.rotation.x += -0.35 * amt;
      j.shoulderL.position.y = j.shoulderR.position.y = shY + 0.006 * br * amt;
    }
    // (the free arm pumps at a run as a runner's does; the staff arm carries the staff, swinging less than at a walk: pumped,
    // the staff swung from upright to level behind him at every stride)
    // (its elbow held as it comes forward: bent more there, as a walk's is, it cancelled the shoulder's swing and the staff
    // bobbed 25 cm up and down at each stride)
    const staffSwing = 0.35 * (1 - 0.45 * runShareOf(move)), staffElbow = 1 - runShareOf(move);
    walkCycle(j, st.phase, move, { stride: 0.5, knee: 0.95, arm: staffSwing, armL: 0.35, bob: 0.07, dir, run: true, pump: 0, pumpL: 1, elbowSwing: staffElbow, elbowSwingL: 1 });
    // (and at a run bent further, the staff carried higher: hanging as at a walk, its foot met the ground behind him at
    // the back of each swing)
    const staffRun = fp ? 0 : runShareOf(move);
    j.shoulderR.rotation.x += -0.35 - 0.1 * staffRun; j.shoulderR.rotation.z += -0.12; j.elbowR.rotation.x += -0.55 - 0.45 * staffRun;
    // (the trunk a little forward over the stride, the head held up against it: the leg IK leans the whole body into the
    // speed, and at 0.12 more the trunk leant 16 degrees at a run, a runner's 11, the face to the ground)
    j.spine.rotation.x += move * 0.06 * dir; j.neck.rotation.x -= move * 0.06 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;

    // hands at rest: the free one loosely curled and breathing, the other gripping the staff
    poseHand(handL, 0.45 + Math.sin(t * 1.3) * 0.06, 0.12);
    const raw = st.action;
    feet = null;
    let flaskWant = 0, drinkLift = 0;
    // (the tail: the last spell's end pose held a moment after it, unless the body moves off or another action starts)
    if (!raw && lastName !== '' && (TAIL[lastName] ?? 0) > 0 && !fp) { tailName = lastName; tailT = TAIL[lastName]; }
    if (raw || move > 0.3) { if (tailT > 0 && !raw) fade.cut(0.25); tailT = 0; }
    const inTail = !raw && tailT > 0;
    if (inTail) { tailT -= dt; if (tailT <= 0) fade.cut(TAIL_OUT[tailName] ?? 0.4); }
    const a: ActionState | null = raw ?? (inTail ? { name: tailName, t: 1 } : null);
    const began = !!raw && (raw.name !== lastName || raw.t < lastK - 0.2), ended = !raw && lastName !== '';
    if (began) fade.cut(raw.name === 'point' && lastName === 'point' ? 0.06 : 0.14); else if (ended && !inTail) fade.cut(lastName === 'point' ? 0.2 : 0.35);
    if (began && raw.name === 'point') recoil = 1;
    recoil = Math.max(0, recoil - dt * 6);
    lastName = raw?.name ?? ''; lastK = raw?.t ?? 1;
    if (!a || a.name !== 'channel') openedAt = -1;
    // staff shots: the staff swings down level with the target and stays there while the shots keep
    // coming (a held button, or clicks), so each bolt leaves the crystal at a foe's chest; it rises
    // once they stop for a while. A spring, so it starts and stops moving gently (an ease that starts
    // at full speed jerks the staff down at each first shot): quick to lower, slow to rise
    if (a?.name === 'point') aimedAt = t;
    const down = t - aimedAt < AIM_HOLD, w0 = down ? 14 : 5;
    aimV += (w0 * w0 * ((down ? 1 : 0) - aim) - 2 * w0 * aimV) * Math.min(dt, 0.05);
    aim = clamp(aim + aimV * Math.min(dt, 0.05), 0, 1);
    j.shoulderR.rotation.x += -0.3 * aim; j.elbowR.rotation.x += 0.15 * aim; j.spine.rotation.x += 0.12 * aim;
    // (the staff side turned to the foe, the weight forward behind it; each shot kicks the staff and the chest back)
    if (!fp) {
      const rc = recoil * recoil;
      j.hips.rotation.y += 0.18 * aim; j.chest.rotation.y += 0.22 * aim - 0.06 * rc; j.neck.rotation.y += -0.3 * aim;
      j.body.position.z += (0.03 * aim - 0.025 * rc) * (1 - move); j.spine.rotation.x += -0.07 * rc; j.shoulderR.rotation.x += -0.12 * rc;
      if (aim > 0.3) feet = AIM_FEET;
    }
    // (aimed straight along the shot: angled out to keep its haft out of the cape the heroes wore, it went 9 cm
    // through his own sleeve)
    staff.rotation.x = STAFF_PITCH + 1.75 * aim;
    // (the haft sits in the fist, the hand on its wrist)
    seat(handR, staff, STAFF_R);
    if (a) {
      const k = a.t;
      if (a.name === 'cast' && !fp) {
        const w = ramp(k, 0, 0.2);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, curve(CA_ARM_X, k), w); j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, curve(CA_ARM_Z, k), w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, curve(CA_ELBOW, k), w);
        // the staff arm draws back against the throw
        j.shoulderR.rotation.x += (-0.25 * ramp(k, 0, 0.45) + 0.45 * ramp(k, 0.5, 0.65)) * w;
        const ch = curve(CA_CHEST, k), b = curve(CA_BEND, k);
        j.chest.rotation.y += ch * w; j.hips.rotation.y += curve(CA_HIPS, k) * w; j.neck.rotation.y -= 0.6 * ch * w;
        j.spine.rotation.x += b * w; j.neck.rotation.x -= 0.4 * b * w;
        j.body.position.z += curve(CA_FWD, k) * w * (1 - move * 0.6); j.body.position.y += -0.03 * ramp(k, 0.5, 0.65) * w;
        // the hand gathers into a claw, then flicks open as the spell leaves it
        const gather = pulse(k, 0, 0.55), release = ramp(k, 0.5, 0.62) * (1 - ramp(k, 0.85, 1) * 0.5);
        j.handL.rotation.x += -0.6 * gather - 0.9 * release;
        poseHand(handL, 0.35 + 0.6 * gather - 0.35 * release, 0.1 + 0.5 * release);
        feet = CAST_FEET;
      } else if (a.name === 'cast' || (a.name === 'summon' && fp)) {
        // (through the eyes: Starfall plays the cast's gesture, placed in the view)
        const w = pulse(k, 0, 1);
        j.shoulderR.rotation.x += -1.05 * w; j.elbowR.rotation.x += 0.45 * w;
        j.shoulderL.rotation.x += -1.2 * w; j.shoulderL.rotation.z += 0.25 * w; j.elbowL.rotation.x += -0.2 * w;
        j.chest.rotation.y += 0.35 * w; j.spine.rotation.x += 0.12 * w;
        // the hand gathers into a claw, then flicks open as the spell leaves it
        const gather = pulse(k, 0, 0.5), release = ramp(k, 0.4, 0.6) * (1 - ramp(k, 0.75, 1));
        j.handL.rotation.x += -0.5 * gather - 0.9 * release;
        poseHand(handL, 0.35 + 0.6 * gather - 0.35 * release, 0.1 + 0.5 * release);
      } else if (a.name === 'channel') {
        const open = a.open ?? 1, time = a.time ?? 0;
        const up = ramp(time, 0, 0.18);
        if (open < 1) {
          // drawing the portal: two fingers out, the hand traces the circle with its spark (one turn
          // by 0.7 of the opening), then draws back to gather for the thrust
          openedAt = -1;
          const trace = Math.min(1, open / 0.7), ang = trace * TAU, draw = 1 - ramp(open, 0.7, 0.85);
          const gather = ramp(open, 0.72, 1);
          j.shoulderL.rotation.x += (-1.2 - Math.cos(ang) * 0.3 * draw + 0.25 * gather) * up;
          j.shoulderL.rotation.z += (-Math.sin(ang) * 0.32 * draw - 0.12) * up;
          j.elbowL.rotation.x += (-0.35 - 0.7 * gather) * up;
          j.handL.rotation.x += (-0.4 + 0.3 * gather) * up;
          poseHand(handL, 0.15 + gather * 0.9, 0.05, draw * (1 - gather));
          // the free shoulder leads (a turn of the chest brings it forward)
          j.chest.rotation.y += -0.15 * up - 0.1 * gather; j.spine.rotation.x += 0.08 * up;
          j.neck.rotation.x += 0.1 * up;
          j.shoulderR.rotation.x += -0.5 * up; j.elbowR.rotation.x += -0.2 * up;
        } else {
          // the thrust: palm driven into the portal, a recoil as the lance bursts out, then braced
          if (openedAt < 0) openedAt = time;
          const ft = time - openedAt, kick = Math.exp(-ft * 9) * ramp(ft, 0, 0.04), tr = Math.sin(t * 40) * 0.02;
          const sway = Math.sin(t * 2.3) * 0.04;
          j.shoulderL.rotation.x += -1.45 + tr + kick * 0.3 + sway * 0.5; j.shoulderL.rotation.z += -0.4 + sway * 0.4; j.elbowL.rotation.x += 0.05 - kick * 0.4;
          // the wrist bent back so the palm faces the portal, fingers spread and straining
          j.handL.rotation.x += -1.25 + kick * 0.3;
          poseHand(handL, 0.1 + kick * 0.3, 0.6, 0, t, 0.04);
          j.shoulderR.rotation.x += -0.9; j.elbowR.rotation.x += 0.2;
          j.chest.rotation.y += -0.25; j.spine.rotation.x += 0.15 - kick * 0.12;
          j.body.position.z += -kick * 0.05;
          // (braced: the left foot forward, low, the weight leaning into the portal)
          if (!fp) { j.body.position.z += 0.05; j.body.position.y += -0.06; j.hips.rotation.y += -0.15; j.spine.rotation.x += 0.06; feet = LANCE_FEET; }
        }
      } else if (a.name === 'drink' && !fp) {
        // the healing draught: taken from the belt and drunk (models/flask.ts)
        flaskWant = drink(j, k, mouth, DRINK); drinkLift = drinkUp(k);
      } else if (a.name === 'summon' && !fp) {
        const w = ramp(k, 0, 0.15), rise = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.62)), pull = ramp(k, 0.5, 0.62);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, curve(SU_ARM_X, k), w); j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, curve(SU_ARM_Z, k), w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, curve(SU_ELBOW, k), w);
        // the staff rises with the reach, and comes down level as the stars are called
        j.shoulderR.rotation.x += (-0.5 * rise - 0.15 * pull) * w;
        const b = curve(SU_BEND, k);
        j.spine.rotation.x += b * w; j.neck.rotation.x += curve(SU_LOOK, k) * w; j.chest.rotation.y += (0.1 * rise - 0.2 * pull) * w;
        j.body.position.y += curve(SU_DIP, k) * w; j.body.position.z += curve(SU_FWD, k) * w * (1 - move * 0.6);
        // the palm open to the sky, then clawing the stars down
        j.handL.rotation.x += -0.4 * rise - 0.8 * pull;
        poseHand(handL, 0.15 + 0.7 * pull * (1 - ramp(k, 0.75, 1) * 0.6), 0.5 * rise + 0.2);
        feet = CAST_FEET;
      } else if (a.name === 'slam' && !fp) {
        const w = ramp(k, 0, 0.15), arms = curve(SL_ARMS, k), sp = curve(SL_SPREAD, k), b = curve(SL_BEND, k), down = ramp(k, 0.5, 0.64);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, arms, w); j.shoulderR.rotation.x = lerp(j.shoulderR.rotation.x, arms + 0.3 * (1 - down), w);
        j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, sp, w); j.shoulderR.rotation.z = lerp(j.shoulderR.rotation.z, -sp, w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -0.25 - 0.3 * (1 - down), w); j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -0.35, w);
        j.spine.rotation.x += b * w; j.neck.rotation.x -= 0.45 * b * w; j.body.position.y += curve(SL_DIP, k) * w;
        // fists raised, then splayed hands driven down
        poseHand(handL, 0.45 + 0.95 * (1 - down) * ramp(k, 0, 0.4) - 0.4 * down, 0.12 + 0.5 * down);
        feet = SLAM_FEET;
      } else if (a.name === 'slam') {
        const up = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.7));
        const down = ramp(k, 0.5, 0.7) * (1 - ramp(k, 0.8, 1));
        j.shoulderL.rotation.x += -2.7 * up - 0.6 * down; j.shoulderR.rotation.x += -2.4 * up - 0.6 * down;
        j.shoulderL.rotation.z += 0.3 * up; j.shoulderR.rotation.z += -0.3 * up;
        j.body.position.y += -0.16 * down; j.kneeL.rotation.x += 0.5 * down; j.kneeR.rotation.x += 0.5 * down;
        j.thighL.rotation.x += -0.35 * down; j.thighR.rotation.x += -0.35 * down;
        j.spine.rotation.x += 0.35 * down - 0.15 * up;
        // fists raised, then splayed hands driven down
        poseHand(handL, 0.45 + 0.95 * up - 0.4 * down, 0.12 + 0.5 * down);
      } else if (a.name === 'buff') {
        // (raised and held: the fade out of it is slow)
        const w = fp ? pulse(k, 0, 1) : Math.sin(Math.min(1, k * 1.4) * Math.PI / 2);
        if (!fp) { j.spine.rotation.x += -0.08 * w; j.chest.rotation.y += -0.15 * w; j.body.position.y += 0.015 * w; }
        j.shoulderL.rotation.x += -1.6 * w; j.shoulderL.rotation.z += 0.8 * w;
        j.shoulderR.rotation.x += -0.8 * w; j.shoulderR.rotation.z += -0.6 * w;
        j.neck.rotation.x += -0.3 * w;
        // palm up and open, fingers spread to the ward
        j.handL.rotation.x += -0.6 * w;
        poseHand(handL, 0.45 - 0.35 * w, 0.12 + 0.45 * w);
      }
    }
    // through the eyes the free hand's gestures play higher and to the left, where they're seen but leave
    // the middle of the view clear (as posed, they pass low in its corner or right through its middle):
    // the hand keeps its motion, shifted in the chest's space, and the arm reaches it
    // and the staff is held out to the right, its crystal clear of the middle; the cast's raise of the
    // staff arm is kept down
    if (fp) {
      const S = FP_STAFF, c = a?.name === 'cast' || a?.name === 'summon' ? pulse(a.t, 0, 1) : 0;
      j.shoulderR.rotation.x += S[0] + S[3] * c; j.shoulderR.rotation.z += S[1]; j.shoulderR.rotation.y += S[2];
    }
    const shift = fp && a ? FP_POSE[a.name] : undefined;
    if (shift) {
      const w = a!.name === 'channel' ? ramp(a!.time ?? 0, 0, 0.18) : pulse(a!.t, 0, 1);
      root.updateMatrixWorld(true);
      j.chest.worldToLocal(j.handL.getWorldPosition(_hp));
      _hp.x += shift[0] * w; _hp.y += shift[1] * w; _hp.z += shift[2] * w;
      reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _hp, POLE_L);
    }
    if (!fp && !(a && FREE_HAND.has(a.name))) j.handL.rotation.y += HAND_HANG;
    if (st.hit > 0) { j.spine.rotation.x += -0.25 * st.hit; j.neck.rotation.x += -0.2 * st.hit; }
    if (st.dead < 0) fade.apply(dt); else fade.reset();
    st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead, -1); legs.reset(); }
    else {
      // the legs: planted feet, a pelvis that follows them (ik.ts); then a crouch bends the knees instead of sinking the feet
      if (!fp) legs.captureArms();
      const F = feet ?? REST_FEET;
      legs.stance(0, F[0], F[1], F[2]); legs.stance(1, F[3], F[4], F[5]);
      legs.update(dt, st.phase, st.dead, 1, fp ? 0 : 1);
      groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }

    // the skirts swing with the legs; the panels hanging over them follow the leg on their side
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    root.updateMatrixWorld(true);
    legBodies.place(tunicSkirt);
    if (!fp && st.dead < 0) clearThigh();
    // every arm within a body's ranges, each hand where the pose put it (armIK.ts)
    let slant = 0;
    if (!fp && st.dead < 0) { fitArm(j, true, undefined, body); slant = fitArm(j, false, gripTurn(handR, staff, _vr), body, SLANT).slant; }
    // (the haft seated in the fist as the hand holds it, diagonal across the palm by the slant the arm took)
    seat(handR, staff, STAFF_R, slant);
    placeBodies();
    // (the hands only against the outer skirt: pushed in, the inner one would come out over it)
    if (robed) { under.update(fL, fR, move, t, dt, legBodies.list); over.update(fL, fR, move, t + 0.4, dt, legBodies.list, handBodies.list); }
    else short.update(fL, fR, move, t, dt, legBodies.list, handBodies.list);
    for (const f of flaps) {
      const wl = clamp(0.5 + Math.sin(f.a) * 0.9, 0, 1);
      const out = Math.max(-0.05, (fL * wl + fR * (1 - wl)) * Math.cos(f.a)) * 0.85 + 0.26 + move * 0.08 + Math.sin(t * 3 + f.a * 3) * 0.015;
      const [up, low] = robed ? overRobe(f, out) : [out, out];
      f.g.rotation.x = -up; f.knee.rotation.x = up - low;
    }

    // the flask comes out of the fist and is put away again (the fist closed round it)
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (flaskOut > 0.01) poseHand(handL, lerp(0.45, 1.1, flaskOut), 0.08 + 0.04 * (1 - flaskOut));
    void drinkLift;
    // the right hand closes round the staff wherever the arm has taken it
    root.updateMatrixWorld(true);
    hold(handR, _hd.set(0, 1, 0).transformDirection(staff.matrixWorld), STAFF_R, undefined, slant);

    // cloth runs after the pose so it collides with this frame's skeleton
    if (dt > 0 && robed) for (const c of cloths) c.update(dt);

    // staff crystal
    crystal.rotation.y = t * 2.2;
    crystal.position.y = Math.sin(t * 3) * 0.02;
    ringA.rotation.set(t * 1.7, t * 1.1, 0);
    ringB.rotation.set(-t * 1.3, 0, t * 2.1);
    charged = damp(charged, st.charge || 0, 4, dt);
    gem.emissiveIntensity = GEM_GLOW * (1 + charged * 0.6 + Math.sin(t * 6) * 0.08);
  }

  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, palm, height: 2.0,
    cloths,
    setGear: (gear: Gear) => {
      hat.visible = gear.helm;
      // the robe or the tunic: the bell sleeves (cloth, put back on the arms when the robe is), the skirts
      if (gear.chest !== robed) {
        robed = gear.chest;
        if (robed) for (const c of cloths) c.reset();
      }
      for (const o of [...robeParts, ...skirts, ...flaps.map((f) => f.g), ...cloths.flatMap((c) => c.meshes)]) o.visible = robed;
      for (const o of [...tunic, tunicSkirt]) o.visible = !robed;
      sling.scale.set(robed ? 1 : SLUNG_IN, 1, robed ? 1 : SLUNG_IN);
      gloved = gear.hands;
      for (const o of bracers) o.visible = gear.hands;
      bare(handL, !gear.hands); bare(handR, !gear.hands);
    },
    reset: () => { legs.reset(); fade.reset(); for (const c of cloths) c.reset(); },
    firstPerson: (on) => { fp = on; },
    dispose() {
      kit.dispose();
      disposeGeometries(root);
    },
  };
}
