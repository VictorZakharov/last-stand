// The shapes the maths reads from outside it: an attribute (the geometry's), a camera (the scene's), an array to
// write into. Structural, so `math/` imports nothing of the folders built on it.
import type { Mat4 } from './mat4.ts';

/** anything a vector writes its numbers into: a plain array or a typed one */
export interface NumberArray {
  [index: number]: number;
}

/** a geometry attribute as the maths reads it (`fromBufferAttribute`, `Box3.setFromBufferAttribute`) */
export interface AttributeLike {
  /** how many items it holds */
  readonly count: number;
  /** the item's first component */
  getX(index: number): number;
  /** the item's second component */
  getY(index: number): number;
  /** the item's third component */
  getZ(index: number): number;
  /** the item's fourth component */
  getW(index: number): number;
}

/** a camera as `Vec3.project` and `unproject` read it */
export interface ProjectingCamera {
  /** where the camera stands in the world */
  readonly matrixWorld: Mat4;
  /** the world as the camera sees it */
  readonly matrixWorldInverse: Mat4;
  /** the camera's projection */
  readonly projectionMatrix: Mat4;
  /** the projection undone */
  readonly projectionMatrixInverse: Mat4;
}

/** three's `Vector2Tuple` */
export type Vec2Tuple = [number, number];
/** three's `Vector3Tuple` */
export type Vec3Tuple = [number, number, number];
/** three's `Vector4Tuple` */
export type Vec4Tuple = [number, number, number, number];

/** three's `WebGLCoordinateSystem`: clip depth from -1 to 1 */
export const WebGLCoordinateSystem = 2000;
/** three's `WebGPUCoordinateSystem`: clip depth from 0 to 1 */
export const WebGPUCoordinateSystem = 2001;
/** which clip space a projection or a frustum is made for */
export type CoordinateSystem = typeof WebGLCoordinateSystem | typeof WebGPUCoordinateSystem;
