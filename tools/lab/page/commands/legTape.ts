// `legTape`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { LegTapeOptions, LegTapeReport } from '../legTape';

/** `lab legtape`: every leg IK call written down as the hero walks among walking foes. */
export async function legTape(lab: Lab, options: LegTapeOptions): Promise<LegTapeReport> {
  const { legTape: record } = await import('../legTape');
  return record(lab, options);
}
