// node/commits.mjs: the exported tree's stand-ins for the scene API (`apiStandIn`): a tree from before the API is
// handed three's under the API's names where sceneApi.ts asks, and a tree with the API, or another importer, isn't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from '../node/paths.mjs';
import { apiStandIn } from '../node/commits.mjs';

/** A tree of its own under the lab's out folder, with the API's index or without; removed by `done`. */
function treeOf(hasApi) {
  mkdirSync(OUT, { recursive: true });
  const root = mkdtempSync(join(OUT, 'api-stand-in-'));
  if (hasApi) {
    mkdirSync(join(root, 'src/engine/api'), { recursive: true });
    writeFileSync(join(root, 'src/engine/api/index.ts'), '');
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a tree without the API is handed the stand-ins where sceneApi.ts asks', () => {
  const tree = treeOf(false);
  const importer = join(tree.root, 'tools/lab/page/sceneApi.ts');
  try {
    const index = apiStandIn(tree.root, '../../../src/engine/api/index.ts', importer);
    const shapes = apiStandIn(tree.root, '../../../src/engine/api/shapes/index.ts', importer);
    assert.equal(index, join(tree.root, 'tools/lab/page/threeAsApi.js'));
    assert.equal(shapes, join(tree.root, 'tools/lab/page/threeShapes.js'));
  } finally {
    tree.done();
  }
});

test('a tree with the API keeps its own, and another importer is left alone', () => {
  const withApi = treeOf(true);
  const without = treeOf(false);
  try {
    const sceneApi = join(withApi.root, 'tools/lab/page/sceneApi.ts');
    assert.equal(apiStandIn(withApi.root, '../../../src/engine/api/index.ts', sceneApi), null);
    const game = join(without.root, 'src/main.ts');
    assert.equal(apiStandIn(without.root, './engine/api/index.ts', game), null);
    const other = join(without.root, 'tools/lab/page/sceneApi.ts');
    assert.equal(apiStandIn(without.root, './lab.ts', other), null);
  } finally {
    withApi.done();
    without.done();
  }
});
