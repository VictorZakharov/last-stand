// The generators turned round the y axis: a cylinder (and a cone, one with no top), and a lathe's profile swept
// round. Each follows three 0.187's of the same name (three.js, MIT) to the vertex.
import { Maths, Vec3 } from '../math/index.ts';
import type { Vec2 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import { described, geometryOf, meshOf } from './build.ts';

/** A generator's numbers as it pushes them, and the groups it marks. */
interface Pushed {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groups: [start: number, count: number, materialIndex: number][];
}

/** A cylinder's shape, its segments floored. */
interface CylinderPlan {
  radiusTop: number;
  radiusBottom: number;
  height: number;
  radial: number;
  rows: number;
  thetaStart: number;
  thetaLength: number;
}

/** The cylinder's side: rows from the top, its triangles left out where a radius is 0. */
function cylinderSide(plan: CylinderPlan, out: Pushed): void {
  const { radiusTop, radiusBottom, height, radial, rows } = plan;
  const slope = (radiusBottom - radiusTop) / height;
  const normal = new Vec3();
  const grid: number[][] = [];
  let index = 0;
  for (let y = 0; y <= rows; y++) {
    const row: number[] = [];
    const v = y / rows;
    const radius = v * (radiusBottom - radiusTop) + radiusTop;
    for (let x = 0; x <= radial; x++) {
      const u = x / radial;
      const theta = u * plan.thetaLength + plan.thetaStart;
      const sin = Math.sin(theta);
      const cos = Math.cos(theta);
      out.positions.push(radius * sin, -v * height + height / 2, radius * cos);
      normal.set(sin, slope, cos).normalize();
      out.normals.push(normal.x, normal.y, normal.z);
      out.uvs.push(u, 1 - v);
      row.push(index++);
    }
    grid.push(row);
  }
  const start = out.indices.length;
  for (let x = 0; x < radial; x++) {
    for (let y = 0; y < rows; y++) {
      const cornerA = grid[y][x];
      const cornerB = grid[y + 1][x];
      const cornerC = grid[y + 1][x + 1];
      const cornerD = grid[y][x + 1];
      if (radiusTop > 0 || y !== 0) out.indices.push(cornerA, cornerB, cornerD);
      if (radiusBottom > 0 || y !== rows - 1) out.indices.push(cornerB, cornerC, cornerD);
    }
  }
  out.groups.push([start, out.indices.length - start, 0]);
}

/** A cylinder's top or bottom: a fan from a centre point a segment (as three's) round its rim. */
function cylinderCap(plan: CylinderPlan, top: boolean, out: Pushed): void {
  const radius = top ? plan.radiusTop : plan.radiusBottom;
  const sign = top ? 1 : -1;
  const y = (plan.height / 2) * sign;
  const centreStart = out.positions.length / 3;
  for (let x = 1; x <= plan.radial; x++) {
    out.positions.push(0, y, 0);
    out.normals.push(0, sign, 0);
    out.uvs.push(0.5, 0.5);
  }
  const rimStart = out.positions.length / 3;
  for (let x = 0; x <= plan.radial; x++) {
    const theta = (x / plan.radial) * plan.thetaLength + plan.thetaStart;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    out.positions.push(radius * sin, y, radius * cos);
    out.normals.push(0, sign, 0);
    out.uvs.push(cos * 0.5 + 0.5, sin * 0.5 * sign + 0.5);
  }
  const start = out.indices.length;
  for (let x = 0; x < plan.radial; x++) {
    const cornerC = centreStart + x;
    const i = rimStart + x;
    if (top) out.indices.push(i, i + 1, cornerC);
    else out.indices.push(i + 1, i, cornerC);
  }
  out.groups.push([start, out.indices.length - start, top ? 1 : 2]);
}

/** A cylinder (three's `CylinderGeometry`): its side group 0, its top 1, its bottom 2. */
export function cylinder(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32, heightSegments = 1,
  openEnded = false, thetaStart = 0, thetaLength = Math.PI * 2): Geometry {
  const plan: CylinderPlan = { radiusTop, radiusBottom, height, radial: Math.floor(radialSegments),
    rows: Math.floor(heightSegments), thetaStart, thetaLength };
  const out: Pushed = { positions: [], normals: [], uvs: [], indices: [], groups: [] };
  cylinderSide(plan, out);
  if (!openEnded && radiusTop > 0) cylinderCap(plan, true, out);
  if (!openEnded && radiusBottom > 0) cylinderCap(plan, false, out);
  const geometry = meshOf(out.indices, out.positions, out.normals, out.uvs);
  for (const [start, count, materialIndex] of out.groups) geometry.addGroup(start, count, materialIndex);
  return geometry;
}

/** A cone (three's `ConeGeometry`): a cylinder with no top. */
export function cone(radius = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false,
  thetaStart = 0, thetaLength = Math.PI * 2): Geometry {
  return cylinder(0, radius, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength);
}

/** The lathe's profile normals: each point's the mean of its two edges' (its one edge's at the ends). */
function profileNormals(points: readonly Vec2[]): number[] {
  const out: number[] = [];
  const normal = new Vec3();
  const current = new Vec3();
  const previous = new Vec3();
  const last = points.length - 1;
  for (let j = 0; j <= last; j++) {
    if (j === last) {
      previous.normalize();
      out.push(previous.x, previous.y, previous.z);
      continue;
    }
    const dx = points[j + 1].x - points[j].x;
    const dy = points[j + 1].y - points[j].y;
    normal.set(dy * 1.0, -dx, dy * 0.0);
    if (j === 0) {
      previous.copy(normal);
    } else {
      current.copy(normal);
      normal.add(previous);
      previous.copy(current);
    }
    normal.normalize();
    out.push(normal.x, normal.y, normal.z);
  }
  return out;
}

/** A lathe (three's `LatheGeometry`): the profile `points` (x out, y up) swept round y by `phiLength`. */
export function lathe(points: readonly Vec2[], segments = 12, phiStart = 0, phiLength = Math.PI * 2): Geometry {
  const steps = Math.floor(segments);
  const sweep = Maths.clamp(phiLength, 0, Math.PI * 2);
  const inverse = 1.0 / steps;
  const initial = profileNormals(points);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const phi = phiStart + i * inverse * sweep;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let j = 0; j < points.length; j++) {
      positions.push(points[j].x * sin, points[j].y, points[j].x * cos);
      uvs.push(i / steps, j / (points.length - 1));
      normals.push(initial[3 * j] * sin, initial[3 * j + 1], initial[3 * j] * cos);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < points.length - 1; j++) {
      const cornerA = j + i * points.length;
      const cornerB = cornerA + points.length;
      indices.push(cornerA, cornerB, cornerA + 1);
      indices.push(cornerB + 1, cornerA + 1, cornerB);
    }
  }
  const parameters = { points, segments, phiStart, phiLength };
  return described(geometryOfLathe(indices, positions, uvs, normals), 'LatheGeometry', parameters);
}

/** The lathe's geometry, its attributes in three's order (position, uv, normal). */
function geometryOfLathe(index: number[], positions: number[], uvs: number[], normals: number[]): Geometry {
  return geometryOf({ index, attributes: [['position', positions, 3], ['uv', uvs, 2], ['normal', normals, 3]] });
}
