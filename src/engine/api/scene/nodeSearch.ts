// Finding a node in a tree of them (`Node.getObjectByName`, `getObjectByProperty`, `getObjectById`).
import type { Node } from './node.ts';

/** The first node `found` holds of, `node` itself or under it, parents first and children in order. */
export function firstUnder(node: Node, found: (candidate: Node) => boolean): Node | undefined {
  if (found(node)) return node;
  for (const child of node.children) {
    const under = firstUnder(child, found);
    if (under) return under;
  }
  return undefined;
}
