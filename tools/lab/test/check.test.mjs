// A check's jobs and their order (node/check.mjs), and the key an A/B's other side is kept under (node/sideCache.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_CLASSES, jobsOf, longestFirst } from '../node/check.mjs';
import { keyedOptions, sideKey } from '../node/sideCache.mjs';

const names = (jobs) => jobs.map((job) => job.name);

test('every command of the plan for each of its heroes, the ranger\'s alone for his', () => {
  const jobs = jobsOf({});
  assert.equal(jobs.length, 3 * CHECK_CLASSES.length + 2);
  assert.ok(names(jobs).includes('carry-ranger'));
  assert.ok(!names(jobs).includes('carry-warrior'));
  assert.ok(names(jobs).includes('stops-mage'));
});

test('the commands and heroes asked for, and a hero a command is not for left out', () => {
  const jobs = jobsOf({ commands: ['gait', 'feet'], classes: ['warrior'] });
  assert.deepEqual(names(jobs), ['gait-warrior']);
});

test('the gait listed step by step without films; the A/B passed to every job', () => {
  const [gait] = jobsOf({ commands: ['gait'], classes: ['mage'], ab: 'abc1234' });
  assert.equal(gait.options.frames, true);
  assert.equal(gait.options.films, false);
  assert.equal(gait.options.ab, 'abc1234');
  assert.equal(gait.options.class, 'mage');
});

test('the longest last time first, one never timed before them all', () => {
  const jobs = jobsOf({ commands: ['gait', 'stops'], classes: ['warrior', 'mage'] });
  const order = longestFirst(jobs, { 'gait-warrior': 60, 'stops-warrior': 300, 'gait-mage': 90 });
  assert.deepEqual(names(order), ['stops-mage', 'stops-warrior', 'gait-mage', 'gait-warrior']);
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
