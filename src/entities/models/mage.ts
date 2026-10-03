// The Mage: the same bare-headed man in layered navy and teal robes, the hood down in a cowl round
// the neck, gold-trimmed and embroidered with arcane signs, long bell sleeves, black-and-gold spiked
// pauldrons set with green stones, a wide medallion belt with pouches and charms, strapped boots with
// gold caps, a cape, and a gnarled staff cradling a floating crystal. The robe with its pauldrons, collar flaps and
// brooch is the chest item's, the bracers and gloves the hands item's: without them a plain linen tunic, its
// sleeves (or the robe's) on to the wrists, and bare hands. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, cloth as clothMaps, steel as steelMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, embroidered, arcaneColumn, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, pulse, ramp, groundFeet, reachArm } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, lod, plate, edgeTube, strap, belt, buckle, stud, disc, gem as gemGeo, Skirt, scaleUV, type SurfaceFn } from './armor';
import { buildHead, buildNeck, toGroup, handSkin, HEAD_MM } from './head';
import { buildHand, poseHand, hold, seat, bare } from './hands';
import { clamp, lerp, damp, TAU, mulberry } from '../../util';
import { SkeletonCape, type CapsuleFit } from './cape';
import { BellCloth } from './sleeve';
import { LegIK } from './ik';
import { curve, PoseFade, type Keys } from './motion';
import { buildFlask, drink, drinkUp, type DrinkHold } from './flask';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { ActionState, AnimState, Gear, Model } from '../../types';

const ZERO = new THREE.Vector3();
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Deep navy cape with a gold trim, matching the robes. */
const MAGE_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [24, 30, 50] as const,
  trim: [190, 150, 70] as const,
  sheenColor: 0x1f4d55,
  attachmentColor: 0x1a2030,
  materialName: 'Woven navy mage cape',
});

// the robe's upper body (chest joint space): its half-width (x) at height y, and its depth (z) as a share
// of that: a man's chest (ANSUR II: 29 cm across, 25 deep) with the robe over it, rising to the shoulders
const TORSO: [number, number][] = [[0.145, -0.12], [0.155, -0.02], [0.165, 0.1], [0.168, 0.18], [0.15, 0.245], [0.1, 0.28], [0.075, 0.29]];
const DEPTH = 0.86;
/** the plain linen tunic under the robe (without a chest item), chest joint space (m): at each height its half-width and
 *  half-depth, and how square its section is. Over the shoulders it is as broad as the arms' tops and thin front to back,
 *  the trapezius sloping down from the neck and a deltoid rounding over each shoulder joint down into the armpit (the
 *  robe's round barrel of a body, with the arms' tubes stood beside it under their own round tops, read as a coat hanger) */
const TUNIC_W: Keys = [[-0.12, 0.143], [-0.02, 0.152], [0.1, 0.162], [0.15, 0.18], [0.19, 0.232], [0.215, 0.248], [0.238, 0.24], [0.256, 0.2], [0.274, 0.14], [0.289, 0.095], [0.3, 0.072]];
const TUNIC_D: Keys = [[-0.12, 0.125], [-0.02, 0.133], [0.1, 0.142], [0.16, 0.138], [0.21, 0.118], [0.25, 0.094], [0.275, 0.079], [0.3, 0.068]];
const TUNIC_P: Keys = [[-0.12, 2], [0.12, 2], [0.2, 2.6], [0.26, 2.6], [0.3, 2]];
/** a point on the tunic towards `a` round it (0 the front, +x his left) at height y, `lift` above it */
function onTunic(a: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const X = curve(TUNIC_W, y) + lift, Z = curve(TUNIC_D, y) + lift, e = 2 / curve(TUNIC_P, y), s = Math.sin(a), c = Math.cos(a);
  return out.set(Math.sign(s) * Math.abs(s) ** e * X, y, Math.sign(c) * Math.abs(c) ** e * Z);
}
/** the point on the tunic's front `x` across */
const tunicFront = (x: number, y: number, lift: number) => onTunic(Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the cowl's profile (chest joint space): the hood down, bunched round the neck */
const COWL: [number, number][] = [[0.1, 0.2], [0.155, 0.235], [0.16, 0.27], [0.13, 0.31], [0.095, 0.34], [0.085, 0.36]];
/** the cape over the robe (pinned under the cowl, kept off the skirts: its colliders are built for it) and over the plain
 *  tunic: the neckline's ends on the chest, and its colliders as the tunic changes them. Over the tunic the upper torso
 *  ends lower and the shoulders are slimmer: the robe's reached past the neckline, nearer the neck over the tunic, and the
 *  cape jerked (`SkeletonCape.fit`) */
const CAPE_ROBED: { left: readonly [number, number, number]; right: readonly [number, number, number]; fit: Record<string, CapsuleFit> } = { left: [0.1, 0.3, -0.15], right: [-0.1, 0.3, -0.15], fit: {} };
const CAPE_TUNIC: typeof CAPE_ROBED = {
  left: [0.1, 0.275, -0.115], right: [-0.1, 0.275, -0.115],
  fit: {
    gorget: { radius: 0.12 }, shoulders: { offA: [0.01, -0.04, 0], offB: [-0.01, -0.04, 0], radius: 0.085, depthRadius: 0.125 }, 'upper torso': { offA: [0, 0.12, 0], depthRadius: 0.16 },
    hips: { radius: 0.24, depthRadius: 0.21 }, 'robe skirt': { radius: 0.17, depthRadius: 0.12 },
  },
};
/** the pauldrons' size against the shoulder */
const PAULDRON = 0.72;
function torsoR(y: number): number {
  for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][1]) { const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i]; return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1)); }
  return TORSO[TORSO.length - 1][0];
}
/** a point on the robe's front at x, y, `lift` above it */
function onChest(x: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = torsoR(y), a = Math.asin(clamp(x / r, -1, 1));
  return out.set(Math.sin(a) * (r + lift), y, Math.cos(a) * (r * DEPTH + lift));
}

