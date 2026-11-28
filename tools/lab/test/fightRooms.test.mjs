// `lab fight`'s rooms and their judge (node/fightRooms.mjs); the rooms themselves are fought by the command alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeRoom, outcomeOf, roomsOf, stepLine, TICK } from '../node/fightRooms.mjs';

const asked = { biome: 'forest', foe: 'thornling', count: 38, rooms: 3, seconds: 10 };

test('the rooms asked for each have the hero, a seed of their own and the steps of their seconds at the tick', () => {
  const { fought, canary } = roomsOf(asked);
  assert.equal(fought.length, 3);
  assert.deepEqual(fought.map((room) => room.seed), [1000, 1001, 1002]);
  for (const room of fought) assert.deepEqual(room.heroes, [[0, 0]]);
  assert.equal(fought[0].steps, Math.round(10 / TICK));
  assert.deepEqual(canary.heroes, []);
});

test('a room whose foes came to the hero passes, one whose foes stood off fails', () => {
  assert.deepEqual(judgeRoom({ alive: 38, cameNear: 38 }, false), []);
  assert.deepEqual(judgeRoom({ alive: 38, cameNear: 35 }, false), []);
  assert.deepEqual(judgeRoom({ alive: 38, cameNear: 20 }, false), ['20 of 38 foes came to the hero']);
  assert.deepEqual(judgeRoom({ alive: 0, cameNear: 0 }, false), ['no foe alive at its end']);
});

test('the canary is caught when its foes came to no one, and missed when they came to a hero it has not', () => {
  assert.deepEqual(judgeRoom({ alive: 38, cameNear: 0 }, true), []);
  assert.equal(judgeRoom({ alive: 38, cameNear: 5 }, true).length, 1);
});

test('a spread of steps says its median, its 90th percentile and its most', () => {
  const steps = Array.from({ length: 10 }, (_, index) => index + 1);
  assert.equal(stepLine(steps), 'median 6.00 ms, 90% 10.00, most 10.00');
});

test('a run asked for is a run from its wave in every room, and its canary a run no one strikes in', () => {
  const { fought, canary } = roomsOf({ ...asked, wave: 5 });
  for (const room of fought) assert.deepEqual(room.mode, { run: { wave: 5, strikes: true } });
  assert.deepEqual(canary.mode, { run: { wave: 5, strikes: false } });
  assert.deepEqual(canary.heroes, [[0, 0]]);
});

test('a run passes once it cleared a wave, and its canary is caught while it cleared none', () => {
  const run = { from: 5, reached: 7, cleared: 2, kills: 30, bosses: [] };
  assert.deepEqual(judgeRoom(run, false), []);
  assert.deepEqual(judgeRoom({ ...run, cleared: 0 }, false), ['no wave cleared from wave 5']);
  assert.deepEqual(judgeRoom({ ...run, cleared: 0 }, true), []);
  assert.equal(judgeRoom(run, true).length, 1);
});

test('a run says its waves, its kills and each boss that came, fallen or standing', () => {
  const bosses = [{ name: 'The Elder Thornheart', fell: true }, { name: 'Twin', fell: false }];
  const run = { from: 4, reached: 7, cleared: 3, kills: 36, bosses };
  assert.equal(outcomeOf(run), 'waves 4 to 7, 3 cleared, 36 kills, bosses: The Elder Thornheart fell, Twin standing');
});
