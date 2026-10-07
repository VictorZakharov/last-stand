// The lab's session (tools/lab): the game in a headless browser, served and booted by the lab, every command on a
// page booted for it. This tree is served by a Vite dev server of the lab's own with HMR off, so a probe never meets
// a stale copy of a module (HMR's re-imported copies once gave numbers from code no longer there). With `--ab`,
// another commit is exported and served beside it (side.mjs).
//
// `npm run lab:serve` keeps a session up between commands (`serve`), and boots the next command's page as each
// command finishes and as the source changes, so a command finds one ready and takes seconds instead of a boot.
// Without it, a command opens a session for itself and closes it when done.
import http from 'node:http';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, useLocalTemp } from './browser.mjs';
import { describeDifferences } from './compare.mjs';
import { describePictureDifferences } from './pictures.mjs';
import { profiled } from './profile.mjs';
import { Side, exportCommit } from './side.mjs';
import { writeSheet } from './sheetImage.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT = resolve(HERE, '../out');
/**
 * The server's note of itself while it runs: its process and the one watching it (`node --watch` in `lab:serve`),
 * so the command line can tell a server restarting from none at all.
 */
export const SERVER_NOTE = join(OUT, 'server.json');
const DEFAULT_CLASS = 'ranger';
const DEFAULT_STATES = 'stand,walk';
const DEFAULT_VIEWS = 'lobby,top,third,front,left,back';
/** how long the source must be left alone after a change before the next page boots, ms (edits come in bursts) */
const EDITS_SETTLE_MS = 800;

/** A comma-separated option as a list. */
function listOption(value, fallback) {
  return String(value ?? fallback).split(',').filter(Boolean);
}

/** The fixture options a command takes (page/lab.ts `Fixture`). */
function fixtureFrom(options) {
  const fixture = {};
  if (options.view) fixture.view = options.view;
  if (options.at) fixture.at = String(options.at).split(',').map(Number);
  if (options.facing !== undefined) fixture.facing = Number(options.facing);
  if (options.nocked !== undefined) fixture.nocked = options.nocked !== 'false' && options.nocked !== false;
  return fixture;
}

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

/** A sheet's notes as text: how it was set up, then each moment's notes. */
function sheetNotes(sheet) {
  const moments = sheet.moments.map((moment) => {
    const lines = moment.notes.map((note) => `    ${note}`);
    return `  ${moment.label}\n${lines.join('\n')}`;
  });
  return `set up as ${JSON.stringify(sheet.setup)}\n${moments.join('\n')}`;
}

/** The pictures two sheets took of the same moment from the same view, paired, each pair named for the verdict. */
function picturePairs(before, after) {
  const pairs = [];
  for (const moment of after.moments) {
    const other = before.moments.find((candidate) => candidate.label === moment.label);
    if (!other) continue;
    for (const tile of moment.tiles) {
      const match = other.tiles.find((candidate) => candidate.view === tile.view);
      if (match) pairs.push({ name: `${moment.label} / ${tile.view}`, before: match.png, after: tile.png });
    }
  }
  return pairs;
}

export class LabSession {
  /** Opens a session: the browser launched, nothing served or booted until a command needs it. */
  static async open() {
    mkdirSync(OUT, { recursive: true });
    useLocalTemp(OUT);
    return new LabSession(await launchBrowser());
  }

  constructor(browser) {
    this.browser = browser;
    this.repoSide = new Side({ name: 'this tree', root: REPO, repo: REPO, outDir: OUT, browser });
    this.otherSide = null;
  }

