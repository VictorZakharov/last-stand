// A node's place, turn and size, whose every write tells the node it moved: a plain Vec3, Quat and Euler given an
// owner (`Watcher`). Their numbers are accessors in the maths' own classes, so a node's vectors are the same shape
// as every other: subclasses of their own made each maths call site meet two shapes, and the hero's IK ran half again
// three's time (`lab perf --wave 36 --throttle 4 --profile=solveArm`).
//
// The turn is held twice, as a quaternion and as angles, and kept in step lazily: a write to one marks the other
// stale, and the other is made again from it when it's next read (`fresh`). Made again at every write, a quaternion
// set a field at a time would be turned into angles from a half-written quaternion, and each would write the other
// back without end.
import { Euler, Quat, Vec3 } from '../math/index.ts';
import type { Watcher } from '../math/types.ts';

/** What a watched value tells of a write, and asks before a read. */
export type Mover = Watcher;

/** A node's position or scale: a vector telling `owner` of every write, at `x, y, z`. */
export function watchedVec3(owner: Mover, x = 0, y = 0, z = 0): Vec3 {
  const vector = new Vec3(x, y, z);
  vector.owner = owner;
  return vector;
}

/** A node's turn: a quaternion telling `owner` of every write, the identity. */
export function watchedQuat(owner: Mover): Quat {
  const turn = new Quat();
  turn.owner = owner;
  return turn;
}

/** A node's turn as Euler angles, telling `owner` of every write, all nought. */
export function watchedEuler(owner: Mover): Euler {
  const angles = new Euler();
  angles.owner = owner;
  return angles;
}
