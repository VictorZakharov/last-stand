// The game's HDR output (src/core/hdr.ts) for the lab's measures, where the tree has one: an A/B's older commit has
// none, and a static import of it failed to load every page module that made one there. Vite's glob finds the module
// or nothing, so a measure that needs it says so and the rest run as before.
type HdrModule = typeof import('../../../src/core/hdr');

const FOUND = import.meta.glob<HdrModule>('../../../src/core/hdr.ts');

/** The HDR output's module, or null in a tree without one. */
export async function hdrOutput(): Promise<HdrModule | null> {
  const load = Object.values(FOUND)[0];
  return load ? load() : null;
}
