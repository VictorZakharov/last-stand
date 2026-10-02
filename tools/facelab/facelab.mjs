// Face harness: renders a hero's head in a studio (no biome, a grey backdrop, a soft key light from the front,
// the camera square to the face) and compares it with a reference picture, feature by feature (compare.py).
//
//   npm run facelab -- --setup                         once: the Python environment (tools/facelab/.venv)
//   npm run facelab -- --ref path/to/reference.jpg     render and compare (--class warrior, --tag name, --helm)
//
// It starts its own Vite dev server (a fresh one each run: a long-running one serves stale modules after edits)
// and a headless browser (the Playwright Chromium if installed, else Edge or Chrome). Output goes to
// tools/facelab/out/<tag>/: ours.png, the passes the comparison reads, the zoomed sheets and report.txt.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? def : process.argv[i + 1] ?? true; };
const flag = (name) => process.argv.includes(`--${name}`);
const VENV = join(HERE, '.venv'), PY = join(VENV, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (flag('setup')) {
  const sys = process.platform === 'win32' ? 'python' : 'python3';
  const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: 'inherit' }); if (r.status) process.exit(r.status); };
  if (!existsSync(PY)) run(sys, ['-m', 'venv', VENV]);
  run(PY, ['-m', 'pip', 'install', '-q', '-r', join(HERE, 'requirements.txt')]);
  console.log('facelab: ready');
  process.exit(0);
}

const REF = arg('ref'), CLS = arg('class', 'warrior'), TAG = arg('tag', 'latest'), SIZE = +arg('size', 1200), FOV = +arg('fov', 14);
if (!REF || !existsSync(REF)) { console.error('facelab: --ref <reference picture> is required (a front view of a face)'); process.exit(1); }
if (!existsSync(PY)) { console.error('facelab: run `npm run facelab -- --setup` first'); process.exit(1); }
const OUT = join(HERE, 'out', TAG);
mkdirSync(OUT, { recursive: true });

// the page must never capture the real pointer (the harness runs beside someone's desktop)
const NO_CAPTURE = () => {
  const no = () => Promise.resolve();
  for (const P of [Element.prototype, HTMLElement.prototype, HTMLCanvasElement.prototype]) {
    Object.defineProperty(P, 'requestPointerLock', { value: no, configurable: false, writable: false });
    Object.defineProperty(P, 'requestFullscreen', { value: no, configurable: false, writable: false });
  }
  if (navigator.keyboard) Object.defineProperty(navigator.keyboard, 'lock', { value: no, configurable: false });
};

