// The Thornwood: a sunlit clearing walled in by thickets, boulders and old trees, ancient giants
// standing over the forest beyond, with four root-arch spawn gates, a mossy stone dais ringed by
// standing stones, glowcap mushroom clusters and two bonfires. Stumps, logs and boulders break up the floor.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../state';
import { seeThrough } from '../core/seeThrough';
import { ARENA } from '../data/balance';
import { forestFloor, bark, slabs, grunge, pbrMaterialMaps, runeCircle } from '../core/textures';
import { particles, col } from '../fx/particles';
import { makeFbm, mulberry, rand, TAU } from '../util';
import { buildDaySky, boxWithUV, buildEnvMap, buildGrassGeo, lumpy, placeGate, portalMembrane, setInstance, WALL_R, GATE_W, type BiomeBuilder, type Portal, type Updater } from './props';
import { canopyGeo, fernClumpGeo, fernTexture, leafClusterTexture, leafTexture, lightShafts, litterGeo } from './foliage';
import { bend, branches, rag, taperTube, twist } from '../entities/models/shapes';
import type { Obstacle } from '../types';

const GATES = [0, 1, 2, 3].map((k) => (k / 4) * TAU);
/** daylight haze: the fog, and the sky at the horizon */
const FOG = 0x9ab4a6;
const SUN = new THREE.Vector3(-18, 40, 14);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** angular distance from `a` to the nearest spawn gate */
const gateGap = (a: number) => Math.min(...GATES.map((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g)))));

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
  // foliage: leaf cards cut out of painted textures round darker cores; instance colours set each plant's hue
  const clusterTex = leafClusterTexture();
  const canopyMat = seeThrough(new THREE.MeshStandardMaterial({ map: clusterTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 'foliage');
  const coreMat = seeThrough(new THREE.MeshStandardMaterial({ color: 0x8a9a80, roughness: 0.95 }), 'foliage');
  // the same for single meshes, which have no instance colour: the tint is in the material
  const archCanopy = seeThrough(new THREE.MeshStandardMaterial({ map: clusterTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: 0x5e8048 }), 'foliage');
  const archCore = seeThrough(new THREE.MeshStandardMaterial({ color: 0x2c3c22, roughness: 0.95 }), 'foliage');
  const fernMat = seeThrough(new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), 'foliage');
  const oneLeaf = leafTexture();
  const litterMat = new THREE.MeshStandardMaterial({ map: oneLeaf, alphaTest: 0.5, roughness: 0.9 });
  const ivyMat = new THREE.MeshStandardMaterial({ map: oneLeaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: 0x3e6a2a });
  const mossMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(grunge(), 2, 3), color: 0x44642a, roughness: 1 });
  const hangMat = new THREE.MeshStandardMaterial({ color: 0x2c4424, roughness: 1, side: THREE.DoubleSide });
  const heartwood = new THREE.MeshStandardMaterial({ ...barkMaps, color: 0x7a5a3c, roughness: 0.95 });
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0c2a24, emissive: 0x2affc8, emissiveIntensity: 0.75, roughness: 0.5 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xb8b09a, roughness: 0.8 });
  const glyphMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x6aff7a, emissiveIntensity: 2.0 });
  // the props dissolve between the camera and the player in the close views (the camera never pulls in)
  for (const m of [stone, mossStone, barkMat, ivyMat, mossMat, hangMat, heartwood, capMat, stemMat, glyphMat]) seeThrough(m, 'prop');

  // --- Sky: a summer sky with slow clouds above the canopy -----------------------------
  const sky = buildDaySky(FOG, [0.2, 0.4, 0.75], SUN);
  scene.add(sky.mesh);

  // --- Ground ---------------------------------------------------------------
  // it reaches past the fog's far end, so its edge melts into the sky's horizon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(110, 128).rotateX(-Math.PI / 2), groundMat);
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
    // moss on its shoulders and ivy climbing the side away from the glyphs
    const moss = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.55, 14, 8, 0, TAU, 0, Math.PI * 0.45), 0.12, sx + sz * 3).scale(1.05, 0.5, 0.85), mossMat);
    moss.position.set(x, ARENA.daisHeight + 4.35, z);
    moss.receiveShadow = true;
    scene.add(moss);
    const ivy: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) {
      const len = r(2.2, 3.6), ph = r(0, TAU), yaw = Math.atan2(sx, sz) + Math.PI;
      ivy.push(twist(len, 0.62, 0.035, 0.35, ph).translate(0, len, 0).rotateY(yaw).translate(x, ARENA.daisHeight + 0.2, z));
      for (let i = 0; i < 14; i++) {
        const t = i / 14, a = ph + t * 0.35 * TAU, px = Math.cos(a) * 0.68, pz = Math.sin(a) * 0.68;
        ivy.push(new THREE.PlaneGeometry(0.2, 0.26).rotateY(Math.atan2(px, pz)).rotateZ(r(-0.6, 0.6)).translate(px, len * (1 - t), pz).rotateY(yaw).translate(x, ARENA.daisHeight + 0.2, z));
      }
    }
    const ivyM = new THREE.Mesh(mergeAll(ivy), ivyMat);
    ivyM.receiveShadow = true;
    scene.add(ivyM);
    obstacles.push({ x, z, r: 0.95, h: 4 });
  }

  // --- Boundary: a wall of thicket and boulders, trees beyond --------------------
  const edgeN = 150;
  const bush = canopyGeo(rng, [[0, 0, 0, 1], [0.55, -0.2, 0.25, 0.72], [-0.5, -0.15, -0.3, 0.75]], 14, 1.0);
  const bushes = new THREE.InstancedMesh(bush.core, coreMat, edgeN * 2);
  const bushCards = new THREE.InstancedMesh(bush.cards, canopyMat, edgeN * 2);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mossStone, edgeN);
  const plantCol = new THREE.Color(), _mx = new THREE.Matrix4();
  let bi = 0, ri = 0;
  for (let i = 0; i < edgeN; i++) {
    const a = (i / edgeN) * TAU + r(-0.01, 0.01);
    if (gateGap(a) < 0.12) continue;
    const rr = WALL_R + r(0.6, 2.2);
    if (i % 3 === 0) setInstance(rocks, ri++, Math.cos(a) * rr, r(0, 0.4), Math.sin(a) * rr, r(0, 3), r(0, 3), r(0, 3), r(1.1, 2.1), r(0.9, 1.9), r(1.1, 2.1));
    for (let k = 0; k < 2; k++) {
      const br = rr + r(-0.3, 2.5), ba = a + r(-0.02, 0.02), s = r(1.2, 2.2);
      setInstance(bushes, bi, Math.cos(ba) * br, s * r(0.3, 0.8), Math.sin(ba) * br, 0, r(0, TAU), 0, s, s * r(0.7, 1.1), s);
      bushes.getMatrixAt(bi, _mx); bushCards.setMatrixAt(bi, _mx);
      plantCol.setRGB(r(0.09, 0.14), r(0.17, 0.26), r(0.07, 0.11));
      bushes.setColorAt(bi, plantCol); bushCards.setColorAt(bi++, plantCol);
    }
  }
  bushes.count = bushCards.count = bi; rocks.count = ri;
  bushes.receiveShadow = bushCards.castShadow = bushCards.receiveShadow = rocks.castShadow = rocks.receiveShadow = true;
  scene.add(bushes, bushCards, rocks);

  // trees: short near the clearing (they'd hide the player at the edge), taller further out
  const treeN = 120;
  const trunks = new THREE.InstancedMesh(buildTrunkGeo(rng), barkMat, treeN);
  const crown = canopyGeo(rng, [[0, 0, 0, 1], [0.8, -0.25, 0.3, 0.72], [-0.75, -0.1, -0.4, 0.78], [0.1, 0.45, -0.25, 0.7], [-0.25, -0.35, 0.8, 0.66], [0.35, -0.2, -0.85, 0.6]], 16, 0.95);
  // two crown clusters a tree: the top, and a smaller one lower down on a limb
  const crowns = new THREE.InstancedMesh(crown.core, coreMat, treeN * 2);
  const crownCards = new THREE.InstancedMesh(crown.cards, canopyMat, treeN * 2);
  let ti = 0;
  for (let tries = 0; ti < treeN && tries < treeN * 20; tries++) {
    const a = r(0, TAU), rr = 34 + Math.pow(r(0, 1), 1.4) * 26;
    if (rr < 42 && gateGap(a) < 0.1) continue;   // keep a path open behind each gate
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const th = Math.min(17, 7 + (rr - 34) * 0.45) * r(0.85, 1.15), tw = r(1.1, 1.7) * (th / 10) ** 0.6;
    setInstance(trunks, ti, x, 0, z, 0, r(0, TAU), 0, tw, th, tw);
    const cw = r(3.0, 4.2) * (th / 10) ** 0.7, side = r(0, TAU);
    plantCol.setRGB(r(0.08, 0.15), r(0.16, 0.26), r(0.06, 0.1));
    setInstance(crowns, ti * 2, x, th * 0.8, z, r(-0.15, 0.15), r(0, TAU), r(-0.15, 0.15), cw, cw * r(0.75, 0.95), cw);
    setInstance(crowns, ti * 2 + 1, x + Math.cos(side) * cw * 0.75, th * 0.56, z + Math.sin(side) * cw * 0.75, r(-0.2, 0.2), r(0, TAU), r(-0.2, 0.2), cw * 0.62, cw * 0.5, cw * 0.62);
    for (const k of [ti * 2, ti * 2 + 1]) { crowns.getMatrixAt(k, _mx); crownCards.setMatrixAt(k, _mx); crowns.setColorAt(k, plantCol); crownCards.setColorAt(k, plantCol); }
    ti++;
  }
  trunks.count = ti; crowns.count = crownCards.count = ti * 2;
  trunks.castShadow = crownCards.castShadow = trunks.receiveShadow = crowns.receiveShadow = crownCards.receiveShadow = true;
  scene.add(trunks, crowns, crownCards);
  buildGiants(scene, rng, barkMat, crown, coreMat, canopyMat);

  // --- Gates: arches of twisted roots around a green portal -----------------------
  const portals: Portal[] = GATES.map((a) => buildRootGate(scene, a, barkMat, mossStone, { canopyMat: archCanopy, coreMat: archCore, hangMat, ivyMat }, rng, updaters));

  // --- Glowcap clusters (teal) and bonfires (orange): the biome's 6 point lights -----
  for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
    buildGlowcaps(scene, x, z, rng, capMat, stemMat, updaters);
    obstacles.push({ x, z, r: 0.75, h: 1.7 });
  }
  for (const a of [Math.PI / 4, (5 * Math.PI) / 4]) {
    const x = Math.cos(a) * (WALL_R - 2.4), z = Math.sin(a) * (WALL_R - 2.4);
    buildBonfire(scene, x, z, stone, barkMat, updaters);
    obstacles.push({ x, z, r: 0.9, h: 1 });
  }

  // --- Floor obstacles: stumps, fallen logs, boulders -------------------------------
  // (r, angle) spots clear of the gates' spawn areas, the lights and the lobby dummies
  const stumpSpots = [[15, 0.4], [19, 2.0], [14, 3.45], [20, 4.35], [18, 5.85], [9, 1.2]];
  const stumps = new THREE.InstancedMesh(buildStumpGeo(rng), barkMat, stumpSpots.length);
  stumpSpots.forEach(([rr, a], i) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = r(0.8, 1.15), yaw = r(0, TAU), sy = r(0.8, 1.4);
    setInstance(stumps, i, x, 0, z, 0, yaw, 0, s, sy, s);
    obstacles.push({ x, z, r: 0.75 * s, h: sy });
  });
  stumps.castShadow = stumps.receiveShadow = true;
  scene.add(stumps);

  const logSpots = [[21, 1.15, 0.9], [11, 4.75, -0.4], [22, 3.0, 0.3]];
  const log = buildLogGeo(rng);
  for (const [rr, a, rot] of logSpots) {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, yaw = a + rot;
    for (const [geo, mat] of [[log.bark, barkMat], [log.inner, heartwood], [log.moss, mossMat], [log.fungus, capMat]] as const) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 0.38, z);
      m.rotation.y = yaw;
      m.castShadow = mat !== capMat; m.receiveShadow = true;
      scene.add(m);
    }
    // collision: circles along the log
    for (const u of [-1.6, 0, 1.6]) obstacles.push({ x: x + Math.cos(yaw) * u, z: z - Math.sin(yaw) * u, r: 0.55, h: 0.9 });
  }

  const boulderSpots = [[24, 0.75, 1.1], [16, 2.75, 0.8], [23, 3.6, 1.2], [13, 5.2, 0.7], [24, 5.2, 1.0], [8, 3.9, 0.6], [17, 1.55, 0.7]];
  const boulders = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), mossStone, boulderSpots.length);
  boulderSpots.forEach(([rr, a, s], i) => {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    setInstance(boulders, i, x, s * 0.25, z, r(0, 3), r(0, 3), r(0, 3), s, s * 0.8, s);
    obstacles.push({ x, z, r: s * 0.95, h: s * 1.05 });
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

  // ferns: banks of them along the thicket, clumps round the stumps, logs and boulders
  const fernN = 300;
  const ferns = new THREE.InstancedMesh(fernClumpGeo(rng), fernMat, fernN);
  let fi = 0;
  for (let tries = 0; fi < fernN && tries < 8000; tries++) {
    let x: number, z: number;
    if (rng() < 0.6) {
      const a = r(0, TAU), rr = WALL_R - r(-0.5, 3.5);
      if (gateGap(a) < 0.16) continue;
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
    } else {
      const o = obstacles[Math.floor(rng() * obstacles.length)], a = r(0, TAU);
      x = o.x + Math.cos(a) * (o.r + r(0.1, 0.9)); z = o.z + Math.sin(a) * (o.r + r(0.1, 0.9));
      if (!free(x, z, 0.05)) continue;
    }
    const s = r(0.9, 1.7);
    setInstance(ferns, fi, x, 0, z, 0, r(0, TAU), 0, s, s * r(0.8, 1.2), s);
    ferns.setColorAt(fi++, plantCol.setRGB(r(0.16, 0.26), r(0.26, 0.38), r(0.1, 0.16)));
  }
  ferns.count = fi;
  ferns.receiveShadow = true;
  scene.add(ferns);

  // roots snaking out of the thicket across the floor, half sunk in it
  const roots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + r(-0.1, 0.1);
    if (gateGap(a) < 0.25) continue;
    const pts: THREE.Vector3[] = [], len = r(3.5, 7), bendA = r(-0.4, 0.4);
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, rr = WALL_R + 1.5 - t * len, aa = a + bendA * t * t + Math.sin(t * 7 + i) * 0.03;
      pts.push(V(Math.cos(aa) * rr, 0.06 - t * 0.1 + Math.sin(t * 9 + i) * 0.05, Math.sin(aa) * rr));
    }
    roots.push(taperTube(pts, (t) => 0.28 * (1 - t * 0.85), 24, 7));
  }
  const rootMesh = new THREE.Mesh(mergeAll(roots), barkMat);
  rootMesh.castShadow = rootMesh.receiveShadow = true;
  scene.add(rootMesh);

  // leaf litter: fallen leaves in drifts, thickest under the trees and against the thicket
  const litterN = 3000;
  const litter = new THREE.InstancedMesh(litterGeo(), litterMat, litterN);
  const litterCols: [number, number, number][] = [[0.62, 0.28, 0.08], [0.45, 0.32, 0.1], [0.7, 0.48, 0.12], [0.28, 0.36, 0.1], [0.4, 0.18, 0.07]];
  let li = 0;
  for (let tries = 0; li < litterN && tries < 20000; tries++) {
    const a = r(0, TAU), rr = Math.pow(r(0, 1), 0.45) * (WALL_R + 1);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.max(Math.abs(x), Math.abs(z)) < h + 0.8) continue;
    if (clump(x / 90 + 0.3, z / 90 + 0.7) < 0.38 + (rr < 16 ? 0.12 : 0)) continue;
    const s = r(0.7, 1.4);
    setInstance(litter, li, x, 0.002 * (li % 7), z, r(-0.1, 0.1), r(0, TAU), r(-0.1, 0.1), s);
    const c = litterCols[Math.floor(rng() * litterCols.length)], v = r(0.7, 1.2);
    litter.setColorAt(li++, plantCol.setRGB(c[0] * v, c[1] * v, c[2] * v));
  }
  litter.count = li;
  litter.receiveShadow = true;
  scene.add(litter);

  // sunbeams slanting down through gaps in the canopy onto the edges of the clearing
  const beams = lightShafts([[16, 1.0, 1.8], [21, 2.3, 2.2], [14, 4.0, 1.6], [20, 5.1, 2.0], [23, 3.3, 1.5]].map(([rr, a, rad]) => [Math.cos(a) * rr, Math.sin(a) * rr, rad]), SUN, new THREE.Color(0.075, 0.065, 0.035));
  scene.add(beams.group);

  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.2, 0), stone, 160);
  for (let i = 0; i < pebbles.count; i++) {
    const a = r(0, TAU), rr = r(6, WALL_R);
    const s = r(0.3, 1.2);
    setInstance(pebbles, i, Math.cos(a) * rr, 0.03, Math.sin(a) * rr, r(0, 3), r(0, 3), r(0, 3), s, s * r(0.4, 0.8), s);
  }
  pebbles.receiveShadow = true;
  scene.add(pebbles);

  // --- Ambient: drifting pollen and a light haze ---------------------------------------
  let moteT = 0;
  updaters.push((dt, t) => {
    beams.update(t); sky.update(t);
    moteT += dt;
    while (moteT > 0.06) {
      moteT -= 0.06;
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * 29;
      particles.glow.spawn({
        x: Math.cos(a) * rr, y: rand(0.3, 3), z: Math.sin(a) * rr,
        vx: rand(-0.25, 0.25), vy: rand(-0.08, 0.12), vz: rand(-0.25, 0.25),
        life: rand(3, 5), size: rand(0.035, 0.06), color: col(0xfff2c0, 0.45), colorEnd: col(0xd8c890, 0.1), alpha: 0.7,
      });
      if (Math.random() < 0.25) {
        const b = Math.random() * TAU, br = rand(10, 28);
        particles.smoke.spawn({
          x: Math.cos(b) * br, y: 0.3, z: Math.sin(b) * br, vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), vy: 0.02,
          life: rand(6, 10), size: rand(5, 8), sizeEnd: 10, color: col(0xb8ccc0), alpha: 0.05,
        });
      }
    }
  });

  return {
    look: {
      // daylight: its ordinary scenes are about 2.3 times as bright as the night crypt's
      adapt: 2.3,
      background: FOG,
      fog: { color: FOG, near: 42, far: 95 },
      hemi: { sky: 0xcfe4ff, ground: 0x4a5a2c, intensity: 1.4 },
      // the sun: the shared key light
      moon: { color: 0xfff0d6, intensity: 4.0, pos: [SUN.x, SUN.y, SUN.z] },
      env: buildEnvMap(renderer, [0.55, 0.7, 0.8], [1.3, 1.25, 1.1]),
      envIntensity: 0.6,
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

/** Unit-height trunk (scaled per instance): a gnarled bole flaring into buttress roots, and two limbs
 * forking up into the crown. */
function buildTrunkGeo(rng: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [lumpy(new THREE.CylinderGeometry(0.17, 0.3, 1, 9, 5).translate(0, 0.5, 0), 0.05, 3)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rng() * 0.4, c = Math.cos(a), s = Math.sin(a), reach = 0.45 + rng() * 0.25;
    parts.push(taperTube([V(c * 0.18, 0.09, s * 0.18), V(c * 0.3, 0.035, s * 0.3), V(c * reach, 0.0, s * reach)], (t) => 0.13 * (1 - t * 0.85), 4, 5));
  }
  for (const s of [1, -1]) parts.push(taperTube([V(0, 0.7, 0), V(s * 0.12, 0.84, 0.05), V(s * 0.3, 0.98, 0.1)], (t) => 0.1 * (1 - t * 0.6), 4, 5));
  return mergeAll(parts);
}

/** Merge geometries that may differ in indexing and attributes: keeps position, normal and uv. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((p) => {
    const n = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    return n;
  }))!;
}

/** A fallen hollow log along x (4.6 long, centred): splintered open ends showing the heartwood,
 * moss along its back, a stair of shelf fungus on one side. */
function buildLogGeo(rng: () => number): { bark: THREE.BufferGeometry; inner: THREE.BufferGeometry; moss: THREE.BufferGeometry; fungus: THREE.BufferGeometry } {
  const L = 4.6;
  // splinter both ends: every vertex on an end ring pulls back along the log by its own amount
  const jag = (g: THREE.BufferGeometry) => {
    const p = g.attributes.position, cuts = Array.from({ length: 17 }, () => rng());
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (Math.abs(y) > L / 2 - 0.02) { const k = Math.round(((Math.atan2(p.getZ(i), p.getX(i)) / TAU) + 1) % 1 * 16); p.setY(i, y - Math.sign(y) * cuts[k] * cuts[k] * 0.45); }
    }
    g.computeVertexNormals();
    return g;
  };
  const bark = lumpy(jag(new THREE.CylinderGeometry(0.42, 0.5, L, 16, 6, true)), 0.035, 5).rotateZ(Math.PI / 2);
  const inner = jag(new THREE.CylinderGeometry(0.3, 0.36, L - 0.02, 16, 1, true)).rotateZ(Math.PI / 2);
  // the hollow faces inwards
  const ix = inner.index!.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  inner.computeVertexNormals();
  const rim = new THREE.RingGeometry(0.3, 0.46, 16).rotateY(Math.PI / 2);
  const inside = mergeAll([inner, rim.clone().translate(L / 2 - 0.2, 0, 0), rim.rotateY(Math.PI).translate(-L / 2 + 0.2, 0, 0)]);
  // a sweep of moss along the top (the cylinder's +x before it's laid along x becomes +y)
  const moss = lumpy(new THREE.CylinderGeometry(0.47, 0.53, L * 0.7, 14, 4, true, Math.PI * 0.15, Math.PI * 0.7), 0.1, 9).rotateZ(Math.PI / 2).translate(0.2, 0.02, 0);
  const caps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) caps.push(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.05, 0.06, 12, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).translate(-0.6 + i * 0.35, 0.05 - i * 0.12, 0.45));
  return { bark, inner: inside, moss, fungus: mergeAll(caps) };
}

