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
const CACHE = OWN + 'bd51b14eb7e3';
// (every scope's, named before they were kept apart)
const LEGACY = /^last-stand-[0-9a-f]{12}$/;
const FONTS = 'last-stand-fonts';
const FILES = ["./","./AGENTS.md","./CLAUDE.md","./apple-touch-icon.png","./assets/arrowRain-DPC2HiDG.webp","./assets/ash_color-CJFpracT.png","./assets/aspen_color-Cpgr1Q0w.png","./assets/birch_ao_1k-D_QkgyKp.jpg","./assets/birch_color_1k-BxIEDKXK.jpg","./assets/birch_normal_1k-CoYvyauc.jpg","./assets/birch_roughness_1k-nwUM-ujJ.jpg","./assets/blink-CgO5swT0.webp","./assets/bloodrush-CbexIF0i.webp","./assets/bullRush-DM-StSWp.webp","./assets/bulwark-CDBaFt7L.js","./assets/bulwark_bg-DlNebF1I.wasm","./assets/cinderburst-CRZugR7_.webp","./assets/cleave-D_nmb5el.webp","./assets/cobblestone-BGQyn0Uv.webp","./assets/cobblestone-height-BS1i_EDL.webp","./assets/colossus-CQKDnVgl.js","./assets/crescent-BmQ7pavk.webp","./assets/crypt-motif-DejCbk91.mp3","./assets/engraving.worker-BlWndBPl.js","./assets/fanShot-DVR-d09L.webp","./assets/fireBake.worker-CVCHSouD.js","./assets/foeKit-NnmHDb9b.js","./assets/forest-leaves-D0W22gw8.webp","./assets/forest-leaves-height-DuTxgWkM.webp","./assets/glacialNova-BrJO0T66.webp","./assets/hands.worker-CTyE8n7M.js","./assets/head.worker-21F7uO7E.js","./assets/hiddenBoot.worker-BCG7MDkf.js","./assets/index-BzRhHwSR.js","./assets/index-CB21UFZW.css","./assets/ironBellow-CMXd79pR.webp","./assets/lifethread-B3zYEhQr.webp","./assets/maelstrom-CaJ3JU44.webp","./assets/meshopt_simplifier.module-BzKFSBgH.js","./assets/nockShot-DTif6FyF.webp","./assets/oak-bark-B-BtZLqk.webp","./assets/oak_ao_1k-DUJgKwMD.jpg","./assets/oak_color-BAD6jIv3.png","./assets/oak_color_1k-Y6fizdck.jpg","./assets/oak_normal_1k-C8kyIEQv.jpg","./assets/oak_roughness_1k-CDkyKLZe.jpg","./assets/pbr.worker-B9b_GSX2.js","./assets/piercingShot-CEUXIeYE.webp","./assets/pine_ao_1k-M9zlsXzR.jpg","./assets/pine_color-3BIKvdLP.png","./assets/pine_color_1k-CQnxaxS7.jpg","./assets/pine_normal_1k-CKm2gZQI.jpg","./assets/pine_roughness_1k-D4KXjOPr.jpg","./assets/potion-BEa_eMYm.webp","./assets/pounce-DDRbkDMX.webp","./assets/powerStrike-Bs8m55aK.webp","./assets/quarryMark-CmDkp1y8.webp","./assets/quiet-beginnings-Dh4Q9gvW.mp3","./assets/raiseShield-DaIZxmbK.webp","./assets/rampage-Cc34-u82.webp","./assets/rolldown-runtime-DK3Fl9T5.js","./assets/savageFists-jerzyDEp.webp","./assets/shadowed-dusk-_FMhuLNf.mp3","./assets/simplify.worker-CoHA0LG7.js","./assets/splinterBolt-tJ5fkB8j.webp","./assets/starfall-DG1o3ypa.webp","./assets/stormcall-jnRgAKx0.webp","./assets/strawman-CVY8b7qX.webp","./assets/stump.worker-CyI922s3.js","./assets/sunlit-battle-Dwkjebkb.mp3","./assets/tempest-BL5GadRI.webp","./assets/thornheart-CCywN9S5.js","./assets/three-NqQfvUQv.js","./assets/twinFangs-D7pUbdJl.webp","./assets/twins-BeADINh6.js","./assets/unchained-Cat3-Jlo.webp","./assets/voidLance-J9mI93gh.webp","./assets/willow_ao_1k-CEi-a1m7.jpg","./assets/willow_color_1k-Cjz3kXt5.jpg","./assets/willow_normal_1k-DyDN-1zE.jpg","./assets/willow_roughness_1k-COeQgRxo.jpg","./assets/wrath-DLxTDsRW.webp","./favicon.svg","./google-signin.html","./icon-192.png","./icon-512.png","./icon.svg","./index.html","./manifest.webmanifest","./privacy.html"];
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
  // OAuth's return window must never bootstrap the game, even if the network drops on the way back.
  const fallback = url.pathname === SCOPE + 'google-signin.html' ? './google-signin.html' : './';
  e.respondWith(req.mode === 'navigate' ? page(req, fallback) : file(req));
});

// the page: from the network (revalidated past the HTTP cache), the cached copy when offline or slow
async function page(req, fallback) {
  const net = fetch(req, { cache: 'no-cache' });
  net.catch(() => {});
  try {
    const r = await Promise.race([net, new Promise((res) => setTimeout(res, PAGE_WAIT))]);
    if (r && r.ok) return r;
  } catch { /* offline */ }
  const hit = await caches.open(CACHE).then((c) => c.match(fallback));
  return hit || net;
}

// built files: from any build's cache (ignoreVary: module scripts send an Origin header the precache
// requests lacked; ignoreSearch: built files never vary), else the network
async function file(req) {
  const hit = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(req);
  // Optional portraits stay out of install downloads, but remain available offline once requested.
  if (response.ok && new URL(req.url).pathname.includes('/assets/portrait-')) {
    const cache = await caches.open(CACHE);
    await cache.put(req, response.clone());
  }
  return response;
}

// fonts: from the cache when there, refreshed from the network in the background
async function font(req) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(req);
  const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
