// `dressing`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { DressingOptions } from '../dressing';
import type { Lab, Report } from '../lab';

/** What dresses the tavern's walls and beams: read and pictured. */
export async function dressing(lab: Lab, command: DressingOptions): Promise<Report> {
  const { dressing: measure } = await import('../dressing');
  return measure(lab, command);
}