async function browser() {
  const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try { return await chromium.launch({ headless: true, channel, args }); } catch { /* the next one */ }
  }
  throw new Error('facelab: no browser (install one: npx playwright install chromium)');
}

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const b = await browser();
try {
  const ctx = await b.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await ctx.addInitScript(NO_CAPTURE);
  await ctx.addCookies([['last-stand-class', CLS], ['last-stand-biome', 'forest'], ['last-stand-quality', 'high']].map(([name, value]) => ({ name, value, url })));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  if (flag('helm')) await p.evaluate(async () => {
    const { makeItem } = await import('/src/loot/items.ts'); const { equipFromStash } = await import('/src/loot/profile.ts'); const { CLASSES } = await import('/src/data/classes/index.ts');
    const pr = __G.profile, it = makeItem({ slot: 'head', rarity: 'rare', ilvl: 5, cls: CLASSES[pr.classId] }); pr.stash.push(it); equipFromStash(pr, it.id); __G.player.recomputeStats(pr.equipped);
  });
  await p.evaluate(async ({ fov }) => {
    const { THREE } = __dev, G = __G, pl = G.player, j = pl.model.joints, { toGroup } = await import('/src/entities/models/head.ts');
    // the dummies far ahead (the head turns to the nearest foe), the hero facing +z
    pl.facing = 0; setInterval(() => G.enemies.forEach((e) => e.pos.set(pl.pos.x, 0, pl.pos.z + 60)), 16);
    // the studio: no biome, a grey backdrop, a soft key light from the front and above, a broad fill
    for (const c of G.scene.children) if (c.name === 'forest' || c.name === 'crypt') c.visible = false;
    G.scene.background = new THREE.Color(0x8b8d90); G.scene.fog = null;
    const hemi = G.scene.children.find((c) => c.isHemisphereLight), key = G.scene.children.find((c) => c.isDirectionalLight);
    // (only DOM over the canvas is hidden: everything that isn't the canvas or one of its ancestors)
    const cv = G.renderer.domElement, keep = new Set(); for (let e = cv; e; e = e.parentElement) keep.add(e);
    document.querySelectorAll('body *').forEach((e) => { if (!keep.has(e)) e.style.visibility = 'hidden'; });
    const head = j.head.children.find((c) => c.isGroup);
    // the camera square to the face, in the head's own frame (the idle's tilt doesn't count)
    window.__studio = () => {
      head.updateWorldMatrix(true, false);
      const C = head.localToWorld(toGroup(0, 112, 40)), fw = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(head.matrixWorld);
      const right = new THREE.Vector3().crossVectors(fw, up);
      hemi.color.set(0xffffff); hemi.groundColor.set(0x6a6a6a); hemi.intensity = 1.3;
      key.color.set(0xfff4ea); key.intensity = 2.6; key.position.copy(C).addScaledVector(fw, 6).addScaledVector(up, 4).addScaledVector(right, 2); key.target.position.copy(C); key.target.updateMatrixWorld();
      const ext = head.localToWorld(toGroup(0, 300, 0)).distanceTo(head.localToWorld(toGroup(0, -40, 0)));
      return { C, fw, up, dist: ext / 2 / Math.tan((fov * Math.PI / 180) / 2) };
    };
    G.scene.onBeforeRender = (r, s, cam) => {
      if (cam !== G.camera) return;
      const { C, fw, up, dist } = window.__studio();
      cam.position.copy(C).addScaledVector(fw, dist); cam.up.copy(up); cam.lookAt(C);
      cam.fov = fov; cam.near = 0.1; cam.far = 50; cam.aspect = 1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      window.__cam = cam;
    };
    // where the model's own features are, projected to the image: what a landmark detector misreads on it (the chin under a beard)
    const F = await import('/src/entities/models/face.ts'), shape = F.FACES[G.profile.classId];
    window.__points = () => {
      const cam = window.__cam, W = cv.clientWidth, H = cv.clientHeight;
      const px = (x, y, z) => { const v = head.localToWorld(toGroup(x, y, z)).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
      const frontZ = (x, y) => { let z = 200; for (let i = 0; i < 400; i++) { const d = F.headSDF(x, y, z, shape); if (d < 0.05) break; z -= Math.max(0.2, d * 0.9); } return z; };
      // (the chin's visible bottom: down the middle until the front turns back under the jaw)
      let zmax = -1e9; for (let y = 30; y >= 0; y -= 0.5) zmax = Math.max(zmax, frontZ(0, y));
      let yb = 0, zb = zmax; for (let y = 20; y >= -40; y -= 0.5) { const z = frontZ(0, y); if (z < zmax - 15) break; yb = y; zb = z; }
      const E = F.EYE;
      return { chin: px(0, yb, zb), pupilR: px(-E.x, E.y, E.z + E.r), pupilL: px(E.x, E.y, E.z + E.r) };
    };
  }, { fov: FOV });
  await p.waitForTimeout(1500);
  const canvas = await p.evaluateHandle(() => __G.renderer.domElement);
  writeFileSync(join(OUT, 'ours.png'), await canvas.screenshot());
  writeFileSync(join(OUT, 'points.json'), JSON.stringify(await p.evaluate(() => window.__points())));
  // the hair alone: white over black, everything else black (so what hides it still does)
  await p.evaluate(() => {
    const { THREE } = __dev, G = __G, black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    G.scene.background = new THREE.Color(0x000000);
    G.scene.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      if (o.name === 'hair') { const m = o.material; o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: m.map, alphaTest: m.alphaTest, side: THREE.DoubleSide }); }
      else o.material = black;
    });
  });
  await p.waitForTimeout(800);
  writeFileSync(join(OUT, 'ours-hair.png'), await canvas.screenshot());
  // the face's own skin alone, the hair taken off
  await p.evaluate(() => {
    const { THREE } = __dev, G = __G, white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    G.scene.traverse((o) => { if (!o.isMesh && !o.isSkinnedMesh) return; if (o.name === 'hair') o.visible = false; else o.material = o.name === 'face' ? white : black; });
  });
  await p.waitForTimeout(800);
  writeFileSync(join(OUT, 'ours-face.png'), await canvas.screenshot());
  // the face's depth (white near), rendered straight (no grade, no bloom) over a range just round the head: where the
  // jaw stands in front of the neck the depth jumps, which is the jaw's outline as a photo shows it
  const depth = await p.evaluate(() => {
    const { THREE } = __dev, G = __G, cam = window.__cam.clone(), cv = G.renderer.domElement, W = cv.width, H = cv.height;
    const { dist } = window.__studio(); cam.near = dist - 0.25; cam.far = dist + 0.25; cam.updateProjectionMatrix();
    const scene = new THREE.Scene(), dm = new THREE.MeshDepthMaterial();
    G.scene.traverse((o) => {
      if (o.name !== 'face' || !o.isMesh) return;
      // (a copy sharing the geometry, where the face is: the game's scene is left as it is)
      o.updateWorldMatrix(true, false); const c = new THREE.Mesh(o.geometry, dm); c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); scene.add(c);
    });
    const rt = new THREE.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4), r = G.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, H, buf); r.setRenderTarget(prev);
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g2 = c2.getContext('2d'), img = g2.createImageData(W, H);
    // (the target's rows run up from the bottom)
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    g2.putImageData(img, 0, 0);
    return c2.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(join(OUT, 'ours-depth.png'), Buffer.from(depth, 'base64'));
  if (errs.length) console.error('facelab: page errors:', errs.join(' | '));
} finally {
  await b.close();
  await server.close();
}
const r = spawnSync(PY, [join(HERE, 'compare.py'), REF, OUT, TAG], { stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, GLOG_minloglevel: '3', TF_CPP_MIN_LOG_LEVEL: '3', PYTHONWARNINGS: 'ignore' } });
if (r.status) { console.error(String(r.stderr)); process.exit(r.status); }
console.log(`facelab: sheets and report in ${OUT}`);
