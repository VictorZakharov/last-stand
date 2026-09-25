// Vite build plugin for the installable, offline game (PWA):
// - renders the PNG app icons from public/icon.svg (the repo keeps no binary assets),
// - links the Apple touch icon (iOS ignores the manifest's icons),
// - writes sw.js, a service worker that precaches every built file, so the game runs offline.
// The worker's cache name comes from a hash of the build, so each deploy installs a fresh cache;
// the page is served network-first, so a plain reload shows a new deploy.
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
// Everything the game needs is precached at install, so it runs offline. The page itself comes from
// the network when it can (a plain reload shows a new deploy), the hashed files from the cache.
// A new deploy's worker takes over at once; the previous build's cache stays, so a page still
// running the old build can load its remaining chunks.
const CACHE = 'last-stand-${version}';
const FONTS = 'last-stand-fonts';
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};
const SCOPE = new URL(self.registration.scope).pathname;
const PAGE_WAIT = 4000;   // ms before a slow network gives way to the cached page

self.addEventListener('install', (e) => {
  // revalidated: the HTTP cache (Pages: max-age=600) may still hold the previous build's page
  const reqs = FILES.map((f) => new Request(f, { cache: 'no-cache' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // caches.keys() lists in creation order: keep this build's and the one before it
    const builds = (await caches.keys()).filter((k) => k.startsWith('last-stand-') && k !== FONTS);
    const keep = new Set([CACHE, builds.filter((k) => k !== CACHE).pop()]);
    for (const k of builds) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// the page asks which build's cache this worker serves (ui/pwa.ts: is the page older?)
self.addEventListener('message', (e) => { if (e.data === 'cache') e.ports[0]?.postMessage(CACHE); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(font(req)); return; }
  if (url.origin !== location.origin || !url.pathname.startsWith(SCOPE)) return;
  // PR previews live under the production scope but have workers of their own
  if (url.pathname.slice(SCOPE.length).startsWith('pr-preview/')) return;
  e.respondWith(req.mode === 'navigate' ? page(req) : file(req));
});

// the page: from the network (revalidated past the HTTP cache), the cached copy when offline or slow
async function page(req) {
  const net = fetch(req, { cache: 'no-cache' });
  net.catch(() => {});
  try {
    const r = await Promise.race([net, new Promise((res) => setTimeout(res, PAGE_WAIT))]);
    if (r && r.ok) return r;
  } catch { /* offline */ }
  const hit = await caches.open(CACHE).then((c) => c.match('./'));
  return hit || net;
}

// built files: from any build's cache (ignoreVary: module scripts send an Origin header the precache
// requests lacked; ignoreSearch: built files never vary), else the network
async function file(req) {
  const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
  return hit || fetch(req);
}

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
