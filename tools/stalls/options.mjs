// The stalls harness's command line (tools/stalls): its options, read and checked before anything starts, so a
// misspelt one or a bad value stops it before a build or a browser.
import { SCENARIOS } from './scenarios.mjs';
import { VARIANTS } from './variants.mjs';
import { LISTED_MS, STALL_MS } from './analyze.mjs';

/** the options a switch is (`--name`, `--name=false`); every other takes a value (`--name value`, `--name=value`) */
const SWITCHES = new Set(['headed', 'links', 'help']);

/** each option's value and what it does, for the usage */
const HELP = {
  url: ['a,b', 'the game at these URLs (production, a PR preview), each in turn; this tree built and served if none'],
  scenario: ['name', `what the player does: ${Object.keys(SCENARIOS).join(', ')} (fight by default)`],
  seconds: ['n', 'how long the scenario plays (45 by default)'],
  listed: ['ms', 'each stall this long or longer listed with what was busy through it (300 by default)'],
  variants: ['a,b', `changes tried on the page, each a measure of its own: ${Object.keys(VARIANTS).join(', ')} (base)`],
  headed: ['', 'a Chrome window on the screen, as a player has it (headless by default)'],
  links: ['', 'every Skia program built: when, how long, the tasks it was built in, the page\'s changes just before'],
  help: ['', 'this'],
};

/** The usage: the command and each option. */
export function usage() {
  const lines = ['npm run stalls -- [options]', ''];
  for (const [name, [value, help]] of Object.entries(HELP)) {
    const head = `  --${name}${value ? ` ${value}` : ''}`;
    lines.push(`${head.padEnd(18)} ${help}`);
  }
  return lines.join('\n');
}

/** The options as written: `--name value` or `--name=value`, a switch alone. Throws at one it doesn't know. */
function readWritten(argv) {
  const written = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`stalls: ${JSON.stringify(argv[i])} is no option (they start --)`);
    const [name, inline] = argv[i].slice(2).split(/=(.*)/s);
    if (!(name in HELP)) throw new Error(`stalls: no option --${name} (${Object.keys(HELP).join(', ')})`);
    if (SWITCHES.has(name)) {
      written[name] = inline !== 'false';
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || value === '') throw new Error(`stalls: --${name} needs a value (${HELP[name][0]})`);
    written[name] = value;
  }
  return written;
}

/**
 * The command line read and checked: the URLs (none: this tree built and served), the scenario, its length in
 * seconds, the variants, and the switches. Throws, saying what was wrong.
 */
export function readOptions(argv) {
  const written = readWritten(argv);
  const options = {
    urls: written.url ? written.url.split(',').filter(Boolean) : [],
    scenario: written.scenario ?? 'fight',
    seconds: Number(written.seconds ?? 45),
    listed: Number(written.listed ?? LISTED_MS),
    variants: (written.variants ?? 'base').split(','),
    headed: written.headed === true,
    links: written.links === true,
    help: written.help === true,
  };
  if (!SCENARIOS[options.scenario]) {
    throw new Error(`stalls: no scenario ${options.scenario} (${Object.keys(SCENARIOS).join(', ')})`);
  }
  const unknown = options.variants.find((variant) => !VARIANTS[variant]);
  if (unknown !== undefined) throw new Error(`stalls: no variant ${unknown} (${Object.keys(VARIANTS).join(', ')})`);
  if (!(options.seconds > 0)) throw new Error('stalls: --seconds must be a number over 0');
  if (!(options.listed >= STALL_MS)) throw new Error(`stalls: --listed must be a number of ms, ${STALL_MS} or more`);
  return options;
}
