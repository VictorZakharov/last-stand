// Last Stand service worker, generated at build time by scripts/pwa.ts.
// Everything the game needs is precached at install, and served cache-first, so it runs offline.
// A new deploy installs its own cache and waits; the page offers a reload (skip-waiting message).
const CACHE = 'last-stand-f0ba6f3f7094';
const FONTS = 'last-stand-fonts';
const FILES = ["./","./apple-touch-icon.png","./assets/CapePhysicsWorker-BI9waX2Z.js","./assets/index-BT6m9JIM.css","./assets/index-PQkhTXCq.js","./assets/nostr-C4hmC5-m.js","./assets/pbr.worker-CMbq6yOj.js","./assets/three-B9CJUW7P.js","./favicon.svg","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest"];
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
