// The dev server of a tree (node/side.mjs): what it never watches (`unwatched`), from the tree's root alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwatched } from '../node/side.mjs';

const MAIN = 'G:\\Git\\gd-clone';
const WORKTREE = 'G:\\Git\\gd-clone\\.claude\\worktrees\\hall-staff-glow';

test("scratch, other checkouts and the harnesses' output are left alone", () => {
  for (const path of ['.tmp\\probe.ts', '.claude\\worktrees\\x\\src\\main.ts', 'tools\\lab\\out\\vite\\a.js', 'dist']) {
    assert.equal(unwatched(MAIN, `${MAIN}\\${path}`), true, path);
  }
});

test('the game and the lab page are watched', () => {
  for (const path of ['src\\game\\hall.ts', 'tools\\lab\\page\\hallGlow.ts', 'index.html', 'tools\\lab\\outer.ts']) {
    assert.equal(unwatched(MAIN, `${MAIN}\\${path}`), false, path);
  }
});

test('a worktree under .claude watches its own source', () => {
  assert.equal(unwatched(WORKTREE, `${WORKTREE}\\src\\game\\hall.ts`), false);
  assert.equal(unwatched(WORKTREE, `${WORKTREE}\\.tmp\\probe.ts`), true);
});

test('forward slashes and another case of the root alike', () => {
  assert.equal(unwatched(MAIN, 'g:/Git/gd-clone/src/state.ts'), false);
  assert.equal(unwatched(MAIN, 'g:/Git/gd-clone/.tmp/a.ts'), true);
});
