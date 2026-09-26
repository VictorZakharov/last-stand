// The heroes' head as a signed distance field, in millimetres, sculpted from an average man's
// measurements (ANSUR II: head 228 mm chin to crown, 154 wide, 200 long; eyes halfway down; face in
// thirds). Frame: y up from the chin's underside (menton), z forward from the ear canals, x to the
// character's left. Pure maths, so the loading workers can paint the face maps (core/pbr.ts).
//
// The skin is meshed by casting rays out from inside the skull on a grid that is densest over the face
// (`HeadGrid`); the texture's uvs follow the same grid, so the paint gets the most texels where the
// features are. Features are blended volumes: skull, forehead, brow ridge, sockets with lids riding on
// the eyeballs, nose, lips, chin, jaw, cheekbones.
import { clamp, lerp } from '../../util';
import type { PBRData } from '../../core/pbr';

/** What makes one face differ from another: sizes in mm, prominences as factors (1 = average). */
export interface FaceShape {
  /** half the jaw's width at its angles */
  jaw: number;
  /** chin: half width, and how far forward it juts */
  chin: number; chinFwd: number;
  /** brow ridge prominence */
  brow: number;
  /** cheekbones: prominence */
  cheek: number;
  /** nose: length (nasion to tip), half the nostrils' width, projection, a hump on the bridge */
  noseLen: number; noseW: number; nosePro: number; hump: number;
  /** lip fullness */
  lips: number;
  /** face length below the eyes (scales the lower face), 1 = average */
  long: number;
  /** eye opening height (mm, half) */
  eyeOpen: number;
  /** iris colour (sRGB 0..1) */
  iris: [number, number, number];
  /** how far a short beard stands off the skin, mm */
  beardDepth: number;
}

export const FACES: Record<'warrior' | 'mage', FaceShape> = {
  // broad jaw and chin, heavy brow, a nose with a bump on its bridge
  warrior: { jaw: 55, chin: 22, chinFwd: 3, brow: 1.25, cheek: 1.1, noseLen: 54, noseW: 18, nosePro: 1.05, hump: 1.6, lips: 0.9, long: 1, eyeOpen: 4.1, iris: [0.36, 0.45, 0.52], beardDepth: 5 },
  // longer and leaner, high cheekbones, a long straight nose
  mage: { jaw: 50, chin: 19, chinFwd: 0, brow: 1.05, cheek: 1.25, noseLen: 57, noseW: 16.5, nosePro: 1.1, hump: 0.4, lips: 1, long: 1.04, eyeOpen: 4.3, iris: [0.3, 0.42, 0.34], beardDepth: 6 },
};

// --- distance primitives (approximate, good near the surface, which is all the meshing needs) ---
function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz;
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
/** a capsule from a (radius ra) to b (radius rb) */
function seg(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number): number {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const h = clamp((px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const ex = px - dx * h, ey = py - dy * h, ez = pz - dz * h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez) - (ra + (rb - ra) * h);
}
const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number): number => -smin(-a, -b, k);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** eyeball centre (the left one; the right mirrors it) and radius, mm */
export const EYE = { x: 32, y: 114, z: 71, r: 12 };

/**
 * The eye opening in the eye's own frame (xe: mm towards the ear from the pupil, ye up): negative
 * inside the almond, the outer corner a little higher than the inner one, the upper lid's arc highest
 * towards the nose and the lower one's lowest towards the ear.
 */
export function eyeOpening(xe: number, ye: number, F: FaceShape): number {
  const t = (xe + 0.5) / 15, u = clamp(t, -1, 1), w = 1 - u * u;
  const tilt = 1.1 * u;
  const top = tilt + F.eyeOpen * 1.08 * Math.pow(w, 0.72) * (1 - 0.22 * u) + 0.2;
  const bot = tilt - F.eyeOpen * 1.22 * Math.pow(w, 0.95) * (1 + 0.18 * u) - 0.4;
  return Math.max(ye - top, bot - ye, (Math.abs(t) - 1) * 15);
}

/** an ellipsoid tilted by `a` (radians, its top towards +z) about the x axis */
function tilted(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, a: number): number {
  const dy = y - cy, dz = z - cz, c = Math.cos(a), s = Math.sin(a);
  return ell(x, cy + dy * c - dz * s, cz + dy * s + dz * c, cx, cy, cz, rx, ry, rz);
}

/**
 * A lip: a roll along the curve of the teeth (its centre `yc` high and `zc` forward at the middle,
 * falling back towards the corners at `half` mm), `r` thick at the middle and thinning to the corners.
 */
