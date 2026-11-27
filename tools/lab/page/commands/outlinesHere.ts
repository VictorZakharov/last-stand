// `outlinesHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** What `lab outlines` asks: the cases whose name holds `only` (all of them when empty), or the canaries. */
export interface OutlinesCommand {
  only: string;
  canary: boolean;
}

/** `lab outlines`: every kind of thing the game outlines, its outline held to its shape, a line a case. */
export async function outlinesHere(lab: Lab, command: OutlinesCommand): Promise<Report> {
  const { outlines } = await import('../outlines');
  const { lines, problems, moments } = await outlines(lab, command.only, command.canary);
  const head = `the outlines: ${lines.length} read, ${problems.length} wrong`;
  return { text: [head, ...lines].join('\n'), problems, moments };
}
