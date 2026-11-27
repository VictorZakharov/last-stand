// `Mat4`'s longer sums, on its column-major elements alone: the product, the determinant, the inverse, the
// projections. Kept apart so `mat4.ts` stays a class of short methods.
import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from './types.ts';
import type { CoordinateSystem } from './types.ts';

/** a matrix's 16 numbers, column by column */
export type Elements = number[];

/** writes `a × b` into `out` (any of the three may be the same array); allocates nothing */
export function multiplyInto(out: Elements, a: Elements, b: Elements): void {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];
  const a6 = a[6];
  const a7 = a[7];
  const a8 = a[8];
  const a9 = a[9];
  const a10 = a[10];
  const a11 = a[11];
  const a12 = a[12];
  const a13 = a[13];
  const a14 = a[14];
  const a15 = a[15];
  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];
  const b6 = b[6];
  const b7 = b[7];
  const b8 = b[8];
  const b9 = b[9];
  const b10 = b[10];
  const b11 = b[11];
  const b12 = b[12];
  const b13 = b[13];
  const b14 = b[14];
  const b15 = b[15];
  out[0] = a0 * b0 + a4 * b1 + a8 * b2 + a12 * b3;
  out[1] = a1 * b0 + a5 * b1 + a9 * b2 + a13 * b3;
  out[2] = a2 * b0 + a6 * b1 + a10 * b2 + a14 * b3;
  out[3] = a3 * b0 + a7 * b1 + a11 * b2 + a15 * b3;
  out[4] = a0 * b4 + a4 * b5 + a8 * b6 + a12 * b7;
  out[5] = a1 * b4 + a5 * b5 + a9 * b6 + a13 * b7;
  out[6] = a2 * b4 + a6 * b5 + a10 * b6 + a14 * b7;
  out[7] = a3 * b4 + a7 * b5 + a11 * b6 + a15 * b7;
  out[8] = a0 * b8 + a4 * b9 + a8 * b10 + a12 * b11;
  out[9] = a1 * b8 + a5 * b9 + a9 * b10 + a13 * b11;
  out[10] = a2 * b8 + a6 * b9 + a10 * b10 + a14 * b11;
  out[11] = a3 * b8 + a7 * b9 + a11 * b10 + a15 * b11;
  out[12] = a0 * b12 + a4 * b13 + a8 * b14 + a12 * b15;
  out[13] = a1 * b12 + a5 * b13 + a9 * b14 + a13 * b15;
  out[14] = a2 * b12 + a6 * b13 + a10 * b14 + a14 * b15;
  out[15] = a3 * b12 + a7 * b13 + a11 * b14 + a15 * b15;
}

/**
 * The 2 by 2 minors of a matrix's top two rows (`s0` to `s5`) and bottom two (`c0` to `c5`), each by a pair of
 * columns (01, 02, 03, 12, 13, 23), from which both the determinant and the inverse are made (Laplace's
 * expansion by complementary minors). One array, written again by each call: the products allocate nothing.
 */
const minors = new Float64Array(12);

/** the pairs of columns the minors are of, in their order */
const PAIRS = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];

/** writes `e`'s minors into `minors` */
function fillMinors(e: Elements): void {
  for (let i = 0; i < 6; i++) {
    const c0 = PAIRS[i * 2] * 4;
    const c1 = PAIRS[i * 2 + 1] * 4;
    minors[i] = e[c0] * e[c1 + 1] - e[c1] * e[c0 + 1];
    minors[i + 6] = e[c0 + 2] * e[c1 + 3] - e[c1 + 2] * e[c0 + 3];
  }
}

/** the determinant from the minors last filled */
function determinantOfMinors(): number {
  const s = minors;
  return s[0] * s[11] - s[1] * s[10] + s[2] * s[9] + s[3] * s[8] - s[4] * s[7] + s[5] * s[6];
}

/** the determinant of a 4 by 4 */
export function determinant4(e: Elements): number {
  fillMinors(e);
  return determinantOfMinors();
}

/** the determinant of the upper 3 by 3 (an affine matrix's own) */
export function determinantAffine(e: Elements): number {
  const a = e[0] * (e[5] * e[10] - e[9] * e[6]);
  const b = e[4] * (e[1] * e[10] - e[9] * e[2]);
  const c = e[8] * (e[1] * e[6] - e[5] * e[2]);
  return a - b + c;
}

