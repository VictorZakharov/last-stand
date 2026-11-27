// A node's own state copied onto another (`Node.copy`), out of `node.ts` to keep it short.
import type { Node } from './node.ts';

/** `source`'s own state copied onto `target` (its children too, cloned, where `recursive`). */
export function copyNode(target: Node, source: Node, recursive: boolean): void {
  target.name = source.name;
  target.up.copy(source.up);
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  // (frozen first, its matrix after: freezing makes the matrix from its place, and a frozen source's own is kept)
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.matrix.copy(source.matrix);
  target.matrixWorldAutoUpdate = source.matrixWorldAutoUpdate;
  target.layers.mask = source.layers.mask;
  target.visible = source.visible;
  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;
  target.frustumCulled = source.frustumCulled;
  target.renderOrder = source.renderOrder;
  // (as three copies it: what JSON keeps, functions and references dropped)
  target.userData = JSON.parse(JSON.stringify(source.userData));
  if (recursive) for (const child of source.children) target.add(child.clone());
}
