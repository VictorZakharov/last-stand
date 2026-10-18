// `--sweep`: a command run once for each value of a tunable (src/core/tuning.ts), or of several (every combination),
// on the lab's server, and each run's problems said side by side, the runs with the fewest named. A pose's keys tuned
// by hand were tried a dozen ways in a row, each run read for its problems by hand, and a filter missed the speed's
// three failures on the very runs it called best.
import { sendToServer } from './client.mjs';
import { labError } from './errors.mjs';

/**
 * A sweep's axes from its text: `target=a|b|c[;target=...]`, each target a tunable's path (`warriorSwings.twoBack`:
 * each value its whole list, `1,2,3`) or some of its numbers (`warriorSwings.twoBack[46,52]`: each value one number,
 * set at each of them).
 */
export function sweepAxes(text) {
  return text.split(';').filter(Boolean).map((part) => {
    const at = part.indexOf('=');
    const target = part.slice(0, at);
    const values = part.slice(at + 1).split('|').filter(Boolean);
    if (at < 0 || !target.includes('.') || values.length === 0) {
      throw labError(`--sweep: ${part} isn't name.field=a|b|c (or name.field[i,j]=a|b|c)`);
    }
    return { target, values };
  });
}

/** Every combination of the axes' values, each as the `--tune` text that sets it and its words. */
function combinations(axes) {
  let found = [{ tune: [], words: [] }];
  for (const { target, values } of axes) {
    found = found.flatMap((so) => values.map((value) => ({
      tune: [...so.tune, `${target}=${value}`],
      words: [...so.words, `${target}=${value}`],
    })));
  }
  return found;
}

/**
 * Runs `call` once for each combination of its `--sweep`'s values, each set over its `--tune`, on the lab's server;
 * prints each run's problems (or that it had none) and the runs with the fewest. Resolves with 0 when one had none.
 */
export async function runSweep(call) {
  const axes = sweepAxes(call.options.sweep);
  const runs = [];
  for (const combination of combinations(axes)) {
    const tune = [call.options.tune, ...combination.tune].filter(Boolean).join(';');
    const options = { ...call.options, sweep: undefined, tune };
    const reply = await sendToServer({ ...call, options });
    if (!reply) throw labError('--sweep needs the lab server: npm run lab:serve');
    const problems = reply.problems ?? (reply.ok ? [] : ['(the server said only that it failed: restart it)']);
    runs.push({ words: combination.words.join('; '), problems });
    console.log(`== ${runs.at(-1).words}: ${problemWords(problems)}`);
    for (const problem of problems) console.log(`  ${problem}`);
  }
  const fewest = Math.min(...runs.map((run) => run.problems.length));
  const best = runs.filter((run) => run.problems.length === fewest).map((run) => run.words);
  console.log(`fewest problems (${fewest}): ${best.join(' | ')}`);
  return fewest === 0 ? 0 : 1;
}

/** How many problems a run had, as words. */
const problemWords = (problems) => (problems.length ? `${problems.length} problems` : 'no problems');
