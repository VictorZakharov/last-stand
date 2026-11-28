// Lamps every lit surface is lit by, at any distance, as a renderer with clustered lights lights them (Unreal's
// forward shading lists the lights in a grid of cells and lights each pixel by its cell's): three's own point lights
// are as many as its programs were compiled for, and a light more compiles them all again, so the village's street
// lamps were lit by the pool's lights at the three nearest the hero alone, the rest drawn as painted pools that turned
// into lit ground as he walked up (from play: "I dont like when lights change from low quality to high quality when I
// come close, it looks lame"). These are a list the engine lights every lit surface by (src/engine/lights.ts: three's
// lit shaders were patched to loop over it, `lightTheLamps`, gone with three), and no light in the list changes a
// pipeline. The list is one array of floats, so a lamp set here is set for all.
//
// Each lamp casts the shadows of what stands still round it, from a map of them all drawn once (`world/lampAtlas.ts`:
// six faces a lamp, the distance to the nearest thing it meets in each texel, as a point light's cube holds it), as
// lamps and what stands round them never move: lit by the list alone, every lamp but the two nearest the hero, which
// cast by the pool's casting lights, lit through what stood round it (from play, "your light test for each light need
// to test SHADOW, it was missing for half of them"). Its light would still go through walls the map hasn't, so one
// box on the ground is a shelter (the hall of heroes' inside), and each lamp lights either what's inside it or what's
// outside (its torches lit the terrace through the hall's walls, and the street lamps its room; switched over at its
// door, the lamps went out as the hero walked in, "lights turn off when I enter the hall").
import { Color, DataTexture, HalfFloatType, RedFormat, Vec3 } from '../engine/api/index.ts';

/** the most lamps the list holds */
export const LAMPS_MOST = 24;

/** the shadows' map: each lamp's six faces a tile of `SHADOW_TILE` texels, `SHADOW_COLUMNS` tiles a row, in turn */
export const SHADOW_TILE = 256;
export const SHADOW_COLUMNS = 12;
/** the map, made at once so every material shares the one texture, with nothing in it (its picture copied in later,
 *  `world/lampAtlas.ts`) */
export const lampShadowMap = new DataTexture(null, SHADOW_TILE * SHADOW_COLUMNS,
  SHADOW_TILE * Math.ceil(LAMPS_MOST * 6 / SHADOW_COLUMNS), RedFormat, HalfFloatType);
lampShadowMap.needsUpdate = true;

/** the list, four floats an entry: its first the shelter (its least x and z, its most), then two a lamp: its place and
 *  how far it reaches (m), and its colour times its intensity, a point light's in candela, and which side of the
 *  shelter it lights (1 inside, -1 outside; 0: out, skipped); last, whether the shadows' map is drawn (its first) */
const list = new Float32Array((1 + LAMPS_MOST * 2 + 1) * 4);
/** the last entry's first float: whether the shadows' map is drawn */
const SHADOWS_ON = (1 + LAMPS_MOST * 2) * 4;
/** the last entry's second: how far off a surface its side of the shelter is read (a lab may read it on the surface) */
const SHELTER_READ = SHADOWS_ON + 1;
/** how far off a surface, along its normal, its side of the shelter is read (m) */
const SHELTER_OFF = 0.05;
list[SHELTER_READ] = SHELTER_OFF;

/** the list as it stands (the engine reads the lamps from it: src/engine/lights.ts) */
export const lampList = list;

/** lamp `i`'s first float, and its light's */
const placeOf = (i: number): number => (1 + i * 2) * 4;
const lightOf = (i: number): number => placeOf(i) + 4;

/** how soft a lamp's light is close to (m squared, added to the square of the distance: as if a ball of about 2 m lit it);
 *  its light on a head under it halved, on the ground 5 m off a tenth less. A pooled light is as soft by its `decay`. */
export const LAMP_SOFT = 4;

/** A lamp's place: where it burns, how far it reaches (m), and whether it lights the shelter's inside; and for a
 *  renderer that bakes its light (src/engine/lightCache.ts) its colour times its intensity at its fullest, where
 *  every lamp on its side of the shelter dims and brightens with it (the street's by the hour, the hall's torches). */
export interface LampPlace { at: Vec3; reach: number; inside: boolean; full?: [number, number, number] }

/** whether each lamp lights the shelter's inside, and how far it reaches (m), as placed */
let insides: boolean[] = [];
let reaches: number[] = [];
/** each lamp's light at its fullest, where it was said (`LampPlace.full`) */
let fulls: (LampPlace['full'])[] = [];

/** Lamp `i`'s light at its fullest and its side of the shelter, if its place said its fullest: one whose light
 *  may be baked. */
export function lampStill(i: number): { full: [number, number, number]; inside: boolean } | null {
  const full = fulls[i];
  return full ? { full, inside: insides[i] } : null;
}
/** a quality's share of each lamp's reach, and whether it reads the shadows' map (`setLampQuality`); and whether the
 *  map is there to read (`setLampShadows`) */
