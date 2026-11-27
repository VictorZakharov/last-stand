// `npm run lab -- tour`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { picturePairs, asText, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab tour`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the game pictured at a round of fixed stands as the player sees them (the square and the campfire from '
    + 'above, the hall from above and from inside, every cottage\'s door, every house\'s room, a fight in each '
    + 'biome), each drawn twice at one moment, the two apart where it flickers; with `--ab=<commit>` each picture '
    + 'held to that commit\'s (`--only door` the stands so named)',
  help: 'the game pictured at fixed stands, flicker found; --ab=<commit> holds each to that commit\'s',
  options: {
    only: { kind: 'text', usage: 'name', help: 'the stands whose name holds this alone' },
    canary: { kind: 'switch', help: 'the hero hidden between each stand\'s two draws, which every stand must catch' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    return side.command('tourHere', { only: options.only ?? '', canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('tour'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
