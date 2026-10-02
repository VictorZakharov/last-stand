// The heroes' head: the sculpted skin of models/face.ts (meshed on its ray grid, painted in the loading
// workers), glossy eyes under lids with lashes, sculpted ears, hair and a full beard (a volume, with tufts of cards), and
// the neck below it. Built on the rig's head joint, in metres, the chin's underside level with the joint;
// the head is 1/7.5 of the heroes' stature (a realistic figure: an ideal one is 8 heads, a heroic 8.5).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lod } from './armor';
import { part } from './rig';
import { Sculpt } from './shapes';
import { clamp, lerp, mulberry } from '../../util';
import { faceCanvases } from '../../core/textures';
import { FACES, LOOKS, EYE, origin, eyeOpening, headGrid, gridSize, headSDF, gridDir, scalp, hairline, neckShade, beardLift, mouthY, type FaceShape, type HeadGrid } from './face';
import type { MaterialKit } from '../../types';

/** metres per millimetre of the face's frame: the head is 1/7.5 of the heroes' stature */
export const HEAD_MM = 0.2421 / 228;
/** the point of the face's frame that sits on the head joint: under the middle of the skull */
const ORIGIN = { x: 0, y: 0, z: 5 };

/** A point of the face's frame (mm: up from the chin, forward from the ear canals) in the head group's
 *  space (m), for placing anything by the head's anatomy. */
export const toGroup = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 =>
  out.set((x - ORIGIN.x) * HEAD_MM, (y - ORIGIN.y) * HEAD_MM, (z - ORIGIN.z) * HEAD_MM);

/** bare skin away from the painted face (ears, neck, bare hands): one material setup, so one shader */
export const plainSkin = (kit: MaterialKit, who: keyof typeof FACES, vertexColors = false) => {
  const s = LOOKS[who].skin;
  // (shaded by its vertex colours, it is rougher too: a shine would light up a neck that the jaw shades)
  return kit.rim({ color: new THREE.Color().setRGB(s[0] * 0.97, s[1] * 0.97, s[2] * 0.97, THREE.SRGBColorSpace), roughness: vertexColors ? 0.88 : 0.6, vertexColors }, 0x6a2a1c, 0.25);
};

/** bare hands' skin: the ears' and neck's a shade darker (beside the face's paint, shaded where light falls less, plain
 *  skin reads pale) */
export const handSkin = (kit: MaterialKit, who: keyof typeof FACES) => { const m = plainSkin(kit, who); m.color.multiplyScalar(0.86); return m; };

const grids = new Map<string, HeadGrid>();
/** the skin's ray grid for a face at the current detail, cast once */
function gridFor(name: keyof typeof FACES): HeadGrid {
  const [nu, nv] = gridSize(FACES[name], lod(112, 40), lod(88, 32)), key = `${name}:${nu}x${nv}`;
  let g = grids.get(key);
  if (!g) grids.set(key, (g = headGrid(FACES[name], nu, nv)));
  return g;
}

/** the skin on its grid: uvs follow the grid, so the paint (painted on the same grid) lines up */
function skinGeometry(g: HeadGrid): THREE.BufferGeometry {
  const W = g.nu + 1, n = W * (g.nv + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), p = new THREE.Vector3();
  for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
    const k = j * W + i;
    toGroup(g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2], p);
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
/** An eye seen from the front (planar uvs): sclera, a dark limbal ring, a fibrous iris, the pupil. `shade`: the upper lid's
 *  shadow over its top (the eyes never turn, so it can be painted) and a dimmer white, for a deep-set eye. */
