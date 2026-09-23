// The Crypt: cobblestone courtyard ringed by an octagonal gothic wall with four
// spawn gates, a raised central dais with obelisks, spirit beacons and braziers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ARENA } from '../data/balance';
import { cobblestone, slabs, pbrMaterialMaps, runeCircle } from '../core/textures';
import { particles, col } from '../fx/particles';
import { mulberry, rand, TAU } from '../util';
import { boxWithUV, buildEnvMap, placeGate, portalMembrane, WALL_R, GATE_W, type BiomeBuilder, type Portal, type Updater } from './props';
import type { Obstacle } from '../types';

export const buildCrypt: BiomeBuilder = (scene, renderer) => {
  const rng = mulberry(1337);
  const obstacles: Obstacle[] = [];
  const updaters: Updater[] = [];

  // --- Materials ------------------------------------------------------------
  const cob = cobblestone();
  const groundMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(cob, 26, 1.1), color: 0xb8bcc8 });
  const wallMaps = slabs(21, 6, 3);
  const wallMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wallMaps, 1, 1.2), color: 0x9ea4b4 });
  const daisMaps = slabs(33, 5, 5);
  const daisMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(daisMaps, 1, 1.2), color: 0xa8a8b0 });
  const darkStone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wallMaps, 1, 1), color: 0x60646e });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.9, roughness: 0.45 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xb8ad94, roughness: 0.75 });

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(65, 96).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  // CircleGeometry UVs span 0..1 over the diameter; repeat set in material maps.
  scene.add(ground);

  // --- Central dais -----------------------------------------------------------
  const h = ARENA.daisHalf;
  const lower = boxWithUV(2 * (h + 0.7), 0.18, 2 * (h + 0.7), 2.4);
  const lowerM = new THREE.Mesh(lower, daisMat); lowerM.position.y = 0.09;
  const upper = boxWithUV(2 * h, 0.35, 2 * h, 2);
  const upperM = new THREE.Mesh(upper, daisMat); upperM.position.y = 0.175;
  for (const m of [lowerM, upperM]) { m.receiveShadow = true; m.castShadow = true; scene.add(m); }

  // rune circle in the center of the dais
  const runeMat = new THREE.MeshBasicMaterial({
    map: runeCircle(7), color: new THREE.Color(0x40d0ff).multiplyScalar(0.8),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), runeMat);
  rune.position.y = ARENA.daisHeight + 0.02;
  scene.add(rune);
  let calm = 0, calmTarget = 0;
  updaters.push((dt: number, t: number) => {
    calm += (calmTarget - calm) * Math.min(1, dt * 2);
    const pulse = 0.55 + Math.sin(t * 1.6) * 0.15;
    // calm (lobby / between waves) brightens the circle slightly; keep the peak modest for bloom
    runeMat.color.setRGB(0.25, 0.8, 1.0).multiplyScalar(pulse * (0.6 + calm * 0.9));
    rune.rotation.y = t * 0.03;
  });

  // obelisks at the dais corners
  const obeliskGeo = buildObeliskGeo();
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x3ab8ff, emissiveIntensity: 2.2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (h - 0.5), z = sz * (h - 0.5);
    const ob = new THREE.Mesh(obeliskGeo, darkStone);
    ob.position.set(x, ARENA.daisHeight, z);
    ob.castShadow = ob.receiveShadow = true;
    scene.add(ob);
    // glowing glyph strips on the two outward faces
    for (const [fx, fz] of [[sx, 0], [0, sz]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(fx ? 0.02 : 0.12, 1.6, fz ? 0.02 : 0.12), glyphMat);
      strip.position.set(x + fx * 0.5, ARENA.daisHeight + 2.0, z + fz * 0.5);
      scene.add(strip);
    }
    obstacles.push({ x, z, r: 0.95 });
  }

  // --- Octagonal wall with gates -----------------------------------------------
  const portals: Portal[] = [];
  const wallParts: THREE.BufferGeometry[] = [];
  const crenParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const side = 2 * WALL_R * Math.tan(Math.PI / 8) + 0.6;
    const isGate = k % 2 === 0;
    const segs = isGate ? [[-side / 2, -GATE_W / 2], [GATE_W / 2, side / 2]] : [[-side / 2, side / 2]];
    for (const [s0, s1] of segs) {
      const len = s1 - s0, mid = (s0 + s1) / 2;
      const g = boxWithUV(len, 2.6, 1.6, 0.35);
      g.translate(mid, 1.3, 0);
      wallParts.push(orient(g, a));
      // buttresses + spikes along the wall
      const n = Math.max(1, Math.round(len / 3.6));
      for (let i = 0; i <= n; i++) {
        const u = s0 + (len * i) / n;
        const b = boxWithUV(0.9, 3.6, 2.2, 0.3); b.translate(u, 1.8, 0.3);
        crenParts.push(orient(b, a));
        const cap = new THREE.ConeGeometry(0.62, 1.1, 4).rotateY(Math.PI / 4); cap.translate(u, 4.15, 0.3);
        crenParts.push(orient(cap, a));
      }
    }
    if (isGate) portals.push(buildGate(scene, a, darkStone, updaters));
  }
  const walls = new THREE.Mesh(mergeGeometries(wallParts), wallMat);
  const crens = new THREE.Mesh(mergeGeometries(crenParts), darkStone);
  for (const m of [walls, crens]) { m.castShadow = m.receiveShadow = true; scene.add(m); }

  // --- Spirit beacons (blue flames) & braziers (orange): the biome's 6 point lights ---
  const beaconSpots = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
  for (const [x, z] of beaconSpots) {
    buildBeacon(scene, x, z, darkStone, updaters);
    obstacles.push({ x, z, r: 0.65 });
  }
  // on the middle of two opposite solid (non-gate) wall sides
  const brazierSpots = [Math.PI / 4, (5 * Math.PI) / 4].map((a) => [Math.cos(a) * (WALL_R - 2.2), Math.sin(a) * (WALL_R - 2.2)]);
  for (const [x, z] of brazierSpots) {
    buildBrazier(scene, x, z, iron, updaters);
    obstacles.push({ x, z, r: 0.7 });
  }

  // --- Clutter: rubble, bones, grates -------------------------------------------
  scatterClutter(scene, rng, darkStone, boneMat, iron);

  // --- Ambient motes & ground mist -------------------------------------------------
  let moteT = 0;
  updaters.push((dt: number) => {
    moteT += dt;
    while (moteT > 0.05) {
      moteT -= 0.05;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 30;
      particles.glow.spawn({
        x: Math.cos(a) * r, y: rand(0.3, 4), z: Math.sin(a) * r,
        vx: rand(-0.2, 0.2), vy: rand(0.05, 0.3), vz: rand(-0.2, 0.2),
        life: rand(3, 6), size: rand(0.04, 0.09), color: col(0x7fa8ff, 1.2), colorEnd: col(0x3040a0, 0.6), alpha: 0.8,
      });
      if (Math.random() < 0.25) {
        const b = Math.random() * TAU, rr = rand(12, 27);
        particles.smoke.spawn({
          x: Math.cos(b) * rr, y: 0.3, z: Math.sin(b) * rr, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), vy: 0.02,
          life: rand(6, 10), size: rand(5, 8), sizeEnd: 10, color: col(0x303a55), alpha: 0.07,
        });
      }
    }
  });

  return {
    look: {
      background: 0x030307,
      fog: { color: 0x040509, near: 42, far: 80 },
      hemi: { sky: 0x5a6c9a, ground: 0x0c0a12, intensity: 0.55 },
      moon: { color: 0xb8c8ff, intensity: 1.9, pos: [-16, 34, 12] },
      env: buildEnvMap(renderer, [0.25, 0.32, 0.5], [0.9, 0.95, 1.2]),
      envIntensity: 0.35,
    },
    obstacles,
    portals,
    setCalm(v: number) { calmTarget = v; },
    update(dt: number, t: number) { for (const u of updaters) u(dt, t); },
  };
};

