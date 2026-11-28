// `npm run lab -- kit`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, picturePairs, problemsIn, textWithPictureFiles } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab kit`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the UI kit\'s own pieces read off the engine\'s frame: text that wraps within its panel\'s width, a '
    + 'panel the wheel scrolls within what\'s inside it and clips to its box, a text field a click focuses and '
    + 'typing fills, its caret at its end (`--canary wrap|scroll|field` breaks one, which must be caught)',
  help: 'the UI kit\'s text wrap, scrolling and text field, read off the engine\'s frame',
  options: {
    canary: {
      kind: 'choice', choices: ['wrap', 'scroll', 'field'], usage: 'wrap|scroll|field',
      help: 'break that piece: its text unwrapped, its clip taken off, the field not following its input',
    },
    ...COMMON_OPTIONS,
  },
  async each(side, options) {
    return side.command('kitHere', { canary: options.canary ?? '' });
  },
  finish(results, options, session) {
    return textWithPictureFiles(results, session.outFor('kit'));
  },
  textOf: asText,
  problemsOf: problemsIn,
  pictures: picturePairs,
};
