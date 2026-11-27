// The scene API's names bound to three.js, for an A/B's other side alone: a commit from before Bulwark's API
// (VictorZakharov/last-stand#973), whose game is three's. The lab's measures import the API from `sceneApi.ts`; in
// such a tree the lab's Vite plugin resolves that module's two re-exports here and to `threeShapes.js`
// (`exportedTreePaths` in node/commits.mjs), so a measure runs on either side as it's written. Plain JavaScript,
// never typechecked: this tree has no three to check it against, and the other tree never typechecks the lab.
// Only what the measures use is bound; a name left out is undefined there, and a measure using it fails on that side.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export * from 'three';
export * from './threeShapes.js';
export { mergeGeometries, mergeVertices };

// (the maths)
export const Vec2 = THREE.Vector2;
export const Vec3 = THREE.Vector3;
export const Vec4 = THREE.Vector4;
export const Quat = THREE.Quaternion;
export const Mat3 = THREE.Matrix3;
export const Mat4 = THREE.Matrix4;
export const Maths = THREE.MathUtils;
export const toHalfFloat = THREE.DataUtils.toHalfFloat;
export const fromHalfFloat = THREE.DataUtils.fromHalfFloat;

// (the scene)
export const Node = THREE.Object3D;
export const World = THREE.Scene;
export const OrthoCamera = THREE.OrthographicCamera;

// (geometry)
export const Geometry = THREE.BufferGeometry;
export const Attribute = THREE.BufferAttribute;
export const InstancedAttribute = THREE.InstancedBufferAttribute;
export const InstancedGeometry = THREE.InstancedBufferGeometry;

/** A float attribute of `values`, `itemSize` a vertex (the API's `floats`). */
export function floats(values, itemSize) {
  return new THREE.Float32BufferAttribute(values, itemSize);
}

/** `geometry` laid out a vertex a corner (the API's `unindexed`). */
export function unindexed(geometry) {
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

/** The convex hull of `points` (the API's `convexHull`). */
export function convexHull(points) {
  return new ConvexGeometry(points);
}

/** `box` made the world's box round `node` (the API's `boundsOf`). */
export function boundsOf(node, box = new THREE.Box3(), precise = false) {
  return box.setFromObject(node, precise);
}

/** `box` grown to hold `node` (the API's `growByNode`). */
export function growByNode(box, node, precise = false) {
  return box.expandByObject(node, precise);
}

// (materials and textures)
export const LitMaterial = THREE.MeshStandardMaterial;
export const UnlitMaterial = THREE.MeshBasicMaterial;
export const LookMaterial = THREE.ShaderMaterial;
export const LineMaterial = THREE.LineBasicMaterial;
export const VolumeTexture = THREE.Data3DTexture;
