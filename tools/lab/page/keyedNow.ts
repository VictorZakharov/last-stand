// tools/lab keyed, read off the game: this frame's arm as a swing through the eyes keyed it (`Model.swingKeyed`) and
// as it's drawn, in the eyes' space, for the measure (page/keyed.ts) to judge.
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Lab } from './lab';
import type { KeyedFrame } from './keyed';

/** This frame's keyed arm against the drawn one, or null when no swing keyed one (or the game has no keyed arms). */
export function keyedNow(lab: Lab): KeyedFrame | null {
  const keyed = lab.model.swingKeyed;
  if (!keyed) return null;
  const side = keyed.hand === 'right' ? 'R' : 'L';
  const weapon = keyed.hand === 'right' ? lab.model.tip : lab.model.offTip;
  const grip = weapon?.parent;
  if (!grip) return null;
  const inEyes = (object: THREE.Object3D) => G.camera.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const copy = (at: { x: number; y: number; z: number }) => new THREE.Vector3(at.x, at.y, at.z);
  // (a game from before the keyed arm had a flat and its arm a share keys none, and all of the arm)
  const { flat, armShare } = keyed as Partial<typeof keyed>;
  return {
    hand: keyed.hand,
    weight: keyed.weight,
    armShare: armShare ?? 1,
    keyed: { shoulder: copy(keyed.shoulder), elbow: copy(keyed.elbow), grip: copy(keyed.grip) },
    drawn: {
      shoulder: inEyes(lab.joints[`shoulder${side}`]),
      elbow: inEyes(lab.joints[`elbow${side}`]),
      grip: inEyes(grip),
    },
    keyedWay: copy(keyed.dir),
    drawnWay: axisInEyes(grip, WAY_IN_GRIP),
    keyedFlat: flat ? copy(flat) : null,
    drawnFlat: axisInEyes(grip, FLAT_IN_GRIP),
  };
}

/** a grip's axes, as the hero's hold turns them (models/warrior.ts `holdInView`): the weapon's way along its +Y, the
 *  way its flat faces along its +X (`FLAT_IN_GRIP`) */
const WAY_IN_GRIP = new THREE.Vector3(0, 1, 0);
const FLAT_IN_GRIP = new THREE.Vector3(1, 0, 0);

/** One of a grip's axes in the eyes' space, turned by the grip's turn alone, as the game turns it (the left hand's
 *  grip is mirrored: through its matrix, the left blade's flat read 180 degrees off its keys throughout its cut). */
function axisInEyes(grip: THREE.Object3D, axis: THREE.Vector3): THREE.Vector3 {
  const way = axis.clone().applyQuaternion(grip.getWorldQuaternion(new THREE.Quaternion()));
  return way.transformDirection(G.camera.matrixWorldInverse);
}
