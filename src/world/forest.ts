// The Thornwood: a moonlit clearing walled in by thickets, boulders and old trees,
// with four root-arch spawn gates, a mossy stone dais ringed by standing stones,
// glowcap mushroom clusters and two bonfires. Stumps, logs and boulders break up the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../state';
import { ARENA } from '../data/balance';
import { forestFloor, bark, slabs, grunge, pbrMaterialMaps, runeCircle } from '../core/textures';
import { particles, col } from '../fx/particles';
import { makeFbm, mulberry, rand, TAU } from '../util';
import { boxWithUV, buildEnvMap, buildGrassGeo, lumpy, placeGate, portalMembrane, setInstance, WALL_R, GATE_W, type BiomeBuilder, type Portal, type Updater } from './props';
import type { Obstacle } from '../types';

const GATES = [0, 1, 2, 3].map((k) => (k / 4) * TAU);
/** angular distance from `a` to the nearest spawn gate */
const gateGap = (a: number) => Math.min(...GATES.map((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g)))));

/**
 * Foliage between the camera and the player dissolves (screen-door dither), so the tree
 * line never hides the player at the edge of the clearing. Only the main pass: shadows stay.
 */
const focus = { value: new THREE.Vector3() };
function seeThrough<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFocus = focus;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 seeWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          seeWp = instanceMatrix * seeWp;
        #endif
        vSeeWp = (modelMatrix * seeWp).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeeWp;\nuniform vec3 uFocus;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec3 seeCa = uFocus - cameraPosition;
        float seeL = length(seeCa);
        vec3 seeDir = seeCa / seeL, seeCp = vSeeWp - cameraPosition;
        float seeAlong = dot(seeCp, seeDir);
        if (seeAlong > 0.0 && seeAlong < seeL - 1.0) {
          float seeFade = 1.0 - smoothstep(2.5, 5.0, length(seeCp - seeDir * seeAlong));
          float seeN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (seeN < seeFade * 0.9) discard;
        }`);
  };
  m.customProgramCacheKey = () => 'seethrough';
  return m;
}

/** Large moss patches tinted over the floor in world space (a texture this big would tile visibly). */
function mossyGround<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMossXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMossXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vMossXZ;
        float mossH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float mossN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mossH(i), mossH(i+vec2(1,0)), f.x), mix(mossH(i+vec2(0,1)), mossH(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mossV = mossN(vMossXZ * 0.11) * 0.6 + mossN(vMossXZ * 0.37 + 7.0) * 0.3 + mossN(vMossXZ * 1.3) * 0.1;
        float moss = smoothstep(0.4, 0.7, mossV);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.09, 0.025) * (0.7 + mossN(vMossXZ * 3.1) * 0.6), moss * 0.75);`);
  };
  m.customProgramCacheKey = () => 'mossyground';
  return m;
}

