// The heroes' head: a sculpted face (brow, sockets, nose, cheekbones, lips, a square jaw and chin) with
// a short beard, painted in vertex colours, glossy eyes, and dark wavy hair (a lumpy cap and locks
// falling to the jaw and nape). Built on the rig's head joint; the head centre is ~0.1 m above it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperTube, lod } from './armor';
import { noise3 } from './shapes';
import { part } from './rig';
import { clamp, lerp, mulberry } from '../../util';
import { fur } from '../../core/textures';
import { pbrMaterialMaps } from '../../core/textures';
import type { MaterialKit } from '../../types';

const G = (dx: number, dy: number, s: number): number => Math.exp(-(dx * dx + dy * dy) / (s * s));
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** half-size of the head (m) and its centre above the joint */
const SX = 0.077, SY = 0.106, SZ = 0.097, CY = 0.1, CZ = 0.012;

/** How much beard covers a point of the unit head (0..1): jaw, chin and upper lip, clear of the lips. */
function beardAt(x: number, y: number, z: number): number {
  const face = sm(-0.4, 0.05, z);
  // up the jaw to the cheeks (higher at the sides, a clean line across the cheek)
  const jaw = sm(-0.14, -0.24, y + 0.15 * Math.max(0, 0.6 - Math.abs(x)) - 0.1 * sm(0.5, 0.9, Math.abs(x))) * face;
  const stache = G(x / 1.7, y + 0.33, 0.05) * sm(0.55, 0.8, z);
  const lips = Math.exp(-((x / 0.22) ** 2)) * G(0, y + 0.46, 0.06) * sm(0.6, 0.85, z);
  return clamp(Math.max(jaw, stache) - lips * 1.5, 0, 1);
}

/** Offset (fraction of the radius) of the face's features at a unit direction. */
function relief(x: number, y: number, z: number): number {
  const f = sm(0.15, 0.6, z), ax = Math.abs(x);
  let d = 0;
  d += 0.06 * f * G(ax - 0.27, y - 0.21, 0.15);          // brow ridge
  d += 0.035 * f * G(x, y - 0.19, 0.1);                   // glabella
  d -= 0.08 * f * G(ax - 0.31, y - 0.05, 0.11);           // eye sockets
  d += 0.04 * sm(0, 0.4, z) * G(ax - 0.55, y + 0.08, 0.16); // cheekbones
  d -= 0.03 * f * G(ax - 0.45, y + 0.36, 0.15);           // hollow under them
  // the nose: a ridge from the bridge to a rounded tip, with wings at the nostrils
  const tip = y + 0.22;
  const amp = y > 0.12 ? 0.07 * G(0, y - 0.12, 0.08) : tip > 0 ? 0.27 + (0.07 - 0.27) * (tip / 0.34) : 0.27 * Math.exp(-((tip / 0.06) ** 2));
  const w = 0.07 + 0.05 * clamp(1 - tip / 0.34, 0, 1);
  d += f * amp * Math.exp(-((x / w) ** 2));
  d += 0.07 * f * G(ax - 0.11, y + 0.24, 0.05);
  d -= 0.03 * f * G(ax - 0.19, y + 0.2, 0.05);            // the crease round the nostril wings
  // lips and the line between them, a firm chin
  d += 0.04 * f * Math.exp(-((x / 0.21) ** 2)) * G(0, y + 0.395, 0.04);
  d += 0.045 * f * Math.exp(-((x / 0.2) ** 2)) * G(0, y + 0.5, 0.045);
  d -= 0.03 * f * Math.exp(-((x / 0.2) ** 2)) * G(0, y + 0.45, 0.016);
  d += 0.08 * f * Math.exp(-((x / 0.32) ** 2)) * G(0, y + 0.8, 0.13);
  // square jaw corners
  d += 0.035 * G(ax - 0.72, y + 0.58, 0.16) * sm(-0.4, 0.2, z);
  return d;
}

/** the head's surface at a unit direction, `out` above it by `lift` (fraction of the radius) */
function surf(x: number, y: number, z: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const r = 1 + relief(x, y, z) + lift;
  // the jaw narrows a little to a broad chin with a flat underside, the face is flatter than a sphere,
  // the skull rounder at the back
  const jaw = 1 - 0.2 * sm(-0.1, -1, y) - 0.05 * sm(0.1, -0.4, y) * sm(0.2, 0.8, z);
  const flat = z > 0 ? 1 - 0.12 * sm(0.3, 1, z) : 1.1;
  const under = y < -0.75 ? (y + 0.75) * 0.35 : 0;
  return out.set(x * r * SX * jaw, (y - under) * r * SY + CY, z * r * SZ * flat + CZ);
}

