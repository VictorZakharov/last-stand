// The lab's command line (tools/lab): its commands, the options each takes, and the help made from them. An option
// is checked as it's read, so a misspelt one or a bad value stops the command at once, before anything boots.
import { labError } from './errors.mjs';

/**
 * How an option's value is read:
 * - `switch`: `--name` is true, `--name=false` false;
 * - `text`: `--name value` or `--name=value`;
 * - `list`: comma-separated text, as a list (each one of `choices`, when it has them);
 * - `number`: a finite number;
 * - `pair`: two numbers, `x,z`;
 * - `choice`: one of `choices`;
 * - `ref`: a switch that may name a commit (`--ab`, `--ab=165246d`).
 */
const KINDS = ['switch', 'text', 'list', 'number', 'pair', 'choice', 'ref'];

/** the options that set up the run before a command (page/lab.ts `Fixture`) */
const SETUP_OPTIONS = {
  view: { kind: 'choice', choices: ['top', 'third', 'first'], usage: 'top|third|first', help: 'the game\'s view' },
  at: { kind: 'pair', usage: 'x,z', help: 'where the hero stands (12,22: off the dais, clear of props)' },
  facing: { kind: 'number', usage: 'rad', help: 'the way he faces (0 is +z)' },
  nocked: { kind: 'switch', help: 'a bow\'s hero with an arrow on the string (=false: none)' },
};

/** the options every command running on a page takes */
const COMMON_OPTIONS = {
  ab: {
    kind: 'ref',
    usage: '[=ref]',
    help: 'also on another commit (origin/main by default): its results beside this tree\'s, and the lines that '
      + 'differ (a commit against itself agrees, line for line)',
  },
  class: { kind: 'text', usage: 'name', help: 'the hero (ranger, warrior, mage; the last one used by default)' },
  profile: { kind: 'switch', help: 'where the command\'s time went in the page: its busiest functions' },
  watch: {
    kind: 'switch',
    help: 'run it again each time the source changes, until Ctrl+C (needs npm run lab:serve)',
  },
};

/**
 * The commands: what each does (`help`), what it takes after its name (`argument`), and its options. A command
 * that is `open` passes options it doesn't know on (`--name` or `--name=value`) to what it runs.
 */
export const COMMANDS = {
  sheet: {
    help: 'the hero pictured in the states the player sees, from the game\'s views and close up, with each arm\'s '
      + 'load and posture beside them: tools/lab/out/sheets/<tag>/sheet.png',
    options: {
      states: { kind: 'list', usage: 'a,b', default: 'stand,walk', help: 'the states: stand, walk, full' },
      views: {
        kind: 'list',
        usage: 'a,b',
        default: 'lobby,top,third,front,left,back',
        help: 'the views: lobby, top, third, front, left, right, back, above; eyes with --view first',
      },
      tag: { kind: 'text', usage: 'name', default: 'latest', help: 'the sheet\'s folder' },
      focus: { kind: 'text', usage: 'joint', help: 'close-ups framed on a joint (head, handL...), not the body' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  carry: {
    help: 'the ranger\'s carried bow against his body through a carry\'s round',
    options: {
      canary: { kind: 'switch', help: 'plant faults the measure must catch' },
      frames: { kind: 'switch', help: 'list every frame with a clip: its phase, what crossed what, how deep' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  feet: {
    help: 'the hero\'s feet against the ground round the dais\'s edges and on level ground: standing at full draw by '
      + 'the edges, walking across them and strafing up and down the steps with a shot drawn',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['edge', 'level', 'strafe', 'cross', 'run'],
        help: 'the scenarios (all by default): edge, level, strafe, cross, run',
      },
      canary: { kind: 'switch', help: 'plant faults the measures must catch: a planted ankle slid, one sunk' },
      frames: { kind: 'switch', help: 'list every stance and standing case flagged, and what was wrong with it' },
      trace: { kind: 'switch', help: 'each frame of each walk, foot by foot (pick one with --scenarios)' },
      ...COMMON_OPTIONS,
    },
  },
  range: {
    help: 'every joint of the hero against a body\'s ranges, frame by frame: standing, walking each way, attacking, '
      + 'and walks that change direction while he attacks or runs',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['stand', 'walk', 'shoot', 'reverse', 'taps', 'run'],
        help: 'the scenarios (all by default): stand, walk, shoot, reverse, taps, run',
      },
      canary: { kind: 'switch', help: 'plant a fault the measure must catch: the head turned past the neck\'s range' },
      frames: { kind: 'switch', help: 'list every frame with a joint past its range' },
      ...COMMON_OPTIONS,
    },
  },
  gait: {
    help: 'the hero\'s walk judged as a person\'s, over level ground and the dais\'s steps, nothing drawn, drawn and '
      + 'changing direction: the time on each foot, both and neither, the steps, the hops, the hips\' rise and fall, '
      + 'the jerks, each filmed from the side',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['walk', 'drawn', 'taps', 'zigzag', 'circle', 'circleDrawn', 'stairs', 'stairsDrawn'],
        help: 'the scenarios (all by default): walk, drawn, taps, zigzag, circle, circleDrawn, stairs, stairsDrawn',
      },
      frames: { kind: 'switch', help: 'list every step (its foot, when it left and landed, how far) and the hops' },
      trace: { kind: 'switch', help: 'list every frame: the way the body faces and goes, the pelvis, the cycle, each foot' },
      ...COMMON_OPTIONS,
    },
  },
  probe: {
    help: 'a probe module of your own: its default export takes the lab and the options (tools/lab/README.md)',
    argument: 'module',
    open: true,
    options: {
      setup: { kind: 'switch', help: 'set the run up first (=false: the probe sets up itself)' },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  eval: {
    help: 'an expression evaluated in the page, with `lab` in scope: npm run lab -- eval "lab.player.nocked"',
    argument: 'expression',
    options: { ...COMMON_OPTIONS },
  },
  serve: { help: 'keep a session up, booting each command\'s page ahead (npm run lab:serve)', options: {} },
  status: { help: 'what the server serves and has booted', options: {} },
  stop: { help: 'stop the server', options: {} },
  help: { help: 'this', options: {} },
};

/** The distance between two words in single-letter edits (Levenshtein's). */
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const replaced = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      row.push(Math.min(previous[j] + 1, row[j - 1] + 1, replaced));
    }
    previous = row;
  }
  return previous[b.length];
}

