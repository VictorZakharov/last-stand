// A point or a direction in 2D, in place and chainable as three's `Vector2`: the game's screen points and uvs,
// the outlines' and curves' points. `x` and `y` are written through `this` alone and declared in an interface,
// so a watched subclass can make them accessors.
import type { Mat3 } from './mat3.ts';
import type { AttributeLike, NumberArray, Vec2Tuple } from './types.ts';

/** what `Vec2` holds; an interface, not class fields, so a subclass may give them accessors (TS2611 otherwise) */
export interface Vec2 {
  /** the first component */
  x: number;
  /** the second component */
  y: number;
}

/** three's `Vector2`; its components are assigned in the constructor, not declared as fields (see `Vec3`) */
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /** true: what the game tests for three's `isVector2` */
  get isVec2(): true {
    return true;
  }

  /** sets both */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** sets both to `scalar` */
  setScalar(scalar: number): this {
    return this.set(scalar, scalar);
  }

  /** a new plain `Vec2` with these numbers */
  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  /** takes `v`'s numbers */
  copy(v: Vec2): this {
    return this.set(v.x, v.y);
  }

  /** adds `v` */
  add(v: Vec2): this {
    return this.set(this.x + v.x, this.y + v.y);
  }

  /** becomes `a + b` */
  addVectors(a: Vec2, b: Vec2): this {
    return this.set(a.x + b.x, a.y + b.y);
  }

  /** adds `v` times `scale` */
  addScaledVector(v: Vec2, scale: number): this {
    return this.set(this.x + v.x * scale, this.y + v.y * scale);
  }

  /** takes `v` away */
  sub(v: Vec2): this {
    return this.set(this.x - v.x, this.y - v.y);
  }

  /** becomes `a - b` */
  subVectors(a: Vec2, b: Vec2): this {
    return this.set(a.x - b.x, a.y - b.y);
  }

  /** multiplies each by `v`'s */
  multiply(v: Vec2): this {
    return this.set(this.x * v.x, this.y * v.y);
  }

  /** multiplies each by `scalar` */
  multiplyScalar(scalar: number): this {
    return this.set(this.x * scalar, this.y * scalar);
  }

  /** divides each by `scalar` */
  divideScalar(scalar: number): this {
    return this.multiplyScalar(1 / scalar);
  }

  /** each the other way */
  negate(): this {
    return this.set(-this.x, -this.y);
  }

  /** the dot product with `v` */
  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  /** the cross product's z with `v` (`x * v.y - y * v.x`) */
  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x;
  }

  /** the length squared */
  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  /** the length */
  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  /** made one long, the way it points (left at 0 when it's 0) */
  normalize(): this {
    return this.divideScalar(this.length() || 1);
  }

  /** made `length` long, the way it points */
  setLength(length: number): this {
    return this.normalize().multiplyScalar(length);
  }

  /** the angle from +x, in radians from 0 to 2π */
  angle(): number {
    return Math.atan2(-this.y, -this.x) + Math.PI;
  }

  /** the distance to `v` */
  distanceTo(v: Vec2): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  /** the distance to `v`, squared */
  distanceToSquared(v: Vec2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  /** moved `alpha` of the way to `v` */
  lerp(v: Vec2, alpha: number): this {
    const x = this.x;
    const y = this.y;
    return this.set(x + (v.x - x) * alpha, y + (v.y - y) * alpha);
  }

  /** becomes the point `alpha` of the way from `a` to `b` */
  lerpVectors(a: Vec2, b: Vec2, alpha: number): this {
    return this.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha);
  }

  /** turned by `angle` radians about `center` */
  rotateAround(center: Vec2, angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    return this.set(x * c - y * s + center.x, x * s + y * c + center.y);
  }

  /** placed by `m`, as a point in 2D (a uv transform) */
  applyMatrix3(m: Mat3): this {
    const x = this.x;
    const y = this.y;
    const e = m.elements;
    return this.set(e[0] * x + e[3] * y + e[6], e[1] * x + e[4] * y + e[7]);
  }

  /** whether `v` has the same numbers */
  equals(v: Vec2): boolean {
    return v.x === this.x && v.y === this.y;
  }

  /** takes two numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1]);
  }

  /** the two numbers as a new array */
  toArray(): Vec2Tuple;
  /** writes the two numbers into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    return array;
  }

  /** takes item `index` of `attribute` */
  fromBufferAttribute(attribute: AttributeLike, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index));
  }
}
