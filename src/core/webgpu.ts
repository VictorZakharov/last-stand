// What's left of three's WebGPU build in the game (VictorZakharov/last-stand#973: three leaves it): its node
// materials' modules, which the game's materials are still made of, and the places' point lights the engine is
// handed. three's renderer is gone: the engine (src/engine) draws the frame on the page's canvas (core/screen.ts).
// What the renderer's hooks here measured is docs/agents/webgpu.md's history.
import * as THREE from '../engine/three.ts';
import { PIPELINES, engineWorkDone } from '../engine/pipelinesAside';

/** how long a warm-up's slice of work runs before it yields a frame (ms, `compileSlice`): while nothing is played
 *  (the loading screen, the fight's loading bar), and while the lobby is (fitted to what the frames leave,
 *  `fitSlices` in game/warmup.ts). three's async compile read it; the warm-ups still pace themselves by it. */
export const COMPILE_SLICE = { loading: 40, playing: 8, least: 1 };
/** A warm-up's slice set to `ms` (`vite.config.ts` makes three's build read it). */
export function compileSlice(ms: number): void {
  (globalThis as { __compileSliceMs?: number }).__compileSliceMs = ms;
}

/** three's WebGPU build and its node language: what node materials are made from (`loadNodeModules`) */
export let gpu: typeof import('three/webgpu');
export let tsl: typeof import('three/tsl');

/** three's node modules loaded, ahead of any material made of them (core/renderer.ts `initRenderer`). */
export async function loadNodeModules(): Promise<void> {
  gpu = await import('three/webgpu');
  tsl = await import('three/tsl');
}

/** the materials whose nodes hold nothing an object's draw must refresh (three's renderer read it; kept for what
 *  marks them, till the materials leave three) */
export const stillNodes = new WeakSet<THREE.Material>();

/** the objects refreshed in full whatever they are (three's renderer read it; kept for what marks them) */
export const refreshedInFull = new WeakSet<THREE.Object3D>();

/** `group`'s point lights, those casting shadows first (as the rig has them: `rigPointLights`). */
function pointLightsIn(group: THREE.Object3D): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  group.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight); });
  return [...lights.filter((l) => l.castShadow), ...lights.filter((l) => !l.castShadow)];
}

/** `light`'s place, colour, reach and shadow given to `rigged`, and a shadow it was to draw again handed on. */
function mirror(light: THREE.PointLight, rigged: THREE.PointLight): void {
  light.getWorldPosition(rigged.position);
  rigged.color.copy(light.color);
  rigged.intensity = light.intensity;
  rigged.distance = light.distance;
  rigged.decay = light.decay;
  if (light.castShadow) {
    rigged.shadow.mapSize.copy(light.shadow.mapSize);
    rigged.shadow.camera.near = light.shadow.camera.near;
    rigged.shadow.bias = light.shadow.bias;
    rigged.shadow.radius = light.shadow.radius;
    if (light.shadow.needsUpdate) rigged.shadow.needsUpdate = true;
    light.shadow.needsUpdate = false;
  }
  rigged.updateMatrixWorld();
}

/**
 * The biomes' and the hall of heroes' point lights drawn by one rig of lights, the shown one's copied onto it in the
 * scene's hook (its own hidden): three's WebGPU renderer keyed every lit pipeline by its lights' ids. The engine
 * runs no hook and is handed the shown place's own (`shownPointLights`). Each place has as many as the rig, as many
 * casting (`arena.ts` checks): the casters take its first slots.
 */
export function rigPointLights(scene: THREE.Scene, groups: THREE.Object3D[]): void {
  const lightsOf = rigPlaces.lightsOf;
  for (const group of groups) rigMorePointLights(group);
  groups = rigPlaces.groups;
  const most = Math.max(...[...lightsOf.values()].map((lights) => lights.length));
  const rig = Array.from({ length: most }, () => new THREE.PointLight(0xffffff, 0));
  for (const rigged of rig) rigged.userData.rigged = true;
  [...lightsOf.values()][0].forEach((light, i) => {
    rig[i].castShadow = light.castShadow;
    rig[i].shadow.autoUpdate = light.shadow.autoUpdate;
  });
  scene.add(...rig);
  const before = scene.onBeforeRender;
  scene.onBeforeRender = (...args) => {
    const shown = groups.find((group) => group.visible);
    const lights = shown ? lightsOf.get(shown)! : [];
    rig.forEach((rigged, i) => {
      if (lights[i]) mirror(lights[i], rigged);
      else rigged.intensity = 0;
    });
    before.apply(scene, args);
  };
}

/**
 * The shown place's own point lights, which the rig copies (`rigPointLights`) and the scene's walk never meets: the
 * engine runs none of the hooks the rig is set in, and walking the scene for its lights it found the rig's alone,
 * as the last hook left them: a house's candles, hearth and chandelier lit nothing (`lab rust --village --room
 * library`: "0 point lights").
 */
export function shownPointLights(): readonly THREE.PointLight[] {
  const shown = rigPlaces.groups.find((group) => group.visible);
  return (shown && rigPlaces.lightsOf.get(shown)) || NO_LIGHTS;
}
const NO_LIGHTS: readonly THREE.PointLight[] = [];

/** The place shown now, of those the rig copies its lights from (the Rust engine draws its lights' shadows of
 *  what stands still in it: engine/lampShadows.ts). */
export const shownPlace = (): THREE.Object3D | undefined => rigPlaces.groups.find((group) => group.visible);

/** the places the rig copies its lights from, each with its point lights (`rigPointLights`, `rigMorePointLights`) */
const rigPlaces = { groups: [] as THREE.Object3D[], lightsOf: new Map<THREE.Object3D, THREE.PointLight[]>() };

/** A place built after the rig was made (a fight's biome, built at the run's start: world/arena.ts) copied by it too:
 *  it has as many lights as every place, so the rig's lit pipelines take it as they are. */
export function rigMorePointLights(group: THREE.Object3D): void {
  const lights = pointLightsIn(group);
  rigPlaces.lightsOf.set(group, lights);
  rigPlaces.groups.push(group);
  for (const light of lights) light.visible = false;
}

/** The engine's pipelines made so far, and those first asked for in play (`PIPELINES.late`): the profiler's count
 *  of what its parts made. */
export const pipelinesMade = (): { made: number; atDraw: number } => ({ made: PIPELINES.made, atDraw: PIPELINES.late });

/** Waits for the GPU to be done with every command sent so far: the engine's device's queue, which draws the game.
 *  (Its argument is the host's, which the lab still hands it: unread.) */
export async function gpuDone(_host?: unknown): Promise<void> {
  await engineWorkDone();
}
