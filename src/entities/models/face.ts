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
  /** a high nose bridge (mm): the nose rises straight from between the brows instead of from a dip */
  bridge?: number;
  /** the nose's tip, how big and round (1 average) */
  tip?: number;
  /** how much lower the beard's edge comes down across the cheek (mm) */
  beardLine?: number;
  /** a trimmed moustache: how far it curves down to the mouth's corners (mm), thinning there */
  stacheCurve?: number;
  /** how much lower the brows sit (mm), the ridge and the hairs both: close over the eyes */
  browDrop?: number;
  /** hollows under the cheekbones (mm deep) */
  hollow?: number;
  /** half the lower face's width (mm; 54 average): a narrower one tapers to the chin */
  lowerW?: number;
  /** how far out the chewing muscle fills the face's side below the cheekbone (mm, 47) */
  masseter?: number;
  /** the top of the neck under the jaw: half its width (mm, 57), its middle's depth (mm, -8) and how softly it
   *  blends into the jaw (mm, 18); narrower, further back and blended less, the jaw stands out over it in a line */
  neckW?: number; neckBack?: number; neckBlend?: number;
  /** how far down under the jaw the beard grows (mm from the chin's underside; -45 down the throat) */
  beardUnder?: number;
  /** how softly the lower lid blends into the cheek (mm; 0 a lid standing out of the socket, its edge a crease) */
  lidSoft?: number;
  /** how far the ears' backs stand out from the head (radians, 0.5 average) */
  earFlare?: number;
  /** how much further out the cheekbones' arches stand (mm each side), the mid-face widening with them: a broad face
   *  at the cheekbones without a bump on them */
  zygo?: number;
}

