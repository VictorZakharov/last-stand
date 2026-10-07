// The lab's command line read and checked (node/options.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, parseCommandLine, usage } from '../node/options.mjs';

test('fills in the defaults and reads each kind of value', () => {
  const { command, options } = parseCommandLine(['sheet', '--states', 'stand,full', '--at=3,-4.5', '--facing', '1.5']);
  assert.equal(command, 'sheet');
  assert.deepEqual(options.states, ['stand', 'full']);
  assert.deepEqual(options.views, ['lobby', 'top', 'third', 'front', 'left', 'back']);
  assert.equal(options.tag, 'latest');
  assert.deepEqual(options.at, [3, -4.5]);
  assert.equal(options.facing, 1.5);
});

test('reads switches, =false and a commit for --ab', () => {
  assert.equal(parseCommandLine(['carry', '--canary']).options.canary, true);
  assert.equal(parseCommandLine(['carry', '--nocked=false']).options.nocked, false);
  assert.equal(parseCommandLine(['carry', '--ab']).options.ab, true);
  assert.equal(parseCommandLine(['carry', '--ab=165246d']).options.ab, '165246d');
  // (a switch never takes the next word: it's the command's argument)
  assert.deepEqual(parseCommandLine(['probe', '--setup', 'x.ts']).options._, ['x.ts']);
});

test('suggests the option or command meant', () => {
  assert.throws(() => parseCommandLine(['carry', '--canry']), /lab: carry takes no --canry \(did you mean canary\?\)$/);
  assert.throws(() => parseCommandLine(['shet']), /did you mean sheet\?/);
  assert.throws(() => parseCommandLine(['sheet', '--zzz']), /takes no --zzz; it takes --states/);
});

test('refuses bad values', () => {
  assert.throws(() => parseCommandLine(['sheet', '--at', '12']), /--at: two numbers/);
  assert.throws(() => parseCommandLine(['sheet', '--facing', '0x10']), /--facing: a number/);
  assert.throws(() => parseCommandLine(['sheet', '--facing', '']), /--facing: a number/);
  assert.throws(() => parseCommandLine(['sheet', '--view', 'side']), /--view: top, third, first/);
  assert.throws(() => parseCommandLine(['carry', '--canary=yes']), /--canary: true or false/);
  assert.throws(() => parseCommandLine(['sheet', '--tag']), /--tag needs a value/);
});

test('checks what follows the command', () => {
  assert.throws(() => parseCommandLine(['probe']), /probe needs its module/);
  assert.throws(() => parseCommandLine(['carry', 'now']), /carry takes no "now"/);
  assert.equal(parseCommandLine(['eval', 'lab.player', '.nocked']).options._.join(' '), 'lab.player .nocked');
});

test('a probe gets the options it was given that the lab does not know', () => {
  const { options } = parseCommandLine(['probe', 'x.ts', '--frames=30', '--fast', '--slow=false']);
  assert.equal(options.frames, '30');
  assert.equal(options.fast, true);
  assert.equal(options.slow, false);
});

test('no command is the help', () => {
  assert.equal(parseCommandLine([]).command, 'help');
  assert.equal(parseCommandLine(['--help']).command, 'help');
});

test('the help fits the width it is made for', () => {
  for (const line of usage().split('\n')) assert.ok(line.length <= 116, line);
});

test('edit distance', () => {
  assert.equal(editDistance('canary', 'canry'), 1);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('views', 'views'), 0);
});
