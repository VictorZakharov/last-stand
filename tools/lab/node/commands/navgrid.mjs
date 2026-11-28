// `npm run lab -- navgrid`: its command line (help, options) and its work on a side (node/commands/AGENTS.md).
import { asText, problemsIn } from '../commandKit.mjs';
import { COMMON_OPTIONS } from '../optionKit.mjs';

/** `lab navgrid`, as the command line reads it and each side runs it (node/commands/AGENTS.md). */
export default {
  summary: 'the foes\' clearance grid as the game patches it where a prop breaks, comes back or is rolled anew, held '
    + 'to one made whole for the same obstacles cell for cell, in each biome (every breakable prop broken a few at a '
    + 'time, some brought back, the run\'s props rolled)',
  help: 'the foes\' clearance grid as patched (world/navigation.ts `patchGrid`) held to one made whole, cell for '
    + 'cell, as every breakable prop breaks, some come back and the run\'s props are rolled anew; --canary leaves a '
    + 'gone prop\'s cells as they were, which must be caught',
  options: {
    biomes: {
      kind: 'list',
      usage: 'a,b',
      choices: ['crypt', 'forest'],
      default: 'crypt,forest',
      help: 'the biomes: crypt, forest',
    },
    canary: { kind: 'switch', help: 'a gone prop\'s cells left as they were: it must be found' },
    ...COMMON_OPTIONS,
  },
  each(side, options) {
    return side.command('navGrid', { biomes: options.biomes, canary: Boolean(options.canary) });
  },
  textOf: asText,
  problemsOf: problemsIn,
};