/** where the feet stand (left x, z, turn, then right), rig units: at rest, throwing a spell (the left steps in), slamming the ground, aiming the staff (the right forward), bracing for the lance */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
const TAIL: Record<string, number> = { cast: 0.35, summon: 0.35, slam: 0.4, buff: 0.5 }, TAIL_OUT: Record<string, number> = { cast: 0.45, summon: 0.45, slam: 0.6, buff: 0.5 };
/** drinking: the flask raised straight up before the chin, the elbow down and forward (the bell sleeve falls back off the forearm) */
const DRINK: DrinkHold = { wrist: new THREE.Vector3(0.03, -0.08, 0.22), tipped: new THREE.Vector3(0.03, 0.1, 0.2), pole: new THREE.Vector3(0.4, -1, 0.5) };
const REST_FEET = [0.12, 0.06, 0.22, -0.12, -0.05, -0.35], CAST_FEET = [0.13, 0.2, 0.15, -0.13, -0.1, -0.45];
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
  const robe = kit.rim({ color: 0x252d48, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x2a3a60, 0.3);
  // the plain tunic under the robe: undyed linen
  const linen = kit.rim({ color: 0x9a8e76, roughness: 1, ...tex(clothMaps(), 1, 0.7) }, 0x6a6050, 0.25);
  const teal = kit.rim({ color: 0x1f5058, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.DoubleSide }, 0x2a6a70, 0.3);
  const lining = kit.rim({ color: 0x184048, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.BackSide }, 0x2a6a70, 0.2);
  const gold = kit.std({ color: 0xc9a14a, metalness: 1, roughness: 1, roughnessMap: pbrMaterialMaps(steelMaps(), 1).roughnessMap });
  const E = engravedSteel();
  const goldE = kit.std({ color: 0xd4ab58, metalness: 1, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap });
  const blackLeather = kit.std({ color: 0x1a1614, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const leather = kit.std({ color: 0x3e281a, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const wood = kit.std({ color: 0x5a3d28, roughness: 1, ...tex(woodMaps(), 1, 1.5) });
  const skinTip = kit.rim({ color: 0xc9957c, roughness: 0.6 }, 0x6a2a1c, 0.25);
  const glow = kit.glow(0x5dffa8, 1.5);
  // the staff's crystal: glowing softly, a little more while casting (animate() sets it each frame)
  const GEM_GLOW = 0.4;
  const gem = kit.phys({ color: 0x2aff9a, emissive: 0x2aff9a, emissiveIntensity: GEM_GLOW, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true });
  // set stones: green, lit from within a little
  const stone = kit.phys({ color: 0x0f7a4a, emissive: 0x1aff8a, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0, clearcoat: 1, flatShading: true });
  // embroidered panels: the long front panel with its column of arcane signs, the teal tails and collar
  const PW = 256, PH = 1024, TW2 = 256, TH2 = 640;
  const panelTex = embroidered(PW, PH, [[0, 0], [PW, 0], [PW, PH - 110], [PW / 2, PH], [0, PH - 110]], [0.13, 0.16, 0.27], [0.85, 0.66, 0.3], arcaneColumn);
  const panel = kit.rim({ color: 0xffffff, roughness: 1, map: panelTex.map, normalMap: panelTex.normalMap, roughnessMap: panelTex.roughnessMap, side: THREE.DoubleSide }, 0x2a3a60, 0.3);
  const tailTex = embroidered(TW2, TH2, [[0, 0], [TW2, 0], [TW2, TH2 - 120], [TW2 / 2, TH2], [0, TH2 - 120]], [0.12, 0.3, 0.33], [0.85, 0.66, 0.3]);
  const tail = kit.rim({ color: 0xffffff, roughness: 1, map: tailTex.map, normalMap: tailTex.normalMap, roughnessMap: tailTex.roughnessMap, side: THREE.DoubleSide }, 0x2a6a70, 0.3);

  const j = buildHumanoid({ skin: robe }, {
    chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41,
  });
  stripRig(j.root);
  const S = new Sculpt();
  // what comes off (setGear): the chest item's (the robe with its pauldrons, collar flaps and brooch) and the tunic shown
  // without it, the hands item's, and the bare wrists shown without them (out of the robe's sleeves or the tunic's)
  const A = new Sculpt(), T = new Sculpt(), H = new Sculpt(), B = new Sculpt(), BR = new Sculpt(), BT = new Sculpt();
  const bareSkin = handSkin(kit, 'mage');

  // --- the robe's body, a teal inner layer showing at the collar, the neck
  const WAIST: [number, number][] = [[0.148, -0.05], [0.15, 0.08], [0.152, 0.2], [0.155, 0.26]];
  A.add(scaleUV(lathe(TORSO, 28), 3, 1.5), robe, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, DEPTH]);
  A.add(scaleUV(lathe(WAIST, 24), 3, 1), robe, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  // gold piping down the front of the robe on each side, and a diamond brooch set with a stone
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const y = lerp(0.24, -0.1, k / 8); pts.push(onChest(s * lerp(0.05, 0.075, k / 8), y, 0.003)); }
    A.add(taperTube(pts, () => 0.005, 16, 5), gold, j.chest);
  }
  // without it the tunic: belted at the waist like the robe, a rolled hem round the neck and a short laced slit down the front
  // (its rows closer together towards the shoulders)
  T.add(plate((u, v, out) => onTunic((u - 0.5) * TAU, lerp(-0.12, 0.3, 1 - (1 - v) ** 1.5), 0, out), 40, 30, 0, undefined, V(0, 0.1, 0)), linen, j.chest);
  T.add(scaleUV(lathe(WAIST, 24), 3, 1), linen, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  T.add(belt(0.073, 0.069, 0.297, 0.012, 0.006, 0, 28), linen, j.chest);
  for (const s of [1, -1]) T.add(taperTube([0.292, 0.25, 0.215].map((y) => tunicFront(s * 0.006, y, 0.001)), () => 0.0025, 8, 5), blackLeather, j.chest);
  for (const y of [0.275, 0.245, 0.222]) T.add(taperTube([tunicFront(0.011, y + 0.004, 0.002), tunicFront(0, y, 0.004), tunicFront(-0.011, y - 0.004, 0.002)], () => 0.0015, 6, 4), leather, j.chest);
  const br = onChest(0, 0.1, 0.012);
  A.add(new THREE.OctahedronGeometry(0.032, 0), gold, j.chest, br.toArray(), [0, 0, 0], [0.75, 1.1, 0.35]);
  A.add(gemGeo(0.014), stone, j.chest, [br.x, br.y, br.z + 0.01], [0, 0, 0], [1, 1.4, 1]);

  // --- the cowl: the hood down, bunched round the neck in teal folds, its crown lying flat on the upper
  // back, inside the cape's torso collider: any fuller, it pokes out through the cape as two humps
  {
    const g = lathe(COWL, 36), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), z = q.getZ(i), a = Math.atan2(x, z), k = 1 + 0.07 * Math.sin(a * 7 + 1) + 0.03 * Math.sin(a * 13);
      q.setXYZ(i, x * k, q.getY(i) - 0.02 * Math.max(0, Math.cos(a)), z * k * 0.95);
    }
    g.computeVertexNormals();
    A.add(scaleUV(g, 3, 1), teal, j.chest);
    const hood: SurfaceFn = (u, v, out) => { const a = Math.PI + (u - 0.5) * 2.2, y = lerp(0.3, 0.1, v), r = 0.105 + 0.01 * Math.sin(v * Math.PI) + 0.005 * Math.sin(u * 17); return out.set(Math.sin(a) * r, y, Math.cos(a) * r * 0.9 - 0.05); };
    A.add(plate(hood, 16, 8, 0.008, undefined, V(0, 0.2, 0)), teal, j.chest);
    A.add(edgeTube(hood, 'v1', 0.005, 16), gold, j.chest);
  }
  // pointed collar flaps over the chest, teal with a gold border
  for (const s of [1, -1]) {
    const flap: SurfaceFn = (u, v, out) => {
      const y = lerp(0.26, 0.0, v), x0 = lerp(0.045, 0.02, v), x1 = lerp(0.2, 0.05, v ** 0.8);
      return onChest(s * lerp(x0, x1, u), y, 0.012 + 0.004 * v, out);
    };
    A.add(plate(flap, 8, 10, 0.004, (u, v) => [s > 0 ? u : 1 - u, 1 - v * 0.8]), tail, j.chest);
    A.add(edgeTube(flap, s > 0 ? 'u1' : 'u1', 0.0045, 12), gold, j.chest);
  }

  // --- pauldrons: two lames of black leather rimmed in gold, a gold boss set with a stone, a spike
  for (const [s, joint0] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    // sized to sit over a man's deltoid (they were cut for a far broader frame)
    const sh = joint(joint0);
    sh.scale.setScalar(PAULDRON);
    const lame = (R: number, lat0: number, lat1: number, y: number): SurfaceFn => (u, v, out) => {
      const lon = (u - 0.5) * 3.2, lat = lerp(lat0, lat1, v);
      return out.set(s * Math.cos(lat) * Math.cos(lon) * R * 1.1 + s * 0.015, Math.sin(lat) * R * 0.75 + y, Math.cos(lat) * Math.sin(lon) * R);
    };
    for (const L of [lame(0.145, -0.3, 0.2, -0.01), lame(0.135, 0.1, 1.45, 0.01)]) {
      A.add(plate(L, 16, 6, 0.006), blackLeather, sh);
      A.add(edgeTube(L, 'v0', 0.006, 16), gold, sh);
    }
    const md = disc(0.036, 0.014);
    projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.036 + 1) / 2, (y / 0.036 + 1) / 2]);
    A.add(md, goldE, sh, [s * 0.095, 0.075, 0.07], [-0.55, s * 0.7, 0]);
    A.add(gemGeo(0.014), stone, sh, [s * 0.104, 0.083, 0.08], [-0.55, s * 0.7, 0]);
    A.add(taperTube([V(0, 0, 0), V(s * 0.02, 0.05, 0), V(s * 0.05, 0.1, -0.01)], (t) => 0.018 * (1 - t), 8, 6), gold, sh, [s * 0.07, 0.1, -0.01]);
  }

  // --- arms: robe sleeves widening into long bell sleeves lined in teal, leather bracers with a stone,
  // fingerless gloves
  const bells: THREE.Group[] = [];
  /** where a bell's top ring rides on the forearm (above the elbow), and how far the left one is pushed back up the arm (drinking) */
  const BELL_Y = 0.07;
  let sleeveUp = 0;
  const cloths: BellCloth[] = [];
  const legs = new LegIK(j);
  /** smooths every cut between poses: an action starting, restarting or ending */
  const fade = new PoseFade(j);
  let lastName = '', lastK = 1;
  let tailName = '', tailT = 0;
  /** a staff shot's kick, 1 as it leaves, dying away */
  let recoil = 0;
  // what the bells must not sink into (the cape's own body colliders, roughly): the torso, the hips and the robe's skirt
  const bodies = [
    { joint: j.chest, y0: 0.22, y1: -0.02, rx: 0.2, rz: 0.17 },
    { joint: j.hips, y0: 0.02, y1: -0.25, rx: 0.26, rz: 0.23 },
    { joint: j.hips, y0: -0.3, y1: -0.62, rx: 0.34, rz: 0.3 },
  ];
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // the sleeve carries on 8cm past the elbow, under the bell, and follows the forearm there
    A.skin(scaleUV(limb(0.38, 0.075, 0.068, 0.05, 0.24, 14), 2, 1), robe, sh, el, 0.2, 0.33);
    // (the tunic's, narrower, on down the forearm to the wrist: under the bracers, or ending in a cuff)
    // (its round top sunk into the deltoid: standing 5 cm over the joint, it was the shoulder)
    T.skin(scaleUV(limb(0.38, 0.06, 0.056, 0.04, 0.24, 14), 2, 1), linen, sh, el, 0.2, 0.33, [0, -0.025, 0]);
    T.add(scaleUV(lathe([[0.043, -0.25], [0.046, -0.2], [0.05, -0.12], [0.054, -0.04], [0.055, 0]], 16), 2, 1), linen, el);
    BT.add(belt(0.045, 0.045, -0.245, 0.012, 0.004, 0, 14), linen, el);
    // the bell: from above the elbow, flaring, longest on the underside of the arm (+z hangs below
    // the forearm when the arm is raised forward)
    const bell = new THREE.CylinderGeometry(0.075, 0.15, 0.3, 28, 6, true).translate(0, -0.15, 0), q = bell.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), a = Math.atan2(x, -z), k = -y / 0.3;
      const hang = 0.12 * k * (0.5 + 0.5 * Math.cos(a)) , fold = 1 + 0.08 * k * Math.sin(Math.atan2(z, x) * 7);
      q.setXYZ(i, x * fold, y - hang, z * fold);
    }
    bell.computeVertexNormals();
    // on a joint of its own, so the first-person view can narrow it (from behind, it hides the hand)
    const bj = joint(el, 0, BELL_Y, 0);
    bells.push(bj);
    // the bell is cloth: its top ring on the forearm, the rest hanging with weight and following the arm
    // (sleeve.ts); the lining and the gold hem ride the same particles
    cloths.push(new BellCloth({ joint: bj, hand: hd, shape: scaleUV(bell, 3, 1), outer: robe, lining, rim: gold, armRadius: 0.066, rimRadius: 0.007, bodies }));
    H.add(scaleUV(lathe([[0.046, -0.26], [0.052, -0.2], [0.058, -0.12], [0.06, -0.1]], 16), 2, 1), leather, el);
    for (const y of [-0.13, -0.245]) H.add(belt(0.058 - (y + 0.13) * 0.1, 0.058 - (y + 0.13) * 0.1, y, 0.012, 0.005, 0, 14), gold, el);
    H.add(new THREE.OctahedronGeometry(0.02, 0), gold, el, [s * 0.058, -0.19, 0], [0, 0, 0], [0.4, 1.2, 1]);
    H.add(gemGeo(0.009), stone, el, [s * 0.064, -0.19, 0], [0, s * Math.PI / 2, 0]);
    // bare: the robe's sleeve on down the forearm under the bell, a gold-edged cuff, the wrist into the palm
    BR.add(scaleUV(lathe([[0.044, -0.25], [0.047, -0.2], [0.052, -0.12], [0.056, -0.04], [0.056, 0]], 16), 2, 1), robe, el);
    BR.add(belt(0.046, 0.046, -0.245, 0.01, 0.004, 0, 14), gold, el);
    B.skin(lathe([[0.033, -0.3], [0.034, -0.28], [0.036, -0.255], [0.04, -0.235]], 16), bareSkin, el, hd, 0.25, 0.29);
  }
  const handL = buildHand(j.handL, 1, leather, skinTip), handR = buildHand(j.handR, -1, leather, skinTip);

  // --- legs: dark breeches, boots with strap buckles, a gold cap and a stone at the shin
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.add(scaleUV(limb(0.46, 0.09, 0.07, 0.1, 0.3, 12), 2, 1.5), robe, th);
    S.add(scaleUV(limb(0.41, 0.068, 0.052, 0.08, 0.35, 12), 2, 1.5), robe, kn);
    S.add(scaleUV(lathe([[0.056, -0.42], [0.062, -0.37], [0.069, -0.26], [0.074, -0.16], [0.08, -0.12], [0.078, -0.11]], 18), 2, 1.5), leather, kn, [0, 0, 0.004], [0, 0, 0], [1, 1, 1.06]);
    S.add(edgeTube((u, v, o) => o.set(Math.sin(u * TAU) * 0.079, -0.115, Math.cos(u * TAU) * 0.084), 'v0', 0.006, 24), gold, kn);
    for (const y of [-0.24, -0.35]) {
      const r = 0.075 + (y + 0.16) * 0.1;
      S.add(belt(r, r * 1.06, y, 0.018, 0.006, 0, 16), blackLeather, kn);
      S.add(buckle(0.022, 0.022, 0.005), gold, kn, [r + 0.006, y, 0], [0, Math.PI / 2, 0]);
    }
    S.add(new THREE.OctahedronGeometry(0.03, 0), gold, kn, [0, -0.15, 0.085], [0, 0, 0], [0.8, 1, 0.3]);
    S.add(gemGeo(0.012), stone, kn, [0, -0.15, 0.092]);
    const foot = [V(0, -0.028, -0.05), V(0, -0.03, 0.04), V(0, -0.037, 0.14), V(0, -0.046, 0.205)];
    S.add(scaleUV(taperTube(foot, (t) => 0.047 - 0.02 * t * t, 12, 12), 1, 2), leather, an, [0, 0, 0], [0, 0, 0], [1.12, 0.82, 1]);
    S.add(taperTube(foot.map((p) => V(0, 0, p.z)), (t) => 0.052 - 0.02 * t * t, 12, 12), blackLeather, an, [0, -0.064, 0], [0, 0, 0], [1.15, 0.2, 1.04]);
    S.add(new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, an, [0, -0.042, 0.16], [0.5, 0, 0], [1.08, 0.9, 1.3]);
  }

  // --- the belt: wide leather with a gold medallion and a stone, a second belt slung across the hips
  // with pouches, a hanging strap with a gold charm
  S.add(belt(0.165, 0.142, 0.02, 0.07, 0.012), leather, j.spine);
  for (const y of [-0.01, 0.05]) S.add(belt(0.173, 0.149, y, 0.008, 0.004), gold, j.spine);
  const md = disc(0.05, 0.016);
  projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.05 + 1) / 2, (y / 0.05 + 1) / 2]);
  S.add(md, goldE, j.spine, [0, 0.02, 0.155]);
  S.add(gemGeo(0.017), stone, j.spine, [0, 0.02, 0.167]);
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * TAU; return V(Math.sin(a) * 0.215, -0.01 - 0.05 * Math.sin(a + 0.6) - 0.02 * Math.cos(a), Math.cos(a) * 0.18); }), 0.035, 0.01, true), leather, j.hips);
  for (const [x, z, ry] of [[0.2, 0.07, 0.9], [0.17, -0.1, 2.1]] as const) {
    S.add(new THREE.BoxGeometry(0.075, 0.1, 0.04), leather, j.hips, [x, -0.07, z], [0, ry, 0]);
    S.add(new THREE.BoxGeometry(0.08, 0.04, 0.046), blackLeather, j.hips, [x, -0.03, z], [0, ry, 0]);
    S.add(stud(0.008), gold, j.hips, [x + Math.sin(ry) * 0.024, -0.04, z + Math.cos(ry) * 0.024], [0, ry, 0]);
  }
  // (the robe's: on a plain tunic it read as a letter)
  A.add(strap([V(-0.16, -0.02, 0.12), V(-0.165, -0.12, 0.135), V(-0.17, -0.24, 0.14)], 0.022, 0.006, false, () => V(-0.5, 0, 0.85).normalize()), leather, j.hips);
  A.add(new THREE.OctahedronGeometry(0.022, 0), gold, j.hips, [-0.17, -0.27, 0.142], [0, 0, 0], [0.7, 1.3, 0.5]);
  A.add(buckle(0.022, 0.03, 0.005), gold, j.hips, [-0.163, -0.1, 0.14], [0, -0.5, 0]);

  // --- skirts: the navy robe to below the knee with a gold hem, a longer teal underskirt, the
  // embroidered front panel, and teal tails at the front corners
  const under = new Skirt({ r0: 0.19, r1: 0.33, len: 0.78, depth: 0.82, folds: 11, foldAmp: 0.07, rows: 10, hem: (a) => 0.05 * Math.sin(a * 5) });
  const over = new Skirt({ r0: 0.2, r1: 0.35, len: 0.66, depth: 0.82, folds: 9, foldAmp: 0.06, rows: 10, trim: 0.045, hem: (a) => 0.08 * (1 - Math.cos(a)) * 0.5 });
  const skirts: THREE.Mesh[] = [];
  for (const [sk, mats] of [[under, [teal]], [over, [robe, gold]], [over, [lining, gold]]] as const) {
    const m = new THREE.Mesh(sk.geo, mats.length > 1 ? [...mats] : mats[0]);
    m.position.y = 0.03; m.castShadow = m.receiveShadow = true;
    j.hips.add(m); skirts.push(m);
  }
  // (without the robe the tunic's skirt, to mid-thigh)
  const short = new Skirt({ r0: 0.19, r1: 0.24, len: 0.34, depth: 0.82, folds: 7, foldAmp: 0.035, rows: 6, hem: (a) => 0.012 * Math.sin(a * 3 + 0.5) });
  const tunicSkirt = new THREE.Mesh(short.geo, linen);
  tunicSkirt.position.y = 0.03; tunicSkirt.castShadow = tunicSkirt.receiveShadow = true;
  j.hips.add(tunicSkirt);
  const flaps: { g: THREE.Group; a: number; len: number }[] = [];
  const hang = (a: number, w: number, len: number, mat: THREE.Material, hemPx: number, texH: number, lift: number) => {
    const g = joint(j.hips, Math.sin(a) * (0.21 + lift), 0.04, Math.cos(a) * (0.175 + lift));
    g.rotation.order = 'YXZ'; g.rotation.y = a;
    const cut = len * (hemPx / texH);
    const pf: SurfaceFn = (u, v, out) => { const yb = -len + cut * Math.abs(2 * u - 1); return out.set((u - 0.5) * w, lerp(yb, 0, v), 0.012 * Math.sin(u * Math.PI)); };
    const f = new Sculpt();
    f.add(plate(pf, 8, 14, 0, (u, v) => { const yb = -len + cut * Math.abs(2 * u - 1); return [u, 1 + lerp(yb, 0, v) / len]; }), mat, g);
    f.build();
    flaps.push({ g, a, len });
  };
  hang(0, 0.19, 0.84, panel, 110, PH, 0.02);
  for (const s of [1, -1]) hang(s * 0.75, 0.15, 0.6, tail, 120, TH2, 0.03);

  // --- the head: face, a full beard, hair, and a wide-brimmed pointed hat (worn with a head item equipped: setGear), its
  // crown bent back by its own weight, a gold band with a stone
  const head = buildHead(j.head, kit, 'mage', { hair: 'swept' });
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
    w.add(scaleUV(brim, 3, 1), robe, hg, at.toArray(), tilt, [1, 1, DZ]);
    w.add(scaleUV(brim.clone(), 3, 1), lining, hg, [at.x, at.y - 0.002, at.z], tilt, [1, 1, DZ]);
    // the crown: tapering up from the band, bent back by its own weight
    const crown: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; crown.push(V(10 * M * Math.sin(t * 4), (t * 300 - t * t * 50) * M, -140 * M * t ** 2.2)); }
    const cg = taperTube(crown, (t) => (RX * M * (1 - t) ** 0.9 + 0.004) * (1 + 0.04 * Math.sin(t * 20)), lod(24, 10), lod(24, 12));
    w.add(scaleUV(cg, 3, 3), robe, hg, at.toArray(), tilt, [1, 1, DZ]);
    // a leather band with gold edges, a gold diamond set with a stone at the front
    const band = (y: number, wd: number, k = 0) => belt((RX + 2 + k) * M, (RX + 2 + k) * M * DZ, y * M, wd * M, 4 * M, 0.004, 28);
    w.add(band(14, 24), leather, hg, at.toArray(), tilt);
    for (const y of [3, 25]) w.add(band(y, 4, 1.5), gold, hg, at.toArray(), tilt);
    const front = V(0, 14 * M, (RX + 6) * M * DZ).applyEuler(new THREE.Euler(...tilt)).add(at);
    w.add(new THREE.OctahedronGeometry(0.022, 0), gold, hg, front.toArray(), tilt, [0.8, 1.1, 0.35]);
    w.add(gemGeo(0.01), stone, hg, [front.x, front.y, front.z + 0.007], tilt);
    w.build();
  }

  // --- staff (right hand): a gnarled haft bound in gold, its head two curling prongs cradling a
  // floating crystal
  // turned in the fist so it stands up out of the forward-reaching forearm, the orb up and ahead.
  // Held GRIP further up the haft than its old balance point, so the crystal rides at head height
  // and the bolts it casts fly at the foes, not over them.
  const staff = joint(j.handR, 0, -0.05, 0.02);
  const STAFF_PITCH = 1.25, STAFF_R = 0.026, STAFF_OUT = -0.5;
  staff.rotation.x = STAFF_PITCH;
  const GRIP = 0.62;
  {
    const w = new Sculpt(), pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const y = -0.52 - GRIP + k * 0.176; pts.push(V(Math.sin(k * 1.7) * 0.008, y, Math.cos(k * 2.3) * 0.008)); }
    w.add(scaleUV(taperTube(pts, (t) => 0.024 * (1 - t * 0.2) * (1 + 0.12 * Math.sin(t * 40)), 40, 8), 2, 6), wood, staff);
    for (const y of [-0.45, 0.0, 0.9, 1.05]) w.add(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 12), gold, staff, [0, y - GRIP, 0]);
    w.add(new THREE.ConeGeometry(0.028, 0.12, 10), gold, staff, [0, -0.58 - GRIP, 0], [Math.PI, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3, curl: THREE.Vector3[] = [];
      for (let q = 0; q <= 8; q++) { const t = q / 8, r = 0.03 + Math.sin(t * Math.PI) * 0.1; curl.push(V(Math.cos(a + t * 1.2) * r, 1.14 - GRIP + t * 0.34, Math.sin(a + t * 1.2) * r)); }
      w.add(taperTube(curl, (t) => 0.017 * (1 - t * 0.7), 16, 6), gold, staff);
    }
    w.build();
  }
  const tip = joint(staff, 0, 1.36 - GRIP, 0);
  const crystal = part(new THREE.OctahedronGeometry(0.07, 0).scale(0.8, 1.6, 0.8), gem, tip);
  crystal.castShadow = false;
  const ringA = part(new THREE.TorusGeometry(0.14, 0.004, 4, 32), glow, tip);
  const ringB = part(new THREE.TorusGeometry(0.11, 0.004, 4, 32), glow, tip);
  ringA.castShadow = ringB.castShadow = false;

  // offhand focus point (left palm)
  const palm = joint(j.handL, 0, -0.08, 0.03);
  S.build();
  const robeParts = A.build(), tunic = T.build(), bracers = H.build(), wrists = B.build(), robeCuffs = BR.build(), tunicCuffs = BT.build();
  // (robed until setGear says otherwise)
  let robed = true;
  for (const o of [...tunic, ...tunicCuffs, tunicSkirt]) o.visible = false;

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

  // --- cape: position-based-dynamics cloth (cape-physics solver), pinned under the
  // cowl and colliding with a capsule rig that follows the animated skeleton.
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: CAPE_ROBED.left, right: CAPE_ROBED.right,
    palette: MAGE_CAPE_PALETTE,
    // narrower than the cape-physics default: the mage holds staff and orb in front,
    // so a wide cape would drape over the arms and stick out forward
    settings: { length: 1.42, width: 0.64 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.01, 0.03, 0], b: j.shoulderR, offB: [-0.01, 0.03, 0], radius: 0.1, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.17, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.2, depthRadius: 0.17, clearance: 0.006, faceSampleSpacing: 0.07 },
      { name: 'hips', a: j.hips, offA: [0, 0.02, 0], offB: [0, -0.25, 0], radius: 0.26, depthRadius: 0.23, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'robe skirt', a: j.hips, offA: [0, -0.3, 0], offB: [0, -0.62, 0], radius: 0.34, depthRadius: 0.3, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'left arm', a: j.shoulderL, offA: [0, -0.02, 0], b: j.elbowL, radius: 0.08, clearance: 0.006 },
      { name: 'right arm', a: j.shoulderR, offA: [0, -0.02, 0], b: j.elbowR, radius: 0.08, clearance: 0.006 },
      { name: 'left thigh', a: j.thighL, offA: [0, -0.1, 0], b: j.kneeL, radius: 0.11 },
      { name: 'left shin', a: j.kneeL, b: j.ankleL, radius: 0.085 },
      { name: 'left boot', a: j.ankleL, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.12], radius: 0.08 },
      { name: 'right thigh', a: j.thighR, offA: [0, -0.1, 0], b: j.kneeR, radius: 0.11 },
      { name: 'right shin', a: j.kneeR, b: j.ankleR, radius: 0.085 },
      { name: 'right boot', a: j.ankleR, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.12], radius: 0.08 },
      // the staff's haft below the fist (from its ferrule: the solver pushes the cloth behind a capsule's first end): aimed at
      // a foe it reaches a metre back behind the body
      { name: 'staff', a: staff, offA: [0, -1.2, 0], offB: [0, -0.1, 0], radius: 0.04, clearance: 0.01, faceSampleSpacing: 0.03 },
    ],
  });

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
    walkCycle(j, st.phase, move, { stride: 0.5, knee: 0.95, arm: 0.35, bob: 0.07, dir, run: true });
    j.shoulderR.rotation.x += -0.35; j.shoulderR.rotation.z += -0.12; j.elbowR.rotation.x += -0.55;
    j.spine.rotation.x += move * 0.12 * dir;
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
    // (its haft angled out, the butt passing outside the cape: aimed straight, it reached a metre back through it)
    staff.rotation.x = STAFF_PITCH + 1.75 * aim; staff.rotation.z = fp ? 0 : STAFF_OUT * aim;
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
    if (robed) { under.update(fL, fR, move, t, dt); over.update(fL, fR, move, t + 0.4, dt); }
    else short.update(fL, fR, move, t, dt);
    for (const f of flaps) {
      const wl = clamp(0.5 + Math.sin(f.a) * 0.9, 0, 1);
      f.g.rotation.x = -(Math.max(-0.05, (fL * wl + fR * (1 - wl)) * Math.cos(f.a)) * 0.85 + 0.26 + move * 0.08 + Math.sin(t * 3 + f.a * 3) * 0.015);
    }

    // the flask comes out of the fist and is put away again (the fist closed round it)
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (flaskOut > 0.01) poseHand(handL, lerp(0.45, 1.1, flaskOut), 0.08 + 0.04 * (1 - flaskOut));
    // (drinking, the left sleeve is pushed back up the arm, its bell shorter, so the hand and the flask at the lips come out of it)
    sleeveUp = damp(sleeveUp, drinkLift, 8, dt);
    if (!fp) { bells[0].position.y = BELL_Y + 0.17 * sleeveUp; bells[0].scale.y = 1 - 0.25 * sleeveUp; }
    // the right hand closes round the staff wherever the arm has taken it
    root.updateMatrixWorld(true);
    hold(handR, _hd.set(0, 1, 0).transformDirection(staff.matrixWorld), STAFF_R);

    // cloth runs after the pose so it collides with this frame's skeleton
    if (dt > 0) { cape.update(dt, st.velocity ?? ZERO); if (robed) for (const c of cloths) c.update(dt); }
    cape.setVisible(st.dead < 0.6);

    // staff crystal
    crystal.rotation.y = t * 2.2;
    crystal.position.y = Math.sin(t * 3) * 0.02;
    ringA.rotation.set(t * 1.7, t * 1.1, 0);
    ringB.rotation.set(-t * 1.3, 0, t * 2.1);
    charged = damp(charged, st.charge || 0, 4, dt);
    gem.emissiveIntensity = GEM_GLOW * (1 + charged * 0.6 + Math.sin(t * 6) * 0.08);
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.0,
    worldObjects: [cape.mesh],
    cloths,
    setGear: (gear: Gear) => {
      hat.visible = gear.helm;
      // the robe or the tunic: the bell sleeves (cloth, put back on the arms when the robe is), the skirts, the cape's fit
      if (gear.chest !== robed) {
        robed = gear.chest;
        if (robed) for (const c of cloths) c.reset();
        const fit = robed ? CAPE_ROBED : CAPE_TUNIC;
        cape.fit(fit.left, fit.right, fit.fit);
      }
      for (const o of [...robeParts, ...skirts, ...flaps.map((f) => f.g), ...cloths.flatMap((c) => c.meshes)]) o.visible = robed;
      for (const o of [...tunic, tunicSkirt]) o.visible = !robed;
      for (const o of bracers) o.visible = gear.hands;
      for (const o of wrists) o.visible = !gear.hands;
      for (const o of robeCuffs) o.visible = robed && !gear.hands;
      for (const o of tunicCuffs) o.visible = !robed && !gear.hands;
      bare(handL, gear.hands ? null : bareSkin); bare(handR, gear.hands ? null : bareSkin);
    },
    reset: () => { cape.reset(); legs.reset(); fade.reset(); for (const c of cloths) c.reset(); },
    // through the eyes the bells, seen from behind, would hide the hands: narrow and shorter
    firstPerson: (on) => { fp = on; for (const b of bells) b.scale.set(on ? 0.6 : 1, on ? 0.75 : 1, on ? 0.6 : 1); },
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
