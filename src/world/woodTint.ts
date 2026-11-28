// A room's wood in a tone of its own (from play, of the tavern's barrels and bar: "both barrels and bar counter need to
// have contrast from floor/walls... if a color/material change is needed, then do it"): the rooms' woods are browns
// close to the floor's boards and the panelling's, so a thing made of them sank into the room. A tint is the room's
// wood material copied with another colour (and roughness), its maps shared: no texture made, one material a tint,
// made once and shared by every thing in it.
import { LitMaterial } from '../engine/api/index.ts';

const made = new WeakMap<LitMaterial, Map<string, LitMaterial>>();

/** `wood` in `colour` (its maps shared), at `roughness` if given; one material a wood, colour and roughness. */
export function woodTint(wood: LitMaterial, colour: number, roughness?: number): LitMaterial {
  if (!made.has(wood)) made.set(wood, new Map());
  const tints = made.get(wood)!, key = `${colour}:${roughness ?? ''}`;
  let tint = tints.get(key);
  if (!tint) {
    tint = wood.clone();
    tint.color.setHex(colour);
    if (roughness !== undefined) tint.roughness = roughness;
    tints.set(key, tint);
  }
  return tint;
}
