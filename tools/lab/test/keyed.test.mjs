// The arm a swing keys against the arm drawn (page/keyed.ts): judged where the arm is all the swing's, its flat too,
// and its shoulder and elbow only as far as the swing lays them out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { describeKeyed } from '../page/keyed.ts';

const at = (x, y, z) => new THREE.Vector3(x, y, z);
/** a keyed right arm, the shoulder, elbow and grip in the eyes' space */
const ARM = { shoulder: at(0.22, -0.3, -0.22), elbow: at(0.3, -0.6, -0.2), grip: at(0.25, -0.6, -0.6) };
const WAY = at(0.3, 0.8, -0.45).normalize();
const FLAT = at(1, 0, 0);

/** A frame keyed as `ARM`, drawn as `drawn` changes it. */
function frameOf(frame, drawn = {}, keyed = {}) {
  const copy = (arm) => ({ shoulder: arm.shoulder.clone(), elbow: arm.elbow.clone(), grip: arm.grip.clone() });
  return {
    frame,
    keyed: {
      hand: 'right',
      weight: 1,
      armShare: 1,
      keyed: copy(ARM),
      drawn: { ...copy(ARM), ...drawn.arm },
      keyedWay: WAY.clone(),
      drawnWay: drawn.way ?? WAY.clone(),
      keyedFlat: FLAT.clone(),
      drawnFlat: drawn.flat ?? FLAT.clone(),
      ...keyed,
    },
  };
}

test('an arm drawn as keyed has no problems', () => {
  assert.deepEqual(describeKeyed([frameOf(0), frameOf(1)]).problems, []);
});

test('a flat turned over on the handle is a problem, its way kept', () => {
  const turned = frameOf(1, { flat: at(-1, 0, 0) });
  const { problems } = describeKeyed([frameOf(0), turned]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /its flat up to 180°/);
});

test('a game without a keyed flat has its flat judged nowhere', () => {
  const old = frameOf(1, { flat: at(-1, 0, 0) }, { keyedFlat: null });
  assert.deepEqual(describeKeyed([old]).problems, []);
});

test('a shoulder and elbow drawn from elsewhere are judged only where the swing lays the arm out', () => {
  const elsewhere = { arm: { shoulder: at(-0.22, -0.3, -0.22), elbow: at(-0.1, -0.6, -0.3) } };
  const held = frameOf(1, elsewhere, { armShare: 0 });
  assert.deepEqual(describeKeyed([frameOf(0), held]).problems, []);
  const laidOut = frameOf(1, elsewhere);
  const problems = describeKeyed([frameOf(0), laidOut]).problems;
  assert.ok(problems.some((problem) => problem.includes('the shoulder up to 44 cm')));
});

test('a frame only partly the swing\'s is not judged', () => {
  const fading = frameOf(1, { arm: { grip: at(0.25, -0.4, -0.6) } }, { weight: 0.5 });
  assert.deepEqual(describeKeyed([frameOf(0), fading]).problems, []);
});
