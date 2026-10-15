// The lab's commands as the session runs them (tools/lab): each one's work on a side, how the sides' results are
// put together and compared, and the problems a result reports. Their options are read and checked by options.mjs.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runCoop } from './coop.mjs';
import { labError } from './errors.mjs';
import { UI_STATES } from './options.mjs';
import { REPO } from './paths.mjs';
import { probeFiles } from './probeFiles.mjs';
import { writeSheet } from './sheetImage.mjs';
import { compare, readReference, screenFor, writeMatch } from './match.mjs';

/** the waves `spawns` sets off in each biome unless `--waves` says */
const SPAWN_WAVES = 32;
/** the sets `gear` rolls for each class at each tier unless `--sets` says */
const GEAR_SETS = 400;
/** the rarities loot rolls (src/data/items.ts `RARITIES`) */
const RARITIES = ['common', 'magic', 'rare', 'epic', 'legendary'];

/** A `gear` tier from its option (`epic@30`: a rarity at an item level), checked. */
function gearTier(text) {
  const [rarity, level] = text.split('@');
  const ilvl = Number(level);
  if (!RARITIES.includes(rarity) || !(ilvl >= 1)) {
    throw labError(`gear --tiers: ${text} is not a rarity at an item level (${RARITIES.join(', ')}; epic@30)`);
  }
  return { rarity, ilvl: Math.round(ilvl) };
}

/** The set-up a command asks for (page/lab.ts `Fixture`), from its options. */
export function fixtureFrom(options) {
  const fixture = {};
  if (options.view !== undefined) fixture.view = options.view;
  if (options.at !== undefined) fixture.at = options.at;
  if (options.facing !== undefined) fixture.facing = options.facing;
  if (options.nocked !== undefined) fixture.nocked = options.nocked;
  if (options.gear !== undefined) fixture.gear = options.gear;
  if (options.weapon !== undefined) fixture.weapon = options.weapon;
  if (options.wear !== undefined) fixture.wear = options.wear.filter((part) => part !== 'none');
  if (options.tune !== undefined) fixture.tune = tunesFrom(options.tune);
  return fixture;
}

/** `--tune`'s text as the values it sets, by their paths: `a.b=1,2;c.d=3` sets a.b to [1, 2] and c.d to [3]. */
function tunesFrom(text) {
  const tunes = {};
  for (const part of text.split(';').filter(Boolean)) {
    const [path, values] = part.split('=');
    const numbers = (values ?? '').split(',').map(Number);
    if (!path.includes('.') || !values || numbers.some((n) => !Number.isFinite(n))) {
      throw new Error(`lab: --tune: ${part} isn't name.field=numbers`);
    }
    tunes[path] = numbers;
  }
  return tunes;
}

/**
 * The frames `light` measures (page/light.ts `LightScenario`): each biome in each view, the close views at each of
 * the facings, the top view at the first.
 */
function lightScenarios(options) {
  const scenarios = [];
  for (const biome of options.biomes) {
    for (const view of options.views) {
      const facings = view === 'top' ? options.facings.slice(0, 1) : options.facings;
      for (const facing of facings) scenarios.push({ biome, view, facing: Number(facing) });
    }
  }
  return scenarios;
}

/** The casts `cast` measures (page/cast.ts `CastOptions`, its canary aside): the skill in each biome and view. */
function castScenarios(options) {
  const scenarios = [];
  for (const biome of options.biomes) {
    for (const view of options.views) {
      scenarios.push({
        skill: options._[0],
        biome,
        view,
        facing: options.facing ?? 0,
        at: options.at,
        foes: options.foes ?? 4,
        times: options.times.map(Number),
        pictures: options.pictures !== false,
        what: options.what?.map(Number),
        gear: options.gear,
      });
    }
  }
  return scenarios;
}

/** A sheet's notes as text: how it was set up, then each moment's notes. */
function sheetNotes(sheet) {
  const moments = sheet.moments.map((moment) => {
    const lines = moment.notes.map((note) => `    ${note}`);
    return `  ${moment.label}\n${lines.join('\n')}`;
  });
  return `set up as ${JSON.stringify(sheet.setup)}\n${moments.join('\n')}`;
}

/**
 * The pictures two sheets (or two reports with moments) took of the same moment from the same view, paired, each
 * pair named for the verdict.
 */
