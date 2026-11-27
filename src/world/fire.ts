// A fire burning on a prop (a brazier's coals, a bonfire's logs): flames as a volume, a fluid simulated once
// (world/fireBake.ts) and played as a loop, each ray through a box over the bed gathering the light its burning gas gives
// and losing what's behind to it, as hot gas does (emission and absorption by one coefficient, after Fire Pro's,
// https://github.com/dgreenheck/threejs-fire-pro, MIT), coloured as a blackbody's heat, so they hold their shape as the
// camera goes round them (sheets turned to the camera turned with it); a bed of coal lumps glowing
// through cracks in their char; embers drifting up and smoke over it. One swell of the flames' height and the light's (a fire a metre across puffs about
// 1.5 times a second) moves them together. `tools/lab` `fire` measures it.
import { rustLook } from '../engine/custom';
import { emberLook, flameLook } from '../engine/looks/fire';
import {
  ClampToEdgeWrapping, ColorRepresentation, CustomBlending, Geometry, LinearFilter, LitMaterial, LookMaterial, Mat4,
  mergeGeometries, Mesh, Node, OneFactor, OneMinusSrcAlphaFactor, PointLight, RedFormat, Vec2, Vec3, Vec4,
  VolumeTexture,
} from '../engine/api/index.ts';
import * as shapes from '../engine/api/shapes/index.ts';
import { particles, col } from '../fx/particles';
import { rand } from '../util';
import { seeThrough, seeThroughFade, seeValue } from '../core/seeThrough';
import { inTheFog } from '../core/sight';
import type { Updater } from './props';
import { runPhase } from './runPhase';
import type { FlameUniforms } from './fireNodes';
import { BAKE, decodeFrame, DOMAIN, FLAME_LOOK, FRAME_CELLS, KEPT, KEPT_SIZE, LOOP, STILL, TILES, type BakedFlames }
  from './fireBake';

/** A fire to build: its bed and flames, and the biome's light it flickers. */
export interface FireSpec {
  /** the middle of its bed (world, m) */
  at: Vec3;
  /** its bed's radius and its flames' height (m) */
  radius: number;
  height: number;
  /** how far its bed rises to its rim (m): a brazier's bowl is dished, a bonfire's ground flat */
  dish: number;
  /** the solid bowl under it, if it has one: its outside's foot, belly and rim, each a height and a radius from the
   *  bed's middle (m; the flames behind it are hidden as it hides them) */
  bowl?: [number, number][];
  /** the logs in it, if any (in its scene's frame, m; up to `LOGS_MOST`): the flames behind them are hidden as they
   *  hide them, and those in front drawn over them */
  logs?: FireLog[];
  /** the biome's point light over it (one of its six), and its intensity at rest */
  light: PointLight;
  intensity: number;
  /** its smoke: how many puffs a second, and their colour (a coal fire's is thin and dark, wood's paler) */
  smoke: number;
  smokeColour: ColorRepresentation;
  /** how many embers a second it gives off */
  embers: number;
  /** its flames' light, a share of a fire's own (1 by default): seen from low and near, as the hall of heroes' camera
   *  sees its braziers, a ray through their foot crosses the most of them, and at a fire's own it burned white there */
  glow?: number;
}

/** A log in a fire, from end to end, its thickness its radius (m): a cylinder with flat ends. */
export interface FireLog {
  from: Vec3;
  to: Vec3;
  radius: number;
}

/** the most logs a fire's flames know (a bonfire has 7) */
export const LOGS_MOST = 8;

/** the most steps a ray takes through the flames (one crossing them whole, at full quality): fewer, and the flames
 *  read as slices across the view */
const STEPS = 64;
/** the fewest steps a ray takes, and the least share of a whole crossing's its length counts for (a ray through the
 *  flames' very edge still steps finely enough not to show slices) */
const STEPS_LEAST = 8;
const SPAN_LEAST = 0.25;
/** the share of the steps every fire's rays take, the quality level's (`setFlameSteps`): a uniform, so a switch
 *  compiles nothing */
const stepShare = { value: 1 };
/** whether every fire's flames take the lite path (the quality level's `flameLite`): the nearest loop frame alone and
 *  no strands at each step, a third of the volume's reads; 1 or 0, a uniform */
