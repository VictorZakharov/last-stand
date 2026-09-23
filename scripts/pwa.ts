// Vite build plugin for the installable, offline game (PWA):
// - renders the PNG app icons from public/icon.svg (the repo keeps no binary assets),
// - links the Apple touch icon (iOS ignores the manifest's icons),
// - writes sw.js, a service worker that precaches every built file, so the game runs offline.
// The worker's cache name comes from a hash of the build, so each deploy installs a fresh cache.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import type { Plugin } from 'vite';

const ICONS: [file: string, size: number][] = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];

export function pwa(): Plugin {
  let base = './';
  return {
    name: 'last-stand-pwa',
    apply: 'build',
    enforce: 'post',   // after Vite has emitted index.html, so the build hash covers it
    configResolved(config) { base = config.base; },
    transformIndexHtml: () => [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }, injectTo: 'head' }],
    generateBundle(_options, bundle) {
      const svg = readFileSync('public/icon.svg');
      for (const [fileName, size] of ICONS) {
        const source = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
        this.emitFile({ type: 'asset', fileName, source });
      }
      const files = [...new Set([...Object.keys(bundle), ...ICONS.map(([f]) => f), ...readdirSync('public')])]
        .filter((f) => !f.endsWith('.map')).sort();
      const html = bundle['index.html'];
      const version = createHash('sha256').update(files.join('\n')).update(html && 'source' in html ? html.source : '').digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, files) });
    },
  };
}

function serviceWorker(version: string, files: string[]): string {
  return `// Last Stand service worker, generated at build time by scripts/pwa.ts.
// Everything the game needs is precached at install, and served cache-first, so it runs offline.
// A new deploy installs its own cache and waits; the page offers a reload (skip-waiting message).
const CACHE = 'last-stand-${version}';
const FONTS = 'last-stand-fonts';
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('last-stand-') && k !== CACHE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(font(req)); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  // PR previews live under the production scope but have workers of their own
  if (url.pathname.slice(SCOPE.length).startsWith('pr-preview/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // ignoreVary: module scripts send an Origin header the precache requests lacked (built files never vary)
    const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true, ignoreVary: true });
    return hit || fetch(req);
  })());
});

// fonts: from the cache when there, refreshed from the network in the background
async function font(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
`;
}