export const buildForest: BiomeBuilder = (scene, renderer) => {
  const rng = mulberry(4242);
  const r = (a: number, b: number) => a + rng() * (b - a);
  const obstacles: Obstacle[] = [];
  const updaters: Updater[] = [];
  const h = ARENA.daisHalf;

  // --- Materials ------------------------------------------------------------
  const groundMat = mossyGround(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(forestFloor(), 22, 1.2), color: 0xffffff }));
  const daisMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(slabs(47, 5, 5), 1, 1.2), color: 0x94a488 });
  const stoneMaps = pbrMaterialMaps(grunge(), 2, 1.6);
  const stone = new THREE.MeshStandardMaterial({ ...stoneMaps, color: 0x70746a, roughness: 0.9 });
  const mossStone = new THREE.MeshStandardMaterial({ ...stoneMaps, color: 0x5a6a48, roughness: 0.95 });
  const barkMaps = pbrMaterialMaps(bark(), 1, 1.6);
  const barkMat = new THREE.MeshStandardMaterial({ ...barkMaps, color: 0xd8c8b0 });
  const leafMat = seeThrough(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }));
  const bushMat = seeThrough(new THREE.MeshStandardMaterial({ color: 0x1f3317, roughness: 0.9, flatShading: true }));
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0c2a24, emissive: 0x2affc8, emissiveIntensity: 0.75, roughness: 0.5 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.8 });
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6aff7a, emissiveIntensity: 2.0 });

  // --- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(65, 96).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Central dais: old mossy flagstones with a green rune circle ------------
  const lowerM = new THREE.Mesh(boxWithUV(2 * (h + 0.7), 0.18, 2 * (h + 0.7), 2.4), daisMat); lowerM.position.y = 0.09;
  const upperM = new THREE.Mesh(boxWithUV(2 * h, 0.35, 2 * h, 2), daisMat); upperM.position.y = 0.175;
  for (const m of [lowerM, upperM]) { m.receiveShadow = m.castShadow = true; scene.add(m); }
  const runeMat = new THREE.MeshBasicMaterial({ map: runeCircle(11), color: 0x000000, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), runeMat);
  rune.position.y = ARENA.daisHeight + 0.02;
  scene.add(rune);
  let calm = 0, calmTarget = 0;
  updaters.push((dt, t) => {
    calm += (calmTarget - calm) * Math.min(1, dt * 2);
    const pulse = 0.55 + Math.sin(t * 1.3) * 0.15;
    runeMat.color.setRGB(0.35, 1.0, 0.45).multiplyScalar(pulse * (0.5 + calm * 0.8));
    rune.rotation.y = -t * 0.025;
  });

  // standing stones at the dais corners, each with a glowing rune strip facing out
  const menhirGeo = buildMenhirGeo(rng);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (h - 0.5), z = sz * (h - 0.5);
    const mh = new THREE.Mesh(menhirGeo, stone);
    mh.position.set(x, ARENA.daisHeight, z);
    mh.rotation.y = Math.atan2(sx, sz);
    mh.castShadow = mh.receiveShadow = true;
    scene.add(mh);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.02), glyphMat);
    strip.position.set(x + sx * 0.4, ARENA.daisHeight + 1.9, z + sz * 0.4);
    strip.rotation.set(0, Math.atan2(sx, sz), 0);
    strip.rotateX(-0.08);
    scene.add(strip);
    obstacles.push({ x, z, r: 0.95 });
  }

  // --- Boundary: a wall of thicket and boulders, trees beyond --------------------
  const edgeN = 150;
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), bushMat, edgeN * 2);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mossStone, edgeN);
  let bi = 0, ri = 0;
  for (let i = 0; i < edgeN; i++) {
    const a = (i / edgeN) * TAU + r(-0.01, 0.01);
    if (gateGap(a) < 0.12) continue;
    const rr = WALL_R + r(0.6, 2.2);
    if (i % 3 === 0) setInstance(rocks, ri++, Math.cos(a) * rr, r(0, 0.4), Math.sin(a) * rr, r(0, 3), r(0, 3), r(0, 3), r(1.1, 2.1), r(0.9, 1.9), r(1.1, 2.1));
    for (let k = 0; k < 2; k++) {
      const br = rr + r(-0.3, 2.5), ba = a + r(-0.02, 0.02), s = r(1.2, 2.2);
      setInstance(bushes, bi++, Math.cos(ba) * br, s * r(0.3, 0.8), Math.sin(ba) * br, 0, r(0, TAU), 0, s, s * r(0.7, 1.1), s);
    }
  }
  bushes.count = bi; rocks.count = ri;
  bushes.castShadow = bushes.receiveShadow = rocks.castShadow = rocks.receiveShadow = true;
  scene.add(bushes, rocks);

  // trees: short near the clearing (they'd hide the player at the edge), taller further out
  const treeN = 120;
  const trunks = new THREE.InstancedMesh(buildTrunkGeo(), barkMat, treeN);
  const crowns = new THREE.InstancedMesh(buildCrownGeo(rng), leafMat, treeN);
  const leafCol = new THREE.Color();
  let ti = 0;
  for (let tries = 0; ti < treeN && tries < treeN * 20; tries++) {
    const a = r(0, TAU), rr = 34 + Math.pow(r(0, 1), 1.4) * 26;
    if (rr < 42 && gateGap(a) < 0.1) continue;   // keep a path open behind each gate
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const th = Math.min(17, 7 + (rr - 34) * 0.45) * r(0.85, 1.15), tw = r(0.8, 1.3) * (th / 10) ** 0.6;
    setInstance(trunks, ti, x, 0, z, 0, r(0, TAU), 0, tw, th, tw);
    const cw = r(2.4, 3.6) * (th / 10) ** 0.7;
    setInstance(crowns, ti, x, th * 0.86, z, r(-0.15, 0.15), r(0, TAU), r(-0.15, 0.15), cw, cw * r(0.75, 0.95), cw);
    crowns.setColorAt(ti, leafCol.setRGB(r(0.03, 0.06), r(0.08, 0.14), r(0.025, 0.05)));
    ti++;
  }
  trunks.count = crowns.count = ti;
  trunks.castShadow = crowns.castShadow = trunks.receiveShadow = crowns.receiveShadow = true;
  scene.add(trunks, crowns);

  // --- Gates: arches of twisted roots around a green portal -----------------------
  const portals: Portal[] = GATES.map((a) => buildRootGate(scene, a, barkMat, bushMat, updaters));

  // --- Glowcap clusters (teal) and bonfires (orange): the biome's 6 point lights -----
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
    buildGlowcaps(scene, x, z, rng, capMat, stemMat, updaters);
    obstacles.push({ x, z, r: 0.75 });
  }
  for (const a of [Math.PI / 4, (5 * Math.PI) / 4]) {
    const x = Math.cos(a) * (WALL_R - 2.4), z = Math.sin(a) * (WALL_R - 2.4);
    buildBonfire(scene, x, z, stone, barkMat, updaters);
    obstacles.push({ x, z, r: 0.9 });
  }

  // --- Floor obstacles: stumps, fallen logs, boulders -------------------------------
  // (r, angle) spots clear of the gates' spawn areas, the lights and the lobby dummies
  const stumpSpots = [[15, 0.4], [19, 2.0], [14, 3.45], [20, 4.35], [18, 5.85], [9, 1.2]];
  const stumps = new THREE.InstancedMesh(buildStumpGeo(), barkMat, stumpSpots.length);
  stumpSpots.forEach(([rr, a], i) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = r(0.8, 1.15);
    setInstance(stumps, i, x, 0, z, 0, r(0, TAU), 0, s, r(0.8, 1.4), s);
    obstacles.push({ x, z, r: 0.75 * s });
  });
  stumps.castShadow = stumps.receiveShadow = true;
  scene.add(stumps);

  const logSpots = [[21, 1.15, 0.9], [11, 4.75, -0.4], [22, 3.0, 0.3]];
  const logGeo = new THREE.CylinderGeometry(0.42, 0.5, 4.6, 10, 1).rotateZ(Math.PI / 2);
  for (const [rr, a, rot] of logSpots) {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, yaw = a + rot;
    const log = new THREE.Mesh(logGeo, barkMat);
    log.position.set(x, 0.38, z);
    log.rotation.y = yaw;
    log.castShadow = log.receiveShadow = true;
    scene.add(log);
    // collision: circles along the log
    for (const u of [-1.6, 0, 1.6]) obstacles.push({ x: x + Math.cos(yaw) * u, z: z - Math.sin(yaw) * u, r: 0.55 });
  }

  const boulderSpots = [[24, 0.75, 1.1], [16, 2.75, 0.8], [23, 3.6, 1.2], [13, 5.2, 0.7], [24, 5.2, 1.0], [8, 3.9, 0.6], [17, 1.55, 0.7]];
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mossStone, boulderSpots.length);
  boulderSpots.forEach(([rr, a, s], i) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    setInstance(boulders, i, x, s * 0.25, z, r(0, 3), r(0, 3), r(0, 3), s, s * 0.8, s);
    obstacles.push({ x, z, r: s * 0.95 });
  });
  boulders.castShadow = boulders.receiveShadow = true;
  scene.add(boulders);

  // --- Undergrowth: grass tufts, small glowing mushrooms, pebbles ---------------------
  const clump = makeFbm(5, 6, 3);
  const free = (x: number, z: number, pad: number) => Math.max(Math.abs(x), Math.abs(z)) > h + 0.9 && obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + pad);
  const grass = new THREE.InstancedMesh(buildGrassGeo(rng, [0.02, 0.035, 0.012], [0.12, 0.2, 0.05]), grassMat, 1600);
  let gi = 0;
  for (let tries = 0; gi < grass.count && tries < 20000; tries++) {
    const a = r(0, TAU), rr = Math.sqrt(r(0.02, 1)) * (WALL_R + 1.5);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (clump(x / 130 + 0.5, z / 130 + 0.5) < 0.44 || !free(x, z, 0.1)) continue;
    const s = r(0.7, 1.4);
    setInstance(grass, gi++, x, 0, z, 0, r(0, TAU), 0, s, s * r(0.8, 1.3), s);
  }
  grass.count = gi;
  grass.receiveShadow = true;
  scene.add(grass);

  const shroomN = 70;
  const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1), capMat, shroomN);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 6).translate(0, 0.5, 0), stemMat, shroomN);
  let si = 0;
  for (let tries = 0; si < shroomN && tries < 4000; tries++) {
    // cluster around stumps, logs and the edge
    const o = obstacles[Math.floor(rng() * obstacles.length)];
    const edge = rng() < 0.35;
    const a = r(0, TAU), rr = edge ? WALL_R - r(0, 1.5) : 0;
    const x = edge ? Math.cos(a) * rr : o.x + Math.cos(a) * (o.r + r(0.1, 0.6));
    const z = edge ? Math.sin(a) * rr : o.z + Math.sin(a) * (o.r + r(0.1, 0.6));
    if (!edge && !free(x, z, 0.05)) continue;
    const s = r(0.06, 0.16), sh = s * r(1.5, 2.6);
    setInstance(stems, si, x, 0, z, r(-0.2, 0.2), 0, r(-0.2, 0.2), s * 0.5, sh, s * 0.5);
    setInstance(caps, si, x, sh, z, r(-0.2, 0.2), 0, r(-0.2, 0.2), s * 1.1);
    si++;
  }
  caps.count = stems.count = si;
  scene.add(caps, stems);

  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), stone, 160);
  for (let i = 0; i < pebbles.count; i++) {
    const a = r(0, TAU), rr = r(6, WALL_R);
    const s = r(0.3, 1.2);
    setInstance(pebbles, i, Math.cos(a) * rr, 0.03, Math.sin(a) * rr, r(0, 3), r(0, 3), r(0, 3), s, s * r(0.4, 0.8), s);
  }
  pebbles.receiveShadow = true;
  scene.add(pebbles);

  // --- Ambient: fireflies and low mist -------------------------------------------------
  let moteT = 0;
  updaters.push((dt) => {
    focus.value.set(G.player.pos.x, 1.2, G.player.pos.z);
    moteT += dt;
    while (moteT > 0.06) {
      moteT -= 0.06;
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 29;
      particles.glow.spawn({
        x: Math.cos(a) * rr, y: rand(0.3, 3), z: Math.sin(a) * rr,
        vx: rand(-0.35, 0.35), vy: rand(-0.1, 0.25), vz: rand(-0.35, 0.35),
        life: rand(2, 4.5), size: rand(0.05, 0.1), color: col(0xd8ff70, 1.6), colorEnd: col(0x40a020, 0.3), alpha: 0.9,
      });
      if (Math.random() < 0.25) {
        const b = Math.random() * TAU, br = rand(10, 28);
        particles.smoke.spawn({
          x: Math.cos(b) * br, y: 0.3, z: Math.sin(b) * br, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), vy: 0.02,
          life: rand(6, 10), size: rand(5, 8), sizeEnd: 10, color: col(0x2c4034), alpha: 0.07,
        });
      }
    }
  });

  return {
    look: {
      background: 0x0a120c,
      fog: { color: 0x0e1a12, near: 42, far: 85 },
      hemi: { sky: 0x9ac8aa, ground: 0x1c2412, intensity: 1.15 },
      moon: { color: 0xd8ecdc, intensity: 3.0, pos: [-16, 34, 12] },
      env: buildEnvMap(renderer, [0.18, 0.3, 0.24], [0.8, 1.0, 0.9]),
      envIntensity: 0.45,
    },
    obstacles,
    portals,
    setCalm(v: number) { calmTarget = v; },
    update(dt: number, t: number) { for (const u of updaters) u(dt, t); },
  };
};

