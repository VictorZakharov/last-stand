// This tree's production build, served for a measure of its stalls (tools/stalls): built as `npm run build` builds it
// (into an output folder of the tool's own, so `dist` is left alone) and served by Vite's preview server.
import { build, preview } from 'vite';
import { join } from 'node:path';

/** the port the preview server tries first (the next free one is taken if it's in use) */
const PORT = 4790;

/** Builds the tree at `root` into `outDir`/dist and serves it. Returns its URL and `close`. */
export async function serveBuild(root, outDir) {
  const distDir = join(outDir, 'dist');
  await build({ root, logLevel: 'warn', build: { outDir: distDir, emptyOutDir: true } });
  const server = await preview({
    root,
    logLevel: 'warn',
    build: { outDir: distDir },
    preview: { port: PORT, strictPort: false, open: false },
  });
  return {
    url: server.resolvedUrls.local[0],
    close: () => server.close(),
  };
}
