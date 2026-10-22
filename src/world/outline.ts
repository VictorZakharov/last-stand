// The floor's outlines of the wall's rounded parts (world/wall.ts): the Thornwood's rocks and bushes, each hull cut
// through at a body's heights, a convex polygon a body is kept off. Read as a line out from the middle instead, each
// rock or bush poking in from the thicket hid the floor beside and behind it (the ray from the middle met its front),
// and the hero walking along the thicket met a square face there, in the open: stopped 19 to 23 times a lap round it.
import * as THREE from 'three';

/** A convex outline on the floor: its corners (x, z each) anticlockwise seen from above (from +x toward +z), and its
 *  sides' normals out of it. */
export interface Outline {
  points: Float32Array;
  normals: Float32Array;
}

/**
 * `hull` (a convex geometry's triangles, unindexed) placed by `matrix`, cut through at `heights` (m) and between: its
 * corners in the band of heights and its edges' crossings of each, their convex hull on the floor; null if it doesn't
 * reach into the band (a body walks under it).
 */
export function outlineOf(hull: THREE.BufferGeometry, matrix: THREE.Matrix4, heights: number[]): Outline | null {
  const position = hull.attributes.position;
  const world = placed(position.array as Float32Array, matrix);
  const low = Math.min(...heights), high = Math.max(...heights);
  const cut: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const y = world[i * 3 + 1];
    if (y >= low && y <= high) cut.push(world[i * 3], world[i * 3 + 2]);
  }
  for (let i = 0; i < position.count; i += 3) {
    for (let k = 0; k < 3; k++) crossings(world, i + k, i + (k + 1) % 3, heights, cut);
  }
  return cut.length >= 6 ? sided(convexHull(cut)) : null;
}

/** `corners` (x, y, z each) placed by `matrix`. (A vector a corner, the forest's 1554 outlines took 104 ms.) */
function placed(corners: Float32Array, matrix: THREE.Matrix4): Float32Array {
  const e = matrix.elements;
  const world = new Float32Array(corners.length);
  for (let i = 0; i < corners.length; i += 3) {
    const x = corners[i], y = corners[i + 1], z = corners[i + 2];
    world[i] = e[0] * x + e[4] * y + e[8] * z + e[12];
    world[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    world[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  return world;
}

/** Where the edge from corner `a` to corner `b` of `world` crosses each of `heights`, onto `cut` (x, z). */
function crossings(world: Float32Array, a: number, b: number, heights: number[], cut: number[]): void {
  const ya = world[a * 3 + 1], yb = world[b * 3 + 1];
  for (const h of heights) {
    if ((ya - h) * (yb - h) >= 0) continue;
    const t = (h - ya) / (yb - ya);
    cut.push(world[a * 3] + (world[b * 3] - world[a * 3]) * t, world[a * 3 + 2] + (world[b * 3 + 2] - world[a * 3 + 2]) * t);
  }
}

/** The convex hull of points (x, z each), anticlockwise from +x toward +z (Andrew's monotone chain). */
function convexHull(flat: number[]): number[] {
  const points: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
  points.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const turn = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list: [number, number][]) => {
    const kept: [number, number][] = [];
    for (const p of list) {
      while (kept.length >= 2 && turn(kept[kept.length - 2], kept[kept.length - 1], p) <= 0) kept.pop();
      kept.push(p);
    }
    kept.pop();
    return kept;
  };
  return [...chain(points), ...chain([...points].reverse())].flat();
}

/** Corners (x, z each, anticlockwise) with their sides' normals out of them. */
function sided(corners: number[]): Outline | null {
  const n = corners.length / 2;
  if (n < 3) return null;
  const normals = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = corners[j * 2] - corners[i * 2], dz = corners[j * 2 + 1] - corners[i * 2 + 1];
    const length = Math.hypot(dx, dz) || 1e-9;
    // (anticlockwise from +x toward +z, the outside is to the right of each side)
    normals[i * 2] = dz / length;
    normals[i * 2 + 1] = -dx / length;
  }
  return { points: new Float32Array(corners), normals };
}

/** A body of `radius` at `pos` pushed off `outline`: out of it the shortest way if its middle is in it, else away
 *  from its nearest point. */
export function pushOff(outline: Outline, pos: { x: number; z: number }, radius: number): void {
  const { points, normals } = outline;
  const n = points.length / 2;
  let most = -Infinity, side = 0;
  for (let i = 0; i < n; i++) {
    const off = (pos.x - points[i * 2]) * normals[i * 2] + (pos.z - points[i * 2 + 1]) * normals[i * 2 + 1];
    if (off > most) {
      most = off;
      side = i;
    }
  }
  if (most >= radius) return;
  if (most <= 0) {
    pos.x += normals[side * 2] * (radius - most);
    pos.z += normals[side * 2 + 1] * (radius - most);
    return;
  }
  let best = Infinity, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = points[i * 2], az = points[i * 2 + 1], dx = points[j * 2] - ax, dz = points[j * 2 + 1] - az;
    const along = Math.min(1, Math.max(0, ((pos.x - ax) * dx + (pos.z - az) * dz) / (dx * dx + dz * dz || 1e-9)));
    const px = ax + dx * along, pz = az + dz * along, off = Math.hypot(pos.x - px, pos.z - pz);
    if (off >= best) continue;
    best = off;
    cx = px;
    cz = pz;
  }
  if (best >= radius || best < 1e-9) return;
  pos.x = cx + ((pos.x - cx) / best) * radius;
  pos.z = cz + ((pos.z - cz) / best) * radius;
}

/** How far along the floor's ray from (x, z) along (ux, uz) it enters `outline` (m; 0 from inside), or Infinity. */
export function entersOutline(outline: Outline, x: number, z: number, ux: number, uz: number): number {
  const { points, normals } = outline;
  let enters = 0, leaves = Infinity;
  for (let i = 0; i < points.length / 2; i++) {
    const nx = normals[i * 2], nz = normals[i * 2 + 1];
    const off = (x - points[i * 2]) * nx + (z - points[i * 2 + 1]) * nz;
    const toward = ux * nx + uz * nz;
    if (Math.abs(toward) < 1e-12) {
      if (off > 0) return Infinity;
      continue;
    }
    const t = -off / toward;
    if (toward < 0) enters = Math.max(enters, t);
    else leaves = Math.min(leaves, t);
    if (enters > leaves) return Infinity;
  }
  return enters;
}