// ---------------------------------------------------------------------------
// helpers

function orient(geo: THREE.BufferGeometry, angle: number): THREE.BufferGeometry {
  // local +Z faces arena center; place on the octagon side at `angle`
  geo.translate(0, 0, WALL_R + 0.8);
  geo.rotateY(-angle + Math.PI / 2);
  return geo.index ? geo.toNonIndexed() : geo;
}

function buildObeliskGeo(): THREE.BufferGeometry {
  const base = boxWithUV(1.7, 0.5, 1.7, 0.6); base.translate(0, 0.25, 0);
  const plinth = boxWithUV(1.3, 0.35, 1.3, 0.6); plinth.translate(0, 0.67, 0);
  const shaft = new THREE.CylinderGeometry(0.5, 0.72, 4.2, 4, 1).rotateY(Math.PI / 4); shaft.translate(0, 2.95, 0);
  const cap = new THREE.ConeGeometry(0.55, 0.9, 4).rotateY(Math.PI / 4); cap.translate(0, 5.5, 0);
  return mergeGeometries([base, plinth, shaft, cap].map((g) => g.toNonIndexed()));
}

function buildGate(scene: THREE.Object3D, angle: number, stone: THREE.Material, updaters: Updater[]): Portal {
  const g = new THREE.Group();
  const pillarGeo = boxWithUV(1.3, 5.2, 1.9, 0.35);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, stone);
    p.position.set(s * (GATE_W / 2 + 0.5), 2.6, 0);
    p.castShadow = p.receiveShadow = true;
    g.add(p);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 4).rotateY(Math.PI / 4), stone);
    spike.position.set(s * (GATE_W / 2 + 0.5), 6.0, 0);
    spike.castShadow = true;
    g.add(spike);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(GATE_W / 2 + 0.2, 0.45, 8, 24, Math.PI), stone);
  arch.position.y = 4.1; arch.castShadow = true;
  g.add(arch);
  const lintel = new THREE.Mesh(boxWithUV(GATE_W + 2.4, 0.6, 2.0, 0.4), stone);
  lintel.position.y = 5.0; lintel.castShadow = true;
  g.add(lintel);

  const { portal } = portalMembrane(g, angle, { a: [0.5, 0.05, 0.9], b: [1.0, 0.25, 0.35], core: [1.0, 0.6, 1.0] }, updaters);
  placeGate(g, angle);
  scene.add(g);
  return portal;
}

