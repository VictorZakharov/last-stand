// `lab check` (tools/lab): the measures a change to how the heroes move is checked by, every hero's, run side by side
// in sessions of their own, each against another commit (`--ab`) whose side is read back from the cache once it has
// run (sideCache.mjs). One command at a time, both sides run every time, the mage's cape stepped all along and each
// gait scenario run again for a film, the same check took 31 to 35 minutes a round; it is run hundreds of times.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cpus } from 'node:os';
import { exportCommit } from './commits.mjs';
import { describeError } from './errors.mjs';
import { COMMANDS } from './options.mjs';
import { OUT, REPO } from './paths.mjs';
import { LabSession } from './session.mjs';
import { Side, copyLabPage } from './side.mjs';

/** where a check writes: each job's report, its pictures in a folder of its own, and the jobs' last durations */
export const CHECK_DIR = join(OUT, 'check');
const DURATIONS = join(CHECK_DIR, 'durations.json');
/** the heroes checked by default */
export const CHECK_CLASSES = ['warrior', 'mage', 'ranger'];
/**
 * The commands checked by default and the heroes each is for (all of `classes` when it names none): as AGENTS.md
 * checks a change to the walk or the run (the gait, the stops, every joint's range and the run's form for every hero,
 * the ranger's feet and carried bow).
 */
export const CHECK_PLAN = { gait: null, stops: null, range: null, form: null, feet: ['ranger'], carry: ['ranger'] };
/** each command's options in a check: the gait's steps listed, and no films (a check reads the numbers) */
const CHECK_OPTIONS = { gait: { frames: true, films: false } };
/**
 * the commands run a scenario a job, each on a page booted for it: run one after another on one page, each scenario
 * set up from where the last had left the hero and the game's clock, and the gait's numbers of one scenario (its
 * gallops above all) moved with what ran before it, by as much as a change being judged moved them
 */
export const CHECK_SPLIT = new Set(['gait']);
/**
 * how many frames longer a split command's scenarios' first moves last (`--offset`), as many of them as `--starts`
 * asks for, so every later change of way comes at another point of a stride: run so once alone, a frame's change
 * anywhere sent every later stride of a scenario elsewhere, and a change's gallops came out 2 or 3 either way over
 * a check's gait scenarios by chance; over several, the chance averages out
 */
export const CHECK_OFFSETS = [0, 7, 13, 19, 29];
/** how many of `CHECK_OFFSETS` a check starts each split scenario from, by default */
const CHECK_STARTS = 3;
/** the most sessions side by side: each is a browser and a Vite server or two, and a page's frames take a core */
const MOST_WORKERS = 8;

/** The scenarios a command runs, by name, as its options list them. */
export function scenariosOf(command) {
  return COMMANDS[command]?.options.scenarios?.choices ?? [];
}

/**
 * One job: a command for a hero (one of its scenarios, `part`, stood `offset` frames first), its options, its name
 * (where its report goes) and its group's (the command and hero, whose parts' reports make one).
 */
function jobOf(command, heroClass, base, part = null, offset = 0) {
  const options = { _: [], ...CHECK_OPTIONS[command], ...base, class: heroClass };
  const group = `${command}-${heroClass}`;
  if (!part) return { command, heroClass, options, name: group, group };
  const name = offset ? `${group}-${part}+${offset}` : `${group}-${part}`;
  return { command, heroClass, options: { ...options, scenarios: [part], offset }, name, group, part, offset };
}

/** The offsets a split command's scenarios start from, as many as `starts` asks (all there are at most). */
export function offsetsOf(starts = CHECK_STARTS) {
  return CHECK_OFFSETS.slice(0, Math.max(1, Math.min(CHECK_OFFSETS.length, starts)));
}

/** The jobs `options` asks for: each command of the plan (or `--commands`) for each of its heroes. */
export function jobsOf(options, plan = CHECK_PLAN) {
  const classes = options.classes ?? CHECK_CLASSES;
  const commands = options.commands ?? Object.keys(plan);
  const base = {};
  if (options.ab) base.ab = options.ab;
  if (options.fresh) base.fresh = true;
  const jobs = [];
  for (const command of commands) {
    const heroes = (plan[command] ?? classes).filter((hero) => classes.includes(hero));
    const parts = CHECK_SPLIT.has(command) ? scenariosOf(command) : [null];
    const offsets = CHECK_SPLIT.has(command) ? offsetsOf(options.starts) : [0];
    for (const heroClass of heroes) {
      for (const part of parts) for (const offset of offsets) jobs.push(jobOf(command, heroClass, base, part, offset));
    }
  }
  return jobs;
}

