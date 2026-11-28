// `quickDraw`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { QuickDrawOptions } from '../quickDraw';

/** `lab quickdraw`: Nockshot tapped and drawn to full at a held foe; a first quick arrow or a full draw slower than
 *  the owner's targets, a quick arrow or tapping's damage a second short of them, and a missed shot are problems. */
export async function quickDraw(lab: Lab, command: QuickDrawOptions): Promise<Report> {
  const { quickDraw: quickDrawRound } = await import('../quickDraw');
  return quickDrawRound(lab, command);
}