// ---------------------------------------------------------------------------
// helpers

function buildMenhirGeo(rng: () => number): THREE.BufferGeometry {
  const base = new THREE.CylinderGeometry(0.95, 1.05, 0.35, 7).translate(0, 0.17, 0);
  const shaft = new THREE.CylinderGeometry(0.42, 0.7, 4.0, 6, 3).translate(0, 2.3, 0);
  const tip = new THREE.ConeGeometry(0.42, 0.7, 6).translate(0, 4.65, 0);
  const g = mergeGeometries([base, shaft, tip].map((x) => x.toNonIndexed()));
  // weathered: squash the cross-section a little and lean the top
  const pos = g.attributes.position;
  const lean = (rng() - 0.5) * 0.15;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * 1.1 + y * lean);
    pos.setZ(i, pos.getZ(i) * 0.85);
  }
  return lumpy(g, 0.04, 3);
}

/** Unit-height trunk with root flares; scaled per instance. */
function buildTrunkGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.2, 0.36, 1, 8, 4).translate(0, 0.5, 0)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const root = new THREE.ConeGeometry(0.16, 0.16, 5).rotateZ(-1.1).translate(0.32, 0.04, 0).rotateY(a);
    parts.push(root);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

/** A crown of overlapping lumpy leaf blobs (~2 units across). */
function buildCrownGeo(rng: () => number): THREE.BufferGeometry {
  const blobs: [number, number, number, number][] = [[0, 0, 0, 1], [0.8, -0.25, 0.3, 0.72], [-0.75, -0.1, -0.4, 0.78], [0.1, 0.45, -0.25, 0.7], [-0.25, -0.35, 0.8, 0.66], [0.35, -0.2, -0.85, 0.6]];
  const parts = blobs.map(([x, y, z, s], i) => lumpy(new THREE.IcosahedronGeometry(1, 1), 0.18, i * 7 + rng()).scale(s, s * 0.85, s).translate(x, y, z));
  return mergeGeometries(parts);
}

function buildStumpGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.55, 0.7, 1.0, 10, 2).translate(0, 0.5, 0)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    parts.push(new THREE.ConeGeometry(0.22, 0.6, 5).rotateZ(-1.2).translate(0.62, 0.12, 0).rotateY(a));
  }
  return lumpy(mergeGeometries(parts.map((p) => p.toNonIndexed())), 0.05, 11);
}

function buildRootGate(scene: THREE.Object3D, angle: number, barkMat: THREE.Material, leafMat: THREE.Material, updaters: Updater[]): Portal {
  const g = new THREE.Group();
  const half = GATE_W / 2 + 0.45;
  // two twisted roots rising from each side and meeting overhead
  for (const s of [-1, 1]) {
    const pts = [[s * (half + 0.5), 0, 0.3], [s * half, 1.6, 0], [s * (half - 0.1), 3.4, -0.1], [s * (half - 0.9), 4.8, 0], [s * 0.2, 5.3, 0.05]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const tube = new THREE.Mesh(taperedTube(curve, 0.7, 0.28), barkMat);
    tube.castShadow = tube.receiveShadow = true;
    g.add(tube);
    // a thinner root twisting around it
    const vine = new THREE.CatmullRomCurve3(pts.map(([x, y, z], i) => new THREE.Vector3(x + Math.sin(i * 1.9) * 0.45 * s, y, z + Math.cos(i * 1.9) * 0.45)));
    const v = new THREE.Mesh(taperedTube(vine, 0.26, 0.1), barkMat);
    v.castShadow = true;
    g.add(v);
    // boulder at the foot
    const rock = new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(0.9, 1), 0.1, s + angle), leafMat);
    rock.position.set(s * (half + 1.3), 0.3, 0.2);
    rock.scale.set(1.1, 0.9, 1.3);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
  }
  // leafy crown on the arch
  const crown = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.2, angle).scale(1.9, 0.8, 1.1), leafMat);
  crown.position.set(0, 5.6, -0.3);
  crown.castShadow = true;
  g.add(crown);

  const { portal } = portalMembrane(g, angle, { a: [0.04, 0.45, 0.2], b: [0.45, 0.9, 0.15], core: [0.7, 1.0, 0.55] }, updaters);
  placeGate(g, angle);
  scene.add(g);
  return portal;
}

