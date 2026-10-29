// Last Stand service worker, generated at build time by scripts/pwa.ts.
// Everything the game needs is precached at install, so it runs offline. The page itself comes from
// the network when it can (a plain reload shows a new deploy), the hashed files from the cache.
// A new deploy's worker takes over at once; the previous build's cache stays, so a page still
// running the old build can load its remaining chunks.
const SCOPE = new URL(self.registration.scope).pathname;
// The caches are the origin's, shared by every scope's worker (production's scope holds the PR previews', each with a
// worker of its own), so each worker's are named by its scope and it deletes only its own. Named alike, each preview
// visited deleted all but two, production's among them, and an app left on a preview build pruned since met Pages' 404.
const OWN = 'last-stand:' + SCOPE + ':';
const CACHE = OWN + '666fbb0a80e6';
// (every scope's, named before they were kept apart)
const LEGACY = /^last-stand-[0-9a-f]{12}$/;
const FONTS = 'last-stand-fonts';
const FILES = ["./","./AGENTS.md","./CLAUDE.md","./apple-touch-icon.png","./assets/arrowRain-DPC2HiDG.webp","./assets/blink-CgO5swT0.webp","./assets/bullRush-DM-StSWp.webp","./assets/cleave-D_nmb5el.webp","./assets/cobblestone-BGQyn0Uv.webp","./assets/cobblestone-height-BS1i_EDL.webp","./assets/crescent-BmQ7pavk.webp","./assets/crypt-motif-DejCbk91.mp3","./assets/fanShot-DVR-d09L.webp","./assets/forest-leaves-D0W22gw8.webp","./assets/forest-leaves-height-DuTxgWkM.webp","./assets/glacialNova-BrJO0T66.webp","./assets/hands.worker-DUweUi71.js","./assets/index-B3hNzHQY.js","./assets/index-kmdYvyd5.css","./assets/ironBellow-CMXd79pR.webp","./assets/maelstrom-CaJ3JU44.webp","./assets/nockShot-DTif6FyF.webp","./assets/oak-bark-B-BtZLqk.webp","./assets/pbr.worker-CdmMdUD4.js","./assets/piercingShot-CEUXIeYE.webp","./assets/potion-BEa_eMYm.webp","./assets/powerStrike-Bs8m55aK.webp","./assets/quarryMark-CmDkp1y8.webp","./assets/quiet-beginnings-Dh4Q9gvW.mp3","./assets/raiseShield-DaIZxmbK.webp","./assets/shadowed-dusk-_FMhuLNf.mp3","./assets/splinterBolt-tJ5fkB8j.webp","./assets/starfall-DG1o3ypa.webp","./assets/strawman-CVY8b7qX.webp","./assets/stump.worker-BlC8T-ME.js","./assets/sunlit-battle-Dwkjebkb.mp3","./assets/tempest-BL5GadRI.webp","./assets/three-ph2Y9SXU.js","./assets/twinFangs-D7pUbdJl.webp","./assets/voidLance-J9mI93gh.webp","./favicon.svg","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest"];
const PAGE_WAIT = 4000;   // ms before a slow network gives way to the cached page

self.addEventListener('install', (e) => {
  // revalidated: the HTTP cache (Pages: max-age=600) may still hold the previous build's page
  const reqs = FILES.map((f) => new Request(f, { cache: 'no-cache' }));
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // caches.keys() lists in creation order: keep this build's and the one before it (production's last unnamed one
    // when it has none); a preview leaves the unnamed ones to production
    const names = await caches.keys();
    const own = names.filter((k) => k.startsWith(OWN));
    const legacy = SCOPE.includes('/pr-preview/') ? [] : names.filter((k) => LEGACY.test(k));
    const keep = new Set([CACHE, own.filter((k) => k !== CACHE).pop() ?? legacy[legacy.length - 1]]);
    for (const k of [...own, ...legacy]) if (!keep.has(k)) await caches.delete(k);
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
