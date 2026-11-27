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
    const elements = this.elements;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) elements[column * 4 + row] = rowMajor[row * 4 + column];
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

  /** takes `matrix`'s numbers */
  copy(matrix: Mat4): this {
    return this.fromArray(matrix.elements);
  }

  /** takes `matrix`'s translation, the rest kept */
  copyPosition(matrix: Mat4): this {
    const elements = this.elements;
    elements[12] = matrix.elements[12];
    elements[13] = matrix.elements[13];
    elements[14] = matrix.elements[14];
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
   * Becomes `matrix`'s turn alone: its columns made one long, no translation (the identity where `matrix` is flat).
   * Follows three.js 0.187.0's `Matrix4.extractRotation`.
   */
  extractRotation(matrix: Mat4): this {
    if (determinantAffine(matrix.elements) === 0) return this.identity();
    const sx = 1 / axis.setFromMatrixColumn(matrix, 0).length();
    const sy = 1 / axis.setFromMatrixColumn(matrix, 1).length();
    const sz = 1 / axis.setFromMatrixColumn(matrix, 2).length();
    const me = matrix.elements;
    const elements = this.elements;
    for (let i = 0; i < 3; i++) {
      elements[i] = me[i] * sx;
      elements[4 + i] = me[4 + i] * sy;
      elements[8 + i] = me[8 + i] * sz;
    }
    elements[3] = 0;
    elements[7] = 0;
    elements[11] = 0;
    elements[12] = 0;
    elements[13] = 0;
    elements[14] = 0;
    elements[15] = 1;
    return this;
  }

  /** becomes the turn `euler` makes (by way of its quaternion, so its last digits may differ from three's) */
  makeRotationFromEuler(euler: Euler): this {
    return this.makeRotationFromQuaternion(turn.setFromEuler(euler, false));
  }

  /** becomes the turn `quaternion` makes */
  makeRotationFromQuaternion(quaternion: Quat): this {
    return this.compose(origin, quaternion, unit);
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
    const elements = this.elements;
    lookX.toArray(elements, 0);
    lookY.toArray(elements, 4);
    lookZ.toArray(elements, 8);
    return this;
  }

  /** becomes `this × m`: `matrix` applied first */
  multiply(matrix: Mat4): this {
    return this.multiplyMatrices(this, matrix);
  }

  /** becomes `m × this`: this applied first */
  premultiply(matrix: Mat4): this {
    return this.multiplyMatrices(matrix, this);
  }

  /** becomes `a × b` (either may be this matrix) */
  multiplyMatrices(left: Mat4, right: Mat4): this {
    multiplyInto(this.elements, left.elements, right.elements);
    return this;
  }

  /** the determinant */
  determinant(): number {
    return determinant4(this.elements);
  }

  /** rows made columns */
  transpose(): this {
    const elements = this.elements;
    for (let row = 0; row < 4; row++) {
      for (let column = row + 1; column < 4; column++) {
        const held = elements[column * 4 + row];
        elements[column * 4 + row] = elements[row * 4 + column];
        elements[row * 4 + column] = held;
      }
    }
    return this;
  }

  /** sets the translation, from a vector or three numbers */
  setPosition(x: Vec3 | number, y = 0, z = 0): this {
    const elements = this.elements;
    if (typeof x === 'number') {
      elements[12] = x;
      elements[13] = y;
      elements[14] = z;
    } else {
      x.toArray(elements, 12);
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
    const elements = this.elements;
    const sx = elements[0] * elements[0] + elements[1] * elements[1] + elements[2] * elements[2];
    const sy = elements[4] * elements[4] + elements[5] * elements[5] + elements[6] * elements[6];
    const sz = elements[8] * elements[8] + elements[9] * elements[9] + elements[10] * elements[10];
    return Math.sqrt(Math.max(sx, sy, sz));
  }

  /** becomes a move by a vector or three numbers */
  makeTranslation(x: Vec3 | number, y = 0, z = 0): this {
    if (typeof x === 'number') return this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);
    return this.set(1, 0, 0, x.x, 0, 1, 0, x.y, 0, 0, 1, x.z, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about x */
  makeRotationX(theta: number): this {
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    return this.set(1, 0, 0, 0, 0, cosine, -sine, 0, 0, sine, cosine, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about y */
  makeRotationY(theta: number): this {
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    return this.set(cosine, 0, sine, 0, 0, 1, 0, 0, -sine, 0, cosine, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `theta` radians about z */
  makeRotationZ(theta: number): this {
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    return this.set(cosine, -sine, 0, 0, sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  }

  /** becomes a turn of `angle` radians about `axis` (one long) */
  makeRotationAxis(axis: Vec3, angle: number): this {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const versine = 1 - cosine;
    const x = axis.x;
    const y = axis.y;
    const z = axis.z;
    const tx = versine * x;
    const ty = versine * y;
    return this.set(
      tx * x + cosine, tx * y - sine * z, tx * z + sine * y, 0,
      tx * y + sine * z, ty * y + cosine, ty * z - sine * x, 0,
      tx * z - sine * y, ty * z + sine * x, versine * z * z + cosine, 0,
      0, 0, 0, 1,
    );
  }

  /** becomes a scale along each axis */
  makeScale(x: number, y: number, z: number): this {
    return this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1);
  }

  /** becomes the move that scales by `scale`, turns by `quaternion`, then moves to `position` */
  compose(position: Vec3, quaternion: Quat, scale: Vec3): this {
    const elements = this.elements;
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
    elements[0] = (1 - (yy + zz)) * sx;
    elements[1] = (xy + wz) * sx;
    elements[2] = (xz - wy) * sx;
    elements[3] = 0;
    elements[4] = (xy - wz) * sy;
    elements[5] = (1 - (xx + zz)) * sy;
    elements[6] = (yz + wx) * sy;
    elements[7] = 0;
    elements[8] = (xz + wy) * sz;
    elements[9] = (yz - wx) * sz;
    elements[10] = (1 - (xx + yy)) * sz;
    elements[11] = 0;
    elements[15] = 1;
    return this.setPosition(position.x, position.y, position.z);
  }

  /**
   * Writes its move, turn and scale into the three given. Follows three.js 0.187.0's `Matrix4.decompose`: a
   * mirrored matrix's x scale made negative, and a flat one (determinant 0) read as no turn at a scale of 1.
   */
  decompose(position: Vec3, quaternion: Quat, scale: Vec3): this {
    const elements = this.elements;
    position.set(elements[12], elements[13], elements[14]);
    const det = determinantAffine(elements);
    if (det === 0) {
      scale.set(1, 1, 1);
      quaternion.identity();
      return this;
    }
    let sx = axis.set(elements[0], elements[1], elements[2]).length();
    const sy = axis.set(elements[4], elements[5], elements[6]).length();
    const sz = axis.set(elements[8], elements[9], elements[10]).length();
    if (det < 0) sx = -sx;
    const rotation = unscaled.elements;
    const inverseX = 1 / sx;
    const inverseY = 1 / sy;
    const inverseZ = 1 / sz;
    for (let i = 0; i < 3; i++) {
      rotation[i] = elements[i] * inverseX;
      rotation[4 + i] = elements[4 + i] * inverseY;
      rotation[8 + i] = elements[8 + i] * inverseZ;
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

  /** whether `matrix` has the same numbers */
  equals(matrix: Mat4): boolean {
    for (let i = 0; i < 16; i++) {
      if (this.elements[i] !== matrix.elements[i]) return false;
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
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
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