/** Stretch a geometry's uvs, so a bark texture keeps its scale along a long trunk or root. */
function scaleUV<T extends THREE.BufferGeometry>(g: T, su: number, sv: number): T {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/**
 * An ancient giant, about 30 m: a broad bole twisting up out of great buttress roots, limbs forking out
 * into the crown. Returns its geometry and the twig ends where its crown clusters sit.
 */
function buildGiantGeo(rng: () => number): { geo: THREE.BufferGeometry; tips: THREE.Vector3[] } {
  const H = 30;
  const bole = new THREE.CylinderGeometry(1.3, 2.1, H, 18, 16).translate(0, H / 2, 0);
  const p = bole.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // the base flares into the roots and the grain twists as it rises
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + 1.2 * Math.exp(-y / 2.2), tw = y * 0.035;
    p.setXYZ(i, (x * Math.cos(tw) - z * Math.sin(tw)) * f, y, (x * Math.sin(tw) + z * Math.cos(tw)) * f);
  }
  const parts: THREE.BufferGeometry[] = [lumpy(scaleUV(bole, 4, H / 5), 0.012, 7)];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng() * 0.3, c = Math.cos(a), s = Math.sin(a), reach = 6.5 + rng() * 2;
    parts.push(scaleUV(taperTube([V(c * 1.4, 4.5, s * 1.4), V(c * 2.8, 1.6, s * 2.8), V(c * reach * 0.7, 0.2, s * reach * 0.7), V(c * reach, -0.3, s * reach)], (t) => 1.05 * (1 - t * 0.85), 12, 8), 2, 3));
  }
  const limbs: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 2.2 + rng() * 0.6;
    branches(rng, V(0, 15 + k * 3.5, 0), V(Math.cos(a), 0.85, Math.sin(a)), 9 + rng() * 2, 0.75, 1, limbs, tips, 0.5, 8);
  }
  branches(rng, V(0, H - 1, 0), V(0.1, 1, 0.05), 6, 0.9, 1, limbs, tips, 0.45, 8);
  for (const l of limbs) parts.push(scaleUV(l, 2, 3));
  return { geo: mergeAll(parts), tips };
}

