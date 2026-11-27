// The objects a frame makes the world matrices of, counted as three visits each (`updateMatrixWorld`, which three's
// render calls down the whole scene, hidden parts too). In the village most of the scene stands hidden (the houses'
// rooms, the other biomes, the hall's room), and a walk of all of it was about 1 ms of each frame's render on the CPU
// (`lab perf --village --profile`): a count says how much of the scene a frame walks, exactly, where the ms move with
// the machine's load. The engine's bridge places what's shown itself (`placeShown`) and calls three's walk only for
// an object that overrides it, so under the engine this counts those visits, not every object placed.
import { Node } from './sceneApi.ts';

/** the visits counted since the count began */
let visits = 0;
/** whether three's walk is wrapped yet */
let wrapped = false;

/** Starts counting three's visits of every object (once). */
function wrap(): void {
  if (wrapped) return;
  const walk = Node.prototype.updateMatrixWorld;
  const counted = function counted(this: Node, force?: boolean): void {
    visits++;
    walk.call(this, force);
  };
  // (said to be three's own, so the bridge's placing still takes it for plain: `plainUpdate` in src/engine/bridge.ts)
  Object.assign(counted, { wraps: walk });
  Node.prototype.updateMatrixWorld = counted;
  wrapped = true;
}

/** The visits counted so far, a running count to take differences of. */
export function matrixWalks(): number {
  wrap();
  return visits;
}
