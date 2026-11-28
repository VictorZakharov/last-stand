// `feet`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import { setTunes, type Lab, type Report } from '../lab';
import type { FeetOptions } from '../feet';

/**
 * `lab feet`: the hero's feet against the ground round the dais's edges and on level ground, the worst moments
 * pictured; a canary it missed is a problem.
 */
export async function feet(lab: Lab, command: FeetOptions & { tune?: Record<string, number[]> }): Promise<Report> {
  // (set before its first set-up, which builds the hero again: what a tunable decides as he's built takes it)
  setTunes(command.tune ?? {});
  const { feet: feetRound, missedCanaries } = await import('../feet');
  const report = await feetRound(lab, command);
  return { text: report.lines.join('\n'), problems: missedCanaries(report), moments: report.moments };
}
