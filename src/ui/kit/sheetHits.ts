// The pointer over a sheet's tree (`sheet.ts`): which of its elements is drawn under a point, and each node's
// `:hover` and `:active` as the pointer stands.
import type { Node } from './sheetNode';

/** The deepest element taking the pointer drawn under (`x`, `y`) css px in `root`'s tree (the last drawn of those
 *  that meet). */
export function elementUnder(root: Node, x: number, y: number): Element | null {
  // (a lifted node is drawn over the whole screen, so over its parent's later siblings too: tried first, the last
  // drawn first; tried among its own siblings alone, the bug report's picture lifted over the column after its own
  // lost its tick's press to what lay under it)
  const lifted: Node[] = [];
  gatherLifted(root, lifted);
  for (let at = lifted.length - 1; at >= 0; at--) {
    const found = hitIn(lifted[at], x, y);
    if (found) return found;
  }
  return hitIn(root, x, y);
}

/** The nodes in `node`'s tree lifted over the screen (`lift`), in the order they're drawn. */
function gatherLifted(node: Node, lifted: Node[]): void {
  if (node.anchor) lifted.push(node);
  for (const kid of node.kids) gatherLifted(kid, lifted);
}

/** The deepest element taking the pointer under (`x`, `y`) in `node` or what's in it. */
function hitIn(node: Node, x: number, y: number): Element | null {
  if (!node.panel.seen || (node.anchor && !node.anchor.seen)) return null;
  const box = node.panel.rect();
  const inside = !!box && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h;
  // (what's in a box may reach past it, unless it's cut there)
  if (!inside && node.panel.styled.overflow && node.panel.styled.overflow !== 'visible') return null;
  // (the lifted first, drawn over the rest)
  const order = [...node.kids].sort((a, b) => Number(!!b.anchor) - Number(!!a.anchor) || 0);
  for (let at = order.length - 1; at >= 0; at--) {
    const found = hitIn(order[at], x, y);
    if (found) return found;
  }
  return inside && node.hits ? node.element : null;
}

/** Each node in `node`'s tree shown as the pointer stands: over it or what's in it (CSS's `:hover`), pressing it
 *  (`:active`); whether any node's state changed. */
export function showHovers(node: Node, over: Element | null, pressed: Element | null): boolean {
  const hovered = !!over && node.element.contains(over);
  const state = hovered ? (pressed && node.element.contains(pressed) ? 'down' : 'hover') : 'none';
  let changed = state !== node.state;
  node.state = state;
  for (const kid of node.kids) changed = showHovers(kid, over, pressed) || changed;
  return changed;
}
