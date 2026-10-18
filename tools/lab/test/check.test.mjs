// A check's jobs, their order and their counts added up (node/check.mjs), and the key an A/B's other side is kept
// under (node/sideCache.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_CLASSES, CHECK_OFFSETS, CHECK_SPLIT, EYES_ROWS, EYES_SKILLS, RUSH_PARTS, castParts, countsLine, countsOver,
  eyesParts, jobsOf, longestFirst, offsetsOf, scenariosOf,
} from '../node/check.mjs';
import { keyedOptions, sideKey } from '../node/sideCache.mjs';

const names = (jobs) => jobs.map((job) => job.name);

test('every command of the plan for each of its heroes, the ranger\'s alone for his, the gait a scenario a job', () => {
  const jobs = jobsOf({});
  const gaitScenarios = scenariosOf('gait').length;
  const starts = offsetsOf().length;
  assert.ok(gaitScenarios > 1);
  assert.ok(starts > 1);
  assert.ok(CHECK_SPLIT.has('gait'));
  const eyes = eyesParts().length + castParts().length;
  // (the stops, the ranges, the form and the battle log for each; the ranger's feet and carry, the warrior's swings,
  // his rush in its parts and his hits)
  assert.equal(jobs.length, (4 + gaitScenarios) * CHECK_CLASSES.length + 4 + RUSH_PARTS.length + eyes);
  assert.ok(names(jobs).includes('carry-ranger'));
  assert.ok(names(jobs).includes('log-mage'));
  assert.ok(names(jobs).includes('eyes-warrior-twoHanded-Maul-row'));
  assert.ok(!names(jobs).some((name) => name.startsWith('eyes-mage')));
  assert.ok(!names(jobs).includes('carry-warrior'));
  assert.ok(names(jobs).includes('stops-mage'));
  const gait = jobs.find((job) => job.name === `gait-mage-${scenariosOf('gait')[0]}`);
  assert.deepEqual(gait.options.offsets, offsetsOf());
});

test('the starts asked for, at least one and at most every offset there is', () => {
  assert.deepEqual(offsetsOf(1), [0]);
  assert.deepEqual(offsetsOf(0), [0]);
  assert.deepEqual(offsetsOf(99), CHECK_OFFSETS);
  const jobs = jobsOf({ commands: ['gait'], classes: ['ranger'], starts: 2 });
  assert.equal(jobs.length, scenariosOf('gait').length);
  for (const job of jobs) assert.deepEqual(job.options.offsets, CHECK_OFFSETS.slice(0, 2));
});

test('the commands and heroes asked for, and a hero a command is not for left out', () => {
  const jobs = jobsOf({ commands: ['stops', 'feet'], classes: ['warrior'] });
  assert.deepEqual(names(jobs), ['stops-warrior']);
});

test('a split command\'s job runs one scenario, in its group; the gait listed without films; the A/B passed on', () => {
  const [gait] = jobsOf({ commands: ['gait'], classes: ['mage'], ab: 'abc1234' });
  const first = scenariosOf('gait')[0];
  assert.deepEqual(gait.options.scenarios, [first]);
  assert.deepEqual(gait.options.offsets, offsetsOf());
  assert.equal(gait.group, 'gait-mage');
  assert.equal(gait.part, first);
  assert.equal(gait.options.frames, true);
  assert.equal(gait.options.films, false);
  assert.equal(gait.options.ab, 'abc1234');
  assert.equal(gait.options.class, 'mage');
});

test('each weapon swung through the eyes in each row, the basic attack without a film, in the eyes\' group', () => {
  const jobs = jobsOf({ commands: ['eyes'], classes: ['warrior'] });
  assert.equal(jobs.length, eyesParts().length);
  assert.equal(new Set(names(jobs)).size, jobs.length);
  const rows = Object.keys(EYES_ROWS).length;
  const twoHanded = Object.values(EYES_SKILLS).filter((gears) => !gears || gears.includes('twoHanded')).length;
  assert.equal(jobs.filter((job) => job.options.weapon === 'Greataxe').length, rows + twoHanded);
  const pause = jobs.find((job) => job.name === 'eyes-warrior-dual-Axe-pause');
  assert.deepEqual(pause.options._, ['cleave']);
  assert.equal(pause.options.film, false);
  assert.equal(pause.options.gear, 'dual');
  assert.equal(pause.options.weapon, 'Axe');
  assert.equal(pause.options.apart, EYES_ROWS.pause.apart);
  assert.equal(pause.group, 'eyes-warrior');
  assert.equal(pause.part, 'dual-Axe-pause');
  const row = jobs.find((job) => job.name === 'eyes-warrior-shield-Mace-row');
  assert.equal(row.options.canary, true);
  assert.equal(row.options.offsets, undefined);
});

test('each skill through the eyes on each weapon its way of holding them takes, the canaries on the first', () => {
  const jobs = jobsOf({ commands: ['eyes'], classes: ['warrior'] });
  const crescent = jobs.filter((job) => job.options._[0] === 'crescent');
  assert.deepEqual(crescent.map((job) => job.options.weapon), ['Greatsword', 'Greataxe', 'Maul']);
  assert.deepEqual(crescent.map((job) => job.options.canary), [true, false, false]);
  const fangs = jobs.filter((job) => job.options._[0] === 'twinFangs');
  assert.equal(fangs.every((job) => job.options.gear === 'dual'), true);
  const strike = jobs.find((job) => job.name === 'eyes-warrior-oneHanded-Sword-powerStrike');
  assert.equal(strike.options.film, false);
  assert.equal(strike.options.times, undefined);
});

