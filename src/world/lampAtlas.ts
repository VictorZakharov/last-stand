// The lamps' shadows drawn once: of what stands still round each lamp in the list, by the engine
// (`src/engine/lampShadows.ts`), which is handed the casters here. Lamps and what stands round them never move, so
// it's asked at boot, as the village is built, and never again: lit by the list alone the lamps lit through all that
// stood round them (from play, "your light test for each light need to test SHADOW, it was missing for half of them").
// What's drawn is what casts as the world is built (the merged caster the shadow maps alone draw, the instanced posts
// and trunks); a leaf card, which casts by its picture's alpha, is left out (drawn whole, it would cast a square).
import { AHEAD } from '../engine/pipelinesAside';
import type { Mesh, Node, SkinnedMesh } from '../engine/api/index.ts';
import type { LampPlace } from '../core/lamps';
import { drawnInShadowsOnly } from './culling';

/** Whether `mesh` casts into the lamps' shadows: a mesh that casts (the merged caster the shadow maps alone draw, an
 *  instanced one such as the lamps' own posts, which three's shadow pass draws as they stand), never a body's, nor a
 *  leaf card's (it casts by its picture's alpha). */
function casts(mesh: Mesh): boolean {
  if (!mesh.isMesh || !mesh.castShadow || (mesh as SkinnedMesh).isSkinnedMesh) return false;
  if (!mesh.visible && !drawnInShadowsOnly(mesh)) return false;
  const own = mesh.material;
  return Array.isArray(own) || own.alphaTest === 0;
}

/** Each of `lamps`' shadows of what stands still under `place` asked of the engine, which draws its own of these
 *  casters: src/engine/lampShadows.ts. */
export function bakeLampShadows(_renderer: unknown, place: Node, lamps: readonly LampPlace[]): void {
  place.updateMatrixWorld(true);
  const casters: Mesh[] = [];
  place.traverse((object) => { if (casts(object as Mesh)) casters.push(object as Mesh); });
  AHEAD.bakeLamps?.(casters, lamps.length);
}