/** The jobs' durations as the last check found them (s, by name). */
function lastDurations() {
  if (!existsSync(DURATIONS)) return {};
  try {
    return JSON.parse(readFileSync(DURATIONS, 'utf8'));
  } catch {
    return {};
  }
}

/** The jobs longest first, as they last took (an unknown one first of all): the last to start is a short one. */
export function longestFirst(jobs, durations) {
  const cost = (job) => durations[job.name] ?? Infinity;
  return [...jobs].sort((a, b) => cost(b) - cost(a));
}

/** `ab`'s commit resolved and exported once, its lab page copied in, before the sessions start side by side. */
function prepareOtherSide(ab) {
  if (!ab) return null;
  const { sha, dir } = exportCommit(REPO, OUT, ab === true ? 'origin/main' : ab);
  copyLabPage(REPO, dir);
  return { sha, dir };
}

/** the worker name of a check's servers: their Vite caches (`vite-check`, `.lab-vite-check`) */
const SERVING = 'check';

/**
 * The check's servers, one a side, which every session's pages are served by (each started as a page first needs it):
 * this tree's, and the other commit's. Their Vite caches are seeded from the lab server's, when they have none yet:
 * started empty, a first boot bundles the game's packages again.
 */
function servingSides(other) {
  const seeds = [[join(OUT, 'vite'), join(OUT, `vite-${SERVING}`)]];
  if (other) seeds.push([join(other.dir, '.lab-vite'), join(other.dir, `.lab-vite-${SERVING}`)]);
  for (const [from, to] of seeds) if (existsSync(from) && !existsSync(to)) cpSync(from, to, { recursive: true });
  const common = { repo: REPO, outDir: OUT, browser: null, worker: SERVING };
  const repo = new Side({ name: 'this tree', root: REPO, ...common });
  const otherSide = other ? new Side({ name: other.sha, root: other.dir, sha: other.sha, ...common }) : null;
  return { repo, other: otherSide };
}

