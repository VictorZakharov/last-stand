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
    const elements = this.elements;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) elements[column * 3 + row] = rowMajor[row * 3 + column];
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

  /** takes `matrix`'s numbers */
  copy(matrix: Mat3): this {
    return this.fromArray(matrix.elements);
  }

  /** becomes `matrix`'s upper 3 by 3 */
  setFromMatrix4(matrix: Mat4): this {
    const me = matrix.elements;
    return this.set(me[0], me[4], me[8], me[1], me[5], me[9], me[2], me[6], me[10]);
  }

  /** becomes `this × m` */
  multiply(matrix: Mat3): this {
    return this.multiplyMatrices(this, matrix);
  }

  /** becomes `m × this` */
  premultiply(matrix: Mat3): this {
    return this.multiplyMatrices(matrix, this);
  }

  /** becomes `a × b` (either may be this matrix) */
  multiplyMatrices(left: Mat3, right: Mat3): this {
    const ae = left.elements.slice(0, 9);
    const be = right.elements.slice(0, 9);
    const elements = this.elements;
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 3; row++) {
        const left = ae[row] * be[column * 3];
        const middle = ae[3 + row] * be[column * 3 + 1];
        elements[column * 3 + row] = left + middle + ae[6 + row] * be[column * 3 + 2];
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
    const elements = this.elements;
    const first = elements[0] * (elements[4] * elements[8] - elements[7] * elements[5]);
    const second = elements[3] * (elements[1] * elements[8] - elements[7] * elements[2]);
    const third = elements[6] * (elements[1] * elements[5] - elements[4] * elements[2]);
    return first - second + third;
  }

  /** made its inverse (all zeros where it has none, as three's) */
  invert(): this {
    const elements = this.elements;
    const [n11, n21, n31, n12, n22, n32, n13, n23, n33] = elements;
    const t11 = n33 * n22 - n32 * n23;
    const t12 = n32 * n13 - n33 * n12;
    const t13 = n23 * n12 - n22 * n13;
    const det = n11 * t11 + n21 * t12 + n31 * t13;
    if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const inverse = 1 / det;
    elements[0] = t11 * inverse;
    elements[1] = (n31 * n23 - n33 * n21) * inverse;
    elements[2] = (n32 * n21 - n31 * n22) * inverse;
    elements[3] = t12 * inverse;
    elements[4] = (n33 * n11 - n31 * n13) * inverse;
    elements[5] = (n31 * n12 - n32 * n11) * inverse;
    elements[6] = t13 * inverse;
    elements[7] = (n21 * n13 - n23 * n11) * inverse;
    elements[8] = (n22 * n11 - n21 * n12) * inverse;
    return this;
  }

  /** rows made columns */
  transpose(): this {
    const elements = this.elements;
    for (let row = 0; row < 3; row++) {
      for (let column = row + 1; column < 3; column++) {
        const held = elements[column * 3 + row];
        elements[column * 3 + row] = elements[row * 3 + column];
        elements[row * 3 + column] = held;
      }
    }
    return this;
  }

  /** becomes the matrix that turns `matrix`'s normals: its upper 3 by 3, inverted and transposed */
  getNormalMatrix(matrix: Mat4): this {
    return this.setFromMatrix4(matrix).invert().transpose();
  }

  /** whether `matrix` has the same numbers */
  equals(matrix: Mat3): boolean {
    for (let i = 0; i < 9; i++) {
      if (this.elements[i] !== matrix.elements[i]) return false;
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
  toArray<Out extends NumberArray>(array: Out, offset?: number): Out;
  toArray(array: NumberArray = [], offset = 0): NumberArray {
    for (let i = 0; i < 9; i++) array[offset + i] = this.elements[i];
    return array;
  }
}