/** A ring of ancient giants beyond the thicket, standing over the forest the way the crypt's towers do,
 * clear of the gates. Their crowns share the trees' canopy geometry and materials. */
function buildGiants(scene: THREE.Object3D, rng: () => number, bark: THREE.Material, crown: { core: THREE.BufferGeometry; cards: THREE.BufferGeometry }, coreMat: THREE.Material, canopyMat: THREE.Material): void {
  const { geo, tips } = buildGiantGeo(rng);
  const spots: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * TAU + (rng() - 0.5) * 0.15;
    if (gateGap(a) > 0.3) spots.push([a, 38 + rng() * 8]);
  }
  const trunks = new THREE.InstancedMesh(geo, bark, spots.length);
  const cores = new THREE.InstancedMesh(crown.core, coreMat, spots.length * tips.length);
  const cards = new THREE.InstancedMesh(crown.cards, canopyMat, spots.length * tips.length);
  const m = new THREE.Matrix4(), cm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), at = new THREE.Vector3(), col = new THREE.Color();
  let ci = 0;
  spots.forEach(([a, rr], i) => {
    const sc = 0.9 + rng() * 0.25, yaw = rng() * TAU;
    m.compose(V(Math.cos(a) * rr, 0, Math.sin(a) * rr), q.setFromAxisAngle(V(0, 1, 0), yaw), s.setScalar(sc));
    trunks.setMatrixAt(i, m);
    for (const tp of tips) {
      at.copy(tp).applyMatrix4(m);
      const cs = (4.2 + rng() * 1.6) * sc;
      setInstance(cores, ci, at.x, at.y + cs * 0.2, at.z, (rng() - 0.5) * 0.3, rng() * TAU, (rng() - 0.5) * 0.3, cs, cs * (0.65 + rng() * 0.2), cs);
      cores.getMatrixAt(ci, cm); cards.setMatrixAt(ci, cm);
      col.setRGB(0.08 + rng() * 0.06, 0.16 + rng() * 0.09, 0.05 + rng() * 0.04);
      cores.setColorAt(ci, col); cards.setColorAt(ci++, col);
    }
  });
  trunks.castShadow = trunks.receiveShadow = cards.castShadow = cards.receiveShadow = cores.receiveShadow = true;
  scene.add(trunks, cores, cards);
}

