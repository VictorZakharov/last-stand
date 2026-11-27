// A triangle, as three's `Triangle`: corners `a`, `b`, `c`, its face the side they wind anticlockwise from. The
// raycaster's hit is read off it: the face's normal and the uv at the hit (`getBarycoord`, `getInterpolation`).
import { Vec3 } from './vec3.ts';

/** what `getInterpolation` blends: a `Vec2`, `Vec3` or `Vec4` */
export interface Blendable<T> {
  /** every component `scalar` */
  setScalar(scalar: number): T;
  /** adds `v` times `scale` */
  addScaledVector(v: T, scale: number): T;
}

/** a point's weights on `a`, `b`, `c`, into `target`; null (and 0s) for a triangle of no area */
function barycoord(point: Vec3, a: Vec3, b: Vec3, c: Vec3, target: Vec3): Vec3 | null {
  toC.subVectors(c, a);
  toB.subVectors(b, a);
  toPoint.subVectors(point, a);
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
  const u = (bb * cp - cb * bp) * inverse;
  const v = (cc * bp - cb * cp) * inverse;
  return target.set(1 - u - v, v, u);
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
  constructor(a = new Vec3(), b = new Vec3(), c = new Vec3()) {
    this.a = a;
    this.b = b;
    this.c = c;
  }

  /** the unit normal of `a`, `b`, `c`'s face, into `target` (0 for no area) */
  static getNormal(a: Vec3, b: Vec3, c: Vec3, target: Vec3): Vec3 {
    target.subVectors(c, b);
    toB.subVectors(a, b);
    target.cross(toB);
    const lengthSq = target.lengthSq();
    if (lengthSq > 0) return target.multiplyScalar(1 / Math.sqrt(lengthSq));
    return target.set(0, 0, 0);
  }

  /**
   * `point`'s weights on `a`, `b`, `c` (barycentric), into `target`; null for a triangle of no area. Follows
   * three.js 0.187.0's `Triangle.getBarycoord` (its dot products, after Ericson's).
   */
  static getBarycoord(point: Vec3, a: Vec3, b: Vec3, c: Vec3, target: Vec3): Vec3 | null {
    return barycoord(point, a, b, c, target);
  }

  /** whether `point` (in the triangle's plane) is inside it or on its edges */
  static containsPoint(point: Vec3, a: Vec3, b: Vec3, c: Vec3): boolean {
    if (barycoord(point, a, b, c, weights) === null) return false;
    return weights.x >= 0 && weights.y >= 0 && weights.x + weights.y <= 1;
  }

  /** the blend of `v1`, `v2`, `v3` (at `p1`, `p2`, `p3`) at `point`, into `target`; null (and 0s) for no area */
  static getInterpolation<T extends Blendable<T>>(point: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, v1: T, v2: T, v3: T,
    target: T): T | null {
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

  /** whether the face `a`, `b`, `c` faces against `direction` (seen from the front along it) */
  static isFrontFacing(a: Vec3, b: Vec3, c: Vec3, direction: Vec3): boolean {
    toC.subVectors(c, b);
    toB.subVectors(a, b);
    return toC.cross(toB).dot(direction) < 0;
  }

  /** takes three corners' numbers */
  set(a: Vec3, b: Vec3, c: Vec3): this {
    this.a.copy(a);
    this.b.copy(b);
    this.c.copy(c);
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
   * The point of it nearest `p`, into `target`. Follows three.js 0.187.0's `Triangle.closestPointToPoint`
   * (Ericson's Real-Time Collision Detection, 5.1.5: by the Voronoi region of a corner, an edge or the face).
   */
  closestPointToPoint(p: Vec3, target: Vec3): Vec3 {
    const a = this.a;
    const b = this.b;
    const c = this.c;
    toB.subVectors(b, a);
    toC.subVectors(c, a);
    toPoint.subVectors(p, a);
    const d1 = toB.dot(toPoint);
    const d2 = toC.dot(toPoint);
    if (d1 <= 0 && d2 <= 0) return target.copy(a);
    fromCorner.subVectors(p, b);
    const d3 = toB.dot(fromCorner);
    const d4 = toC.dot(fromCorner);
    if (d3 >= 0 && d4 <= d3) return target.copy(b);
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return target.copy(a).addScaledVector(toB, d1 / (d1 - d3));
    fromCorner.subVectors(p, c);
    const d5 = toB.dot(fromCorner);
    const d6 = toC.dot(fromCorner);
    if (d6 >= 0 && d5 <= d6) return target.copy(c);
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return target.copy(a).addScaledVector(toC, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      fromCorner.subVectors(c, b);
      return target.copy(b).addScaledVector(fromCorner, (d4 - d3) / ((d4 - d3) + (d5 - d6)));
    }
    const inverse = 1 / (va + vb + vc);
    return target.copy(a).addScaledVector(toB, vb * inverse).addScaledVector(toC, vc * inverse);
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
