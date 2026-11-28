// The fight's server build: the game's own fight modules bundled for Node (`src/headless/fight.ts`), with what draws,
// plays sounds or reads the page swapped out. A module at `src/headless/swap/<path>` stands in for `src/<path>` in this
// build alone; the game's build never sees it. A swap exports what the real module does (the bundler refuses an import
// it lacks) and types each export as the real one's, so the two can't drift apart unseen.
import { defineConfig, type Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SRC = resolve(ROOT, 'src');
const SWAPS = resolve(SRC, 'headless', 'swap');
// (ez-tree from its source, as the game's build takes it: vite.config.ts)
const EZ_TREE = resolve(ROOT, 'node_modules/@dgreenheck/ez-tree/src/lib/index.js');

/** The swap standing in for the source module at `file`, if there is one. */
function swapOf(file: string): string | null {
  const inSrc = relative(SRC, file);
  if (inSrc.startsWith('..') || inSrc.startsWith('headless')) return null;
  const swap = resolve(SWAPS, inSrc);
  return existsSync(swap) ? swap : null;
}

/** Every import of a swapped module resolved to its swap. */
const headlessSwaps = (): Plugin => ({
  name: 'headless-swaps',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || source.startsWith('\0')) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (!resolved || resolved.external) return resolved;
    return swapOf(resolved.id.split('?')[0]) ?? resolved;
  },
});

export default defineConfig({
  root: ROOT,
  logLevel: 'warn',
  publicDir: false,
  plugins: [headlessSwaps()],
  resolve: { alias: { 'ez-tree': EZ_TREE } },
  define: { __BUILD__: JSON.stringify({ ref: 'fight', time: '' }), __DEV_TOOLS__: 'false' },
  build: {
    ssr: 'src/headless/fight.ts',
    outDir: resolve(ROOT, 'server/fight/dist'),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
  },
});
