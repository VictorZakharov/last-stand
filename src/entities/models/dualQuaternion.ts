// Dual-quaternion skinning for a skinned material: each vertex's bones are blended as turns and moves, not as
// matrices. Matrices blended (linear skinning) pull a vertex shared by two bones through their axis as one of them
// twists: the thumb, a half turn round its length as it closes over a handle, folded its glove into a fin across the
// web and creased the thenar. Blended as dual quaternions, a vertex halfway goes halfway round. The engine skins a
// material marked here so (engine/materials.ts); the game only marks it.
import { Material } from '../../engine/api/index.ts';

/** the materials marked here */
const MARKED = new WeakSet<Material>();

/** `material` skinned by dual quaternions; it's returned. */
export function dualQuaternionSkinned<T extends Material>(material: T): T {
  MARKED.add(material);
  return material;
}

/** Whether `material` is skinned by dual quaternions (the lab draws a mesh's parts in flat colours skinned as it is). */
export const isDualQuaternionSkinned = (material: Material) => MARKED.has(material);
