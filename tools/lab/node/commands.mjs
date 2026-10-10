// The lab's commands as the session runs them (tools/lab): each one's work on a side, how the sides' results are
// put together and compared, and the problems a result reports. Their options are read and checked by options.mjs.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { runCoop } from './coop.mjs';
import { labError } from './errors.mjs';
import { REPO } from './paths.mjs';
import { probeFiles } from './probeFiles.mjs';
import { writeSheet } from './sheetImage.mjs';

/** The set-up a command asks for (page/lab.ts `Fixture`), from its options. */
function fixtureFrom(options) {
  const fixture = {};
  if (options.view !== undefined) fixture.view = options.view;
  if (options.at !== undefined) fixture.at = options.at;
  if (options.facing !== undefined) fixture.facing = options.facing;
  if (options.nocked !== undefined) fixture.nocked = options.nocked;
  if (options.capes !== undefined) fixture.capes = options.capes;
  return fixture;
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
 * this tree's, `film-main-1.png` on for the other side's. For films: two sides' in one sheet, or eight scenarios' of
 * one side, were a page too big for the browser, which closed.
 */
async function textWithSheetEach(results, dir, browser) {
  const text = results.map(([side, result]) => `${side.name}\n${asText(result)}`).join('\n\n');
  const images = [];
  for (const [side, result] of results) {
    const prefix = side.isRepo ? 'film-' : 'film-main-';
    const moments = result?.moments ?? [];
    for (const [index, moment] of moments.entries()) {
      const one = [side, { ...result, moments: [moment] }];
      const image = await writeMoments([one], dir, browser, `${prefix}${index + 1}.png`);
      if (image) images.push(relative(REPO, image));
    }
  }
  return images.length ? `${text}\n\npictures: ${images.join(', ')}` : text;
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
 *   side's text is shown under its name);
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
        offset: options.offset ?? 0,
      });
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
