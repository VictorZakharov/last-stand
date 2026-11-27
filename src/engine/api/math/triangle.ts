// A triangle, as three's `Triangle`: corners `a`, `b`, `c`, its face the side they wind anticlockwise from. The
// raycaster's hit is read off it: the face's normal and the uv at the hit (`getBarycoord`, `getInterpolation`).
import { Vec3 } from './vec3.ts';

/** what `getInterpolation` blends: a `Vec2`, `Vec3` or `Vec4` */
export interface Blendable<Value> {
  /** every component `scalar` */
  setScalar(scalar: number): Value;
  /** adds `weightB` times `scale` */
  addScaledVector(weightB: Value, scale: number): Value;
}

/** a point's weights on `cornerA`, `cornerB`, `cornerC`, into `target`; null (and 0s) for a triangle of no area */
function barycoord(point: Vec3, cornerA: Vec3, cornerB: Vec3, cornerC: Vec3, target: Vec3): Vec3 | null {
  toC.subVectors(cornerC, cornerA);
  toB.subVectors(cornerB, cornerA);
  toPoint.subVectors(point, cornerA);
  const cc = toC.dot(toC);
  const cb = toC.dot(toB);
  const cp = toC.dot(toPoint);
  const bb = toB.dot(toB);
  const bp = toB.dot(toPoint);
  const denominator = cc * bb - cb * cb;
  if (denominator === 0) {
    target.set(0, 0, 0);
    return null;
  }
  const inverse = 1 / denominator;
  const weightC = (bb * cp - cb * bp) * inverse;
  const weightB = (cc * bp - cb * cp) * inverse;
  return target.set(1 - weightC - weightB, weightB, weightC);
}

/** three's `Triangle` */
export class Triangle {
  /** the first corner */
  a: Vec3;
  /** the second corner */
  b: Vec3;
  /** the third corner */
  c: Vec3;

  /** the triangle of the corners given, or of the origin alone */
  constructor(cornerA = new Vec3(), cornerB = new Vec3(), cornerC = new Vec3()) {
    this.a = cornerA;
    this.b = cornerB;
    this.c = cornerC;
  }

  /** the unit normal of `cornerA`, `cornerB`, `cornerC`'s face, into `target` (0 for no area) */
  static getNormal(cornerA: Vec3, cornerB: Vec3, cornerC: Vec3, target: Vec3): Vec3 {
    target.subVectors(cornerC, cornerB);
    toB.subVectors(cornerA, cornerB);
    target.cross(toB);
    const lengthSq = target.lengthSq();
    if (lengthSq > 0) return target.multiplyScalar(1 / Math.sqrt(lengthSq));
    return target.set(0, 0, 0);
  }

  /**
   * `point`'s weights on `cornerA`, `cornerB`, `cornerC` (barycentric), into `target`; null for a triangle of no
   * area. Follows three.js 0.187.0's `Triangle.getBarycoord` (its dot products, after Ericson's).
   */
  static getBarycoord(point: Vec3, cornerA: Vec3, cornerB: Vec3, cornerC: Vec3, target: Vec3): Vec3 | null {
    return barycoord(point, cornerA, cornerB, cornerC, target);
  }

  /** whether `point` (in the triangle's plane) is inside it or on its edges */
  static containsPoint(point: Vec3, cornerA: Vec3, cornerB: Vec3, cornerC: Vec3): boolean {
    if (barycoord(point, cornerA, cornerB, cornerC, weights) === null) return false;
    return weights.x >= 0 && weights.y >= 0 && weights.x + weights.y <= 1;
  }

  /** the blend of `v1`, `v2`, `v3` (at `p1`, `p2`, `p3`) at `point`, into `target`; null (and 0s) for no area */
  static getInterpolation<Value extends Blendable<Value>>(point: Vec3, p1: Vec3, p2: Vec3, p3: Vec3,
    v1: Value, v2: Value, v3: Value, target: Value): Value | null {
    if (barycoord(point, p1, p2, p3, weights) === null) {
      target.setScalar(0);
      return null;
    }
    target.setScalar(0);
    target.addScaledVector(v1, weights.x);
    target.addScaledVector(v2, weights.y);
    target.addScaledVector(v3, weights.z);
    return target;
  }