  /**
   * Runs one command on each side it asks for, each on a page booted for it, and reports what it returned (with
   * `--ab` the other commit's first), any page errors and warnings, and with `--ab` how the two sides differ. Each
   * side is the only page open while its turn runs: with two pages alive at once one of them lost the browser's
   * focus (the game lets go of the input on a blur), and a commit compared with itself came out three clip frames
   * apart.
   */
  async run({ command, options = {} }) {
    const handler = this.commands[command];
    if (!handler) throw new Error(`no command ${command} (there are ${Object.keys(this.commands).join(', ')})`);
    const started = Date.now();
    if (command === 'status') return this.status();
    const shown = [this.repoSide];
    if (options.ab) shown.unshift(await this.sideFor(options.ab === true ? 'origin/main' : String(options.ab)));
    // (this tree's turn first: its page was booted ahead, as the last command finished)
    const turns = [...shown].reverse();
    const heroClass = options.class ?? this.repoSide.heroClass ?? DEFAULT_CLASS;
    const notes = [];
    const resultOf = new Map();
    for (const side of turns) {
      for (const other of turns) if (other !== side) await other.closePage();
      const bootStarted = Date.now();
      if (await side.ready(heroClass)) notes.push(`${side.name}: booted the ${heroClass} (${seconds(bootStarted)})`);
      side.used = true;
      const runCommand = () => handler.each.call(this, side, options);
      if (options.profile) {
        const { result, summary } = await profiled(side.page, runCommand);
        resultOf.set(side, result);
        notes.push(`${side.name}: ${summary}`);
      } else {
        resultOf.set(side, await runCommand());
      }
      const { errors, warnings } = await side.drainMessages();
      if (errors.length) notes.push(`${side.name}: PAGE ERRORS\n  ${errors.slice(0, 8).join('\n  ')}`);
      if (warnings.length) notes.push(`${side.name}: joints past their ranges: ${warnings.slice(0, 8).join(' | ')}`);
    }
    const results = shown.map((side) => [side, resultOf.get(side)]);
    const text = handler.finish
      ? await handler.finish.call(this, results, options)
      : results.map(([side, result]) => `${side.name}\n${result}`).join('\n\n');
    const verdict = results.length === 2 ? await this.compareSides(handler, results) : null;
    return [...notes, text, verdict, `(${seconds(started)})`].filter(Boolean).join('\n');
  }

  status() {
    const lines = [this.repoSide, this.otherSide].filter(Boolean).map((side) => {
      if (!side.page) return `${side.name}: ${side.url ?? 'not served yet'}`;
      const state = side.isFresh(side.heroClass) ? 'booted for the next command' : 'used (the next command boots)';
      return `${side.name}: ${side.url}, the ${side.heroClass} ${state}`;
    });
    return lines.join('\n') || 'nothing served yet';
  }

  /**
   * The A/B's verdict on its two sides' results (the other commit's first): their reports line by line, and with a
   * command that takes pictures, the pictures pixel by pixel.
   */
  async compareSides(handler, [[before, beforeResult], [after, afterResult]]) {
    const textOf = handler.compared ?? String;
    const lines = [describeDifferences(before.name, textOf(beforeResult), after.name, textOf(afterResult))];
    if (handler.pictures) {
      const pairs = handler.pictures(beforeResult, afterResult);
      lines.push(await describePictureDifferences(this.browser, pairs));
    }
    return lines.join('\n');
  }

  /**
   * Boots this tree's page for the next command (the hero of the last one), unless a fresh one is up. Closes the
   * other side's page first: one page alive at a time. Returns what it did, for the server's log.
   */
  async bootNext() {
    await this.otherSide?.closePage();
    const heroClass = this.repoSide.heroClass ?? DEFAULT_CLASS;
    const started = Date.now();
    if (!(await this.repoSide.ready(heroClass))) return null;
    return `booted the ${heroClass} for the next command (${seconds(started)})`;
  }

  async close() {
    await Promise.allSettled([this.repoSide.close(), this.otherSide?.close()]);
    await this.browser.close().catch(() => {});
  }

  /** The other side of an A/B: commit `ref` exported and served (the same one kept while it's asked for again). */
  async sideFor(ref) {
    const { sha, dir } = exportCommit(REPO, OUT, ref);
    if (this.otherSide?.sha === sha) return this.otherSide;
    await this.otherSide?.close();
    const name = `${ref} (${sha.slice(0, 7)})`;
    this.otherSide = new Side({ name, root: dir, repo: REPO, outDir: OUT, browser: this.browser, sha });
    return this.otherSide;
  }

