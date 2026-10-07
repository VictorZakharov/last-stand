// The lab's session (tools/lab): the game in a headless browser, served and booted by the lab, every command on a
// page booted for it. This tree is served by a Vite dev server of the lab's own with HMR off, so a probe never meets
// a stale copy of a module (HMR's re-imported copies once gave numbers from code no longer there). With `--ab`,
// another commit is exported and served beside it (side.mjs, commits.mjs).
//
// `npm run lab:serve` keeps a session up between commands (server.mjs); without it, a command opens a session for
// itself and closes it when done.
import { mkdirSync } from 'node:fs';
import { launchBrowser, useLocalTemp } from './browser.mjs';
import { COMMANDS } from './commands.mjs';
import { exportCommit } from './commits.mjs';
import { describeDifferences } from './compare.mjs';
import { labError } from './errors.mjs';
import { OUT, REPO } from './paths.mjs';
import { describePictureDifferences } from './pictures.mjs';
import { profiled, scriptsIn, summarize } from './profile.mjs';
import { Side } from './side.mjs';

/** the hero a session boots until a command names another */
const DEFAULT_CLASS = 'ranger';
/** how many of a page's errors and warnings a report shows */
const MESSAGES_SHOWN = 8;

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
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
   * Runs one command (`{ command, options }`, as options.mjs reads it) on each side it asks for, each on a page
   * booted for it. Resolves with its report (with `--ab` the other commit's first, then how the two sides differ),
   * and the problems that fail it: errors in a page, and what the command's own result reports (a canary missed).
   *
   * Each side is the only page open while its turn runs: with two pages alive at once one of them lost the
   * browser's focus (the game lets go of the input on a blur), and a commit compared with itself came out three
   * clip frames apart.
   */
  async run({ command, options = { _: [] } }) {
    if (command === 'status') return { text: this.status(), problems: [] };
    const handler = COMMANDS[command];
    if (!handler) throw labError(`no command ${command} (there are ${Object.keys(COMMANDS).join(', ')}, status)`);
    handler.check?.(options);
    const started = Date.now();
    const shown = [this.repoSide];
    if (options.ab) shown.unshift(await this.sideFor(options.ab === true ? 'origin/main' : options.ab));
    // (this tree's turn first: its page was booted ahead, as the last command finished)
    const turns = [...shown].reverse();
    const heroClass = options.class ?? this.repoSide.heroClass ?? DEFAULT_CLASS;
    const notes = [];
    const problems = [];
    const resultOf = new Map();
    for (const side of turns) {
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
        notes.push(`${side.name}: PAGE ERRORS\n  ${errors.slice(0, MESSAGES_SHOWN).join('\n  ')}`);
        problems.push(`${side.name}: ${errors.length} errors in the page`);
      }
      if (warnings.length) {
        notes.push(`${side.name}: joints past their ranges: ${warnings.slice(0, MESSAGES_SHOWN).join(' | ')}`);
      }
      for (const problem of handler.problemsOf?.(resultOf.get(side)) ?? []) problems.push(`${side.name}: ${problem}`);
    }
    const results = shown.map((side) => [side, resultOf.get(side)]);
    const textOf = handler.textOf ?? String;
    const text = handler.finish
      ? await handler.finish(results, options, this)
      : results.map(([side, result]) => `${side.name}\n${textOf(result)}`).join('\n\n');
    const verdict = results.length === 2 ? await this.compareSides(handler, results) : null;
    const failed = problems.length ? `FAILED: ${problems.join('; ')}` : null;
    const report = [...notes, text, verdict, failed, `(${seconds(started)})`].filter(Boolean).join('\n');
    return { text: report, problems };
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
   * command that takes pictures, the pictures pixel by pixel.
   */
  async compareSides(handler, [[before, beforeResult], [after, afterResult]]) {
    const textOf = handler.textOf ?? String;
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
}