/** ` (did you mean x?)` when one of `names` is a slip of `word` away, else nothing. */
function suggestion(word, names) {
  const ranked = names
    .map((name) => ({ name, distance: editDistance(word, name) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (!best || best.distance > Math.max(1, Math.floor(word.length / 3))) return '';
  return ` (did you mean ${best.name}?)`;
}

/** A number written in full (`12`, `-0.5`), or NaN: Number() also takes '', ' ' and '0x10'. */
function numberFrom(text) {
  return /^\s*-?(\d+\.?\d*|\.\d+)(e-?\d+)?\s*$/i.test(text) ? Number(text) : NaN;
}

/** An option's value as its kind reads it; throws saying what was wrong. */
function readValue(name, spec, text) {
  const wrong = (expected) => labError(`--${name}: ${expected}, not ${JSON.stringify(text)}`);
  switch (spec.kind) {
    case 'switch':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      throw wrong('true or false');
    case 'ref':
      if (text === undefined || text === 'true') return true;
      if (text === 'false') return false;
      if (text === '') throw wrong('a commit');
      return text;
    case 'text':
      if (!text) throw wrong('a value');
      return text;
    case 'list': {
      const items = text.split(',').map((item) => item.trim()).filter(Boolean);
      if (items.length === 0) throw wrong('a comma-separated list');
      const unknown = items.find((item) => spec.choices && !spec.choices.includes(item));
      if (unknown !== undefined) throw wrong(`some of ${spec.choices.join(', ')}${suggestion(unknown, spec.choices)}`);
      return items;
    }
    case 'number': {
      const value = numberFrom(text);
      if (!Number.isFinite(value)) throw wrong('a number');
      return value;
    }
    case 'pair': {
      const values = text.split(',').map(numberFrom);
      if (values.length !== 2 || !values.every(Number.isFinite)) throw wrong('two numbers, x,z');
      return values;
    }
    case 'choice':
      if (!spec.choices.includes(text)) throw wrong(spec.choices.join(', '));
      return text;
    default:
      throw new Error(`option --${name} has an unknown kind ${spec.kind} (one of ${KINDS.join(', ')})`);
  }
}

/** An option an open command doesn't know, passed on: `--name` true, `--name=false` false, else its text. */
function passedOn(text) {
  if (text === undefined || text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

/** whether an option of this kind takes the next argument as its value when written without `=` */
const takesNext = (spec) => spec.kind !== 'switch' && spec.kind !== 'ref';

/**
 * Reads a command line (the arguments after `lab`): the command, its options by name (each read as its kind says,
 * defaults filled in) and the words after the command, under `_`. Throws, saying what was wrong, at an unknown
 * command, an option the command doesn't take, or a bad value.
 */
export function parseCommandLine(argv) {
  const [command = 'help', ...rest] = argv;
  const name = command === '--help' || command === '-h' ? 'help' : command;
  const definition = COMMANDS[name];
  if (!definition) {
    const known = Object.keys(COMMANDS);
    throw labError(`no command ${name}${suggestion(name, known)}; the commands: ${known.join(', ')}`);
  }
  const specs = definition.options;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const argument = rest[i];
    if (!argument.startsWith('--')) {
      options._.push(argument);
      continue;
    }
    const [optionName, text] = argument.slice(2).split(/=(.*)/s);
    const spec = specs[optionName];
    if (!spec) {
      if (definition.open) {
        options[optionName] = passedOn(text);
        continue;
      }
      const known = Object.keys(specs);
      const guess = suggestion(optionName, known);
      const takes = guess || !known.length ? '' : `; it takes ${known.map((option) => `--${option}`).join(', ')}`;
      throw labError(`${name} takes no --${optionName}${guess}${takes}`);
    }
    if (text === undefined && takesNext(spec)) {
      if (i + 1 >= rest.length) throw labError(`--${optionName} needs a value (${spec.usage ?? spec.kind})`);
      options[optionName] = readValue(optionName, spec, rest[++i]);
    } else {
      options[optionName] = readValue(optionName, spec, text);
    }
  }
  for (const [optionName, spec] of Object.entries(specs)) {
    if (options[optionName] === undefined && spec.default !== undefined) {
      options[optionName] = readValue(optionName, spec, spec.default);
    }
  }
  if (definition.argument && options._.length === 0) throw labError(`${name} needs its ${definition.argument}`);
  if (!definition.argument && options._.length > 0) {
    throw labError(`${name} takes no ${JSON.stringify(options._[0])} (options start with --)`);
  }
  return { command: name, options };
}

/** the help's width, and the column its descriptions start at */
const HELP_WIDTH = 116;
const HELP_COLUMN = 28;

/** `head`, then `text` from the help's column, wrapped to its width under that column. */
function helpEntry(head, text) {
  const lines = [];
  let line = `${head.padEnd(HELP_COLUMN - 1)} `;
  let empty = true;
  for (const word of text.split(' ')) {
    if (!empty && line.length + 1 + word.length > HELP_WIDTH) {
      lines.push(line);
      line = ' '.repeat(HELP_COLUMN);
      empty = true;
    }
    line += empty ? word : ` ${word}`;
    empty = false;
  }
  lines.push(line);
  return lines.join('\n');
}

/** An option's entry in the help: `--name usage`, then what it does, and its default. */
function optionEntry(name, spec) {
  const value = spec.kind === 'ref' ? spec.usage : spec.usage ? ` ${spec.usage}` : '';
  const fallback = spec.default ? ` (${spec.default})` : '';
  return helpEntry(`      --${name}${value}`, `${spec.help}${fallback}`);
}

/** The help, made from `COMMANDS`: each command with its own options, then the ones the commands share. */
export function usage() {
  const shared = new Set([...Object.keys(SETUP_OPTIONS), ...Object.keys(COMMON_OPTIONS)]);
  const lines = ['npm run lab -- <command> [options]', ''];
  for (const [name, definition] of Object.entries(COMMANDS)) {
    if (name === 'help') continue;
    const head = definition.argument ? `${name} <${definition.argument}>` : name;
    lines.push(helpEntry(`  ${head}`, definition.help));
    for (const [optionName, spec] of Object.entries(definition.options)) {
      if (!shared.has(optionName)) lines.push(optionEntry(optionName, spec));
    }
    if (definition.open) lines.push(helpEntry('      --name[=value]', 'any other option is passed to the probe'));
  }
  lines.push('', '  the set-up (sheet, carry, probe):');
  for (const [name, spec] of Object.entries(SETUP_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push('  every command run on a page (sheet, carry, probe, eval):');
  for (const [name, spec] of Object.entries(COMMON_OPTIONS)) lines.push(optionEntry(name, spec));
  lines.push(
    '',
    'With npm run lab:serve up, each command\'s page is booted ahead of it. Every command runs on a page booted for',
    'it, so it gives the same result every time. The exit status is 1 when it failed or found a problem (an error',
    'in the page, a canary the measure missed).',
  );
  return lines.join('\n');
}
