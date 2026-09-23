// Verifies that dist/index.html only references assets that resolve correctly
// when served from a GitHub Pages subpath. PAGES_BASE (e.g. /last-stand/pr-preview/pr-3/)
// is required for preview builds; production builds use relative ('./') paths.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repositoryRoot, 'dist', 'index.html'), 'utf8');
const base = process.env.PAGES_BASE || './';
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const localReferences = references.filter((reference) => (
  reference
  && !reference.startsWith('data:')
  && !reference.startsWith('http:')
  && !reference.startsWith('https:')
  && !reference.startsWith('#')
));
const invalidReferences = localReferences.filter((reference) => !reference.startsWith(base));

if (localReferences.length === 0) {
  throw new Error('Pages build contains no local asset references.');
}
if (invalidReferences.length > 0) {
  throw new Error(`Pages-unsafe asset paths (expected prefix ${base}): ${invalidReferences.join(', ')}`);
}

console.log(`GitHub Pages asset paths: PASS (${localReferences.length} references, base ${base})`);
