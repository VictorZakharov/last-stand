// The arena: every place is built once at boot into its own group, and switching shows one and hides the others
// (instant, and no shader compiles): the village the lobby stands in (`village.ts`), and each biome a run is fought in.
// The hall of heroes' room (`heroHall.ts`) is built beside them and shown in the village's place while the hero
// selection screen is up (the hall on the village's terrace is its door).
// The hemisphere light and the shadow-casting moon are shared; the place shown sets their look, the village's by the
// hour (`setHour`).
import * as THREE from 'three';
import { ARENA } from '../data/balance';
import { BIOME_IDS, type BiomeId, type PlaceId } from '../data/biomes';
import { groundHeight, setRelief } from './ground';
import { setAdaptScale } from '../core/renderer';
import { bakeStaticShadows, compileEnvMaps as compileEach, drawStillShadows, envMap, lampShadowsAsked, mergeStill, type Biome, type BiomeBuilder, type BiomeLook } from './props';
import { cullWhileDrawn, trimShadowCasters } from './culling';
import { castHeroesOverLamps } from './lampShadows';
import { cullOutsideHall } from './hallPortal';
import { buildCrypt, CRYPT_ENV } from './crypt';
import { buildForest, FOREST_ENV } from './forest';
import { buildVillage, VILLAGE_ENV, type Village } from './village';
import { buildHeroHall } from './heroHall';
import { restoreProps, state as propState } from './destructible';
import { emit } from '../events';
import { G } from '../state';
import { stumpPreloaded } from './stump';

export { groundHeight };
export type { Portal } from './props';

const BUILDERS: Record<BiomeId, BiomeBuilder> = { crypt: buildCrypt, forest: buildForest };

export type Arena = Awaited<ReturnType<typeof buildArena>>;

/** Every place's environment's programs compiled ahead of the places, linked as they're built (`compileEnvMaps`). */
export const compileEnvMaps = (renderer: THREE.WebGLRenderer): void => compileEach(renderer, [VILLAGE_ENV, CRYPT_ENV, FOREST_ENV]);

/** The moon's shadow camera as it's placed for a biome's `look` (the box it draws round the middle). */
function shadowCameraFor(moon: THREE.DirectionalLight, look: BiomeLook): THREE.OrthographicCamera {
  const camera = moon.shadow.camera.clone();
  camera.position.set(...look.moon.pos);
  camera.lookAt(moon.target.position);
  camera.updateProjectionMatrix();
  return camera;
}