const SKIN: RGB = [0.76, 0.54, 0.43];
const BEARD: RGB = [0.13, 0.088, 0.064];
const BEARD_LIGHT: RGB = [0.27, 0.18, 0.12];
const LIPS: RGB = [0.63, 0.37, 0.34];
const HAIR = 0x2b1b12;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The face's paint, per point of the unit head: skin mottled and warmer on the cheeks and nose, shadow
 * under the eyes and in the lid crease, brows and a short beard in hair strokes, lips with fine lines,
 * the mouth's line, nostrils, the scalp under the hair. Also a height for the normal map (pores, hairs,
 * lip lines) and roughness (an oilier brow and nose, matte hair).
 */
function paint(x: number, y: number, z: number, n: (x: number, y: number, z: number) => number, out: { c: RGB; h: number; r: number }): void {
  const f = sm(0.15, 0.6, z), ax = Math.abs(x);
  const n1 = n(x * 14, y * 14, z * 14), n2 = n(x * 160 + 7, y * 160, z * 160);
  let c: RGB = [SKIN[0] * (0.93 + 0.12 * n1), SKIN[1] * (0.93 + 0.11 * n1), SKIN[2] * (0.93 + 0.1 * n1)];
  let h = n2 * 0.08, r = 0.58 - 0.1 * f * (sm(0.25, 0.45, y) + Math.exp(-((x / 0.12) ** 2)) * sm(-0.3, 0.1, y) * (1 - sm(0.1, 0.25, y))) + 0.05 * n2;
  // warmth on the cheeks, the nose and the ears
  const warm = f * (0.8 * G(ax - 0.5, y + 0.12, 0.17) + 0.9 * G(x, y + 0.2, 0.09)) + 0.6 * sm(0.85, 0.97, ax) * G(0, y, 0.25);
  c = [c[0] * (1 + 0.07 * warm), c[1] * (1 - 0.05 * warm), c[2] * (1 - 0.04 * warm)];
  // under the eyes, and the crease of the upper lid
  const under = f * G(ax - 0.31, y + 0.06, 0.07);
  c = [c[0] * (1 - 0.12 * under), c[1] * (1 - 0.15 * under), c[2] * (1 - 0.08 * under)];
  const crease = f * Math.exp(-(((y - 0.135 - 0.25 * (ax - 0.31) ** 2) / 0.013) ** 2)) * Math.exp(-(((ax - 0.31) / 0.11) ** 2));
  c = mix(c, [c[0] * 0.62, c[1] * 0.55, c[2] * 0.55], crease * 0.8); h -= crease * 0.5;
  // lips, their fine vertical lines, the line between them; the nostrils
  const lip = f * Math.exp(-((x / 0.2) ** 2)) * G(0, y + 0.45, 0.062);
  c = mix(c, LIPS, 0.85 * lip); h += lip * 0.15 * Math.sin(x * 420); r -= lip * 0.2;
  const line = f * Math.exp(-((x / 0.19) ** 2)) * G(0, y + 0.452, 0.011);
  c = mix(c, [0.2, 0.09, 0.08], line * 0.75);
  c = mix(c, [0.16, 0.07, 0.06], 0.8 * f * G(ax - 0.07, y + 0.29, 0.028));
  // brows: strokes slanting out and a little up, thickest at the inner end
  const brow = f * Math.exp(-(((ax - 0.3) / 0.15) ** 2)) * Math.exp(-(((y - 0.25 + 0.1 * (ax - 0.3)) / (0.03 + 0.012 * (0.4 - ax))) ** 2)) * sm(0.05, 0.11, ax);
  if (brow > 0.01) {
    const s = n(ax * 30, (y - ax * 0.25) * 420, z * 30), k = brow * sm(0.3, 0.65, s);
    c = mix(c, BEARD, k * 0.95); h += k * 0.6; r += k * 0.3;
  }
  // the beard: short hairs growing down, denser in the middle of the patch, lighter strands through it
  const b = beardAt(x, y, z);
  if (b > 0.01) {
    const s = n(x * 360, y * 45, z * 360), s2 = n(x * 360 + 3, y * 45 + 9, z * 360 + 5);
    const k = b * (0.5 + 0.5 * sm(0.3, 0.7, s)) * (0.85 + 0.15 * n1);
    c = mix(c, mix(BEARD, BEARD_LIGHT, sm(0.55, 0.8, s2) * 0.6), clamp(k, 0, 0.97)); h += b * s * 0.9; r += b * 0.3;
  }
  // the scalp under the hair
  const thr = z > 0 ? 0.1 + 0.45 * z : 0.1 - 0.65 * -z;
  const sc = sm(thr - 0.02, thr + 0.1, y);
  if (sc > 0) { c = mix(c, mix(BEARD, BEARD_LIGHT, n2 * 0.4), sc); r = lerp(r, 0.7, sc); }
  out.c = c; out.h = h; out.r = clamp(r, 0.25, 0.95);
}