  /** whether the face `cornerA`, `cornerB`, `cornerC` faces against `direction` (seen from the front along it) */
  static isFrontFacing(cornerA: Vec3, cornerB: Vec3, cornerC: Vec3, direction: Vec3): boolean {
    toC.subVectors(cornerC, cornerB);
    toB.subVectors(cornerA, cornerB);
    return toC.cross(toB).dot(direction) < 0;
  }

  /** takes three corners' numbers */
  set(cornerA: Vec3, cornerB: Vec3, cornerC: Vec3): this {
    this.a.copy(cornerA);
    this.b.copy(cornerB);
    this.c.copy(cornerC);
    return this;
  }

  /** takes the corners `points[i0]`, `points[i1]`, `points[i2]` */
  setFromPointsAndIndices(points: readonly Vec3[], i0: number, i1: number, i2: number): this {
    return this.set(points[i0], points[i1], points[i2]);
  }

  /** a new triangle with these corners */
  clone(): Triangle {
    return new Triangle(this.a.clone(), this.b.clone(), this.c.clone());
  }

  /** takes `triangle`'s corners */
  copy(triangle: Triangle): this {
    return this.set(triangle.a, triangle.b, triangle.c);
  }

  /** its area */
  getArea(): number {
    toC.subVectors(this.c, this.b);
    toB.subVectors(this.a, this.b);
    return toC.cross(toB).length() * 0.5;
  }

  /** its middle (the corners' mean), into `target` */
  getMidpoint(target: Vec3): Vec3 {
    return target.addVectors(this.a, this.b).add(this.c).multiplyScalar(1 / 3);
  }

  /** its unit normal, into `target` */
  getNormal(target: Vec3): Vec3 {
    return Triangle.getNormal(this.a, this.b, this.c, target);
  }

  /** `point`'s weights on its corners, into `target`; null for no area */
  getBarycoord(point: Vec3, target: Vec3): Vec3 | null {
    return barycoord(point, this.a, this.b, this.c, target);
  }

  /** whether `point` (in its plane) is inside it or on its edges */
  containsPoint(point: Vec3): boolean {
    return Triangle.containsPoint(point, this.a, this.b, this.c);
  }

  /** whether it faces against `direction` */
  isFrontFacing(direction: Vec3): boolean {
    return Triangle.isFrontFacing(this.a, this.b, this.c, direction);
  }

  /**
   * The point of it nearest `point`, into `target`. Follows three.js 0.187.0's `Triangle.closestPointToPoint`
   * (Ericson's Real-Time Collision Detection, 5.1.5: by the Voronoi region of a corner, an edge or the face).
   */
  closestPointToPoint(point: Vec3, target: Vec3): Vec3 {
    const cornerA = this.a;
    const cornerB = this.b;
    const cornerC = this.c;
    toB.subVectors(cornerB, cornerA);
    toC.subVectors(cornerC, cornerA);
    toPoint.subVectors(point, cornerA);
    const d1 = toB.dot(toPoint);
    const d2 = toC.dot(toPoint);
    if (d1 <= 0 && d2 <= 0) return target.copy(cornerA);
    fromCorner.subVectors(point, cornerB);
    const d3 = toB.dot(fromCorner);
    const d4 = toC.dot(fromCorner);
    if (d3 >= 0 && d4 <= d3) return target.copy(cornerB);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return target.copy(cornerA).addScaledVector(toB, d1 / (d1 - d3));
    fromCorner.subVectors(point, cornerC);
    const d5 = toB.dot(fromCorner);
    const d6 = toC.dot(fromCorner);
    if (d6 >= 0 && d5 <= d6) return target.copy(cornerC);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return target.copy(cornerA).addScaledVector(toC, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      fromCorner.subVectors(cornerC, cornerB);
      return target.copy(cornerB).addScaledVector(fromCorner, (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    }
    const inverse = 1 / (va + vb + vc);
    return target.copy(cornerA).addScaledVector(toB, vb * inverse).addScaledVector(toC, vc * inverse);
  }

  /** whether `triangle` has the same corners */
  equals(triangle: Triangle): boolean {
    return triangle.a.equals(this.a) && triangle.b.equals(this.b) && triangle.c.equals(this.c);
  }
}

/** the edges and offsets the tests measure with */
const toB = new Vec3();
const toC = new Vec3();
const toPoint = new Vec3();
const fromCorner = new Vec3();
/** a point's weights, for the tests that read them */
const weights = new Vec3();
