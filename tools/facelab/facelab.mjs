// Face harness: renders a hero's head in a studio (no biome, a grey backdrop, a soft key light from the front,
// the camera square to the face) and compares it with a reference picture, feature by feature (compare.py).
//
//   npm run facelab -- --setup                         once: the Python environment (tools/facelab/.venv)
//   npm run facelab -- --ref path/to/reference.jpg     render and compare (--class warrior, --tag name, --helm)
//   ... --turn path/to/head_                           and a turnaround's head views: head_front.png, head_34.png,
//                                                      head_side.png (cropped from one sheet, so at one scale)
//   ... --points path/to/points.json                   and landmarks placed by hand on the reference (annotate.py),
//                                                      against the model's own (landmarks.ts; points.py compares them)
//   With --turn the reference is also rebuilt in 3D (recon.py, kept in head_recon/ beside the views until they change)
//   and our head compared with it everywhere on its surface (dense.py); `node tools/facelab/fit.mjs <out dir>` then
//   fits the face's shape to it (see the README).
//
// It starts its own Vite dev server (a fresh one each run: a long-running one serves stale modules after edits)
// and the lab's headless browser (tools/lab/node/browser.mjs: Chromium in its native headless mode, no console
// window, its profile under tools/facelab/out). Output goes to tools/facelab/out/<tag>/: ours.png, the passes the
// comparison reads, the zoomed sheets and report.txt.
import { createServer } from 'vite';
import { launchBrowser, useLocalTemp } from '../lab/node/browser.mjs';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'fs';
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
  // the face model for rebuilding a reference in 3D (recon.py): the Basel Face Model as 3DDFA_V2 uses it, and its
  // network (the BFM's licence is for research: it stays in tools/facelab/models, never committed or shipped)
  const MODELS = join(HERE, 'models'), HF = 'https://huggingface.co/Stable-Human/3ddfa_v2/resolve/main/';
  mkdirSync(MODELS, { recursive: true });
  for (const f of ['bfm_noneck_v3.pkl', 'tri.pkl', 'param_mean_std_62d_120x120.pkl', 'resnet22.onnx']) {
    if (existsSync(join(MODELS, f))) continue;
    const r = await fetch(HF + f);
    if (!r.ok) { console.error(`facelab: couldn't fetch ${f} (${r.status})`); process.exit(1); }
    writeFileSync(join(MODELS, f), Buffer.from(await r.arrayBuffer()));
    console.log(`facelab: ${f}`);
  }
  console.log('facelab: ready');
  process.exit(0);
}

const REF = arg('ref'), TURN = arg('turn'), POINTS = arg('points'), CLS = arg('class', 'warrior'), TAG = arg('tag', 'latest'), SIZE = +arg('size', 1200), FOV = +arg('fov', 14);
// the key light's direction, as the reference is lit: degrees round from the front (+ from the picture's right) and up
const [KEY_AZ, KEY_EL] = String(arg('key', '20,30')).split(',').map(Number);
// how strong the soft fill from all round is against the key (the shading across the face in the report shows it: a
// reference whose sides darken more than ours as they turn from the light has less fill)
const FILL = +arg('fill', 1.3);
// both lights scaled together, so the forehead's lightness matches the reference's (a camera's exposure)
const EXPOSURE = +arg('exposure', 1.3);
if (!REF || !existsSync(REF)) { console.error('facelab: --ref <reference picture> is required (a front view of a face)'); process.exit(1); }
if (!existsSync(PY)) { console.error('facelab: run `npm run facelab -- --setup` first'); process.exit(1); }
const OUT = join(HERE, 'out', TAG);
mkdirSync(OUT, { recursive: true });
const QUIET = { ...process.env, GLOG_minloglevel: '3', TF_CPP_MIN_LOG_LEVEL: '3', PYTHONWARNINGS: 'ignore' };