test('each skill cast through the eyes for its light, on each way\'s first weapon, its options in full', () => {
  const jobs = jobsOf({ commands: ['cast'], classes: ['warrior', 'mage'] });
  assert.equal(jobs.length, castParts().length);
  assert.ok(jobs.every((job) => job.heroClass === 'warrior'));
  const strike = jobs.find((job) => job.name === 'cast-warrior-dual-powerStrike');
  assert.deepEqual(strike.options._, ['powerStrike']);
  assert.equal(strike.options.weapon, 'Sword');
  assert.deepEqual(strike.options.views, ['first']);
  assert.deepEqual(strike.options.biomes, ['crypt', 'forest']);
  assert.deepEqual(strike.options.times, []);
  assert.ok(names(jobs).includes('cast-warrior-shield-cleave'));
  assert.ok(names(jobs).includes('cast-warrior-twoHanded-crescent'));
});

test('every swing of every weapon each way held stepped through the eyes in one job, with the canaries', () => {
  const jobs = jobsOf({ commands: ['swing'], classes: ['warrior', 'mage'] });
  assert.deepEqual(names(jobs), ['swing-warrior']);
  const [swing] = jobs;
  assert.deepEqual(swing.options._, ['all']);
  assert.equal(swing.options.gear, undefined);
  assert.equal(swing.options.canary, true);
});

test('the charge\'s sets apart from the skills cast with it, those cast with a shield and with two weapons', () => {
  const jobs = jobsOf({ commands: ['rush'], classes: ['warrior', 'mage'] });
  assert.deepEqual(names(jobs), ['rush-warrior-sets', 'rush-warrior-shield-casts', 'rush-warrior-dual-casts']);
  const [sets, shield, dual] = jobs;
  assert.deepEqual(sets.options.scenarios, ['sets']);
  assert.equal(sets.options.gear, undefined);
  assert.deepEqual(shield.options.scenarios, ['casts']);
  assert.equal(shield.options.gear, 'shield');
  assert.equal(dual.options.gear, 'dual');
  assert.equal(dual.options.pictures, false);
  assert.ok(jobs.every((job) => job.group === 'rush-warrior'));
});

test('Twin Fangs\' blows held to the basic attack\'s pace and to 0.2 s apart, with two weapons', () => {
  const [hits] = jobsOf({ commands: ['hits'], classes: ['warrior', 'mage'] });
  assert.equal(hits.name, 'hits-warrior');
  assert.deepEqual(hits.options._, ['twinFangs']);
  assert.equal(hits.options.than, 'cleave');
  assert.equal(hits.options.apart, 0.2);
  assert.equal(hits.options.gear, 'dual');
});

test('the longest last time first, one never timed before them all', () => {
  const jobs = jobsOf({ commands: ['range', 'stops'], classes: ['warrior', 'mage'] });
  const order = longestFirst(jobs, { 'range-warrior': 60, 'stops-warrior': 300, 'range-mage': 90 });
  assert.deepEqual(names(order), ['stops-mage', 'stops-warrior', 'range-mage', 'range-warrior']);
});

test('the options that bear on a result, sorted; the A/B and how it runs left out', () => {
  const options = { ab: true, profile: true, fresh: true, watch: true, class: 'mage', frames: true, _: [] };
  assert.deepEqual(keyedOptions(options), [['_', []], ['class', 'mage'], ['frames', true]]);
});

test('a side kept by its commit, hero, command and options, the A/B itself aside', () => {
  const base = { sha: 'a'.repeat(40), heroClass: 'mage', command: 'stops', options: { _: [], class: 'mage' } };
  const key = sideKey(base);
  assert.equal(sideKey({ ...base, options: { ...base.options, ab: 'origin/main', fresh: true } }), key);
  assert.notEqual(sideKey({ ...base, sha: 'b'.repeat(40) }), key);
  assert.notEqual(sideKey({ ...base, heroClass: 'warrior' }), key);
  assert.notEqual(sideKey({ ...base, command: 'gait' }), key);
  assert.notEqual(sideKey({ ...base, options: { ...base.options, frames: true } }), key);
});

test('each side\'s counts added up over a hero\'s jobs, this tree\'s first and the other\'s after it', () => {
  const part = (mine, other) => ({ counts: [{ mine: false, counts: other }, { mine: true, counts: mine }] });
  const sums = countsOver([part({ hops: 1, gallops: 2 }, { hops: 3, gallops: 0 }), part({ hops: 0 }, { hops: 4 })]);
  assert.deepEqual(sums, { mine: { hops: 1, gallops: 2 }, other: { hops: 7, gallops: 0 } });
  assert.equal(countsLine(sums, 'abc1234'), 'hops 1 (abc1234 7), gallops 2 (abc1234 0)');
  assert.equal(countsLine(countsOver([{ counts: [{ mine: true, counts: { hops: 2 } }] }]), 'x'), 'hops 2');
  assert.equal(countsLine(countsOver([{ text: 'a job that threw' }]), 'x'), '');
});
