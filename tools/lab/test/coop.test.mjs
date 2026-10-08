// The lab's co-op: the link carrying the two games' messages (node/coop.mjs) and the judge of what each showed
// (node/coopJudge.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Way, seededRandom } from '../node/coop.mjs';
import { drops, follow, judgeBlows, judgeShots } from '../node/coopJudge.mjs';

/** A path along x at `speed` m a frame, `frames` long. */
const along = (frames, speed, from = 0) => Array.from({ length: frames }, (_, f) => [from + f * speed, 0]);

/** A guest's sample with only what a test sets. */
const sample = (fields) => ({ self: [0, 0], life: 100, partner: null, foes: [], struck: [], loosed: 0, ...fields });

test('a way delays every message, never reorders them, and is the same every time', () => {
  const sent = Array.from({ length: 200 }, (_, i) => ({ at: i * 16, name: 'room', data: i }));
  const carry = () => new Way({ delay: 150, jitter: 60, random: seededRandom(7) }).carry(sent);
  const arriving = carry();
  arriving.forEach((message, i) => {
    assert.ok(message.due >= sent[i].at + 150, 'no message comes sooner than the delay');
    if (i) assert.ok(message.due >= arriving[i - 1].due, 'none overtakes the one sent before it');
  });
  assert.deepEqual(carry(), arriving);
});

test('a copy a few frames behind its source is found that far behind, on its path', () => {
  const source = along(120, 0.1);
  const shown = source.map((_, f) => (f >= 9 ? source[f - 9] : null));
  const followed = follow(shown, source);
  assert.equal(followed.delay, 9);
  assert.ok(followed.off < 1e-9);
  assert.ok(followed.rough < 1e-9);
});

test('a copy that jumps is rough and its jump is seen', () => {
  const source = along(120, 0.1);
  const shown = source.map((point, f) => (f === 60 ? [point[0] + 0.3, 0] : point));
  const followed = follow(shown, source);
  assert.ok(followed.jump > 0.35);
  assert.ok(followed.rough > 0.03);
});

test('a source standing has no delay to find', () => {
  const source = along(60, 0);
  assert.equal(follow(source, source).still, true);
});

test('a life falling is a drop, its regeneration rounding up and down is not', () => {
  assert.deepEqual(drops([100, 100.2, 100, 90, 90.5, 85.5]), [{ frame: 3, amount: 10 }, { frame: 5, amount: 5 }]);
});

test('an arrow struck on the guest\'s screen counts if the host\'s foe loses life soon after', () => {
  const foe = (life) => ({ id: 1, x: 0, z: 0, life, blow: false, inReach: false });
  const lives = [100, 100, 100, 100, 80, 80, 80, 80];
  const host = lives.map((life) => sample({ foes: [foe(life)] }));
  const guest = lives.map((_, f) => sample({ foes: [foe(f >= 2 ? 80 : 100)], struck: f === 2 ? [1, 1] : [] }));
  const shots = judgeShots(host, guest);
  assert.equal(shots.struck, 2);
  assert.equal(shots.counted, 1, 'one fall of its life counts for one arrow');
  assert.deepEqual(shots.shownAfter, [0]);
});

test('a blow dodged on the guest\'s screen that hurt it is told apart from one that landed', () => {
  const foe = (blow, inReach) => ({ id: 1, x: 0, z: 0, life: 100, blow, inReach });
  const guest = Array.from({ length: 200 }, (_, f) => sample({
    life: f >= 12 ? (f >= 112 ? 80 : 90) : 100,
    foes: [foe(f === 10 || f === 110, f === 10)],
  }));
  const blows = judgeBlows(guest);
  assert.equal(blows.blows, 2);
  assert.equal(blows.inReachHurt, 1);
  assert.equal(blows.dodgedHurt, 1);
  assert.equal(blows.unexplained, 0);
});
