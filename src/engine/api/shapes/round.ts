// The round generators: a sphere, a capsule, a torus and a torus knot. Each follows three 0.187's generator of
// the same name (three.js, MIT) to the vertex: the same rows, in the same order, with the same normals and uvs.
import { Vec3 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import { meshOf } from './build.ts';

/**
 * A sphere (three's `SphereGeometry`): rows from the top (theta) of points round (phi), its poles' triangles
 * fanned; a part of one where the angles are less than whole.
 */
export function sphere(radius = 1, widthSegments = 32, heightSegments = 16, phiStart = 0, phiLength = Math.PI * 2,
  thetaStart = 0, thetaLength = Math.PI): Geometry {
  const across = Math.max(3, Math.floor(widthSegments));
  const down = Math.max(2, Math.floor(heightSegments));
  const thetaEnd = Math.min(thetaStart + thetaLength, Math.PI);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const grid: number[][] = [];
  const vertex = new Vec3();
  const normal = new Vec3();
  let index = 0;
  for (let iy = 0; iy <= down; iy++) {
    const row: number[] = [];
    const v = iy / down;
    const y = radius * Math.cos(thetaStart + v * thetaLength);
    const ringRadius = Math.sqrt(radius * radius - y * y);
    let uOffset = 0;
    if (iy === 0 && thetaStart === 0) uOffset = 0.5 / across;
    else if (iy === down && thetaEnd === Math.PI) uOffset = -0.5 / across;
    for (let ix = 0; ix <= across; ix++) {
      const u = ix / across;
      const phi = phiStart + u * phiLength;
      vertex.set(-ringRadius * Math.cos(phi), y, ringRadius * Math.sin(phi));
      positions.push(vertex.x, vertex.y, vertex.z);
      normal.copy(vertex).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u + uOffset, 1 - v);
      row.push(index++);
    }
    grid.push(row);
  }
  const indices: number[] = [];
  for (let iy = 0; iy < down; iy++) {
    for (let ix = 0; ix < across; ix++) {
      const a = grid[iy][ix + 1];
      const b = grid[iy][ix];
      const c = grid[iy + 1][ix];
      const d = grid[iy + 1][ix + 1];
      if (iy !== 0 || thetaStart > 0) indices.push(a, b, d);
      if (iy !== down - 1 || thetaEnd < Math.PI) indices.push(b, c, d);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}

/** A row of the capsule's profile: its height, its radius, its normal's height and how far along its arc it is. */
interface CapsuleRow {
  y: number;
  radius: number;
  normalY: number;
  arc: number;
}

/** The capsule's profile at row `iy`: up the bottom cap, the side, then the top cap. */
function capsuleRow(iy: number, radius: number, height: number, capSegments: number, heightSegments: number): CapsuleRow {
  const half = height / 2;
  const capArc = (Math.PI / 2) * radius;
  if (iy <= capSegments) {
    const share = iy / capSegments;
    const angle = (share * Math.PI) / 2;
    return { y: -half - radius * Math.cos(angle), radius: radius * Math.sin(angle),
      normalY: -radius * Math.cos(angle), arc: share * capArc };
  }
  if (iy <= capSegments + heightSegments) {
    const share = (iy - capSegments) / heightSegments;
    return { y: -half + share * height, radius, normalY: 0, arc: capArc + share * height };
  }
  const share = (iy - capSegments - heightSegments) / capSegments;
  const angle = (share * Math.PI) / 2;
  return { y: half + radius * Math.sin(angle), radius: radius * Math.cos(angle),
    normalY: radius * Math.sin(angle), arc: capArc + height + share * capArc };
}

/** A capsule (three's `CapsuleGeometry`): a cylinder `height` long between two half spheres of `radius`. */
export function capsule(radius = 1, height = 1, capSegments = 4, radialSegments = 8, heightSegments = 1): Geometry {
  const length = Math.max(0, height);
  const caps = Math.max(1, Math.floor(capSegments));
  const round = Math.max(3, Math.floor(radialSegments));
  const along = Math.max(1, Math.floor(heightSegments));
  const total = 2 * ((Math.PI / 2) * radius) + length;
  const rows = caps * 2 + along;
  const perRow = round + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const normal = new Vec3();
  for (let iy = 0; iy <= rows; iy++) {
    const row = capsuleRow(iy, radius, length, caps, along);
    const v = Math.max(0, Math.min(1, row.arc / total));
    let uOffset = 0;
    if (iy === 0) uOffset = 0.5 / round;
    else if (iy === rows) uOffset = -0.5 / round;
    for (let ix = 0; ix <= round; ix++) {
      const u = ix / round;
      const theta = u * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      positions.push(-row.radius * cos, row.y, row.radius * sin);
      normal.set(-row.radius * cos, row.normalY, row.radius * sin).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(u + uOffset, v);
    }
    if (iy === 0) continue;
    const before = (iy - 1) * perRow;
    for (let ix = 0; ix < round; ix++) {
      const i1 = before + ix;
      const i3 = iy * perRow + ix;
      indices.push(i1, i1 + 1, i3);
      indices.push(i1 + 1, i3 + 1, i3);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}

/** A torus (three's `TorusGeometry`): a tube of radius `tube` round a ring of `radius` in the xy plane. */
export function torus(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48, arc = Math.PI * 2,
  thetaStart = 0, thetaLength = Math.PI * 2): Geometry {
  const rounds = Math.floor(radialSegments);
  const along = Math.floor(tubularSegments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const vertex = new Vec3();
  const center = new Vec3();
  const normal = new Vec3();
  for (let j = 0; j <= rounds; j++) {
    const v = thetaStart + (j / rounds) * thetaLength;
    for (let i = 0; i <= along; i++) {
      const u = (i / along) * arc;
      vertex.set((radius + tube * Math.cos(v)) * Math.cos(u), (radius + tube * Math.cos(v)) * Math.sin(u),
        tube * Math.sin(v));
      positions.push(vertex.x, vertex.y, vertex.z);
      center.set(radius * Math.cos(u), radius * Math.sin(u), 0);
      normal.subVectors(vertex, center).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(i / along, j / rounds);
    }
  }
  const indices: number[] = [];
  for (let j = 1; j <= rounds; j++) {
    for (let i = 1; i <= along; i++) {
      const a = (along + 1) * j + i - 1;
      const b = (along + 1) * (j - 1) + i - 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}

/** The torus knot's centre line at `u`, into `target`. */
function knotAt(u: number, p: number, q: number, radius: number, target: Vec3): void {
  const quOverP = (q / p) * u;
  const cs = Math.cos(quOverP);
  target.set(radius * (2 + cs) * 0.5 * Math.cos(u), radius * (2 + cs) * Math.sin(u) * 0.5,
    radius * Math.sin(quOverP) * 0.5);
}

/** A torus knot (three's `TorusKnotGeometry`): a tube round a (p, q) knot, `p` times round and `q` through. */
export function torusKnot(radius = 1, tube = 0.4, tubularSegments = 64, radialSegments = 8, p = 2, q = 3): Geometry {
  const along = Math.floor(tubularSegments);
  const rounds = Math.floor(radialSegments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const vertex = new Vec3();
  const normal = new Vec3();
  const p1 = new Vec3();
  const p2 = new Vec3();
  const t = new Vec3();
  const n = new Vec3();
  const b = new Vec3();
  for (let i = 0; i <= along; i++) {
    const u = (i / along) * p * Math.PI * 2;
    knotAt(u, p, q, radius, p1);
    knotAt(u + 0.01, p, q, radius, p2);
    t.subVectors(p2, p1);
    n.addVectors(p2, p1);
    b.crossVectors(t, n);
    n.crossVectors(b, t);
    b.normalize();
    n.normalize();
    for (let j = 0; j <= rounds; j++) {
      const v = (j / rounds) * Math.PI * 2;
      const cx = -tube * Math.cos(v);
      const cy = tube * Math.sin(v);
      vertex.set(p1.x + (cx * n.x + cy * b.x), p1.y + (cx * n.y + cy * b.y), p1.z + (cx * n.z + cy * b.z));
      positions.push(vertex.x, vertex.y, vertex.z);
      normal.subVectors(vertex, p1).normalize();
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(i / along, j / rounds);
    }
  }
  const indices: number[] = [];
  for (let j = 1; j <= along; j++) {
    for (let i = 1; i <= rounds; i++) {
      const a = (rounds + 1) * (j - 1) + (i - 1);
      const c = (rounds + 1) * j + (i - 1);
      indices.push(a, c, a + 1);
      indices.push(c, c + 1, a + 1);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}
