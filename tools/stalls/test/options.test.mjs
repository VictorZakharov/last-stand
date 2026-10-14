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
    headed: false,
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
});

test('refuses what it doesn\'t know and bad values', () => {
  assert.throws(() => readOptions(['--secs', '5']), /no option --secs/);
  assert.throws(() => readOptions(['fight']), /"fight" is no option/);
  assert.throws(() => readOptions(['--scenario', 'boss']), /no scenario boss/);
  assert.throws(() => readOptions(['--variants', 'base,gpu']), /no variant gpu/);
  assert.throws(() => readOptions(['--seconds', '0']), /--seconds must be a number over 0/);
  assert.throws(() => readOptions(['--seconds']), /--seconds needs a value/);
});

test('the usage lists every option', () => {
  for (const name of ['url', 'scenario', 'seconds', 'variants', 'headed', 'links', 'help']) {
    assert.match(usage(), new RegExp(`--${name}\\b`));
  }
});
