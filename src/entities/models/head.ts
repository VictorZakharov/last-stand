// The heroes' head: the sculpted skin of models/face.ts (meshed on its ray grid, painted in the loading
// workers), glossy eyes under lids with lashes, sculpted ears, hair and a long beard as hair cards, and
// the neck below it. Built on the rig's head joint, in metres, the chin's underside level with the joint;
// the head is 1/7.5 of the heroes' stature (a realistic figure: an ideal one is 8 heads, a heroic 8.5).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lod } from './armor';
import { part } from './rig';
import { clamp, lerp, mulberry } from '../../util';
import { fur, faceCanvases, pbrMaterialMaps } from '../../core/textures';
import { FACES, LOOKS, EYE, origin, eyeOpening, headGrid, headSDF, gridDir, scalp, type FaceShape, type HeadGrid } from './face';
import type { MaterialKit } from '../../types';

/** metres per millimetre of the face's frame: the head is 1/7.5 of the heroes' stature */
export const HEAD_MM = 0.2421 / 228;
/** the point of the face's frame that sits on the head joint: under the middle of the skull */
const ORIGIN = { x: 0, y: 0, z: 5 };

/** A point of the face's frame (mm: up from the chin, forward from the ear canals) in the head group's
 *  space (m), for placing anything by the head's anatomy. */
export const toGroup = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 =>
  out.set((x - ORIGIN.x) * HEAD_MM, (y - ORIGIN.y) * HEAD_MM, (z - ORIGIN.z) * HEAD_MM);

/** bare skin away from the painted face (ears, neck): one material setup, so one shader */
const plainSkin = (kit: MaterialKit, who: keyof typeof FACES) => {
  const s = LOOKS[who].skin;
  return kit.rim({ color: new THREE.Color().setRGB(s[0] * 0.97, s[1] * 0.97, s[2] * 0.97, THREE.SRGBColorSpace), roughness: 0.6 }, 0x6a2a1c, 0.25);
};

const grids = new Map<string, HeadGrid>();
/** the skin's ray grid for a face at the current detail, cast once */
function gridFor(name: keyof typeof FACES): HeadGrid {
  const nu = lod(112, 40), nv = lod(88, 32), key = `${name}:${nu}x${nv}`;
  let g = grids.get(key);
  if (!g) grids.set(key, (g = headGrid(FACES[name], nu, nv)));
  return g;
}

/** the skin on its grid: uvs follow the grid, so the paint (painted on the same grid) lines up */
function skinGeometry(g: HeadGrid): THREE.BufferGeometry {
  const W = g.nu + 1, n = W * (g.nv + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), d = { x: 0, y: 0, z: 0 };
  const p = new THREE.Vector3(), C = { x: 0, y: 0, z: 0 };
  for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
    const k = j * W + i, r = g.r[k];
    gridDir(g.az[i], g.el[j], d);
    origin(g.el[j], C);
    toGroup(C.x + d.x * r, C.y + d.y * r, C.z + d.z * r, p);
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    uv[k * 2] = i / g.nu; uv[k * 2 + 1] = j / g.nv;
  }
  const idx: number[] = [];
  for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
    idx.push(a, b, c, a, c, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const maps = new Map<string, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();
/** the painted face's textures (painted by the loading workers, see face.ts faceData), made once per face */
function faceMaps(who: keyof typeof FACES) {
  let m = maps.get(who);
  if (m) return m;
  const C = faceCanvases(who);
  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    // round the head the paint wraps; from the crown to the neck it doesn't
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
    return t;
  };
  maps.set(who, (m = { map: tex(C.albedo, true), normalMap: tex(C.normal, false), roughnessMap: tex(C.rough, false) }));
  return m;
}

