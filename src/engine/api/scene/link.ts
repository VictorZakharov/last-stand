// What a node tells the engine's stage as it changes (`../stage.ts`), kept apart so the scene imports nothing of the
// engine: a world shown by the stage hands its link to everything under it, and a node with no link (a template, a
// sample not yet shown) tells nobody.
import type { Node } from './node.ts';

/** The stage's side of a node: told only of what changed, never asked each frame. */
export interface StageLink {
  /** `node`'s place, turn, size or matrix changed. */
  moved(node: Node): void;
  /** `node` was shown or hidden. */
  shown(node: Node): void;
  /** `node` and everything under it came under a shown world. */
  entered(node: Node): void;
  /** `node` and everything under it left a shown world. */
  left(node: Node): void;
  /** `node` hangs under another parent within the same shown world. */
  reparented(node: Node): void;
  /** what `node` draws changed: its geometry, its material, how it casts, its layers, its order. */
  redraw(node: Node): void;
}

/** no node in the engine: a root's parent, a node not under a shown world (`nodes::NONE` in the engine) */
export const NONE = 0xffffffff;