const lite = { value: 0 };
/** what the strands' read gives on average (0 to 1), taken in its place on the lite path, so its flames burn as bright */
const LITE_STRANDS = 0.23;
/** Every fire's flames stepped at `share` of their steps (1 at High; the quality level's `flameSteps`), and on the lite
 *  path where `light` (`flameLite`). */
export function setFlameSteps(share: number, light = false): void {
  stepShare.value = share;
  lite.value = light ? 1 : 0;
}
/** the frames a second the loop plays at, as it was simulated */
const LOOP_RATE = 60 / LOOP.stepsEach;
/** how far round its bed the box reaches and how far up it stands, shares of the bed's radius and of the flames' height */
const FLAME_REACH = DOMAIN.half / DOMAIN.bed;
const FLAME_TOP = DOMAIN.high / DOMAIN.flames;
/** a puff's swell of the flames' height, slow and quick (a share of it) */
const PUFF_SLOW = 0.18;
const PUFF_QUICK = 0.04;
/** the slow and quick swells' rates (Hz): value noise at a rate carries its swing under it */
const PUFF_SLOW_HZ = 1.7;
const PUFF_QUICK_HZ = 6.3;
/** how much of a puff the flames' own height takes: the simulation has swells of its own */
const PUFF_SHOWS = 0.25;
/** how much of a puff the light swells by (a share of the flames' swell) */
const LIGHT_SWELL = 1.2;
/** how far the light sways with a puff (m) */
const LIGHT_SWAY = 0.05;
/** how hot a fire's bed glows, against a log's char */
const BED_HEAT = 1.5;
/** a puff of smoke's opacity as it leaves the flames */
const SMOKE_ALPHA = 0.16;

/** Value noise in one dimension: smooth, between 0 and 1. */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const hash = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const eased = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * eased;
}

/** A fire's puff at `t` (1 at rest): the swell of its flames' height, slow and quick, at no common beat. */
function puffAt(t: number, seed: number): number {
  const slow = (noise1(t * PUFF_SLOW_HZ + seed) - 0.5) * 2 * PUFF_SLOW;
  const quick = (noise1(t * PUFF_QUICK_HZ + seed * 3.1) - 0.5) * 2 * PUFF_QUICK;
  return 1 + slow + quick;
}

/** The two frames of the flames' loop every fire draws now (1 by 1 by 1 and empty until its worker has made it: a
 *  texture's size is all that changes, so no program does), and the wait for it. The loop itself is kept as runs
 *  (`BakedFlames`, about 1 MB), each frame decoded into its slot as the loop comes to it: the loop whole on the GPU was
 *  12.8 MB, and 23 MB before its box was cut to the flames. */
const flamesVolume = new VolumeTexture(new Uint8Array(1), 1, 1, 1);
flamesVolume.format = RedFormat;
flamesVolume.minFilter = flamesVolume.magFilter = LinearFilter;
flamesVolume.wrapS = flamesVolume.wrapT = flamesVolume.wrapR = ClampToEdgeWrapping;
flamesVolume.unpackAlignment = 1;
flamesVolume.needsUpdate = true;
let flamesBaked: Promise<void> = Promise.resolve();
/** the loop as the worker made it, the frame each slot holds, and a frame's box decoded */
let loop: BakedFlames | null = null;
const inSlot = [-1, -1, -1];
const decoded = new Uint8Array(FRAME_CELLS);

/** The texture holding the frames either side of `moment` (a frame of the loop), each decoded into its slot as it's
 *  first needed: one frame a step of the loop. */
function showMoment(moment: number): void {
  if (!loop) return;
  const first = Math.floor(moment);
  const data = flamesVolume.image.data as Uint8Array;
  const width = KEPT_SIZE.x * TILES.across;
  let changed = false;
  for (const [frame, slot] of [[first, first % 2], [(first + 1) % LOOP.frames, (first + 1) % 2], [STILL.frame, STILL.slot]]) {
    if (inSlot[slot] === frame) continue;
    decodeFrame(loop, frame, decoded);
    for (let z = 0; z < KEPT_SIZE.z; z++) {
      for (let y = 0; y < KEPT_SIZE.y; y++) {
        const from = (y + z * KEPT_SIZE.y) * KEPT_SIZE.x;
        const to = slot * KEPT_SIZE.x + (y + z * KEPT_SIZE.y) * width;
        data.set(decoded.subarray(from, from + KEPT_SIZE.x), to);
      }
    }
    inSlot[slot] = frame;
    changed = true;
  }
  if (changed) flamesVolume.needsUpdate = true;
}