let eyeTex: Map<string, THREE.CanvasTexture> | null = null;
/** An eye seen from the front (planar uvs): sclera, a dark limbal ring, a fibrous iris, the pupil. */
function eyeMap(iris: [number, number, number]): THREE.CanvasTexture {
  eyeTex ??= new Map();
  const key = iris.join();
  const hit = eyeTex.get(key);
  if (hit) return hit;
  const S = 128, img = new ImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = 1 - (y + 0.5) / S * 2, r = Math.hypot(u, v), a = Math.atan2(v, u);
    // radius in mm on the eye's face (the texture spans the eyeball's 24 mm)
    const mm = r * EYE.r;
    let c: number[];
    if (mm < 1.9) c = [0.02, 0.018, 0.02];
    else if (mm < 5.9) {
      const k = (mm - 1.9) / 4, fib = 0.75 + 0.25 * Math.sin(a * 37 + Math.sin(a * 11) * 2) * Math.sin(a * 23 + mm), ring = 1 - 0.45 * Math.exp(-(((mm - 2.2) / 0.5) ** 2));
      const edge = 1 - 0.6 * clamp((k - 0.8) / 0.2, 0, 1);
      c = iris.map((ch, i) => ch * fib * ring * edge * (0.75 + 0.5 * k) + (i === 0 ? 0.04 : 0.02) * (1 - k));
    } else if (mm < 6.4) c = [0.08, 0.08, 0.09];
    else {
      // the white, greyer towards its edge and a little pink in the corners
      const k = clamp((mm - 6.4) / 5, 0, 1);
      c = [0.78 - 0.14 * k + 0.05 * Math.abs(u) * k, 0.74 - 0.18 * k, 0.72 - 0.18 * k];
    }
    const i = (y * S + x) * 4;
    img.data[i] = clamp(c[0], 0, 1) * 255; img.data[i + 1] = clamp(c[1], 0, 1) * 255; img.data[i + 2] = clamp(c[2], 0, 1) * 255; img.data[i + 3] = 255;
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.getContext('2d')!.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  eyeTex.set(key, t);
  return t;
}

