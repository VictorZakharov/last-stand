import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { pwa } from './scripts/pwa.ts';

// what the pause menu shows as the build: commit (a PR preview's head, set by its workflow) and time
function buildInfo(): { ref: string; time: string } {
  let sha = process.env.BUILD_SHA;
  try { sha ||= execSync('git rev-parse HEAD').toString().trim(); } catch { /* no git */ }
  const pr = process.env.BUILD_PR ? `PR #${process.env.BUILD_PR} · ` : '';
  return { ref: `${pr}${sha ? sha.slice(0, 7) : 'local'}`, time: new Date().toISOString() };
}

export default defineConfig({
  base: './',              // relative asset paths so dist/ works on any static host (e.g. GitHub Pages)
  plugins: [pwa()],
  define: { __BUILD__: JSON.stringify(buildInfo()) },       // app icons + offline service worker
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  server: { port: 5173, open: false },
});
