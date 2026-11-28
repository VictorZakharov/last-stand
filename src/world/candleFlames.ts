// A room's candles burn as the game's fires do (from play, "candles frozen in time", then "flames need to use our fire
// effect like hall of heroes"): every flame `candle` in rooms.ts marks is built again by `buildFire`, the fluid
// flames the hall of heroes' torches and the braziers burn, small and with no bed of coals (a candle burns on its
// wick), its still tongue and glow taken out. A candle's own light, or its lantern's, is the light its puffs sway; one
// with none sways a light the scene never holds, as the torches' do (`torchFire.ts`). A flame on a wall the camera
// cuts away is hidden with it.
import * as THREE from 'three';
import { buildFire } from './fire';
import type { Updater } from './props';

/** what `candle` marks its flame's meshes with (`userData.candleFlame`), and the light it gives it, if any
 *  (`userData.light`) */
export type FlamePart = 'flame' | 'halo';

/** a candle's fire: its bed's radius and its flames' height (m) over its wick, and its flames' light (a share of a
 *  fire's: seen close, a ray through a small fire's foot crosses little flame, so at full) */
const CANDLE_FIRE = { radius: 0.022, height: 0.1, glow: 3 };

/** the first of `hidable` over `object` up to `room`, the wall it's cut away with */
function holderOf(object: THREE.Object3D, room: THREE.Object3D,
  hidable: ReadonlySet<THREE.Object3D>): THREE.Object3D | null {
  for (let up = object.parent; up && up !== room; up = up.parent) if (hidable.has(up)) return up;
  return null;
}

/** The room's candles' flames burnt as fires: each marked tongue taken out with its glow and a fire built in the room
 *  where it stood, kept out of the room's merge, hidden with its wall. `hidable`: what the camera cuts away (its walls
 *  and what stands against them). Called as the room is finished. */
export function liveFlames(room: THREE.Group, hidable: ReadonlySet<THREE.Object3D>, updaters: Updater[]): void {
  const tongues: THREE.Mesh[] = [];
  const glows: THREE.Mesh[] = [];
  room.traverse((object) => {
    if (object.userData.candleFlame === 'flame') tongues.push(object as THREE.Mesh);
    if (object.userData.candleFlame === 'halo') glows.push(object as THREE.Mesh);
  });
  room.updateMatrixWorld(true);
  const toRoom = room.matrixWorld.clone().invert();
  for (const tongue of tongues) {
    // (its wick's top, where the tongue's foot stood, in the room's frame)
    const at = new THREE.Vector3().setFromMatrixPosition(tongue.matrixWorld).applyMatrix4(toRoom);
    const holder = holderOf(tongue, room, hidable);
    const light = (tongue.userData.light as THREE.PointLight | undefined) ?? new THREE.PointLight(0xffffff, 1);
    const before = room.children.length;
    buildFire(room, {
      at, radius: CANDLE_FIRE.radius, height: CANDLE_FIRE.height, dish: 0, light, intensity: light.intensity,
      smoke: 0, smokeColour: 0x2a2826, embers: 0, glow: CANDLE_FIRE.glow, bed: false,
    }, updaters);
    const built = room.children.slice(before);
    // (kept out of the room's merge: a fire's flames are a shader of their own, their box placed over the wick)
    for (const part of built) part.userData.noMerge = true;
    if (holder) updaters.push(() => { for (const part of built) part.visible = holder.visible; });
    tongue.removeFromParent();
  }
  for (const glow of glows) glow.removeFromParent();
}