function lip(ax: number, y: number, z: number, yc: number, zc: number, half: number, r: number, droop: number): number {
  const xq = Math.min(ax, half), k = xq / half;
  const qy = yc - droop * k * k, qz = zc - xq * xq / 62;
  const rr = r * Math.pow(Math.max(0, 1 - k * k), 0.9) + 0.9;
  return Math.hypot(ax - xq, y - qy, z - qz) - rr;
}

/** the mouth's line (the lips' meeting), mm up from the chin at `ax` from the middle */
export const mouthY = (ax: number): number => 45.3 - 0.0045 * ax * ax;

/** The lips' outer border (`side` +1 the upper lip's, -1 the lower's) at `ax` from the middle: the
 *  upper lip's bow peaks either side of a dip in the middle, both lips thin out into the corners. */
export function lipBorder(ax: number, side: number, F: FaceShape): number {
  const my = mouthY(Math.min(ax, 24));
  if (side > 0) {
    const w = Math.max(0, 1 - (ax / 23.5) ** 2);
    return my + (6.6 * F.lips) * Math.pow(w, 0.7) + 1.1 * Math.exp(-(((ax - 5.5) / 3.2) ** 2)) - 0.9 * Math.exp(-((ax / 2.4) ** 2));
  }
  const w = Math.max(0, 1 - (ax / 21.5) ** 2);
  return my - (9.2 * F.lips) * Math.pow(w, 0.55);
}

