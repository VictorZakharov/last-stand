// The Mage: the same bare-headed man in layered navy and teal robes, the hood down in a cowl round
// the neck, gold-trimmed and embroidered with arcane signs, long bell sleeves, black-and-gold spiked
// pauldrons set with green stones, a wide medallion belt with pouches and charms, strapped boots with
// gold caps, a cape, and a gnarled staff cradling a floating crystal. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, cloth as clothMaps, steel as steelMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, embroidered, arcaneColumn, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, pulse, ramp, groundFeet } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, lod, plate, edgeTube, strap, belt, buckle, stud, disc, gem as gemGeo, Skirt, scaleUV, type SurfaceFn } from './armor';
import { buildHead } from './head';
import { buildHand, poseHand, hold } from './hands';
import { clamp, lerp, TAU, mulberry } from '../../util';
import { SkeletonCape } from './cape';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { AnimState, Model } from '../../types';

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

// the robe's upper body (chest joint space): its radius across (x) and depth (z) at height y
const TORSO: [number, number][] = [[0.15, -0.12], [0.18, -0.02], [0.2, 0.1], [0.195, 0.18], [0.16, 0.25], [0.08, 0.29]];
const DEPTH = 0.72;
function torsoR(y: number): number {
  for (let i = 1; i < TORSO.length; i++) if (y <= TORSO[i][1]) { const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i]; return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1)); }
  return TORSO[TORSO.length - 1][0];
}
/** a point on the robe's front at x, y, `lift` above it */
function onChest(x: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = torsoR(y), a = Math.asin(clamp(x / r, -1, 1));
  return out.set(Math.sin(a) * (r + lift), y, Math.cos(a) * (r * DEPTH + lift));
}

