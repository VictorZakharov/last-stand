// The lab's boots skip the loading screen's logo blow (node/browser.mjs `freshStorage`) by the mark the game's
// watchdog leaves on a slow device: held to the game's own name and count for it (src/ui/logoWind.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a fresh boot is marked as slow as the game needs it to fade plainly', () => {
  const game = read('../../../src/ui/logoWind.ts');
  const key = game.match(/const SLOW_KEY = '([^']+)'/)?.[1];
  const launches = game.match(/const SLOW_LAUNCHES = (\d+)/)?.[1];
  assert.ok(key && launches, 'logoWind.ts names its key and count');
  assert.ok(read('../node/browser.mjs').includes(`localStorage.setItem('${key}', '${launches}')`));
});
