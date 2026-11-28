// A node's turn as angles, whose every write tells the node: an Euler given an owner (`Watcher`), its accessors
// the Euler's own. A node's place, turn and size are plain vectors, its moves found by comparing their numbers
// (`node.ts`, `../stage.ts`): watched vectors were a second shape of `Vec3` and `Quat`, and every maths call site that
// met both ran polymorphic (V8: a loop of copies and turns 13.5 ms with plain vectors alone, 21.2 with watched ones
// mixed in).
import { Euler } from '../math/index.ts';
import type { Watcher } from '../math/types.ts';

/** What a node's angles tell of a write, and ask before a read. */
export type Mover = Watcher;

/** A node's turn as Euler angles, telling `owner` of every write, all nought. */
export function watchedEuler(owner: Mover): Euler {
  const angles = new Euler();
  angles.owner = owner;
  return angles;
}
