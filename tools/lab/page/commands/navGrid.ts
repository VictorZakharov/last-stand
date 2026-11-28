// `navGrid`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { NavGridOptions } from '../navGrid';

/** `lab navgrid`: the foes' clearance grid as patched, held to one made whole, in each biome. */
export async function navGrid(lab: Lab, command: NavGridOptions): Promise<Report> {
  const { navGrid: navGridOf } = await import('../navGrid');
  return navGridOf(lab, command);
}