/** Tube along `curve` whose radius tapers linearly from r0 to r1. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number): THREE.BufferGeometry {
  const segs = 24, radial = 8;
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    curve.getPointAt(k, c);
    const rad = r0 + (r1 - r0) * k;
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

function buildGlowcaps(scene: THREE.Object3D, x: number, z: number, rng: () => number, cap: THREE.Material, stem: THREE.Material, updaters: Updater[]): void {
  const capGeo = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.5, 1);
  const stemGeo = new THREE.CylinderGeometry(0.7, 1, 1, 8).translate(0, 0.5, 0);
  const shrooms: [number, number, number, number][] = [[0, 0, 1.5, 0.55], [0.55, 0.25, 0.95, 0.38], [-0.4, 0.45, 0.7, 0.3], [0.1, -0.55, 0.55, 0.26]];
  for (const [dx, dz, ht, cr] of shrooms) {
    const lean = (rng() - 0.5) * 0.3;
    const st = new THREE.Mesh(stemGeo, stem);
    st.position.set(x + dx, 0, z + dz);
    st.scale.set(cr * 0.22, ht, cr * 0.22);
    st.rotation.z = lean;
    st.castShadow = true;
    scene.add(st);
    const c = new THREE.Mesh(capGeo, cap);
    c.position.set(x + dx - Math.sin(lean) * ht, Math.cos(lean) * ht, z + dz);
    c.scale.setScalar(cr);
    c.rotation.z = lean;
    c.castShadow = true;
    scene.add(c);
  }
  const light = new THREE.PointLight(0x40ffc8, 5, 10, 2);
  light.position.set(x, 1.9, z);
  scene.add(light);
  let acc = 0;
  updaters.push((dt, t) => {
    light.intensity = 4.2 + Math.sin(t * 1.7 + x) * 0.8;
    acc += dt;
    while (acc > 0.12) {
      acc -= 0.12;
      particles.glow.spawn({
        x: x + rand(-0.6, 0.6), y: rand(0.6, 1.4), z: z + rand(-0.6, 0.6), vx: rand(-0.1, 0.1), vy: rand(0.2, 0.5), vz: rand(-0.1, 0.1),
        life: rand(1.5, 2.5), size: rand(0.06, 0.12), color: col(0x60ffd0, 1.4), colorEnd: col(0x106050, 0.3),
      });
    }
  });
}

function buildBonfire(scene: THREE.Object3D, x: number, z: number, stone: THREE.Material, wood: THREE.Material, updaters: Updater[]): void {
  const ringGeo = new THREE.DodecahedronGeometry(0.2, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const s = new THREE.Mesh(ringGeo, stone);
    s.position.set(x + Math.cos(a) * 0.75, 0.1, z + Math.sin(a) * 0.75);
    s.scale.set(1.2, 0.8, 1);
    s.rotation.set(a, a * 2, 0);
    s.castShadow = true;
    scene.add(s);
  }
  const logGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(logGeo, wood);
    log.position.set(x, 0.3, z);
    log.rotation.set(0.9, (i / 4) * TAU, 0, 'YXZ');
    log.castShadow = true;
    scene.add(log);
  }
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5010).multiplyScalar(2.5) }));
  coals.position.set(x, 0.05, z);
  scene.add(coals);
  const light = new THREE.PointLight(0xff7a30, 14, 13, 2);
  light.position.set(x, 1.3, z);
  scene.add(light);
  let acc = 0;
  updaters.push((dt, t) => {
    light.intensity = 12 + Math.sin(t * 11 + x) * 2 + Math.sin(t * 23) * 1.5;
    acc += dt;
    while (acc > 0.02) {
      acc -= 0.02;
      particles.glow.spawn({
        x: x + rand(-0.3, 0.3), y: 0.3, z: z + rand(-0.3, 0.3), vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4), vz: rand(-0.2, 0.2),
        life: rand(0.4, 0.8), size: rand(0.35, 0.6), sizeEnd: 0.05, color: col(0xffa040, 2.2), colorEnd: col(0xff2000, 0.5), drag: 1.2,
      });
      if (Math.random() < 0.1) particles.glow.spawn({
        x: x + rand(-0.2, 0.2), y: 0.5, z: z + rand(-0.2, 0.2), vx: rand(-0.4, 0.4), vy: rand(2, 4), vz: rand(-0.4, 0.4),
        life: rand(1, 2), size: 0.06, color: col(0xffc060, 4), colorEnd: col(0xff4000, 1), drag: 0.5,
      });
    }
  });
}
