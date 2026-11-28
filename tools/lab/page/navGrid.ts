// `lab navgrid`: the foes' clearance grid as the game patches it (`patchGrid` in world/navigation.ts, a prop's
// patch of cells as it breaks, comes back or is rolled anew) held to one made whole for the same obstacles, cell for
// cell, in each biome: every breakable prop broken one at a time, a few brought back, the run's props rolled anew.
import { G } from '../../../src/state';
import { breakProp, restoreProps, type Prop } from '../../../src/world/destructible';
import { NAV_CANARY, gridAgainstWhole } from '../../../src/world/navigation';
import type { BiomeId } from '../../../src/data/biomes';
import type { Lab, Report } from './lab';

/** What `lab navgrid` is asked. */
export interface NavGridOptions {
  biomes: BiomeId[];
  /** a gone prop's cells left as they were: the check must catch it */
  canary: boolean;
}

/** how many props are broken between two comparisons, and how many brought back after */
const BREAKS_EACH = 3;
const BROUGHT_BACK = 4;
/** the seed the run's props are rolled anew with */
const ROLL_SEED = 1234;

/** One biome's props broken, brought back and rolled, the grid held to a whole one after each: its lines. */
async function inBiome(lab: Lab, biome: BiomeId): Promise<{ lines: string[]; problems: string[] }> {
  if (G.arena.biome !== biome) G.arena.setBiome(biome);
  await lab.setup({ view: 'top', facing: 0, fresh: true });
  G.arena.restoreProps();
  const props = G.arena.props as Prop[];
  const problems: string[] = [];
  let compared = 0;
  let cells = 0;
  const compare = (after: string): void => {
    const held = gridAgainstWhole();
    compared++;
    cells = held.cells;
    if (held.differ) problems.push(`${biome}: after ${after}, ${held.differ} cells of ${held.cells} differ`);
  };
  compare('the props restored');
  for (let at = 0; at < props.length; at += BREAKS_EACH) {
    for (const prop of props.slice(at, at + BREAKS_EACH)) breakProp(prop);
    compare(`breaking props ${at + 1} to ${Math.min(props.length, at + BREAKS_EACH)}`);
  }
  restoreProps(props.slice(0, BROUGHT_BACK));
  compare(`bringing back ${BROUGHT_BACK} props`);
  G.arena.restoreProps();
  G.arena.rollProps(ROLL_SEED);
  compare('the run\'s props rolled anew');
  const line = `${biome}: ${props.length} breakable props, the grid (${cells} cells) held to a whole one `
    + `${compared} times`;
  return { lines: [line], problems };
}

/** `lab navgrid`: in each biome, the grid as patched against one made whole. */
export async function navGrid(lab: Lab, options: NavGridOptions): Promise<Report> {
  NAV_CANARY.leaveGone = options.canary;
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    for (const biome of options.biomes) {
      const found = await inBiome(lab, biome);
      lines.push(...found.lines);
      problems.push(...found.problems);
    }
  } finally {
    NAV_CANARY.leaveGone = false;
    G.arena.restoreProps();
  }
  if (options.canary) {
    // (the canary's fault must be what's found: then the check passes)
    if (!problems.length) return { text: lines.join('\n'), problems: ['canary: a gone prop\'s cells left, unseen'] };
    return { text: [...lines, `canary caught: ${problems[0]}`].join('\n'), problems: [] };
  }
  return { text: lines.join('\n'), problems };
}