/** an eyeball facing +z with the cornea's bulge over the iris, planar uvs */
function eyeGeometry(): THREE.BufferGeometry {
  const R = EYE.r * HEAD_MM, g = new THREE.SphereGeometry(R, 24, 18).rotateX(Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rr = Math.hypot(x, y) / R;
    // the cornea: a clear dome over the iris, standing ~1.5 mm proud
    if (z > 0) p.setZ(i, z + 1.4 * HEAD_MM * Math.max(0, 1 - (rr / 0.52) ** 2) ** 1.5);
    uv.setXY(i, x / R * 0.5 + 0.5, y / R * 0.5 + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

export interface Head {
  /** on the head joint, in metres: anything worn on the head goes here */
  group: THREE.Group;
  face: THREE.Mesh; eyes: THREE.Mesh[];
  /** the skin (or `lift` mm above it) towards `az` round the head (0 the face, +x the left) and `el` up */
  surface(az: number, el: number, lift?: number, out?: THREE.Vector3): THREE.Vector3;
  /** how far forward the skin is (mm, the face's frame) down the middle of the face at height `y` mm */
  midZ(y: number): number;
}

/**
 * Build the head of `who` on `headJoint` (the rig's head joint). `hair`: a cap of hair over the scalp
 * with locks swept back behind the ears to the nape (under a helmet leave it out: the scalp is painted);
 * `beard`: a full beard hanging that far (mm) below the chin.
 */
export function buildHead(headJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, o: { beard?: number; hair?: boolean } = {}): Head {
  const F: FaceShape = FACES[who];
  const head = new THREE.Group();
  headJoint.add(head);
  const g = gridFor(who);
  const M = faceMaps(who);
  const skin = kit.rim({ roughness: 1, map: M.map, normalMap: M.normalMap, roughnessMap: M.roughnessMap, normalScale: new THREE.Vector2(0.5, 0.5) }, 0x6a2a1c, 0.25);
  const face = part(skinGeometry(g), skin, head);

  // --- eyes: glossy balls in the sockets behind the lids, and lashes along the upper lids
  const eyeMat = kit.std({ map: eyeMap(F.iris), roughness: 0.08 });
  const lash = kit.std({ color: 0x1c120c, roughness: 0.9, side: THREE.DoubleSide });
  const eyes: THREE.Mesh[] = [], lashes: number[] = [];
  const eg = eyeGeometry();
  for (const s of [1, -1]) {
    const m = part(eg, eyeMat, head);
    toGroup(s * EYE.x, EYE.y, EYE.z, m.position);
    m.castShadow = false;
    eyes.push(m);
    // lashes: a thin fringe along the upper lid's edge, curving out and up
    const N = 14, row: THREE.Vector3[][] = [];
    for (let k = 0; k <= N; k++) {
      const t = lerp(-0.92, 0.95, k / N), xe = t * 15 - 0.5;
      let ye = 0;
      // the lid's edge: where the opening's top crosses this column
      for (let y = 8; y > -2; y -= 0.05) if (eyeOpening(xe, y, F) <= 0) { ye = y; break; }
      const R = EYE.r + 1.9, zz = Math.sqrt(Math.max(0, R * R - xe * xe - ye * ye));
      const len = 2.6 * (1 - 0.5 * Math.abs(t - 0.3));
      const root = [s * (EYE.x + xe), EYE.y + ye + 0.2, EYE.z + zz];
      const tipP = [s * (EYE.x + xe * 1.04), EYE.y + ye + len * 0.8, EYE.z + zz + len * 0.6];
      row.push([toGroup(root[0], root[1], root[2]), toGroup(tipP[0], tipP[1], tipP[2])]);
    }
    for (let k = 0; k < N; k++) {
      const [a0, a1] = row[k], [b0, b1] = row[k + 1];
      lashes.push(...a0.toArray(), ...b0.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...a1.toArray());
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lashes, 3));
  lg.computeVertexNormals();
  part(lg, lash, head).castShadow = false;

  // --- ears
  const earMat = plainSkin(kit, who);
  for (const s of [1, -1]) part(earGeometry(s, F), earMat, head);

  const surface = (az: number, el: number, lift = 0, out = new THREE.Vector3()) => {
    const d = gridDir(az, el, { x: 0, y: 0, z: 0 }), C = origin(el, { x: 0, y: 0, z: 0 });
    const r = radiusAt(g, az, el) + lift;
    return toGroup(C.x + d.x * r, C.y + d.y * r, C.z + d.z * r, out);
  };

  // --- hair: a cap with some body over the scalp, locks of hair cards swept back over it to the nape;
  // a full beard of cards hanging from the jaw and chin
  const L = LOOKS[who], rng = mulberry(7);
  const hairCol = new THREE.Color().setRGB(L.hair[0] * 1.9, L.hair[1] * 1.9, L.hair[2] * 1.9, THREE.SRGBColorSpace);
  const cards = kit.std({ color: hairCol, map: strandMap(), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.55 });
  const lockGeo: THREE.BufferGeometry[] = [];
  const skullC = toGroup(0, 128, -12);
  if (o.hair) {
    const hm = pbrMaterialMaps(fur(), 3, 0.8);
    const capMat = kit.std({ color: new THREE.Color().setRGB(L.hair[0] * 1.6, L.hair[1] * 1.6, L.hair[2] * 1.6, THREE.SRGBColorSpace), roughness: 0.6, map: hm.map, normalMap: hm.normalMap, normalScale: hm.normalScale });
    const W = g.nu + 1, pos = new Float32Array((g.nv + 1) * W * 3), uv = new Float32Array((g.nv + 1) * W * 2), keep = new Uint8Array((g.nv + 1) * W);
    const d = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 }, q = new THREE.Vector3();
    for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
      const k = j * W + i, r = g.r[k];
      gridDir(g.az[i], g.el[j], d); origin(g.el[j], C);
      const x = C.x + d.x * r, y = C.y + d.y * r, z = C.z + d.z * r, sc = scalp(Math.abs(x), y, z);
      // thicker on top, combed into shallow ridges running back
      // (starting behind the painted hairline, its edge sunk into the skin: the grid's steps never show)
      const lift = sm(0.9, 1, sc + 0.02 * sm(1, 0, sc)) * (6 + 6 * sm(120, 200, y) + 2 * Math.sin(Math.atan2(x, z) * 18 + y * 0.05)) - 1.2;
      toGroup(x + d.x * lift, y + d.y * lift, z + d.z * lift, q);
      pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
      uv[k * 2] = i / g.nu * 6; uv[k * 2 + 1] = j / g.nv * 3;
      keep[k] = sc > 0.85 ? 1 : 0;
    }
    const idx: number[] = [];
    for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
      if (keep[a] || keep[b] || keep[c] || keep[e]) idx.push(a, b, c, a, c, e);
    }
    const cap = new THREE.BufferGeometry();
    cap.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    cap.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    cap.setIndex(idx);
    cap.computeVertexNormals();
    part(cap, capMat, head);
    // locks: rooted over the crown and down the sides, swept back round the head (round towards the
    // back faster than they fall) to the jaw line behind the ear or the nape, then hanging a little lower
    // with an outward curl; three layers
    const n = lod(120, 40);
    for (let i = 0; i < n; i++) {
      const layer = i % 3, az0 = (rng() - 0.5) * Math.PI * 1.7, side = Math.sign(az0) || 1;
      const el0 = 0.7 + rng() * 0.65;
      const az1 = side * Math.min(Math.PI * 0.98, Math.abs(az0) * 0.4 + 2.0 + rng() * 0.95), el1 = -0.3 - rng() * 0.35;
      const lift = 7 + layer * 4 + rng() * 3, pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        pts.push(surface(az0 + (az1 - az0) * Math.sqrt(t), el0 + (el1 - el0) * t ** 1.5, lift + 3 * Math.sin(t * 3 + az0 * 4)));
      }
      const last = pts[6], out = new THREE.Vector3(last.x, 0, last.z - skullC.z).normalize(), fall = (40 + rng() * 60) * HEAD_MM;
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        pts.push(last.clone().add(new THREE.Vector3(out.x * t * t * 12 * HEAD_MM, -fall * t, out.z * t * t * 12 * HEAD_MM)));
      }
      const w = (11 + rng() * 7) * HEAD_MM;
      lockGeo.push(hairCard(pts, (t) => w * (1 - 0.5 * t), skullC, lod(14, 6), (rng() - 0.5) * 0.8));
    }
  }
  if (o.beard) {
    // the beard: cards from the jaw, chin and moustache falling onto the chest, longest at the chin and
    // gathering to a rough point, curving a little forward; three layers
    const n = lod(96, 32), chinC = toGroup(0, 20, 20);
    for (let i = 0; i < n; i++) {
      const layer = i % 3, u = rng() * 2 - 1, az = u * 1.3, el = -0.5 - (1 - Math.abs(u)) * 0.5 - rng() * 0.1;
      const root = surface(az, el, 2 + layer * 2.5);
      const len = o.beard * (0.35 + 0.65 * (1 - Math.abs(u) ** 1.4)) * (0.75 + rng() * 0.35) * HEAD_MM;
      const pts = [root];
      for (let k = 1; k <= 6; k++) {
        const t = k / 6;
        // out and down off the jaw first, then drawn in towards the middle as it falls, the point a
        // little forward
        const spread = 1 + 0.25 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5) - 0.75 * t * t;
        pts.push(new THREE.Vector3(root.x * spread, root.y - len * t, root.z + (4 + 16 * t - 10 * t * t) * HEAD_MM + Math.sin(t * 4 + i) * 2 * HEAD_MM));
      }
      const w = (13 + rng() * 8) * HEAD_MM;
      lockGeo.push(hairCard(pts, (t) => w * (1 - 0.55 * t), chinC, lod(10, 5), (rng() - 0.5) * 0.7));
    }
  }
  if (lockGeo.length) {
    const m = part(mergeGeometries(lockGeo)!, cards, head);
    for (const x of lockGeo) x.dispose();
    m.castShadow = true;
  }
  const midZ = (y: number) => { let z = 140; while (z > 0 && headSDF(0, y, z, F) > 0) z -= 0.25; return z; };
  return { group: head, face, eyes, surface, midZ };
}

