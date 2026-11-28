// What crypt.ts's floor and the world beyond its wall are drawn with, as its looks read it (engine/looks/crypt.ts):
// the cobbles' damp, drift and moss and the earth round the small dead trees' feet (`dampGround`), and the world past
// the wall darkened in the top-down view (`outsideDim`).
import type { Texture, Vec3 } from '../engine/api/index.ts';

/** How far past the wall the dimming starts and is full (m from the middle), and how much it takes. */
export interface Outside { from: number; to: number; most: number }

/** What `dampGround` lays over the cobbles: its baked damp map and its tile (m), the earth's spots (x, z, reach) and
 *  look, and the soil's maps. */
export interface Damp {
  map: Texture;
  span: number;
  earth: Vec3[];
  ragged: number;
  stones: number;
  washed: readonly number[];
  tile: number;
  soil: { map: Texture; normalMap: Texture; roughnessMap: Texture };
}
