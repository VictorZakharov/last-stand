// A tube swept along a curve (three's `TubeGeometry`): a ring of points at each of `tubularSegments + 1` places
// evenly along its length, turned by the curve's Frenet frames. Follows three 0.187's (three.js, MIT) to the vertex.
import { Vec3 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import type { Curve } from './curve.ts';
import { meshOf } from './build.ts';

/** A tube of `radius` along `path`, `radialSegments` round; closed, its last ring is its first again. */
export function tube(path: Curve<Vec3>, tubularSegments = 64, radius = 1, radialSegments = 8,
  closed = false): Geometry {
  const frames = path.computeFrenetFrames(tubularSegments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const normal = new Vec3();
  let point = new Vec3();
  const ringAt = (i: number): void => {
    point = path.getPointAt(i / tubularSegments, point);
    const n = frames.normals[i];
    const b = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      normal.set(cos * n.x + sin * b.x, cos * n.y + sin * b.y, cos * n.z + sin * b.z).normalize();
      normals.push(normal.x, normal.y, normal.z);
      positions.push(point.x + radius * normal.x, point.y + radius * normal.y, point.z + radius * normal.z);
    }
  };
  for (let i = 0; i < tubularSegments; i++) ringAt(i);
  ringAt(closed ? 0 : tubularSegments);
  const uvs: number[] = [];
  for (let i = 0; i <= tubularSegments; i++) {
    for (let j = 0; j <= radialSegments; j++) uvs.push(i / tubularSegments, j / radialSegments);
  }
  const indices: number[] = [];
  for (let j = 1; j <= tubularSegments; j++) {
    for (let i = 1; i <= radialSegments; i++) {
      const a = (radialSegments + 1) * (j - 1) + (i - 1);
      const b = (radialSegments + 1) * j + (i - 1);
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  return meshOf(indices, positions, normals, uvs);
}
