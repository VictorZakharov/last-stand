// The Warrior: a bare-headed veteran in an engraved breastplate over layered leather, fur at the collar,
// cuffs and boot tops, crossed straps, a mail skirt between leather tassets, engraved knee cops and tall
// strapped boots, with a cloth cape. Carries the equipped weapon and shield. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, mail as mailMaps, cloth as clothMaps, steel as steelMaps, fur as furMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm, groundFeet } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, twist, plate, edgeTube, strap, belt, buckle, stud, disc, furTufts, Skirt, merge, scaleUV, type SurfaceFn } from './armor';
import { buildHead } from './head';
import { buildHand, poseHand, hold } from './hands';
import { clamp, lerp, mulberry } from '../../util';
import { SkeletonCape } from './cape';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { AnimState, Gear, Model } from '../../types';

const ZERO = new THREE.Vector3();
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
interface Weapon { group: THREE.Group; len: number; off: number | null; /** the grip's radius, for the fingers */ r: number }
/** the grip turns the weapon's +Y forward and a little up out of the bent arm */
const GRIP = Math.PI / 2 + 0.7;
/** straightens the weapon along the arm, for swings that trace the damage arc */
const ALONG_ARM = Math.PI - GRIP;
/** arm length (upper + fore + hand), before the model's 1.1 scale */
const ARM = 0.63;
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const _grip = new THREE.Vector3(), _pole = new THREE.Vector3(1, -0.7, -0.6);
const SHIELD_SIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const SHIELD_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const SIDE_POS = new THREE.Vector3(0.07, -0.02, 0), FRONT_POS = new THREE.Vector3(0, -0.1, 0);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Navy wool cape with a leather trim, matching the sleeves. */
const WARRIOR_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [30, 38, 58] as const,
  trim: [74, 50, 34] as const,
  sheenColor: 0x3a4a6a,
  attachmentColor: 0x3a2a1e,
  materialName: 'Heavy navy warrior cape',
});

