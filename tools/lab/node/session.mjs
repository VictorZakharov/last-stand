// The lab's session (tools/lab): the game in a headless browser, served and booted by the lab, every command on a
// page booted for it. This tree is served by a Vite dev server of the lab's own with HMR off, so a probe never meets
// a stale copy of a module (HMR's re-imported copies once gave numbers from code no longer there). With `--ab`,
// another commit is exported and served beside it (side.mjs, commits.mjs).
//
// `npm run lab:serve` keeps a session up between commands (server.mjs); without it, a command opens a session for
// itself and closes it when done.
import { mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { launchBrowser, useLocalTemp } from './browser.mjs';
import { COMMANDS } from './commands.mjs';
import { exportCommit } from './commits.mjs';
import { describeDifferences } from './compare.mjs';
import { labError } from './errors.mjs';
import { OUT, REPO } from './paths.mjs';
import { describePictureDifferences } from './pictures.mjs';
import { probeFiles } from './probeFiles.mjs';
import { profiled, scriptsIn, summarize } from './profile.mjs';
import { Side } from './side.mjs';
import { cacheShown, keep, readKept, sideKey } from './sideCache.mjs';

/** the hero a session boots until a command names another */
const DEFAULT_CLASS = 'ranger';
/** how many of a page's errors and warnings a report shows */
const MESSAGES_SHOWN = 8;

/** The probe a command names, relative to the repo with forward slashes. */
function probeOf(options) {
  return relative(REPO, resolve(REPO, options._[0])).split('\\').join('/');
}

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

export class LabSession {
  /**
   * Opens a session: the browser launched, nothing served or booted until a command needs it. A check's sessions run
   * side by side, each its own `worker` (0 for the one the server keeps), their pages served by the check's servers
   * (`serving`: a side for this tree, and one for the other commit, which serve and boot nothing themselves).
   */
  static async open({ worker = 0, serving = null } = {}) {
    mkdirSync(OUT, { recursive: true });
    useLocalTemp(OUT);
    return new LabSession(await launchBrowser(), worker, serving);
  }

  constructor(browser, worker = 0, serving = null) {
    this.browser = browser;
    this.worker = worker;
    this.serving = serving;
    const servedBy = serving?.repo ?? null;
    this.repoSide = new Side({ name: 'this tree', root: REPO, repo: REPO, outDir: OUT, browser, worker, servedBy });
    this.otherSide = null;
    /** where the commands write their pictures (`outFor`): tools/lab/out, or a check's job's own folder */
    this.outRoot = OUT;
  }

  /** Where a command writes what it pictures, `name` under the session's output (`outRoot`). */
  outFor(name) {
    return join(this.outRoot, name);
  }

  /**
   * Runs one command (`{ command, options }`, as options.mjs reads it) on each side it asks for, each on a page
   * booted for it. Resolves with its report (with `--ab` the other commit's first, then how the two sides differ),
   * the problems that fail it (errors in a page, and what the command's own result reports: a canary missed), and
   * what it counted on each side, for a command that counts (`countsOf`).
   *
   * Each side is the only page open while its turn runs: with two pages alive at once one of them lost the
   * browser's focus (the game lets go of the input on a blur), and a commit compared with itself came out three
   * clip frames apart.
   */
  async run({ command, options = { _: [] } }) {
    if (command === 'status') return { text: this.status(), problems: [] };
    const relaunched = await this.keepBrowser();
    const handler = COMMANDS[command];
    if (!handler) throw labError(`no command ${command} (there are ${Object.keys(COMMANDS).join(', ')}, status)`);
    handler.check?.(options);
    const started = Date.now();
    const shown = [this.repoSide];
    if (options.ab) shown.unshift(await this.sideFor(options.ab === true ? 'origin/main' : options.ab));
    // (this tree's turn first: its page was booted ahead, as the last command finished)
    const turns = [...shown].reverse();
    const heroClass = options.class ?? this.repoSide.heroClass ?? DEFAULT_CLASS;
    const notes = relaunched ? [relaunched] : [];
    const problems = [];
    const resultOf = new Map();
    for (const side of turns) {
      const key = this.keyOf(side, command, options, heroClass);
      const kept = key ? readKept(key) : null;
      if (kept) {
        resultOf.set(side, kept.result);
        notes.push(`${side.name}: as it ran ${kept.ranAt} (kept in ${cacheShown()}; --fresh runs it again)`);
        notes.push(...kept.notes);
        problems.push(...kept.problems);
        continue;
      }
      const sideNotes = [];
      const sideProblems = [];
      for (const other of turns) if (other !== side) await other.closePage();
      const bootStarted = Date.now();
      if (await side.ready(heroClass)) notes.push(`${side.name}: booted the ${heroClass} (${seconds(bootStarted)})`);
      side.used = true;
      const runCommand = () => handler.each(side, options, this);
      if (options.profile) {
        const { result, profile } = await profiled(side.page, runCommand);
        resultOf.set(side, result);
        const sourceOf = await side.sourceLocator(scriptsIn(profile));
        notes.push(`${side.name}: ${summarize(profile, sourceOf)}`);
      } else {
        resultOf.set(side, await runCommand());
      }
      const { errors, warnings } = await side.drainMessages();
      if (errors.length) {
        sideNotes.push(`${side.name}: PAGE ERRORS\n  ${errors.slice(0, MESSAGES_SHOWN).join('\n  ')}`);
        sideProblems.push(`${side.name}: ${errors.length} errors in the page`);
      }
      if (warnings.length) {
        sideNotes.push(`${side.name}: joints past their ranges: ${warnings.slice(0, MESSAGES_SHOWN).join(' | ')}`);
      }
      const found = handler.problemsOf?.(resultOf.get(side)) ?? [];
      for (const problem of found) sideProblems.push(`${side.name}: ${problem}`);
      notes.push(...sideNotes);
      problems.push(...sideProblems);
      // (kept only from a page that raised nothing: a browser that fell over would be read back for good)
      if (key && errors.length === 0) {
        keep(key, { result: resultOf.get(side), notes: sideNotes, problems: sideProblems });
      }
    }
    const results = shown.map((side) => [side, resultOf.get(side)]);
    const textOf = handler.textOf ?? String;
    const text = handler.finish
      ? await handler.finish(results, options, this)
      : results.map(([side, result]) => `${side.name}\n${textOf(result)}`).join('\n\n');
    const verdict = results.length === 2 ? await this.compareSides(command, handler, results) : null;
    const failed = problems.length ? `FAILED: ${problems.join('; ')}` : null;
    const report = [...notes, text, verdict, failed, `(${seconds(started)})`].filter(Boolean).join('\n');
    const counts = handler.countsOf ? results.map(([side, result]) => this.countsOn(side, handler, result)) : [];
    return { text: report, problems, counts };
  }

  /** What a command counted on `side` (`countsOf`), and whether that side is this tree's. */
  countsOn(side, handler, result) {
    return { side: side.name, mine: side === this.repoSide, counts: handler.countsOf(result) ?? {} };
  }

  /**
   * The key the other side of an A/B is kept under (sideCache.mjs), or null for one run afresh: this tree's (it
   * changes as you work), one asked for `--fresh`, and one being profiled.
   */
  keyOf(side, command, options, heroClass) {
    if (side.isRepo || options.fresh || options.profile) return null;
    const extraFiles = command === 'probe' ? probeFiles(REPO, probeOf(options)) : [];
    return sideKey({ sha: side.sha, heroClass, command, options, extraFiles });
  }

  /** What is served and booted, for `lab status`. */
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
   * command that takes pictures, the pictures pixel by pixel, where they differ pictured in `out/ab/<command>`.
   */
  async compareSides(command, handler, [[before, beforeResult], [after, afterResult]]) {
    const textOf = handler.textOf ?? String;
    const lines = [describeDifferences(before.name, textOf(beforeResult), after.name, textOf(afterResult))];
    if (handler.pictures) {
      const pairs = handler.pictures(beforeResult, afterResult);
      lines.push(await describePictureDifferences(this.browser, pairs, this.outFor(join('ab', command))));
    }
    return lines.join('\n');
  }

  /**
   * Boots this tree's page for the next command (the hero of the last one), unless a fresh one is up. Closes the
   * other side's page first: one page alive at a time. Returns what it did, for the server's log.
   */
  async bootNext() {
    await this.keepBrowser();
    await this.otherSide?.closePage();
    const heroClass = this.repoSide.heroClass ?? DEFAULT_CLASS;
    const started = Date.now();
    if (!(await this.repoSide.ready(heroClass))) return null;
    return `booted the ${heroClass} for the next command (${seconds(started)})`;
  }

  /**
   * Launches the browser again if it has closed (it crashed, or was killed): every page, context and command after
   * it failed on the dead one, and only a restart of the server brought the lab back. Returns a note if it did.
   */
  async keepBrowser() {
    if (this.browser.isConnected()) return null;
    this.browser = await launchBrowser();
    for (const side of [this.repoSide, this.otherSide]) side?.useBrowser(this.browser);
    return 'the browser had closed: launched it again';
  }

  async close() {
    await Promise.allSettled([this.repoSide.close(), this.otherSide?.close()]);
    await this.browser.close().catch(() => {});
  }

  /** The other side of an A/B: commit `ref` exported and served (the same one kept while it's asked for again). */
  async sideFor(ref) {
    const { sha, dir } = exportCommit(REPO, OUT, ref);
    const name = `${ref} (${sha.slice(0, 7)})`;
    if (this.otherSide?.sha === sha) {
      // (named as it's asked for this time: the commit asked for as HEAD~1 and, two commits on, as HEAD~3 was still
      // called HEAD~1)
      this.otherSide.name = name;
      return this.otherSide;
    }
    await this.otherSide?.close();
    const worker = this.worker;
    const servedBy = this.serving?.other?.sha === sha ? this.serving.other : null;
    const browser = this.browser;
    this.otherSide = new Side({ name, root: dir, repo: REPO, outDir: OUT, browser, sha, worker, servedBy });
    return this.otherSide;
  }
}
