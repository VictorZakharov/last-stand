// `npm run lab -- outlines`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, picturePairs, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab outlines`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'every kind of thing the game outlines (the hero in focus in hero selection, the hero in the village, a '
    + 'foe as Quarry Mark and a ping outline it, a seat by the campfire), each outline held to the thing\'s '
    + 'silhouette: none of it deep inside the thing, none far from it (`--only seat` the cases so named; '
    + '`--canary`: his head alone outlined, and his outline read against his head alone)',
  help: 'each kind of outline held to the thing\'s silhouette',
  options: {
    only: { kind: 'text', usage: 'name', help: 'the cases whose name holds this alone' },
    canary: { kind: 'switch', help: 'plant an outline inside the hero and one far from him, which must be caught' },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    return side.command('outlinesHere', { only: options.only ?? '', canary: Boolean(options.canary) });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('outlines'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
