// The arena: every biome is built once at boot into its own group, and switching
// shows one and hides the others (instant, and no shader compiles). The hemisphere
// light and the shadow-casting moon are shared; the active biome sets their look.
import * as THREE from 'three';
import { ARENA } from '../data/balance';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { groundHeight } from './ground';
import { setAdaptScale } from '../core/renderer';
import { bakeStaticShadows, type Biome, type BiomeBuilder } from './props';
import { buildCrypt } from './crypt';
import { buildForest } from './forest';

export { groundHeight };
export type { Portal } from './props';

const BUILDERS: Record<BiomeId, BiomeBuilder> = { crypt: buildCrypt, forest: buildForest };

export type Arena = Awaited<ReturnType<typeof buildArena>>;

export async function buildArena(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const hemi = new THREE.HemisphereLight();
  const moon = new THREE.DirectionalLight();
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(4096, 4096);
  const sc = moon.shadow.camera;
  sc.left = sc.bottom = -34; sc.right = sc.top = 34; sc.near = 1; sc.far = 90;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.03;
  scene.add(hemi, moon, moon.target);
  const fog = scene.fog = new THREE.Fog(0);

  const biomes = {} as Record<BiomeId, { group: THREE.Group; b: Biome }>;
  for (const id of BIOME_IDS) {
    // one biome at a time, letting the page paint between them (a window moved to another
    // monitor stays black until the main thread is free)
    await new Promise((r) => setTimeout(r));
    const group = new THREE.Group();
    group.name = id;
    const b = BUILDERS[id](group, renderer);
    bakeStaticShadows(group);
    group.visible = false;
    scene.add(group);
    biomes[id] = { group, b };
  }
  if (import.meta.env.DEV) {
    const lights = BIOME_IDS.map((id) => { let n = 0; biomes[id].group.traverse((o) => { if ((o as THREE.PointLight).isPointLight) n++; }); return n; });
    if (new Set(lights).size > 1) console.error(`Biomes must have the same number of point lights (switching recompiles every shader): ${lights}`);
  }

  let biome: BiomeId = BIOME_IDS[0];
  let active = biomes[biome].b;

  function setBiome(id: BiomeId): void {
    biome = id;
    active = biomes[id].b;
    for (const k of BIOME_IDS) biomes[k].group.visible = k === id;
    const L = active.look;
    (scene.background as THREE.Color).set(L.background);
    fog.color.set(L.fog.color); fog.near = L.fog.near; fog.far = L.fog.far;
    hemi.color.set(L.hemi.sky); hemi.groundColor.set(L.hemi.ground); hemi.intensity = L.hemi.intensity;
    moon.color.set(L.moon.color); moon.intensity = L.moon.intensity; moon.position.set(...L.moon.pos);
    scene.environment = L.env;
    scene.environmentIntensity = L.envIntensity;
    setAdaptScale(L.adapt ?? 1);
  }
  setBiome(biome);

  return {
    get biome() { return biome; },
    get obstacles() { return active.obstacles; },
    /** spawn gates: {pos, dir (into the arena), pulse()} */
    get portals() { return active.portals; },
    moon,
    radius: ARENA.radius,
    groundHeight,
    setBiome,
    setCalm(v: number) { for (const id of BIOME_IDS) biomes[id].b.setCalm(v); },
    update(dt: number, t: number) { active.update(dt, t); },
  };
}