const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** the skin's distance from the ray origin towards (az, el), interpolated from the grid */
function radiusAt(g: HeadGrid, az: number, el: number): number {
  const find = (arr: Float64Array, v: number) => {
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m; else hi = m; }
    return lo + clamp((v - arr[lo]) / (arr[hi] - arr[lo] || 1), 0, 1);
  };
  const a = Math.atan2(Math.sin(az), Math.cos(az));
  const fi = find(g.az, a), fj = find(g.el, clamp(el, -Math.PI / 2, Math.PI / 2));
  const i0 = Math.min(Math.floor(fi), g.nu - 1), j0 = Math.min(Math.floor(fj), g.nv - 1), W = g.nu + 1, u = fi - i0, v = fj - j0;
  const r = (i: number, j: number) => g.r[j * W + i];
  return (r(i0, j0) * (1 - u) + r(i0 + 1, j0) * u) * (1 - v) + (r(i0, j0 + 1) * (1 - u) + r(i0 + 1, j0 + 1) * u) * v;
}

// --- ears ------------------------------------------------------------------------------------------

/** the ear's outline round the middle of its bowl (degrees round from forward, towards the top: mm) */
const EAR_OUTLINE: [number, number][] = [[0, 12], [45, 16], [70, 24], [92, 33], [118, 31], [145, 26], [182, 21], [220, 21], [250, 26], [272, 29], [298, 23], [326, 15], [360, 12]];
function earR(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  for (let i = 1; i < EAR_OUTLINE.length; i++) {
    const [a1, r1] = EAR_OUTLINE[i];
    if (a <= a1) { const [a0, r0] = EAR_OUTLINE[i - 1], t = (a - a0) / (a1 - a0); return lerp(r0, r1, t * t * (3 - 2 * t)); }
  }
  return EAR_OUTLINE[0][1];
}
/** a bump rising from 0 at a to 1 halfway and back to 0 at b */
const bump = (x: number, a: number, b: number): number => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
/** 1 inside the angular window [a, b] (degrees), easing over `e` */
const win = (deg: number, a: number, b: number, e = 20): number => {
  const d = ((deg - a) % 360 + 360) % 360, w = ((b - a) % 360 + 360) % 360;
  return d > w ? 0 : clamp(Math.min(d, w - d) / e, 0, 1);
};

