// A view's six planes, as three's `Frustum`, each facing in: what's on the inside of all six is in view. Made from
// a projection times a view (`setFromProjectionMatrix`); a node's test (three's `intersectsObject`) is the scene's.
import { Plane } from './plane.ts';
import { Vec3 } from './vec3.ts';
import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from './types.ts';
import type { Box3 } from './box3.ts';
import type { Mat4 } from './mat4.ts';
import type { Sphere } from './sphere.ts';
import type { CoordinateSystem } from './types.ts';

/** three's `Frustum` */
export class Frustum {
  /** left, right, bottom, top, far, near: three's order */
  planes: [Plane, Plane, Plane, Plane, Plane, Plane];

  /** the six planes given, or six planes through the origin */
  constructor(p0 = new Plane(), p1 = new Plane(), p2 = new Plane(), p3 = new Plane(), p4 = new Plane(),
    p5 = new Plane()) {
    this.planes = [p0, p1, p2, p3, p4, p5];
  }

  /** takes the six planes' numbers */
  set(p0: Plane, p1: Plane, p2: Plane, p3: Plane, p4: Plane, p5: Plane): this {
    const given = [p0, p1, p2, p3, p4, p5];
    for (let i = 0; i < 6; i++) this.planes[i].copy(given[i]);
    return this;
  }

  /** a new frustum with these planes */
  clone(): Frustum {
    return new Frustum().copy(this);
  }

  /** takes `frustum`'s planes */
  copy(frustum: Frustum): this {
    for (let i = 0; i < 6; i++) this.planes[i].copy(frustum.planes[i]);
    return this;
  }

  /**
   * The planes of `m` (a projection times a view), each normalized. Follows three.js 0.187.0's
   * `Frustum.setFromProjectionMatrix` (Gribb and Hartmann's rows; the near plane by the coordinate system's depth
   * range, near and far swapped for a reversed depth).
   */
  setFromProjectionMatrix(m: Mat4, coordinateSystem: CoordinateSystem = WebGLCoordinateSystem,
    reversedDepth = false): this {
    const e = m.elements;
    const planes = this.planes;
    fromRows(planes[0], e, 0, -1);
    fromRows(planes[1], e, 0, 1);
    fromRows(planes[2], e, 1, 1);
    fromRows(planes[3], e, 1, -1);
    if (reversedDepth) {
      fromDepthRow(planes[4], e);
      fromRows(planes[5], e, 2, -1);
    } else if (coordinateSystem === WebGLCoordinateSystem) {
      fromRows(planes[4], e, 2, -1);
      fromRows(planes[5], e, 2, 1);
    } else if (coordinateSystem === WebGPUCoordinateSystem) {
      fromRows(planes[4], e, 2, -1);
      fromDepthRow(planes[5], e);
    } else {
      throw new Error('Frustum.setFromProjectionMatrix: unknown coordinate system: ' + coordinateSystem);
    }
    return this;
  }

  /** whether `sphere` is at least partly inside */
  intersectsSphere(sphere: Sphere): boolean {
    for (const plane of this.planes) {
      if (plane.distanceToPoint(sphere.center) < -sphere.radius) return false;
    }
    return true;
  }

  /** whether `box` is at least partly inside (by each plane's farthest corner along its normal) */
  intersectsBox(box: Box3): boolean {
    for (const plane of this.planes) {
      const n = plane.normal;
      corner.set(n.x > 0 ? box.max.x : box.min.x, n.y > 0 ? box.max.y : box.min.y, n.z > 0 ? box.max.z : box.min.z);
      if (plane.distanceToPoint(corner) < 0) return false;
    }
    return true;
  }

  /** whether `point` is inside or on it */
  containsPoint(point: Vec3): boolean {
    for (const plane of this.planes) {
      if (plane.distanceToPoint(point) < 0) return false;
    }
    return true;
  }
}

/** sets `plane` to the matrix's fourth row plus `sign` (1 or -1) times its row `i`, normalized */
function fromRows(plane: Plane, e: readonly number[], i: number, sign: number): void {
  plane.setComponents(e[3] + sign * e[i], e[7] + sign * e[4 + i], e[11] + sign * e[8 + i], e[15] + sign * e[12 + i]);
  plane.normalize();
}

/** sets `plane` to the matrix's third row alone (a 0 to 1 depth's near plane), normalized */
function fromDepthRow(plane: Plane, e: readonly number[]): void {
  plane.setComponents(e[2], e[6], e[10], e[14]);
  plane.normalize();
}

/** the box's corner `intersectsBox` tests */
const corner = new Vec3();
