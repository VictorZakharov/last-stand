// How the cuts of a row follow each other (page/cutRows.ts): a cut straight after another isn't back at rest before
// its blow, which it is only if its blade stops there; passing through the rest's place on its way is no fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rowOfCuts } from '../page/cutRows.ts';

const FRAME_MS = 1000 / 60;
const BLADE_LENGTH = 0.9;
/** the blade at rest, in the eyes' space: its grip low on the right, the blade up and away */
const REST_GRIP = new THREE.Vector3(0.25, -0.35, -0.45);
const REST_WAY = new THREE.Vector3(0.1, 0.8, -0.3).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

/** The rest's blade turned `yaw` degrees round the eyes, as a cut's frame. */
function frameAt(yaw, { frame, side, inCast }) {
  const grip = REST_GRIP.clone().applyAxisAngle(UP, yaw * DEG);
  const tip = REST_WAY.clone().applyAxisAngle(UP, yaw * DEG).multiplyScalar(BLADE_LENGTH).add(grip);
  return { grip, tip, hand: 'right', side, inCast, frame };
}

/** A cast's frames through `yaws` from frame `first`, the first one the frame before it began. */
function castThrough(yaws, first, side) {
  const frames = yaws.map((yaw, i) => frameAt(yaw, { frame: first + i, side, inCast: i > 0 }));
  return { frames, strikeFrom: frames.length - 1 };
}

const REST = { right: frameAt(0, { frame: 0, side: null, inCast: false }) };
const FOREHAND = castThrough([0, 0, 20, 40, 60], 0, 1);

/** The problems of a forehand from rest, then a backhand through `yaws` (from where the forehand ended). */
function backhandProblems(yaws) {
  const backhand = castThrough(yaws, FOREHAND.frames.length, -1);
  return rowOfCuts([FOREHAND, backhand], REST, FRAME_MS).problems.filter((problem) => problem.includes('rest'));
}

test('a cut passing through the rest\'s place on its way into the next isn\'t back at rest', () => {
  assert.deepEqual(backhandProblems([60, 40, 20, 0, -20, -40, -20]), []);
});

test('a cut that stops at the rest between two cuts went back to it', () => {
  const problems = backhandProblems([60, 40, 20, 5, 0, 0, 0, -20, -40, -20]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /cut 2 went back to the rest \(frame 10\)/);
});
