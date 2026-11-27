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

  /** takes `vector`'s numbers */
  copy(vector: Vec2): this {
    return this.set(vector.x, vector.y);
  }

  /** adds `vector` */
  add(vector: Vec2): this {
    return this.set(this.x + vector.x, this.y + vector.y);
  }

  /** becomes `a + b` */
  addVectors(left: Vec2, right: Vec2): this {
    return this.set(left.x + right.x, left.y + right.y);
  }

  /** adds `vector` times `scale` */
  addScaledVector(vector: Vec2, scale: number): this {
    return this.set(this.x + vector.x * scale, this.y + vector.y * scale);
  }

  /** takes `vector` away */
  sub(vector: Vec2): this {
    return this.set(this.x - vector.x, this.y - vector.y);
  }

  /** becomes `a - b` */
  subVectors(left: Vec2, right: Vec2): this {
    return this.set(left.x - right.x, left.y - right.y);
  }

  /** multiplies each by `vector`'s */
  multiply(vector: Vec2): this {
    return this.set(this.x * vector.x, this.y * vector.y);
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

  /** the dot product with `vector` */
  dot(vector: Vec2): number {
    return this.x * vector.x + this.y * vector.y;
  }

  /** the cross product's z with `vector` (`x * v.y - y * v.x`) */
  cross(vector: Vec2): number {
    return this.x * vector.y - this.y * vector.x;
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

  /** the distance to `vector` */
  distanceTo(vector: Vec2): number {
    return Math.sqrt(this.distanceToSquared(vector));
  }

  /** the distance to `vector`, squared */
  distanceToSquared(vector: Vec2): number {
    const dx = this.x - vector.x;
    const dy = this.y - vector.y;
    return dx * dx + dy * dy;
  }

  /** moved `alpha` of the way to `vector` */
  lerp(vector: Vec2, alpha: number): this {
    const x = this.x;
    const y = this.y;
    return this.set(x + (vector.x - x) * alpha, y + (vector.y - y) * alpha);
  }

  /** becomes the point `alpha` of the way from `left` to `right` */
  lerpVectors(left: Vec2, right: Vec2, alpha: number): this {
    return this.set(left.x + (right.x - left.x) * alpha, left.y + (right.y - left.y) * alpha);
  }

  /** turned by `angle` radians about `center` */
  rotateAround(center: Vec2, angle: number): this {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const x = this.x - center.x;
    const y = this.y - center.y;
    return this.set(x * cosine - y * sine + center.x, x * sine + y * cosine + center.y);
  }

  /** placed by `matrix`, as a point in 2D (a uv transform) */
  applyMatrix3(matrix: Mat3): this {
    const x = this.x;
    const y = this.y;
    const elements = matrix.elements;
    return this.set(elements[0] * x + elements[3] * y + elements[6], elements[1] * x + elements[4] * y + elements[7]);
  }

  /** whether `vector` has the same numbers */
  equals(vector: Vec2): boolean {
    return vector.x === this.x && vector.y === this.y;
  }

  /** takes two numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1]);
  }

  /** the two numbers as a new array */
  toArray(): Vec2Tuple;
  /** writes the two numbers into `array` at `offset` */
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
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