export const FACES: Record<'warrior' | 'mage', FaceShape> = {
  // broad jaw and chin, a heavy brow over deep-set eyes, high cheekbones, a straight nose
  warrior: { jaw: 50, chin: 14, chinFwd: 6, brow: 1.4, cheek: 1.1, noseLen: 55, noseW: 13.2, nosePro: 1.14, hump: 0.9, lips: 0.72, long: 0.98, tip: 1.15, eyeOpen: 2.9, iris: [0.37, 0.36, 0.3], beardDepth: 1.8, bridge: 6, beardLine: 22, browDrop: 8, masseter: 53, stacheCurve: 8, beardUnder: -12, lowerW: 60, neckW: 48, neckBack: -16, neckBlend: 9, lidSoft: 4, earFlare: 0.3, zygo: 8 },
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
  const zg = F.zygo ?? 0;
  d = smin(d, ell(ax, yl, z, 0, 92, 44, 54 + zg, 38, 48), 16);
  // the lower face's solid core: the cheeks and jaw are one mass, not blobs round a hollow
  d = smin(d, ell(ax, yl, z, 0, 48, 30, F.lowerW ?? 54, 42, 58), 16);
  // the base of the skull behind the jaw, down into the neck
  d = smin(d, ell(ax, y, z, 0, 76, -24, 52, 44, 60), 30);
  // the jaw: its body from the chin back to its angle, the ramus from there up towards the ear, the
  // floor between its sides
  d = smin(d, seg(ax, yl, z, F.chin - 2, 9, 78, F.jaw, 30, 4, 12, 10), 18);
  d = smin(d, seg(ax, yl, z, F.jaw - 3, 30, 6, 46, 80, 2, 9, 7.5), 12);
  d = smin(d, ell(ax, yl, z, 0, 28, 24, 44, 18, 44), 12);
  // the side of the face under the cheekbone's arch, in front of the ear (the chewing muscle)
  d = smin(d, ell(ax, yl, z, (F.masseter ?? 47) + zg * 0.6, 76, 20, 12, 30, 24), 18);
  // the top of the neck under the jaw and the skull (the rig's neck carries on below it)
  d = smin(d, ell(ax, y, z, 0, 0, F.neckBack ?? -8, F.neckW ?? 57, 58, 53), F.neckBlend ?? 18);
  // the cheekbones' arches back towards the ears
  d = smin(d, seg(ax, yl, z, 55 + zg, 102, 44, 59 + zg, 100, 14, 5, 4.5), 14);
  // (and the temples above them, the muscle there filling the side of the head out to the arches)
  if (zg) d = smin(d, ell(ax, y, z, 56 + zg * 0.6, 120, 28, 9, 22, 24), 14);
  // nothing below reaches this far back
  if (z < 25) return d;
  // brow ridge: from the glabella out over each eye, heavier in the middle
  const b = F.brow;
  const bd = F.browDrop ?? 0;
  d = smin(d, seg(ax, y, z, 0, 138 - bd, 86 + 2 * b, 42, 135 - bd, 75 + 1.5 * b, 6 + 1.2 * b, 5.5), 18);
  // cheekbones, the cheeks' fullness below them
  const c = F.cheek;
  d = smin(d, ell(ax, yl, z, 50, 101, 57, 15 * c, 11, 16), 10);
  d = smin(d, ell(ax, yl, z, 40, 78, 62, 18, 20, 15), 12);
  // (in front of the face's side, so the outline keeps its line)
  if (F.hollow) d = smax(d, -ell(ax, yl, z, 38, 66, 62 + F.hollow * 2.2, 11, 15, 11), 14);
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
    // (a soft lower lid is thinner and blends into the cheek: no bag over a crease)
    const below = F.lidSoft ? sm(-2, -8, ey) : 0;
    const lids = smax(ball - (EYE.r + 1.9 - 0.8 * below), -eyeOpening(ex, ey, F), 0.9);
    d = smin(d, lids, 2.5 + (F.lidSoft ?? 0) * below);
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
    if (F.bridge) d = smin(d, ell(ax, y, z, 0, 126, 86 + F.bridge, 7, 10, 5), 5);
    if (F.hump > 0) d = smin(d, ell(ax, y, z, 0, 124 - nl * 0.42, 90 + 12.5 * np, 5, 7, 3 + F.hump), 4);
    const tp = F.tip ?? 1;
    d = smin(d, ell(ax, y, z, 0, ty, tz - 7 - 1.5 * (tp - 1), 9 * tp, 7.5 * tp, 8.5 * tp), 4);
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

/** How much of the light the jaw takes from the neck under it, at height `y` (mm, the face's frame) `ax` from the middle:
 *  the game's shadows are too coarse to show it (the neck in models/head.ts shades its own top the same way). */
export function neckShade(ax: number, y: number): number {
  const jawY = 30 * Math.min(1, ax / 50) ** 1.5;
  return 0.82 * sm(jawY + 8, jawY - 10, y) * (1 - 0.4 * sm(-50, -110, y));
}

/** the occlusion's steps out from the skin (mm) and their weights */
const AO_STEPS: [number, number][] = [[2, 0.5], [5, 0.35], [10, 0.25], [18, 0.15], [30, 0.1]];

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
  /** how heavy the brows are (1 average): thicker and denser */
  brows?: number;
  /** how much the brows arch (1 average; 0 straight, their inner ends drawn down towards the nose) */
  browArch?: number;
  /** how far the brows' outer tails droop (1 average) and how solidly their middle is filled (0 hairs only) */
  browTail?: number; browFill?: number;
  /** how evenly thick the brows are (0 tapering to a thin tail, 1 nearly even: a wedge reads as a scowl) */
  browEven?: number;
  /** how far the brows' outer ends are raised (mm): level as the forehead curves away, rather than drooping */
  browLift?: number;
  /** how deep the pores and fine bumps of the skin are (1 average) */
  pores?: number;
  /** how much lower the hairline comes over the forehead (mm), and lower again at the temples */
  hairDrop?: number; templeDrop?: number;
  /** a short-cropped beard (0 a full one): sparser, the skin showing through it */
  stubble?: number;
  /** how strongly the lips are coloured (1 average) */
  lipTint?: number;
  /** how dark and big the nostrils show from the front (1 average) */
  nostrils?: number;
  /** how dark the skin under the eyes is (1 average) */
  under?: number;
  /** shading painted into the skin where light falls less (the eye sockets, beside the nose, under the
   *  cheekbones and the jaw): a lean, sculpted face */
  contour?: number;
  /** occlusion baked into the skin (0 none, 1 full): how much of the open air round each point the head itself takes,
   *  in the eye sockets, under the nose and the lips, under the jaw (the game's shadows are far too coarse for a face's) */
  ao?: number;
  /** the beard's hairs (sRGB 0..1; the hair's by default), and the brows' halfway between the two */
  beardHair?: [number, number, number];
  /** how much the upper lid shades the eye under it (0 none, 1 deep-set) and how dim the white of the eye is */
  eyeShade?: number;
  /** how rosy the cheeks, nose, chin and lips' surround are (1 average) */
  flush?: number;
  /** how glossy the lips are (1 average: moist; less, dry and matte, no shine along the lower lip) */
  lipGloss?: number;
  /** the face's outer edge darker, the temples and the cheeks' sides, as the hair standing over them shades them, and the
   *  cheekbones turning away under the eyes (0 none, 1 under thick hair) */
  cheekShade?: number;
}

