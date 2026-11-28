// `rainReach`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RainReachOptions } from '../rainReach';

/** `lab rainreach`: Hailfletch aimed at and round the ranger, foes of every melee kind round him; its area nearer him
 *  than their reach needs, an arrow striking one of them, and a rain that never fell are problems. */
export async function rainReach(lab: Lab, command: RainReachOptions): Promise<Report> {
  const { rainReach: rainReachRound } = await import('../rainReach');
  return rainReachRound(lab, command);
}