function buildBeacon(scene: THREE.Object3D, x: number, z: number, stone: THREE.Material, updaters: Updater[]): void {
  const pts = [[0.55, 0], [0.55, 0.15], [0.35, 0.25], [0.25, 0.9], [0.4, 1.05], [0.42, 1.15], [0, 1.15]].map(([a, b]) => new THREE.Vector2(a, b));
  const ped = new THREE.Mesh(new THREE.LatheGeometry(pts, 8), stone);
  ped.position.set(x, 0, z);
  ped.castShadow = ped.receiveShadow = true;
  scene.add(ped);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x60b0ff).multiplyScalar(1.1), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), flameMat);
  flame.position.set(x, 1.65, z);
  scene.add(flame);
  const light = new THREE.PointLight(0x5aa8ff, 5, 10, 2);
  light.position.set(x, 2.0, z);
  scene.add(light);
  let acc = 0;
  updaters.push((dt, t) => {
    const f = Math.sin(t * 7 + x) * 0.5 + Math.sin(t * 13 + z) * 0.5;
    flame.scale.set(1, 1.3 + f * 0.15, 1);
    light.intensity = 4.5 + f * 0.8;
    acc += dt;
    while (acc > 0.03) {
      acc -= 0.03;
      particles.glow.spawn({
        x: x + rand(-0.15, 0.15), y: 1.55, z: z + rand(-0.15, 0.15), vx: rand(-0.1, 0.1), vy: rand(0.8, 1.6), vz: rand(-0.1, 0.1),
        life: rand(0.5, 0.9), size: rand(0.2, 0.32), sizeEnd: 0.02, color: col(0x6ab8ff, 1.2), colorEnd: col(0x2030ff, 0.5), drag: 1,
      });
    }
  });
}

function buildBrazier(scene: THREE.Object3D, x: number, z: number, iron: THREE.Material, updaters: Updater[]): void {
  const pts = [[0.2, 0], [0.12, 0.1], [0.1, 0.8], [0.25, 0.9], [0.6, 1.1], [0.65, 1.25], [0.5, 1.2], [0, 1.05]].map(([a, b]) => new THREE.Vector2(a, b));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), iron);
  bowl.position.set(x, 0, z); bowl.castShadow = true;
  scene.add(bowl);
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5010).multiplyScalar(2.5) }));
  coals.position.set(x, 1.2, z);
  scene.add(coals);
  const light = new THREE.PointLight(0xff7a30, 14, 13, 2);
  light.position.set(x, 2.1, z);
  scene.add(light);
  let acc = 0;
  updaters.push((dt, t) => {
    light.intensity = 12 + Math.sin(t * 11 + x) * 2 + Math.sin(t * 23) * 1.5;
    acc += dt;
    while (acc > 0.02) {
      acc -= 0.02;
      particles.glow.spawn({
        x: x + rand(-0.35, 0.35), y: 1.25, z: z + rand(-0.35, 0.35), vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4), vz: rand(-0.2, 0.2),
        life: rand(0.4, 0.8), size: rand(0.35, 0.6), sizeEnd: 0.05, color: col(0xffa040, 2.2), colorEnd: col(0xff2000, 0.5), drag: 1.2,
      });
      if (Math.random() < 0.1) particles.glow.spawn({
        x: x + rand(-0.2, 0.2), y: 1.4, z: z + rand(-0.2, 0.2), vx: rand(-0.4, 0.4), vy: rand(2, 4), vz: rand(-0.4, 0.4),
        life: rand(1, 2), size: 0.06, color: col(0xffc060, 4), colorEnd: col(0xff4000, 1), drag: 0.5,
      });
    }
  });
}

