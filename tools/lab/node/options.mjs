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
 * - `ref`: a switch that may name a commit (`--ab`, `--ab=165246d`);
 * - `screen`: a window's size in css px and the screen's pixel ratio, `1280x720@3` (`@1` when it's left out);
 * - `screens`: two of them, `3840x2160@1,1280x720@3`.
 */
const KINDS = ['switch', 'text', 'list', 'number', 'pair', 'choice', 'ref', 'screen', 'screens'];

/** the UI's states `ui` pictures, in the order it runs them: the lobby's, then the run's (page/ui.ts `UiState`) */
export const UI_STATES = [
  'lobby', 'tooltip', 'help', 'saves', 'clicked', 'views', 'run', 'scores', 'perf', 'decision', 'pause', 'summary',
];

/** the ways a hero may hold his weapons (src/loot/loadout.ts `WeaponStyle`) */
const WEAPON_STYLES = ['oneHanded', 'shield', 'twoHanded', 'dual'];

/** the options that set up the run before a command (page/lab.ts `Fixture`) */
const SETUP_OPTIONS = {
  view: { kind: 'choice', choices: ['top', 'third', 'first'], usage: 'top|third|first', help: 'the game\'s view' },
  at: { kind: 'pair', usage: 'x,z', help: 'where the hero stands (12,22: off the dais, clear of props)' },
  facing: { kind: 'number', usage: 'rad', help: 'the way he faces (0 is +z)' },
  nocked: { kind: 'switch', help: 'a bow\'s hero with an arrow on the string (=false: none)' },
  gear: {
    kind: 'choice',
    choices: WEAPON_STYLES,
    usage: WEAPON_STYLES.join('|'),
    help: 'the hero holding his weapons this way (a class with more than one; as rolled by default)',
  },
};

/** the options every command running on a page takes */
const COMMON_OPTIONS = {
  ab: {
    kind: 'ref',
    usage: '[=ref]',
    help: 'also on another commit (origin/main by default): its results beside this tree\'s, and the lines that '
      + 'differ (a commit against itself agrees, line for line)',
  },
  fresh: {
    kind: 'switch',
    help: 'with --ab, run the other commit again rather than read its kept result (tools/lab/out/ab-cache: kept by '
      + 'its commit, the lab\'s code, the command and its options)',
  },
  class: { kind: 'text', usage: 'name', help: 'the hero (ranger, warrior, mage; the last one used by default)' },
  screen: {
    kind: 'screen',
    usage: 'WxH[@ratio]',
    help: 'the page put on a screen of this size (css px) and pixel ratio once it has booted, as a window moved onto '
      + 'another monitor is (1280x720@3: a 4K screen at 300%; 1920x1080@1 by default)',
  },
  screens: {
    kind: 'screens',
    usage: 'WxH[@ratio],WxH[@ratio]',
    help: 'this tree on two screens, one after the other, compared as --ab compares two commits: the lines and the '
      + 'pictures that differ (3840x2160@1,1280x720@3: a 4K screen at 100% and at 300%, pictured at its 3840x2160 '
      + 'pixels on both)',
  },
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
      trace: {
        kind: 'switch',
        help: 'list every frame of the leg IK, as gait --trace does, with the joints past their ranges',
      },
      span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
      ...COMMON_OPTIONS,
    },
  },
  stops: {
    help: 'the hero coming to a stop from a run, judged as a person stops: the steps once still, a foot put out and '
      + 'drawn back, a step back, a foot off the body\'s level, on level ground and by the dais\'s edge',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['level', 'drawn', 'edgeOut', 'edgeIn', 'edgeSlant', 'edgeAlong', 'edgeShot'],
        help: 'the scenarios (all by default): level, drawn, edgeOut, edgeIn, edgeSlant, edgeAlong, edgeShot',
      },
      frames: { kind: 'switch', help: 'list every stop: where it rested, each step after the keys were let go' },
      trace: { kind: 'switch', help: 'with --frames, each frame of each stop along the way from where it rested' },
      only: { kind: 'text', usage: 'name', help: 'only the stops whose names contain this (d 23, 12 cm out)' },
      ...COMMON_OPTIONS,
    },
  },
  coop: {
    help: 'two games playing together, the host\'s and the guest\'s, their messages carried as a link of a high ping '
      + 'carries them: how far behind and how roughly each copies the other\'s heroes and foes, whether an arrow that '
      + 'struck a foe on the guest\'s screen counted, whether a blow it dodged on its screen hurt it, where its blink '
      + 'came out on the host\'s screen and whether the foes it dazed were dazed on the host\'s',
    options: {
      scenarios: {
        kind: 'list',
        usage: 'a,b',
        choices: ['walk', 'foes', 'shoot', 'dodge', 'down', 'blink'],
        help: 'the scenarios (all the hero can play by default): walk, foes, shoot, dodge, down, blink (a mage)',
      },
      ping: { kind: 'number', usage: 'ms', help: 'the link\'s least round trip (300 by default)' },
      jitter: { kind: 'number', usage: 'ms', help: 'how much later each way a message may come (60 by default)' },
      pictures: { kind: 'switch', help: 'picture both screens at a scenario\'s moments (into out/coop)' },
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
        choices: ['walk', 'run', 'drawn', 'taps', 'zigzag', 'circle', 'circleDrawn', 'stairs', 'stairsDrawn'],
        help: 'the scenarios (all by default): walk, run, drawn, taps, zigzag, circle, circleDrawn, stairs, '
          + 'stairsDrawn',
      },
      frames: { kind: 'switch', help: 'list every step (its foot, when it left and landed, how far) and the hops' },
      trace: {
        kind: 'switch',
        help: 'list every frame: the way the body faces and goes, the pelvis, the cycle, each foot',
      },
      span: { kind: 'pair', usage: 'from,to', help: 'with --trace, only the frames from the first to the second' },
      films: {
        kind: 'switch',
        help: 'film each scenario, run again for it (=false: the numbers alone, in half the time)',
      },
      offsets: {
        kind: 'list',
        usage: 'a,b',
        help: 'each scenario from these starts, a run each on one page: its first move so many frames longer '
          + '(its turns at other points of a stride; 0 alone by default)',
      },
      ...COMMON_OPTIONS,
    },
  },
  form: {
    help: 'the hero\'s run judged against a runner\'s, with each way he holds his weapons: the stride\'s timing, '
      + 'each joint\'s curve over it, stick figures over a runner\'s and the hero pictured at eight points of it: '
      + 'tools/lab/out/form/<way>.png',
    options: {
      gear: {
        kind: 'list',
        usage: 'a,b',
        choices: WEAPON_STYLES,
        help: `the ways of holding the weapons (the class's all by default): ${WEAPON_STYLES.join(', ')}`,
      },
      canary: {
        kind: 'switch',
        help: 'plant a fault the measure must catch: the left knee straight through its stance',
      },
      frames: { kind: 'switch', help: 'list each leg\'s cycles and the curves bin by bin' },
      pictures: {
        kind: 'switch',
        help: 'picture the run: stick figures, and the hero run again for him (=false: the numbers alone)',
      },
      ...COMMON_OPTIONS,
    },
  },
  ui: {
    help: 'the game\'s UI as the player sees it, each state pictured whole with its named elements\' and the world\'s '
      + 'labels\' boxes as shares of the window: with --screens, whether the UI is the same share of the screen on '
      + 'both (tools/lab/out/ui)',
    options: {
      states: {
        kind: 'list',
        usage: 'a,b',
        choices: UI_STATES,
        default: UI_STATES.join(','),
        help: 'the states: lobby, tooltip, help, saves, clicked (a class button clicked and a key pressed after it: '
          + 'where the focus went), views (the lobby\'s camera switched through its views: the labels over the '
          + 'dummies against their anchors), run (the HUD with a hurt foe\'s bar and damage numbers), '
          + 'scores, perf, decision, pause, summary',
      },
      hdr: { kind: 'switch', help: 'HDR on, as on a display in HDR mode (the pause menu shows its levels)' },
      ...COMMON_OPTIONS,
    },
  },
  light: {
    help: 'the frame\'s light as the player sees it: the hero standing in each biome, view and facing, the frame '
      + 'drawn and read back from the canvas, its light as a share of the screen\'s white (mean, by thirds, its '
      + 'brightest pixels, near white and past it): tools/lab/out/light',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facings: {
        kind: 'list',
        usage: 'a,b',
        default: '0,90,180,270',
        help: 'the ways the hero faces in the close views, degrees (0 is +z; the top view is measured at the first)',
      },
      pictures: { kind: 'switch', help: 'picture each frame too (=false: the numbers alone)' },
      hdr: {
        kind: 'switch',
        help: 'each frame drawn again in HDR (on any display) and checked against the SDR one: under the knee as an '
          + 'SDR screen shows it at the paper white, nothing past the peak, the canvas shown the frame drawn',
      },
      paper: { kind: 'number', usage: 'n', help: 'with --hdr, the paper white: a share of the screen\'s white (1)' },
      peak: { kind: 'number', usage: 'n', help: 'with --hdr, the brightest highlight: a share of its white (3)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the measures must catch: the first frame at twice the exposure (and in HDR at 1.2 times '
          + 'the paper white)',
      },
      ...COMMON_OPTIONS,
    },
  },
  cast: {
    help: 'a skill of the hero\'s cast as the player casts it, its effect seen frame by frame: the hero standing in '
      + 'each biome and view with the biome\'s foes coming at him, the key pressed (held for a held skill or a '
      + 'channel, a drawn shot drawn to full) over an aim ahead, and every frame until the effect is over drawn and '
      + 'read back: its light against the budget (the frame\'s mean raised 50 at most, a sixteenth of it 150, 5% '
      + 'of it bright, as stored), the flashes in a second (WCAG\'s: three are a hazard) and the shaders compiled '
      + 'after loading; the skill named by its key, its behaviour or its name: tools/lab/out/cast/<skill> '
      + '(--class mage)',
    argument: 'skill',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facing: { kind: 'number', usage: 'degrees', help: 'the way the hero faces and casts (0, +z, by default)' },
      foes: {
        kind: 'number',
        usage: 'n',
        help: 'how many of the biome\'s commonest foes come at him (4 by default; 0: none)',
      },
      times: {
        kind: 'list',
        usage: 'a,b',
        default: '0.4,1.5,3',
        help: 'the moments pictured, s after the press',
      },
      pictures: { kind: 'switch', help: 'picture the moments (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant the fault the checks must catch, in the first biome and view: a strobe of the exposure',
      },
      ...COMMON_OPTIONS,
    },
  },
  health: {
    help: 'the screen as the hero\'s Health runs low: standing in each biome and view, his Health held at shares of '
      + 'his most, and at each the frame drawn with the low-health look and without it at the same moment: the colour '
      + 'it drains, the blood\'s cover of the screen and of its middle, and how far in it reaches; a frame changed '
      + 'above where the look starts, blood in the middle of the view, a lower Health draining or covering less and '
      + 'a look too faint with nothing left are problems: tools/lab/out/health',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      facings: {
        kind: 'list',
        usage: 'deg',
        default: '0',
        help: 'the way the hero faces, degrees (0 is +z; the first alone)',
      },
      shares: {
        kind: 'list',
        usage: 'a,b',
        default: '1,0.6,0.5,0.4,0.25,0.1,0',
        help: 'the shares of his most Health he is held at, in turn',
      },
      pictures: {
        kind: 'switch',
        help: 'picture the frames under the share the look starts at (=false: numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch, in the first scenario: the look drawn with Health whole, and its '
          + 'blood driven into the middle of the view',
      },
      ...COMMON_OPTIONS,
    },
  },
  held: {
    help: 'every held skill of the hero\'s class held as the player holds it, over a training dummy ahead: ready, '
      + 'its preview in its own look with no countdown and a release casting; then held through its cooldown and '
      + 'short of energy, red and counting down until a release would cast; Quarry Mark\'s red outline round the foe '
      + 'it would mark, over the shoulder and through the eyes too, its pixels near the foe and none away from it. A '
      + 'preview missing, in the wrong look or off its countdown, a release casting when it mustn\'t or not when it '
      + 'must, and an outline off its foe are problems: tools/lab/out/held (--class ranger, mage)',
    options: {
      pictures: { kind: 'switch', help: 'picture each preview, ready and on its cooldown (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: each preview read as ready with no countdown on its cooldown, '
          + 'Quarry Mark\'s outline drawn round the hero, and a shader compiled mid-game',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  draw: {
    help: 'every drawn shot of the hero\'s class (the ranger\'s) drawn to full and held there as the player holds it, '
      + 'in each view, the motes on its arrowhead read every frame: none as it\'s drawn, and held at full it glints '
      + 'until it\'s loosed, seen in the view (the frame drawn with the glint and without it, round the arrowhead, '
      + 'every 4 frames of the hold, pictured at its most glaring), and in the close views the crosshair bold held '
      + 'at full alone, swelling into it once about its middle (none with motion reduced); a glint before full '
      + 'draw, missing or gone at full, hardly seen or glaring in a blob, the crosshair bold before full, regular at '
      + 'full, beating other than once or moving off its middle, and one with nothing drawn are problems: '
      + 'tools/lab/out/draw (--class ranger)',
    options: {
      views: {
        kind: 'list',
        usage: 'a,b',
        choices: ['top', 'third', 'first'],
        default: 'top,third,first',
        help: 'the views: top, third, first',
      },
      pictures: {
        kind: 'switch',
        help: 'picture each shot held at full draw, the screen and its arrowhead close, and the crosshair as it\'s '
          + 'drawn, at its beat\'s height and bold (=false: the numbers alone)',
      },
      canary: {
        kind: 'switch',
        help: 'plant the faults the checks must catch: the glint and the crosshair\'s bold shown as the bow is '
          + 'drawn and taken away at full draw, the crosshair swelling about its corner, and its beat with motion '
          + 'reduced',
      },
      at: SETUP_OPTIONS.at,
      facing: SETUP_OPTIONS.facing,
      ...COMMON_OPTIONS,
    },
  },
  blink: {
    help: 'the mage\'s blink cast as the player casts it (the key held over the aim, let go): on open ground, past his '
      + 'reach, at a prop, past one, out at the arena\'s edge, up onto the dais and at his feet, where the preview '
      + 'showed against where he came out, a blow tried every frame, his body coming apart and whole again; then held '
      + 'through its cooldown and short of energy, the preview red and counting down until a release would cast; then '
      + 'foes near where he vanished and further off; a landing off its preview, past his reach or in a prop, a blow '
      + 'landed while he crossed, a preview green or off its countdown while a release would cast nothing, a near foe '
      + 'moving while dazed or never coming on again and a far one dazed or stopping are problems: tools/lab/out/blink '
      + '(--class mage)',
    options: {
      pictures: { kind: 'switch', help: 'picture a blink\'s moments and the dazed foes (=false: the numbers alone)' },
      canary: {
        kind: 'switch',
        help: 'plant faults the checks must catch: the preview read a metre off, the guard taken off as he comes '
          + 'apart, the preview read green with no countdown on its cooldown, and a near foe\'s daze cleared at once',
      },
      ...SETUP_OPTIONS,
      ...COMMON_OPTIONS,
    },
  },
  gear: {
    help: 'full sets rolled for every class as its loot rolls them, at each rarity and item level, and what a set '
      + 'gives on average: Health (his own and gear\'s), regeneration a second, the draught\'s heal and how much it '
      + 'multiplies his damage; a class whose Health or regeneration from gear is out of the order of his own Health '
      + 'is a problem',
    options: {
      tiers: {
        kind: 'list',
        usage: 'rarity@ilvl,...',
        default: 'magic@5,rare@15,epic@30,legendary@50',
        help: 'the tiers: a rarity at an item level each',
      },
      sets: { kind: 'number', usage: 'n', help: 'the sets rolled for each class at each tier (400 by default)' },
      canary: {
        kind: 'switch',
        help: 'plant a fault the check must catch: the ranger\'s Health from gear rolled as the mage\'s',
      },
      ...COMMON_OPTIONS,
    },
  },
  touch: {
    help: 'the touch controls\' move stick pushed by a finger, sent as a touch screen\'s: slid out to its edge and '
      + 'far past it, half the window across, and what each push gave (the stick\'s push, the knob, the hero\'s '
      + 'speed); a push further out may never give less',
    options: {
      canary: {
        kind: 'switch',
        help: 'plant a fault the measure must catch: the furthest push\'s finger slid back near the middle',
      },
      ...COMMON_OPTIONS,
    },
  },
  spawns: {
    help: 'waves set off one after another in each biome (boss waves, the 5th to the 20th), a seed each, the hero at '
      + 'the arena\'s middle: the gate every foe came in by and the spot it rose on against the props and the edge, '
      + 'how many gates each group came by and its packs, the waves leaving a gate idle, when the boss came against '
      + 'the first group reaching the hero, and from each gate the first boss\'s walk to him; then waves 1, 5 and 10 '
      + 'at the game\'s own pace, each foe taken out as it reaches him; a number of gates no group came by, a wave '
      + 'leaving a gate idle, a gate no boss came by, a foe risen in a prop, a boss early or late and one that never '
      + 'reached the hero are problems',
    options: {
      biomes: {
        kind: 'list',
        usage: 'a,b',
        choices: ['crypt', 'forest'],
        default: 'crypt,forest',
        help: 'the biomes: crypt, forest',
      },
      waves: {
        kind: 'number',
        usage: 'n',
        help: 'the waves in each biome (32 by default; the bosses\' gates are judged over 24 at least)',
      },
      canary: {
        kind: 'switch',
        help: 'plant faults the measures must catch, in the first biome: every foe read again moved onto one gate, '
          + 'the first half into a prop, and one more wave\'s boss frozen where it rose',
      },
      ...SETUP_OPTIONS,
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
  check: {
    help: 'the checks of a change to how the heroes move, every hero\'s, side by side in sessions of their own: the '
      + 'gait (its steps listed, no films), the stops, the ranges and the run\'s form for each hero, the ranger\'s '
      + 'feet and carry; each report in tools/lab/out/check/<command>-<hero>.txt (runs in this process, not the '
      + 'server)',
    options: {
      classes: { kind: 'list', usage: 'a,b', help: 'the heroes (warrior, mage, ranger by default)' },
      commands: {
        kind: 'list',
        usage: 'a,b',
        choices: ['gait', 'stops', 'range', 'form', 'feet', 'carry'],
        help: 'the commands (gait, stops, range, form, feet, carry by default)',
      },
      jobs: { kind: 'number', usage: 'n', help: 'how many sessions side by side (a core in three, at most 8)' },
      starts: {
        kind: 'number',
        usage: 'n',
        help: 'how many moments each gait scenario starts from, its counts added up (5 by default, at most 8)',
      },
      ab: COMMON_OPTIONS.ab,
      fresh: COMMON_OPTIONS.fresh,
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

/** A screen written as `WxH@ratio` (the ratio may be left out: 1), or null when it isn't one. */
function screenFrom(text) {
  const match = /^(\d+)x(\d+)(?:@(\d+\.?\d*|\.\d+))?$/.exec(text ?? '');
  if (!match) return null;
  const screen = { width: Number(match[1]), height: Number(match[2]), ratio: match[3] ? Number(match[3]) : 1 };
  return screen.width > 0 && screen.height > 0 && screen.ratio > 0 ? screen : null;
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
    case 'screen': {
      const screen = screenFrom(text);
      if (!screen) throw wrong('a size and pixel ratio, 1280x720@3');
      return screen;
    }
    case 'screens': {
      const screens = text.split(',').map(screenFrom);
      if (screens.length !== 2 || screens.includes(null)) {
        throw wrong('two sizes and pixel ratios, 3840x2160@1,1280x720@3');
      }
      return screens;
    }
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

/** Throws at options that can't go together: `--screens` names both sides' screens, and runs this tree alone. */
function checkTogether(options) {
  if (!options.screens) return;
  if (options.ab) throw labError('--screens compares this tree on two screens: it takes no --ab');
  if (options.screen) throw labError('--screens names both screens: it takes no --screen');
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
  checkTogether(options);
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
