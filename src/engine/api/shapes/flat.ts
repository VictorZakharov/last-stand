// Outlines filled flat (three's `ShapeGeometry`) in xy facing +z, and a box with rounded edges (the addon's
// `RoundedBoxGeometry`). Each follows three 0.187's (three.js, MIT) to the vertex.
import { Vec3 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import { unindexed } from '../geometry/index.ts';
import { meshOf } from './build.ts';
import { box } from './flatFaces.ts';
import type { Outline } from './path.ts';
import { isClockWise, triangulate } from './triangulate.ts';

/**
 * `shapes` filled flat, their uvs their xy (three's `ShapeGeometry`); a list of them a group each (its place in
 * the list), one alone no group.
 */
export function flat(shapes: Outline | readonly Outline[], curveSegments = 12): Geometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const groups: number[] = [];
  const addOutline = (outline: Outline): void => {
    const offset = positions.length / 3;
    const extracted = outline.extractPoints(curveSegments);
    let points = extracted.shape;
    const holes = extracted.holes;
    if (!isClockWise(points)) points = points.reverse();
    holes.forEach((hole, i) => {
      if (isClockWise(hole)) holes[i] = hole.reverse();
    });
    const faces = triangulate(points, holes);
    for (const point of points.concat(...holes)) {
      positions.push(point.x, point.y, 0);
      normals.push(0, 0, 1);
      uvs.push(point.x, point.y);
    }
    for (const face of faces) indices.push(face[0] + offset, face[1] + offset, face[2] + offset);
  };
  if (!Array.isArray(shapes)) {
    addOutline(shapes as Outline);
    return meshOf(indices, positions, normals, uvs);
  }
  for (const outline of shapes) {
    const start = indices.length;
    addOutline(outline);
    groups.push(start, indices.length - start);
  }
  const geometry = meshOf(indices, positions, normals, uvs);
  for (let i = 0; i < groups.length; i += 2) geometry.addGroup(groups[i], groups[i + 1], i / 2);
  return geometry;
}

const AXES = { x: 0, y: 1, z: 2 } as const;
type AxisName = keyof typeof AXES;

/** A rounded box's uv along one way: its share of the way round the arc, then the flat middle, then the arc. */
function roundedUv(faceWay: Vec3, normal: Vec3, uvAxis: AxisName, projectionAxis: AxisName, radius: number,
  sideLength: number): number {
  const totalArc = (2 * Math.PI * radius) / 4;
  const middle = Math.max(sideLength - 2 * radius, 0);
  const flatNormal = normal.clone();
  flatNormal.setComponent(AXES[projectionAxis], 0);
  flatNormal.normalize();
  const arcUvShare = (0.5 * totalArc) / (totalArc + middle);
  const arcAngleShare = 1.0 - flatNormal.angleTo(faceWay) / (Math.PI / 4);
  if (Math.sign(flatNormal.getComponent(AXES[uvAxis])) === 1) return arcAngleShare * arcUvShare;
  const middleUv = middle / (totalArc + middle);
  return middleUv + arcUvShare + arcUvShare * (1.0 - arcAngleShare);
}

/** Each face's way out and the axes its two uvs are read along (u, then v), with whether each is flipped. */
const FACES: [Vec3, [AxisName, AxisName, number, boolean], [AxisName, AxisName, number, boolean]][] = [
  [new Vec3(1, 0, 0), ['z', 'y', 2, false], ['y', 'z', 1, true]],
  [new Vec3(-1, 0, 0), ['z', 'y', 2, true], ['y', 'z', 1, true]],
  [new Vec3(0, 1, 0), ['x', 'z', 0, true], ['z', 'x', 2, false]],
  [new Vec3(0, -1, 0), ['x', 'z', 0, true], ['z', 'x', 2, true]],
  [new Vec3(0, 0, 1), ['x', 'y', 0, true], ['y', 'x', 1, true]],
  [new Vec3(0, 0, -1), ['x', 'y', 0, false], ['y', 'x', 1, true]],
];

/**
 * A box with its edges rounded by `radius` (the addon's `RoundedBoxGeometry`): a box of `segments * 2 + 1` a side,
 * unindexed, each point pushed round its corner's sphere; its groups the box's. Follows three 0.187's (three.js, MIT).
 */
export function roundedBox(width = 1, height = 1, depth = 1, segments = 2, radius = 0.1): Geometry {
  const total = segments * 2 + 1;
  const round = Math.min(width / 2, height / 2, depth / 2, radius);
  const geometry = box(1, 1, 1, total, total, total);
  if (total === 1) return geometry;
  const laid = unindexed(geometry);
  const sizes = [width, height, depth];
  const inner = new Vec3(width / 2 - round, height / 2 - round, depth / 2 - round);
  const positions = laid.attributes.position.array;
  const normals = laid.attributes.normal.array;
  const uvs = laid.attributes.uv.array;
  const faceTris = positions.length / 6;
  const half = 0.5 / total;
  const position = new Vec3();
  const normal = new Vec3();
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 2) {
    position.fromArray(positions, i);
    normal.copy(position);
    normal.x -= Math.sign(normal.x) * half;
    normal.y -= Math.sign(normal.y) * half;
    normal.z -= Math.sign(normal.z) * half;
    normal.normalize();
    positions[i] = inner.x * Math.sign(position.x) + normal.x * round;
    positions[i + 1] = inner.y * Math.sign(position.y) + normal.y * round;
    positions[i + 2] = inner.z * Math.sign(position.z) + normal.z * round;
    normals[i] = normal.x;
    normals[i + 1] = normal.y;
    normals[i + 2] = normal.z;
    const [way, u, v] = FACES[Math.floor(i / faceTris)];
    const uValue = roundedUv(way, normal, u[0], u[1], round, sizes[u[2]]);
    const vValue = roundedUv(way, normal, v[0], v[1], round, sizes[v[2]]);
    uvs[j] = u[3] ? 1.0 - uValue : uValue;
    uvs[j + 1] = v[3] ? 1.0 - vValue : vValue;
  }
  return laid;
}
