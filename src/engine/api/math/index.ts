// The maths of the engine's API: value classes in place and chainable as three's, by the names the rename table
// gives (`Vector3` is `Vec3`, `MathUtils` is `Maths`...), and the types the game names with them.
export { Box2 } from './box2.ts';
export { Box3 } from './box3.ts';
export { Color, linearToSrgb, srgbToLinear } from './color.ts';
export type { ColorRepresentation, ColorSpaceName, HSL } from './color.ts';
export { Euler } from './euler.ts';
export type { EulerOrder } from './euler.ts';
export { Frustum } from './frustum.ts';
export { fromHalfFloat, toHalfFloat } from './halfFloat.ts';
export { Line3 } from './line3.ts';
export { Mat3 } from './mat3.ts';
export type { Mat3Row } from './mat3.ts';
export { Mat4 } from './mat4.ts';
export type { Mat4Row } from './mat4.ts';
export { Maths } from './maths.ts';
export { Plane } from './plane.ts';
export { Quat } from './quat.ts';
export { Ray } from './ray.ts';
export { Sphere } from './sphere.ts';
export { Spherical } from './spherical.ts';
export { Triangle } from './triangle.ts';
export type { Blendable } from './triangle.ts';
export { Vec2 } from './vec2.ts';
export { Vec3 } from './vec3.ts';
export { Vec4 } from './vec4.ts';
export { WebGLCoordinateSystem, WebGPUCoordinateSystem } from './types.ts';
export type {
  AttributeLike, CoordinateSystem, NumberArray, ProjectingCamera, Vec2Tuple, Vec3Tuple, Vec4Tuple,
} from './types.ts';
