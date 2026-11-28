// `lab coop`'s `hitches`: when each game holds its messages (page/coopHitches.ts) and the judge of its play-out's wait
// (node/coopHitches.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HITCH_CALM, HITCH_EVERY, HITCH_FRAMES, HITCH_HOLD, inHitch } from '../page/coopHitches.ts';
import { GROWN_MOST, HITCHES_CANARY, describeHitches, hitchesCanaryLines } from '../node/coopHitches.mjs';

/** frames of the lab's clock, ms */
const FRAME_MS = 17067 / 1024;

/** A game's samples, its play-out waiting `calm` ms before the hitches and `hitched` from their start on. */
function samples(calm, hitched) {
  return Array.from({ length: HITCH_FRAMES }, (_, frame) => ({
    playout: { behind: frame < HITCH_CALM ? calm : hitched, rate: 1, held: false },
  }));
}

test('no hitch before the calm part ends, then one of its length every period, the guest half way between', () => {
  const held = (guest) => Array.from({ length: HITCH_FRAMES }, (_, frame) => inHitch(frame, guest));
  for (const guest of [false, true]) {
    const frames = held(guest);
    assert.equal(frames.slice(0, HITCH_CALM).filter(Boolean).length, 0);
    const period = frames.slice(HITCH_CALM + HITCH_EVERY, HITCH_CALM + 2 * HITCH_EVERY);
    assert.equal(period.filter(Boolean).length, HITCH_HOLD);
  }
  const both = held(false).map((host, frame) => host && held(true)[frame]);
  assert.equal(both.filter(Boolean).length, 0, 'the two games never hitch at once');
});

test('a play-out that waits as long with the hitches passes', () => {
  const judged = describeHitches(samples(65, 67), samples(65, 67), FRAME_MS);
  assert.deepEqual(judged.problems, []);
  assert.match(judged.line, /65 ms behind the freshest report on a calm link, 67 with a 150 ms hitch every 2 s \(\+2\)/);
});

test('a play-out that waits longer for its own game\'s hitches fails, and so the canary is caught', () => {
  const judged = describeHitches(samples(65, 65 + GROWN_MOST + 1), samples(65, 66), FRAME_MS);
  assert.equal(judged.problems.length, 1);
  assert.ok(judged.problems[0].startsWith(HITCHES_CANARY));
  const lines = [];
  assert.deepEqual(hitchesCanaryLines(judged.problems, lines), []);
  assert.deepEqual(lines, ['canary: messages handed over unstamped caught']);
});

test('a canary whose hitches never showed is a missed canary', () => {
  const lines = [];
  const left = hitchesCanaryLines(describeHitches(samples(65, 66), samples(65, 66), FRAME_MS).problems, lines);
  assert.equal(left.length, 1);
  assert.match(left[0], /canary missed/);
});

test('a game with no play-out read is a problem, never a pass', () => {
  const unread = Array.from({ length: HITCH_FRAMES }, () => ({ playout: null }));
  assert.equal(describeHitches(unread, samples(65, 65), FRAME_MS).problems.length, 1);
});