// a turnaround's reference rebuilt in 3D, once per set of views (its side panel's turn decides where ours is shot from)
let REC = null, SIDE_AZ = 90;
if (TURN) {
  const views = ['front', '34', 'side'].map((v) => `${TURN}${v}.png`), rec = `${TURN}recon`, done = join(rec, 'recon.json');
  const newer = (f) => existsSync(f) && (!existsSync(done) || statSync(f).mtimeMs > statSync(done).mtimeMs);
  if (!existsSync(join(HERE, 'models', 'resnet22.onnx'))) console.warn('facelab: no face model for the 3D rebuild: run `npm run facelab -- --setup`');
  else {
    if (!existsSync(done) || [...views, POINTS, join(HERE, 'recon.py')].some((f) => f && newer(f))) {
      const r = spawnSync(PY, [join(HERE, 'recon.py'), rec, ...views.map((f, i) => `${['front', '34', 'side'][i]}=${f}`), ...(POINTS ? [`--points=${POINTS}`] : [])], { stdio: ['ignore', 'inherit', 'pipe'], env: QUIET });
      if (r.status) { console.error(String(r.stderr)); process.exit(r.status); }
    }
    REC = rec;
    SIDE_AZ = Math.min(90, Math.max(60, Math.round(Math.abs(JSON.parse(readFileSync(done, 'utf8')).yaw.side) / 5) * 5));
  }
}

