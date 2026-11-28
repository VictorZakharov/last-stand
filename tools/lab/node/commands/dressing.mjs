// `npm run lab -- dressing`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithMoments } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab dressing`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'what dresses the tavern\'s walls and beams, the hero put straight into the room (no door, no village): '
    + 'its mantel\'s cups, the herbs over the bar, the bar\'s bottles, its lanterns and its shelves against the '
    + 'wall\'s posts, pictured close up and as the player stands in the room',
  help: 'the tavern\'s mantel, herbs, bottles, lanterns and shelves: read and pictured',
  options: {
    canary: {
      kind: 'switch',
      help: 'plant a fault in each reading, each of which must be found',
    },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('dressing', { canary: Boolean(options.canary) });
  },
  // (its moments written: the close-ups and the room)
  finish(results, options, session) {
    return textWithMoments(results, session.outFor('dressing'), session.browser);
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
