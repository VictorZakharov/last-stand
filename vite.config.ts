import { defineConfig } from 'vite';
import { pwa } from './scripts/pwa.ts';

export default defineConfig({
  base: './',              // relative asset paths so dist/ works on any static host (e.g. GitHub Pages)
  plugins: [pwa()],       // app icons + offline service worker
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined) },
    },
  },
  server: { port: 5173, open: false },
});
