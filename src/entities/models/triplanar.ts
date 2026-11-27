// Triplanar texturing for a sculpted surface with no unwrapping of its own (models/handShape.ts): its colour, normal
// and roughness maps each read three times, flat along each axis of the space it was sculpted in, and blended by how
// squarely the surface faces each. Read where it lay as it was sculpted (its vertices' own places, before skinning),
// the grain stays on the skin as it bends. (Read flat along the one axis each vertex faced most, the glove's leather
// broke into streaks down the hand's sides wherever the axis changed.) The engine's kit look reads it
// (engine/looks/kit.ts); the game only says the tile.
import { Material } from '../../engine/api/index.ts';

/** `material`'s maps read triplanar, a tile each `tile` (m) of the space its surface was sculpted in; it's
 *  returned. */
export function triplanar<T extends Material>(material: T, tile: number): T {
  material.userData.triplanar = tile;
  return material;
}
