// An example probe (tools/lab/README.md, "Writing a measure"): how far each hand moves a frame against the hips,
// standing and then walking. npm run lab -- probe tools/lab/examples/handSpeed.ts --canary
//
// It shows a measure's parts: the lab sets the run up first (the probe's options are the command's), the frames run
// with the player's input and are measured as they would be drawn, the state measured is checked to have happened
// (he walked), and a canary plants a fault the measure must catch (one frame's left hand moved 10 cm).
import * as THREE from 'three';
import type { Lab, Report } from '../page/lab';

const STAND_FRAMES = 60;
const WALK_FRAMES = 90;
/** with --canary: the frame whose left hand is moved for its measure alone, and how far (m) */
const PLANTED_FRAME = 100;
const PLANTED_MOVE = 0.1;

type Side = 'left' | 'right';

interface Options {
  canary?: boolean;
}

/** A hand's fastest frame. */
interface Fastest {
  move: number;
  frame: number;
}

/**
 * Where a joint is in the hips' frame, m: how the body moves it, not how far the body went or turned (pressing `w`,
 * he turns to the way he goes, and in the world his hands swept 23 cm in a frame).
 */
function inHips(lab: Lab, joint: THREE.Object3D): THREE.Vector3 {
  const hips = lab.joints.hips;
  const scale = hips.getWorldScale(new THREE.Vector3()).x;
  return hips.worldToLocal(joint.getWorldPosition(new THREE.Vector3())).multiplyScalar(scale);
}

/** Moves `joint` by `metres` in the world along its parent's x; returns the undo. */
function plantMove(joint: THREE.Object3D, metres: number): () => void {
  const shift = new THREE.Vector3(metres / joint.parent!.getWorldScale(new THREE.Vector3()).x, 0, 0);
  joint.position.add(shift);
  joint.updateMatrixWorld();
  return () => {
    joint.position.sub(shift);
    joint.updateMatrixWorld();
  };
}

export default async function handSpeed(lab: Lab, options: Options): Promise<Report> {
  const hands: Record<Side, THREE.Object3D> = { left: lab.joints.handL, right: lab.joints.handR };
  const last: Record<Side, THREE.Vector3 | null> = { left: null, right: null };
  const fastest: Record<Side, Fastest> = { left: { move: 0, frame: -1 }, right: { move: 0, frame: -1 } };
  let plantedMove = 0;
  const start = lab.player.pos.clone();

  const input = (frame: number) => ({ keys: frame < STAND_FRAMES ? [] : ['w'] });
  await lab.step(STAND_FRAMES + WALK_FRAMES, input, (frame) => {
    const planted = options.canary === true && frame === PLANTED_FRAME;
    // (the frame after the planted one moves back from it: the canary's too)
    const canaryFrame = options.canary === true && (planted || frame === PLANTED_FRAME + 1);
    const undo = planted ? plantMove(hands.left, PLANTED_MOVE) : null;
    for (const side of ['left', 'right'] as const) {
      const now = inHips(lab, hands[side]);
      const move = last[side] ? now.distanceTo(last[side]) : 0;
      last[side] = now;
      if (planted && side === 'left') plantedMove = move;
      if (!canaryFrame && move > fastest[side].move) fastest[side] = { move, frame };
    }
    undo?.();
  });

  const problems: string[] = [];
  const walked = lab.player.pos.distanceTo(start);
  if (walked < 1) problems.push('the hero never walked');
  // (the hand's own move that frame adds to the planted one or takes from it: half of it can't be missed)
  if (options.canary && plantedMove < PLANTED_MOVE / 2) {
    problems.push(`the canary's 10 cm move measured ${(plantedMove * 100).toFixed(1)} cm`);
  }
  const line = (side: Side) => {
    const { move, frame } = fastest[side];
    const when = frame < STAND_FRAMES ? 'standing' : 'walking';
    return `${side} hand: at most ${(move * 100).toFixed(1)} cm a frame against the hips (frame ${frame}, ${when})`;
  };
  const lines = [`walked ${walked.toFixed(1)} m`, line('left'), line('right')];
  if (options.canary) lines.push(`canary: its frame's left hand moved ${(plantedMove * 100).toFixed(1)} cm`);
  return { text: lines.join('\n'), problems };
}