export const LOOKS: Record<keyof typeof FACES, FaceLook> = {
  warrior: { skin: [0.8, 0.68, 0.65], hair: [0.155, 0.112, 0.07], streak: [0.4, 0.3, 0.18], ao: 0.55, beardHair: [0.38, 0.27, 0.16], eyeShade: 0.55, flush: 1.8, lipGloss: 0.3, grey: 0.02, beard: 1, age: 0.25, brows: 1.05, hairDrop: 20, cheekShade: 1, stubble: 0.8, contour: 0.45, browArch: 0.2, pores: 0.45, lipTint: 1.1, nostrils: 1.1, browTail: 0, browFill: 0.15, browEven: 1, under: 0, browLift: 2.5, templeDrop: 22 },
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
export function scalp(ax: number, y: number, z: number, drop = 0, temple = 0): number {
  const line = hairline(ax, z, drop, temple);
  return sm(line - 3, line + 5, y);
}

/** the hairline's height (mm) round the head at (ax, z), `drop` mm lower over the forehead and `temple` mm lower
 *  again at the temples (hair framing the forehead) */
export function hairline(ax: number, z: number, drop = 0, temple = 0): number {
  const a = Math.atan2(ax, z + 12);
  return -drop * (1 - sm(0.6, 1.1, a)) - temple * sm(0.35, 0.75, a) * (1 - sm(1.0, 1.3, a)) + (a < 0.35 ? lerp(188, 194, sm(0, 0.35, a))
    : a < 0.8 ? lerp(194, 170, sm(0.35, 0.8, a))
    : a < 1.25 ? lerp(170, 104, sm(0.8, 1.2, a))
    : a < 1.7 ? lerp(104, 132, sm(1.3, 1.62, a))
    : lerp(132, 78, sm(1.75, 2.6, a)));
}

/** How much beard grows at a point (0..1): the jaw and chin, the cheeks below a line from the sideburns
 *  to the corners of the mouth, the moustache, under the jaw; never on the lips. `soft` widens its edges
 *  (the beard's volume eases in more gradually than its paint). */
export function beardAt(ax: number, y: number, z: number, F: FaceShape, soft = 1): number {
  const my = mouthY(Math.min(ax, 24));
  // the cheek line: high at the sideburns, dropping across the cheek to the moustache
  const cheek = lerp(66, 112, sm(26, 58, ax)) - 8 * sm(40, 80, z) * sm(20, 50, ax);
  const bl = cheek - (F.beardLine ?? 0) * sm(20, 45, ax);
  let b = sm(bl + 3 * soft, bl - 6 * soft, y);
  // the moustache over the upper lip, clear of the nostrils
  const nb = 124 - F.noseLen + 4 - 5;
  // (a trimmed one follows the upper lip, curving down and thinning to the mouth's corners)
  const sc = F.stacheCurve ?? 0, nbx = nb - sc * (ax / 24) ** 2;
  // (a trimmed one thins in the groove under the nose)
  const stache = sm(nbx + 1, nbx - 4, y) * (sc ? sm(30, 16, ax) : sm(28, 20, ax)) * sm(80, 90, z);
  b = Math.max(b, stache);
  // (a trimmed one thins in the groove under the nose)
  if (sc) b *= 1 - 0.6 * sm(9, 3, ax) * sm(nb + 2, nb - 4, y) * sm(mouthY(0) + 4, mouthY(0) + 9, y);
  // the lips stay bare, right up to their border
  if (ax < 26 && y > 25 && y < 62 && z > 82) {
    const top = lipBorder(ax, 1, F), bot = lipBorder(ax, -1, F);
    // (a trimmed one comes right up to them: a margin of bare skin reads as a light line drawn round the lips)
    // (just inside their border, under the lip colour's own soft edge)
    const mg = F.stacheCurve ? 0.25 : 0.8, ins = F.stacheCurve ? 0.7 : 0;
    b *= 1 - sm(24 + soft, 22, ax) * sm(top - ins + mg * soft, top - ins, y) * sm(bot + ins - mg * soft, bot + ins, y) * sm(84, 90, z);
  }
  // its back edge: in front of the ears, then behind the jaw's angle and down and forward along the
  // neck to the throat; nothing below the throat
  const back = y > 60 ? 4 : lerp(-12, 30, sm(50, -30, y));
  let out = b * sm(back - 4, back + 6, z) * sm(F.beardUnder ?? -45, (F.beardUnder ?? -45) + 20, y);
  if (F.neckW !== undefined && y < 40) {
    // (with a jaw standing out over the neck, below its angle the beard grows on the jaw, not down the neck)
    const yl = y < 114 ? 114 - (114 - y) / F.long : y, dj = Math.min(seg(ax, yl, z, F.chin - 2, 9, 78, F.jaw, 30, 4, 12, 10), ell(ax, yl, z, 0, 13, 80 + F.chinFwd, F.chin + 4, 19, 19));
    out *= 1 - (1 - sm(22 + 2 * soft, 4, dj)) * sm(40, 25, y);
  }
  return out;
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
  // --- occlusion, on a coarse grid (it varies slowly): the head's distance sampled out along the normal, each step
  // short of its length by how much of the air there the head takes
  let aoAt: ((tx: number, ty: number) => number) | null = null;
  if (L.ao) {
    const aw = w >> 2, ah = h >> 2, A = new Float32Array(aw * ah), f = (x: number, y: number, z: number) => headSDF(x, y, z, F), e = 0.75;
    for (let j = 0; j < ah; j++) {
      const fj = (1 - (j + 0.5) / ah) * g.nv, el = lerpArr(g.el, fj), se = Math.sin(el), ce = Math.cos(el);
      origin(el, o);
      for (let i = 0; i < aw; i++) {
        const fi = (i + 0.5) / aw * g.nu, az = lerpArr(g.az, fi), r = gridR(g, fi, fj);
        const x = Math.sin(az) * ce * r, y = o.y + se * r, z = o.z + Math.cos(az) * ce * r;
        let nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e);
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        let occ = 0;
        for (const [d, k] of AO_STEPS) occ += k * Math.max(0, d - f(x + nx * d, y + ny * d, z + nz * d)) / d;
        A[j * aw + i] = clamp(1 - occ, 0, 1);
      }
    }
    aoAt = (tx, ty) => {
      const u = (tx + 0.5) / w * aw - 0.5, v = clamp((ty + 0.5) / h * ah - 0.5, 0, ah - 1.001), i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
      const i1 = ((i0 + 1) % aw + aw) % aw, ia = (i0 % aw + aw) % aw, at = (i: number, j: number) => A[j * aw + i];
      return lerp(lerp(at(ia, j0), at(i1, j0), fu), lerp(at(ia, j0 + 1), at(i1, j0 + 1), fu), fv);
    };
  }
  const nb = 124 - F.noseLen + 4, tz = 90 + 22 * F.nosePro;
  const S = L.skin, HAIR = L.hair, BH = L.beardHair ?? HAIR, BROW = [lerp(HAIR[0], BH[0], 0.85), lerp(HAIR[1], BH[1], 0.85), lerp(HAIR[2], BH[2], 0.85)];
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
        // (a flushed face's cheeks spread wider, not patches)
        const warm = 0.75 * G(ax - 42, yy - 88, z - 70, L.flush ? 24 : 16) + 0.8 * G(x, yy - (nb + 6), z - tz, 12) + 0.35 * G(x, yy - 18, z - 90, 18) + 0.3 * G(x, yy - 58, z - 95, 14) + 0.25 * G(x, yy - 160, z - 88, 30);
        const fl = L.flush ?? 1;
        c[0] *= 1 + 0.08 * fl * warm; c[1] *= 1 - 0.07 * fl * warm; c[2] *= 1 - 0.05 * fl * warm;
      }
      if (L.contour && z > 20) {
        const ex0 = ax - EYE.x, ey0 = yy - EYE.y;
        const shade = 0.9 * G(ex0 + 12, ey0 - 2, 0, 9) + 0.6 * G(ex0, ey0 - 9, 0, 11) + 0.55 * G(ax - 17, yy - (nb + 12), 0, 7)
          + 0.45 * G(ax - 48, yy - 66, 0, 14) * sm(40, 65, z) + 0.5 * sm(30, 12, yy) * sm(10, 30, ax)
          + (L.cheekShade ? 1.6 * G(ax - 13, yy - 99, (z - 88) * 0.5, 6) : 0);
        const k2 = 1 - L.contour * 0.22 * Math.min(1.2, shade);
        c[0] *= k2; c[1] *= k2 * 0.98; c[2] *= k2 * 0.98;
      }
      if (L.cheekShade && z > 0) {
        // (the face's outer edge, the temples and the cheeks' sides, under the hair standing over them)
        // (and softly over the cheekbone, turning away under the eye: a patch, not a band down the cheek, which looks gaunt)
        const k3 = 1 - L.cheekShade * (0.3 * sm(44, 60, ax) * sm(70, 88, yy) * sm(155, 135, yy) * (1 - sm(45, 75, z)) + 0.26 * G(ax - 46, yy - 90, 0, 13) * sm(30, 55, z));
        c[0] *= k3 ** 0.85; c[1] *= k3; c[2] *= k3 ** 1.12;
      }
      let hh = ((tnoise(tx * 0.9, ty * 0.9, w * 0.9, 3) - 0.5) * 0.35 + (tnoise(tx * 0.3, ty * 0.3, w * 0.3, 4) - 0.5) * 0.2) * (L.pores ?? 1);
      let rr = 0.55 - 0.12 * face * (sm(150, 175, yy) * sm(200, 180, yy) + G(x, yy - 100, z - 105, 18)) + 0.06 * m2;
      // --- eyes: shadow under them and in the upper lid's crease, the lash line, pink inner corners
      const ex = ax - EYE.x, ey = yy - EYE.y;
      if (Math.abs(ex) < 26 && ey > -22 && ey < 20) {
        const op = eyeOpening(ex, ey, F);
        const under = G(ex + 2, ey + 9, 0, 7) * face * (L.under ?? 1);
        c[0] *= 1 - 0.1 * under; c[1] *= 1 - 0.15 * under; c[2] *= 1 - 0.06 * under;
        // the crease above the lid, following the opening's arc about 6 mm higher
        const crease = Math.exp(-(((op + 5.5) / 1.4) ** 2)) * sm(-1, 3, ey) * sm(17, 9, Math.abs(ex + 1));
        mix(0.45 * crease, c[0] * 0.66, c[1] * 0.58, c[2] * 0.58); hh -= crease * 0.5;
        // the lash line: dark along the upper edge, softer along the lower
        const lw = L.eyeShade ? 0.7 : 0.9, lashes = Math.exp(-((op / lw) ** 2)) * (ey > 0 ? 1 : 0.35) * sm(16, 11, Math.abs(ex + 0.5));
        mix((L.eyeShade ? 0.55 : 0.8) * lashes, 0.1, 0.06, 0.05);
        mix(0.6 * G(ex + 15, ey + 0.5, 0, 2.6), 0.75, 0.42, 0.42);
      }
      // --- brows: strokes along the brow ridge, thickest at the inner end
      const bx = ax - 6;
      if (bx > -2 && bx < 48 && yy > 118 && yy < 150) {
        const arch = L.browArch ?? 1, lift = (L.browLift ?? 0) * sm(24, 44, bx);
        const top = 136 - (F.browDrop ?? 0) + 5 * arch * Math.sin(Math.min(1, bx / 30) * Math.PI * 0.7) - 0.06 * (L.browTail ?? 1) * Math.max(0, bx - 30) ** 1.5 - 5.5 * (1 - arch) * sm(16, 0, bx) + lift;
        const bk = L.brows ?? 1, thick = lerp(8, lerp(3.2, 5.8, L.browEven ?? 0), sm(0, 44, bx)) * bk;
        const d = (yy - (top - thick / 2)) / (thick / 2);
        const brow = Math.exp(-(d * d) * 1.2) * sm(-2, 3, bx) * sm(48, 38, bx) * face;
        if (brow > 0.01) {
          const s1 = tnoise(tx * 0.12, ty * 2.2, w * 0.12, 5), s2 = tnoise(tx * 0.3, ty * 3.1, w * 0.3, 6);
          // (filled solid in its middle, the hairs showing at its edges)
          const hairs = brow * lerp(sm(0.35 - 0.25 * (bk - 1), 0.65 - 0.2 * (bk - 1), s1 * 0.6 + s2 * 0.4), 1, (L.browFill ?? 0) * sm(0.35, 0.75, brow));
          mix((L.beardHair ? 0.72 : 0.95) * hairs, BROW[0], BROW[1], BROW[2]); hh += hairs * 0.7; rr += hairs * 0.25;
        }
      }
      // --- nostrils
      if (ax < 20 && Math.abs(yy - nb) < 16 && z > 80) {
        const nk = L.nostrils ?? 1, nos = G(ax - (F.noseW - 10), yy - (nb - 5.5 + (nk - 1) * 1.5), (z - (tz - 10 + (nk - 1) * 6)) * 0.5, 3.2 * Math.sqrt(nk)) * sm(nb - 1, nb - 5 - (nk - 1) * 2, yy);
        mix(Math.min(0.95, 0.9 * nk * nos), 0.12, 0.05, 0.04);
      }
      // --- lips: the vermilion with its fine vertical lines, and the line between them
      const my = mouthY(Math.min(ax, 24)), mouth = ax < 30 && yy > 25 && yy < 62 && z > 80;
      const lipK = mouth ? sm(lipBorder(ax, 1, F) + 0.5, lipBorder(ax, 1, F) - 0.5, yy) * sm(lipBorder(ax, -1, F) - 0.5, lipBorder(ax, -1, F) + 0.5, yy) * sm(84, 90, z) : 0;
      if (lipK > 0.01) {
        // dusky rose, the lower lip a little lighter and wetter
        const lo = yy < my ? 1 : 0;
        mix(0.62 * (L.lipTint ?? 1) * lipK, 0.6 + 0.04 * lo, 0.34 + 0.03 * lo, 0.32 + 0.02 * lo);
        hh += lipK * 0.25 * Math.sin(x * 9 + Math.sin(yy * 2) * 0.6); rr -= lipK * (0.16 + 0.1 * lo) * (L.lipGloss ?? 1);
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
      const b = yy < 125 && z > -40 ? L.beard * beardAt(ax, yy, z, F, 1.5 + 2.5 * (L.stubble ?? 0)) : 0;
      if (b > 0.005) {
        // (cropped short, the strokes are short too: long ones read as a full beard's strands)
        const st0 = L.stubble ?? 0, sy = lerp(0.12, 0.7, st0);
        const s1 = tnoise(tx * 0.9, ty * sy, w * 0.9, 8), s2 = tnoise(tx * 0.45, ty * sy * 0.6, w * 0.45, 9), s3 = tnoise(tx * 1.7, ty * 1.7, w * 1.7, 10);
        const dense = sm(0.15, 0.6, b);
        const st = L.stubble ?? 0, s4 = tnoise(tx * 2.6, ty * 2.6, w * 2.6, 13);
        // (thickest on the chin and the moustache)
        const thick = Math.max(sm(22, 10, ax) * sm(40, 20, yy), sm(24, 12, ax) * sm(mouthY(0) + 2, mouthY(0) + 6, yy) * sm(nb, nb - 4, yy));
        const cover = (dense * (0.78 + 0.22 * sm(0.3, 0.7, s1)) + (1 - dense) * sm(0.55, 0.8, s3) * b * 2) * (1 - st * (0.62 - 0.45 * sm(0.45, 0.72, s4)) * (1 - 0.2 * thick)) * (1 - st * 0.35 * sm(24, 40, ax) * sm(45, 65, yy)) * (1 - st * 0.4 * sm(18, 30, ax) * sm(26, 44, yy) * sm(70, 58, yy));
        const strand = sm(0.55, 0.8, s2);
        const sk = 0.55 * (1 - 0.6 * st0), dk = 1 - 0.3 * st0;
        let hr = lerp(BH[0], L.streak[0], strand * sk) * dk, hg = lerp(BH[1], L.streak[1], strand * sk) * dk, hb = lerp(BH[2], L.streak[2], strand * sk) * dk;
        if (L.grey > 0 && tnoise(tx * 0.5, ty * 0.05, w * 0.5, 11) > 1 - L.grey) { hr = 0.42; hg = 0.4; hb = 0.38; }
        mix(clamp(cover, 0, 0.97), hr, hg, hb);
        hh += b * (s1 * 0.9 + s3 * 0.3); rr = lerp(rr, 0.8, clamp(cover, 0, 1));
      }
      // --- the scalp under the hair
      const sc = yy > 70 ? scalp(ax, yy, z, L.hairDrop, L.templeDrop) : 0;
      if (sc > 0) {
        const s1 = tnoise(tx * 0.9, ty * 0.15, w * 0.9, 12);
        mix(sc * 0.97, lerp(HAIR[0], L.streak[0], s1 * 0.4), lerp(HAIR[1], L.streak[1], s1 * 0.4), lerp(HAIR[2], L.streak[2], s1 * 0.4));
        hh += sc * s1 * 0.6; rr = lerp(rr, 0.75, sc);
      }
      if (aoAt) {
        // (light that does reach a crease has gone through skin: it comes out redder; and the neck is in the jaw's shadow)
        // (the jaw's shadow on the neck is a warm brown, not red)
        const ns = neckShade(ax, yy), k = 1 - L.ao! * (1 - aoAt(tx, ty)), kn = 1 - ns;
        c[0] *= k ** 0.75 * kn ** 0.8; c[1] *= k * kn ** 0.95; c[2] *= k ** 1.15 * kn ** 1.2;
        // (and no shine where it's shaded)
        rr = lerp(rr, 0.92, ns / 0.82);
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
