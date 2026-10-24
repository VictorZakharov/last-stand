// The hall of heroes' room (game/hall.ts stages the hero selection screen in it): a torch-lit stone hall, built once at
// boot beside the biomes and shown in their place while the screen is up (`Arena.showHall`). The heroes stand in a row
// on plinths on a raised stage, the dais's own size and height, so whatever a showcase strikes lands on its floor
// (world/ground.ts: the plinths are a relief on it); behind each a banner in his class's colour, braziers either side,
// torches on the columns and dust in the firelight. Its point lights are as many as a biome's (10, two casting the still
// shadows: the braziers'), so showing it compiles nothing the lobby's programs don't have; its materials are the
// crypt's stone (core/textures.ts recipes, the same maps), warmed with the heroes (game/warmup.ts `heroParts`).
import * as THREE from 'three';
import { ARENA } from '../data/balance';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { ashlar, bannerCloth, flagstone, granite, limestone, pbrMaterialMaps } from '../core/textures';
import { seeThrough } from '../core/seeThrough';
import { particles, col } from '../fx/particles';
import { mulberry, rand } from '../util';
import { buildBrazier, bannerGeo, CRYPT_ENV } from './crypt';
import { buildFire } from './fire';
import { boxWithUV, type BiomeLook, type Updater } from './props';
import type { Relief } from './ground';

/** The row of heroes: the line across the stage (z, m) and how far apart they stand. */
export const HALL_ROW = { z: 0.4, gap: 1.75 };
/** Where hero `i` of the row stands (on the stage's floor: his plinth lifts him, `groundHeight`). */
export const hallSpot = (i: number): THREE.Vector3 =>
  new THREE.Vector3((i - (CLASS_IDS.length - 1) / 2) * HALL_ROW.gap, 0, HALL_ROW.z);

/** the flagstones' tiles and the wall's ashlar's a metre (a flagstone tile is five 0.45 m slabs across) */
const FLAGS = 1 / 2.25;
const ASHLAR = 0.5;
/** the plinths: two drums, the lower's radius and the upper's, and their tops over the stage (m) */
const PLINTH = { lower: 0.82, upper: 0.66, step: 0.1, top: 0.2 };
/** the back wall's face (z, m), its height and how far it runs either way; the side walls' x */
const WALL = { z: -4.6, high: 10, half: 10, side: 10 };
/** the columns (x either side, and z along the hall), their shaft's radius and height */
const COLUMNS = { x: 6.3, z: [-3.9, 1.2, 6.3], radius: 0.4, high: 6.6 };
/** each banner: its top's height, how far off the wall it hangs, and its scale (`bannerGeo`'s 0.9 m across) */
const BANNER = { top: 4.9, off: 0.28, scale: 1.3 };
/** the braziers on the stage either side of the row (x, z), and their light (the crypt's 15 lit every hero from
 *  behind, off the key light's spot too, and lit their steel's edges white) */
const BRAZIERS = { x: 3.4, z: -2.4, glow: 7 };
/** the torches on the columns: their bed's height, how far in from the column's middle, their fire and light */
const TORCH = { up: 3.0, in: 0.55, radius: 0.12, height: 0.5, color: 0xff8a3c, intensity: 2.5, distance: 9 };
/** the light on each banner, warm, from in front of it */
const BANNER_LIGHT = { color: 0xffc890, intensity: 1.6, distance: 4.5, up: 3.2, out: 1.3 };
/** a cold light from high up, as a window's: the heroes' tops and the stone's edges */
const HIGH_LIGHT = { color: 0x7f9cff, intensity: 2, distance: 16, at: [0, 8.5, -1.5] as const };
/** the dust drifting in the firelight: how many motes a second, and the box they're born in round the row */
const DUST = { rate: 7, half: [3.6, 1.6, 2.2] as const, middle: [0, 2.0, 0.2] as const };

/** The hall's light: dark but for its fires, a cold sky through its windows faint. */
const HALL_LOOK: BiomeLook = {
  background: 0x040306,
  fog: { color: 0x060508, near: 12, far: 34 },
  hemi: { sky: 0x3a3448, ground: 0x140c08, intensity: 0.25 },
  moon: { color: 0xa8b8ff, intensity: 0.35, pos: [-8, 30, 16] },
  env: CRYPT_ENV,
  envIntensity: 0.18,
};

/** The room as built: its look, its relief (the plinths) and its frame's step. */
export interface HeroHall {
  look: BiomeLook;
  relief: Relief;
  update(dt: number, t: number): void;
}

