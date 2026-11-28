// What moved its version since the stage last asked (#973): a material, a texture, a geometry or an attribute notes
// itself as its version moves, so the stage looks at what changed, not at everything it holds. Asking each of
// thousands every frame (every biome's, all in the world from the boot) was a fifth of a slowed CPU's frame at wave
// 36, where three's walk asked only what it drew.

/** what moved since the stage last took them, and the set taken before: the two swapped as they're taken, so taking
 *  them makes nothing */
let changedNow = new Set<object>();
let changedTaken = new Set<object>();

/** `owner`'s version moved: it's among what changed till the stage takes them (`takeChanged`). */
export function noteChanged(owner: object): void {
  changedNow.add(owner);
}

/** What moved its version since the last time this was called: read it before the next call, which empties it. */
export function takeChanged(): ReadonlySet<object> {
  const taken = changedNow;
  changedNow = changedTaken;
  changedNow.clear();
  changedTaken = taken;
  return taken;
}
