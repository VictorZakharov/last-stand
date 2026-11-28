// `drapeTape`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { DrapeTapeOptions, DrapeTapeReport } from '../drapeTape';

/** `lab drapetape`: the hero's drape calls written down as he walks and stands. */
export async function drapeTape(lab: Lab, options: DrapeTapeOptions): Promise<DrapeTapeReport> {
  const { drapeTape: record } = await import('../drapeTape');
  return record(lab, options);
}