function eyeMap(iris: [number, number, number], shade = 0): THREE.CanvasTexture {
  eyeTex ??= new Map();
  const key = iris.join() + ':' + shade;
  const hit = eyeTex.get(key);
  if (hit) return hit;
  const S = 128, img = new ImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = 1 - (y + 0.5) / S * 2, r = Math.hypot(u, v), a = Math.atan2(v, u);
    // radius in mm on the eye's face (the texture spans the eyeball's 24 mm)
    const mm = r * EYE.r;
    let c: number[];
    // (a deep-set eye's pupil a little smaller: a big one reads as a doll's)
    const pr = shade ? 1.6 : 1.9, ir = 5.9;
    if (mm < pr) c = [0.02, 0.018, 0.02];
    else if (mm < ir) {
      // (a deep-set eye's iris seen in the lid's shade: its fibres soft, a dark ring at its rim, lighter round the pupil)
      const fa = shade ? 0.12 : 0.25, k = (mm - pr) / (ir - pr), fib = 1 - fa + fa * Math.sin(a * 37 + Math.sin(a * 11) * 2) * Math.sin(a * 23 + mm), ring = 1 - 0.45 * Math.exp(-(((mm - 2.2) / 0.5) ** 2));
      const edge = 1 - 0.6 * clamp((k - 0.8) / 0.2, 0, 1);
      // (a deep-set eye's lighter round the pupil, darkening to its rim; the other way round otherwise)
      const rad = shade ? 1.25 - 0.5 * k : 0.75 + 0.5 * k;
      c = iris.map((ch, i) => ch * fib * ring * edge * rad + (i === 0 ? 0.04 : 0.02) * (1 - k));
    } else if (mm < ir + 0.5) c = [0.08, 0.08, 0.09];
    else {
      // the white, greyer towards its edge and a little pink in the corners
      const k = clamp((mm - ir - 0.5) / 5, 0, 1);
      c = [0.78 - 0.14 * k + 0.05 * Math.abs(u) * k, 0.74 - 0.18 * k, 0.72 - 0.18 * k].map((ch) => ch * (1 - 0.2 * shade));
    }
    if (shade) {
      // (darkest under the lid's edge, and into the corners)
      const k = 1 - shade * (0.55 * sm(-2, 3.2, v * EYE.r) + 0.5 * sm(5, 10, Math.abs(u) * EYE.r));
      c = c.map((ch) => ch * k);
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
  /** the hair over the scalp (its cap and locks): a model hides it under a helmet */
  hair: THREE.Mesh[];
  /** a full beard's volume and its tufts (`FACES[...].beardFull`) */
  beards: THREE.Mesh[];
}

/**
 * Build the head of `who` on `headJoint` (the rig's head joint). `hair`: a cap of hair over the scalp
 * with locks of cards over it, `swept` back behind the ears to the nape, or `loose`: parted a little off the
 * middle, swept out over the temples and falling in waves past the ears to the chin (left out, the scalp is painted).
 * A face with `beardFull` gets a full beard: a volume over the skin and tufts of cards along it.
 */
export function buildHead(headJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, o: { hair?: 'swept' | 'loose' } = {}): Head {
  const F: FaceShape = FACES[who];
  const head = new THREE.Group();
  headJoint.add(head);
  const g = gridFor(who);
  const M = faceMaps(who);
  const skin = kit.rim({ roughness: 1, map: M.map, normalMap: M.normalMap, roughnessMap: M.roughnessMap, normalScale: new THREE.Vector2(0.5, 0.5) }, 0x6a2a1c, 0.25);
  const face = part(skinGeometry(g), skin, head);
  face.name = 'face';

  // --- eyes: glossy balls in the sockets behind the lids, and lashes along the upper lids
  // (a deep-set eye's shine softer: a sharp one on a dark iris reads as a marble)
  const eyeMat = kit.std({ map: eyeMap(F.iris, LOOKS[who].eyeShade), roughness: LOOKS[who].eyeShade ? 0.2 : 0.08 });
  const shaded = !!LOOKS[who].eyeShade, lash = kit.std({ color: shaded ? 0x2e2016 : 0x1c120c, roughness: 0.9, side: THREE.DoubleSide });
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
      // (a deep-set eye's stop short of its corners: past them they read as a line drawn round the eye)
      const t = shaded ? lerp(-0.8, 0.82, k / N) : lerp(-0.92, 0.95, k / N), xe = t * (F.eyeW ?? 15) - 0.5;
      let ye = 0;
      // the lid's edge: where the opening's top crosses this column
      for (let y = 8; y > -2; y -= 0.05) if (eyeOpening(xe, y, F) <= 0) { ye = y; break; }
      const R = EYE.r + 1.9, zz = Math.sqrt(Math.max(0, R * R - xe * xe - ye * ye));
      const len = (shaded ? 1.7 : 2.6) * (1 - 0.5 * Math.abs(t - 0.3));
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
  // (a deep-set eye's lashes are painted: a strip reads as a line drawn round the eye)
  if (!shaded) part(lg, lash, head).castShadow = false;

  // --- ears
  const earAo = LOOKS[who].ao ?? 0, earMat = plainSkin(kit, who, earAo > 0);
  for (const s of [1, -1]) part(earGeometry(s, F, earAo), earMat, head);

  const surface = (az: number, el: number, lift = 0, out = new THREE.Vector3()) => {
    const d = gridDir(az, el, { x: 0, y: 0, z: 0 }), C = origin(el, { x: 0, y: 0, z: 0 });
    const r = radiusAt(g, az, el) + lift;
    return toGroup(C.x + d.x * r, C.y + d.y * r, C.z + d.z * r, out);
  };

  // --- hair: a cap with some body over the scalp, locks of hair cards swept back over it to the nape
  const L = LOOKS[who], rng = mulberry(7);
  // (both styles' locks in the dense clump texture: thin strands of high contrast read as wood grain, and sparse cards
  // hanging apart read as a wig's fringe)
  const hk = o.hair === 'loose' ? 2.4 : 2.1, hairCol = new THREE.Color().setRGB(L.hair[0] * hk, L.hair[1] * hk, L.hair[2] * hk, THREE.SRGBColorSpace);
  const cards = kit.std({ color: hairCol, map: strandMap(true), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: o.hair === 'loose' ? 0.72 : 0.62, vertexColors: true });
  const lockGeo: THREE.BufferGeometry[] = [], hair: THREE.Mesh[] = [];
  const skullC = toGroup(0, 128, -12);
  if (o.hair) {
    // (under the locks the cap is only the shadow between them: darker and plain, as its texture would show the grid's
    // rows closing to a point on top as a starburst through the part; and a cap of combed fur with a sharp edge, the swept
    // locks over it few and apart, read as a wig)
    const loose = o.hair === 'loose', capCol = new THREE.Color().setRGB(L.hair[0] * 1.3, L.hair[1] * 1.3, L.hair[2] * 1.3, THREE.SRGBColorSpace);
    const capMat = kit.std({ color: capCol, roughness: 0.8 });
    const W = g.nu + 1, pos = new Float32Array((g.nv + 1) * W * 3), uv = new Float32Array((g.nv + 1) * W * 2), keep = new Uint8Array((g.nv + 1) * W);
    const d = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 }, q = new THREE.Vector3();
    for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
      const k = j * W + i, r = g.r[k];
      gridDir(g.az[i], g.el[j], d); origin(g.el[j], C);
      const x = C.x + d.x * r, y = C.y + d.y * r, z = C.z + d.z * r, sc = scalp(Math.abs(x), y, z, L.hairDrop, L.templeDrop);
      // thicker on top, combed into shallow ridges running back
      // (starting behind the painted hairline, its edge sunk into the skin: the grid's steps never show)
      // (rising gradually from behind the hairline: a step over a cell or two of the grid shows as a stair)
      // (and as gradually beside a hairline that runs steeply down, at the temples: measured across it too)
      const ha = Math.atan2(Math.abs(x), z + 12), hr = Math.hypot(Math.abs(x), z + 12);
      const inside = (da: number) => y - hairline(hr * Math.sin(Math.max(0, ha - da)), hr * Math.cos(Math.max(0, ha - da)) - 12, L.hairDrop, L.templeDrop);
      // (swept back, it lies close to the scalp at the hairline and gains body over the crown: standing 6 mm off within
      // 16 mm of the hairline, it was a wig's edge)
      const lift = loose ? sm(-1, 16, inside(0)) * sm(-1, 10, inside(0.12)) * sm(-1, 6, inside(0.25)) * (6 + 6 * sm(120, 200, y) + 2 * Math.sin(Math.atan2(x, z) * 18 + y * 0.05)) - 1.2
        : sm(-1, 30, inside(0)) * sm(-1, 14, inside(0.12)) * (2.5 + 4.5 * sm(150, 215, y)) - 1.2;
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
    hair.push(part(cap, capMat, head));
    if (o.hair === 'loose') looseLocks(surface, rng, skullC, lockGeo, F, L.hairDrop ?? 0, L.templeDrop ?? 0);
    else sweptLocks(surface, rng, skullC, lockGeo, F, L.hairDrop ?? 0, L.templeDrop ?? 0);
  }
  if (lockGeo.length) {
    const m = part(mergeGeometries(lockGeo)!, cards, head);
    for (const x of lockGeo) x.dispose();
    m.castShadow = true;
    hair.push(m);
    lockGeo.length = 0;
  }
  // a full beard's volume over the face (face.ts `beardLift`): the skin's grid points lifted along their rays, leaning down
  // below the mouth (it hangs), painted as the face is (its uvs the grid's), its edges sunk into the skin; and short tufts
  // of cards over its lower part and out past its edge, so its outline is hair, not a smooth rim
  const beards: THREE.Mesh[] = [];
  if (F.beardFull) {
    const W = g.nu + 1, pos = new Float32Array((g.nv + 1) * W * 3), uv = new Float32Array((g.nv + 1) * W * 2), lifts = new Float32Array((g.nv + 1) * W);
    const d = { x: 0, y: 0, z: 0 }, q = new THREE.Vector3();
    for (let j = 0; j <= g.nv; j++) for (let i = 0; i <= g.nu; i++) {
      const k = j * W + i, x = g.p[k * 3], y = g.p[k * 3 + 1], z = g.p[k * 3 + 2], lift = beardLift(Math.abs(x), y, z, F) - 1.2;
      gridDir(g.az[i], g.el[j], d);
      d.y -= BEARD_HANG * clamp((45 - y) / 45, 0, 1);
      const dl = Math.hypot(d.x, d.y, d.z);
      toGroup(x + (d.x / dl) * lift, y + (d.y / dl) * lift, z + (d.z / dl) * lift, q);
      pos[k * 3] = q.x; pos[k * 3 + 1] = q.y; pos[k * 3 + 2] = q.z;
      uv[k * 2] = i / g.nu; uv[k * 2 + 1] = j / g.nv; lifts[k] = lift;
    }
    const idx: number[] = [];
    for (let j = 0; j < g.nv; j++) for (let i = 0; i < g.nu; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, e = a + W;
      if (lifts[a] > 0 || lifts[b] > 0 || lifts[c] > 0 || lifts[e] > 0) idx.push(a, b, c, a, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    beards.push(part(geo, skin, head));
    // (the tufts in the painted beard's colour, darker than the scalp's locks; their strands dense)
    const tuftMat = Object.assign(cards.clone(), { map: strandMap(true), roughness: 0.85, color: hairCol.clone().multiplyScalar(1.2 / hk) });
    beards.push(beardTufts(geo, lifts, g, tuftMat, head, rng));
    for (const m of beards) m.name = 'beard';
  }
  // (named, so a probe or a tool can find them)
  for (const m of hair) m.name = 'hair';
  const midZ = (y: number) => { let z = 140; while (z > 0 && headSDF(0, y, z, F) > 0) z -= 0.25; return z; };
  return { group: head, face, eyes, surface, midZ, hair, beards };
}

/** how far a full beard's volume leans down from its rays below the mouth (it hangs: lifted along them, from above the jaw,
 *  the chin's beard jutted forward like a spade) */
const BEARD_HANG = 1.2;

/**
 * Tufts over a full beard's volume (`cap`, its lifts along the rays in mm): short cards rooted in its lower part, lying
 * along it down the way it grows and out past its edge, in the beard's colour, darker at the root.
 */
function beardTufts(cap: THREE.BufferGeometry, lifts: Float32Array, g: HeadGrid, cards: THREE.MeshStandardMaterial, head: THREE.Group, rng: () => number): THREE.Mesh {
  const P = cap.attributes.position, N = cap.attributes.normal, roots: number[] = [];
  // (where it stands well off the skin, below the cheeks)
  // (not round the mouth: tufts at its corners hung over the lips like fangs)
  for (let k = 0; k < lifts.length; k++) {
    const ax = Math.abs(g.p[k * 3]), y = g.p[k * 3 + 1];
    if (lifts[k] > 3 && y < 60 && (ax > 34 || y < mouthY(Math.min(ax, 24)) - 14)) roots.push(k);
  }
  const n = Math.min(roots.length, lod(220, 70)), out: THREE.BufferGeometry[] = [], V = THREE.Vector3;
  const p = new V(), nr = new V(), t = new V(), down = new V(0, -1, 0), centre = toGroup(0, 40, 20);
  for (let c = 0; c < n; c++) {
    const k = roots[Math.floor(rng() * roots.length)], y = g.p[k * 3 + 1], low = clamp((30 - y) / 50, 0, 1);
    p.fromBufferAttribute(P, k); nr.fromBufferAttribute(N, k).normalize();
    // down along the surface, out over its edge where it faces down
    t.copy(down).addScaledVector(nr, -down.dot(nr));
    if (t.lengthSq() < 0.1) t.copy(down).addScaledVector(nr, 0.6);
    t.normalize();
    // (short: longer ones hung from the beard's edge as drips)
    const len = (8 + rng() * 7 + 6 * low) * HEAD_MM, w = (7 + rng() * 4) * HEAD_MM, curl = (rng() - 0.5) * 6 * HEAD_MM, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const s = i / 4;
      pts.push(p.clone().addScaledVector(nr, (-1.5 + 2.5 * s * (1 - 0.4 * s)) * HEAD_MM).addScaledVector(t, len * s).addScaledVector(down, len * 0.25 * s * s)
        .add(new V(curl * s * s, 0, 0)));
    }
    const shade = 0.6 + 0.25 * rng();
    out.push(hairCard(pts, (s) => w * (1 - 0.7 * s), centre, lod(4, 2), (rng() - 0.5) * 0.8, (s) => shade * (0.75 + 0.25 * s), (_s, O) => { O.copy(nr); }));
  }
  const geo = mergeGeometries(out)!;
  for (const x of out) x.dispose();
  const m = part(geo, cards, head);
  m.castShadow = true;
  return m;
}

/** a point of the head group's space (m) in the face's frame (mm) */
const toFace = (p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 => out.set(p.x / HEAD_MM + ORIGIN.x, p.y / HEAD_MM + ORIGIN.y, p.z / HEAD_MM + ORIGIN.z);

/**
 * Thick, tousled hair to the chin, as a portrait shows it: parted a little off the middle, rising off the scalp and
 * swept out from the part over the temples (from the front its strands run out and down from the part), falling in
 * waves past the ears to about the chin, the ends curling out; a few curls framing the forehead at the temples, and
 * stray wisps. Locks of cards in layers, each lifted further off the scalp, every point kept clear of the skin and
 * the ears (the head's own distance field).
 */
/** what the locks of either style are laid with: a direction from its angles, the hairline's elevation towards an azimuth
 *  (the first point up the skin where the scalp grows hair), how far a point (mm) is from the skin or the ear standing off
 *  the side of the head, and a point (the group's metres) pushed out to `margin` mm from them, along the distance's gradient */
function hairTools(surface: Head['surface'], F: FaceShape, drop: number, temple: number) {
  const V = THREE.Vector3, q = new V(), g = new V();
  const dirOf = (az: number, el: number, v = new V()) => v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const hairEl = (az: number) => {
    for (let el = 0.2; el < 1.5; el += 0.01) { toFace(surface(az, el), q); if (scalp(Math.abs(q.x), q.y, q.z, drop, temple) > 0.6) return el; }
    return 1.5;
  };
  let earX = 40;
  while (earX < 90 && headSDF(earX, 97, 0, F) < 0) earX += 0.5;
  const clear = (x: number, y: number, z: number) => {
    const ex = (Math.abs(x) - earX - 7) / 12, ey = (y - 98) / 36, ez = (z + 8) / 25;
    return Math.min(headSDF(x, y, z, F), (Math.sqrt(ex * ex + ey * ey + ez * ez) - 1) * 15);
  };
  const pushOut = (p: THREE.Vector3, margin: number) => {
    for (let k = 0; k < 3; k++) {
      toFace(p, q);
      const d = clear(q.x, q.y, q.z);
      if (d >= margin) return;
      g.set(clear(q.x + 1, q.y, q.z) - clear(q.x - 1, q.y, q.z), clear(q.x, q.y + 1, q.z) - clear(q.x, q.y - 1, q.z), clear(q.x, q.y, q.z + 1) - clear(q.x, q.y, q.z - 1)).normalize();
      p.addScaledVector(g, (margin - d) * HEAD_MM);
    }
  };
  return { dirOf, hairEl, clear, pushOut };
}

function looseLocks(surface: Head['surface'], rng: () => number, skullC: THREE.Vector3, out: THREE.BufferGeometry[], F: FaceShape, drop: number, temple: number): void {
  const n = lod(460, 130), PART = 0.08, V = THREE.Vector3;
  const { dirOf, hairEl, clear, pushOut } = hairTools(surface, F, drop, temple), q = new V();
  const d0 = new V(), d1 = new V(), d = new V(), pts: THREE.Vector3[] = [], up = new V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const layer = i % 4, kind = rng(), s = rng() < 0.55 ? -1 : 1;
    const ph = rng() * Math.PI * 2, waves = 1.4 + rng() * 1.1, tone = 0.7 + rng() * 0.5;
    // over the head from (az0, el0) to where it leaves it (az1, el1), standing `top` mm off the scalp at its fullest,
    // then hanging to `yEnd` mm (the face's frame); `w` its width (mm)
    let az0: number, el0: number, az1: number, el1: number, top: number, yEnd: number, w: number, frame = false;
    // (a lock may turn on the way: up and back off the hairline first, then out to the side)
    let mid: [number, number] | null = null;
    if (kind < 0.12) {
      // the front, along the hairline: lifted up and back off the forehead, then out over the top and down the side
      // (it covers the part's front and frames the forehead's top, flat across it rather than arched)
      // (some rooted just across the part, so its front is covered)
      az0 = PART + s * (rng() * 0.48 - 0.07); el0 = hairEl(az0) + 0.02;
      mid = [PART + s * (0.12 + Math.abs(az0 - PART) * 0.8), el0 + 0.32 + rng() * 0.1];
      az1 = s * (1.45 + rng() * 0.35) + (s > 0 ? 0.1 : 0); el1 = 0.46 + rng() * 0.15 + (s > 0 ? 0.08 : 0);
      top = 18 + rng() * 9; yEnd = -55 + rng() * 45; w = 15 + rng() * 8;
    } else if (kind < 0.46) {
      // from the part (a line from the front of the hairline back over the top to the crown), out over the top and down
      // to the side past the ear: seen from the front its strands run out and down from the part. Roots further back
      // reach further round; on his left, the part's near side, the hair sweeps back higher over the temple.
      // (the part stops short of the crown, which the locks below run straight back over)
      const u = rng() ** 0.9 * 0.78;
      dirOf(PART, hairEl(PART) + 0.04, d0); dirOf(Math.PI - 0.25, 1.0, d1);
      const pa = d0.angleTo(d1), pd = d.copy(d0).multiplyScalar(Math.sin((1 - u) * pa)).addScaledVector(d1, Math.sin(u * pa)).normalize();
      az0 = Math.atan2(pd.x, pd.z) + s * (0.04 + 0.1 * rng() + 0.12 * (1 - sm(0, 0.15, u))) / Math.max(0.3, Math.cos(Math.asin(clamp(pd.y, -1, 1)))); el0 = Math.asin(clamp(pd.y, -1, 1));
      // (over the ear and down behind it, the ear showing below: none hang in front of it over the cheek)
      az1 = s * lerp(1.38, 2.6, u) * (0.94 + 0.12 * rng()) + (s > 0 ? 0.1 : 0); el1 = lerp(0.42, 0.45, u) + 0.12 * rng() + (s > 0 ? 0.1 : -0.02);
      top = 13 + rng() * 9; yEnd = -65 + rng() * 45; w = 15 + rng() * 9;
    } else if (kind < 0.64) {
      // the sides above the ears, back and down past them
      az0 = s * (1.0 + rng() * 1.0); el0 = 0.5 + rng() * 0.5;
      az1 = s * (Math.abs(az0) + 0.45 + rng() * 0.4); el1 = 0.3 + rng() * 0.18;
      top = 14 + rng() * 9; yEnd = -65 + rng() * 45; w = 14 + rng() * 8;
    } else if (kind < 0.72) {
      // over the crown: from the part ahead of the top of the head, straight back over it and down the back (where the
      // locks rising off the part meet on top never shows)
      dirOf(PART, hairEl(PART) + 0.04, d0); dirOf(Math.PI - 0.25, 1.0, d1);
      const u = 0.22 + rng() * 0.3, pa = d0.angleTo(d1), pd = d.copy(d0).multiplyScalar(Math.sin((1 - u) * pa)).addScaledVector(d1, Math.sin(u * pa)).normalize();
      az0 = Math.atan2(pd.x, pd.z) + s * rng() * 0.2; el0 = Math.asin(clamp(pd.y, -1, 1));
      az1 = s * (Math.PI - 0.05 - rng() * 0.4); el1 = -0.05 + rng() * 0.25;
      top = 14 + rng() * 8; yEnd = -40 + rng() * 40; w = 18 + rng() * 9;
    } else if (kind < 0.9) {
      // the back of the head, down to the nape (rooted below the crown: none meet at a point)
      az0 = s * (1.9 + rng() * 1.24); el0 = 0.3 + rng() * 0.65;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + rng() * 0.3); el1 = -0.05 + rng() * 0.2;
      top = 12 + rng() * 8; yEnd = -40 + rng() * 40; w = 18 + rng() * 9;
    } else if (kind < 0.94) {
      // framing the forehead (more on his right, as the part leaves more hair that side): from the front of the hairline
      // out and down over the temple, beside the eye, curling away from the face
      frame = true;
      // (hanging straight down beside the forehead to about the brow: his right a little in from its edge)
      // (one arc: up off the hairline, over and down beside the forehead, the end flicking out; nothing hanging)
      const sf = rng() < 0.75 ? -1 : 1;
      az0 = sf * (sf < 0 ? 0.3 + rng() * 0.14 : 0.44 + rng() * 0.12); el0 = hairEl(az0) + 0.03;
      mid = [az0 * 1.1, el0 + 0.14];
      az1 = az0 * 1.3; el1 = 0.18 + rng() * 0.08;
      top = 10 + rng() * 5; yEnd = 0; w = 10 + rng() * 6; frame = true;
    } else {
      // more of the sides and back (the deepest layers)
      az0 = s * (1.3 + rng() * 1.8); el0 = 0.25 + rng() * 0.5;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + 0.2 + rng() * 0.3); el1 = 0.0 + rng() * 0.2;
      top = 8 + rng() * 6; yEnd = -40 + rng() * 40; w = 18 + rng() * 8;
    }
    pts.length = 0;
    const N = 9, dm = new V();
    if (mid) dirOf(mid[0], mid[1], dm);
    /** the direction a share `t` of the way between two (along the great circle) */
    const slerp = (A: THREE.Vector3, B: THREE.Vector3, t: number) => {
      const ang = A.angleTo(B), a = ang > 1e-4 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, b = ang > 1e-4 ? Math.sin(t * ang) / Math.sin(ang) : t;
      return d.copy(A).multiplyScalar(a).addScaledVector(B, b).normalize();
    };
    dirOf(az0, el0, d0); dirOf(az1, el1, d1);
    for (let k = 0; k <= N; k++) {
      // (along the great circle between the two, in waves across it and in and out)
      const t = k / N;
      if (mid) { if (t < 0.4) slerp(d0, dm, t / 0.4); else slerp(dm, d1, (t - 0.4) / 0.6); } else slerp(d0, d1, t);
      const az = Math.atan2(d.x, d.z) + 0.08 * Math.sin(ph + t * waves * Math.PI) * sm(0.15, 0.5, t), el = Math.asin(clamp(d.y, -1, 1));
      const lift = lerp(1.5, top + layer * 3.5, sm(0, 0.42, t)) + 6 * Math.sin(ph * 1.7 + t * waves * Math.PI) * sm(0.2, 0.6, t) + (frame ? 9 * sm(0.75, 1, t) : 0);
      pts.push(surface(az, el, lift));
    }
    // then down to its end in a loose curl (a helix widening towards the end, the card turning with it: seen from any
    // side it waves, wide where it faces you and thin where it turns away), the end flicking out and up
    const last = pts[N], o = new V(last.x - skullC.x, 0, last.z - skullC.z).normalize(), tg = new V().crossVectors(up, o);
    const turns = 1.5 + rng() * 1.3;
    if (!frame) {
      toFace(last, q);
      const fall = Math.max(18, q.y - yEnd) * HEAD_MM, R0 = (3 + rng() * 3) * HEAD_MM, R1 = (10 + rng() * 6) * HEAD_MM, M = 16;
      const lead = new V().subVectors(pts[N], pts[N - 1]).normalize(), fk = (12 + rng() * 10) * HEAD_MM;
      for (let k = 1; k <= M; k++) {
        const t = k / M, phi = ph + t * turns * Math.PI * 2, R = lerp(R0, R1, t) * sm(0, 0.25, t);
        const flick = t ** 2.2 * fk, flare = (0.5 + 1.5 * t) * HEAD_MM;
        // (carrying on the way it left the head at first, then hanging)
        const carry = (1 - t) ** 2 * 18 * HEAD_MM;
        const p = last.clone().addScaledVector(lead, carry).addScaledVector(o, flare + flick + R * Math.cos(phi)).addScaledVector(tg, R * Math.sin(phi));
        p.y = last.y - fall * t + flick * 0.7;
        pushOut(p, 3 + layer * 2.5);
        pts.push(p);
      }
    }
    for (let k = 3; k <= N; k++) pushOut(pts[k], 2 + layer * 2);
    // (smoothed once: a point pushed out on its own would kink the lock)
    for (let k = 1; k < pts.length - 1; k++) pts[k].lerp(new V().addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5), 0.3);
    // (each lock its own shade: darker at the root and in the deeper layers, lighter on its waves' crests)
    // (and darker where it lies close to the head: little light gets in there)
    const occ = pts.map((p) => { toFace(p, q); return (kind < 0.12 ? 0.75 : 0.55) + (kind < 0.12 ? 0.25 : 0.45) * sm(2, 28, clear(q.x, q.y, q.z)); });
    const occAt = (t: number) => { const f = t * (occ.length - 1), j = Math.min(occ.length - 2, Math.floor(f)); return lerp(occ[j], occ[j + 1], f - j); };
    const root = kind < 0.12 ? 0.85 : 0.62, shade = (t: number) => tone * (root + (1 - root) * sm(0, 0.25, t)) * (0.8 + 0.09 * layer) * (1 + 0.38 * Math.sin(ph + t * waves * Math.PI * 1.6)) * occAt(t);
    const tw = (rng() - 0.5) * (frame ? 0.4 : 0.9), wm = w * HEAD_MM;
    // (where it hangs, the card faces out from the curl's axis, turning with it)
    let h0 = 1;
    if (!frame) { let all = 0, onHead = 0; for (let k = 1; k < pts.length; k++) { const l = pts[k].distanceTo(pts[k - 1]); all += l; if (k <= N) onHead += l; } h0 = onHead / all; }
    const fv = new V(), facing = frame ? undefined : (t: number, O: THREE.Vector3) => {
      if (t <= h0) return;
      const phi = ph + (t - h0) / (1 - h0) * turns * Math.PI * 2;
      // (only partly: edge on, a card shows its pointed outline as a spike)
      O.lerp(fv.copy(o).multiplyScalar(Math.cos(phi)).addScaledVector(tg, Math.sin(phi)), 0.55 * sm(h0, h0 + 0.12, t)).normalize();
    };
    // (narrow at the root, so its end never shows as a block)
    out.push(hairCard(pts, (t) => wm * (0.35 + 0.65 * sm(0, 0.12, t)) * (1 - 0.45 * t ** 2), skullC, lod(56, 14), tw, shade, facing));
  }
}

