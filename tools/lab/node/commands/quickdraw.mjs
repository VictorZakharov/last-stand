// `npm run lab -- quickdraw`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab quickdraw`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Nockshot\'s quick arrows (#1004): the ranger\'s left click tapped and drawn to full for 8 s each at a '
    + 'Hollow Husk held 9 m off, every shot caught as it\'s loosed and every hit as it lands (no crits, aimed clear of '
    + 'the head); the first tapped arrow later than 0.26 s, a full draw slower than 0.82 s, a quick arrow under 0.45 '
    + 'of a full one, tapping under 0.75 of full draws\' damage a second and a missed shot are problems (`--canary`: '
    + 'the least draw back to half and the damage the pull\'s square) '
    + '(in full: [`commands/quickdraw.md`](commands/quickdraw.md))',
  help: 'the ranger\'s Nockshot (--class ranger) tapped and drawn to full at a held foe, each way for 8 s: when the '
    + 'first arrow leaves, each arrow\'s damage and the damage a second, against the owner\'s targets for quick arrows',
  options: {
    ...COMMON_OPTIONS,
    class: { ...COMMON_OPTIONS.class, default: 'ranger' },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      help: 'the views played (third by default)',
    },
    trace: {
      kind: 'switch',
      help: 'list each shot (its frame from the first press and its draw) and each hit (its frame and damage)',
    },
    canary: {
      kind: 'switch',
      help: 'the least draw back to half the draw and the damage the pull\'s square: both must be caught',
    },
  },
  each(side, options) {
    const command = {
      views: options.views ?? ['third'],
      canary: Boolean(options.canary),
      trace: Boolean(options.trace),
    };
    return side.command('quickDraw', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
