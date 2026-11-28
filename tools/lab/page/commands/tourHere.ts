// `tourHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** What `lab tour` asks: the stands whose name holds `only` (all of them when empty). */
export interface TourCommand {
  only: string;
  /** the hero hidden between each stand's two draws, which every stand must catch */
  canary: boolean;
}

/** `lab tour`: the game pictured at a round of fixed stands, a line a stand. */
export async function tourHere(lab: Lab, command: TourCommand): Promise<Report> {
  const { tour } = await import('../tour');
  const { lines, problems, moments } = await tour(lab, command.only, command.canary);
  const head = `the tour: ${lines.length} stands, ${problems.length} flickering`;
  return { text: [head, ...lines].join('\n'), problems, moments };
}