function picturePairs(before, after) {
  const pairs = [];
  for (const moment of after?.moments ?? []) {
    const other = (before?.moments ?? []).find((candidate) => candidate.label === moment.label);
    if (!other) continue;
    for (const tile of moment.tiles) {
      const match = other.tiles.find((candidate) => candidate.view === tile.view);
      if (match) pairs.push({ name: `${moment.label} / ${tile.view}`, before: match.png, after: tile.png });
    }
  }
  return pairs;
}

/** Whether a result is a report (page/lab.ts `Report`): its text and the problems it found. */
function isReport(result) {
  return typeof result?.text === 'string' && Array.isArray(result?.problems);
}

/** A probe's or an expression's result as text: as it is, a report's text, or JSON. */
function asText(result) {
  if (typeof result === 'string') return result;
  if (isReport(result)) return result.text;
  return JSON.stringify(result, null, 2) ?? String(result);
}

/** The problems a result reports: a report's, none otherwise. */
function problemsIn(result) {
  return isReport(result) ? result.problems : [];
}

/**
 * Writes the moments the sides' results pictured (a report's `moments`) as one sheet in `dir`; returns its path, or
 * null when none pictured any.
 */
async function writeMoments(results, dir, browser, name = 'sheet.png') {
  const runs = results
    .filter(([, result]) => result?.moments?.length)
    .map(([side, result]) => [side.name, { moments: result.moments }]);
  if (runs.length === 0) return null;
  mkdirSync(dir, { recursive: true });
  const image = join(dir, name);
  const views = Math.max(...runs.flatMap(([, { moments }]) => moments.map((moment) => moment.tiles.length)));
  await writeSheet(browser, runs, views, image);
  return image;
}

/**
 * Each side's text under its name, and a sheet for each of each side's moments, written in `dir`: `film-1.png` on for
 * this tree's, `film-main-1.png` on for the other side's (a turn's `filePrefix` after `film-`). For films: two sides'
 * in one sheet, or eight scenarios' of one side, were a page too big for the browser, which closed.
 */
