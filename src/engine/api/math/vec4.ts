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
  /** its `index`th of x, y, z and w */
  getComponent(index: number): number {
    if (index === 0) return this.x;
    if (index === 1) return this.y;
    if (index === 2) return this.z;
    if (index === 3) return this.w;
    throw new RangeError(`Vec4 has no component ${index}`);
  }

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

  /** takes `vector`'s numbers */
  copy(vector: Vec4): this {
    return this.set(vector.x, vector.y, vector.z, vector.w);
  }

  /** adds `vector` */
  add(vector: Vec4): this {
    return this.set(this.x + vector.x, this.y + vector.y, this.z + vector.z, this.w + vector.w);
  }

  /** adds `vector` times `scale` */
  addScaledVector(vector: Vec4, scale: number): this {
    const x = this.x + vector.x * scale;
    const y = this.y + vector.y * scale;
    return this.set(x, y, this.z + vector.z * scale, this.w + vector.w * scale);
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

  /** moved `alpha` of the way to `vector` */
  lerp(vector: Vec4, alpha: number): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;
    const px = x + (vector.x - x) * alpha;
    const py = y + (vector.y - y) * alpha;
    return this.set(px, py, z + (vector.z - z) * alpha, w + (vector.w - w) * alpha);
  }

  /** multiplied by `matrix` (no divide by w) */
  applyMatrix4(matrix: Mat4): this {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    const w = this.w;
    const elements = matrix.elements;
    const px = elements[0] * x + elements[4] * y + elements[8] * z + elements[12] * w;
    const py = elements[1] * x + elements[5] * y + elements[9] * z + elements[13] * w;
    const pz = elements[2] * x + elements[6] * y + elements[10] * z + elements[14] * w;
    const pw = elements[3] * x + elements[7] * y + elements[11] * z + elements[15] * w;
    return this.set(px, py, pz, pw);
  }

  /** whether `vector` has the same numbers */
  equals(vector: Vec4): boolean {
    return vector.x === this.x && vector.y === this.y && vector.z === this.z && vector.w === this.w;
  }

  /** takes four numbers from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    return this.set(array[offset], array[offset + 1], array[offset + 2], array[offset + 3]);
  }

  /** the four numbers as a new array */
  toArray(): Vec4Tuple;
  /** writes the four numbers into `array` at `offset` */
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
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
