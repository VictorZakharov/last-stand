// A probe module's own files (tools/lab, `probe --ab`): the probe and the modules beside it that it imports, which
// an exported commit hasn't got. What it imports from the game (`src/`) is the commit's own, and the lab's page
// modules are copied into every exported tree as it boots.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** what a module imports by relative path: `from './x'`, `import './x'`, `import('./x')` */
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"?]+)(?:\?[^'"]*)?['"]/g;
/** the endings an import may leave off, tried in this order */
const ENDINGS = ['', '.ts', '.js', '.mjs', '/index.ts', '/index.js'];
/** the folders an exported commit brings, or gets from the lab: a probe's imports from them aren't copied */
const PROVIDED = ['src/', 'tools/lab/page/'];

const toSlashes = (path) => path.split('\\').join('/');

/** The file an import names, from the module at `from`, or null when there is none. */
function resolveImport(from, specifier) {
  const base = resolve(dirname(from), specifier);
  for (const ending of ENDINGS) {
    const candidate = base + ending;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * The probe at `entry` (a path under `root`) and every module it imports by relative path, at any depth, that the
 * game's tree and the lab don't provide: paths relative to `root`, with forward slashes, the probe first.
 */
export function probeFiles(root, entry) {
  const found = [];
  const pending = [resolve(root, entry)];
  const seen = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    const path = toSlashes(relative(root, file));
    if (seen.has(path)) continue;
    seen.add(path);
    const outside = path.startsWith('../') || isAbsolute(path);
    if (outside || PROVIDED.some((folder) => path.startsWith(folder))) continue;
    found.push(path);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const imported = resolveImport(file, match[1]);
      if (imported) pending.push(imported);
    }
  }
  return found;
}
