// The generators of flat faces: a box (six gridded faces), a plane, a circle and a ring. Each follows three
// 0.187's of the same name (three.js, MIT) to the vertex.
import type { Geometry } from '../geometry/index.ts';
import { described, meshOf } from './build.ts';

/** The axes a box face lays its grid along: u across, v up, w out of it. */
type Axis = 0 | 1 | 2;

/** A box being built: its numbers so far, and its groups. */
interface BoxParts {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groups: [start: number, count: number, materialIndex: number][];
  vertices: number;
}

/** One face of a box: a grid on the u and v axes, `depth / 2` out along w, as three's `buildPlane`. */
function boxFace(parts: BoxParts, axes: [Axis, Axis, Axis], udir: number, vdir: number,
  size: [width: number, height: number, depth: number], grid: [x: number, y: number], materialIndex: number): void {
  const [u, v, out] = axes;
  const [width, height, depth] = size;
  const [gridX, gridY] = grid;
  const vector = [0, 0, 0];
  for (let iy = 0; iy <= gridY; iy++) {
    const y = iy * (height / gridY) - height / 2;
    for (let ix = 0; ix <= gridX; ix++) {
      const x = ix * (width / gridX) - width / 2;
      vector[u] = x * udir;
      vector[v] = y * vdir;
      vector[out] = depth / 2;
      parts.positions.push(vector[0], vector[1], vector[2]);
      vector[u] = 0;
      vector[v] = 0;
      vector[out] = depth > 0 ? 1 : -1;
      parts.normals.push(vector[0], vector[1], vector[2]);
      parts.uvs.push(ix / gridX, 1 - iy / gridY);
    }
  }
  const start = parts.indices.length;
  const base = parts.vertices;
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const corner = base + ix + (gridX + 1) * iy;
      const below = base + ix + (gridX + 1) * (iy + 1);
      parts.indices.push(corner, below, corner + 1);
      parts.indices.push(below, below + 1, corner + 1);
    }
  }
  parts.groups.push([start, parts.indices.length - start, materialIndex]);
  parts.vertices += (gridX + 1) * (gridY + 1);
}

/** A box (three's `BoxGeometry`): faces +x, -x, +y, -y, +z, -z in turn, each its own group (0 to 5). */
export function box(width = 1, height = 1, depth = 1, widthSegments = 1, heightSegments = 1,
  depthSegments = 1): Geometry {
  const wide = Math.floor(widthSegments);
  const tall = Math.floor(heightSegments);
  const deep = Math.floor(depthSegments);
  const parts: BoxParts = { positions: [], normals: [], uvs: [], indices: [], groups: [], vertices: 0 };
  boxFace(parts, [2, 1, 0], -1, -1, [depth, height, width], [deep, tall], 0);
  boxFace(parts, [2, 1, 0], 1, -1, [depth, height, -width], [deep, tall], 1);
  boxFace(parts, [0, 2, 1], 1, 1, [width, depth, height], [wide, deep], 2);
  boxFace(parts, [0, 2, 1], 1, -1, [width, depth, -height], [wide, deep], 3);
  boxFace(parts, [0, 1, 2], 1, -1, [width, height, depth], [wide, tall], 4);
  boxFace(parts, [0, 1, 2], -1, -1, [width, height, -depth], [wide, tall], 5);
  const geometry = meshOf(parts.indices, parts.positions, parts.normals, parts.uvs);
  for (const [start, count, materialIndex] of parts.groups) geometry.addGroup(start, count, materialIndex);
  return geometry;
}

/** A plane (three's `PlaneGeometry`) in xy facing +z, gridded from its top left. */
export function plane(width = 1, height = 1, widthSegments = 1, heightSegments = 1): Geometry {
  const gridX = Math.floor(widthSegments);
  const gridY = Math.floor(heightSegments);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let iy = 0; iy <= gridY; iy++) {
    const y = iy * (height / gridY) - height / 2;
    for (let ix = 0; ix <= gridX; ix++) {
      positions.push(ix * (width / gridX) - width / 2, -y, 0);
      normals.push(0, 0, 1);
      uvs.push(ix / gridX, 1 - iy / gridY);
    }
  }
  const indices: number[] = [];
  for (let iy = 0; iy < gridY; iy++) {
    for (let ix = 0; ix < gridX; ix++) {
      const corner = ix + (gridX + 1) * iy;
      const below = ix + (gridX + 1) * (iy + 1);
      indices.push(corner, below, corner + 1);
      indices.push(below, below + 1, corner + 1);
    }
  }
  const parameters = { width, height, widthSegments, heightSegments };
  return described(meshOf(indices, positions, normals, uvs), 'PlaneGeometry', parameters);
}

/** A disc (three's `CircleGeometry`) in xy facing +z: a fan from its middle, `segments` round. */
export function circle(radius = 1, segments = 32, thetaStart = 0, thetaLength = Math.PI * 2): Geometry {
  const steps = Math.max(3, segments);
  const positions = [0, 0, 0];
  const normals = [0, 0, 1];
  const uvs = [0.5, 0.5];
  for (let segment = 0; segment <= steps; segment++) {
    const angle = thetaStart + (segment / steps) * thetaLength;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    positions.push(x, y, 0);
    normals.push(0, 0, 1);
    uvs.push((x / radius + 1) / 2, (y / radius + 1) / 2);
  }
  const indices: number[] = [];
  for (let i = 1; i <= steps; i++) indices.push(i, i + 1, 0);
  return meshOf(indices, positions, normals, uvs);
}

/** A flat ring (three's `RingGeometry`) in xy facing +z, from `innerRadius` out to `outerRadius`. */
export function ring(innerRadius = 0.5, outerRadius = 1, thetaSegments = 32, phiSegments = 1, thetaStart = 0,
  thetaLength = Math.PI * 2): Geometry {
  const round = Math.max(3, thetaSegments);
  const rows = Math.max(1, phiSegments);
  const step = (outerRadius - innerRadius) / rows;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  let radius = innerRadius;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= round; i++) {
      const angle = thetaStart + (i / round) * thetaLength;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push((x / outerRadius + 1) / 2, (y / outerRadius + 1) / 2);
    }
    radius += step;
  }
  const indices: number[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < round; i++) {
      const corner = i + j * (round + 1);
      const below = corner + round + 1;
      indices.push(corner, below, corner + 1);
      indices.push(below, below + 1, corner + 1);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}
