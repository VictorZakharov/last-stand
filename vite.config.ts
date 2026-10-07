import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pwa } from './scripts/pwa.ts';

// ez-tree (procedural trees) from its source, not its build, which carries its bark and leaf pictures inlined: its
// texture module is swapped for a stub (src/world/ezTreeTextures.ts), so none of them ship
const slash = (p: string): string => p.split('\\').join('/').toLowerCase();
const EZ_TREE = fileURLToPath(new URL('./node_modules/@dgreenheck/ez-tree/src/lib/', import.meta.url)).split('\\').join('/');
const ezTreeTextures = () => ({
  name: 'ez-tree-textures',
  enforce: 'pre' as const,
  resolveId(source: string, importer?: string) {
    if (source === './textures' && importer && slash(importer).startsWith(slash(EZ_TREE))) return fileURLToPath(new URL('./src/world/ezTreeTextures.ts', import.meta.url));
    return null;
  },
});

// what the pause menu shows as the build: commit (a PR preview's head, set by its workflow) and time
function buildInfo(): { ref: string; time: string } {
  let sha = process.env.BUILD_SHA;
  try { sha ||= execSync('git rev-parse HEAD').toString().trim(); } catch { /* no git */ }
  const pr = process.env.BUILD_PR ? `PR #${process.env.BUILD_PR} · ` : '';
  return { ref: `${pr}${sha ? sha.slice(0, 7) : 'local'}`, time: new Date().toISOString() };
}

export default defineConfig({
  base: './',              // relative asset paths so dist/ works on any static host (e.g. GitHub Pages)
  plugins: [ezTreeTextures(), pwa()],
  resolve: { alias: { 'ez-tree': EZ_TREE + 'index.js' } },
  // (served from its source as it is, not pre-bundled: the dev server's pre-bundling is esbuild's and never meets the
  // stub above, so every dev boot fetched and decoded all of ez-tree's pictures)
  optimizeDeps: { exclude: ['ez-tree'] },
  define: { __BUILD__: JSON.stringify(buildInfo()) },       // app icons + offline service worker
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  server: { port: 5173, open: false },
});