/** A broken stump: a jagged, splintered top, buttress roots, bark lumps. */
function buildStumpGeo(rng: () => number): THREE.BufferGeometry {
  const bole = new THREE.CylinderGeometry(0.55, 0.7, 1.0, 14, 3).translate(0, 0.5, 0);
  // splinter the rim: every vertex on the top ring rises or falls by its own amount
  const p = bole.attributes.position, jag = Array.from({ length: 15 }, () => rng());
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0.99) {
      const centre = Math.hypot(p.getX(i), p.getZ(i)) < 0.01, k = Math.round(((Math.atan2(p.getZ(i), p.getX(i)) / TAU) + 1) % 1 * 14);
      p.setY(i, centre ? y - 0.12 : y + jag[k] * jag[k] * 0.55 - 0.1);
    }
  }
  const parts: THREE.BufferGeometry[] = [bole];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3, c = Math.cos(a), s = Math.sin(a), reach = 0.95 + rng() * 0.35;
    parts.push(taperTube([V(c * 0.5, 0.35, s * 0.5), V(c * 0.72, 0.1, s * 0.72), V(c * reach, -0.02, s * reach)], (t) => 0.22 * (1 - t * 0.8), 8, 6));
  }
  return lumpy(mergeAll(parts), 0.04, 11);
}

