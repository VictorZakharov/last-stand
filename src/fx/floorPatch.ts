// A mark on the floor that lies on it everywhere: a ring or a disc laid flat on each level of the floor it covers, cut
// along the dais's edges, and running down the face of each step it crosses as a mark projected from above would.
// Laid in one plane at its middle's height, it went under the dais where it crossed the step and stood in the air off
// it; laid by the ground's height at each of its points, a triangle across a step sloped from one level to the other,
// and the parts of it under the dais's top left jagged notches along its edge.
import * as THREE from 'three';
import { GROUND_EDGES, GROUND_LEVELS } from '../world/ground';

/** each patch's triangles as made, flat round its middle: the x and z of their corners */
const FLAT = new WeakMap<THREE.BufferGeometry, Float32Array>();

/** A ring `inner`..`outer` from its middle (a disc for `inner` 0), `rings` x `segs` points, flat on y = 0 until laid. */
export function floorPatch(inner: number, outer: number, rings: number, segs: number): THREE.BufferGeometry {
  const at = (r: number, k: number) => { const a = k / segs * Math.PI * 2, d = inner + (outer - inner) * r / rings; return [Math.cos(a) * d, Math.sin(a) * d]; };
  const flat: number[] = [];
  for (let r = 0; r < rings; r++) for (let k = 0; k < segs; k++) {
    const a = at(r, k), b = at(r + 1, k), c = at(r, k + 1), d = at(r + 1, k + 1);
    if (inner > 0 || r > 0) flat.push(...a, ...b, ...c);
    flat.push(...c, ...b, ...d);
  }
  const g = new THREE.BufferGeometry(), corners = flat.length / 2;
  // (room for the pieces a cut adds and the steps' faces; grown if a placement needs more)
  const pos = new Float32Array(corners * 3 * 2);
  for (let i = 0; i < corners; i++) { pos[i * 3] = flat[i * 2]; pos[i * 3 + 2] = flat[i * 2 + 1]; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, corners);
  FLAT.set(g, new Float32Array(flat));
  return g;
}

/** Whether `g` is a mark on the floor (`floorPatch`): the lab finds the marks laid by it. */
export const isFloorPatch = (g: THREE.BufferGeometry): boolean => FLAT.has(g);

/** The floor's level at (x, z) with every edge `out` m further out: a mark laid `out` over the floor reaches that far
 *  past an edge, so its face down the step stands clear of the step's own. */
function levelAt(x: number, z: number, out: number): number {
  const m = Math.max(Math.abs(x), Math.abs(z));
  for (let i = 0; i < GROUND_EDGES.length; i++) if (m < GROUND_EDGES[i] + out) return GROUND_LEVELS[i];
  return GROUND_LEVELS[GROUND_LEVELS.length - 1];
}

/** `poly` (x, z pairs, convex) cut by the line where its x (`axis` 0) or z (1) is `v`: its pieces either side, in `out`. */
function cut(poly: number[], axis: 0 | 1, v: number, out: number[][]): void {
  const below: number[] = [], above: number[] = [], n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[j * 2], bz = poly[j * 2 + 1];
    const as = (axis ? az : ax) - v, bs = (axis ? bz : bx) - v;
    if (as <= 0) below.push(ax, az);
    if (as >= 0) above.push(ax, az);
    if (as * bs < 0) {
      // (the corner put on the line exactly, so the piece's edge along it is found again)
      const t = as / (as - bs);
      const px = axis ? ax + (bx - ax) * t : v, pz = axis ? v : az + (bz - az) * t;
      below.push(px, pz); above.push(px, pz);
    }
  }
  if (below.length >= 6) out.push(below);
  if (above.length >= 6) out.push(above);
}

const _out: number[] = [];

/** `poly` (in the floor's x, z) laid flat on its level `lift` above it, with the face down to the level below along
 *  each of its edges on a step's edge, into `_out` in the patch's own space (at (x, 0, z), `scale` across). */
function emit(poly: number[], cuts: number[], x: number, z: number, lift: number, scale: number): void {
  const n = poly.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += poly[i * 2] / n; cz += poly[i * 2 + 1] / n; }
  const y = levelAt(cx, cz, lift) + lift;
  const put = (px: number, py: number, pz: number) => _out.push((px - x) / scale, py, (pz - z) / scale);
  for (let i = 1; i < n - 1; i++) {
    put(poly[0], y, poly[1]); put(poly[i * 2], y, poly[i * 2 + 1]); put(poly[i * 2 + 2], y, poly[i * 2 + 3]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = poly[i * 2], az = poly[i * 2 + 1], bx = poly[j * 2], bz = poly[j * 2 + 1];
    const onX = ax === bx && cuts.includes(Math.abs(ax)), onZ = az === bz && cuts.includes(Math.abs(az));
    if (!onX && !onZ) continue;
    // the level just across the edge from this piece: a step's face where it's higher
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const top = levelAt(onX ? mx + Math.sign(mx - cx) * 1e-3 : mx, onZ ? mz + Math.sign(mz - cz) * 1e-3 : mz, lift) + lift;
    if (top <= y) continue;
    put(ax, y, az); put(bx, y, bz); put(bx, top, bz);
    put(ax, y, az); put(bx, top, bz); put(ax, top, az);
  }
}

/** A patch's points onto the ground under them: its mesh at (x, 0, z), unturned, scaled `scale` across (not up), `lift`
 *  above the ground, each piece on one level and down the face of each step it crosses. */
export function lay(g: THREE.BufferGeometry, x: number, z: number, lift: number, scale = 1): void {
  const flat = FLAT.get(g)!, cuts = GROUND_EDGES.map((e) => e + lift);
  _out.length = 0;
  const pieces: number[][] = [], next: number[][] = [];
  for (let t = 0; t < flat.length; t += 6) {
    const poly = [0, 1, 2].flatMap((k) => [x + flat[t + k * 2] * scale, z + flat[t + k * 2 + 1] * scale]);
    pieces.length = 0; pieces.push(poly);
    for (const axis of [0, 1] as const) for (const c of cuts) for (const v of [c, -c]) {
      const lo = Math.min(poly[axis], poly[2 + axis], poly[4 + axis]), hi = Math.max(poly[axis], poly[2 + axis], poly[4 + axis]);
      if (lo >= v || hi <= v) continue;
      next.length = 0;
      for (const piece of pieces) cut(piece, axis, v, next);
      pieces.length = 0; pieces.push(...next);
    }
    for (const piece of pieces) emit(piece, cuts, x, z, lift, scale);
  }
  let p = g.attributes.position as THREE.BufferAttribute;
  if (p.array.length < _out.length) { p = new THREE.BufferAttribute(new Float32Array(Math.ceil(_out.length / 2) * 3), 3); g.setAttribute('position', p); }
  (p.array as Float32Array).set(_out);
  p.clearUpdateRanges(); p.addUpdateRange(0, _out.length);
  p.needsUpdate = true;
  g.setDrawRange(0, _out.length / 3);
}
