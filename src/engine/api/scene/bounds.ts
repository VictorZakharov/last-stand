// A node's box in the world: every mesh under it, each by its geometry's box (or, `precise`, its every vertex) moved
// by its world matrix. Three's `Box3.setFromObject` and `expandByObject`, kept apart from the maths, which know no
// nodes.
import { Box3, Vec3 } from '../math/index.ts';
import type { Mesh } from './mesh.ts';
import type { Node } from './node.ts';

const scratchBox = new Box3();
const scratchPoint = new Vec3();

/** Whether `node` draws a geometry of its own. */
function isMesh(node: Node): node is Mesh {
  return (node as Mesh).isMesh === true;
}

/** `box` grown to hold `node` and everything under it in the world (`precise`: by each vertex, not each geometry's
 *  box turned, which can reach past the vertices); the box. */
export function growByNode(box: Box3, node: Node, precise = false): Box3 {
  node.traverse((each) => {
    if (!isMesh(each)) return;
    const geometry = each.geometry;
    const position = geometry.getAttribute('position');
    if (precise && position) {
      const world = each.matrixWorld;
      for (let i = 0; i < position.count; i++) {
        scratchPoint.fromBufferAttribute(position, i).applyMatrix4(world);
        box.expandByPoint(scratchPoint);
      }
      return;
    }
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    scratchBox.copy(geometry.boundingBox).applyMatrix4(each.matrixWorld);
    box.union(scratchBox);
  });
  return box;
}

/** `box` made the world's box round `node` and everything under it (three's `Box3.setFromObject`); the box. */
export function boundsOf(node: Node, box: Box3 = new Box3(), precise = false): Box3 {
  box.makeEmpty();
  return growByNode(box, node, precise);
}
