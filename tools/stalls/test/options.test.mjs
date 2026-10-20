// The stalls harness's command line (tools/stalls/options.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOptions, usage } from '../options.mjs';

test('fills in the defaults', () => {
  const options = readOptions([]);
  assert.deepEqual(options, {
    urls: [],
    scenario: 'fight',
    seconds: 45,
    listed: 300,
    variants: ['base'],
    rounds: 1,
    itemMs: 250,
    pressMs: 200,
    view: 'top',
    biome: 'forest',
    hero: null,
    stash: 0,
    scale: 1,
    cpuSlowdown: 1,
    stallBlow: 0,
    stallLobby: 0,
    window: { width: 1536, height: 864 },
    headed: false,
    perf: false,
    js: false,
    angle: false,
    links: false,
    coldReturn: false,
    help: false,
  });
});

test('reads values either way, and switches', () => {
  const argv = ['--url', 'https://a/,https://b/', '--seconds=20', '--variants', 'base,cpuCanvas', '--headed'];
  const options = readOptions(argv);
  assert.deepEqual(options.urls, ['https://a/', 'https://b/']);
  assert.equal(options.seconds, 20);
  assert.deepEqual(options.variants, ['base', 'cpuCanvas']);
  assert.equal(options.headed, true);
  assert.equal(readOptions(['--links=false']).links, false);
  assert.equal(readOptions(['--scenario', 'lobby']).scenario, 'lobby');
  assert.equal(readOptions(['--view', 'first']).view, 'first');
  assert.equal(readOptions(['--biome=crypt']).biome, 'crypt');
  assert.equal(readOptions(['--scale', '1.25']).scale, 1.25);
  assert.equal(readOptions(['--hero', 'warrior']).hero, 'warrior');
  assert.equal(readOptions(['--stash=40']).stash, 40);
  assert.deepEqual(readOptions(['--window', '1536x695']).window, { width: 1536, height: 695 });
  assert.equal(readOptions(['--listed', '40']).listed, 40);
});

test('refuses what it doesn\'t know and bad values', () => {
  assert.throws(() => readOptions(['--secs', '5']), /no option --secs/);
  assert.throws(() => readOptions(['fight']), /"fight" is no option/);
  assert.throws(() => readOptions(['--scenario', 'boss']), /no scenario boss/);
  assert.throws(() => readOptions(['--variants', 'base,gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--variants', 'stillGlow+gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--rounds', '0']), /--rounds must be a whole number, 1 or more/);
  assert.throws(() => readOptions(['--item-ms', '5']), /--item-ms must be a number of ms, 16 or more/);
  assert.equal(readOptions(['--item-ms', '100']).itemMs, 100);
  assert.throws(() => readOptions(['--rounds', '3', '--variants', 'base,cpuCanvas']), /cpuCanvas runs a script/);
  assert.equal(readOptions(['--rounds', '3', '--variants', 'base,stillGlow+noTooltip']).rounds, 3);
  assert.deepEqual(readOptions(['--variants', 'base,stillGlow+noTooltip']).variants, ['base', 'stillGlow+noTooltip']);
  assert.throws(() => readOptions(['--seconds', '0']), /--seconds must be a number over 0/);
  assert.throws(() => readOptions(['--seconds']), /--seconds needs a value/);
  assert.throws(() => readOptions(['--view', 'eyes']), /no view eyes/);
  assert.throws(() => readOptions(['--biome', 'swamp']), /no biome swamp/);
  assert.throws(() => readOptions(['--scale', '0']), /--scale must be a number over 0/);
  assert.throws(() => readOptions(['--hero', 'bard']), /no hero bard/);
  assert.throws(() => readOptions(['--stash', '61']), /--stash must be a whole number from 0 to 60/);
  assert.throws(() => readOptions(['--window', '1536']), /--window must be a size in css px/);
  assert.throws(() => readOptions(['--listed', '10']), /--listed must be a number of ms, 20 or more/);
});

test('the usage lists every option', () => {
  const names = ['url', 'scenario', 'seconds', 'variants', 'rounds', 'view', 'biome', 'hero', 'stash', 'scale'];
  for (const name of [...names, 'window', 'item-ms', 'headed', 'perf', 'links', 'help']) {
    assert.match(usage(), new RegExp(`--${name}\\b`));
  }
});
