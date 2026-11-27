// Four numbers, in place and chainable as three's `Vector4`: a look's uniform, a skin's indices and weights, a
// point with its w. `x`, `y`, `z` and `w` are written through `this` alone and declared in an interface, so a
// watched subclass can make them accessors.
import type { Mat4 } from './mat4.ts';
import type { AttributeLike, NumberArray, Vec4Tuple } from './types.ts';

/** what `Vec4` holds; an interface, not class fields, so a subclass may give them accessors (TS2611 otherwise) */
export interface Vec4 {
  /** the first component */
  x: number;
  /** the second component */
  y: number;
  /** the third component */
  z: number;
  /** the fourth component */
  w: number;
}

/** three's `Vector4`; its components are assigned in the constructor, not declared as fields (see `Vec3`) */
export class Vec4 {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /** true: what the game tests for three's `isVector4` */
  get isVec4(): true {
    return true;
  }

  /** sets all four */
  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /** sets all four to `scalar` */
  setScalar(scalar: number): this {
    return this.set(scalar, scalar, scalar, scalar);
  }

  /** a new plain `Vec4` with these numbers */
  clone(): Vec4 {
    return new Vec4(this.x, this.y, this.z, this.w);
  }

  /** takes `v`'s numbers */
  copy(v: Vec4): this {
    return this.set(v.x, v.y, v.z, v.w);
  }

  /** adds `v` */
  add(v: Vec4): this {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z, this.w + v.w);
  }

  /** adds `v` times `scale` */
  addScaledVector(v: Vec4, scale: number): this {
    return this.set(this.x + v.x * scale, this.y + v.y * scale, this.z + v.z * scale, this.w + v.w * scale);
  }

  /** multiplies each by `scalar` */
  multiplyScalar(scalar: number): this {
    return this.set(this.x * scalar, this.y * scalar, this.z * scalar, this.w * scalar);
  }

  /** the length */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }

  /** made one long (left at 0 when it's 0) */
  normalize(): this {
    return this.multiplyScalar(1 / (this.length() || 1));
  }

  /** moved `alpha` of the way to `v` */
  lerp(v: Vec4, alpha: number): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;
    return this.set(x + (v.x - x) * alpha, y + (v.y - y) * alpha, z + (v.z - z) * alpha, w + (v.w - w) * alpha);
  }

  /** multiplied by `m` (no divide by w) */
  applyMatrix4(m: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;
    const e = m.elements;
    const px = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
    const py = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
    const pz = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
    const pw = e[3] * x + e[7] * y + e[11] * z + e[15] * w;
    return this.set(px, py, pz, pw);
  }

  /** whether `v` has the same numbers */
  equals(v: Vec4): boolean {
    return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
  }

  /** takes four numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }

  /** the four numbers as a new array */
  toArray(): Vec4Tuple;
  /** writes the four numbers into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    array[offset] = this.x;
    array[offset + 1] = this.y;
    array[offset + 2] = this.z;
    array[offset + 3] = this.w;
    return array;
  }

  /** takes item `index` of `attribute` */
  fromBufferAttribute(attribute: AttributeLike, index: number): this {
    return this.set(attribute.getX(index), attribute.getY(index), attribute.getZ(index), attribute.getW(index));
  }
}