  /**
   * The commands: `each` runs on one side (its page booted) and returns its result; `finish`, when there is one,
   * puts the sides' results together (else each side's text is shown under its name); `compared`, when the result
   * isn't text, is what an A/B compares of it, and `pictures` pairs the pictures an A/B compares.
   */
  commands = {
    status: { each: () => '' },

    sheet: {
      each(side, options) {
        return side.command('sheet', {
          states: listOption(options.states, DEFAULT_STATES),
          views: listOption(options.views, DEFAULT_VIEWS),
          fixture: fixtureFrom(options),
          focus: options.focus,
        });
      },
      async finish(results, options) {
        const runs = results.map(([side, sheet]) => [side.name, sheet]);
        const dir = join(OUT, 'sheets', String(options.tag ?? 'latest'));
        mkdirSync(dir, { recursive: true });
        const image = join(dir, 'sheet.png');
        await writeSheet(this.browser, runs, listOption(options.views, DEFAULT_VIEWS).length, image);
        const notes = runs.map(([name, sheet]) => `${name}, ${sheetNotes(sheet)}`);
        writeFileSync(join(dir, 'notes.txt'), notes.join('\n\n'));
        return `${notes.join('\n\n')}\n\nsheet: ${relative(REPO, image)}`;
      },
      compared: sheetNotes,
      pictures: picturePairs,
    },

    carry: {
      each(side, options) {
        return side.command('carry', { fixture: fixtureFrom(options), canary: Boolean(options.canary) });
      },
    },

    probe: {
      async each(side, options) {
        const file = options._[0];
        if (!file) throw new Error('probe: which module? (a file under the repo; its default export takes the lab)');
        const path = relative(REPO, resolve(REPO, file)).split('\\').join('/');
        if (path.startsWith('..')) throw new Error('probe: the module must be under the repo');
        if (!side.isRepo) cpSync(join(REPO, path), join(side.root, path));
        const fixture = options.setup === false ? null : fixtureFrom(options);
        const result = await side.probe(path, options, fixture);
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      },
    },

    eval: {
      async each(side, options) {
        const result = await side.evaluate(options._.join(' '));
        return JSON.stringify(result, null, 2);
      },
    },
  };
}

/** Logs a line under the time it happened, the machine's own (hh:mm:ss). */
function log(message) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${message}`);
}

/** Work run one piece at a time, in the order it came: the commands, and the boots between them. */
class Queue {
  tail = Promise.resolve();

  /** Runs `work` once everything added before it is done; resolves or rejects as it does. */
  add(work) {
    const job = this.tail.then(work);
    this.tail = job.catch(() => {});
    return job;
  }
}

function reply(response, body) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

/**
 * Keeps a session up between commands, answering them over HTTP on 127.0.0.1:`port`, one at a time in the order
 * they came, and boots the next command's page between them. Runs until stopped (Ctrl+C, or `lab stop`).
 */
export async function serve(port) {
  const session = await LabSession.open();
  const queue = new Queue();
  const bootNext = () => queue.add(() => session.bootNext()).then(
    (message) => message && log(message),
    (error) => log(`booting the next page failed: ${error?.message ?? error}`),
  );
  bootNext();
  let editsSettling = null;
  session.repoSide.onStale = () => {
    clearTimeout(editsSettling);
    editsSettling = setTimeout(bootNext, EDITS_SETTLE_MS);
  };
  /** Stops, closing the browser and the Vite servers; the note stays when `node --watch` is restarting the server. */
  const stop = async ({ restarting = false } = {}) => {
    log(restarting ? 'restarting' : 'stopping');
    if (!restarting) rmSync(SERVER_NOTE, { force: true });
    await session.close();
    process.exit(0);
  };
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop({ restarting: true }));
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      if (request.url === '/ping') return reply(response, { ok: true });
      if (request.url === '/stop') {
        reply(response, { ok: true, text: 'the lab server stopped' });
        setTimeout(() => stop(), 50);
        return;
      }
      const job = queue.add(() => {
        const call = JSON.parse(body || '{}');
        log(`${call.command} ${JSON.stringify(call.options ?? {})}`);
        return session.run(call);
      });
      job.finally(bootNext).catch(() => {});
      job.then(
        (text) => reply(response, { ok: true, text }),
        (error) => {
          log(String(error?.stack ?? error));
          reply(response, { ok: false, text: String(error?.message ?? error) });
        },
      );
    });
  });
  server.listen(port, '127.0.0.1', () => {
    writeFileSync(SERVER_NOTE, JSON.stringify({ pid: process.pid, watcher: process.ppid, port }));
    log(`the lab is serving on 127.0.0.1:${port}; Ctrl+C stops it`);
  });
}