/** The plinths as a relief on the stage: each its upper drum's top, round its middle. */
function plinthRelief(): Relief {
  const cell = 0.1, half = 3, n = Math.ceil((2 * half) / cell) + 1;
  const heights = new Float32Array(n * n);
  const top = ARENA.daisHeight + PLINTH.top;
  for (const at of CLASS_IDS.map((_, i) => hallSpot(i))) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = i * cell - half, z = j * cell - half;
        if (Math.hypot(x - at.x, z - at.z) <= PLINTH.upper) heights[j * n + i] = top;
      }
    }
  }
  return { half, cell, n, heights };
}

/** A mesh casting and taking shadows, added to `group`. */
function solid(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A column at (x, z) on the floor: a square base, its shaft and a capital. */
function column(group: THREE.Object3D, x: number, z: number, stone: THREE.Material, trim: THREE.Material): void {
  solid(group, boxWithUV(1.15, 0.45, 1.15, 0.5), trim).position.set(x, 0.225, z);
  const shaft = new THREE.CylinderGeometry(COLUMNS.radius * 0.88, COLUMNS.radius, COLUMNS.high, 20, 1);
  solid(group, shaft, stone).position.set(x, 0.45 + COLUMNS.high / 2, z);
  solid(group, boxWithUV(1.05, 0.4, 1.05, 0.5), trim).position.set(x, 0.45 + COLUMNS.high + 0.2, z);
}

/** A torch on a column's inner face at (x, z): an iron basket on a bracket, its fire and its light. */
function torch(group: THREE.Object3D, x: number, z: number, iron: THREE.Material, updaters: Updater[]): void {
  const side = Math.sign(-x);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(TORCH.in, 0.06, 0.06), iron);
  bracket.position.set(x + side * TORCH.in / 2, TORCH.up - 0.25, z);
  group.add(bracket);
  const outline = [[0.03, 0], [0.05, 0.12], [0.13, 0.3], [0.15, 0.34], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y));
  const basket = new THREE.Mesh(new THREE.LatheGeometry(outline, 10), iron);
  const at = new THREE.Vector3(x + side * TORCH.in, TORCH.up, z);
  basket.position.set(at.x, at.y - 0.3, at.z);
  basket.castShadow = true;
  group.add(basket);
  const light = new THREE.PointLight(TORCH.color, TORCH.intensity, TORCH.distance, 2);
  light.position.set(at.x, at.y + 0.45, at.z);
  group.add(light);
  buildFire(group, {
    at, radius: TORCH.radius, height: TORCH.height, dish: 0.03, light, intensity: TORCH.intensity,
    smoke: 1.2, smokeColour: 0x2a2826, embers: 3,
  }, updaters);
}

/** Hero `i`'s banner on the back wall behind him, in his class's colour, on an iron rod, lit from in front. */
function banner(group: THREE.Object3D, i: number, iron: THREE.Material, rng: () => number): void {
  const x = hallSpot(i).x;
  const cloth = bannerCloth(256, 512, CLASSES[CLASS_IDS[i]].hall.banner);
  const velvet = new THREE.MeshPhysicalMaterial({
    map: cloth, roughness: 0.9, sheen: 1, sheenColorMap: cloth, sheenColor: new THREE.Color(1.8, 1.8, 1.8),
    sheenRoughness: 0.4, side: THREE.DoubleSide,
  });
  seeThrough(velvet, 'prop');
  // (`bannerGeo` hangs facing -z, away from a crypt's wall's face: turned round to face the hall)
  const geometry = bannerGeo(rng).rotateY(Math.PI).scale(BANNER.scale, BANNER.scale, BANNER.scale);
  const hung = solid(group, geometry, velvet);
  hung.position.set(x, BANNER.top, WALL.z + BANNER.off);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9 * BANNER.scale + 0.3, 8).rotateZ(Math.PI / 2), iron);
  rod.position.set(x, BANNER.top + 0.03, WALL.z + BANNER.off);
  group.add(rod);
  const light = new THREE.PointLight(BANNER_LIGHT.color, BANNER_LIGHT.intensity, BANNER_LIGHT.distance, 2);
  light.position.set(x, BANNER_LIGHT.up, WALL.z + BANNER_LIGHT.out);
  group.add(light);
}

