// `kitHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { KitCanary } from '../kit';

/** What `lab kit` asks: the canary that breaks one of the kit's pieces, if any. */
export interface KitCommand {
  canary: KitCanary;
}

/** `lab kit`: the kit's text that wraps, panel that scrolls and text field, each read off the engine's frame. With a
 *  canary its piece is broken, and its problems are what it must find: none found is the problem. */
export async function kitHere(lab: Lab, command: KitCommand): Promise<Report> {
  const { kit } = await import('../kit');
  const { lines, problems, moments } = await kit(lab, command.canary);
  const head = `the kit's pieces: ${problems.length} problems`;
  if (!command.canary) return { text: [head, ...lines].join('\n'), problems, moments };
  const caught = problems.filter((problem) => problem.startsWith(`${command.canary}:`));
  const text = [`canary ${command.canary}: ${caught.length ? `caught (${caught.join('; ')})` : 'missed'}`, ...lines];
  return { text: text.join('\n'), problems: caught.length ? [] : [`canary ${command.canary}: missed`], moments };
}