// the page must never capture the real pointer (the harness runs beside someone's desktop)
const NO_CAPTURE = () => {
  const no = () => Promise.resolve();
  for (const P of [Element.prototype, HTMLElement.prototype, HTMLCanvasElement.prototype]) {
    Object.defineProperty(P, 'requestPointerLock', { value: no, configurable: false, writable: false });
    Object.defineProperty(P, 'requestFullscreen', { value: no, configurable: false, writable: false });
  }
  if (navigator.keyboard) Object.defineProperty(navigator.keyboard, 'lock', { value: no, configurable: false });
};

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
useLocalTemp(join(HERE, 'out'));
const b = await launchBrowser();
try {
  const ctx = await b.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await ctx.addInitScript(NO_CAPTURE);
  await ctx.addCookies([['last-stand-class', CLS], ['last-stand-biome', 'forest'], ['last-stand-quality', 'high']].map(([name, value]) => ({ name, value, url })));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  // (the grade's adaptation held off: the face's colours mustn't follow how much of the frame is dark hair)
  await p.goto(url + '?adapt=0'); await p.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 180000 });
  await p.waitForTimeout(2500);
  if (flag('helm')) await p.evaluate(async () => {
    const { makeItem } = await import('/src/loot/items.ts'); const { equipFromStash } = await import('/src/loot/profile.ts'); const { CLASSES } = await import('/src/data/classes/index.ts');
    const pr = __G.profile, it = makeItem({ slot: 'head', rarity: 'rare', ilvl: 5, cls: CLASSES[pr.classId] }); pr.stash.push(it); equipFromStash(pr, it.id); __G.player.recomputeStats(pr.equipped);
  });
  await p.evaluate(async ({ fov, kaz, kel, fill, exposure }) => {
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
      hemi.color.set(0xffffff); hemi.groundColor.set(0x6a6a6a); hemi.intensity = fill * exposure;
      // (only the studio's two lights: the biome's and the hero's own point lights flicker, and a run would differ from
      // the last by its moment; they're dimmed, not removed, so no shader recompiles)
      G.scene.traverse((o) => { if (o.isLight && o !== hemi && o !== key) o.intensity = 0; });
      // (the picture's right is the hero's left: -right)
      const az = kaz * Math.PI / 180, el = kel * Math.PI / 180;
      key.color.set(0xfff4ea); key.intensity = 2.6 * exposure; key.target.position.copy(C); key.target.updateMatrixWorld();
      key.position.copy(C).addScaledVector(fw, 7 * Math.cos(el) * Math.cos(az)).addScaledVector(right, -7 * Math.cos(el) * Math.sin(az)).addScaledVector(up, 7 * Math.sin(el));
      // (the clay views: a light from high to one side and little fill, so the shape's forms throw shadows; it turns with the
      // camera, so every view is lit alike)
      const cl = window.__clay;
      if (cl) {
        const a = cl.az - 0.8, e = 0.75, side = new THREE.Vector3().crossVectors(up, fw);
        key.position.copy(C).addScaledVector(fw, 7 * Math.cos(e) * Math.cos(a)).addScaledVector(side, 7 * Math.cos(e) * Math.sin(a)).addScaledVector(up, 7 * Math.sin(e));
        key.intensity = 3.2; hemi.intensity = 0.55;
      }
      const ext = head.localToWorld(toGroup(0, 300, 0)).distanceTo(head.localToWorld(toGroup(0, -40, 0)));
      return { C, fw, up, dist: ext / 2 / Math.tan((fov * Math.PI / 180) / 2) };
    };
    G.scene.onBeforeRender = (r, s, cam) => {
      if (cam !== G.camera) return;
      const { C, fw, up, dist } = window.__studio(), o = window.__orbit ?? { az: 0, el: 0 }, side = new THREE.Vector3().crossVectors(up, fw);
      // (square to the face, or orbiting round the head for the other views: az round towards his left, el up)
      cam.position.copy(C).addScaledVector(fw, dist * Math.cos(o.el) * Math.cos(o.az)).addScaledVector(side, dist * Math.cos(o.el) * Math.sin(o.az)).addScaledVector(up, dist * Math.sin(o.el));
      cam.up.copy(up); cam.lookAt(C);
      cam.fov = fov; cam.near = 0.1; cam.far = 50; cam.aspect = 1; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      window.__cam = cam;
    };
    // where the model's own features are, projected to the image: what a landmark detector misreads on it (the chin under a beard)
    const F = await import('/src/entities/models/face.ts'), shape = F.FACES[G.profile.classId], LM = await import('/tools/facelab/landmarks.ts');
    const frontLm = LM.frontPoints(shape);
    window.__points = () => {
      const cam = window.__cam, W = cv.clientWidth, H = cv.clientHeight;
      const px = (x, y, z) => { const v = head.localToWorld(toGroup(x, y, z)).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
      const frontZ = (x, y) => { let z = 200; for (let i = 0; i < 400; i++) { const d = F.headSDF(x, y, z, shape); if (d < 0.05) break; z -= Math.max(0.2, d * 0.9); } return z; };
      // (the chin's visible bottom: down the middle until the front turns back under the jaw)
      let zmax = -1e9; for (let y = 30; y >= 0; y -= 0.5) zmax = Math.max(zmax, frontZ(0, y));
      let yb = 0, zb = zmax; for (let y = 20; y >= -40; y -= 0.5) { const z = frontZ(0, y); if (z < zmax - 15) break; yb = y; zb = z; }
      const E = F.EYE;
      // the anthropometric landmarks (landmarks.ts), his left side and its mirror on his right
      const lm = {};
      for (const [k, [x, y, z]] of Object.entries(frontLm)) {
        if (x > 0.5) { lm[k + '_l'] = px(x, y, z); lm[k + '_r'] = px(-x, y, z); } else lm[k] = px(x, y, z);
      }
      return { chin: px(0, yb, zb), pupilR: px(-E.x, E.y, E.z + E.r), pupilL: px(E.x, E.y, E.z + E.r), lm };
    };
    // the turnaround's views: pixels per mm in the head's middle plane, the near eye, the ear canal
    window.__turnPoints = () => {
      const cam = window.__cam, W = cv.clientWidth, H = cv.clientHeight;
      const px = (x, y, z) => { const v = head.localToWorld(toGroup(x, y, z)).project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
      const a = px(0, 62, 40), b = px(0, 162, 40), E = F.EYE;
      return { mm: Math.hypot(a[0] - b[0], a[1] - b[1]) / 100, eye: px(E.x, E.y, E.z + E.r), ear: px(75, 97, 0), nasion: px(0, 124, 90) };
    };
  }, { fov: FOV, kaz: KEY_AZ, kel: KEY_EL, fill: FILL, exposure: EXPOSURE });
  await p.waitForTimeout(1500);
  const canvas = await p.evaluateHandle(() => __G.renderer.domElement);
  writeFileSync(join(OUT, 'ours.png'), await canvas.screenshot());
  writeFileSync(join(OUT, 'points.json'), JSON.stringify(await p.evaluate(() => window.__points())));
  // the same, in grey clay under the same light (no hair, no paint): how much of the face's light and shade is its shape
  await p.evaluate(() => {
    const { THREE } = __dev, G = __G, clay = new THREE.MeshStandardMaterial({ color: 0xb4aca4, roughness: 0.7 });
    window.__clayRestore = [];
    G.scene.traverse((o) => { if (!o.isMesh && !o.isSkinnedMesh) return; window.__clayRestore.push([o, o.material, o.visible]); if (o.name === 'hair') o.visible = false; else o.material = clay; });
  });
  await p.waitForTimeout(400);
  writeFileSync(join(OUT, 'ours-clay.png'), await canvas.screenshot());
  await p.evaluate(() => { for (const [o, m, v] of window.__clayRestore) { o.material = m; o.visible = v; } });
  await p.waitForTimeout(300);
  // the other views, which the reference doesn't show but the game does (from above and behind most of all): a three-
  // quarter view, the side, the back, and from above behind as the third-person camera sees it
  for (const [name, az, el] of [['three-quarter', 40, 5], ['side', 90, 0], ['back', 180, 10], ['above', 160, 50]]) {
    await p.evaluate(([a, e]) => { window.__orbit = { az: a * Math.PI / 180, el: e * Math.PI / 180 }; }, [az, el]);
    await p.waitForTimeout(400);
    writeFileSync(join(OUT, `view-${name}.png`), await canvas.screenshot());
  }
  // the shape alone, in grey clay (no hair, no paint) from all round: what the face's shape is, which paint and hair hide
  await p.evaluate(() => {
    const { THREE } = __dev, G = __G, clay = new THREE.MeshStandardMaterial({ color: 0xb4aca4, roughness: 0.7 });
    window.__clayRestore = [];
    G.scene.traverse((o) => { if (!o.isMesh && !o.isSkinnedMesh) return; window.__clayRestore.push([o, o.material, o.visible]); if (o.name === 'hair') o.visible = false; else o.material = clay; });
  });
  for (const [name, az, el] of [['front', 0, 0], ['three-quarter-r', -35, 0], ['profile-r', -90, 0], ['three-quarter-l', 35, 0], ['profile-l', 90, 0], ['below', 0, -30], ['above', 0, 40]]) {
    await p.evaluate(([a, e]) => { window.__orbit = { az: a * Math.PI / 180, el: e * Math.PI / 180 }; window.__clay = { az: a * Math.PI / 180 }; }, [az, el]);
    await p.waitForTimeout(400);
    writeFileSync(join(OUT, `clay-${name}.png`), await canvas.screenshot());
  }
  await p.evaluate(() => { for (const [o, m, v] of window.__clayRestore) { o.material = m; o.visible = v; } window.__clay = null; });
  // a turnaround's views: ours at a sweep of three-quarter turns (turn.py picks the one matching the reference's) and the
  // side, as it looks and in clay, and the side's outline (the skin alone, and with the hair)
  if (TURN) {
    const AZ = [20, 25, 30, 35, 40, 45, 60, 65, 70, 75, 80, 85, 90], pts = {};
    const shoot = async (name, az) => {
      await p.evaluate((a) => { window.__orbit = { az: a * Math.PI / 180, el: 0 }; }, az);
      await p.waitForTimeout(400);
      writeFileSync(join(OUT, name), await canvas.screenshot());
    };
    for (const az of AZ) { await shoot(`turn-${az}.png`, az); pts[az] = await p.evaluate(() => window.__turnPoints()); }
    writeFileSync(join(OUT, 'turn-points.json'), JSON.stringify(pts));
    await p.evaluate(() => {
      const { THREE } = __dev, G = __G, clay = new THREE.MeshStandardMaterial({ color: 0xb4aca4, roughness: 0.7 });
      window.__clayRestore = [];
      G.scene.traverse((o) => { if (!o.isMesh && !o.isSkinnedMesh) return; window.__clayRestore.push([o, o.material, o.visible]); if (o.name === 'hair') o.visible = false; else o.material = clay; });
    });
    for (const az of AZ) { await p.evaluate((a) => { window.__clay = { az: a * Math.PI / 180 }; }, az); await shoot(`turn-clay-${az}.png`, az); }
    await p.evaluate(() => {
      const { THREE } = __dev, G = __G, white = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const [o] of window.__clayRestore) o.material = white;
      window.__bg = G.scene.background; G.scene.background = new THREE.Color(0x000000);
    });
    // (rendered straight into a target: the game's bloom and grade would blur the outline)
    const raw = async (name) => {
      await p.evaluate((a) => { window.__orbit = { az: a * Math.PI / 180, el: 0 }; }, SIDE_AZ);
      await p.waitForTimeout(300);
      const png = await p.evaluate(() => {
        const { THREE } = __dev, G = __G, cam = G.camera, cv = G.renderer.domElement, W = cv.width, H = cv.height, r = G.renderer;
        G.scene.onBeforeRender(r, G.scene, cam);
        const rt = new THREE.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4), prev = r.getRenderTarget();
        r.setRenderTarget(rt); r.setClearColor(0x000000, 1); r.clear(); r.render(G.scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, H, buf); r.setRenderTarget(prev);
        const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g2 = c2.getContext('2d'), img = g2.createImageData(W, H);
        for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        g2.putImageData(img, 0, 0);
        return c2.toDataURL('image/png').split(',')[1];
      });
      writeFileSync(join(OUT, name), Buffer.from(png, 'base64'));
    };
    await raw('turn-sil.png');
    await p.evaluate(() => {
      const { THREE } = __dev;
      for (const [o, m, v] of window.__clayRestore) if (o.name === 'hair') { o.visible = v; o.material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: m.map, alphaTest: m.alphaTest, side: THREE.DoubleSide }); }
    });
    await raw('turn-silhair.png');
    await p.evaluate(() => { for (const [o, m, v] of window.__clayRestore) { o.material = m; o.visible = v; } window.__clay = null; __G.scene.background = window.__bg; });
  }
  await p.evaluate(() => { window.__orbit = null; });
  await p.waitForTimeout(400);
  // which mesh shows where, each in a flat colour (face red, the neck green, ears yellow, eyes cyan, hair blue, the rest
  // grey): what a surface in the picture actually is
  await p.evaluate(() => {
    const { THREE } = __dev, G = __G, j = G.player.model.joints, flat = (c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const neck = new Set(j.neck.children.filter((o) => o.isMesh)), head = j.head.children.find((c) => c.isGroup);
    const ears = new Set(head.children.filter((o) => o.isMesh && o.name !== 'face' && o.name !== 'hair' && o.geometry.attributes.color && !o.material.map));
    const eyes = new Set(head.children.filter((o) => o.isMesh && o.material.map && o.name !== 'face' && o.name !== 'hair'));
    window.__restore = [];
    G.scene.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      window.__restore.push([o, o.material]);
      const c = o.name === 'face' ? 0xff0000 : o.name === 'hair' ? 0x0000ff : neck.has(o) ? 0x00ff00 : ears.has(o) ? 0xffff00 : eyes.has(o) ? 0x00ffff : 0x808080;
      o.material = o.name === 'hair' ? new THREE.MeshBasicMaterial({ color: c, map: o.material.map, alphaTest: o.material.alphaTest, side: THREE.DoubleSide }) : flat(c);
    });
  });
  await p.waitForTimeout(600);
  writeFileSync(join(OUT, 'ours-parts.png'), await canvas.screenshot());
  await p.evaluate(() => { for (const [o, m] of window.__restore) o.material = m; });
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
  // a beard of cards: its shape (beard.ts) at rest, over each body it may lie on (the chest item worn or not), and its
  // cards the body hides as the hero stands
  const beard = await p.evaluate(async (cls) => {
    const B = await import('/tools/facelab/beard.ts'), { buildModel } = await import('/src/entities/models/index.ts'), { CLASSES } = await import('/src/data/classes/index.ts');
    const G = __G, who = CLASSES[cls].model;
    if (!G.player.model.root.getObjectByName('beard')) return null;
    const m = buildModel(who), out = [];
    for (const chest of [true, false]) {
      m.setGear({ ...G.player.gear, helm: false, chest, hands: true });
      out.push([chest ? 'chest item' : 'no chest item', B.measureBeard(m.root, who)]);
    }
    m.dispose?.();
    return { rest: out, hidden: B.measureBeard(G.player.model.root, who).hidden };
  }, CLS);
  if (beard) {
    const lines = ['', "beard (beard.ts; mm in the face's frame, at rest; widths against the jaw's)"];
    for (const [i, [name, b]] of beard.rest.entries()) {
      for (const [k, d] of [['front', b.front], ['side', b.sideView]]) writeFileSync(join(OUT, `beard-${k}-${i}.png`), Buffer.from(d.split(',')[1], 'base64'));
      lines.push(`  ${name} (beard-front-${i}.png, beard-side-${i}.png): ${b.len.toFixed(0)} mm below the chin, widest ${b.flare} of the jaw, rows split ${b.split}, full ${b.fill}`,
        `    tapering ${b.taper.join(' ')} (a quarter, half, three quarters, nine tenths down), cards hidden by the body ${b.hidden}`,
        `    cheek line at 20 30 40 50 mm out: ${b.cheek.join(' ')}, at the face's outline ${b.cheekOut}; side (back..front) ${b.side.join(', ')}; deepest ${b.depth} mm`);
    }
    lines.push(`  as the hero stands: cards hidden by the body ${beard.hidden}`);
    writeFileSync(join(OUT, 'beard.txt'), lines.join('\n') + '\n');
  }
  // the hair (hair.ts: a wig's edge, a bob's hem, the ears covered), the shoulders (shoulders.ts: the slope from the neck,
  // a coat hanger's bump) and the neck (neck.ts: its girth up from the collar against a man's, the seam into the head's
  // skin), on a model at rest, without armour and with the chest item
  const body = await p.evaluate(async (cls) => {
    const Hm = await import('/tools/facelab/hair.ts'), Sh = await import('/tools/facelab/shoulders.ts'), Nk = await import('/tools/facelab/neck.ts'), { buildModel } = await import('/src/entities/models/index.ts'), { CLASSES } = await import('/src/data/classes/index.ts');
    const G = __G, who = CLASSES[cls].model, m = buildModel(who), out = { hair: null, shoulders: [], neck: [] };
    for (const chest of [false, true]) {
      m.setGear({ ...G.player.gear, helm: false, chest, hands: false });
      if (!chest) out.hair = Hm.measureHair(m.root, who);
      out.shoulders.push([chest ? 'chest item' : 'no chest item', Sh.measureShoulders(m)]);
      out.neck.push([chest ? 'chest item' : 'no chest item', Nk.measureNeck(m)]);
    }
    m.dispose?.();
    return out;
  }, CLS);
  {
    const h = body.hair, lines = ['', "hair (hair.ts; mm in the face's frame, at rest)"];
    if (h) lines.push(`  off the skin just behind the hairline (90th percentile): forehead ${h.edgeFront}, temples ${h.edgeTemple}`,
      `  locks' ends' heights (10th 50th 90th percentiles): at the sides ${h.endsSide.join(' ')}, behind ${h.endsBack.join(' ')}; ears covered ${h.ears}`);
    lines.push('shoulders (shoulders.ts; the front outline from the neck out)');
    for (const [name, sides] of body.shoulders) lines.push(`  ${name}: ` + sides.map((x) => `${x.side} slope ${x.slope} deg, bump ${x.bump} mm`).join('; '));
    lines.push("neck (neck.ts; girth as a share of the head's: a man's 0.69, 0.76 at the base; heights above the collar at the back)");
    for (const [name, n] of body.neck) {
      if (!n) { lines.push(`  ${name}: not measured`); continue; }
      lines.push(`  ${name}: head ${n.head} mm round; neck just above the collar ${n.base}, narrowest ${n.min} at ${n.minAt} mm, under the jaw ${n.top}, change ${n.taper} per 10 mm; collar ${n.c7} mm from a man's C7`,
        `    seam into the head's skin at ${n.seam.y.join(' ')} mm (10th 50th 90th round it): step ${n.seam.step} mm, crease ${n.seam.turn} deg, colour dE ${n.seam.dE}, relief above it ${n.seam.relief} deg, roughness ${n.seam.rough} over the neck's`,
        `    by sector (height/step/dE/L head/L neck/crease): ${n.seam.sectors}`);
    }
    writeFileSync(join(OUT, 'body.txt'), lines.join('\n') + '\n');
  }
  if (errs.length) console.error('facelab: page errors:', errs.join(' | '));
} finally {
  await b.close();
  await server.close();
}
const r = spawnSync(PY, [join(HERE, 'compare.py'), REF, OUT, TAG], { stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, GLOG_minloglevel: '3', TF_CPP_MIN_LOG_LEVEL: '3', PYTHONWARNINGS: 'ignore' } });
if (r.status) { console.error(String(r.stderr)); process.exit(r.status); }
for (const f of ['beard.txt', 'body.txt']) if (existsSync(join(OUT, f))) { const t = readFileSync(join(OUT, f), 'utf8'); process.stdout.write(t); writeFileSync(join(OUT, 'report.txt'), readFileSync(join(OUT, 'report.txt'), 'utf8') + t); }
if (POINTS) {
  const t = spawnSync(PY, [join(HERE, 'points.py'), POINTS, REF, OUT], { stdio: ['ignore', 'inherit', 'pipe'], env: { ...process.env, PYTHONWARNINGS: 'ignore' } });
  if (t.status) { console.error(String(t.stderr)); process.exit(t.status); }
}
if (TURN) {
  const t = spawnSync(PY, [join(HERE, 'turn.py'), TURN, OUT, String(SIDE_AZ)], { stdio: ['ignore', 'inherit', 'pipe'], env: QUIET });
  if (t.status) { console.error(String(t.stderr)); process.exit(t.status); }
}
if (REC) {
  const t = spawnSync(PY, [join(HERE, 'dense.py'), OUT, REC, CLS, ...(POINTS ? [POINTS] : [])], { stdio: ['ignore', 'inherit', 'pipe'], env: QUIET });
  if (t.status) { console.error(String(t.stderr)); process.exit(t.status); }
}
console.log(`facelab: sheets and report in ${OUT}`);
