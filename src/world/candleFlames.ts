// A room's candle flames alive (from play, "candles frozen in time"): every candle's flame, the chronicle's lectern's
// (`candle` in rooms.ts, `candleKit.ts`), its tongue, its core and the glow round it each drawn as one mesh in the
// room's group, its points moved each frame, swaying, stretching and leaning as a candle's flame does in a room's draughts, and the candle's
// light (or its lantern's) breathing with it by a few hundredths of its strength: never a flash (the root AGENTS.md's
// bright effects). Merged with the room's still parts, the flames stood frozen; built as the game's fires (the hall of
// heroes' torches') they read as "a small torch, not a candle" (a review). A flame on a wall the camera cuts away is
// hidden with it (its points drawn in to its foot).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Updater } from './props';

/** what `candle` marks a flame's meshes with (`userData.candleFlame`) */
export type FlamePart = 'tongue' | 'core' | 'halo';
/** the instanced meshes' names, which `lab dressing` reads */
export const FLAME_NAMES: Record<FlamePart, string> = {
  tongue: 'candle flames', core: 'candle flame cores', halo: 'candle glows',
};

/** how far a flame stretches up and how far it leans (a share of its height, and rad), and how fast it wavers (rad/s,
 *  three waves): a stretch of 14% moved under a pixel from where the player stands, and read as frozen still */
const STRETCH = 0.28;
const LEAN = 0.2;
const WAVES = [7.1, 12.7, 3.3] as const;
/** how much a candle's or a lantern's light breathes with its flame (a share of its strength) */
const BREATHES = 0.07;

/** One flame: where it stood, its own phase, and the cut-away wall it's hidden with, if any. */
interface Lit {
  at: THREE.Matrix4;
  phase: number;
  hiddenWith: THREE.Object3D | null;
}

/** A part's flames drawn as one mesh: their points moved each frame from the part's own shape (`shape`, its points'
 *  positions as built), each flame's `points` of them in turn. */
interface Flames {
  mesh: THREE.Mesh;
  lit: Lit[];
  shape: Float32Array;
  points: number;
}

/** A wavering from -1 to 1 at time `t`, a candle's own by `phase`: three waves, none a steady beat. */
function waver(t: number, phase: number, by: number): number {
  const [a, b, c] = WAVES;
  return 0.5 * Math.sin(t * a + phase * by) + 0.3 * Math.sin(t * b + phase * 2.3 * by) + 0.2 * Math.sin(t * c + phase);
}

/** the first of `hidable` over `object` up to `room`, the wall it's cut away with */
function holderOf(object: THREE.Object3D, room: THREE.Object3D,
  hidable: ReadonlySet<THREE.Object3D>): THREE.Object3D | null {
  for (let up = object.parent; up && up !== room; up = up.parent) if (hidable.has(up)) return up;
  return null;
}

/** each candle's phase, by where it stands: a flame's tongue, core and glow share it, and waver as one */
function phaseAt(matrix: THREE.Matrix4): number {
  const [x, z] = [matrix.elements[12], matrix.elements[14]];
  return x * 3.1 + z * 1.7;
}

/** how far past its flames' box a part's sphere reaches, so a flame stretched and leant stays inside it (m) */
const SWAY_ROOM = 0.06;

/** The room's flames of one part (`part`), taken out of where they stood and drawn as one mesh. Drawn as an instanced
 *  mesh, the engine drew each flame apart: a draw a candle, the tavern's 18 (`lab village --only sweepWithinBudgets`). */
function gather(room: THREE.Group, part: FlamePart, hidable: ReadonlySet<THREE.Object3D>): Flames | null {
  const found: THREE.Mesh[] = [];
  room.traverse((object) => { if (object.userData.candleFlame === part) found.push(object as THREE.Mesh); });
  if (!found.length) return null;
  room.updateMatrixWorld(true);
  const toRoom = room.matrixWorld.clone().invert();
  const lit = found.map((flame) => {
    const at = toRoom.clone().multiply(flame.matrixWorld);
    return { at, phase: phaseAt(at), hiddenWith: holderOf(flame, room, hidable) };
  });
  const own = found[0].geometry.index ? found[0].geometry.toNonIndexed() : found[0].geometry.clone();
  const shape = (own.attributes.position.array as Float32Array).slice();
  const points = own.attributes.position.count;
  const geometry = mergeGeometries(lit.map(({ at }) => own.clone().applyMatrix4(at)));
  (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += SWAY_ROOM;
  const mesh = new THREE.Mesh(geometry, found[0].material);
  mesh.name = FLAME_NAMES[part];
  // (each flame's points, which `lab dressing` reads flame by flame)
  mesh.userData.flamePoints = points;
  for (const flame of found) flame.removeFromParent();
  room.add(mesh);
  // (kept out of the room's merge, as `keepApart` in rooms.ts marks a part: imported, that would import this file back)
  mesh.userData.noMerge = true;
  return { mesh, lit, shape, points };
}

const sway = new THREE.Matrix4(), turn = new THREE.Euler(), scale = new THREE.Vector3(), placed = new THREE.Matrix4();
const point = new THREE.Vector3();

/** Each flame stood where it was, stretched and leant as it wavers now; its points all at its foot where its wall is
 *  cut away. */
function move({ mesh, lit, shape, points }: Flames, t: number): void {
  const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
  const out = position.array as Float32Array;
  lit.forEach((one, k) => {
    if (one.hiddenWith && !one.hiddenWith.visible) {
      placed.copy(one.at).scale(scale.set(0, 0, 0));
    } else {
      const up = 1 + STRETCH * waver(t, one.phase, 1);
      // (leant from its foot, where the wick holds it: a flame's lathe has its foot at its origin)
      turn.set(LEAN * waver(t * 0.9, one.phase, 1.7), 0, LEAN * waver(t * 1.1, one.phase, 2.9));
      scale.set(1 / Math.sqrt(up), up, 1 / Math.sqrt(up));
      sway.makeRotationFromEuler(turn).scale(scale);
      placed.multiplyMatrices(one.at, sway);
    }
    for (let at = 0; at < points; at++) {
      point.fromArray(shape, at * 3).applyMatrix4(placed).toArray(out, (k * points + at) * 3);
    }
  });
  position.needsUpdate = true;
}

/** The lights the candles' tongues name (`userData.light`: a candle's own, or its lantern's), each breathing about its
 *  own strength with its flame. */
function breathing(room: THREE.Group): Updater | null {
  const lights: { light: THREE.PointLight; strength: number; phase: number }[] = [];
  room.updateMatrixWorld(true);
  room.traverse((object) => {
    const light = object.userData.candleFlame === 'tongue' ? object.userData.light as THREE.PointLight | undefined : undefined;
    if (light) lights.push({ light, strength: light.intensity, phase: phaseAt(object.matrixWorld) });
  });
  if (!lights.length) return null;
  return (dt, t) => {
    for (const { light, strength, phase } of lights) light.intensity = strength * (1 + BREATHES * waver(t, phase, 1));
  };
}

/** The room's candles' flames made live: their tongues, cores and glows one mesh each, moved by the room's
 *  updaters, their lights breathing. `hidable`: what the camera cuts away (its walls and what stands against them).
 *  Called as the room is finished. */
export function liveFlames(room: THREE.Group, hidable: ReadonlySet<THREE.Object3D>, updaters: Updater[]): void {
  const breathe = breathing(room);
  for (const part of ['tongue', 'core', 'halo'] as const) {
    const made = gather(room, part, hidable);
    if (!made) continue;
    updaters.push((dt, t) => move(made, t));
  }
  if (breathe) updaters.push(breathe);
}
