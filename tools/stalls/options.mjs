// The stalls harness's command line (tools/stalls): its options, read and checked before anything starts, so a
// misspelt one or a bad value stops it before a build or a browser.
import { SCENARIOS } from './scenarios.mjs';
import { VARIANTS } from './variants.mjs';
import { LISTED_MS, STALL_MS } from './analyze.mjs';

/** the options a switch is (`--name`, `--name=false`); every other takes a value (`--name value`, `--name=value`) */
const SWITCHES = new Set(['headed', 'perf', 'links', 'help']);
/** the views the game is played in (core/renderer.ts `VIEWS`, in the order V steps through them), and the
 *  battlegrounds (data/biomes.ts) */
export const VIEWS = ['top', 'third', 'first'];
const BIOMES = ['forest', 'crypt'];
/** the heroes (data/classes), and the most items a stash holds (data/balance.ts `RUN.bagLimit`) */
const HEROES = ['mage', 'warrior', 'ranger'];
const STASH_MOST = 60;

/** each option's value and what it does, for the usage */
const HELP = {
  url: ['a,b', 'the game at these URLs (production, a PR preview), each in turn; this tree built and served if none'],
  scenario: ['name', `what the player does: ${Object.keys(SCENARIOS).join(', ')} (fight by default)`],
  seconds: ['n', 'how long the scenario plays (45 by default)'],
  listed: ['ms', 'each stall this long or longer listed with what was busy through it (300 by default)'],
  variants: ['a,b', `changes tried on the page, each a measure of its own: ${Object.keys(VARIANTS).join(', ')} (base)`],
  view: ['name', `the view it's played in: ${VIEWS.join(', ')} (V pressed in the lobby, its panels shown again; top)`],
  biome: ['name', `the battleground: ${BIOMES.join(', ')} (forest by default)`],
  hero: ['name', `the hero chosen in the lobby: ${HEROES.join(', ')} (a first boot's by default)`],
  stash: ['n', `the hero's stash filled with this many items, copies of his own (0 to ${STASH_MOST}: 0 by default)`],
  scale: ['n', 'the screen\'s scaling, as the OS sets it (a report\'s devicePixelRatio: 1 by default)'],
  headed: ['', 'a Chrome window on the screen, as a player has it (headless by default)'],
  perf: ['', 'the performance overlay shown, as a player sending its report has it'],
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
    view: written.view ?? 'top',
    biome: written.biome ?? 'forest',
    hero: written.hero ?? null,
    stash: Number(written.stash ?? 0),
    scale: Number(written.scale ?? 1),
    headed: written.headed === true,
    perf: written.perf === true,
    links: written.links === true,
    help: written.help === true,
  };
  if (!SCENARIOS[options.scenario]) {
    throw new Error(`stalls: no scenario ${options.scenario} (${Object.keys(SCENARIOS).join(', ')})`);
  }
  const unknown = options.variants.find((variant) => !VARIANTS[variant]);
  if (unknown !== undefined) throw new Error(`stalls: no variant ${unknown} (${Object.keys(VARIANTS).join(', ')})`);
  if (!VIEWS.includes(options.view)) throw new Error(`stalls: no view ${options.view} (${VIEWS.join(', ')})`);
  if (!BIOMES.includes(options.biome)) throw new Error(`stalls: no biome ${options.biome} (${BIOMES.join(', ')})`);
  if (options.hero !== null && !HEROES.includes(options.hero)) {
    throw new Error(`stalls: no hero ${options.hero} (${HEROES.join(', ')})`);
  }
  if (!(Number.isInteger(options.stash) && options.stash >= 0 && options.stash <= STASH_MOST)) {
    throw new Error(`stalls: --stash must be a whole number from 0 to ${STASH_MOST}`);
  }
  if (!(options.seconds > 0)) throw new Error('stalls: --seconds must be a number over 0');
  if (!(options.scale > 0)) throw new Error('stalls: --scale must be a number over 0');
  if (!(options.listed >= STALL_MS)) throw new Error(`stalls: --listed must be a number of ms, ${STALL_MS} or more`);
  return options;
}