/** The head's signed distance at (x, y, z) mm, for face F. */
export function headSDF(x: number, y: number, z: number, F: FaceShape): number {
  const ax = Math.abs(x);
  // the lower face stretched for a longer face (below the eyes)
  const L = F.long, yl = y < 114 ? 114 - (114 - y) / L : y;
  // the skull: an egg, widest behind the ears; the forehead's broad front; the upper face
  let d = ell(ax, y, z, 0, 146, -8, 76, 82, 96);
  d = smin(d, ell(ax, y, z, 0, 163, 34, 63, 46, 58), 20);
  d = smin(d, ell(ax, yl, z, 0, 92, 44, 54, 38, 48), 16);
  // the lower face's solid core: the cheeks and jaw are one mass, not blobs round a hollow
  d = smin(d, ell(ax, yl, z, 0, 48, 30, 54, 42, 58), 16);
  // the base of the skull behind the jaw, down into the neck
  d = smin(d, ell(ax, y, z, 0, 76, -24, 52, 44, 60), 30);
  // the jaw: its body from the chin back to its angle, the ramus from there up towards the ear, the
  // floor between its sides
  d = smin(d, seg(ax, yl, z, F.chin - 2, 9, 78, F.jaw, 30, 4, 12, 10), 18);
  d = smin(d, seg(ax, yl, z, F.jaw - 3, 30, 6, 46, 80, 2, 9, 7.5), 12);
  d = smin(d, ell(ax, yl, z, 0, 28, 24, 44, 18, 44), 12);
  // the side of the face under the cheekbone's arch, in front of the ear (the chewing muscle)
  d = smin(d, ell(ax, yl, z, 47, 76, 20, 12, 30, 24), 18);
  // the top of the neck under the jaw and the skull (the rig's neck carries on below it)
  d = smin(d, ell(ax, y, z, 0, 0, -8, 57, 58, 53), 18);
  // the cheekbones' arches back towards the ears
  d = smin(d, seg(ax, yl, z, 55, 102, 44, 59, 100, 14, 5, 4.5), 14);
  // nothing below reaches this far back
  if (z < 25) return d;
  // brow ridge: from the glabella out over each eye, heavier in the middle
  const b = F.brow;
  d = smin(d, seg(ax, y, z, 0, 138, 86 + 2 * b, 42, 135, 75 + 1.5 * b, 6 + 1.2 * b, 5.5), 18);
  // cheekbones, the cheeks' fullness below them
  const c = F.cheek;
  d = smin(d, ell(ax, yl, z, 50, 101, 57, 15 * c, 11, 16), 10);
  d = smin(d, ell(ax, yl, z, 40, 78, 62, 18, 20, 15), 12);
  // the muzzle over the teeth above and below the mouth, the chin
  d = smin(d, ell(ax, yl, z, 0, 58, 78, 26, 20, 22), 10);
  d = smin(d, ell(ax, yl, z, 0, 31, 76, 24, 16, 19), 10);
  d = smin(d, ell(ax, yl, z, 0, 13, 80 + F.chinFwd, F.chin, 15, 15), 8);
  if (ax < 40 && yl > 28 && yl < 62) {
    // lips: rolls along the teeth meeting in a crease, the upper one thinner; the corners tucked in
    const lp = F.lips;
    // joined sharply, so the line between them stays a crease, then blended into the face
    const m0 = mouthY(0);
    const lips = Math.min(lip(ax, yl, z, m0 + 3.8 * lp + 0.6, 94.8, 22.5, 3.8 * lp, 3), lip(ax, yl, z, m0 - 4.8 * lp - 0.6, 92.5, 20.5, 4.8 * lp, 1.8));
    d = smin(d, lips, 3.5);
    d = smax(d, -ell(ax, yl, z, 25, mouthY(ax) - 0.3, 90, 3, 2.4, 3.5), 2);
  }
  if (Math.abs(ax - EYE.x) < 32 && y > 85 && y < 150) {
    // eye sockets under the brow, then the lids riding on the eyeball round the opening
    d = smax(d, -ell(ax, y, z, EYE.x, 117, 77, 16, 11.5, 10), 12);
    const ex = ax - EYE.x, ey = y - EYE.y, ez = z - EYE.z;
    const ball = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const lids = smax(ball - (EYE.r + 1.9), -eyeOpening(ex, ey, F), 0.9);
    d = smin(d, lids, 2.5);
    // the eyeball's own surface, just behind the rendered eye
    d = Math.min(d, ball - (EYE.r - 0.35));
  }
  if (ax < 30 && y > 55 && y < 135) {
    // the nose: a narrow ridge from between the eyes to the tip over a body that widens to the
    // nostrils, a hump on the bridge, the rounded tip, the nostrils' wings with a crease round them
    const nl = F.noseLen, np = F.nosePro, ty = 124 - nl + 4, tz = 90 + 22 * np;
    const tilt = Math.atan2(tz - 88, 124 - ty);
    d = smin(d, tilted(ax, y, z, 0, (124 + ty) / 2 + 2, (88 + tz) / 2 - 1.5, 5.2, nl / 2 + 3, 4.6, tilt), 5);
    d = smin(d, tilted(ax, y, z, 0, lerp(124, ty, 0.64), lerp(88, tz, 0.64) - 8, 10, nl * 0.42, 7.5, tilt), 7);
    if (F.hump > 0) d = smin(d, ell(ax, y, z, 0, 124 - nl * 0.42, 90 + 12.5 * np, 5, 7, 3 + F.hump), 4);
    d = smin(d, ell(ax, y, z, 0, ty, tz - 7, 9, 7.5, 8.5), 4);
    d = smin(d, ell(ax, y, z, F.noseW - 6.5, ty - 3, tz - 18, 6.8, 6, 8), 3.5);
  }
  // a short beard stands off the skin
  if (F.beardDepth > 0 && y < 125 && z > -30) {
    // easing in across its edge, and shorter round the lips
    const b = beardAt(ax, y, z, F, 2.5), my = mouthY(Math.min(ax, 24));
    const nearLips = sm(32, 20, ax) * sm(my + 18, my + 8, y) * sm(my - 22, my - 12, y);
    d -= F.beardDepth * b * b * (3 - 2 * b) * (1 - 0.85 * nearLips);
  }
  return d;
}

// --- the grid the skin is meshed on (and its uvs) -------------------------------------------------

/**
 * Where a ray at elevation `el` starts: rays aimed down (the jaw, the mouth, under the nose) start low
 * behind the nose, rays aimed up (the brow, the forehead) at eye level further back, so each meets its
 * part of the face squarely instead of skimming along it. The start rises with the elevation, so the
 * rays fan out without crossing.
 */
export function origin(el: number, out: { x: number; y: number; z: number }): typeof out {
  const k = sm(-0.3, 0.4, el);
  out.x = 0; out.y = lerp(82, 112, k); out.z = lerp(18, 5, k);
  return out;
}

/** positions along an axis, spaced so that each step holds the same share of `density` */
function warp(n: number, lo: number, hi: number, density: (a: number) => number): Float64Array {
  const M = 2048, cum = new Float64Array(M + 1);
  for (let i = 0; i < M; i++) cum[i + 1] = cum[i] + density(lo + (hi - lo) * (i + 0.5) / M);
  const out = new Float64Array(n + 1), total = cum[M];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const want = (i / n) * total;
    while (k < M && cum[k + 1] < want) k++;
    const f = cum[k + 1] > cum[k] ? (want - cum[k]) / (cum[k + 1] - cum[k]) : 0;
    out[i] = lo + (hi - lo) * (k + clamp(f, 0, 1)) / M;
  }
  out[0] = lo; out[n] = hi;
  return out;
}

