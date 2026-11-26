// `npm run check:three`: every file of `src` takes three.js through `src/engine/three.ts`, never from 'three' itself
// (VictorZakharov/last-stand#973: each of three's names is moved to the engine's own in that one module). Fails
// naming each file that imports 'three'; `--fix` points those imports at the module instead. three's addons and
// its renderers ('three/addons/...', 'three/webgpu') are left as they are: stages of their own.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const MODULE = join(SRC, 'engine', 'three.ts');
/** an import or export of 'three' itself, its quote kept */
const FROM_THREE = /(\bfrom\s+)(['"])three\2/g;

/** every .ts file under `dir` */
function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** the module's path as `path`'s import names it */
function moduleFrom(path) {
  const to = relative(dirname(path), MODULE).split(sep).join('/').replace(/\.ts$/, '');
  return to.startsWith('.') ? to : `./${to}`;
}

const fix = process.argv.includes('--fix');
const offenders = [];
for (const path of sources(SRC)) {
  if (path === MODULE) continue;
  const text = readFileSync(path, 'utf8');
  if (!FROM_THREE.test(text)) continue;
  FROM_THREE.lastIndex = 0;
  offenders.push(relative(ROOT, path));
  if (fix) writeFileSync(path, text.replace(FROM_THREE, (_, from, quote) => `${from}${quote}${moduleFrom(path)}${quote}`));
}

if (fix) {
  console.log(`${offenders.length} files now take three through src/engine/three.ts`);
} else if (offenders.length) {
  console.error(`${offenders.length} files import 'three' itself; take it from src/engine/three.ts`
    + ' (npm run check:three -- --fix):');
  for (const path of offenders) console.error(`  ${path}`);
  process.exit(1);
} else {
  console.log('every file of src takes three through src/engine/three.ts');
}