/** The hour the village is lit for before anyone sets it (a dusk) */
const FIRST_HOUR = 18.5;

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
  cullWhileDrawn(scene, renderer);
  castHeroesOverLamps(renderer);
  const fog = scene.fog = new THREE.Fog(0);

  const places = {} as Record<PlaceId, { group: THREE.Group; b: Biome }>;
  // (what a worker sculpts for a biome meanwhile: the forest's stump)
  await stumpPreloaded();
  for (const id of BIOME_IDS) {
    // one place at a time, letting the page paint between them (a window moved to another monitor stays black until
    // the main thread is free)
    await new Promise((r) => setTimeout(r));
    const group = new THREE.Group();
    group.name = id;
    const b = BUILDERS[id](group);
    b.wall.seal();
    bakeStaticShadows(group);
    trimShadowCasters(group, shadowCameraFor(moon, b.look));
    group.visible = false;
    group.matrixAutoUpdate = false;
    scene.add(group);
    places[id] = { group, b };
  }
  await new Promise((r) => setTimeout(r));
  const villageGroup = new THREE.Group();
  villageGroup.name = 'village';
  const village: Village = buildVillage(villageGroup);
  village.wall.seal();
  // (its casters aren't trimmed to a shadow camera: the sun goes round it with the hour)
  bakeStaticShadows(villageGroup);
  mergeStill(villageGroup);
  villageGroup.visible = false;
  villageGroup.matrixAutoUpdate = false;
  scene.add(villageGroup);
  cullOutsideHall(scene, villageGroup, village.hallCutaway);
  places.village = { group: villageGroup, b: village };
  // (the hall of heroes' room, shown in the village's place while the hero selection screen is up: `showHall`)
  const hallGroup = new THREE.Group();
  hallGroup.name = 'hall';
  const hall = buildHeroHall(hallGroup);
  bakeStaticShadows(hallGroup);
  trimShadowCasters(hallGroup, shadowCameraFor(moon, hall.look));
  hallGroup.visible = false;
  // (none of the places moves: a matrix made again each frame marks all under it changed, `standStill` in props.ts)
  hallGroup.matrixAutoUpdate = false;
  scene.add(hallGroup);
  if (import.meta.env.DEV) {
    const groups = [...Object.values(places).map((p) => p.group), hallGroup];
    const lights = groups.map((g) => { let n = 0; g.traverse((o) => { if ((o as THREE.PointLight).isPointLight) n++; }); return n; });
    if (new Set(lights).size > 1) console.error(`Places must have the same number of point lights (switching recompiles every shader): ${lights}`);
    // (and as many casting: each is written out in every lit program, `loopPointLights`)
    const casting = groups.map((g) => {
      let n = 0;
      g.traverse((o) => { if ((o as THREE.PointLight).isPointLight && o.castShadow) n++; });
      return n;
    });
    if (new Set(casting).size > 1) console.error(`Places must have as many point lights casting shadows: ${casting}`);
  }

  /** the run's biome (the one a portal or a co-op host chose), and the place shown */
  let biome: BiomeId = BIOME_IDS[0];
  let shown: PlaceId = 'village';
  let active = places.village.b;
  /** the place and the props' revision its still shadows were last drawn for (`drawStillShadows`) */
  const stillDrawn = { place: null as PlaceId | 'hall' | null, rev: -1, lamps: 0 };
  /** whether the hall of heroes' room stands in the place's stead */
  let hallShown = false;
  /** the village's look now (`setHour`: it changes with the hour, applied every frame while it's shown) */
  const villageLook: BiomeLook = { ...village.look };
  let hour = FIRST_HOUR;

  /** `id` the run's biome (shown if a run is on: the lobby stands in the village). */
  function setBiome(id: BiomeId): void {
    const changed = id !== biome;
    biome = id;
    if (shown !== 'village') show(id);
    if (changed) emit('biomeChanged', id);
  }
  function show(place: PlaceId): void {
    shown = place;
    active = places[place].b;
    // (chosen while the hall is up, a co-op host's pick: shown as it's taken down)
    if (hallShown) return;
    setRelief(active.relief ?? null);
    for (const k of Object.keys(places) as PlaceId[]) places[k].group.visible = k === place;
    hallGroup.visible = false;
    if (place === 'village') village.daylight(hour, villageLook);
    setLook(place === 'village' ? villageLook : active.look);
  }
  function setLook(L: BiomeLook): void {
    setColours(L);
    scene.environment = envMap(renderer, L.env);
  }
  /** what of a look changes with the hour: everything but its environment's map */
  function setColours(L: BiomeLook): void {
    (scene.background as THREE.Color).set(L.background);
    fog.color.set(L.fog.color); fog.near = L.fog.near; fog.far = L.fog.far;
    hemi.color.set(L.hemi.sky); hemi.groundColor.set(L.hemi.ground); hemi.intensity = L.hemi.intensity;
    moon.color.set(L.moon.color); moon.intensity = L.moon.intensity; moon.position.set(...L.moon.pos);
    scene.environmentIntensity = L.envIntensity;
    setAdaptScale(L.adapt ?? 1);
  }
  show('village');

  return {
    /** the run's biome */
    get biome() { return biome; },
    /** the place shown: the village (the lobby), or the run's biome */
    get place(): PlaceId { return shown; },
    get obstacles() { return active.obstacles; },
    /** the breakable ones (`world/destructible.ts`) */
    get props() { return active.props; },
    /** every biome's props whole again (a new run, the lobby) */
    restoreProps() { for (const id of BIOME_IDS) restoreProps(places[id].b.props); },
    /** every biome's run-shaped props built again from a run's seed (`Biome.roll`) */
    rollProps(seed: number) {
      for (const id of BIOME_IDS) places[id].b.roll?.(seed);
      // (their circles' heights and girths: the navigation's grid made again)
      propState.rev++;
    },
    /** spawn gates: {pos, dir (into the arena), pulse()} */
    get portals() { return active.portals; },
    /** the wall as drawn, which bodies walk up to and what flies meets (`world/wall.ts`) */
    get wall() { return active.wall; },
    moon,
    radius: ARENA.radius,
    groundHeight,
    setBiome,
    /** The village shown (the lobby), or the run's biome (`on` false). Each has as many lights, so it compiles nothing. */
    showVillage(on: boolean) { show(on ? 'village' : biome); },
    /** whether the hall of heroes' room is shown in the place's stead (its stage has no props; `obstacles` stay the
     *  place's) */
    get hallShown() { return hallShown; },
    /** The hall of heroes' room shown in the place's stead (`on`), or the place back: its plinths the floor's relief,
     *  its look the scene's. Its lights are as many as a place's, so the switch compiles nothing. */
    showHall(on: boolean) {
      hallShown = on;
      if (!on) { show(shown); return; }
      for (const k of Object.keys(places) as PlaceId[]) places[k].group.visible = false;
      hallGroup.visible = true;
      setRelief(hall.relief);
      setLook(hall.look);
    },
    /** the hall of heroes' room (hidden but while it's shown): what the heroes' warm-up shows */
    hallGroup,
    /** the village as built: its portals' ways out, its chest */
    village,
    /** The hour the village is lit for (0-24: the player's clock, or a co-op host's). */
    setHour(h: number) { hour = h; },
    /** a place's own pieces (hidden while another is shown): what the warm-up leaves out or shows */
    groupOf(id: PlaceId): THREE.Group { return places[id].group; },
    setCalm(v: number) { for (const id of BIOME_IDS) places[id].b.setCalm(v); },
    update(dt: number, t: number) {
      if (hallShown) hall.update(dt, t); else active.update(dt, t);
      if (shown === 'village' && !hallShown) {
        village.daylight(hour, villageLook);
        setColours(villageLook);
      }
      // (the still shadows of its warmest lights, drawn again when what stands in it changed: shown, broken, rolled)
      const now = hallShown ? 'hall' : shown;
      // (and a lamp's, as it takes a casting light: `lampShadow`)
      const lamps = lampShadowsAsked();
      if (stillDrawn.place !== now || stillDrawn.rev !== propState.rev || stillDrawn.lamps !== lamps) {
        drawStillShadows(renderer, scene, G.camera, hallShown ? hallGroup : places[shown].group, moon.shadow);
        stillDrawn.place = now;
        stillDrawn.rev = propState.rev;
        stillDrawn.lamps = lamps;
      }
    },
  };
}