let faceTex: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } | null = null;
/** The painted face, in the sphere's uv layout (u round from -x, v down from the crown); made once. */
function faceMaps() {
  if (faceTex) return faceTex;
  const W = 768, H = 384, n = noise3(3), o = { c: SKIN, h: 0, r: 0.5 };
  const alb = new ImageData(W, H), rou = new ImageData(W, H), nor = new ImageData(W, H), hgt = new Float32Array(W * H);
  for (let row = 0; row < H; row++) {
    const th = ((row + 0.5) / H) * Math.PI, st = Math.sin(th), y = Math.cos(th);
    for (let col = 0; col < W; col++) {
      const ph = ((col + 0.5) / W) * Math.PI * 2, x = -Math.cos(ph) * st, z = Math.sin(ph) * st, i = row * W + col;
      paint(x, y, z, n, o);
      alb.data[i * 4] = clamp(o.c[0], 0, 1) * 255; alb.data[i * 4 + 1] = clamp(o.c[1], 0, 1) * 255; alb.data[i * 4 + 2] = clamp(o.c[2], 0, 1) * 255; alb.data[i * 4 + 3] = 255;
      rou.data[i * 4] = rou.data[i * 4 + 1] = rou.data[i * 4 + 2] = o.r * 255; rou.data[i * 4 + 3] = 255;
      hgt[i] = o.h;
    }
  }
  for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
    const i = row * W + col, l = row * W + (col + W - 1) % W, rr = row * W + (col + 1) % W;
    const u = Math.max(0, row - 1) * W + col, d = Math.min(H - 1, row + 1) * W + col;
    const dx = (hgt[rr] - hgt[l]) * 2, dy = (hgt[d] - hgt[u]) * 2, len = Math.hypot(dx, dy, 1);
    nor.data[i * 4] = (-dx / len * 0.5 + 0.5) * 255; nor.data[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255; nor.data[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; nor.data[i * 4 + 3] = 255;
  }
  const tex = (d: ImageData, srgb: boolean) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d')!.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  return (faceTex = { map: tex(alb, true), normalMap: tex(nor, false), roughnessMap: tex(rou, false) });
}

export interface Head { face: THREE.Mesh; hair: THREE.Mesh; eyes: THREE.Mesh[]; /** the head's group (scaled), for anything worn on it */ group: THREE.Group }

/** head size relative to the rig: a heroic proportion, a little over life */
const HEAD_SCALE = 1.12;

/** Build the head on `headJoint` (the rig's head joint); `beard`: a full beard hanging that far (m) below the chin. */
export function buildHead(headJoint: THREE.Object3D, kit: MaterialKit, seed = 7, o: { beard?: number } = {}): Head {
  const head = new THREE.Group();
  head.scale.setScalar(HEAD_SCALE);
  headJoint.add(head);
  const rng = mulberry(seed);
  const F = faceMaps();
  const skin = kit.rim({ roughness: 1, map: F.map, normalMap: F.normalMap, roughnessMap: F.roughnessMap, normalScale: new THREE.Vector2(0.35, 0.35) }, 0x6a2a1c, 0.25);
  const plainSkin = kit.rim({ color: new THREE.Color().setRGB(...SKIN, THREE.SRGBColorSpace), roughness: 0.6 }, 0x6a2a1c, 0.25);
  const lidSkin = kit.rim({ color: new THREE.Color().setRGB(SKIN[0] * 0.86, SKIN[1] * 0.8, SKIN[2] * 0.8, THREE.SRGBColorSpace), roughness: 0.55 }, 0x6a2a1c, 0.2);
  const lash = kit.std({ color: 0x120a07, roughness: 0.8 });
  const eyeMat = kit.std({ vertexColors: true, roughness: 0.1 });
  const hm = pbrMaterialMaps(fur(), 2, 0.8);
  const hairMat = kit.std({ color: HAIR, roughness: 0.5, map: hm.map, normalMap: hm.normalMap, normalScale: hm.normalScale, side: THREE.DoubleSide });

  // --- the face: a sphere pushed into shape (its uvs stay put, so the paint follows the features)
  const geo = new THREE.SphereGeometry(1, lod(64, 36), lod(48, 28));
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    surf(x, y, z, 0.03 * beardAt(x, y, z), v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const face = part(geo, skin, head);
  // ears: a flattened shell with a thicker rim, a little behind the middle
  const ears: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    ears.push(new THREE.SphereGeometry(1, 14, 10).scale(0.008, 0.031, 0.019).rotateY(s * 0.35).rotateZ(s * 0.1).translate(s * SX * 0.97, CY + 0.004, CZ - 0.01));
    ears.push(new THREE.TorusGeometry(0.016, 0.0035, 5, 14, Math.PI * 1.3).scale(1, 1.55, 1).rotateY(s * (Math.PI / 2 - 0.35)).rotateX(-0.2).translate(s * SX * 1.02, CY + 0.006, CZ - 0.012));
  }
  part(mergeGeometries(ears.map((e) => e.toNonIndexed()))!, plainSkin, head);

  // --- eyes: white with a grey-blue iris and a dark pupil, set in the sockets under lids with lashes
  const eyes: THREE.Mesh[] = [], lids: THREE.BufferGeometry[] = [], lashes: THREE.BufferGeometry[] = [];
  const ER = 0.0115;
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(ER, 20, 14), ep = e.attributes.position, ec = new Float32Array(ep.count * 3);
    for (let i = 0; i < ep.count; i++) {
      const zz = ep.getZ(i) / ER;
      // pupil, iris (a darker ring at its rim), the white a little pinker towards the corners
      const k = zz > 0.955 ? [0.01, 0.01, 0.015] : zz > 0.83 ? (zz > 0.86 ? [0.2, 0.27, 0.32] : [0.08, 0.1, 0.12]) : [0.6 - (0.83 - zz) * 0.1, 0.55 - (0.83 - zz) * 0.15, 0.52 - (0.83 - zz) * 0.15];
      ec[i * 3] = k[0]; ec[i * 3 + 1] = k[1]; ec[i * 3 + 2] = k[2];
    }
    e.setAttribute('color', new THREE.BufferAttribute(ec, 3));
    const ux = s * 0.31, uy = 0.05;
    surf(ux, uy, Math.sqrt(1 - ux * ux - uy * uy), 0, v);
    // the eyeball's front stands a few mm proud of the socket
    const at = new THREE.Vector3(v.x, v.y, v.z - ER + 0.006);
    const m = part(e, eyeMat, head, at.x, at.y, at.z);
    m.castShadow = false;
    eyes.push(m);
    // lids: shells a little larger than the eye over its top and bottom, leaving an almond opening;
    // lashes along the upper lid's edge
    lids.push(new THREE.SphereGeometry(ER * 1.08, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.39).rotateX(0.14).translate(at.x, at.y, at.z));
    lids.push(new THREE.SphereGeometry(ER * 1.05, 18, 6, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28).rotateX(-0.15).translate(at.x, at.y, at.z));
    lashes.push(new THREE.SphereGeometry(ER * 1.13, 18, 1, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.37, Math.PI * 0.04).rotateX(0.14).translate(at.x, at.y, at.z));
  }
  part(mergeGeometries(lids)!, lidSkin, head).castShadow = false;
  part(mergeGeometries(lashes)!, lash, head).castShadow = false;

  // --- hair: a lumpy cap over the skull (thinning to nothing at the hairline) and wavy locks
  // the line it grows from: the forehead in front, above the ears at the sides, the nape behind
  const hairline = (_x: number, y: number, z: number) => {
    const thr = z > 0 ? 0.1 + 0.45 * z : 0.1 - 0.65 * -z;
    return sm(thr, thr + 0.2, y);
  };
  const cap = new THREE.SphereGeometry(1, lod(48, 28), lod(36, 20)), cp = cap.attributes.position;
  const lump = (x: number, y: number, z: number) => Math.sin(x * 9 + y * 4) * Math.sin(z * 8 - y * 5) * 0.5 + 0.5;
  const keep = new Uint8Array(cp.count);
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), h = clamp(hairline(x, y, z), 0, 1);
    surf(x, y, z, (0.08 + 0.08 * lump(x, y, z)) * h * (1 - 0.6 * sm(0.3, 0.9, z) * (1 - sm(0.55, 0.85, y))) - 0.02, v);
    cp.setXYZ(i, v.x, v.y, v.z);
    keep[i] = h > 0.02 ? 1 : 0;
  }
  const idx = cap.index!.array, kept: number[] = [];
  for (let i = 0; i < idx.length; i += 3) if (keep[idx[i]] || keep[idx[i + 1]] || keep[idx[i + 2]]) kept.push(idx[i], idx[i + 1], idx[i + 2]);
  cap.setIndex(kept);
  cap.computeVertexNormals();
  const locks: THREE.BufferGeometry[] = [cap.toNonIndexed()];
  cap.dispose();
  const P = (x: number, y: number, z: number, lift: number) => { const l = Math.hypot(x, y, z); return surf(x / l, y / l, z / l, lift, new THREE.Vector3()); };
  const dir = (az: number, el: number, lift: number) => P(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), lift);
  /**
   * A lock rooted at `az0` round the head (0 = the forehead) and `el0` up it, swept back over the skull
   * clear of the face (round towards the back faster than it falls) to `az1`, `el1`, then hanging `fall` m
   * lower, curling out at the end.
   */
  const lock = (az0: number, el0: number, az1: number, el1: number, fall: number, wave: number, r: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push(dir(az0 + (az1 - az0) * Math.sqrt(t), el0 + (el1 - el0) * t ** 1.5, 0.15 + 0.03 * Math.sin(t * 4 + az0 * 5) + wave * 2 * Math.sin(t * 9 + az0)));
    }
    const last = pts[pts.length - 1], out = new THREE.Vector3(last.x, 0, last.z - CZ).normalize();
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      pts.push(new THREE.Vector3(last.x + out.x * (0.01 * t + 0.012 * t * t), last.y - fall * t, last.z + out.z * (0.01 * t + 0.012 * t * t)).addScaledVector(out, Math.sin(t * 5 + az0) * wave));
    }
    locks.push(taperTube(pts, (t) => r * (1 - t * 0.7) * (0.85 + 0.15 * Math.sin(t * 11 + az0)), lod(11, 5), 4).toNonIndexed());
  };
  const nLocks = lod(90, 30);
  for (let i = 0; i < nLocks; i++) {
    const az0 = (rng() - 0.5) * Math.PI * 1.9, side = Math.sign(az0) || 1;
    const el0 = 0.55 + rng() * 0.8;
    // swept back round the side of the head, ending at the jaw line behind the ear or at the nape
    const az1 = side * Math.min(Math.PI, Math.abs(az0) * 0.45 + 1.95 + rng() * 0.9);
    lock(az0, el0, az1, -0.3 - rng() * 0.35, 0.03 + rng() * 0.07, 0.004 + rng() * 0.005, (0.006 + rng() * 0.005) * Math.sqrt(90 / nLocks));
  }
  // one loose strand fallen forward over the brow
  locks.push(taperTube([dir(0.25, 1.1, 0.14), dir(0.4, 0.75, 0.13), dir(0.5, 0.55, 0.1), dir(0.62, 0.4, 0.07)], (t) => 0.007 * (1 - t * 0.7), 10, 4).toNonIndexed());
  // a full beard: locks from the jaw, chin and cheeks falling onto the chest, fuller in the middle,
  // tapering to a rough point
  if (o.beard) {
    const nb = lod(70, 24);
    for (let i = 0; i < nb; i++) {
      const u = (rng() * 2 - 1), x = u * 0.75, y = -0.35 - (1 - Math.abs(u)) * 0.45 - rng() * 0.1, zz = Math.sqrt(Math.max(0.02, 1 - x * x - y * y));
      const root = surf(x, y, zz, 0.02, new THREE.Vector3());
      const len = o.beard * (0.45 + 0.55 * (1 - Math.abs(u) ** 1.5)) * (0.8 + rng() * 0.3);
      const out = new THREE.Vector3(x * 0.4, 0, 0.6).normalize();
      const pts = [root, root.clone().addScaledVector(out, 0.012).add(new THREE.Vector3(0, -0.015, 0))];
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, w = Math.sin(t * 5 + i) * 0.006;
        // drawn in towards the middle as it falls, the point a little forward
        pts.push(new THREE.Vector3(root.x * (1 - t * 0.55) + w, root.y - 0.015 - len * t, root.z + 0.012 + 0.02 * t - 0.012 * t * t));
      }
      locks.push(taperTube(pts, (t) => 0.011 * (1 - t * 0.8) * (0.8 + 0.2 * Math.sin(t * 9 + i)), lod(10, 5), 4).toNonIndexed());
    }
  }
  for (const g of locks) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); }
  const hair = part(mergeGeometries(locks)!, hairMat, head);
  for (const g of locks) g.dispose();
  return { face, hair, eyes, group: head };
}
