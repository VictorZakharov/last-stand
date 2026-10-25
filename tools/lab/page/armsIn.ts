// tools/lab arms in the body: through the eyes, how far each arm's upper arm, forearm and hand pass into the body the
// view hides (models/anatomy.ts `bodyShape`, `overlaps`), as the game's lower hand on a two-hander reads its own
// (models/warrior.ts: a grip it reaches only through the body, it lets go of). Said, not failed: through the eyes the
// shoulders are placed under the camera, not where that body has them (`armsFromBelow`), and nothing of the body is
// drawn, so an arm in it is in nothing the player sees (the two-hander's guard read its right forearm 17.6 cm into the
// chest, from the first frame). Read it where a pose's arm is in question: a left forearm across the belly is a lower
// hand about to let go. The canary moves the right elbow into the chest, which must read deep in it.
import * as THREE from 'three';
import { bodyShape, overlaps } from '../../../src/entities/models/anatomy';
import type { Joints } from '../../../src/entities/models/rig';
import { drawnHand } from './range';

/** An arm's deepest part in the body on a frame: its side, the part and the solid it's in, how deep (the rig's
 *  units, as `overlaps` and the game's lower hand read it: the hero is drawn a tenth larger). */
export interface ArmIn { side: 'L' | 'R'; limb: string; solid: string; depth: number }

/** a frame numbered, with its arms in the body */
export interface ArmsInSeen { frame: number; inBody: readonly ArmIn[] }

/** an arm further into the body than this (the rig's units) is counted: the game's own lower hand lets go of a
 *  two-hander's grip it reaches only that deep */
const IN_BODY_PAST = 0.03;
/** the canary's right elbow in the chest must read at least this deep (the rig's units) */
const CANARY_DEEP = 0.1;

/** Each arm's deepest part in the body now (none for an arm clear of it), the joints posed and drawn as they are. */
export function armsInBody(joints: Joints): ArmIn[] {
  joints.root.updateMatrixWorld(true);
  const shape = bodyShape(joints, { L: drawnHand(joints.handL), R: drawnHand(joints.handR) });
  const deepest = new Map<'L' | 'R', ArmIn>();
  for (const overlap of overlaps(shape)) {
    const side = overlap.limb.endsWith('L') ? 'L' : 'R';
    const was = deepest.get(side);
    if (!was || overlap.depth > was.depth) deepest.set(side, { side, ...overlap });
  }
  return [...deepest.values()];
}

/** The arms in the body over a run's frames, as a line under `heading`: each arm's deepest and where, and on how
 *  many frames it was past `IN_BODY_PAST`. */
export function describeArmsIn(
  seen: readonly ArmsInSeen[], heading = 'the arms in the body the view hides (said, not failed)',
): string {
  const words = (['R', 'L'] as const).map((side) => {
    const arm = side === 'R' ? 'the right arm' : 'the left arm';
    const frames = seen.flatMap((now) => now.inBody.filter((arm) => arm.side === side).map((arm) => ({ now, arm })));
    if (frames.length === 0) return `${arm} clear of it`;
    const worst = frames.reduce((most, next) => (next.arm.depth > most.arm.depth ? next : most));
    const where = `its ${worst.arm.limb.replace(/ [LR]$/, '')} in the ${worst.arm.solid}`;
    const past = frames.filter((frame) => frame.arm.depth > IN_BODY_PAST);
    const first = past.slice(0, 6).map((frame) => frame.now.frame).join(', ');
    const listed = past.length ? ` (${first}${past.length > 6 ? '...' : ''})` : '';
    const counted = `past ${centimetres(IN_BODY_PAST)} on ${past.length} frames${listed}`;
    return `${arm} up to ${centimetres(worst.arm.depth)} into it (frame ${worst.now.frame}, ${where}), ${counted}`;
  });
  return `${heading}: ${words.join('; ')}`;
}

/** The deepest any arm is in the body now (the rig's units: 0 when both are clear of it). */
export const deepestArm = (inBody: readonly ArmIn[]): number => Math.max(0, ...inBody.map((arm) => arm.depth));

/** A depth as words, in cm. */
const centimetres = (depth: number) => `${(depth * 100).toFixed(1)} cm`;

/** The canary: the right arm moved bodily so its elbow is at the chest's middle, its forearm inside, read, and put
 *  back. As words, `caught ...` or `missed ...`: caught when the right arm reads at least `CANARY_DEEP` in. (Moved by
 *  its shoulder alone, only its upper arm was in, which is judged against the head alone: read 2.9 cm.) */
export function armsInCanary(joints: Joints): string {
  const shoulder = joints.shoulderR;
  const was = shoulder.position.clone();
  joints.root.updateMatrixWorld(true);
  const middle = joints.chest.getWorldPosition(new THREE.Vector3());
  const elbow = joints.elbowR.getWorldPosition(new THREE.Vector3());
  const at = shoulder.getWorldPosition(new THREE.Vector3()).add(middle).sub(elbow);
  shoulder.position.copy(shoulder.parent!.worldToLocal(at));
  const right = armsInBody(joints).find((arm) => arm.side === 'R');
  shoulder.position.copy(was);
  joints.root.updateMatrixWorld(true);
  const deep = right?.depth ?? 0;
  const read = `the right elbow moved into the chest read the arm ${centimetres(deep)} into the body`;
  return `${deep >= CANARY_DEEP ? 'caught' : 'missed'}: ${read}`;
}