function scatterClutter(scene: THREE.Object3D, rng: () => number, stone: THREE.Material, bone: THREE.Material, iron: THREE.Material): void {
  const r = (a: number, b: number) => a + rng() * (b - a);
  // rubble
  const rockGeo = new THREE.DodecahedronGeometry(0.2, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, stone, 260);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < rocks.count; i++) {
    let x, z;
    if (i < 90) { x = r(-ARENA.daisHalf + 0.3, ARENA.daisHalf - 0.3); z = r(-ARENA.daisHalf + 0.3, ARENA.daisHalf - 0.3); if (Math.hypot(x, z) < 3.8) { x *= 1.6; z *= 1.6; } }
    else { const a = r(0, TAU), rr = r(24, 28); x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
    const sc = r(0.3, i < 90 ? 0.9 : 1.8);
    e.set(r(0, 3), r(0, 3), r(0, 3)); q.setFromEuler(e); s.set(sc, sc * r(0.5, 1), sc);
    p.set(x, (i < 90 ? ARENA.daisHeight : 0) + 0.02, z);
    rocks.setMatrixAt(i, m.compose(p, q, s));
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // bones & skulls
  const boneGeo = new THREE.CapsuleGeometry(0.035, 0.35, 2, 6).rotateZ(Math.PI / 2);
  const bones = new THREE.InstancedMesh(boneGeo, bone, 120);
  for (let i = 0; i < bones.count; i++) {
    const a = r(0, TAU), rr = i < 50 ? r(1, ARENA.daisHalf) : r(6, 27);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    e.set(0, r(0, TAU), r(-0.2, 0.2)); q.setFromEuler(e); s.setScalar(r(0.7, 1.3));
    p.set(x, (Math.max(Math.abs(x), Math.abs(z)) < ARENA.daisHalf ? ARENA.daisHeight : 0) + 0.04, z);
    bones.setMatrixAt(i, m.compose(p, q, s));
  }
  bones.castShadow = true;
  scene.add(bones);
  const skullGeo = new THREE.SphereGeometry(0.12, 10, 8).scale(1, 0.9, 1.2);
  const skulls = new THREE.InstancedMesh(skullGeo, bone, 30);
  for (let i = 0; i < skulls.count; i++) {
    const a = r(0, TAU), rr = r(2, 27);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    e.set(r(-0.4, 0.4), r(0, TAU), 0); q.setFromEuler(e); s.setScalar(r(0.8, 1.2));
    p.set(x, (Math.max(Math.abs(x), Math.abs(z)) < ARENA.daisHalf ? ARENA.daisHeight : 0) + 0.1, z);
    skulls.setMatrixAt(i, m.compose(p, q, s));
  }
  skulls.castShadow = true;
  scene.add(skulls);

  // iron floor grates
  const grateGeo = new THREE.BoxGeometry(0.06, 0.04, 2.2);
  const grates = new THREE.InstancedMesh(grateGeo, iron, 8 * 9);
  let gi = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8, rr = 18.5;
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    for (let j = 0; j < 9; j++) {
      const off = (j - 4) * 0.26;
      e.set(0, -a, 0); q.setFromEuler(e); s.set(1, 1, 1);
      const ox = Math.cos(a + Math.PI / 2) * off, oz = Math.sin(a + Math.PI / 2) * off;
      grates.setMatrixAt(gi++, m.compose(p.set(cx + ox, 0.02, cz + oz), q, s));
    }
  }
  grates.receiveShadow = true;
  scene.add(grates);
}
