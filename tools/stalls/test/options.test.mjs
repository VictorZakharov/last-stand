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
    view: 'top',
    biome: 'forest',
    hero: null,
    stash: 0,
    scale: 1,
    headed: false,
    perf: false,
    links: false,
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
});

test('refuses what it doesn\'t know and bad values', () => {
  assert.throws(() => readOptions(['--secs', '5']), /no option --secs/);
  assert.throws(() => readOptions(['fight']), /"fight" is no option/);
  assert.throws(() => readOptions(['--scenario', 'boss']), /no scenario boss/);
  assert.throws(() => readOptions(['--variants', 'base,gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--seconds', '0']), /--seconds must be a number over 0/);
  assert.throws(() => readOptions(['--seconds']), /--seconds needs a value/);
  assert.throws(() => readOptions(['--view', 'eyes']), /no view eyes/);
  assert.throws(() => readOptions(['--biome', 'swamp']), /no biome swamp/);
  assert.throws(() => readOptions(['--scale', '0']), /--scale must be a number over 0/);
  assert.throws(() => readOptions(['--hero', 'bard']), /no hero bard/);
  assert.throws(() => readOptions(['--stash', '61']), /--stash must be a whole number from 0 to 60/);
});

test('the usage lists every option', () => {
  const names = ['url', 'scenario', 'seconds', 'variants', 'view', 'biome', 'hero', 'stash', 'scale', 'headed', 'perf'];
  for (const name of [...names, 'links', 'help']) {
    assert.match(usage(), new RegExp(`--${name}\\b`));
  }
});