export function buildMage(): Model {
  const kit = createKit(0x5dffa8);
  const rng = mulberry(5);
  const tex = (maps: ReturnType<typeof clothMaps>, rep: number, ns = 1) => { const m = pbrMaterialMaps(maps, rep, ns); return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale }; };
  const robe = kit.rim({ color: 0x252d48, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x2a3a60, 0.3);
  const teal = kit.rim({ color: 0x1f5058, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.DoubleSide }, 0x2a6a70, 0.3);
  const lining = kit.rim({ color: 0x184048, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.BackSide }, 0x2a6a70, 0.2);
  const gold = kit.std({ color: 0xc9a14a, metalness: 1, roughness: 1, roughnessMap: pbrMaterialMaps(steelMaps(), 1).roughnessMap });
  const E = engravedSteel();
  const goldE = kit.std({ color: 0xd4ab58, metalness: 1, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap });
  const blackLeather = kit.std({ color: 0x1a1614, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const leather = kit.std({ color: 0x3e281a, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const wood = kit.std({ color: 0x5a3d28, roughness: 1, ...tex(woodMaps(), 1, 1.5) });
  const skinTip = kit.rim({ color: 0xc9957c, roughness: 0.6 }, 0x6a2a1c, 0.25);
  const glow = kit.glow(0x5dffa8, 5);
  const gem = kit.phys({ color: 0x2aff9a, emissive: 0x2aff9a, emissiveIntensity: 2.5, roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true });
  // set stones: green, lit from within a little
  const stone = kit.phys({ color: 0x0f7a4a, emissive: 0x1aff8a, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0, clearcoat: 1, flatShading: true });
  // embroidered panels: the long front panel with its column of arcane signs, the teal tails and collar
  const PW = 256, PH = 1024, TW2 = 256, TH2 = 640;
  const panelTex = embroidered(PW, PH, [[0, 0], [PW, 0], [PW, PH - 110], [PW / 2, PH], [0, PH - 110]], [0.13, 0.16, 0.27], [0.85, 0.66, 0.3], arcaneColumn);
  const panel = kit.rim({ color: 0xffffff, roughness: 1, map: panelTex.map, normalMap: panelTex.normalMap, roughnessMap: panelTex.roughnessMap, side: THREE.DoubleSide }, 0x2a3a60, 0.3);
  const tailTex = embroidered(TW2, TH2, [[0, 0], [TW2, 0], [TW2, TH2 - 120], [TW2 / 2, TH2], [0, TH2 - 120]], [0.12, 0.3, 0.33], [0.85, 0.66, 0.3]);
  const tail = kit.rim({ color: 0xffffff, roughness: 1, map: tailTex.map, normalMap: tailTex.normalMap, roughnessMap: tailTex.roughnessMap, side: THREE.DoubleSide }, 0x2a6a70, 0.3);

  const j = buildHumanoid({ skin: robe }, {
    chestW: 0.21, chestD: 0.14, shoulderW: 0.25, upperR: 0.06, foreR: 0.05, shinL: 0.41,
  });
  stripRig(j.root);
  const S = new Sculpt();

  // --- the robe's body, a teal inner layer showing at the collar, the neck
  S.add(scaleUV(lathe(TORSO, 28), 3, 1.5), robe, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, DEPTH]);
  S.add(scaleUV(lathe([[0.15, -0.05], [0.16, 0.08], [0.17, 0.2], [0.18, 0.26]], 24), 3, 1), robe, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  S.add(new THREE.CylinderGeometry(0.06, 0.07, 0.15, 18), skinTip, j.neck, [0, 0.04, 0.005]);
  // gold piping down the front of the robe on each side, and a diamond brooch set with a stone
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const y = lerp(0.24, -0.1, k / 8); pts.push(onChest(s * lerp(0.05, 0.075, k / 8), y, 0.003)); }
    S.add(taperTube(pts, () => 0.005, 16, 5), gold, j.chest);
  }
  const br = onChest(0, 0.1, 0.012);
  S.add(new THREE.OctahedronGeometry(0.032, 0), gold, j.chest, br.toArray(), [0, 0, 0], [0.75, 1.1, 0.35]);
  S.add(gemGeo(0.014), stone, j.chest, [br.x, br.y, br.z + 0.01], [0, 0, 0], [1, 1.4, 1]);

  // --- the cowl: the hood down, bunched round the neck in teal folds, its crown lying on the upper back
  {
    const g = lathe([[0.1, 0.2], [0.17, 0.235], [0.175, 0.27], [0.14, 0.31], [0.1, 0.34], [0.085, 0.36]], 36), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), z = q.getZ(i), a = Math.atan2(x, z), k = 1 + 0.07 * Math.sin(a * 7 + 1) + 0.03 * Math.sin(a * 13);
      q.setXYZ(i, x * k, q.getY(i) - 0.02 * Math.max(0, Math.cos(a)), z * k * 0.95);
    }
    g.computeVertexNormals();
    S.add(scaleUV(g, 3, 1), teal, j.chest);
    const hood: SurfaceFn = (u, v, out) => { const a = Math.PI + (u - 0.5) * 2.2, y = lerp(0.3, 0.1, v), r = 0.13 + 0.06 * Math.sin(v * Math.PI) + 0.012 * Math.sin(u * 17); return out.set(Math.sin(a) * r, y, Math.cos(a) * r * 0.9 - 0.05); };
    S.add(plate(hood, 16, 8, 0.008, undefined, V(0, 0.2, 0)), teal, j.chest);
    S.add(edgeTube(hood, 'v1', 0.005, 16), gold, j.chest);
  }
  // pointed collar flaps over the chest, teal with a gold border
  for (const s of [1, -1]) {
    const flap: SurfaceFn = (u, v, out) => {
      const y = lerp(0.26, 0.0, v), x0 = lerp(0.045, 0.02, v), x1 = lerp(0.2, 0.05, v ** 0.8);
      return onChest(s * lerp(x0, x1, u), y, 0.012 + 0.004 * v, out);
    };
    S.add(plate(flap, 8, 10, 0.004, (u, v) => [s > 0 ? u : 1 - u, 1 - v * 0.8]), tail, j.chest);
    S.add(edgeTube(flap, s > 0 ? 'u1' : 'u1', 0.0045, 12), gold, j.chest);
  }

  // --- pauldrons: two lames of black leather rimmed in gold, a gold boss set with a stone, a spike
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    const lame = (R: number, lat0: number, lat1: number, y: number): SurfaceFn => (u, v, out) => {
      const lon = (u - 0.5) * 3.2, lat = lerp(lat0, lat1, v);
      return out.set(s * Math.cos(lat) * Math.cos(lon) * R * 1.1 + s * 0.015, Math.sin(lat) * R * 0.75 + y, Math.cos(lat) * Math.sin(lon) * R);
    };
    for (const L of [lame(0.145, -0.3, 0.2, -0.01), lame(0.135, 0.1, 1.45, 0.01)]) {
      S.add(plate(L, 16, 6, 0.006), blackLeather, sh);
      S.add(edgeTube(L, 'v0', 0.006, 16), gold, sh);
    }
    const md = disc(0.036, 0.014);
    projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.036 + 1) / 2, (y / 0.036 + 1) / 2]);
    S.add(md, goldE, sh, [s * 0.095, 0.075, 0.07], [-0.55, s * 0.7, 0]);
    S.add(gemGeo(0.014), stone, sh, [s * 0.104, 0.083, 0.08], [-0.55, s * 0.7, 0]);
    S.add(taperTube([V(0, 0, 0), V(s * 0.02, 0.05, 0), V(s * 0.05, 0.1, -0.01)], (t) => 0.018 * (1 - t), 8, 6), gold, sh, [s * 0.07, 0.1, -0.01]);
  }

  // --- arms: robe sleeves widening into long bell sleeves lined in teal, leather bracers with a stone,
  // fingerless gloves
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    S.add(scaleUV(limb(0.3, 0.075, 0.07, 0.05, 0.3, 14), 2, 1), robe, sh);
    // the bell: from above the elbow, flaring, longest on the underside of the arm (+z hangs below
    // the forearm when the arm is raised forward)
    const bell = new THREE.CylinderGeometry(0.075, 0.15, 0.3, 28, 6, true).translate(0, -0.15, 0), q = bell.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), a = Math.atan2(x, -z), k = -y / 0.3;
      const hang = 0.12 * k * (0.5 + 0.5 * Math.cos(a)) , fold = 1 + 0.08 * k * Math.sin(Math.atan2(z, x) * 7);
      q.setXYZ(i, x * fold, y - hang, z * fold);
    }
    bell.computeVertexNormals();
    S.add(scaleUV(bell, 3, 1), robe, el, [0, 0.07, 0]);
    S.add(scaleUV(bell.clone(), 3, 1), lining, el, [0, 0.07, 0], [0, 0, 0], [0.97, 1, 0.97]);
    // gold border round the opening
    const rim: THREE.Vector3[] = [];
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * TAU, x = Math.sin(a) * 0.15, z = Math.cos(a) * 0.15, aa = Math.atan2(x, -z);
      rim.push(V(x * (1 + 0.08 * Math.sin(Math.atan2(z, x) * 7)), -0.3 + 0.07 - 0.12 * (0.5 + 0.5 * Math.cos(aa)), z * (1 + 0.08 * Math.sin(Math.atan2(z, x) * 7))));
    }
    S.add(taperTube(rim, () => 0.007, 56, 5), gold, el);
    S.add(scaleUV(lathe([[0.046, -0.26], [0.052, -0.2], [0.058, -0.12], [0.06, -0.1]], 16), 2, 1), leather, el);
    for (const y of [-0.13, -0.245]) S.add(belt(0.058 - (y + 0.13) * 0.1, 0.058 - (y + 0.13) * 0.1, y, 0.012, 0.005, 0, 14), gold, el);
    S.add(new THREE.OctahedronGeometry(0.02, 0), gold, el, [s * 0.058, -0.19, 0], [0, 0, 0], [0.4, 1.2, 1]);
    S.add(gemGeo(0.009), stone, el, [s * 0.064, -0.19, 0], [0, s * Math.PI / 2, 0]);
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
  S.add(belt(0.19, 0.155, 0.02, 0.07, 0.012), leather, j.spine);
  for (const y of [-0.01, 0.05]) S.add(belt(0.198, 0.162, y, 0.008, 0.004), gold, j.spine);
  const md = disc(0.05, 0.016);
  projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.05 + 1) / 2, (y / 0.05 + 1) / 2]);
  S.add(md, goldE, j.spine, [0, 0.02, 0.168]);
  S.add(gemGeo(0.017), stone, j.spine, [0, 0.02, 0.18]);
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * TAU; return V(Math.sin(a) * 0.215, -0.01 - 0.05 * Math.sin(a + 0.6) - 0.02 * Math.cos(a), Math.cos(a) * 0.18); }), 0.035, 0.01, true), leather, j.hips);
  for (const [x, z, ry] of [[0.2, 0.07, 0.9], [0.17, -0.1, 2.1]] as const) {
    S.add(new THREE.BoxGeometry(0.075, 0.1, 0.04), leather, j.hips, [x, -0.07, z], [0, ry, 0]);
    S.add(new THREE.BoxGeometry(0.08, 0.04, 0.046), blackLeather, j.hips, [x, -0.03, z], [0, ry, 0]);
    S.add(stud(0.008), gold, j.hips, [x + Math.sin(ry) * 0.024, -0.04, z + Math.cos(ry) * 0.024], [0, ry, 0]);
  }
  S.add(strap([V(-0.16, -0.02, 0.12), V(-0.165, -0.12, 0.135), V(-0.17, -0.24, 0.14)], 0.022, 0.006, false, () => V(-0.5, 0, 0.85).normalize()), leather, j.hips);
  S.add(new THREE.OctahedronGeometry(0.022, 0), gold, j.hips, [-0.17, -0.27, 0.142], [0, 0, 0], [0.7, 1.3, 0.5]);
  S.add(buckle(0.022, 0.03, 0.005), gold, j.hips, [-0.163, -0.1, 0.14], [0, -0.5, 0]);

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

  // --- the head: face, a full beard, hair, and a wide-brimmed pointed hat, its crown bent back by
  // its own weight, a gold band with a stone
  const head = buildHead(j.head, kit, 7, { beard: 0.17 });
  {
    const w = new Sculpt(), hg = head.group;
    const brim = lathe([[0.115, 0.004], [0.15, 0.0], [0.185, -0.01], [0.205, -0.025], [0.202, -0.031], [0.18, -0.018], [0.14, -0.008], [0.115, -0.006]], 40);
    const q = brim.attributes.position;
    // a gentle wave round the brim, dipping at the front and back
    for (let i = 0; i < q.count; i++) { const x = q.getX(i), z = q.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z); q.setY(i, q.getY(i) - (r - 0.115) * (0.12 * Math.cos(2 * a) + 0.05 * Math.sin(a * 5))); }
    brim.computeVertexNormals();
    w.add(scaleUV(brim, 3, 1), robe, hg, [0, 0.195, 0.0], [-0.12, 0, 0], [1, 1, 1.08]);
    w.add(scaleUV(brim.clone(), 3, 1), lining, hg, [0, 0.193, 0.0], [-0.12, 0, 0], [1, 1, 1.08]);
    const crown: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; crown.push(V(0.012 * Math.sin(t * 4), 0.19 + t * 0.36 - t * t * 0.06, -0.01 - 0.16 * t ** 2.2)); }
    const cg = taperTube(crown, (t) => (0.118 * (1 - t) ** 0.9 + 0.004) * (1 + 0.04 * Math.sin(t * 20)), lod(24, 10), lod(24, 12));
    w.add(scaleUV(cg, 3, 3), robe, hg, [0, 0, 0], [-0.1, 0, 0], [1, 1, 1.06]);
    w.add(belt(0.121, 0.128, 0.225, 0.028, 0.006, 0.004, 28), leather, hg, [0, 0, 0], [-0.1, 0, 0]);
    for (const y of [0.212, 0.238]) w.add(belt(0.123, 0.13, y, 0.004, 0.004, 0.004, 28), gold, hg, [0, 0, 0], [-0.1, 0, 0]);
    w.add(new THREE.OctahedronGeometry(0.022, 0), gold, hg, [0, 0.23, 0.13], [-0.1, 0, 0], [0.8, 1.1, 0.35]);
    w.add(gemGeo(0.01), stone, hg, [0, 0.231, 0.137], [-0.1, 0, 0]);
    w.build();
  }

  // --- staff (right hand): a gnarled haft bound in gold, its head two curling prongs cradling a
  // floating crystal
  // turned in the fist so it stands up out of the forward-reaching forearm, the orb up and ahead
  const staff = joint(j.handR, 0, -0.05, 0.02);
  staff.rotation.x = 1.25;
  {
    const w = new Sculpt(), pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const y = -0.52 + k * 0.176; pts.push(V(Math.sin(k * 1.7) * 0.008, y, Math.cos(k * 2.3) * 0.008)); }
    w.add(scaleUV(taperTube(pts, (t) => 0.024 * (1 - t * 0.2) * (1 + 0.12 * Math.sin(t * 40)), 40, 8), 2, 6), wood, staff);
    for (const y of [-0.45, 0.0, 0.9, 1.05]) w.add(new THREE.CylinderGeometry(0.03, 0.03, 0.045, 12), gold, staff, [0, y, 0]);
    w.add(new THREE.ConeGeometry(0.028, 0.12, 10), gold, staff, [0, -0.58, 0], [Math.PI, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const a = k * TAU / 3, curl: THREE.Vector3[] = [];
      for (let q = 0; q <= 8; q++) { const t = q / 8, r = 0.03 + Math.sin(t * Math.PI) * 0.1; curl.push(V(Math.cos(a + t * 1.2) * r, 1.14 + t * 0.34, Math.sin(a + t * 1.2) * r)); }
      w.add(taperTube(curl, (t) => 0.017 * (1 - t * 0.7), 16, 6), gold, staff);
    }
    w.build();
  }
  const tip = joint(staff, 0, 1.36, 0);
  const crystal = part(new THREE.OctahedronGeometry(0.07, 0).scale(0.8, 1.6, 0.8), gem, tip);
  crystal.castShadow = false;
  const ringA = part(new THREE.TorusGeometry(0.14, 0.004, 4, 32), glow, tip);
  const ringB = part(new THREE.TorusGeometry(0.11, 0.004, 4, 32), glow, tip);
  ringA.castShadow = ringB.castShadow = false;

  // offhand focus point (left palm)
  const palm = joint(j.handL, 0, -0.08, 0.03);
  S.build();

  /** set once a channel's opening completes, for the thrust into the portal */
  let openedAt = -1;

  const root = j.root;
  root.scale.setScalar(1.08);

  // --- cape: position-based-dynamics cloth (cape-physics solver), pinned under the
  // cowl and colliding with a capsule rig that follows the animated skeleton.
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: [0.11, 0.3, -0.17], right: [-0.11, 0.3, -0.17],
    palette: MAGE_CAPE_PALETTE,
    // narrower than the cape-physics default: the mage holds staff and orb in front,
    // so a wide cape would drape over the arms and stick out forward
    settings: { length: 1.42, width: 0.74 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.02, 0.03, 0], b: j.shoulderR, offB: [-0.02, 0.03, 0], radius: 0.12, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.19, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.24, depthRadius: 0.19, clearance: 0.006, faceSampleSpacing: 0.07 },
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
    ],
  });

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;

    // base stance: staff held at the side, slightly forward
    idle(j, t, 1 - move * 0.6);
    walkCycle(j, st.phase, move, { stride: 0.5, knee: 0.95, arm: 0.35, bob: 0.07, dir });
    j.shoulderR.rotation.x += -0.35; j.shoulderR.rotation.z += -0.12; j.elbowR.rotation.x += -0.55;
    j.spine.rotation.x += move * 0.12 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;

    // hands at rest: the free one loosely curled and breathing, the other gripping the staff
    poseHand(handL, 0.45 + Math.sin(t * 1.3) * 0.06, 0.12);
    const a = st.action;
    if (!a || a.name !== 'channel') openedAt = -1;
    if (a) {
      const k = a.t;
      if (a.name === 'cast') {
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
        }
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
        const w = pulse(k, 0, 1);
        j.shoulderL.rotation.x += -1.6 * w; j.shoulderL.rotation.z += 0.8 * w;
        j.shoulderR.rotation.x += -0.8 * w; j.shoulderR.rotation.z += -0.6 * w;
        j.neck.rotation.x += -0.3 * w;
        // palm up and open, fingers spread to the ward
        j.handL.rotation.x += -0.6 * w;
        poseHand(handL, 0.45 - 0.35 * w, 0.12 + 0.45 * w);
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.25 * st.hit; j.neck.rotation.x += -0.2 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, -1);
    // feet on the floor: a crouch bends the knees instead of sinking the feet, a planted foot lies flat
    else groundFeet(j, 0.07);

    // the skirts swing with the legs; the panels hanging over them follow the leg on their side
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    under.update(fL, fR, move, t, dt);
    over.update(fL, fR, move, t + 0.4, dt);
    for (const f of flaps) {
      const wl = clamp(0.5 + Math.sin(f.a) * 0.9, 0, 1);
      f.g.rotation.x = -(Math.max(-0.05, (fL * wl + fR * (1 - wl)) * Math.cos(f.a)) * 0.85 + 0.26 + move * 0.08 + Math.sin(t * 3 + f.a * 3) * 0.015);
    }

    // the right hand closes round the staff wherever the arm has taken it
    root.updateMatrixWorld(true);
    hold(handR, staff.getWorldPosition(_hp), _hd.set(0, 1, 0).transformDirection(staff.matrixWorld), 0.026);

    // cloth runs after the pose so it collides with this frame's skeleton
    if (dt > 0) cape.update(dt, st.velocity ?? ZERO);
    cape.setVisible(st.dead < 0.6);

    // staff crystal
    crystal.rotation.y = t * 2.2;
    crystal.position.y = Math.sin(t * 3) * 0.02;
    ringA.rotation.set(t * 1.7, t * 1.1, 0);
    ringB.rotation.set(-t * 1.3, 0, t * 2.1);
    const charge = st.charge || 0;
    gem.emissiveIntensity = 2.5 + charge * 6 + Math.sin(t * 6) * 0.4;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.0,
    worldObjects: [cape.mesh],
    reset: () => cape.reset(),
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