/** A mote of dust drifting in the firelight round the row. */
function mote(): void {
  const [hx, hy, hz] = DUST.half, [mx, my, mz] = DUST.middle;
  particles.glow.spawn({
    x: mx + rand(-hx, hx), y: my + rand(-hy, hy), z: mz + rand(-hz, hz),
    vx: rand(-0.04, 0.04), vy: rand(-0.02, 0.05), vz: rand(-0.04, 0.04),
    life: rand(4, 7), size: rand(0.008, 0.016), sizeEnd: 0.006,
    color: col(0xffd8a8, 0.5), colorEnd: col(0xffb070, 0.1), gravity: 0, drag: 0.2,
  });
}

/** The hall of heroes built into `group` (shown in the biomes' place: `Arena.showHall`). */
export function buildHeroHall(group: THREE.Group): HeroHall {
  const rng = mulberry(4242);
  const updaters: Updater[] = [];
  // (the biomes' own stones, the same recipes: their maps and programs are theirs; the floor the forest dais's slabs)
  const floorMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(flagstone(47, 5), 1, 1.2), color: 0x707078 });
  const stageMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(flagstone(47, 5), 1, 1.2), color: 0x8c8c94 });
  const graniteMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(granite(7), 2, 0.8), color: 0xd0d0d8 });
  const wallMat = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(ashlar(21, 6, 3), 1, 1.2), color: 0x9a9eac });
  const carved = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(limestone(11), 2, 1.6), color: 0x8a8c92 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.9, roughness: 0.45 });
  for (const m of [wallMat, carved, iron]) seeThrough(m, 'prop');

  // --- The floor, the stage (the dais's square and its step) and the plinths ---
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), floorMat);
  const uv = floor.geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 40 * FLAGS, uv.getY(k) * 40 * FLAGS);
  floor.receiveShadow = true;
  group.add(floor);
  const h = ARENA.daisHalf, top = ARENA.daisHeight;
  solid(group, boxWithUV((h + 0.7) * 2, 0.18, (h + 0.7) * 2, FLAGS), stageMat).position.set(0, 0.09, 0);
  solid(group, boxWithUV(h * 2, top, h * 2, FLAGS), stageMat).position.set(0, top / 2, 0);
  for (const at of CLASS_IDS.map((_, i) => hallSpot(i))) {
    const lower = new THREE.CylinderGeometry(PLINTH.lower, PLINTH.lower, PLINTH.step, 40);
    solid(group, lower, graniteMat).position.set(at.x, top + PLINTH.step / 2, at.z);
    const upperHigh = PLINTH.top - PLINTH.step;
    const upper = new THREE.CylinderGeometry(PLINTH.upper, PLINTH.upper * 1.04, upperHigh, 40);
    solid(group, upper, graniteMat).position.set(at.x, top + PLINTH.step + upperHigh / 2, at.z);
  }

  // --- The walls and the columns ---
  const back = boxWithUV(WALL.half * 2, WALL.high, 0.6, ASHLAR);
  solid(group, back, wallMat).position.set(0, WALL.high / 2, WALL.z - 0.3);
  solid(group, boxWithUV(WALL.half * 2, 0.5, 0.35, 0.5), carved).position.set(0, 0.25, WALL.z + 0.17);
  for (const side of [-1, 1]) {
    const wall = boxWithUV(0.6, WALL.high, 20, ASHLAR);
    solid(group, wall, wallMat).position.set(side * (WALL.side + 0.3), WALL.high / 2, WALL.z + 10);
    for (const z of COLUMNS.z) column(group, side * COLUMNS.x, z, carved, graniteMat);
  }

  // --- The fires: two braziers (the still shadows' lights), four torches; the banners' lights; one from high up ---
  for (const side of [-1, 1]) {
    buildBrazier(group, side * BRAZIERS.x, BRAZIERS.z, Math.PI / 2, iron, graniteMat, updaters, top, BRAZIERS.glow);
    for (const z of COLUMNS.z.slice(0, 2)) torch(group, side * COLUMNS.x, z, iron, updaters);
  }
  for (let i = 0; i < CLASS_IDS.length; i++) banner(group, i, iron, rng);
  const high = new THREE.PointLight(HIGH_LIGHT.color, HIGH_LIGHT.intensity, HIGH_LIGHT.distance, 2);
  high.position.set(...HIGH_LIGHT.at);
  group.add(high);

  let dustDue = 0;
  updaters.push((dt) => {
    dustDue += dt * DUST.rate;
    for (; dustDue >= 1; dustDue--) mote();
  });
  return {
    look: HALL_LOOK,
    relief: plinthRelief(),
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}