interface GateMats { canopyMat: THREE.Material; coreMat: THREE.Material; hangMat: THREE.Material; ivyMat: THREE.Material }

function buildRootGate(scene: THREE.Object3D, angle: number, barkMat: THREE.Material, rockMat: THREE.Material, M: GateMats, rng: () => number, updaters: Updater[]): Portal {
  const g = new THREE.Group();
  const half = GATE_W / 2 + 0.45;
  const hang: THREE.BufferGeometry[] = [], ivy: THREE.BufferGeometry[] = [];
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
    // roots splaying from its foot into the ground
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.7 + (s < 0 ? Math.PI : 0), c = Math.cos(a), sn = Math.sin(a), x0 = s * (half + 0.5);
      const root = new THREE.Mesh(taperTube([V(x0, 0.4, 0.3), V(x0 + c * 0.8, 0.12, 0.3 + sn * 0.8), V(x0 + c * 1.6, -0.05, 0.3 + sn * 1.5)], (t) => 0.3 * (1 - t * 0.8), 10, 7), barkMat);
      root.castShadow = root.receiveShadow = true;
      g.add(root);
    }
    // boulder at the foot
    const rock = new THREE.Mesh(lumpy(new THREE.DodecahedronGeometry(0.9, 1), 0.1, s + angle), rockMat);
    rock.position.set(s * (half + 1.3), 0.3, 0.2);
    rock.scale.set(1.1, 0.9, 1.3);
    rock.castShadow = rock.receiveShadow = true;
    g.add(rock);
    // moss hanging in beards from the arch, ivy climbing it
    for (let k = 0; k < 5; k++) {
      const p = curve.getPointAt(0.45 + k * 0.12);
      hang.push(bend(rag(0.35 + rng() * 0.2, 0.7 + rng() * 1.1, k * 7 + s * 3 + angle, 3), -0.08).translate(p.x, p.y - 0.25, p.z + 0.1 + rng() * 0.3));
    }
    for (let k = 0; k < 40; k++) {
      const t = rng() * 0.8, p = curve.getPointAt(t), a = rng() * TAU, w = 0.5 * (1 - t * 0.5);
      ivy.push(new THREE.PlaneGeometry(0.22, 0.3).rotateX(-0.4).rotateY(a).translate(p.x + Math.cos(a) * w, p.y + 0.1, p.z + Math.sin(a) * w));
    }
  }
  const hangM = new THREE.Mesh(mergeAll(hang), M.hangMat);
  const ivyM = new THREE.Mesh(mergeAll(ivy), M.ivyMat);
  hangM.receiveShadow = ivyM.receiveShadow = true;
  g.add(hangM, ivyM);
  // a crown of leaves on the arch (the cards cast no shadow here: the shadow bake would make them solid)
  const crown = canopyGeo(rng, [[0, 0, 0, 1], [1.1, -0.3, 0.1, 0.7], [-1.1, -0.25, -0.1, 0.72]], 16, 0.9);
  for (const [geo, mat, cast] of [[crown.core, M.coreMat, true], [crown.cards, M.canopyMat, false]] as const) {
    geo.scale(1.5, 0.9, 1.1);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, 5.6, -0.3);
    m.castShadow = cast; m.receiveShadow = true;
    g.add(m);
  }

  const { portal } = portalMembrane(g, angle, { a: [0.04, 0.45, 0.2], b: [0.45, 0.9, 0.15], core: [0.7, 1.0, 0.55] }, updaters, true);
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

