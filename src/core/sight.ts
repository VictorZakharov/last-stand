// What the hero can see from where he stands, from above (from play, "we have a bug that allows character to see inside
// buildings while staying outside, we need to evaluate cone of possible view (360) and hide the areas player cannot
// possibly see (black out)"): rays all round him against the walls, as far as each goes kept in a strip of a texture, and
// each pixel of the frame blacked as the post chain starts (before the bloom, so nothing unseen glows), its place in the
// world read from the frame's depth. One program, for every renderer; a wall is a line on the floor, so nothing else in
// the scene compiles or draws more. Through the eyes and over the shoulder the camera stands where he does, and walls hide
// what they hide.
import * as THREE from 'three';

/** A wall as a line on the floor, from (x0, z0) to (x1, z1). */
export interface SightWall { x0: number; z0: number; x1: number; z1: number }

/** how many rays go round him, and how far one goes that meets nothing (m) */
const RAYS = 1024;
const FAR = 300;
/** how far he must move for the rays to be cast again (m) */
const MOVED = 0.02;

/** the rays' strip, and its numbers as half floats */
const reach = new Uint16Array(RAYS);
const sightTexture = new THREE.DataTexture(reach, RAYS, 1, THREE.RedFormat, THREE.HalfFloatType);
sightTexture.minFilter = sightTexture.magFilter = THREE.LinearFilter;
sightTexture.wrapS = THREE.RepeatWrapping;
sightTexture.wrapT = THREE.ClampToEdgeWrapping;
sightTexture.needsUpdate = true;

/** The uniforms of the frame's sight, the same objects in WebGL's pass and WebGPU's nodes. */
export const SIGHT = {
  tSight: { value: sightTexture as THREE.Texture },
  /** how much of the blacking is on: 0 where it's off, eased in as the view comes down from above */
  uSightOn: { value: 0 },
  uSightFrom: { value: new THREE.Vector2() },
  uSightInverse: { value: new THREE.Matrix4() },
  /** the building that's shut to him (least x, least z, most x, most z): nothing of it shows up to its walls' top */
  uSightSealed: { value: new THREE.Vector4(1, 1, 0, 0) },
};

/** How far past a wall's near face stays seen (its thickness), and over how much further the black comes in (m); how high
 *  what's seen by anyone stands (the roofs, the trees' crowns, m), and how high over a building shut to him */
export const SIGHT_LOOK = { wall: 0.5, soft: 0.45, over: 3.2, overSealed: 8, overSoft: 0.4 };

let walls: readonly SightWall[] = [];
let building: THREE.Vector4 | null = null;
let castFrom: { x: number; z: number } | null = null;
let heldOff = false;

/** The walls that stop his sight, and the building a wall of which he may be outside (its least x and z, its most). */
export function sightWalls(lines: readonly SightWall[], sealedBuilding: THREE.Vector4 | null): void {
  walls = lines;
  building = sealedBuilding;
  castFrom = null;
}

/** The blacking held off whatever else asks for it (`lab village --only sightBlacksOut`'s canary). */
export function holdSightOff(off: boolean): void {
  heldOff = off;
}

/** How far a ray from (x, z) along (dx, dz) goes before a wall. */
function rayReach(x: number, z: number, dx: number, dz: number): number {
  let nearest = FAR;
  for (const wall of walls) {
    const ex = wall.x1 - wall.x0;
    const ez = wall.z1 - wall.z0;
    const facing = dx * ez - dz * ex;
    if (Math.abs(facing) < 1e-6) continue;
    const ox = wall.x0 - x;
    const oz = wall.z0 - z;
    const along = (ox * ez - oz * ex) / facing;
    const on = (ox * dz - oz * dx) / facing;
    if (along > 0 && along < nearest && on >= 0 && on <= 1) nearest = along;
  }
  return nearest;
}

/** The rays cast again from (x, z). */
function castRays(x: number, z: number): void {
  for (let i = 0; i < RAYS; i++) {
    // (as the shader reads them: an angle by `atan(z, x)`, from -pi to pi over the strip, a ray at a texel's middle)
    const angle = ((i + 0.5) / RAYS - 0.5) * Math.PI * 2;
    reach[i] = THREE.DataUtils.toHalfFloat(rayReach(x, z, Math.cos(angle), Math.sin(angle)));
  }
  sightTexture.needsUpdate = true;
}

/** The hero at (x, z), the blacking `wanted` or not: eased in and out over the frames, `rate` a share a frame. */
export function seeFrom(x: number, z: number, wanted: boolean, rate: number): void {
  const target = wanted && !heldOff ? 1 : 0;
  const on = SIGHT.uSightOn;
  on.value += Math.max(-rate, Math.min(rate, target - on.value));
  if (on.value <= 0) return;
  if (!castFrom || Math.hypot(castFrom.x - x, castFrom.z - z) > MOVED) {
    castRays(x, z);
    castFrom = { x, z };
  }
  SIGHT.uSightFrom.value.set(x, z);
  const inside = building && x > building.x && x < building.z && z > building.y && z < building.w;
  if (building && !inside) SIGHT.uSightSealed.value.copy(building);
  else SIGHT.uSightSealed.value.set(1, 1, 0, 0);
}

/** The frame's camera told to the blacking, as it's about to be drawn. */
export function aimSight(camera: THREE.Camera): void {
  if (SIGHT.uSightOn.value <= 0) return;
  camera.updateMatrixWorld();
  SIGHT.uSightInverse.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
}

/** WebGL's pass: how much of a pixel at `uv` of depth `depth` he can see. */
export const SIGHT_GLSL = /* glsl */`
  uniform sampler2D tSight; uniform sampler2D tSightDepth; uniform float uSightOn; uniform vec2 uSightFrom;
  uniform mat4 uSightInverse; uniform vec4 uSightSealed;
  float seen(vec2 uv) {
    if (uSightOn <= 0.0) return 1.0;
    float depth = texture2D(tSightDepth, uv).r;
    if (depth >= 0.99999) return 1.0;
    vec4 world = uSightInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 place = world.xyz / world.w;
    vec2 to = place.xz - uSightFrom;
    // (atan(0, 0) is undefined, and NaN smears over the frame in the bloom)
    float away = length(to);
    if (away < 0.3) return 1.0;
    float reach = texture2D(tSight, vec2(atan(to.y, to.x) / ${(Math.PI * 2).toFixed(6)} + 0.5, 0.5)).r;
    float open = 1.0 - smoothstep(reach + ${SIGHT_LOOK.wall.toFixed(2)},
      reach + ${(SIGHT_LOOK.wall + SIGHT_LOOK.soft).toFixed(2)}, away);
    float shut = step(uSightSealed.x, place.x) * step(place.x, uSightSealed.z)
      * step(uSightSealed.y, place.z) * step(place.z, uSightSealed.w);
    float over = mix(${SIGHT_LOOK.over.toFixed(2)}, ${SIGHT_LOOK.overSealed.toFixed(2)}, shut);
    float above = smoothstep(over, over + ${SIGHT_LOOK.overSoft.toFixed(2)}, place.y);
    return mix(1.0, max(open, above), uSightOn);
  }
`;
