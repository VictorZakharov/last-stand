// A 4 by 4 matrix, as three's `Matrix4`: `elements` column-major (`elements[12..14]` its translation), in place and
// chainable. The longer sums are `mat4Ops.ts`'s.
import { Quat } from './quat.ts';
import { Vec3 } from './vec3.ts';
import {
  determinant4, determinantAffine, invertInPlace, multiplyInto, orthographic, perspective,
} from './mat4Ops.ts';
import type { Euler } from './euler.ts';
import type { CoordinateSystem, NumberArray } from './types.ts';
import { WebGLCoordinateSystem } from './types.ts';

/** three's `Matrix4` */
export class Mat4 {
  /** the 16 numbers, column by column */
  elements: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  /** the identity, or the 16 numbers given row by row (as written on paper, as three's constructor takes them) */
  constructor(...rowMajor: number[]) {
    if (rowMajor.length === 16) this.set(...(rowMajor as Mat4Row));
  }

  /** sets the 16 numbers, given row by row */
  set(...rowMajor: Mat4Row): this {
    const e = this.elements;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) e[column * 4 + row] = rowMajor[row * 4 + column];
    }
    return this;
  }

  /** the identity: no move */
  identity(): this {
    return this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  /** a new matrix with these numbers */
  clone(): Mat4 {
    return new Mat4().fromArray(this.elements);
  }

  /** takes `m`'s numbers */
  copy(m: Mat4): this {
    return this.fromArray(m.elements);
  }

  /** takes `m`'s translation, the rest kept */
  copyPosition(m: Mat4): this {
    const e = this.elements;
    e[12] = m.elements[12];
    e[13] = m.elements[13];
    e[14] = m.elements[14];
    return this;
  }

  /** becomes the matrix whose columns are the axes `x`, `y`, `z` */
  makeBasis(x: Vec3, y: Vec3, z: Vec3): this {
    return this.set(x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, 0, 0, 0, 1);
  }

  /** writes its first three columns into `x`, `y`, `z` */
  extractBasis(x: Vec3, y: Vec3, z: Vec3): this {
    x.setFromMatrixColumn(this, 0);
    y.setFromMatrixColumn(this, 1);
    z.setFromMatrixColumn(this, 2);
    return this;
  }

  /**
   * Becomes `m`'s turn alone: its columns made one long, no translation (the identity where `m` is flat).
   * Follows three.js 0.187.0's `Matrix4.extractRotation`.
   */
  extractRotation(m: Mat4): this {
    if (determinantAffine(m.elements) === 0) return this.identity();
    const sx = 1 / axis.setFromMatrixColumn(m, 0).length();
    const sy = 1 / axis.setFromMatrixColumn(m, 1).length();
    const sz = 1 / axis.setFromMatrixColumn(m, 2).length();
    const me = m.elements;
    const e = this.elements;
    for (let i = 0; i < 3; i++) {
      e[i] = me[i] * sx;
      e[4 + i] = me[4 + i] * sy;
      e[8 + i] = me[8 + i] * sz;
    }
    e[3] = 0;
    e[7] = 0;
    e[11] = 0;
    e[12] = 0;
    e[13] = 0;
    e[14] = 0;
    e[15] = 1;
    return this;
  }

  /** becomes the turn `euler` makes (by way of its quaternion, so its last digits may differ from three's) */
  makeRotationFromEuler(euler: Euler): this {
    return this.makeRotationFromQuaternion(turn.setFromEuler(euler, false));
  }

  /** becomes the turn `q` makes */
  makeRotationFromQuaternion(q: Quat): this {
    return this.compose(origin, q, unit);
  }

  /**
   * Becomes a turn whose -z looks from `eye` at `target`, its y as near `up` as it can (`elements` 0 to 10 alone).
   * Follows three.js 0.187.0's `Matrix4.lookAt`, its nudges where eye and target meet or `up` lies along the look.
   */
  lookAt(eye: Vec3, target: Vec3, up: Vec3): this {
    lookZ.subVectors(eye, target);
    if (lookZ.lengthSq() === 0) lookZ.z = 1;
    lookZ.normalize();
    lookX.crossVectors(up, lookZ);
    if (lookX.lengthSq() === 0) {
      if (Math.abs(up.z) === 1) lookZ.x += 0.0001;
      else lookZ.z += 0.0001;
      lookZ.normalize();
      lookX.crossVectors(up, lookZ);
    }
    lookX.normalize();
    lookY.crossVectors(lookZ, lookX);
    const e = this.elements;
    lookX.toArray(e, 0);
    lookY.toArray(e, 4);
    lookZ.toArray(e, 8);
    return this;
  }

  /** becomes `this × m`: `m` applied first */
  multiply(m: Mat4): this {
    return this.multiplyMatrices(this, m);
  }

  /** becomes `m × this`: this applied first */
  premultiply(m: Mat4): this {
    return this.multiplyMatrices(m, this);
  }

  /** becomes `a × b` (either may be this matrix) */
  multiplyMatrices(a: Mat4, b: Mat4): this {
    multiplyInto(this.elements, a.elements, b.elements);
    return this;
  }

  /** the determinant */
  determinant(): number {
    return determinant4(this.elements);
  }

  /** rows made columns */
  transpose(): this {
    const e = this.elements;
    for (let row = 0; row < 4; row++) {
      for (let column = row + 1; column < 4; column++) {
        const held = e[column * 4 + row];
        e[column * 4 + row] = e[row * 4 + column];
        e[row * 4 + column] = held;
      }
    }
    return this;
  }

  /** sets the translation, from a vector or three numbers */
  setPosition(x: Vec3 | number, y = 0, z = 0): this {
    const e = this.elements;
    if (typeof x === 'number') {
      e[12] = x;
      e[13] = y;
      e[14] = z;
    } else {
      x.toArray(e, 12);
    }
    return this;
  }

  /** made its inverse (all zeros where it has none, as three's) */
  invert(): this {
    invertInPlace(this.elements);
    return this;
  }

  /** the largest scale along any of its axes */
  getMaxScaleOnAxis(): number {
    const e = this.elements;
    const sx = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const sy = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
    const sz = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
    return Math.sqrt(Math.max(sx, sy, sz));
  }

  /** becomes a move by a vector or three numbers */
  makeTranslation(x: Vec3 | number, y = 0, z = 0): this {
    if (typeof x === 'number') return this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);
    return this.set(1, 0, 0, x.x, 0, 1, 0, x.y, 0, 0, 1, x.z, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about x */
  makeRotationX(theta: number): this {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about y */
  makeRotationY(theta: number): this {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about z */
  makeRotationZ(theta: number): this {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `angle` radians about `axis` (one long) */
  makeRotationAxis(axis: Vec3, angle: number): this {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axis.x;
    const y = axis.y;
    const z = axis.z;
    const tx = t * x;
    const ty = t * y;
    return this.set(
      tx * x + c, tx * y - s * z, tx * z + s * y, 0,
      tx * y + s * z, ty * y + c, ty * z - s * x, 0,
      tx * z - s * y, ty * z + s * x, t * z * z + c, 0,
      0, 0, 0, 1,
    );
  }

  /** becomes a scale along each axis */
  makeScale(x: number, y: number, z: number): this {
    return this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1);
  }

  /** becomes the move that scales by `scale`, turns by `quaternion`, then moves to `position` */
  compose(position: Vec3, quaternion: Quat, scale: Vec3): this {
    const e = this.elements;
    const x = quaternion.x;
    const y = quaternion.y;
    const z = quaternion.z;
    const w = quaternion.w;
    const xx = x * x * 2;
    const xy = x * y * 2;
    const xz = x * z * 2;
    const yy = y * y * 2;
    const yz = y * z * 2;
    const zz = z * z * 2;
    const wx = w * x * 2;
    const wy = w * y * 2;
    const wz = w * z * 2;
    const sx = scale.x;
    const sy = scale.y;
    const sz = scale.z;
    e[0] = (1 - (yy + zz)) * sx;
    e[1] = (xy + wz) * sx;
    e[2] = (xz - wy) * sx;
    e[3] = 0;
    e[4] = (xy - wz) * sy;
    e[5] = (1 - (xx + zz)) * sy;
    e[6] = (yz + wx) * sy;
    e[7] = 0;
    e[8] = (xz + wy) * sz;
    e[9] = (yz - wx) * sz;
    e[10] = (1 - (xx + yy)) * sz;
    e[11] = 0;
    e[15] = 1;
    return this.setPosition(position.x, position.y, position.z);
  }

  /**
   * Writes its move, turn and scale into the three given. Follows three.js 0.187.0's `Matrix4.decompose`: a
   * mirrored matrix's x scale made negative, and a flat one (determinant 0) read as no turn at a scale of 1.
   */
  decompose(position: Vec3, quaternion: Quat, scale: Vec3): this {
    const e = this.elements;
    position.set(e[12], e[13], e[14]);
    const det = determinantAffine(e);
    if (det === 0) {
      scale.set(1, 1, 1);
      quaternion.identity();
      return this;
    }
    let sx = axis.set(e[0], e[1], e[2]).length();
    const sy = axis.set(e[4], e[5], e[6]).length();
    const sz = axis.set(e[8], e[9], e[10]).length();
    if (det < 0) sx = -sx;
    const r = unscaled.elements;
    const inverseX = 1 / sx;
    const inverseY = 1 / sy;
    const inverseZ = 1 / sz;
    for (let i = 0; i < 3; i++) {
      r[i] = e[i] * inverseX;
      r[4 + i] = e[4 + i] * inverseY;
      r[8 + i] = e[8 + i] * inverseZ;
    }
    quaternion.setFromRotationMatrix(unscaled);
    scale.set(sx, sy, sz);
    return this;
  }

  /**
   * Becomes a perspective projection of the box at the near plane (three's `makePerspective`, its coordinate
   * system and reversed depth: clip depth -1 to 1 for WebGL, 0 to 1 for WebGPU).
   */
  makePerspective(left: number, right: number, top: number, bottom: number, near: number, far: number,
    coordinateSystem: CoordinateSystem = WebGLCoordinateSystem, reversedDepth = false): this {
    perspective(this.elements, { left, right, top, bottom, near, far }, coordinateSystem, reversedDepth);
    return this;
  }

  /** becomes an orthographic projection of the box (three's `makeOrthographic`, as `makePerspective`) */
  makeOrthographic(left: number, right: number, top: number, bottom: number, near: number, far: number,
    coordinateSystem: CoordinateSystem = WebGLCoordinateSystem, reversedDepth = false): this {
    orthographic(this.elements, { left, right, top, bottom, near, far }, coordinateSystem, reversedDepth);
    return this;
  }

  /** whether `m` has the same numbers */
  equals(m: Mat4): boolean {
    for (let i = 0; i < 16; i++) {
      if (this.elements[i] !== m.elements[i]) return false;
    }
    return true;
  }

  /** takes 16 numbers, column by column, from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    for (let i = 0; i < 16; i++) this.elements[i] = array[offset + i];
    return this;
  }

  /** the 16 numbers, column by column, as a new array */
  toArray(): number[];
  /** writes the 16 numbers, column by column, into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    for (let i = 0; i < 16; i++) array[offset + i] = this.elements[i];
    return array;
  }
}

/** sixteen numbers, as `Mat4.set` takes them */
export type Mat4Row = [
  number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
];

/** a vector `extractRotation` and `decompose` measure columns with */
const axis = new Vec3();
/** the axes `lookAt` makes */
const lookX = new Vec3();
const lookY = new Vec3();
const lookZ = new Vec3();
/** `makeRotationFromQuaternion`'s no move and unit scale */
const origin = new Vec3();
const unit = new Vec3(1, 1, 1);
/** a quaternion for `makeRotationFromEuler` */
const turn = new Quat();
/** `decompose`'s turn without its scale */
const unscaled = new Mat4();
