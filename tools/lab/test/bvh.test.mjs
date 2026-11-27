// A motion-capture clip read and sampled (page/bvh.ts), as three 0.187's BVHLoader and AnimationMixer had it: each
// value below worked by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { END_SITE, posesOf, readBvh, sampleBvh } from '../page/bvh.ts';
import { Vec3 } from '../../../src/engine/api/index.ts';

/** A root that moves and turns about y, a child turned about z then x, and the child's end site. Frame 1 turns the
 *  root 90 degrees about y and the spine 90 about z; frame 2 the root 180 about y and the spine 90 about z, then 90
 *  about x. */
const CLIP = `HIERARCHY
ROOT Hips
{
  OFFSET 1 2 3
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0 5 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0 2 0
    }
  }
}
MOTION
Frames: 3
Frame Time: 0.5
0 0 0 0 0 0 0 0 0
10 0 0 0 0 90 90 0 0
10 4 0 0 0 180 90 90 0
`;

/** `way` turned by `pose`'s turn. */
const turned = (pose, way) => way.clone().applyQuaternion(pose.quaternion);

/** Whether each of `actual`'s numbers is within a millionth of `expected`'s. */
function near(actual, expected, what) {
  const apart = actual.toArray().map((value, i) => Math.abs(value - expected[i]));
  assert.ok(Math.max(...apart) < 1e-6, `${what}: ${actual.toArray()} against ${expected}`);
}

test('the skeleton is read parents first, an end site a joint of its own', () => {
  const clip = readBvh(CLIP);
  assert.deepEqual(clip.joints.map((joint) => joint.name), ['Hips', 'Spine', END_SITE]);
  assert.deepEqual(clip.joints.map((joint) => joint.parent), [-1, 0, 1]);
  assert.deepEqual(clip.joints.map((joint) => joint.firstChannel), [0, 6, 9]);
  assert.deepEqual(clip.joints[2].channels, []);
  assert.deepEqual(clip.joints[1].offset.toArray(), [0, 5, 0]);
});

test('the frames, their time and the clip\'s length (its last frame\'s time)', () => {
  const clip = readBvh(CLIP);
  assert.equal(clip.frames.length, 3);
  assert.equal(clip.frameTime, 0.5);
  assert.equal(clip.seconds, 1);
});

test('a joint\'s place is its offset plus its position channels', () => {
  const clip = readBvh(CLIP);
  const poses = sampleBvh(clip, 0.5, posesOf(clip));
  assert.deepEqual(poses[0].position.toArray(), [11, 2, 3]);
  assert.deepEqual(poses[1].position.toArray(), [0, 5, 0]);
});

test('a turn is its rotation channels in degrees, multiplied in the file\'s order', () => {
  const clip = readBvh(CLIP);
  const first = sampleBvh(clip, 0.5, posesOf(clip));
  near(turned(first[0], new Vec3(0, 0, 1)), [1, 0, 0], 'the root turned a quarter about y: ahead to +x');
  near(turned(first[1], new Vec3(0, 1, 0)), [-1, 0, 0], 'the spine turned a quarter about z: up to -x');
  const second = sampleBvh(clip, 1, posesOf(clip));
  // (z's turn times x's: x's applied first, up to +z, which z's turn leaves where it is)
  near(turned(second[1], new Vec3(0, 1, 0)), [0, 0, 1], 'the spine turned about z, then x: up to +z');
});

test('between two frames the place is blended straight and the turn spherically', () => {
  const clip = readBvh(CLIP);
  const poses = sampleBvh(clip, 0.75, posesOf(clip));
  assert.deepEqual(poses[0].position.toArray(), [11, 4, 3]);
  near(turned(poses[0], new Vec3(0, 0, 1)), [Math.SQRT1_2, 0, -Math.SQRT1_2], 'the root halfway, 135 degrees');
});

test('a moment past the end is the last frame, one before the start the first', () => {
  const clip = readBvh(CLIP);
  assert.deepEqual(sampleBvh(clip, 5, posesOf(clip))[0].position.toArray(), [11, 6, 3]);
  assert.deepEqual(sampleBvh(clip, -1, posesOf(clip))[0].position.toArray(), [1, 2, 3]);
});

test('a file cut short says so', () => {
  assert.throws(() => readBvh(CLIP.slice(0, CLIP.indexOf('MOTION'))), /ends early/);
});