async function textWithSheetEach(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = `film-${side.filePrefix}`;
    const moments = result?.moments ?? [];
    for (const [index, moment] of moments.entries()) {
      const one = [side, { ...result, moments: [moment] }];
      const image = await writeMoments([one], dir, browser, `${prefix}${index + 1}.png`);
      if (image) images.push(relative(REPO, image));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/** A moment's group, for a sheet of its own: its label up to its colon (`holding shield: from his left`). */
const groupOf = (moment) => moment.label.split(':')[0];

/** A group's name as a file name: lowercase words joined by dashes. */
const fileNameOf = (group) => group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Each side's text under its name, and a sheet for each group of each side's moments (`groupOf`), written in `dir`:
 * `<group>.png` for this tree's, `main-<group>.png` for the other side's (a turn's `filePrefix` first). A run of the
 * warrior's four ways of holding his weapons in one sheet was a page too big for the browser, which closed.
 */
async function textWithSheetsByGroup(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = side.filePrefix;
    const groups = [...new Set((result?.moments ?? []).map(groupOf))];
    for (const group of groups) {
      const moments = result.moments.filter((moment) => groupOf(moment) === group);
      const name = `${prefix}${fileNameOf(group)}.png`;
      const image = await writeMoments([[side, { ...result, moments }]], dir, browser, name);
      if (image) images.push(relative(REPO, image));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
}

/**
 * Each side's text under its name, and each picture of its moments as a PNG of its own at its full size, written in
 * `dir` (emptied first) as `<filePrefix><moment>.png` (`-<view>` after a moment pictured from more than one view):
 * a 4K screen's pictures put on one sheet were a page too big for the browser, which closed.
 */
function textWithPictureFiles(results, dir) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [side, result] of results) {
    for (const moment of result?.moments ?? []) {
      for (const tile of moment.tiles) {
        const view = moment.tiles.length > 1 ? `-${tile.view}` : '';
        const name = `${side.filePrefix}${fileNameOf(moment.label)}${view}.png`;
        const base64 = tile.png.slice(tile.png.indexOf(',') + 1);
        writeFileSync(join(dir, name), Buffer.from(base64, 'base64'));
        written.push(name);
      }
    }
  }
  return written.length ? `${text}\n\npictures in ${relative(REPO, dir)}: ${written.join(', ')}` : text;
}

/** Each side's text under its name, and the sheet of the moments they pictured, written in `dir` (when any did). */
async function textWithMoments(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const image = await writeMoments(results, dir, browser);
  return image ? `${text}\n\npictures: ${relative(REPO, image)}` : text;
}

/** A probe module's path relative to the repo, with forward slashes; throws unless it's a file under the repo. */
function probePath(file) {
  const path = relative(REPO, resolve(REPO, file));
  if (path.startsWith('..') || isAbsolute(path)) throw labError(`probe: ${file} is not under the repo`);
  if (!existsSync(join(REPO, path))) throw labError(`probe: there is no ${file}`);
  return path.split('\\').join('/');
}

/**
 * The commands, by name:
 * - `check(options)`, when there is one, throws at what's wrong with them before anything boots;
 * - `each(side, options, session)` runs it on one side (its page booted) and returns its result;
 * - `finish(results, options, session)`, when there is one, puts the sides' results together as text (else each
 *   side's text is shown under its name): `results` pairs each turn (`session.turnsFor`: its `name`, and the
 *   `filePrefix` its files' names start with) with its result;
 * - `textOf(result)` is the result as text, which an A/B compares line by line;
 * - `problemsOf(result)` the problems it found, which fail the command;
 * - `countsOf(result)`, when there is one, what it counted by name, which a check adds up over a hero's jobs;
 * - `pictures(before, after)` pairs the pictures an A/B compares, for a command that takes them.
 */
export const COMMANDS = {
  sheet: {
    each(side, options) {
      return side.command('sheet', {
        states: options.states,
        views: options.views,
        fixture: fixtureFrom(options),
        focus: options.focus,
        look: options.look,
        skill: options.skill,
        shares: options.shares?.map(Number),
      });
    },
    async finish(results, options, session) {
      const runs = results.map(([side, sheet]) => [side.name, sheet]);
      const dir = session.outFor(join('sheets', options.tag));
      mkdirSync(dir, { recursive: true });
      const image = join(dir, 'sheet.png');
      await writeSheet(session.browser, runs, options.views.length, image);
      const notes = runs.map(([name, sheet]) => `${name}, ${sheetNotes(sheet)}`);
      writeFileSync(join(dir, 'notes.txt'), notes.join('\n\n'));
      return `${notes.join('\n\n')}\n\nsheet: ${relative(REPO, image)}`;
    },
    textOf: sheetNotes,
    pictures: picturePairs,
  },

  carry: {
    each(side, options) {
      const canary = Boolean(options.canary);
      return side.command('carry', { fixture: fixtureFrom(options), canary, frames: Boolean(options.frames) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  gait: {
    each(side, options) {
      return side.command('gait', {
        scenarios: options.scenarios,
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
        span: options.span,
        films: options.films !== false,
        offsets: (options.offsets ?? [0]).map(Number),
      });
    },
    check(options) {
      const wrong = (options.offsets ?? []).find((offset) => !Number.isInteger(Number(offset)) || Number(offset) < 0);
      if (wrong !== undefined) throw labError(`gait --offsets: ${wrong} is not a whole number of frames`);
    },
    finish(results, options, session) {
      return textWithSheetEach(results, session.outFor('gait'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    countsOf: (result) => result.counts,
    // (an A/B compares the reports, not the films: two sides' 48 frames each, loaded to compare, took the browser down)
  },

  coop: {
    each(side, options) {
      const { scenarios, ping, jitter } = options;
      return runCoop(side, { scenarios, ping, jitter, pictures: Boolean(options.pictures) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  form: {
    each(side, options) {
      const listed = { canary: Boolean(options.canary), frames: Boolean(options.frames) };
      return side.command('form', { gear: options.gear, ...listed, pictures: options.pictures !== false });
    },
    finish(results, options, session) {
      return textWithSheetsByGroup(results, session.outFor('form'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  stops: {
    each(side, options) {
      const listed = { frames: Boolean(options.frames), trace: Boolean(options.trace) };
      return side.command('stops', { scenarios: options.scenarios, only: options.only, ...listed });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  range: {
    each(side, options) {
      return side.command('range', {
        scenarios: options.scenarios,
        canary: Boolean(options.canary),
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
        span: options.span,
        skill: options.skill,
        gear: options.gear,
        weapon: options.weapon,
      });
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('range'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  feet: {
    each(side, options) {
      return side.command('feet', {
        scenarios: options.scenarios,
        canary: Boolean(options.canary),
        frames: Boolean(options.frames),
        trace: Boolean(options.trace),
      });
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('feet'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  ui: {
    async each(side, options) {
      // (a state at a time, in the order they run: a 4K screen's ten pictures sent back at once closed the browser)
      const states = UI_STATES.filter((state) => options.states.includes(state));
      const reports = [];
      for (const state of states) reports.push(await side.command('ui', { state, hdr: Boolean(options.hdr) }));
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('ui'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  light: {
    check(options) {
      const wrong = options.facings.find((facing) => !Number.isFinite(Number(facing)));
      if (wrong !== undefined) throw labError(`light --facings: ${wrong} is not a number of degrees`);
    },
    async each(side, options) {
      // (a frame at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const scenario of lightScenarios(options)) {
        const canary = Boolean(options.canary) && reports.length === 0;
        const hdr = options.hdr ? { paper: options.paper ?? 1, peak: options.peak ?? 3 } : undefined;
        const command = { scenario, pictures: options.pictures !== false, canary, hdr };
        reports.push(await side.command('light', command));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('light'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  cast: {
    check(options) {
      const wrong = options.times.find((time) => !(Number(time) >= 0));
      if (wrong !== undefined) throw labError(`cast --times: ${wrong} is not a number of seconds`);
      const what = options.what?.map(Number);
      if (what && (what.length !== 3 || what.some((value) => !(value >= 0)))) {
        throw labError(`cast --what: ${options.what.join(',')} is not a moment and a point (s,x,y)`);
      }
    },
    async each(side, options) {
      // (a biome and view at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const scenario of castScenarios(options)) {
        const canary = Boolean(options.canary) && reports.length === 0;
        reports.push(await side.command('cast', { ...scenario, canary }));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor(join('cast', options._[0])));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  health: {
    check(options) {
      const wrong = options.shares.find((share) => !(Number(share) >= 0 && Number(share) <= 1));
      if (wrong !== undefined) throw labError(`health --shares: ${wrong} is not a share from 0 to 1`);
    },
    async each(side, options) {
      // (a frame at a time, each on its own: its pictures sent back with it)
      const reports = [];
      for (const scenario of lightScenarios({ ...options, facings: options.facings.slice(0, 1) })) {
        const canary = Boolean(options.canary) && reports.length === 0;
        const shares = options.shares.map(Number);
        reports.push(await side.command('health', { scenario, shares, pictures: options.pictures !== false, canary }));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('health'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  draw: {
    async each(side, options) {
      // (a view at a time, each set up in it: through the eyes the bow is posed for the view)
      const reports = [];
      for (const view of options.views) {
        const command = {
          fixture: { ...fixtureFrom(options), view },
          pictures: options.pictures !== false,
          canary: Boolean(options.canary),
        };
        reports.push(await side.command('draw', command));
      }
      return {
        text: reports.map((report) => report.text).join('\n'),
        problems: reports.flatMap((report) => report.problems),
        moments: reports.flatMap((report) => report.moments),
      };
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('draw'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  blink: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      return side.command('blink', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('blink'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  death: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skills: options.skills ?? [],
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
        trace: Boolean(options.trace),
      };
      return side.command('death', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('death'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  held: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        pictures: options.pictures !== false,
        canary: Boolean(options.canary),
      };
      return side.command('held', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor('held'));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  gear: {
    check(options) {
      for (const tier of options.tiers) gearTier(tier);
      if (options.sets !== undefined && !(options.sets >= 1)) throw labError('gear --sets: at least 1');
    },
    each(side, options) {
      const command = {
        tiers: options.tiers.map(gearTier),
        sets: Math.round(options.sets ?? GEAR_SETS),
        canary: Boolean(options.canary),
      };
      return side.command('gear', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  crowd: {
    check(options) {
      if (options.count !== undefined && !(options.count >= 1)) throw labError('crowd --count: at least 1');
      for (const rate of options.throttles ?? []) {
        if (!(Number(rate) >= 1)) throw labError(`crowd --throttles: ${rate} is no slowdown (1 or more)`);
      }
      for (const rate of options.rates ?? []) {
        if (!(Number(rate) > 0)) throw labError(`crowd --rates: ${rate} is no frame rate`);
      }
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        count: options.count === undefined ? undefined : Math.round(options.count),
        throttles: options.throttles?.map(Number),
        rates: options.rates?.map(Number),
        skill: options.skill,
        canary: Boolean(options.canary),
      };
      return side.command('crowd', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  draws: {
    check(options) {
      if (options.count !== undefined && !(options.count >= 0)) throw labError('draws --count: 0 or more');
      if (options.rows !== undefined && !(options.rows >= 1)) throw labError('draws --rows: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        count: options.count === undefined ? undefined : Math.round(options.count),
        rows: options.rows === undefined ? undefined : Math.round(options.rows),
        canary: Boolean(options.canary),
      };
      return side.command('draws', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  weapons: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        weapons: options.weapons,
        canary: Boolean(options.canary),
      };
      return side.command('weapons', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('weapons'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  hands: {
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        poses: options.poses,
        views: options.views,
        look: options.look,
        glove: options.glove,
        canary: Boolean(options.canary),
      };
      return side.command('hands', command);
    },
    finish(results, options, session) {
      return textWithMoments(results, session.outFor('hands'), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  eyes: {
    check(options) {
      if (options.times !== undefined && !(options.times >= 1)) throw labError('eyes --times: at least 1');
      if (options.every !== undefined && !(options.every >= 1)) throw labError('eyes --every: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        skill: options._[0],
        times: Math.round(options.times ?? 1),
        every: Math.round(options.every ?? 2),
        film: options.film !== false,
        frames: Boolean(options.frames),
        canary: Boolean(options.canary),
      };
      return side.command('eyes', command);
    },
    finish(results, options, session) {
      return textWithPictureFiles(results, session.outFor(join('eyes', options._[0])));
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  match: {
    check(options) {
      readReference(resolve(options._[0]));
      if (options.screen || options.screens) throw labError('match: the screen is the reference\'s shape; no --screen');
    },
    async each(side, options) {
      await side.showOn(screenFor(readReference(resolve(options._[0]))));
      const fixture = { ...fixtureFrom(options), view: 'first' };
      return side.command('sheet', { states: ['stand'], views: ['eyes'], fixture });
    },
    async finish(results, options, session) {
      const reference = readReference(resolve(options._[0]));
      const runs = results.map(([side, sheet]) => [side.name, sheet]);
      const { text, html } = compare(reference, runs, Boolean(options.canary));
      const dir = session.outFor(join('match', reference.name));
      mkdirSync(dir, { recursive: true });
      const image = join(dir, 'match.png');
      await writeMatch(session.browser, html, runs.length, image);
      return `${text}\n\nmatch: ${relative(REPO, image)}`;
    },
    textOf: sheetNotes,
    pictures: picturePairs,
  },

  shots: {
    check(options) {
      if (options.shots !== undefined && !(options.shots >= 1)) throw labError('shots --shots: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        views: options.views,
        shots: Math.round(options.shots ?? 12),
        canary: Boolean(options.canary),
      };
      return side.command('shots', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  touch: {
    each(side, options) {
      return side.command('touch', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  spawns: {
    check(options) {
      if (options.waves !== undefined && !(options.waves >= 1)) throw labError('spawns --waves: at least 1');
    },
    each(side, options) {
      const command = {
        fixture: fixtureFrom(options),
        biomes: options.biomes,
        waves: Math.round(options.waves ?? SPAWN_WAVES),
        canary: Boolean(options.canary),
      };
      return side.command('spawns', command);
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  music: {
    each(side, options) {
      return side.command('music', { biomes: options.biomes, canary: Boolean(options.canary) });
    },
    textOf: asText,
    problemsOf: problemsIn,
  },

  probe: {
    check(options) {
      probePath(options._[0]);
    },
    async each(side, options) {
      const path = probePath(options._[0]);
      if (!side.isRepo) {
        for (const file of probeFiles(REPO, path)) {
          mkdirSync(dirname(join(side.root, file)), { recursive: true });
          cpSync(join(REPO, file), join(side.root, file));
        }
      }
      const fixture = options.setup === false ? null : fixtureFrom(options);
      return side.probe(path, options, fixture);
    },
    finish(results, options, session) {
      const name = basename(options._[0]).replace(/\.[^.]+$/, '');
      return textWithMoments(results, session.outFor(join('probes', name)), session.browser);
    },
    textOf: asText,
    problemsOf: problemsIn,
    pictures: picturePairs,
  },

  eval: {
    each(side, options) {
      return side.evaluate(options._.join(' '));
    },
    textOf: asText,
  },
};