/**
 * An ear (ANSUR II: 64 mm long, 36 wide): a rolled rim (the helix) round a shallow groove, a ridge
 * inside it, a deep bowl leading to the ear canal with the small flap in front of it, a soft lobe.
 * Built in the ear's own frame (u forward, v up, the relief out from the head), set on the side of the
 * head at the ear canal, its top tilted back and its back edge standing off the head.
 */
function earGeometry(s: number, F: FaceShape): THREE.BufferGeometry {
  const nt = lod(40, 20), nr = lod(12, 6), thick = 3.4;
  // the side of the head at the ear canal
  let sx = 40;
  while (sx < 90 && headSDF(sx, 97, 0, F) < 0) sx += 0.5;
  const tilt = 0.26, flare = 0.5, cu = -8, cv = 3;
  const place = (u: number, v: number, h: number, out: THREE.Vector3) => {
    // tilt the ear back, then flare it out from the head about its front edge
    const u1 = u * Math.cos(tilt) - v * Math.sin(tilt), v1 = u * Math.sin(tilt) + v * Math.cos(tilt);
    const back = Math.max(0, -u1);
    const out1 = h + back * Math.sin(flare), u2 = u1 + (u1 < 0 ? back * (1 - Math.cos(flare)) : 0);
    return toGroup(s * (sx + 4 + out1), 97 + v1, u2, out);
  };
  const front: number[] = [], backP: number[] = [], v = new THREE.Vector3();
  for (let j = 0; j <= nr; j++) {
    const rho = j / nr;
    for (let i = 0; i <= nt; i++) {
      const deg = (i / nt) * 360, a = deg * Math.PI / 180, R = earR(deg) * rho;
      const lobe = win(deg, 245, 305, 25), tragus = win(deg, 330, 30, 18), back = win(deg, 80, 250, 30);
      // relief: the rolled rim, the groove inside it, the ridge, the bowl, the flap before the canal
      let h = 3.3 * bump(rho, 0.76, 1.08) * (1 - lobe) + 0.6 * bump(rho, 0.62, 0.8);
      h += 2.6 * bump(rho, 0.44, 0.7) * (0.35 + 0.65 * back) * (1 - lobe);
      h += 2.4 * bump(rho, 0.4, 0.7) * win(deg, 215, 250, 12);
      h -= 7.5 * Math.max(0, 1 - rho / 0.5) ** 1.4 * (1 + 0.25 * win(deg, 330, 30, 30));
      h += 3.4 * bump(rho, 0.5, 1.02) * tragus;
      h += 1.2 * lobe * sm(0.3, 0.8, rho);
      const u = cu + Math.cos(a) * R, vv = cv + Math.sin(a) * R;
      place(u, vv, h, v); front.push(v.x, v.y, v.z);
      place(u, vv, h - thick * (1 + 0.6 * lobe), v); backP.push(v.x, v.y, v.z);
    }
  }
  // one indexed mesh (smooth normals): the front faces out from the head, the back towards it, a rim
  // joins them round the outline; the right ear is the mirror image, so its winding turns over
  const W = nt + 1, off = front.length / 3, idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, out: boolean) => {
    if (out !== s < 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let j = 0; j < nr; j++) for (let i = 0; i < nt; i++) {
    const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
    quad(a, b, c, d, true);
    quad(off + a, off + b, off + c, off + d, false);
  }
  const rim = nr * W;
  for (let i = 0; i < nt; i++) quad(rim + i, off + rim + i, off + rim + i + 1, rim + i + 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...front, ...backP], 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- hair ----------------------------------------------------------------------------------------

let strandTex: THREE.CanvasTexture | null = null;
/**
 * A lock of hair for the hair cards: fine strands running down the texture (v along the lock), each
 * its own shade, thinning towards the card's sides and its tip, on transparency.
 */
function strandMap(): THREE.CanvasTexture {
  if (strandTex) return strandTex;
  const W = 128, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, rng = mulberry(29);
  c.clearRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    // strands thin out towards the card's sides, some end early (a ragged tip)
    const e = rng() * 2 - 1, x0 = W / 2 + Math.sign(e) * Math.abs(e) ** 1.4 * W * 0.48;
    const len = H * (0.45 + rng() * 0.55), wv = (rng() - 0.5) * 12, w = 0.9 + rng() * 1.8;
    const l = 0.35 + rng() * 0.65;
    c.strokeStyle = `rgb(${Math.round(255 * l)},${Math.round(255 * l)},${Math.round(255 * l)})`;
    c.lineWidth = w;
    c.beginPath();
    for (let y = 0; y <= len; y += 8) {
      const x = x0 + Math.sin(y / H * 5 + k) * wv * (y / H);
      if (y === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  // the tip thins out
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.65, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  strandTex = new THREE.CanvasTexture(cv);
  strandTex.colorSpace = THREE.SRGBColorSpace; strandTex.anisotropy = 4;
  return strandTex;
}

/**
 * A hair card: a ribbon `width(t)` wide along a curve through `pts`, lying flat on the head (its face
 * turned out from `centre`), the strands running along it.
 */
function hairCard(pts: THREE.Vector3[], width: (t: number) => number, centre: THREE.Vector3, segs: number, twist = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3(), T = new THREE.Vector3(), O = new THREE.Vector3(), X = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p); curve.getTangentAt(t, T);
    O.subVectors(p, centre).normalize();
    X.crossVectors(T, O).normalize().applyAxisAngle(T, twist * t);
    const w = width(t) / 2;
    pos.push(p.x - X.x * w, p.y - X.y * w, p.z - X.z * w, p.x + X.x * w, p.y + X.y * w, p.z + X.z * w);
    uv.push(0, 1 - t, 1, 1 - t);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- the neck -------------------------------------------------------------------------------------

/**
 * The neck on the rig's neck joint, up into the head (whose own skin carries on under the jaw): oval,
 * a man's neck (ANSUR II: 40 cm round), the two muscles from behind the ears to the breastbone showing
 * as a V from the front, the Adam's apple. `len`: the neck joint to the head joint (m).
 */
export function buildNeck(neckJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, len: number): THREE.Mesh {
  const rings = 10, segs = lod(28, 14), pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, y = lerp(-0.03, len + 0.012, t);
    // wider at the base, set a little back at the top (under the skull), in mm
    const rx = lerp(66, 57, sm(0, 1, t)), rz = lerp(62, 52, sm(0, 1, t)), cz = lerp(-2, -13, t);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2 - Math.PI, ang = Math.abs(a);
      // the muscles running from the back of the jaw (top) to the breastbone (bottom), the Adam's apple
      const scm = 3 * Math.exp(-(((ang - lerp(0.45, 1.3, t)) / 0.28) ** 2));
      const adam = 5 * Math.exp(-((a / 0.3) ** 2)) * Math.exp(-(((t - 0.55) / 0.16) ** 2));
      pos.push(Math.sin(a) * (rx + scm) * HEAD_MM, y, (cz + Math.cos(a) * (rz + scm + adam)) * HEAD_MM);
    }
  }
  const W = segs + 1;
  for (let k = 0; k < rings; k++) for (let i = 0; i < segs; i++) { const a = k * W + i; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return part(g, plainSkin(kit, who), neckJoint);
}
