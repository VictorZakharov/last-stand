// `npm run lab -- profileread`: its command line (help, options) and its run, in the command line's own process
// (node/commands/AGENTS.md).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { labError } from '../errors.mjs';
import { REPO } from '../paths.mjs';

/** A kept profile (`out/profile/<command>-<side>.cpuprofile`) read from its path, from the repo or absolute. */
function readKept(path) {
  const file = resolve(REPO, path);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw labError(`profileread: can't read ${file}: ${error.message}`);
  }
}

/** `lab profileread`, run by the command line itself: no page, no server. */
export default {
  summary: 'a profile `--profile` kept (`tools/lab/out/profile/<command>-<side>.cpuprofile`) read again: its busiest '
    + 'functions, `--within` one function alone, `--against` another kept profile laid beside it function by '
    + 'function, `--callers` who calls a function, by its time under each; in a second, where asking again of a run took the run again (places by where they ran: no source '
    + 'maps)',
  help: 'a kept profile read again, with no page: `--within <function>` its time in that function alone, '
    + '`--against <file>` the two profiles\' totals compared, function by function',
  argument: 'file',
  options: {
    within: { kind: 'text', usage: 'function', help: 'only the time in that function (`solveArm`, `animate enemy.ts`)' },
    against: { kind: 'text', usage: 'file', help: 'another kept profile, laid beside this one' },
    callers: { kind: 'text', usage: 'function', help: 'who calls that function, by its time under each caller' },
  },
  async run(options) {
    const { summarize, totalsByFunction, comparedProfiles, callersOf } = await import('../profile.mjs');
    const [path] = options._;
    const profile = readKept(path);
    const within = options.within ?? null;
    if (options.callers) {
      console.log(callersOf(profile, options.callers));
      return 0;
    }
    console.log(summarize(profile, () => null, within));
    if (options.against) {
      const other = readKept(options.against);
      const mine = totalsByFunction(profile, () => null, within);
      const theirs = totalsByFunction(other, () => null, within);
      console.log(comparedProfiles([path, mine], [options.against, theirs]));
    }
    return 0;
  },
};
