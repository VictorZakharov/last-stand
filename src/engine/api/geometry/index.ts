// The geometry: attributes, geometries, and what's done to whole ones.
export { Attribute, InstancedAttribute, STATIC_DRAW_USAGE, copyOf, floats, indexOf, sameKind } from './attribute.ts';
export type { TypedArray, UpdateRange } from './attribute.ts';
export { Geometry, InstancedGeometry } from './geometry.ts';
export type { DrawRange, Group, PointLike } from './geometry.ts';
export { normals, unitNormals } from './normals.ts';
export { mergeGeometries, mergeVertices, unindexed } from './ops.ts';
export { convexHull } from './hull.ts';