/** A line of the check's log, under the time since it started (mm:ss). */
function logLine(started, text) {
  const seconds = Math.round((Date.now() - started) / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  console.log(`[${clock}] ${text}`);
}

/** Each side's counts added up over `results` (a job's, or a split command's parts): this tree's, the other's. */
export function countsOver(results) {
  const sums = { mine: {}, other: {} };
  for (const result of results) {
    for (const { mine, counts } of result.counts ?? []) {
      const sum = mine ? sums.mine : sums.other;
      for (const [name, count] of Object.entries(counts)) sum[name] = (sum[name] ?? 0) + count;
    }
  }
  return sums;
}

/** The counts in a line, each this tree's with the other side's after it (`other`, its name), or '' if none. */
export function countsLine(sums, other) {
  const names = Object.keys({ ...sums.mine, ...sums.other });
  const shown = names.map((name) => {
    const theirs = name in sums.other ? ` (${other} ${sums.other[name]})` : '';
    return `${name} ${sums.mine[name] ?? 0}${theirs}`;
  });
  return shown.join(', ');
}

/** The short name of a job's other side, as its counts are shown. */
function otherName(job) {
  return String(job.options.ab ?? 'the other').slice(0, 7);
}

/** What a job's report says in one line: its time, the A/B's verdict, its counts, and whether it failed. */
function verdictOf(job, result) {
  const verdict = result.text.match(/^A\/B: .*$/m)?.[0] ?? '';
  const counts = countsLine(countsOver([result]), otherName(job));
  const state = result.ok ? 'ok' : 'FAILED';
  const tail = [verdict, counts].filter(Boolean).map((part) => `; ${part}`).join('');
  return `${job.name}: ${state} in ${result.seconds.toFixed(0)} s${tail}`;
}

/** Runs `job` on `session`, its pictures in its own folder; writes a whole job's report, logs its line. */
async function runJob(session, job, started) {
  const jobStarted = Date.now();
  session.outRoot = join(CHECK_DIR, job.name);
  let text;
  let ok;
  let counts = [];
  try {
    const ran = await session.run({ command: job.command, options: job.options });
    text = ran.text;
    ok = ran.problems.length === 0;
    counts = ran.counts;
  } catch (error) {
    text = describeError(error);
    ok = false;
  }
  const seconds = (Date.now() - jobStarted) / 1000;
  const result = { job, seconds, ok, text, counts };
  if (!job.part) {
    writeFileSync(join(CHECK_DIR, `${job.name}.txt`), text);
    logLine(started, verdictOf(job, result));
  }
  return result;
}

/**
 * A joined report's head: its counts over all its parts, then each scenario's over the moments it started from (none
 * when nothing was counted).
 */
function countsHead(parts, other) {
  const counts = countsLine(countsOver(parts), other);
  if (!counts) return [];
  const scenarios = [...new Set(parts.map((part) => part.job.part))];
  const starts = parts.length / scenarios.length;
  const each = scenarios.map((scenario) => {
    const its = parts.filter((part) => part.job.part === scenario);
    return `  ${scenario}: ${countsLine(countsOver(its), other) || 'nothing'}`;
  });
  return [[`over its ${scenarios.length} scenarios from ${starts} starts each: ${counts}`, ...each].join('\n')];
}

/** A part's heading in a joined report: its scenario, and how much longer its first move lasted if it did. */
function partHeading(job) {
  return job.offset ? `=== ${job.part}, its first move ${job.offset} frames longer` : `=== ${job.part}`;
}

/** How many lines an A/B's verdict says differ (0 when the sides agree). */
function differing(text) {
  return Number(text.match(/^A\/B: (\d+) lines differ/m)?.[1] ?? 0);
}

/**
 * Each split command's parts put back together, a report a group (its counts over all its parts and each part's,
 * then the parts' reports in the scenarios' order, each under its scenario), and the group's line logged: its time in
 * all, the lines its A/Bs found differing, and its counts.
 */
function joinParts(done, started) {
  const groups = new Map();
  for (const result of done.filter((each) => each.job.part)) {
    const parts = groups.get(result.job.group) ?? [];
    parts.push(result);
    groups.set(result.job.group, parts);
  }
  for (const [group, parts] of groups) {
    const order = scenariosOf(parts[0].job.command);
    parts.sort((a, b) => order.indexOf(a.job.part) - order.indexOf(b.job.part) || a.job.offset - b.job.offset);
    const other = otherName(parts[0].job);
    const counts = countsLine(countsOver(parts), other);
    const head = countsHead(parts, other);
    const text = [...head, ...parts.map((part) => `${partHeading(part.job)}\n${part.text}`)].join('\n\n');
    writeFileSync(join(CHECK_DIR, `${group}.txt`), text);
    const seconds = parts.reduce((sum, part) => sum + part.seconds, 0);
    const failed = parts.filter((part) => !part.ok).map((part) => part.job.name.slice(group.length + 1));
    const state = failed.length ? `FAILED (${failed.join(', ')})` : 'ok';
    const lines = parts.reduce((sum, part) => sum + differing(part.text), 0);
    const tail = [`A/B: ${lines} lines differ`, counts].filter(Boolean).join('; ');
    logLine(started, `${group}: ${state}, ${parts.length} runs in ${seconds.toFixed(0)} s; ${tail}`);
  }
}

/** A session working through the queue of jobs until it's empty, its pages served by `serving`. */
async function work(worker, serving, queue, started, done) {
  const session = await LabSession.open({ worker, serving });
  try {
    for (let job = queue.shift(); job; job = queue.shift()) done.push(await runJob(session, job, started));
  } finally {
    await session.close();
  }
}

/**
 * `lab check`: the jobs run side by side in `--jobs` sessions (as many as there are jobs, up to `MOST_WORKERS` and a
 * core in three), longest first; each report in out/check/<command>-<hero>.txt. Returns the exit status.
 */
export async function runCheck(options) {
  const started = Date.now();
  mkdirSync(CHECK_DIR, { recursive: true });
  const other = prepareOtherSide(options.ab);
  const sha = other?.sha;
  const jobs = jobsOf(sha ? { ...options, ab: sha } : options);
  const queue = longestFirst(jobs, lastDurations());
  const workers = Math.min(options.jobs ?? Math.min(MOST_WORKERS, Math.ceil(cpus().length / 3)), queue.length);
  const serving = servingSides(other);
  logLine(started, `${queue.length} jobs in ${workers} sessions${sha ? `, against ${sha.slice(0, 7)}` : ''}`);
  const done = [];
  try {
    await Promise.all(Array.from({ length: workers }, (_, index) => work(index + 1, serving, queue, started, done)));
  } finally {
    await Promise.allSettled([serving.repo.server?.close(), serving.other?.server?.close()]);
  }
  joinParts(done, started);
  const durations = { ...lastDurations() };
  for (const { job, seconds } of done) durations[job.name] = Math.round(seconds);
  writeFileSync(DURATIONS, JSON.stringify(durations, null, 2));
  const failed = done.filter((result) => !result.ok);
  const shown = relative(REPO, CHECK_DIR).split('\\').join('/');
  logLine(started, `done: ${done.length - failed.length} ok, ${failed.length} failed; the reports in ${shown}`);
  return failed.length ? 1 : 0;
}
