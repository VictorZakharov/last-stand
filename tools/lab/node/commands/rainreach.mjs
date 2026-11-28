// `npm run lab -- rainreach`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab rainreach`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'Hailfletch kept off the ranger and the foes striking at him: a foe of every melee kind (no boss) stood '
    + 'round him inside its reach, the rain held at his feet, at one of them, 4 m ahead, swung past him, at the wall '
    + 'and by touch, in every view; its area\'s middle nearer him than their numbers need (the longest blow, the '
    + 'widest foe, the area\'s radius), an arrow on a foe in reach, the skill\'s `minRange` under that need and a far '
    + 'foe never struck are problems (`--canary`: the least distance taken to nothing) '
    + '(in full: [`commands/rainreach.md`](commands/rainreach.md))',
  help: 'the ranger\'s Hailfletch (--class ranger) held as the player holds it, foes of every melee kind round him '
    + 'just inside the reach their blows land from, held there: each frame its area\'s middle must stay as far from '
    + 'him as their numbers need, and no arrow may strike one of them; a foe out ahead, the rain aimed on it, must be '
    + 'struck',
  options: {
    ...COMMON_OPTIONS,
    class: { ...COMMON_OPTIONS.class, default: 'ranger' },
    views: {
      kind: 'list',
      usage: 'a,b',
      choices: ['top', 'third', 'first'],
      help: 'the views the mouse cases are tried in (all three by default)',
    },
    touch: {
      kind: 'choice',
      choices: ['on', 'off'],
      usage: 'on|off',
      help: 'the touch cases, top-down after the views (on by default)',
    },
    canary: {
      kind: 'switch',
      help: 'the skill\'s least distance taken to nothing: the area on him and arrows on the foes in reach must be '
        + 'caught',
    },
  },
  each(side, options) {
    const command = {
      views: options.views ?? ['top', 'third', 'first'],
      touch: options.touch !== 'off',
      canary: Boolean(options.canary),
    };
    return side.command('rainReach', command);
  },
  textOf: asText,
  problemsOf: problemsIn,
};