/** writes the inverse of `e` into it (its adjugate over its determinant), or zeros where it has none, as three */
export function invertInPlace(e: Elements): void {
  fillMinors(e);
  const det = determinantOfMinors();
  if (det === 0) {
    e.fill(0);
    return;
  }
  const inverse = 1 / det;
  const s0 = minors[0] * inverse;
  const s1 = minors[1] * inverse;
  const s2 = minors[2] * inverse;
  const s3 = minors[3] * inverse;
  const s4 = minors[4] * inverse;
  const s5 = minors[5] * inverse;
  const c0 = minors[6] * inverse;
  const c1 = minors[7] * inverse;
  const c2 = minors[8] * inverse;
  const c3 = minors[9] * inverse;
  const c4 = minors[10] * inverse;
  const c5 = minors[11] * inverse;
  const a00 = e[0];
  const a10 = e[1];
  const a20 = e[2];
  const a30 = e[3];
  const a01 = e[4];
  const a11 = e[5];
  const a21 = e[6];
  const a31 = e[7];
  const a02 = e[8];
  const a12 = e[9];
  const a22 = e[10];
  const a32 = e[11];
  const a03 = e[12];
  const a13 = e[13];
  const a23 = e[14];
  const a33 = e[15];
  e[0] = a11 * c5 - a12 * c4 + a13 * c3;
  e[4] = -a01 * c5 + a02 * c4 - a03 * c3;
  e[8] = a31 * s5 - a32 * s4 + a33 * s3;
  e[12] = -a21 * s5 + a22 * s4 - a23 * s3;
  e[1] = -a10 * c5 + a12 * c2 - a13 * c1;
  e[5] = a00 * c5 - a02 * c2 + a03 * c1;
  e[9] = -a30 * s5 + a32 * s2 - a33 * s1;
  e[13] = a20 * s5 - a22 * s2 + a23 * s1;
  e[2] = a10 * c4 - a11 * c2 + a13 * c0;
  e[6] = -a00 * c4 + a01 * c2 - a03 * c0;
  e[10] = a30 * s4 - a31 * s2 + a33 * s0;
  e[14] = -a20 * s4 + a21 * s2 - a23 * s0;
  e[3] = -a10 * c3 + a11 * c1 - a12 * c0;
  e[7] = a00 * c3 - a01 * c1 + a02 * c0;
  e[11] = -a30 * s3 + a31 * s1 - a32 * s0;
  e[15] = a20 * s3 - a21 * s1 + a22 * s0;
}

/** the depth terms of a projection: clip z = `scale` × view z + `offset` (perspective: over -view z) */
interface Depth {
  scale: number;
  offset: number;
}

/** a perspective's depth terms for `near` and `far` in a coordinate system */
function perspectiveDepth(near: number, far: number, system: CoordinateSystem, reversed: boolean): Depth {
  const span = far - near;
  if (reversed) return { scale: near / span, offset: far * near / span };
  if (system === WebGLCoordinateSystem) return { scale: -(far + near) / span, offset: -2 * far * near / span };
  if (system === WebGPUCoordinateSystem) return { scale: -far / span, offset: -far * near / span };
  throw new Error('Mat4.makePerspective: unknown coordinate system: ' + system);
}

/** an orthographic projection's depth terms for `near` and `far` in a coordinate system */
function orthographicDepth(near: number, far: number, system: CoordinateSystem, reversed: boolean): Depth {
  const span = far - near;
  if (reversed) return { scale: 1 / span, offset: far / span };
  if (system === WebGLCoordinateSystem) return { scale: -2 / span, offset: -(far + near) / span };
  if (system === WebGPUCoordinateSystem) return { scale: -1 / span, offset: -near / span };
  throw new Error('Mat4.makeOrthographic: unknown coordinate system: ' + system);
}

/** the sides of a view's box at its near plane, and its depth */
export interface ViewBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/**
 * Writes a perspective projection into `e`. Follows three.js 0.187.0's `Matrix4.makePerspective` (its
 * coordinate systems' depth ranges and its reversed depth).
 */
export function perspective(e: Elements, box: ViewBox, system: CoordinateSystem, reversed: boolean): void {
  const depth = perspectiveDepth(box.near, box.far, system, reversed);
  const width = box.right - box.left;
  const height = box.top - box.bottom;
  e.fill(0);
  e[0] = 2 * box.near / width;
  e[5] = 2 * box.near / height;
  e[8] = (box.right + box.left) / width;
  e[9] = (box.top + box.bottom) / height;
  e[10] = depth.scale;
  e[11] = -1;
  e[14] = depth.offset;
}

/**
 * Writes an orthographic projection into `e`. Follows three.js 0.187.0's `Matrix4.makeOrthographic` (its
 * coordinate systems' depth ranges and its reversed depth).
 */
export function orthographic(e: Elements, box: ViewBox, system: CoordinateSystem, reversed: boolean): void {
  const depth = orthographicDepth(box.near, box.far, system, reversed);
  const width = box.right - box.left;
  const height = box.top - box.bottom;
  e.fill(0);
  e[0] = 2 / width;
  e[5] = 2 / height;
  e[10] = depth.scale;
  e[12] = -(box.right + box.left) / width;
  e[13] = -(box.top + box.bottom) / height;
  e[14] = depth.offset;
  e[15] = 1;
}