/** The fire's simulation made by a worker as the game loads, or read back as it was kept. */
export function preloadFlames(): void {
  if (typeof Worker === 'undefined') return;
  flamesBaked = new Promise((resolve) => {
    const worker = new Worker(new URL('./fireBake.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BakedFlames>) => {
      worker.terminate();
      loop = e.data;
      // (a new size: its storage is made again, by every renderer, on its next use)
      flamesVolume.dispose();
      const width = KEPT_SIZE.x * TILES.across;
      const height = KEPT_SIZE.y * TILES.down;
      flamesVolume.image = { data: new Uint8Array(width * height * KEPT_SIZE.z), width, height, depth: KEPT_SIZE.z };
      inSlot.fill(-1);
      showMoment(0);
      resolve();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve();
    };
    // (the name the lab's pages keep what they make under, `keepAs` in core/kept.ts)
    worker.postMessage({ keepName: (globalThis as { __labMapsAs?: string }).__labMapsAs });
  });
}

/** Resolved once the flames' loop has come (the lab's pages wait for it: landing mid-command, a fire's frame differed). */
export const flamesCome = (): Promise<void> => flamesBaked;

/** the numbers the flames' shader is written with, for its WGSL (fireNodes.ts) */
const FLAME_SHAPE = {
  steps: STEPS, stepsLeast: STEPS_LEAST, spanLeast: SPAN_LEAST, liteStrands: LITE_STRANDS, look: FLAME_LOOK,
  tiles: TILES, stillSlot: STILL.slot, cells: BAKE, kept: KEPT, keptSize: KEPT_SIZE, frames: LOOP.frames,
};

/** `logs` (in a scene's frame, its world matrix `toWorld`) into the flames' `uLogs`, each end from the bed's middle
 *  `centre` (in the world), the rest 0 thick. */
function knowLogs(known: Vec4[], logs: FireLog[], toWorld: Mat4, centre: Vec3): void {
  if (logs.length > LOGS_MOST) throw new Error(`a fire's flames know ${LOGS_MOST} logs at most, not ${logs.length}`);
  const fromCentre = (end: Vec3) => end.clone().applyMatrix4(toWorld).sub(centre);
  logs.forEach((log, i) => {
    known[i * 2].set(...fromCentre(log.from).toArray(), log.radius);
    known[i * 2 + 1].set(...fromCentre(log.to).toArray(), 0);
  });
}

/** A fire's flames' box over its bed's middle (m): as far round as their tongues bend, as high as their tallest puff. */
function flameBox(radius: number, height: number): Vec3 {
  const reach = radius * FLAME_REACH;
  return new Vec3(reach, height * FLAME_TOP * (1 + PUFF_SLOW + PUFF_QUICK) * 1.02, reach);
}

/** A bowl the flames' shader knows as none (its rim under its foot). */
const noBowl = (): Vec2[] => [0, 0, -1].map((y) => new Vec2(y, 0));

/** A fire's flames' material, for its bed's `radius` and its flames' `height` (m), by its seed. */
function flameMat(radius: number, height: number, seed: number): LookMaterial<FlameUniforms> {
  const mat = new LookMaterial<FlameUniforms>({
    uniforms: {
      uFlames: { value: flamesVolume },
      uCentre: { value: new Vec3() },
      uBox: { value: flameBox(radius, height) },
      uRadius: { value: radius },
      uHeight: { value: height * FLAME_TOP },
      uPuff: { value: 1 },
      uGlow: { value: 1 },
      // (each fire its own way round, so no two show the same flames)
      uFrame: { value: 0 },
      uTurn: { value: new Vec2(Math.cos(seed * 6.283), Math.sin(seed * 6.283)) },
      // (none: its rim under its foot)
      uBowl: { value: noBowl() },
      // (none: each 0 thick)
      uLogs: { value: Array.from({ length: LOGS_MOST * 2 }, () => new Vec4()) },
      // (one for every fire: the quality level's)
      uStepShare: stepShare,
      uLite: lite,
    },
    transparent: true,
    depthWrite: false,
    // (its light over what it hides: added, it washed out over anything bright, the daylit forest above all)
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
  });
  // (it fades as the prop under it dissolves, not left burning in the air)
  seeThroughFade(mat, 'prop');
  return rustLook(mat, { ...flameLook(mat.uniforms, FLAME_SHAPE), fades: seeValue('prop') });
}

/** the embers' clock, one for every fire's bed and char (each fire's updater keeps it) */
const emberTime = { value: 0 };

/** A lit char material glowing through its cracks round `centre` out to `radius` (the bed's, a log's charred end), as
 *  hot as `heat` (1 a log's char, more a bed's): lit by the fire as wood is (unlit, its char and ash read flat as
 *  card), its light its own glow. */
export function emberMat(centre: Vec3, radius: number, heat = 1): LitMaterial {
  const mat = new LitMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const centreValue = { value: centre.clone() };
  const radiusValue = { value: radius };
  const heatValue = { value: heat };
  // (its char, ash and glow, and its sheen cut to a fifth: char is matte, and with a standard 4% sheen a metre under
  // the fire's light its lumps outshone their own dark and read as salmon clay)
  rustLook(mat, emberLook({ time: emberTime, centre: centreValue, radius: radiusValue, heat: heatValue }));
  return seeThrough(mat, 'prop');
}

/** A heap of coal lumps over a disc of `radius` (m), highest in its middle, on a dish rising `dish` to its rim; its
 *  base at 0. Laid flat in a brazier's bowl, those away from its middle sank into its sides. */
function coalsGeo(radius: number, dish: number, rng: () => number): Geometry {
  const lumps: Geometry[] = [];
  const count = Math.round(30 + radius * 80);
  for (let i = 0; i < count; i++) {
    const out = Math.sqrt(rng()) * radius * 0.92;
    const angle = rng() * Math.PI * 2;
    const size = radius * (0.07 + rng() * 0.08);
    const lump = shapes.dodecahedron(size, 0).toNonIndexed();
    lump.scale(1 + rng() * 0.5, 0.45 + rng() * 0.25, 1 + rng() * 0.5);
    lump.rotateY(rng() * Math.PI * 2);
    const heap = (1 - out / radius) * radius * 0.28 + (out / radius) ** 2 * dish;
    lump.translate(Math.cos(angle) * out, heap + size * 0.2, Math.sin(angle) * out);
    lumps.push(lump);
  }
  return mergeGeometries(lumps);
}

/** A small deterministic random stream for a fire's lumps, by its place. */
function streamAt(at: Vec3): () => number {
  let state = Math.floor((at.x * 73.1 + at.z * 19.7) * 1000) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Builds the fire `spec` into `scene`: its bed, its flames, and the updater that burns them. */
export function buildFire(scene: Node, spec: FireSpec, updaters: Updater[]): void {
  const { at, radius, height, light } = spec;
  const rng = streamAt(at);
  const bed = emberMat(at, radius, BED_HEAT);
  const coals = new Mesh(coalsGeo(radius, spec.dish, rng), bed);
  coals.position.copy(at);
  scene.add(coals);
  const seed = rng();
  const flames = flameMat(radius, height, seed);
  // (the shader, the embers and the smoke read the world: laid out in a group turned and moved, as the yard's torches
  // are, the sparks rose from the group's own numbers, on the plaza, "weird particles like fire burning")
  scene.updateWorldMatrix(true, false);
  const inWorld = at.clone().applyMatrix4(scene.matrixWorld);
  flames.uniforms.uCentre.value.copy(inWorld);
  flames.uniforms.uGlow.value = spec.glow ?? 1;
  if (spec.bowl) flames.uniforms.uBowl.value = spec.bowl.map(([y, r]) => new Vec2(y, r));
  knowLogs(flames.uniforms.uLogs.value, spec.logs ?? [], scene.matrixWorld, inWorld);
  const box = flameBox(radius, height);
  const volume = new Mesh(shapes.box(box.x * 2, box.y, box.z * 2).translate(0, box.y / 2, 0), flames);
  volume.userData.noMeshlets = true;
  // (found by the profiler, perf/sceneParts.ts, to time the flames alone)
  volume.userData.fireFlames = true;
  // (its box stands over the bed unturned: the shader reads the ray in the world, from `uCentre`)
  volume.position.copy(at);
  // (drawn after the smoke, before the glows)
  volume.renderOrder = 15;
  // (the lab's handle on it: `lab sit` pictures a hero sat by it from beyond it, it hidden)
  volume.name = 'flames';
  // (and on its uniforms, which the material it's drawn with doesn't show: `lab village --only firesStillInFog`)
  volume.userData.flames = flames.uniforms;
  scene.add(volume);
  const lightAt = light.position.clone();
  const due = runPhase({ embers: 0, smoke: 0 });
  updaters.push((dt, t) => {
    emberTime.value = t;
    // (what he can't see plays out nothing, from play, "fire should not animate when in fog of war": its flames held at
    // the moment they had, none of the loop decoded for it, no embers or smoke)
    // (and its flames stand still there, at a frame of the loop held for it, `STILL`: left at the moment they had
    // they burned on with the fires he sees, whose two frames theirs are, "why is fire still burning in fog of
    // war"; and not drawn at all the campfire was out, "why campfire stopped burning, supposed to be frozen flame
    // in fog of war")
    if (inTheFog(inWorld.x, inWorld.z)) {
      flames.uniforms.uFrame.value = STILL.reads;
      flames.uniforms.uPuff.value = 1;
      return;
    }
    const puff = puffAt(t, seed);
    flames.uniforms.uPuff.value = 1 + (puff - 1) * PUFF_SHOWS;
    // (every fire at one moment of the loop, so the GPU holds two frames of it, each fire turned its own way and puffing
    // on its own swell)
    const moment = (t * LOOP_RATE) % LOOP.frames;
    showMoment(moment);
    flames.uniforms.uFrame.value = moment;
    light.intensity = spec.intensity * (1 + (puff - 1) * LIGHT_SWELL);
    // (its strength between puffs, for a measure of its light: read at a puff's moment, `lab village`'s campfire read
    // 23.8 or 29 levels of red by the checks run before it)
    light.userData.rest = spec.intensity;
    light.position.set(lightAt.x + (puff - 1) * LIGHT_SWAY, lightAt.y + (puff - 1) * LIGHT_SWAY * 2, lightAt.z);
    due.embers += dt * spec.embers;
    while (due.embers >= 1) {
      due.embers -= 1;
      spawnEmber(inWorld, radius, height);
    }
    due.smoke += dt * spec.smoke;
    while (due.smoke >= 1) {
      due.smoke -= 1;
      spawnSmoke(inWorld, radius, height * puff, spec.smokeColour);
    }
  });
}

/** An ember thrown up off the bed: a spark that rises, drifts and cools from yellow to red. */
function spawnEmber(at: Vec3, radius: number, height: number): void {
  const out = Math.sqrt(Math.random()) * radius * 0.7;
  const angle = Math.random() * Math.PI * 2;
  particles.glow.spawn({
    x: at.x + Math.cos(angle) * out,
    y: at.y + rand(0.1, 0.45) * height,
    z: at.z + Math.sin(angle) * out,
    vx: rand(-0.45, 0.45),
    vy: rand(1.4, 3.2),
    vz: rand(-0.45, 0.45),
    life: rand(0.7, 1.9),
    size: rand(0.018, 0.036),
    sizeEnd: 0.008,
    color: col(0xffc060, 4),
    colorEnd: col(0xff3000, 0.6),
    gravity: -0.35,
    drag: 0.9,
  });
}

/** A puff of smoke off the flames' tips, rising and spreading as it thins. */
function spawnSmoke(at: Vec3, radius: number, height: number, colour: ColorRepresentation): void {
  particles.smoke.spawn({
    x: at.x + rand(-0.25, 0.25) * radius,
    y: at.y + height * rand(0.75, 0.95),
    z: at.z + rand(-0.25, 0.25) * radius,
    vx: rand(-0.12, 0.12),
    vy: rand(0.45, 0.85),
    vz: rand(-0.12, 0.12),
    life: rand(2.2, 3.4),
    size: radius * 0.6,
    sizeEnd: radius * 2.6,
    color: col(colour),
    alpha: SMOKE_ALPHA,
    drag: 0.25,
  });
}