export interface HeadGrid {
  nu: number; nv: number;
  /** azimuth per column (0 the face, +x the left side), elevation per row (bottom up) */
  az: Float64Array; el: Float64Array;
  /** distance from the ray's origin to the skin along each grid ray, mm, row-major (nv + 1) x (nu + 1) */
  r: Float32Array;
}

/** a direction from the grid's angles */
export function gridDir(az: number, el: number, out: { x: number; y: number; z: number }): typeof out {
  const ce = Math.cos(el);
  out.x = Math.sin(az) * ce; out.y = Math.sin(el); out.z = Math.cos(az) * ce;
  return out;
}

/** Cast the grid's rays: the outermost crossing of the skin along each, found from outside inwards. */
export function headGrid(F: FaceShape, nu: number, nv: number): HeadGrid {
  // columns densest over the face, rows densest from the chin to the brows
  const az = warp(nu, -Math.PI, Math.PI, (a) => 1 + 2.2 * Math.exp(-((a / 0.95) ** 2)));
  const el = warp(nv, -Math.PI / 2, Math.PI / 2, (e) => 0.35 + 1.6 * Math.exp(-(((e + 0.1) / 0.75) ** 2)));
  const r = new Float32Array((nu + 1) * (nv + 1)), W = nu + 1;
  const d = { x: 0, y: 0, z: 0 }, C = { x: 0, y: 0, z: 0 };
  const f = (t: number) => headSDF(C.x + d.x * t, C.y + d.y * t, C.z + d.z * t, F);
  /** the outermost crossing along ray (i, j), from `start` (outside) inwards: steps no longer than the
   *  distance to the skin until inside, then halving the bracket */
  const cast = (i: number, j: number, start: number) => {
    gridDir(az[i], el[j], d);
    origin(el[j], C);
    let hi = start, v = f(hi);
    // a start inside (a nose standing out of its neighbours) steps out first
    while (v < 0 && hi < 162) { hi = Math.min(162, hi + 10); v = f(hi); }
    let lo = hi;
    for (let s = 0; s < 200; s++) {
      lo = hi - (v > 12 ? Math.min(10, v * 0.85) : Math.max(0.4, v * 0.85));
      const w = f(lo);
      if (w < 0 || lo < 5) break;
      hi = lo; v = w;
    }
    for (let s = 0; s < 7; s++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  // every fourth ray from outside the whole head, then the rest from just outside what those give
  const K = 4, done = new Uint8Array(W * (nv + 1));
  for (let j = 0; j <= nv; j += K) for (let i = 0; i <= nu; i += K) { r[j * W + i] = cast(i, j, 162); done[j * W + i] = 1; }
  const coarse = (i: number, j: number) => {
    const i0 = Math.min(Math.floor(i / K) * K, Math.floor(nu / K) * K), j0 = Math.min(Math.floor(j / K) * K, Math.floor(nv / K) * K);
    const i1 = Math.min(i0 + K, Math.floor(nu / K) * K), j1 = Math.min(j0 + K, Math.floor(nv / K) * K);
    const a = i1 > i0 ? (i - i0) / (i1 - i0) : 0, b = j1 > j0 ? (j - j0) / (j1 - j0) : 0;
    return lerp(lerp(r[j0 * W + i0], r[j0 * W + i1], a), lerp(r[j1 * W + i0], r[j1 * W + i1], a), b);
  };
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) if (!done[j * W + i]) r[j * W + i] = cast(i, j, Math.min(162, coarse(i, j) + 14));
  return { nu, nv, az, el, r };
}

/** the skin's radius at fractional grid coordinates (bilinear) */
export function gridR(g: HeadGrid, fi: number, fj: number): number {
  const i0 = clamp(Math.floor(fi), 0, g.nu - 1), j0 = clamp(Math.floor(fj), 0, g.nv - 1);
  const a = clamp(fi - i0, 0, 1), b = clamp(fj - j0, 0, 1), W = g.nu + 1;
  const r00 = g.r[j0 * W + i0], r10 = g.r[j0 * W + i0 + 1], r01 = g.r[(j0 + 1) * W + i0], r11 = g.r[(j0 + 1) * W + i0 + 1];
  return lerp(lerp(r00, r10, a), lerp(r01, r11, a), b);
}

// --- the painted skin ---------------------------------------------------------------------------

/** A face's colouring: skin, hair and beard (sRGB 0..1), and how the hair grows. */
export interface FaceLook {
  skin: [number, number, number];
  hair: [number, number, number];
  /** lighter strands through the hair and beard */
  streak: [number, number, number];
  /** share of grey strands */
  grey: number;
  /** a beard over the jaw, chin and upper lip (0 clean-shaven, 1 full) */
  beard: number;
  /** age: deeper lines on the brow and round the eyes */
  age: number;
}

export const LOOKS: Record<keyof typeof FACES, FaceLook> = {
  warrior: { skin: [0.72, 0.5, 0.39], hair: [0.13, 0.085, 0.06], streak: [0.3, 0.2, 0.13], grey: 0.02, beard: 1, age: 0.8 },
  mage: { skin: [0.78, 0.57, 0.46], hair: [0.12, 0.08, 0.058], streak: [0.28, 0.19, 0.13], grey: 0.06, beard: 1, age: 1 },
};

/** a smooth 3D value noise in [0, 1] from integer hashing (no tables, so it costs nothing to set up) */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = x - X, fy = y - Y, fz = z - Z, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number, k: number) => {
    let n = (i * 374761393 + j * 668265263 + k * 1274126177 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const a = lerp(h(X, Y, Z), h(X + 1, Y, Z), u), b = lerp(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u);
  const c = lerp(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), e = lerp(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u);
  return lerp(lerp(a, b, v), lerp(c, e, v), w);
}
/** a table of random values for the fast 2D noise below (the same everywhere: seeded) */
const NT = 256, TABLE = ((): Float32Array => {
  const t = new Float32Array(NT * NT);
  let s = 12345;
  for (let i = 0; i < t.length; i++) { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) | 0; t[i] = (s >>> 0) / 4294967295; }
  return t;
})();
/** 2D value noise over texel coordinates, wrapping round the head every `px` in x (a table lookup: the
 *  paint calls it millions of times) */