let reachBy = 1;
let shadowsAllowed = true;
let shadowsDrawn = false;

/** The lamps' share of their reach and whether their shadows are read, for a quality: on Low, lit within 18 m, each
 *  pixel by night took the light (and the map's sixteen reads) of 4.6 lamps on the square (on an S25
 *  Edge at full res, the lamps 5.5 ms of an 80 ms frame and their shadows 5); a reach of 12.6 m takes about half
 *  (at 10 m the square's middle lay dark between them). Uniforms alone: a quality switches it live. */
export function setLampQuality(reach: number, shadows: boolean): void {
  reachBy = reach;
  shadowsAllowed = shadows;
  list[SHADOWS_ON] = shadowsDrawn && shadowsAllowed ? 1 : 0;
  reaches.forEach((r, i) => { list[placeOf(i) + 3] = r * reachBy; });
}

/** A quality's share of each lamp's reach (a light standing in for a lamp reaches as far). */
export const lampReachBy = (): number => reachBy;

/** The shelter (its least x and z, its most) and the lamps (none past `LAMPS_MOST`), each out until `lightLamp`. */
export function placeLamps(shelter: [number, number, number, number], places: readonly LampPlace[]): void {
  if (places.length > LAMPS_MOST) console.error(`placeLamps: ${places.length} lamps, ${LAMPS_MOST} lit at the most`);
  const shadows = list[SHADOWS_ON];
  list.fill(0);
  list[SHADOWS_ON] = shadows;
  reaches = places.slice(0, LAMPS_MOST).map((place) => place.reach);
  list[SHELTER_READ] = SHELTER_OFF;
  list.set(shelter, 0);
  insides = places.slice(0, LAMPS_MOST).map((place) => place.inside);
  fulls = places.slice(0, LAMPS_MOST).map((place) => place.full);
  for (const [i, place] of places.slice(0, LAMPS_MOST).entries()) {
    list.set([place.at.x, place.at.y, place.at.z, place.reach * reachBy], placeOf(i));
  }
}

/** An opening in the shelter's walls the sky lights its inside through (a window): its middle, and the way it faces
 *  into the shelter (1 or -1 along x, 2 or -2 along z). */
export interface ShelterOpening { at: Vec3; way: number }

/** the shelter's openings, each half `openingHalf` wide and high (m) */
let openings: ShelterOpening[] = [];
let openingHalf: [number, number] = [0, 0];

/** The shelter's openings, all of a size (half its width and height, m): the engine lights its inside through them by
 *  the sky (from play, "windows are not real windows, they dont let light through"). */
export function placeShelterOpenings(half: [number, number], placed: readonly ShelterOpening[]): void {
  openingHalf = half;
  openings = [...placed];
}

/** The shelter's openings and their half size, as placed. */
export const shelterOpenings = (): { half: [number, number]; openings: readonly ShelterOpening[] } =>
  ({ half: openingHalf, openings });

/** For a harness (tools/lab): each surface's side of the shelter read on it, as it was (or off it again). */
export function readShelterOnSurface(on: boolean): void {
  list[SHELTER_READ] = on ? 0 : SHELTER_OFF;
}

/** Lamp `i` (in `placeLamps`' order) lit in `color` at `intensity` (a point light's, in candela); 0 puts it out. */
export function lightLamp(i: number, color: Color, intensity: number): void {
  if (i >= insides.length) return;
  const side = intensity > 0 ? (insides[i] ? 1 : -1) : 0;
  // (held out by a harness, the lamp's light is kept for when they're back: the village lights its lamps every frame,
  // and wrote over the harness's lamps out at once, so the Profile's "lamps out" put them out for a frame alone)
  (heldList ?? list).set([color.r * intensity, color.g * intensity, color.b * intensity, side], lightOf(i));
}

/** Whether the shadows' map is drawn and read (`world/lampAtlas.ts`; read where the quality has it,
 *  `setLampQuality`); off, every lamp lights through all. */
export function setLampShadows(on: boolean): void {
  shadowsDrawn = on;
  list[SHADOWS_ON] = shadowsDrawn && shadowsAllowed ? 1 : 0;
}

/** Whether the quality level reads the lamps' shadows at all (`setLampQuality`): for a renderer with a map of its own
 *  (src/engine), which read them at every level. */
export const lampShadowsAllowed = (): boolean => shadowsAllowed;

/** Whether the shadows' map is drawn and read. */
export const lampShadowsOn = (): boolean => list[SHADOWS_ON] > 0;

/** the list as it stood when a harness held the lamps out */
let heldList: Float32Array | null = null;

/** For a harness (tools/lab): every lamp out, what the list takes of a frame's pixels told; off, as they were. */
export function lampsHeldOut(out: boolean): void {
  if (out) {
    heldList = list.slice();
    lampsOut();
  } else if (heldList) {
    list.set(heldList);
    heldList = null;
  }
}

/** Every lamp put out. */
export function lampsOut(): void {
  for (let i = 0; i < insides.length; i++) list[lightOf(i) + 3] = 0;
}