/**
 * Hair combed straight back, as a portrait shows it: from the hairline back over the top of the head and round above the
 * ears, lying on the head all the way down to the nape (close at the hairline and over the temples, with body over the
 * crown) and ending just below the nape's hairline and behind the ears, the tips flicking out a little. Locks of cards in
 * layers, each lifted further off the scalp, every point kept clear of the skin and the ears (the head's own distance
 * field). (Fewer locks standing well off a cap of combed fur read as a wig; and hung straight down from where they left the
 * head, all ending about the jaw, they made a bob over the ears.)
 */
function sweptLocks(surface: Head['surface'], rng: () => number, skullC: THREE.Vector3, out: THREE.BufferGeometry[], F: FaceShape, drop: number, temple: number): void {
  const n = lod(400, 120), V = THREE.Vector3;
  const { dirOf, hairEl, clear, pushOut } = hairTools(surface, F, drop, temple), q = new V();
  const d0 = new V(), d1 = new V(), d = new V(), pts: THREE.Vector3[] = [];
  const slerp = (A: THREE.Vector3, B: THREE.Vector3, t: number) => {
    const ang = A.angleTo(B), a = ang > 1e-4 ? Math.sin((1 - t) * ang) / Math.sin(ang) : 1 - t, b = ang > 1e-4 ? Math.sin(t * ang) / Math.sin(ang) : t;
    return d.copy(A).multiplyScalar(a).addScaledVector(B, b).normalize();
  };
  for (let i = 0; i < n; i++) {
    const layer = i % 4, kind = rng(), s = rng() < 0.5 ? -1 : 1, ph = rng() * Math.PI * 2, tone = 0.72 + rng() * 0.45;
    // over the head from (az0, el0) to its end (az1, el1), `top` mm off the scalp at its fullest; `w` its width (mm)
    let az0: number, el0: number, az1: number, el1: number, top: number, w: number;
    if (kind < 0.3) {
      // from along the front of the hairline straight back over the top to the nape (rooted on it: no lock's end shows there)
      az0 = (rng() - 0.5) * 1.7; el0 = hairEl(az0) + 0.015;
      az1 = (Math.sign(az0) || s) * (Math.PI - 0.1 - 0.35 * Math.abs(az0) - 0.2 * rng()); el1 = -0.12 - rng() * 0.12;
      top = 5 + rng() * 3; w = 16 + rng() * 8;
    } else if (kind < 0.5) {
      // the temples, back round above the ears to behind them
      az0 = s * (0.85 + rng() * 0.6); el0 = hairEl(az0) + 0.015;
      az1 = s * (2.05 + rng() * 0.45); el1 = 0.02 + rng() * 0.2;
      top = 4 + rng() * 3; w = 14 + rng() * 7;
    } else if (kind < 0.75) {
      // the crown, behind the hairline, straight back over it to the nape
      az0 = (rng() - 0.5) * 1.4; el0 = hairEl(az0) + 0.15 + rng() * 0.45;
      az1 = (Math.sign(az0) || s) * (Math.PI - 0.05 - 0.45 * rng()); el1 = -0.16 - rng() * 0.1;
      top = 8 + rng() * 4; w = 18 + rng() * 9;
    } else {
      // the back of the head, down to the nape (the deeper layers)
      az0 = s * (1.6 + rng() * 1.5); el0 = 0.4 + rng() * 0.55;
      az1 = s * Math.min(Math.PI, Math.abs(az0) + rng() * 0.25); el1 = -0.2 - rng() * 0.1;
      top = 6 + rng() * 4; w = 18 + rng() * 9;
    }
    pts.length = 0;
    const N = 12;
    dirOf(az0, el0, d0); dirOf(az1, el1, d1);
    for (let k = 0; k <= N; k++) {
      // (along the great circle between the two: combed, a gentle wave across it and in and out; settling onto the neck
      // at its end, the tip flicking out)
      const t = k / N;
      slerp(d0, d1, t);
      const az = Math.atan2(d.x, d.z) + 0.03 * Math.sin(ph + t * Math.PI * 2) * sm(0.2, 0.6, t), el = Math.asin(clamp(d.y, -1, 1));
      const lift = lerp(1, top + layer * 2.5, sm(0, 0.4, t)) * (1 - 0.65 * sm(0.75, 1, t)) + 1.5 * Math.sin(ph * 1.3 + t * Math.PI * 2) * sm(0.25, 0.6, t) + (4 + 3 * rng()) * sm(0.9, 1, t);
      pts.push(surface(az, el, lift));
    }
    for (let k = 2; k <= N; k++) pushOut(pts[k], 1.5 + layer * 1.8);
    // (smoothed once: a point pushed out on its own would kink the lock)
    for (let k = 1; k < pts.length - 1; k++) pts[k].lerp(new V().addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5), 0.3);
    // (each lock its own shade: darker at the root, in the deeper layers and where it lies close to the head)
    const occ = pts.map((p) => { toFace(p, q); return 0.6 + 0.4 * sm(2, 24, clear(q.x, q.y, q.z)); });
    const occAt = (t: number) => { const f = t * (occ.length - 1), j = Math.min(occ.length - 2, Math.floor(f)); return lerp(occ[j], occ[j + 1], f - j); };
    const shade = (t: number) => tone * (0.7 + 0.3 * sm(0, 0.2, t)) * (0.8 + 0.07 * layer) * (1 + 0.2 * Math.sin(ph + t * Math.PI * 3)) * occAt(t);
    const wm = w * HEAD_MM;
    // (the strands' texture's body along the lock and its tip only at the end: stretched over the lock, its tip, a third
    // of it, narrowing and fading, was the back of the head, and the hair seemed to stop at the crown's back)
    const vAt = (t: number) => (t < 0.88 ? 0.7 * t / 0.88 : 0.7 + 0.3 * (t - 0.88) / 0.12);
    // (narrow at the root, so its end never shows as a block)
    out.push(hairCard(pts, (t) => wm * (0.35 + 0.65 * sm(0, 0.1, t)) * (1 - 0.4 * t ** 2), skullC, lod(40, 12), (rng() - 0.5) * 0.6, shade, undefined, vAt));
  }
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
function earGeometry(s: number, F: FaceShape, ao = 0): THREE.BufferGeometry {
  const nt = lod(40, 20), nr = lod(12, 6), thick = 3.4;
  // the side of the head at the ear canal
  let sx = 40;
  while (sx < 90 && headSDF(sx, 97, 0, F) < 0) sx += 0.5;
  const tilt = 0.26, flare = F.earFlare ?? 0.5, cu = -8, cv = 3;
  const place = (u: number, v: number, h: number, out: THREE.Vector3) => {
    // tilt the ear back, then flare it out from the head about its front edge
    const u1 = u * Math.cos(tilt) - v * Math.sin(tilt), v1 = u * Math.sin(tilt) + v * Math.cos(tilt);
    const back = Math.max(0, -u1);
    const out1 = h + back * Math.sin(flare), u2 = u1 + (u1 < 0 ? back * (1 - Math.cos(flare)) : 0);
    return toGroup(s * (sx + 4 + out1), 97 + v1, u2, out);
  };
  const front: number[] = [], backP: number[] = [], v = new THREE.Vector3(), cf: number[] = [], cb: number[] = [];
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
      // (occlusion: deep in the bowl, the back against the head; all of it in the hair's shade, the top most)
      const k = ao ? 1 - (0.55 + 0.1 * sm(-10, 25, vv) + 0.2 * sm(0, -6, h)) : 1, kb = k * (1 - 0.45 * ao);
      cf.push(k ** 0.8, k, k ** 1.05); cb.push(kb ** 0.8, kb, kb ** 1.05);
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
  if (ao) g.setAttribute('color', new THREE.Float32BufferAttribute([...cf, ...cb], 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- hair ----------------------------------------------------------------------------------------

const strandTex = new Map<boolean, THREE.CanvasTexture>();
/**
 * A lock of hair for the hair cards: fine strands running down the texture (v along the lock), each its own shade,
 * thinning towards the card's sides and its tip, on transparency. `dense`: a clump, solid in its middle (its strands
 * shown by their shades), its edges and tip ragged: thick hair rather than a few strings.
 */
function strandMap(dense = false): THREE.CanvasTexture {
  const hit = strandTex.get(dense);
  if (hit) return hit;
  const W = 128, H = 512, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, rng = mulberry(dense ? 31 : 29);
  c.clearRect(0, 0, W, H);
  if (dense) {
    // the clump's body, narrowing to the tip
    c.fillStyle = 'rgb(150,150,150)';
    c.beginPath(); c.moveTo(W * 0.2, H * 0.06); c.lineTo(W * 0.8, H * 0.06); c.quadraticCurveTo(W * 0.74, H * 0.6, W * 0.5, H * 0.92); c.quadraticCurveTo(W * 0.26, H * 0.6, W * 0.2, H * 0.06); c.fill();
  }
  for (let k = 0; k < (dense ? 560 : 90); k++) {
    // strands thin out towards the card's sides, some end early (a ragged tip)
    const e = dense ? clamp((rng() + rng() + rng() - 1.5) / 1.5, -1, 1) : rng() * 2 - 1, x0 = W / 2 + Math.sign(e) * Math.abs(e) ** (dense ? 1 : 1.4) * W * 0.48;
    const len = H * (dense ? 0.5 + rng() * 0.5 : 0.45 + rng() * 0.55), wv = (rng() - 0.5) * 12, w = dense ? 0.8 + rng() * 1 : 0.9 + rng() * 1.8;
    const l = dense ? 0.56 + rng() * 0.22 + (rng() < 0.05 ? 0.16 : 0) : 0.35 + rng() * 0.65;
    // (a clump's strands start raggedly at the root)
    const y0 = dense ? rng() * H * 0.1 : 0;
    c.strokeStyle = `rgb(${Math.round(255 * Math.min(1, l))},${Math.round(255 * Math.min(1, l))},${Math.round(255 * Math.min(1, l))})`;
    c.lineWidth = w;
    c.beginPath();
    for (let y = y0; y <= len; y += 8) {
      // (drawn in towards the tip with the clump)
      const x = (dense ? W / 2 + (x0 - W / 2) * (1 - 0.55 * (y / H) ** 1.5) : x0) + Math.sin(y / H * 5 + k) * wv * (y / H);
      if (y === y0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
  }
  if (dense) {
    // (a clump is rounded: darker at its edges)
    c.globalCompositeOperation = 'source-atop';
    const e = c.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0, 'rgba(0,0,0,0.6)'); e.addColorStop(0.3, 'rgba(0,0,0,0.12)'); e.addColorStop(0.5, 'rgba(0,0,0,0)'); e.addColorStop(0.7, 'rgba(0,0,0,0.12)'); e.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = e; c.fillRect(0, 0, W, H);
  }
  // the tip thins out
  c.globalCompositeOperation = 'destination-in';
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(dense ? 0.75 : 0.65, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  strandTex.set(dense, t);
  return t;
}

/**
 * A hair card: a ribbon `width(t)` wide along a curve through `pts`, lying flat on the head (its face
 * turned out from `centre`, unless `facing` turns it), the strands running along it.
 */
function hairCard(pts: THREE.Vector3[], width: (t: number) => number, centre: THREE.Vector3, segs: number, twist = 0, shade: (t: number) => number = () => 1,
  facing?: (t: number, O: THREE.Vector3, p: THREE.Vector3) => void, vAt: (t: number) => number = (t) => t): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts), pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
  const p = new THREE.Vector3(), T = new THREE.Vector3(), O = new THREE.Vector3(), X = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p); curve.getTangentAt(t, T);
    O.subVectors(p, centre).normalize();
    facing?.(t, O, p);
    X.crossVectors(T, O).normalize().applyAxisAngle(T, twist * t);
    const w = width(t) / 2;
    pos.push(p.x - X.x * w, p.y - X.y * w, p.z - X.z * w, p.x + X.x * w, p.y + X.y * w, p.z + X.z * w);
    uv.push(0, 1 - vAt(t), 1, 1 - vAt(t));
    const c = shade(t); col.push(c, c, c, c, c, c);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
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
/** With the head's joint, the top of the neck follows the head (skinned; see Sculpt.skin) */
export function buildNeck(neckJoint: THREE.Object3D, kit: MaterialKit, who: keyof typeof FACES, len: number, headJoint?: THREE.Object3D): void {
  const rings = 24, segs = lod(28, 14), pos: number[] = [], idx: number[] = [], col: number[] = [], ao = LOOKS[who].ao ?? 0;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, y = lerp(-0.03, len + 0.012, t);
    // wider at the base, set a little back at the top (under the skull), in mm
    // (a face with a narrower neck under its jaw has the neck's top to match, standing in under the jaw's line)
    const rx = lerp(66, (FACES[who].neckW ?? 54) + 3, sm(0, 1, t)), rz = lerp(62, 52, sm(0, 1, t)), cz = lerp(-2, -13, t);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2 - Math.PI, ang = Math.abs(a);
      // the muscles running from the back of the jaw (top) to the breastbone (bottom), the Adam's apple
      const scm = 3 * Math.exp(-(((ang - lerp(0.45, 1.3, t)) / 0.28) ** 2));
      const adam = 5 * Math.exp(-((a / 0.3) ** 2)) * Math.exp(-(((t - 0.55) / 0.16) ** 2));
      pos.push(Math.sin(a) * (rx + scm) * HEAD_MM, y, (cz + Math.cos(a) * (rz + scm + adam)) * HEAD_MM);
      // (its top in the jaw's shadow, as the face's own skin under the jaw: a warm brown)
      const k = ao ? 1 - neckShade(Math.abs(Math.sin(a)) * rx, (y - len) / HEAD_MM) : 1;
      col.push(k ** 0.8, k ** 0.95, k ** 1.2);
    }
  }
  const W = segs + 1;
  for (let k = 0; k < rings; k++) for (let i = 0; i < segs; i++) { const a = k * W + i; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (ao) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = plainSkin(kit, who, ao > 0);
  if (headJoint) new Sculpt().skin(g, mat, neckJoint, headJoint, len * 0.35, len).build();
  else part(g, mat, neckJoint);
}