function tnoise(x: number, y: number, px: number, seed: number): number {
  x = ((x % px) + px) % px + seed * 57.3; y += seed * 131.7;
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const x0 = X & (NT - 1), y0 = (Y & (NT - 1)) * NT, x1 = (X + 1) & (NT - 1), y1 = ((Y + 1) & (NT - 1)) * NT;
  return lerp(lerp(TABLE[y0 + x0], TABLE[y0 + x1], u), lerp(TABLE[y1 + x0], TABLE[y1 + x1], u), v);
}

/** 0 on the face, 1 where hair grows on the scalp: the forehead's line with recessions at the temples,
 *  sideburns in front of the ears, above the ears, down to the nape */
export function scalp(ax: number, y: number, z: number): number {
  const a = Math.atan2(ax, z + 12);
  // the hairline's height round the head
  const line = a < 0.35 ? lerp(188, 194, sm(0, 0.35, a))
    : a < 0.8 ? lerp(194, 170, sm(0.35, 0.8, a))
    : a < 1.25 ? lerp(170, 104, sm(0.8, 1.2, a))
    : a < 1.7 ? lerp(104, 132, sm(1.3, 1.62, a))
    : lerp(132, 78, sm(1.75, 2.6, a));
  return sm(line - 3, line + 5, y);
}

/** How much beard grows at a point (0..1): the jaw and chin, the cheeks below a line from the sideburns
 *  to the corners of the mouth, the moustache, under the jaw; never on the lips. `soft` widens its edges
 *  (the beard's volume eases in more gradually than its paint). */
export function beardAt(ax: number, y: number, z: number, F: FaceShape, soft = 1): number {
  const my = mouthY(Math.min(ax, 24));
  // the cheek line: high at the sideburns, dropping across the cheek to the moustache
  const cheek = lerp(66, 112, sm(26, 58, ax)) - 8 * sm(40, 80, z) * sm(20, 50, ax);
  let b = sm(cheek + 3 * soft, cheek - 6 * soft, y);
  // the moustache over the upper lip, clear of the nostrils
  const nb = 124 - F.noseLen + 4 - 5;
  const stache = sm(nb + 1, nb - 4, y) * sm(28, 20, ax) * sm(80, 90, z);
  b = Math.max(b, stache);
  // the lips stay bare, right up to their border
  if (ax < 26 && y > 25 && y < 62 && z > 82) {
    const top = lipBorder(ax, 1, F), bot = lipBorder(ax, -1, F);
    b *= 1 - sm(24 + soft, 22, ax) * sm(top + 0.8 * soft, top, y) * sm(bot - 0.8 * soft, bot, y) * sm(84, 90, z);
  }
  // its back edge: in front of the ears, then behind the jaw's angle and down and forward along the
  // neck to the throat; nothing below the throat
  const back = y > 60 ? 4 : lerp(-12, 30, sm(50, -30, y));
  return b * sm(back - 4, back + 6, z) * sm(-45, -25, y);
}

