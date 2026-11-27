// A node's sums in space, apart from its own bookkeeping (`node.ts`): its matrix in the world read as its parts
// (its turn, its size, its facing), the turn that faces it at a point (`Node.lookAt`), turns and moves along its
// own axes, and where it stands under a new parent to stay put in the world (`Node.attach`).
import { Mat4, Quat, Vec3 } from '../math/index.ts';
import type { Node } from './node.ts';

const scratchMatrix = new Mat4();
const scratchParentTurn = new Quat();
const scratchPlace = new Vec3();
const scratchSize = new Vec3();
const scratchTurn = new Quat();
const scratchAxis = new Vec3();

/** `node`'s turn in the world, into `target`. */
export function worldTurnOf(node: Node, target: Quat): Quat {
  node.matrixWorld.decompose(scratchPlace, target, scratchSize);
  return target;
}

/** `node`'s size in the world, into `target`. */
export function worldSizeOf(node: Node, target: Vec3): Vec3 {
  node.matrixWorld.decompose(scratchPlace, scratchTurn, target);
  return target;
}

/** The way `node`'s +z faces in the world, into `target`. */
export function worldFacingOf(node: Node, target: Vec3): Vec3 {
  const elements = node.matrixWorld.elements;
  return target.set(elements[8], elements[9], elements[10]).normalize();
}

/** `node` turned about its own `axis` (a unit vector) by `angle`; the node. */
export function turnedAbout<Turned extends Node>(node: Turned, axis: Vec3, angle: number): Turned {
  scratchTurn.setFromAxisAngle(axis, angle);
  node.quaternion.multiply(scratchTurn);
  return node;
}

/** `node` moved `distance` along its own `axis` (a unit vector, turned as it's turned); the node. */
export function movedAlong<Moved extends Node>(node: Moved, axis: Vec3, distance: number): Moved {
  node.position.addScaledVector(scratchAxis.copy(axis).applyQuaternion(node.quaternion), distance);
  return node;
}

/** Where `node` stands under `parent` to stay where it stands in the world (`Node.attach`): its place, turn and
 *  size under `parent`, into `place`, `turn` and `size`. Its own matrix is made from its parts first where they
 *  make it, as three's `attach` does. */
export function placedUnder(parent: Node, node: Node, place: Vec3, turn: Quat, size: Vec3): void {
  scratchMatrix.copy(parent.matrixWorld).invert();
  if (node.parent) scratchMatrix.multiply(node.parent.matrixWorld);
  // (its own matrix under its old parent, which `scratchMatrix` already holds: its world would count that parent
  // twice)
  if (node.matrixAutoUpdate) node.matrix.compose(node.position, node.quaternion, node.scale);
  node.matrix.premultiply(scratchMatrix);
  node.matrix.decompose(place, turn, size);
}

/** The turn under its parent that has `node` face `point` (a point in the world) by its +z, or by its −z where
 *  `byMinusZ` (a camera, a light), its `up` kept up; into `target`. As three's `Object3D.lookAt`. */
export function turnFacing(node: Node, point: Vec3, byMinusZ: boolean, target: Quat): Quat {
  node.getWorldPosition(scratchPlace);
  if (byMinusZ) scratchMatrix.lookAt(scratchPlace, point, node.up);
  else scratchMatrix.lookAt(point, scratchPlace, node.up);
  target.setFromRotationMatrix(scratchMatrix);
  if (node.parent) {
    worldTurnOf(node.parent, scratchParentTurn);
    target.premultiply(scratchParentTurn.invert());
  }
  return target;
}
