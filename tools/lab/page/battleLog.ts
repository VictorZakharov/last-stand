// The game's battle log (src/ui/battleLog.ts) for the lab's measures, where the tree has one: an A/B's older commit
// may have none, and a static import of it would fail to load the page module that made one there. Vite's glob finds
// the module or nothing, as `hdrOutput` finds the HDR output's.
type BattleLogModule = typeof import('../../../src/ui/battleLog');

const FOUND = import.meta.glob<BattleLogModule>('../../../src/ui/battleLog.ts');

/** The battle log's module, or null in a tree without one. */
export async function battleLog(): Promise<BattleLogModule | null> {
  const load = Object.values(FOUND)[0];
  return load ? load() : null;
}