export interface FaceMaps { w: number; h: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer>; rough: Uint8ClampedArray<ArrayBuffer> }

/**
 * Paint a face on its grid (`w` x `h` texels, uvs as the grid's): skin mottled and warmer on the cheeks,
 * nose and lips, shadow under the eyes and in the lid crease, the lash line, brows and beard in hair
 * strokes, stubble at the beard's edge, nostrils, the mouth's line, the scalp under the hair; and a
 * height for the normal map (pores, lines, hairs) and roughness (an oilier brow and nose, moist lips).
 */
export function paintFace(F: FaceShape, L: FaceLook, g: HeadGrid, w: number, h: number): FaceMaps {
  const n = w * h, albedo = new Uint8ClampedArray(n * 4), rough = new Uint8ClampedArray(n * 4), hgt = new Float32Array(n);
  // per column and row: the grid's angles at the texel's centre
  const col = new Float64Array(w * 3), row = new Float64Array(h * 5);
  const lerpArr = (arr: Float64Array, f: number) => { const i = Math.min(Math.floor(f), arr.length - 2); return lerp(arr[i], arr[i + 1], f - i); };
  for (let x = 0; x < w; x++) { const fi = (x + 0.5) / w * g.nu, az = lerpArr(g.az, fi); col[x * 3] = fi; col[x * 3 + 1] = Math.sin(az); col[x * 3 + 2] = Math.cos(az); }
  const o = { x: 0, y: 0, z: 0 };
  for (let y = 0; y < h; y++) {
    // texture rows run down from the top (v = 1)
    const fj = (1 - (y + 0.5) / h) * g.nv, el = lerpArr(g.el, fj);
    origin(el, o);
    row[y * 5] = fj; row[y * 5 + 1] = Math.sin(el); row[y * 5 + 2] = Math.cos(el); row[y * 5 + 3] = o.y; row[y * 5 + 4] = o.z;
  }
  const nb = 124 - F.noseLen + 4, tz = 90 + 22 * F.nosePro;
  const S = L.skin, HAIR = L.hair;
  const c = [0, 0, 0];
  const mix = (t: number, r: number, gg: number, b: number) => { c[0] += (r - c[0]) * t; c[1] += (gg - c[1]) * t; c[2] += (b - c[2]) * t; };
  const G = (dx: number, dy: number, dz: number, s: number) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (s * s));
  for (let ty = 0; ty < h; ty++) {
    const fj = row[ty * 5], se = row[ty * 5 + 1], ce = row[ty * 5 + 2], oy = row[ty * 5 + 3], oz = row[ty * 5 + 4];
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx, fi = col[tx * 3], r = gridR(g, fi, fj);
      const x = col[tx * 3 + 1] * ce * r, yy = oy + se * r, z = oz + col[tx * 3 + 2] * ce * r, ax = Math.abs(x);
      const face = sm(30, 70, z);
      // --- skin: mottled at two scales, warmer on the cheeks, nose, chin, round the mouth and the brow
      const m1 = vnoise(x / 14, yy / 14, z / 14, 1), m2 = tnoise(tx / 15, ty / 15, w / 15, 2);
      const k = 0.93 + 0.1 * m1 + 0.04 * m2;
      c[0] = S[0] * k; c[1] = S[1] * k * (0.98 + 0.04 * m1); c[2] = S[2] * k;
      if (z > 20) {
        const warm = 0.75 * G(ax - 42, yy - 88, z - 70, 16) + 0.8 * G(x, yy - (nb + 6), z - tz, 12) + 0.35 * G(x, yy - 18, z - 90, 18) + 0.3 * G(x, yy - 58, z - 95, 14) + 0.25 * G(x, yy - 160, z - 88, 30);
        c[0] *= 1 + 0.08 * warm; c[1] *= 1 - 0.07 * warm; c[2] *= 1 - 0.05 * warm;
      }
      let hh = (tnoise(tx * 0.9, ty * 0.9, w * 0.9, 3) - 0.5) * 0.35 + (tnoise(tx * 0.3, ty * 0.3, w * 0.3, 4) - 0.5) * 0.2;
      let rr = 0.55 - 0.12 * face * (sm(150, 175, yy) * sm(200, 180, yy) + G(x, yy - 100, z - 105, 18)) + 0.06 * m2;
      // --- eyes: shadow under them and in the upper lid's crease, the lash line, pink inner corners
      const ex = ax - EYE.x, ey = yy - EYE.y;
      if (Math.abs(ex) < 26 && ey > -22 && ey < 20) {
        const op = eyeOpening(ex, ey, F);
        const under = G(ex + 2, ey + 9, 0, 7) * face;
        c[0] *= 1 - 0.1 * under; c[1] *= 1 - 0.15 * under; c[2] *= 1 - 0.06 * under;
        // the crease above the lid, following the opening's arc about 6 mm higher
        const crease = Math.exp(-(((op + 5.5) / 1.4) ** 2)) * sm(-1, 3, ey) * sm(17, 9, Math.abs(ex + 1));
        mix(0.45 * crease, c[0] * 0.66, c[1] * 0.58, c[2] * 0.58); hh -= crease * 0.5;
        // the lash line: dark along the upper edge, softer along the lower
        const lashes = Math.exp(-((op / 0.9) ** 2)) * (ey > 0 ? 1 : 0.35) * sm(16, 11, Math.abs(ex + 0.5));
        mix(0.8 * lashes, 0.1, 0.06, 0.05);
        mix(0.6 * G(ex + 15, ey + 0.5, 0, 2.6), 0.75, 0.42, 0.42);
      }
      // --- brows: strokes along the brow ridge, thickest at the inner end
      const bx = ax - 6;
      if (bx > -2 && bx < 48 && yy > 118 && yy < 150) {
        const top = 136 + 5 * Math.sin(Math.min(1, bx / 30) * Math.PI * 0.7) - 0.06 * Math.max(0, bx - 30) ** 1.5;
        const thick = lerp(8, 3.2, sm(0, 44, bx));
        const d = (yy - (top - thick / 2)) / (thick / 2);
        const brow = Math.exp(-(d * d) * 1.2) * sm(-2, 3, bx) * sm(48, 38, bx) * face;
        if (brow > 0.01) {
          const s1 = tnoise(tx * 0.12, ty * 2.2, w * 0.12, 5), s2 = tnoise(tx * 0.3, ty * 3.1, w * 0.3, 6);
          const hairs = brow * sm(0.35, 0.65, s1 * 0.6 + s2 * 0.4);
          mix(0.95 * hairs, HAIR[0], HAIR[1], HAIR[2]); hh += hairs * 0.7; rr += hairs * 0.25;
        }
      }
      // --- nostrils
      if (ax < 20 && Math.abs(yy - nb) < 16 && z > 80) {
        const nos = G(ax - (F.noseW - 10), yy - (nb - 5.5), (z - (tz - 10)) * 0.5, 3.2) * sm(nb - 1, nb - 5, yy);
        mix(0.9 * nos, 0.12, 0.05, 0.04);
      }
      // --- lips: the vermilion with its fine vertical lines, and the line between them
      const my = mouthY(Math.min(ax, 24)), mouth = ax < 30 && yy > 25 && yy < 62 && z > 80;
      const lipK = mouth ? sm(lipBorder(ax, 1, F) + 0.5, lipBorder(ax, 1, F) - 0.5, yy) * sm(lipBorder(ax, -1, F) - 0.5, lipBorder(ax, -1, F) + 0.5, yy) * sm(84, 90, z) : 0;
      if (lipK > 0.01) {
        // dusky rose, the lower lip a little lighter and wetter
        const lo = yy < my ? 1 : 0;
        mix(0.62 * lipK, 0.6 + 0.04 * lo, 0.34 + 0.03 * lo, 0.32 + 0.02 * lo);
        hh += lipK * 0.25 * Math.sin(x * 9 + Math.sin(yy * 2) * 0.6); rr -= lipK * (0.16 + 0.1 * lo);
      }
      // the line between the lips, darker into the corners
      if (mouth) {
        const line = Math.exp(-(((yy - my) / 0.75) ** 2)) * sm(25.5, 21, ax) * sm(84, 90, z) * (0.75 + 0.25 * sm(12, 22, ax));
        mix(0.85 * line, 0.16, 0.06, 0.05); hh -= line * 0.8;
      }
      // --- age: lines across the brow, crow's feet at the eyes' outer corners
      if (L.age > 0 && z > 30 && yy > 95 && yy < 185) {
        const fh = sm(145, 150, yy) * sm(178, 168, yy) * sm(55, 30, ax) * face;
        const lines = Math.max(0, Math.sin(yy * 0.62 + Math.sin(x * 0.09) * 1.2 + vnoise(x / 20, yy / 20, 0, 7) * 2)) ** 6;
        hh -= L.age * fh * lines * 0.5;
        c[0] *= 1 - L.age * fh * lines * 0.05; c[1] *= 1 - L.age * fh * lines * 0.07; c[2] *= 1 - L.age * fh * lines * 0.07;
        const cf = G(ex - 20, ey - 1, 0, 7) * face;
        const rays = Math.max(0, Math.sin(Math.atan2(ey - 1, ex - 14) * 11)) ** 5;
        hh -= L.age * cf * rays * 0.6;
      }
      // --- the beard: dense short hairs growing down, lighter strands through it, stubble at its edge
      const b = yy < 125 && z > -40 ? L.beard * beardAt(ax, yy, z, F, 1.5) : 0;
      if (b > 0.005) {
        const s1 = tnoise(tx * 0.9, ty * 0.12, w * 0.9, 8), s2 = tnoise(tx * 0.45, ty * 0.07, w * 0.45, 9), s3 = tnoise(tx * 1.7, ty * 1.7, w * 1.7, 10);
        const dense = sm(0.15, 0.6, b);
        const cover = dense * (0.78 + 0.22 * sm(0.3, 0.7, s1)) + (1 - dense) * sm(0.55, 0.8, s3) * b * 2;
        const strand = sm(0.55, 0.8, s2);
        let hr = lerp(HAIR[0], L.streak[0], strand * 0.55), hg = lerp(HAIR[1], L.streak[1], strand * 0.55), hb = lerp(HAIR[2], L.streak[2], strand * 0.55);
        if (L.grey > 0 && tnoise(tx * 0.5, ty * 0.05, w * 0.5, 11) > 1 - L.grey) { hr = 0.42; hg = 0.4; hb = 0.38; }
        mix(clamp(cover, 0, 0.97), hr, hg, hb);
        hh += b * (s1 * 0.9 + s3 * 0.3); rr = lerp(rr, 0.8, clamp(cover, 0, 1));
      }
      // --- the scalp under the hair
      const sc = yy > 70 ? scalp(ax, yy, z) : 0;
      if (sc > 0) {
        const s1 = tnoise(tx * 0.9, ty * 0.15, w * 0.9, 12);
        mix(sc * 0.97, lerp(HAIR[0], L.streak[0], s1 * 0.4), lerp(HAIR[1], L.streak[1], s1 * 0.4), lerp(HAIR[2], L.streak[2], s1 * 0.4));
        hh += sc * s1 * 0.6; rr = lerp(rr, 0.75, sc);
      }
      albedo[i * 4] = clamp(c[0], 0, 1) * 255; albedo[i * 4 + 1] = clamp(c[1], 0, 1) * 255; albedo[i * 4 + 2] = clamp(c[2], 0, 1) * 255; albedo[i * 4 + 3] = 255;
      const rv = clamp(rr, 0.2, 0.95) * 255;
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
      hgt[i] = hh;
    }
  }
  const normal = new Uint8ClampedArray(n * 4);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = ty * w + tx, l = ty * w + (tx + w - 1) % w, rt = ty * w + (tx + 1) % w;
    const up = Math.max(0, ty - 1) * w + tx, dn = Math.min(h - 1, ty + 1) * w + tx;
    const dx = (hgt[rt] - hgt[l]) * 1.5, dy = (hgt[dn] - hgt[up]) * 1.5, len = Math.hypot(dx, dy, 1);
    normal[i * 4] = (-dx / len * 0.5 + 0.5) * 255; normal[i * 4 + 1] = (dy / len * 0.5 + 0.5) * 255; normal[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255; normal[i * 4 + 3] = 255;
  }
  return { w, h, albedo, normal, rough };
}

/** the face maps' size, and the grid they are painted on (any grid of the head shares its uvs) */
const MAP_W = 1024, MAP_H = 512;

/** A hero's face maps, as the loading workers make them (core/pbr.ts). */
export function faceData(who: keyof typeof FACES): PBRData {
  const F = FACES[who], P = paintFace(F, LOOKS[who], headGrid(F, 112, 88), MAP_W, MAP_H);
  return { size: P.w, height: P.h, albedo: P.albedo, normal: P.normal, rough: P.rough };
}
