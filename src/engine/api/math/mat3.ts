// A 3 by 3 matrix, as three's `Matrix3`: `elements` column-major, in place and chainable. What the game makes of
// one is a normal matrix (`getNormalMatrix`) and a 4 by 4's upper part.
import type { Mat4 } from './mat4.ts';
import type { NumberArray } from './types.ts';

/** nine numbers, as `Mat3.set` takes them */
export type Mat3Row = [number, number, number, number, number, number, number, number, number];

/** three's `Matrix3` */
export class Mat3 {
  /** the 9 numbers, column by column */
  elements: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /** the identity, or the 9 numbers given row by row (as three's constructor takes them) */
  constructor(...rowMajor: number[]) {
    if (rowMajor.length === 9) this.set(...(rowMajor as Mat3Row));
  }

  /** sets the 9 numbers, given row by row */
  set(...rowMajor: Mat3Row): this {
    const e = this.elements;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) e[column * 3 + row] = rowMajor[row * 3 + column];
    }
    return this;
  }

  /** the identity */
  identity(): this {
    return this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
  }

  /** a new matrix with these numbers */
  clone(): Mat3 {
    return new Mat3().fromArray(this.elements);
  }

  /** takes `m`'s numbers */
  copy(m: Mat3): this {
    return this.fromArray(m.elements);
  }

  /** becomes `m`'s upper 3 by 3 */
  setFromMatrix4(m: Mat4): this {
    const me = m.elements;
    return this.set(me[0], me[4], me[8], me[1], me[5], me[9], me[2], me[6], me[10]);
  }

  /** becomes `this × m` */
  multiply(m: Mat3): this {
    return this.multiplyMatrices(this, m);
  }

  /** becomes `m × this` */
  premultiply(m: Mat3): this {
    return this.multiplyMatrices(m, this);
  }

  /** becomes `a × b` (either may be this matrix) */
  multiplyMatrices(a: Mat3, b: Mat3): this {
    const ae = a.elements.slice(0, 9);
    const be = b.elements.slice(0, 9);
    const e = this.elements;
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 3; row++) {
        const left = ae[row] * be[column * 3];
        const middle = ae[3 + row] * be[column * 3 + 1];
        e[column * 3 + row] = left + middle + ae[6 + row] * be[column * 3 + 2];
      }
    }
    return this;
  }

  /** multiplies each number by `scalar` */
  multiplyScalar(scalar: number): this {
    for (let i = 0; i < 9; i++) this.elements[i] *= scalar;
    return this;
  }

  /** the determinant */
  determinant(): number {
    const e = this.elements;
    const a = e[0] * (e[4] * e[8] - e[7] * e[5]);
    const b = e[3] * (e[1] * e[8] - e[7] * e[2]);
    const c = e[6] * (e[1] * e[5] - e[4] * e[2]);
    return a - b + c;
  }

  /** made its inverse (all zeros where it has none, as three's) */
  invert(): this {
    const e = this.elements;
    const [n11, n21, n31, n12, n22, n32, n13, n23, n33] = e;
    const t11 = n33 * n22 - n32 * n23;
    const t12 = n32 * n13 - n33 * n12;
    const t13 = n23 * n12 - n22 * n13;
    const det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const inverse = 1 / det;
    e[0] = t11 * inverse;
    e[1] = (n31 * n23 - n33 * n21) * inverse;
    e[2] = (n32 * n21 - n31 * n22) * inverse;
    e[3] = t12 * inverse;
    e[4] = (n33 * n11 - n31 * n13) * inverse;
    e[5] = (n31 * n12 - n32 * n11) * inverse;
    e[6] = t13 * inverse;
    e[7] = (n21 * n13 - n23 * n11) * inverse;
    e[8] = (n22 * n11 - n21 * n12) * inverse;
    return this;
  }

  /** rows made columns */
  transpose(): this {
    const e = this.elements;
    for (let row = 0; row < 3; row++) {
      for (let column = row + 1; column < 3; column++) {
        const held = e[column * 3 + row];
        e[column * 3 + row] = e[row * 3 + column];
        e[row * 3 + column] = held;
      }
    }
    return this;
  }

  /** becomes the matrix that turns `m`'s normals: its upper 3 by 3, inverted and transposed */
  getNormalMatrix(m: Mat4): this {
    return this.setFromMatrix4(m).invert().transpose();
  }

  /** whether `m` has the same numbers */
  equals(m: Mat3): boolean {
    for (let i = 0; i < 9; i++) {
      if (this.elements[i] !== m.elements[i]) return false;
    }
    return true;
  }

  /** takes 9 numbers, column by column, from `array` at `offset` */
  fromArray(array: ArrayLike<number>, offset = 0): this {
    for (let i = 0; i < 9; i++) this.elements[i] = array[offset + i];
    return this;
  }

  /** the 9 numbers, column by column, as a new array */
  toArray(): number[];
  /** writes the 9 numbers, column by column, into `array` at `offset` */
  toArray<T extends NumberArray>(array: T, offset?: number): T;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    for (let i = 0; i < 9; i++) array[offset + i] = this.elements[i];
    return array;
  }
}