// --- the breastplate: a torso-shaped shell, broad at the chest with a gentle keel and pectoral swell,
// its top dipping a little at the collar (chest joint space)
const bpRx = (y: number) => 0.2 + 0.05 * sm(-0.07, 0.12, y) - 0.035 * sm(0.17, 0.25, y);
const bpRz = (y: number) => 0.152 + 0.032 * sm(-0.07, 0.1, y) - 0.035 * sm(0.16, 0.25, y);
const BP_A = 1.75;
const bpTop = (a: number) => 0.235 - 0.03 * Math.cos(a) ** 2;
function bpPoint(a: number, y: number, out: THREE.Vector3, lift = 0): THREE.Vector3 {
  const x = Math.sin(a) * (bpRx(y) + lift);
  const G = (dx: number, dy: number, s: number) => Math.exp(-(dx * dx + dy * dy) / (s * s));
  const pec = 0.014 * G(Math.abs(x) - 0.1, y - 0.12, 0.09) + 0.007 * Math.exp(-((x / 0.025) ** 2)) * sm(-0.07, 0.05, y);
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
    chestW: 0.25, chestD: 0.16, waistW: 0.18, shoulderW: 0.28, upperR: 0.068, foreR: 0.058, handR: 0.058,
    thighR: 0.1, shinR: 0.078, headR: 0.125, shinL: 0.41,
  });
  stripRig(j.root);
  // fur casts no shadow: hundreds of thin tufts would add much to the shadow pass for little
  const S = new Sculpt().glow(furM);

  // --- torso: a quilted gambeson under it all, layered leather at the waist, the breastplate on top
  S.add(scaleUV(lathe([[0.17, -0.12], [0.2, -0.02], [0.222, 0.1], [0.215, 0.18], [0.17, 0.25], [0.085, 0.29]], 24), 3, 1.5), cloth, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.68]);
  S.add(scaleUV(lathe([[0.15, -0.05], [0.16, 0.08], [0.18, 0.2], [0.19, 0.26]], 24), 3, 1), leatherDark, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.8]);
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) S.add(belt(0.19 + g, 0.155 + g, y, 0.06, 0.01), leather, j.spine);
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
    studAt(V(Math.sin(a) * (0.2 + g), y - 0.02, Math.cos(a) * (0.165 + g)), V(Math.sin(a), 0, Math.cos(a)), 0.005);
  }
  S.add(merge(studs.splice(0)), brass, j.spine);
  // the breastplate, engraved across the front (projected straight on), and a plain back plate
  const bp = plate(breast, 28, 14, 0.008);
  projectUV(bp, steelRegion('chest'), (x, y) => [(x + 0.3) / 0.6, (y + 0.12) / 0.42]);
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
  for (const s of [1, -1]) for (const y of [0.02, 0.1]) S.add(strap([V(s * 0.19, y, 0.1), V(s * 0.225, y, 0), V(s * 0.19, y, -0.1)], 0.028, 0.006), leather, j.chest);
  // crossed straps over the chest, each with a buckle; they run on over the shoulders
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [V(s * 0.12, 0.27, -0.12), V(s * 0.14, 0.29, -0.02), V(s * 0.13, 0.25, 0.1)];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(onPlate(lerp(s * 0.12, -s * 0.2, t), lerp(0.2, -0.04, t), 0.004)); }
    S.add(strap(pts, 0.04, 0.007), leather, j.chest);
    const mid = onPlate(s * -0.01, 0.1, 0.012);
    S.add(buckle(0.05, 0.05), plateM, j.chest, mid.toArray(), [0, 0, s * 0.62]);
  }

  // --- fur collar round the neck and over the shoulder tops
  S.add(furTufts(rng, 280, (i, o) => {
    const a = rng() * Math.PI * 2, r = 0.55 + rng() * 0.45, sa = Math.sin(a), ca = Math.cos(a);
    o.p.set(sa * (0.1 + 0.15 * r), 0.24 + rng() * 0.04 - Math.abs(sa) * r * 0.02, ca * (0.1 + 0.05 * r));
    o.d.set(sa, 0.5 + rng() * 0.5, ca);
  }, 0.06, 0.011), furM, j.chest);
  // a high collar of the gambeson inside the fur, and the neck
  S.add(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 20, 1, true), cloth, j.chest, [0, 0.27, 0]);
  S.add(new THREE.CylinderGeometry(0.06, 0.07, 0.15, 18), skinTip, j.neck, [0, 0.04, 0.005]);

  // --- pauldrons: three steel lames over each shoulder with a rolled rim, an engraved medallion on the
  // top one, fur spilling out from under it
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
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
    S.add(scaleUV(limb(0.3, 0.078, 0.064, 0.12, 0.3, 14), 2, 1), cloth, sh);
    for (const y of [-0.13, -0.21]) S.add(belt(0.078, 0.078, y, 0.024, 0.006, 0, 14), leather, sh);
    S.add(furTufts(rng, 40, (i, o) => { const a = (i / 40) * Math.PI * 2; o.p.set(Math.sin(a) * 0.06, -0.035, Math.cos(a) * 0.06); o.d.set(Math.sin(a), 0.6, Math.cos(a)); }, 0.035, 0.009), furM, el);
    S.add(scaleUV(lathe([[0.052, -0.26], [0.06, -0.2], [0.066, -0.1], [0.07, -0.05], [0.068, -0.035]], 16), 2, 1), leather, el);
    const vb: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 1.8, y = lerp(-0.24, -0.06, v), r = 0.066 + 0.01 * sm(-0.24, -0.08, y) + 0.004; return out.set(s * Math.cos(a) * r, y, Math.sin(a) * r); };
    S.add(plate(vb, 10, 8, 0.005), plateM, el);
    for (const y of [-0.09, -0.2]) S.add(belt(0.072, 0.072, y, 0.018, 0.006, 0, 14), leatherDark, el);
  }
  const handL = buildHand(j.handL, 1, leather, skinTip, 1.08), handR = buildHand(j.handR, -1, leather, skinTip, 1.08);

  // --- legs: leather trousers, engraved knee cops, tall boots with fur tops, straps and a steel toe
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.add(scaleUV(limb(0.46, 0.108, 0.078, 0.14, 0.3, 14), 2, 1.5), leatherDark, th);
    S.add(scaleUV(limb(0.41, 0.076, 0.058, 0.1, 0.35, 12), 2, 1.5), leatherDark, kn);
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
  S.add(belt(0.2, 0.162, 0.01, 0.06, 0.012), leather, j.spine);
  const bk = disc(0.046, 0.016);
  projectUV(bk, steelRegion('disc'), (x, y) => [(x / 0.046 + 1) / 2, (y / 0.046 + 1) / 2]);
  S.add(bk, engraved, j.spine, [0, 0.01, 0.176]);
  // a second belt slung lower across the hips, and a pouch on it
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * Math.PI * 2; return V(Math.sin(a) * 0.225, 0.02 - 0.05 * Math.sin(a + 0.8) - 0.02 * Math.cos(a), Math.cos(a) * 0.185); }), 0.04, 0.01, true), leather, j.hips);
  S.add(new THREE.BoxGeometry(0.08, 0.1, 0.045), leatherDark, j.hips, [-0.2, -0.05, 0.08], [0, -0.8, 0]);
  S.add(new THREE.BoxGeometry(0.086, 0.04, 0.05), leather, j.hips, [-0.2, -0.005, 0.08], [0, -0.8, 0]);
  const skirt = new Skirt({ r0: 0.212, r1: 0.27, len: 0.36, depth: 0.8, folds: 7, foldAmp: 0.03, flare: 0.7, rows: 6 });
  const skirtMesh = new THREE.Mesh(skirt.geo, mail);
  skirtMesh.position.y = 0.04; skirtMesh.castShadow = skirtMesh.receiveShadow = true;
  j.hips.add(skirtMesh);
  const tassets: { g: THREE.Group; s: number }[] = [];
  for (const s of [1, -1]) {
    for (const [k, off] of [[0, 0.55], [1, 1.05]] as const) {
      const g = joint(j.hips, s * Math.sin(off) * 0.225, 0.05, Math.cos(off) * 0.19);
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

  // --- the head: face, beard and hair
  buildHead(j.head, kit, 7);

  // --- weapons in the right hand, built along the grip's +Y (blade up); setGear shows the equipped one.
  // The grip turns +Y to point forward, slightly up, out of the bent arm.
  const grip = joint(j.handR, 0, -0.06, 0.01);
  grip.rotation.x = GRIP;
  const weapons = new Map<string, Weapon>();
  const add = (name: string, len: number, off: number | null, r: number, build: (w: Sculpt, g: THREE.Group) => void) => {
    const g = new THREE.Group();
    grip.add(g);
    const w = new Sculpt();
    build(w, g);
    w.glow(edge).build();
    g.visible = false;
    weapons.set(name, { group: g, len, off, r });
  };
  /** a blade along +Y from `at`: a flattened diamond with a fuller (a groove down its middle) tapering to the point */
  const blade = (w: Sculpt, g: THREE.Group, bw: number, len: number, at: number) => {
    const t = bw * 0.2, sec = (k: number, f: number): [number, number][] => [[bw * k, 0], [bw * 0.45 * k, t * k], [bw * 0.18 * k, t * (1 - 0.45 * f) * k], [-bw * 0.18 * k, t * (1 - 0.45 * f) * k], [-bw * 0.45 * k, t * k], [-bw * k, 0], [-bw * 0.45 * k, -t * k], [-bw * 0.18 * k, -t * (1 - 0.45 * f) * k], [bw * 0.18 * k, -t * (1 - 0.45 * f) * k], [bw * 0.45 * k, -t * k]];
    const rows = 10, pos: number[] = [];
    const ring = (i: number) => { const y = i / rows, k = y < 0.82 ? 1 - y * 0.18 : (1 - y) / 0.18 * 0.85, f = y < 0.75 ? 1 : Math.max(0, 1 - (y - 0.75) / 0.1); return sec(Math.max(k, 0.001), f).map(([x, z]) => V(x, at + y * len, z)); };
    for (let i = 0; i < rows; i++) {
      const A = ring(i), B = ring(i + 1);
      for (let q = 0; q < A.length; q++) { const r = (q + 1) % A.length; pos.push(...A[q].toArray(), ...A[r].toArray(), ...B[q].toArray(), ...B[q].toArray(), ...A[r].toArray(), ...B[r].toArray()); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv: number[] = [];
    for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 3, pos[i + 1] * 3);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    w.add(geo, plateM, g);
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

  add('Sword', 1.12, null, 0.024, (w, g) => { hilt(w, g, 0.2, 0.14); blade(w, g, 0.045, 0.94, 0.12); });
  add('Axe', 0.74, null, 0.024, (w, g) => {
    haft(w, g, -0.14, 0.72);
    axeHead(w, g, 0.2, 0.6, 1);
    w.add(new THREE.BoxGeometry(0.1, 0.05, 0.04), darkSteel, g, [-0.06, 0.6, 0]);
    w.add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), brass, g, [0, 0.6, 0]);
  });
  add('Mace', 0.72, null, 0.026, (w, g) => {
    haft(w, g, -0.14, 0.62, 0.024);
    w.add(new THREE.SphereGeometry(0.075, 14, 10), darkSteel, g, [0, 0.64, 0]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      w.add(new THREE.BoxGeometry(0.018, 0.17, 0.075), plateM, g, [Math.cos(a) * 0.07, 0.64, Math.sin(a) * 0.07], [0, -a, 0]);
    }
    w.add(new THREE.ConeGeometry(0.025, 0.07, 8), plateM, g, [0, 0.74, 0]);
  });
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

  S.build();

  const root = j.root;
  root.scale.setScalar(1.1);

  // --- cape pinned under the pauldrons, colliding with the armoured body
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: [0.14, 0.3, -0.19], right: [-0.14, 0.3, -0.19],
    palette: WARRIOR_CAPE_PALETTE,
    settings: { length: 1.2, width: 0.72 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.03, 0.04, 0], b: j.shoulderR, offB: [-0.03, 0.04, 0], radius: 0.16, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.2, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.29, depthRadius: 0.2, clearance: 0.006, faceSampleSpacing: 0.07 },
      { name: 'hips', a: j.hips, offA: [0, 0.02, 0], offB: [0, -0.2, 0], radius: 0.28, depthRadius: 0.24, clearance: 0.008, faceSampleSpacing: 0.08 },
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

  function setGear(gear: Gear): void {
    for (const w of weapons.values()) w.group.visible = false;
    held = gear.weapon ? weapons.get(gear.weapon) ?? weapons.get('Sword')! : null;
    if (held) held.group.visible = true;
    if (held?.off != null) offGrip.position.y = held.off;
    shield.visible = gear.shield;
    for (const w of offWeapons.values()) w.group.visible = false;
    offHeld = gear.offWeapon ? offWeapons.get(gear.offWeapon) ?? offWeapons.get('Sword')! : null;
    if (offHeld) offHeld.group.visible = true;
    tipOn(false);
  }

  /** The tip the skills read (trail, cast point): the left weapon's during a left-hand swing. */
  function tipOn(left: boolean): void {
    const at = left && offHeld ? gripL : grip;
    if (tip.parent !== at) at.add(tip);
    tip.position.y = (left && offHeld ? offHeld : held)?.len ?? 0;
  }

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;
    const two = held?.off != null;

    // base stance: weapon forward at the hip (a two-hander held across the body), shield up in front
    idle(j, t, 1 - move * 0.6);
    walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: 0.2, bob: 0.08, dir });
    if (two) { j.shoulderR.rotation.x += -0.5; j.shoulderR.rotation.z += 0.2; j.elbowR.rotation.x += -1.0; }
    else { j.shoulderR.rotation.x += -0.3; j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8; }
    // shield carried low at the side, the arm held a little out so it clears the leg; a second
    // weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3; j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8; }
    let guard = 0;   // 0: shield at the side, 1: in front
    j.spine.rotation.x += move * 0.14 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const a = st.action;
    if (a && (a.name !== lastName || a.t < lastK - 0.2) && a.name === 'swing') side = -side;
    lastName = a?.name ?? ''; lastK = a?.t ?? 1;
    // Twin Fangs strikes right, then left (in step with skills/twinFangs STRIKES)
    const left = !!offHeld && ((a?.name === 'swing' && side < 0) || (a?.name === 'flurry' && a.t > 0.5));
    tipOn(left);
    // the swinging arm: the left one mirrors the right (the same pitch, the yaw and roll turned over)
    const R = left ? j.shoulderL.rotation : j.shoulderR.rotation;
    if (a) {
      const k = a.t;
      if (a.name === 'swing') {
        // the straight arm and weapon sweep the damage arc: raised out to the starting side, then the
        // tip crosses it from 0.55 to 0.85 of the cast, in step with the trail (skills/cleave swingArc)
        const w = ramp(k, 0, 0.3) * (1 - ramp(k, 0.9, 1));
        const theta = side * 1.2 * (2 * ramp(k, 0.55, 0.85) - 1);
        // a two-hander turns more with the body and keeps the grip in front of the chest, in the left hand's reach
        const body = two ? 0.75 : 0.45;
        j.spine.rotation.y += 0.3 * body * theta * w;
        j.chest.rotation.y += 0.7 * body * theta * w;
        R.x = lerp(R.x, -1.25, w); R.z = lerp(R.z, 0, w); R.y = ((1 - body) * theta + (two ? 0.45 : 0)) * w;
        const elbow = left ? j.elbowL : j.elbowR;
        elbow.rotation.x = lerp(elbow.rotation.x, two ? -0.5 : -0.1, w);
        (left ? j.handL : j.handR).rotation.x += ALONG_ARM * w;
        // the leg opposite the swinging arm steps in
        (left ? j.thighR : j.thighL).rotation.x += -0.3 * w; (left ? j.kneeL : j.kneeR).rotation.x += 0.3 * w;
      } else if (a.name === 'flurry') {
        // Twin Fangs: a low lunge, each blade cutting down across the body from high on its own side,
        // right then left (the left arm mirrors the right: the same pitch, yaw turned over)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.9, 1));
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
      } else if (a.name === 'chop') {
        // Power Strike: the weapon rises overhead and trembles while the charge builds, then comes down
        // in a vertical arc at 0.9 of the cast (the skill's fireAt)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.97, 1));
        const lift = ramp(k, 0, 0.3), blow = ramp(k, 0.9, 0.97);
        const pitch = lerp(lerp(-1.3, -2.95, lift), -0.8, blow) + (1 - blow) * lift * Math.sin(t * 45) * 0.02;
        // a two-hander is raised over the middle of the head, within the left hand's reach
        R.x = lerp(R.x, pitch, w); R.z = lerp(R.z, 0, w); R.y = (two ? 0.7 : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, two ? -0.55 : -0.1, w);
        j.handR.rotation.x += ALONG_ARM * w;
        j.spine.rotation.x += (-0.25 * lift * (1 - blow) + 0.45 * blow) * w;
        j.body.position.y += -0.16 * blow * w;
        j.kneeL.rotation.x += 0.55 * blow * w; j.kneeR.rotation.x += 0.4 * blow * w;
        j.thighL.rotation.x += -0.45 * blow * w;
      } else if (a.name === 'spin') {
        // Steel Tempest: spin with the weapon held out
        j.body.rotation.y += t * 15;
        R.x += -0.1; R.z += -1.35; j.elbowR.rotation.x += 0.7;
        j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9; j.elbowL.rotation.x += 0.5;
        j.spine.rotation.x += 0.12;
        j.kneeL.rotation.x += 0.35; j.kneeR.rotation.x += 0.35; j.thighL.rotation.x += -0.2; j.thighR.rotation.x += -0.2;
        j.body.position.y += -0.06;
      } else if (a.name === 'block') {
        // Raise Shield: side-on behind the shield, left foot forward and low, the shield drawn in tight
        // before the chest and chin, the weapon cocked over it; a blocked blow jolts it all back
        const w = k, stance = w * (1 - move * 0.7), jolt = st.blockHit ?? 0;
        guard = w;
        j.chest.rotation.y += -0.35 * w; j.spine.rotation.y += -0.15 * w;
        j.spine.rotation.x += (0.18 - 0.2 * jolt) * w; j.neck.rotation.x += (-0.2 + 0.1 * jolt) * w;
        // the forearm points forward so the shield (facing out of the fist) faces the foe; the yaw
        // undoes the chest's turn
        const L = j.shoulderL.rotation;
        L.x = lerp(L.x, -0.35 + 0.25 * jolt, w); L.z = lerp(L.z, -0.3, w); L.y = 0.5 * w;
        j.elbowL.rotation.set(lerp(j.elbowL.rotation.x, -1.35 + 0.35 * jolt, w), 0, 0);
        R.x = lerp(R.x, -1.7, w); R.z = lerp(R.z, -0.35, w); R.y = 0.2 * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -1.2, w);
        j.handR.rotation.x += 0.5 * w;
        j.thighL.rotation.x += -0.4 * stance; j.kneeL.rotation.x += 0.5 * stance;
        j.thighR.rotation.x += 0.35 * stance; j.kneeR.rotation.x += 0.45 * stance;
        j.body.position.y += (-0.1 * stance - 0.03 * jolt);
        j.body.position.z += -0.06 * jolt * w;
      } else if (a.name === 'charge') {
        // shoulder into the charge, weapon back
        const w = Math.min(1, k * 6) * (1 - ramp(k, 0.85, 1));
        guard = shield.visible ? w : 0;
        j.spine.rotation.x += 0.45 * w; j.neck.rotation.x += -0.3 * w;
        j.chest.rotation.y += -0.3 * w;
        const L = j.shoulderL.rotation;
        if (shield.visible) { L.x = lerp(L.x, -0.5, w); L.z = lerp(L.z, -0.2, w); L.y = 0.4 * w; j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -1.2, w); }
        else { L.x += -0.7 * w; j.elbowL.rotation.x += 0.3 * w; }
        R.x += 0.6 * w; j.elbowR.rotation.x += 0.4 * w;
      } else if (a.name === 'buff') {
        // war cry: chest out, arms flung wide, head back
        const w = pulse(k, 0, 1);
        j.shoulderL.rotation.z += 0.9 * w; R.z += -0.9 * w;
        j.shoulderL.rotation.x += 0.3 * w; R.x += 0.3 * w;
        j.spine.rotation.x += -0.2 * w; j.neck.rotation.x += -0.35 * w;
      } else if (a.name === 'stagger') {
        // guard broken: thrown back with the arms flung open, then hunched and reeling until it passes
        const hit = 1 - ramp(k, 0, 0.3), reel = ramp(k, 0.1, 0.3) * (1 - ramp(k, 0.8, 1));
        const sway = Math.sin(t * 7) * reel;
        j.spine.rotation.x += -0.45 * hit + 0.3 * reel; j.neck.rotation.x += -0.35 * hit + 0.15 * reel;
        j.spine.rotation.z += 0.12 * sway; j.neck.rotation.z += -0.1 * sway;
        j.shoulderL.rotation.set(-0.2 * reel, 0, 0.9 * hit + 0.35 * reel); j.elbowL.rotation.set(-0.3 - 0.4 * reel, 0, 0);
        R.x += 0.4 * hit + 0.5 * reel; R.z += -0.6 * hit - 0.2 * reel; j.elbowR.rotation.x += 0.4 * hit;
        j.body.position.y += -0.05 * reel;
        j.kneeL.rotation.x += 0.35 * hit + 0.2 * reel; j.kneeR.rotation.x += 0.15 * hit + 0.2 * reel;
        j.thighR.rotation.x += 0.35 * hit;
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        R.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, -1);
    // feet on the floor: a crouch bends the knees instead of sinking the feet, a planted foot lies flat
    else groundFeet(j, 0.07);

    shield.quaternion.slerpQuaternions(SHIELD_SIDE, SHIELD_FRONT, guard);
    shield.position.lerpVectors(SIDE_POS, FRONT_POS, guard);

    // a two-hander: the left hand follows the grip wherever the right arm takes the weapon
    if (two) {
      root.updateMatrixWorld(true);
      offGrip.getWorldPosition(_grip);
      j.chest.worldToLocal(_grip);
      reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL + j.P.handR, _grip, _pole);
    }

    // the mail skirt swings with the legs; the tassets on each side ride their own thigh
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    skirt.update(fL, fR, move, t, dt);
    for (const ta of tassets) ta.g.rotation.x = -(0.12 + Math.max(-0.05, ta.s > 0 ? fL : fR) * 0.75 + move * 0.05);

    // fists round whatever they hold; an empty hand hangs loosely curled
    root.updateMatrixWorld(true);
    const along = (g: THREE.Object3D) => _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
    if (held) hold(handR, grip.getWorldPosition(_hp), along(grip), held.r);
    else poseHand(handR, 0.5 + Math.sin(t * 1.3) * 0.05, 0.1);
    if (offHeld) hold(handL, gripL.getWorldPosition(_hp), along(gripL), offHeld.r);
    else if (two && held) hold(handL, offGrip.getWorldPosition(_hp), along(grip), held.r);
    else poseHand(handL, shield.visible ? 1.35 : 0.5 + Math.sin(t * 1.3 + 1) * 0.05, 0.08);

    if (dt > 0) cape.update(dt, st.velocity ?? ZERO);
    cape.setVisible(st.dead < 0.6);

    // the blade's fuller glows while a skill charges
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.05, setGear,
    get swing() { return side; },
    get reach() { return (ARM + (held?.len ?? 0)) * root.scale.x; },
    worldObjects: [cape.mesh],
    reset: () => cape.reset(),
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
