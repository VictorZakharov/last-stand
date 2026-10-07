// A probe module's own files, copied into another commit for an A/B (node/probeFiles.mjs).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OUT } from '../node/paths.mjs';
import { probeFiles } from '../node/probeFiles.mjs';

// (under the lab's own output, never the user's temp folder)
mkdirSync(OUT, { recursive: true });
const root = mkdtempSync(join(OUT, 'test-'));
after(() => rmSync(root, { recursive: true, force: true }));

function write(path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

write('src/state.ts', 'export const G = {};');
write('tools/lab/page/lab.ts', 'export type Lab = {};');
write('.tmp/probes/mine.ts', [
  "import type { Lab } from '../../tools/lab/page/lab';",
  "import { G } from '../../src/state';",
  "import { bones } from './helpers/bones';",
  "export { tidy } from './tidy.js';",
  "const late = () => import('./late');",
].join('\n'));
write('.tmp/probes/helpers/bones.ts', "import { tidy } from '../tidy.js';\nexport const bones = tidy;");
write('.tmp/probes/tidy.js', 'export const tidy = 1;');
write('.tmp/probes/late/index.ts', "import './missing';");
write('.tmp/probes/unused.ts', 'export {};');

test("the probe and what it imports from beside it, not the game's or the lab's", () => {
  const files = probeFiles(root, '.tmp/probes/mine.ts');
  assert.equal(files[0], '.tmp/probes/mine.ts');
  assert.deepEqual([...files].sort(), [
    '.tmp/probes/helpers/bones.ts',
    '.tmp/probes/late/index.ts',
    '.tmp/probes/mine.ts',
    '.tmp/probes/tidy.js',
  ]);
});