/** A mushroom cap of radius 1 (height ~0.55): a dome whose rim waves and curls under, its gills below. */
function glowcapGeo(): { cap: THREE.BufferGeometry; gills: THREE.BufferGeometry } {
  const prof: [number, number][] = [[0.88, -0.02], [1, 0.05]];
  for (let i = 9; i >= 0; i--) { const rr = (i / 10) * 0.97; prof.push([rr, 0.55 - Math.pow(rr, 2.2) * 0.5]); }
  const cap = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y)), 28);
  const p = cap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
    if (rr > 0.6) p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 6) * 0.06 * (rr - 0.6) / 0.4);
  }
  cap.computeVertexNormals();
  const gills = new THREE.LatheGeometry([new THREE.Vector2(0.9, 0.0), new THREE.Vector2(0.12, 0.12)], 28);
  return { cap, gills };
}

function buildGlowcaps(scene: THREE.Object3D, x: number, z: number, rng: () => number, cap: THREE.Material, stem: THREE.Material, updaters: Updater[]): void {
  const { cap: capGeo, gills: gillGeo } = glowcapGeo();
  // stems bow a little (0.8 y^2 along x) and swell at the foot
  const stemGeo = new THREE.CylinderGeometry(0.7, 1, 1, 10, 4).translate(0, 0.5, 0);
  const sp = stemGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const y = sp.getY(i), k = 1 + (1 - y) ** 3 * 0.5; sp.setXYZ(i, sp.getX(i) * k + y * y * 0.8, y, sp.getZ(i) * k); }
  stemGeo.computeVertexNormals();
  const shrooms: [number, number, number, number][] = [[0, 0, 1.5, 0.55], [0.55, 0.25, 0.95, 0.38], [-0.4, 0.45, 0.7, 0.3], [0.1, -0.55, 0.55, 0.26], [-0.55, -0.3, 0.35, 0.18], [0.3, 0.65, 0.3, 0.15]];
  for (const [dx, dz, ht, cr] of shrooms) {
    const lean = (rng() - 0.5) * 0.3, yaw = rng() * TAU;
    const st = new THREE.Mesh(stemGeo, stem);
    st.position.set(x + dx, 0, z + dz);
    st.scale.set(cr * 0.22, ht, cr * 0.22);
    st.rotation.set(0, yaw, lean);
    st.castShadow = true;
    scene.add(st);
    // the cap sits on the top of the bowed stem
    const top = new THREE.Vector3(0.8 * cr * 0.22, ht, 0).applyEuler(st.rotation);
    for (const [geo, mat] of [[capGeo, cap], [gillGeo, stem]] as const) {
      const c = new THREE.Mesh(geo, mat);
      c.position.set(x + dx + top.x, top.y, z + dz + top.z);
      c.scale.setScalar(cr);
      c.rotation.set(0, yaw, lean);
      c.castShadow = mat === cap;
      scene.add(c);
    }
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
