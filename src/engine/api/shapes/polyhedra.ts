// The polyhedra: a polyhedron's faces each cut into `detail + 1` rows of triangles and pushed out onto a sphere
// (three's `PolyhedronGeometry`), unindexed; flat normals at detail 0, smooth above. The icosahedron, octahedron and
// dodecahedron are it with their corners. Follows three 0.187's (three.js, MIT) to the vertex, its uvs' seam too.
import { Vec3 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import { geometryOf } from './build.ts';

/** The points of one face cut into `detail + 1` rows, pushed in three's order. */
function subdivideFace(a: Vec3, b: Vec3, c: Vec3, detail: number, out: number[]): void {
  const cols = detail + 1;
  const v: Vec3[][] = [];
  for (let i = 0; i <= cols; i++) {
    const aj = a.clone().lerp(c, i / cols);
    const bj = b.clone().lerp(c, i / cols);
    const rows = cols - i;
    const row: Vec3[] = [];
    for (let j = 0; j <= rows; j++) row.push(j === 0 && i === cols ? aj : aj.clone().lerp(bj, j / rows));
    v.push(row);
  }
  const push = (p: Vec3): void => {
    out.push(p.x, p.y, p.z);
  };
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < 2 * (cols - i) - 1; j++) {
      const k = Math.floor(j / 2);
      if (j % 2 === 0) {
        push(v[i][k + 1]);
        push(v[i + 1][k]);
        push(v[i][k]);
      } else {
        push(v[i][k + 1]);
        push(v[i + 1][k + 1]);
        push(v[i + 1][k]);
      }
    }
  }
}

/** The angle round y of `p`, as three's polyhedron reads it. */
function azimuth(p: Vec3): number {
  return Math.atan2(p.z, -p.x);
}

/** The angle up of `p`. */
function inclination(p: Vec3): number {
  return Math.atan2(-p.y, Math.sqrt(p.x * p.x + p.z * p.z));
}

/** The uvs of the points `positions`: round by azimuth, up by inclination, mended at the poles and the seam. */
function polyhedronUvs(positions: readonly number[]): number[] {
  const uvs: number[] = [];
  const vertex = new Vec3();
  for (let i = 0; i < positions.length; i += 3) {
    vertex.set(positions[i], positions[i + 1], positions[i + 2]);
    uvs.push(azimuth(vertex) / 2 / Math.PI + 0.5, 1 - (inclination(vertex) / Math.PI + 0.5));
  }
  mendUvs(positions, uvs);
  mendSeam(uvs);
  return uvs;
}

/** Each triangle's u mended where it wraps (u 1 on the far side) and at a pole (its centroid's azimuth). */
function mendUvs(positions: readonly number[], uvs: number[]): void {
  const corners = [new Vec3(), new Vec3(), new Vec3()];
  const centroid = new Vec3();
  for (let i = 0, j = 0; i < positions.length; i += 9, j += 6) {
    corners.forEach((corner, k) => corner.fromArray(positions, i + 3 * k));
    const before = [uvs[j], uvs[j + 2], uvs[j + 4]];
    centroid.copy(corners[0]).add(corners[1]).add(corners[2]).divideScalar(3);
    const azi = azimuth(centroid);
    corners.forEach((corner, k) => {
      const stride = j + 2 * k;
      if (azi < 0 && before[k] === 1) uvs[stride] = before[k] - 1;
      if (corner.x === 0 && corner.z === 0) uvs[stride] = azi / 2 / Math.PI + 0.5;
    });
  }
}

/** A triangle across the seam (u near 1 and near 0) has its low u's moved past 1. */
function mendSeam(uvs: number[]): void {
  for (let i = 0; i < uvs.length; i += 6) {
    const x0 = uvs[i];
    const x1 = uvs[i + 2];
    const x2 = uvs[i + 4];
    if (Math.max(x0, x1, x2) <= 0.9 || Math.min(x0, x1, x2) >= 0.1) continue;
    if (x0 < 0.2) uvs[i] += 1;
    if (x1 < 0.2) uvs[i + 2] += 1;
    if (x2 < 0.2) uvs[i + 4] += 1;
  }
}

/**
 * A polyhedron (three's `PolyhedronGeometry`) of the corners `vertices` and faces `indices`, each face cut into
 * `detail + 1` rows, every point pushed out to `radius`; unindexed.
 */
export function polyhedron(vertices: readonly number[], indices: readonly number[], radius = 1,
  detail = 0): Geometry {
  const positions: number[] = [];
  const corner = (i: number): Vec3 => new Vec3(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
  for (let i = 0; i < indices.length; i += 3) {
    subdivideFace(corner(indices[i]), corner(indices[i + 1]), corner(indices[i + 2]), detail, positions);
  }
  const vertex = new Vec3();
  for (let i = 0; i < positions.length; i += 3) {
    vertex.set(positions[i], positions[i + 1], positions[i + 2]).normalize().multiplyScalar(radius);
    positions[i] = vertex.x;
    positions[i + 1] = vertex.y;
    positions[i + 2] = vertex.z;
  }
  const uvs = polyhedronUvs(positions);
  const geometry = geometryOf({
    index: null,
    attributes: [['position', positions, 3], ['normal', positions.slice(), 3], ['uv', uvs, 2]],
  });
  if (detail === 0) geometry.computeVertexNormals();
  else geometry.normalizeNormals();
  return geometry;
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** An icosahedron (three's `IcosahedronGeometry`): twenty faces, more rows a face with `detail`. */
export function icosahedron(radius = 1, detail = 0): Geometry {
  const t = PHI;
  const vertices = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1,
    -t, 0, -1, -t, 0, 1];
  const indices = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  return polyhedron(vertices, indices, radius, detail);
}

/** An octahedron (three's `OctahedronGeometry`): eight faces. */
export function octahedron(radius = 1, detail = 0): Geometry {
  const vertices = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  const indices = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2];
  return polyhedron(vertices, indices, radius, detail);
}

/** A dodecahedron (three's `DodecahedronGeometry`): twelve faces, each of three triangles. */
export function dodecahedron(radius = 1, detail = 0): Geometry {
  const t = PHI;
  const r = 1 / t;
  const vertices = [-1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1,
    0, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, -r, -t, 0, -r, t, 0, r, -t, 0, r, t, 0,
    -t, 0, -r, t, 0, -r, -t, 0, r, t, 0, r];
  const indices = [3, 11, 7, 3, 7, 15, 3, 15, 13, 7, 19, 17, 7, 17, 6, 7, 6, 15, 17, 4, 8, 17, 8, 10, 17, 10, 6,
    8, 0, 16, 8, 16, 2, 8, 2, 10, 0, 12, 1, 0, 1, 18, 0, 18, 16, 6, 10, 2, 6, 2, 13, 6, 13, 15,
    2, 16, 18, 2, 18, 3, 2, 3, 13, 18, 1, 9, 18, 9, 11, 18, 11, 3, 4, 14, 12, 4, 12, 0, 4, 0, 8,
    11, 9, 5, 11, 5, 19, 11, 19, 7, 19, 5, 14, 19, 14, 4, 19, 4, 17, 1, 12, 14, 1, 14, 5, 1, 5, 9];
  return polyhedron(vertices, indices, radius, detail);
}
