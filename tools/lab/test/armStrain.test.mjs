// An arm held at its stops (page/armStrain.ts): two or more of one arm's joints at the ends of their ranges on a frame,
// each joint judged against the body's ranges, a gripping wrist against a gripping wrist's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmsPinned, pinnedArms, pinnedCanary } from '../page/armStrain.ts';

/** The body's limits as anatomy.ts has them (its `ROM`; the shoulder's raise and turn left wide: none of these
 *  arms is raised near its limit). */
const LIMITS = {
  ranges: { 'forearm.pronation': [-90, 90], 'wrist.flexion': [-70, 80], 'wrist.radial': [-30, 20] },
  elevationLimit: () => 180,
  rotationRange: () => [-80, 90],
};

/** Both arms hanging at ease: every joint well within its range. */
function atEase() {
  const arm = (side) => ({
    [`shoulder${side}.elevation`]: 10, [`shoulder${side}.plane`]: 20, [`shoulder${side}.rotation`]: 0,
    [`forearm${side}.pronation`]: 0, [`wrist${side}.flexion`]: 0, [`wrist${side}.radial`]: 0,
  });
  return { ...arm('L'), ...arm('R') };
}

test('an arm at ease is not pinned', () => {
  assert.deepEqual(pinnedArms(atEase(), LIMITS), []);
});

test('one joint at its stop is a reach, not a pinned arm', () => {
  const angles = { ...atEase(), 'forearmR.pronation': 90 };
  assert.deepEqual(pinnedArms(angles, LIMITS), []);
});

test("Power Strike's end, the forearm and the wrist both at their ends, is pinned", () => {
  const angles = { ...atEase(), 'forearmR.pronation': 89.9, 'wristR.radial': -30 };
  const [strain] = pinnedArms(angles, LIMITS);
  assert.equal(strain.side, 'R');
  assert.deepEqual(strain.stops.map((stop) => stop.end), ['forearmR.pronation at 90°', 'wristR.radial at -30°']);
});

test("a gripping wrist is judged by a gripping wrist's range", () => {
  const angles = { ...atEase(), 'forearmL.pronation': -90, 'wristL.flexion': 30 };
  assert.deepEqual(pinnedArms(angles, LIMITS), []);
  const [strain] = pinnedArms(angles, LIMITS, { L: { 'wrist.flexion': [-70, 30] } });
  assert.equal(strain.side, 'L');
});

test('the tally counts each stop by its end, the most frequent first', () => {
  const pinned = new ArmsPinned('cast', LIMITS);
  const end = { ...atEase(), 'forearmR.pronation': 90, 'wristR.radial': -30 };
  pinned.observe(end, {}, '1');
  pinned.observe({ ...end, 'forearmR.pronation': 0, 'wristR.flexion': -70 }, {}, '2');
  assert.equal(pinned.tally(), 'wristR.radial at -30° 2, forearmR.pronation at 90° 1, wristR.flexion at -70° 1');
  assert.match(pinned.describe(), /on 2 frames, the most at frame 1/);
});

test('the canary reads a pinned right arm', () => {
  assert.equal(pinnedCanary(atEase(), LIMITS), true);
});
