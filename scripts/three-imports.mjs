// `npm run check:three`: no file of the game or the lab imports three.js (VictorZakharov/last-stand#973: three left
// the game whole; its scene, maths, geometry and materials are Bulwark's API, src/engine/api). Fails naming each file
// that imports 'three' or any of its paths ('three/addons/...', 'three/webgpu'). The lab's two stand-ins for an A/B's
// other side are the exception: a commit from before the API, whose game is three's, binds the API's names to three's
// there (tools/lab/page/sceneApi.ts says how), and the API's fixture maker, which reads three's own generators once
// into the fixtures the API's tests are held to (src/engine/api/shapes/fixtures.mjs says how to run it). A line
// that's a comment alone is passed over: a note may name three's paths.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** the folders searched, from the root */
const SEARCHED = ['src', 'tools/lab/page', 'tools/lab/test', 'tools/lab/examples', 'tools/lab/node'];
/** the files that import three on purpose, from the root */
const ALLOWED = new Set([
  'tools/lab/page/threeAsApi.js',
  'tools/lab/page/threeShapes.js',
  'src/engine/api/shapes/fixtures.mjs',
]);
/** an import, an export or a dynamic import of three or one of its paths */
const FROM_THREE = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)(['"])three(?:\/[^'"]*)?\1/;
/** a line that's a comment alone, or a block comment's line */
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;
/** the files a search reads */
const CODE = /\.(?:ts|mts|js|mjs)$/;

/** Every code file under `dir` (none of a build's or a tool's output). */
function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'out' || entry === 'node_modules' || entry === 'pkg') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (CODE.test(path) && !path.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** Whether `text` imports three on a line that isn't a comment. */
function importsThree(text) {
  return text.split('\n').some((line) => !COMMENT.test(line) && FROM_THREE.test(line));
}

/** The searched files that import three, by their path from the root. */
function offenders() {
  const found = [];
  for (const folder of SEARCHED) {
    for (const path of sources(join(ROOT, folder))) {
      const name = relative(ROOT, path).split(sep).join('/');
      if (ALLOWED.has(name)) continue;
      if (importsThree(readFileSync(path, 'utf8'))) found.push(name);
    }
  }
  return found;
}

const found = offenders();
if (found.length) {
  console.error(`${found.length} files import three.js, which the game has none of: take the scene API's names`
    + ' (src/engine/api; the lab: tools/lab/page/sceneApi.ts):');
  for (const name of found) console.error(`  ${name}`);
  process.exit(1);
}
console.log('no file of the game or the lab imports three.js');
