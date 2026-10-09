// The other side of an A/B, kept (tools/lab): what a commit computes for a command can't change while the commit, the
// lab's code it runs (its page modules, copied into the exported tree, and this Node side) and the command's options
// stay the same, as a commit run against itself agrees line for line. So it runs once and is read back after
// (`out/ab-cache`): run each time, main's side was half of every A/B, the same results again and again.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OUT, REPO } from './paths.mjs';

/** where the kept results are */
export const CACHE_DIR = join(OUT, 'ab-cache');
/**
 * the lab's code that decides what an exported side computes, a change in which runs the side afresh: its page
 * modules, how a command's options become the page's (`commands.mjs`, co-op's own), and how a page is booted (its
 * cookies, its viewport, the scripts run before the game's: the clock, the random numbers). The rest of the Node side
 * (the session, the server, a check, this cache) runs it the same whatever it is: in the key, every edit to it ran
 * main's side again.
 */
const LAB_CODE = [
  'tools/lab/page',
  'tools/lab/node/commands.mjs',
  'tools/lab/node/coop.mjs',
  'tools/lab/node/coopJudge.mjs',
  'tools/lab/node/side.mjs',
  'tools/lab/node/browser.mjs',
];
/** the options that don't change what a side computes: the A/B itself, how the command is run and shown */
const UNKEYED = new Set(['ab', 'profile', 'watch', 'fresh']);

const toSlashes = (path) => path.split('\\').join('/');

/** Every file under `path` (itself, when it's a file), relative to the repo with forward slashes, sorted. */
function filesUnder(path) {
  const full = join(REPO, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [toSlashes(path)];
  const entries = readdirSync(full, { withFileTypes: true });
  return entries.flatMap((entry) => filesUnder(join(path, entry.name))).sort();
}

/** A hash of the files `paths` name (folders whole), by their paths and contents. */
export function stampOf(paths) {
  const hash = createHash('sha1');
  for (const file of paths.flatMap(filesUnder)) {
    hash.update(file);
    hash.update(readFileSync(join(REPO, file)));
  }
  return hash.digest('hex');
}

/** The options as they bear on what a side computes: those that do, sorted by name. */
export function keyedOptions(options) {
  const names = Object.keys(options).filter((name) => !UNKEYED.has(name)).sort();
  return names.map((name) => [name, options[name]]);
}

/**
 * The key a side's result is kept under: its commit, the hero, the command and its options, and a stamp of the code
 * it ran besides its commit's own (the lab's, and a probe's own files, `extraFiles`).
 */
export function sideKey({ sha, heroClass, command, options, extraFiles = [] }) {
  const parts = {
    sha,
    heroClass,
    command,
    options: keyedOptions(options),
    code: stampOf([...LAB_CODE, ...extraFiles]),
  };
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 20);
}

/** What was kept under `key`: `{ result, notes, problems, ranAt }`, or null. */
export function readKept(key) {
  const file = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Keeps a side's run under `key`: its result, the notes its page left (errors, warnings) and its problems. */
export function keep(key, { result, notes, problems }) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry = { result, notes, problems, ranAt: new Date().toISOString() };
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry));
}

/** Where the cache is, for a note: relative to the repo. */
export const cacheShown = () => toSlashes(relative(REPO, CACHE_DIR));
