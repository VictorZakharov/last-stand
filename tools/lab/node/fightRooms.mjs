// `lab fight`'s measure: the fight's server build (server/fight) run as the dedicated server will run it, rooms each in
// a worker thread of their own, each a battleground built as the game builds it and fought at the server's tick: a
// crowd of one foe round the hero, or a run from a wave (`--wave`), the party's hits dealt as the guests' come to the
// host. Says what a room costs (its load, its build, its step's time, its memory) and that it fought (a crowd came to
// the hero; a run cleared waves), with a canary room that must not (a crowd with no hero; a run no one strikes in).
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
import { REPO } from './paths.mjs';

const run = promisify(execFile);
const MB = 1e6;

/** the server's build of the fight, and the config that makes it */
export const FIGHT_BUNDLE = join(REPO, 'server/fight/dist/fight.js');
const FIGHT_CONFIG = join(REPO, 'server/fight/vite.config.ts');
const ROOM_WORKER = new URL('./fightRoom.worker.mjs', import.meta.url);

/** the server's tick (s): the snapshots' rate, 20 a second */
export const TICK = 1 / 20;
/** where the hero stands in a room (m): the arena's middle */
const HERO_AT = [0, 0];
/** the foes that walk up to a hero, of each battleground (what `cameNear` is judged on) */
export const MELEE_FOE = { forest: 'thornling', crypt: 'husk' };
/** a room's worker's heap, capped as the server will cap it (MB): a room keeps some 35 MB, and its battleground's build
 *  makes some 100 of garbage. Uncapped, V8 kept what the build had used: the process held 178 MB a room, 54 capped,
 *  each room's step as quick. */
export const ROOM_LIMITS = { maxYoungGenerationSizeMb: 8, maxOldGenerationSizeMb: 96 };
/** the share of a room's foes alive that must have come to its hero (one may be caught behind a prop, as in play) */
export const CAME_SHARE = 0.9;

/** The fight built for Node (`vite build` with the server's config), its seconds. */
export async function buildFight() {
  const start = performance.now();
  const vite = join(REPO, 'node_modules/vite/bin/vite.js');
  await run(process.execPath, [vite, 'build', '--config', FIGHT_CONFIG], { cwd: REPO });
  return (performance.now() - start) / 1000;
}

/** One room in a worker of its own, fought to its end and left up (so the process's memory can be read with it):
 *  what it posted back (fightRoom.worker.mjs), and its worker. */
function openRoom(room) {
  return new Promise((resolve, reject) => {
    const workerData = { bundle: FIGHT_BUNDLE, ...room };
    const worker = new Worker(ROOM_WORKER, { workerData, resourceLimits: ROOM_LIMITS });
    worker.once('message', (report) => resolve({ report, worker }));
    worker.once('error', reject);
  });
}

/** The rooms asked for, each the same battleground and fight, and the canary last: a crowd's with no hero, a run's
 *  with no one striking. */
export function roomsOf({ biome, foe, count, wave, rooms, seconds }) {
  const steps = Math.round(seconds / TICK);
  const room = (index, heroes, mode) => ({ biome, seed: 1000 + index, heroes, mode, steps, dt: TICK });
  const mode = (strikes) => (wave ? { run: { wave, strikes } } : { crowd: { foe, count } });
  const fought = Array.from({ length: rooms }, (_, index) => room(index, [HERO_AT], mode(true)));
  const canary = wave ? room(rooms, [HERO_AT], mode(false)) : room(rooms, [], mode(true));
  return { fought, canary };
}

/** A spread of step times as a line: the median, the 90th percentile and the most (ms). */
export function stepLine(stepMs) {
  const sorted = [...stepMs].sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
  return `median ${at(0.5).toFixed(2)} ms, 90% ${at(0.9).toFixed(2)}, most ${at(1).toFixed(2)}`;
}

/** A crowd judged: with a hero, most of those alive came to him (`CAME_SHARE`); the canary's came to no one. */
function judgeCrowd(report, canary) {
  if (canary) return report.cameNear === 0 ? [] : [`the canary's ${report.cameNear} foes came to a hero it hasn't`];
  if (report.alive === 0) return ['no foe alive at its end'];
  if (report.cameNear >= report.alive * CAME_SHARE) return [];
  return [`${report.cameNear} of ${report.alive} foes came to the hero`];
}

/** A run judged: struck in, it cleared a wave at least; the canary, struck in by no one, cleared none. */
function judgeRun(report, canary) {
  if (canary) return report.cleared === 0 ? [] : [`the canary cleared ${report.cleared} waves with no one striking`];
  return report.cleared > 0 ? [] : [`no wave cleared from wave ${report.from}`];
}

/** What a room's fight did, judged (`judgeCrowd`, `judgeRun`). */
export const judgeRoom = (report, canary) => ('cleared' in report ? judgeRun : judgeCrowd)(report, canary);

/** What came of a room's fight, in words. */
export function outcomeOf(report) {
  if (!('cleared' in report)) return `${report.cameNear} of ${report.alive} foes came to the hero`;
  const bosses = report.bosses.map((boss) => `${boss.name}${boss.fell ? ' fell' : ' standing'}`).join(', ');
  return `waves ${report.from} to ${report.reached}, ${report.cleared} cleared, ${report.kills} kills`
    + (bosses ? `, bosses: ${bosses}` : '');
}

/** The room's line: its build, its step, its memory and what came of it. */
function roomLine(index, report) {
  const memory = `heap ${report.keptMb.toFixed(0)} MB kept (${report.heapMb.toFixed(0)} before a GC)`;
  return `room ${index + 1}: loaded ${report.loadMs.toFixed(0)} ms, built ${report.buildMs.toFixed(0)} ms, `
    + `step ${stepLine(report.stepMs)}, ${memory}, ${outcomeOf(report)}`;
}

/** The share of a core a room keeps busy, over the time it fought. */
function busyShare(reports, seconds) {
  const stepped = reports.flatMap((report) => report.stepMs).reduce((sum, ms) => sum + ms, 0);
  return stepped / reports.length / (seconds * 1000);
}

/** The line saying what the rooms fought. */
function fightLine(options) {
  const fought = options.wave ? `a run from wave ${options.wave}` : `${options.count} ${options.foe}`;
  return `${options.rooms} rooms of ${fought} in the ${options.biome}, `
    + `${options.seconds} s each at ${1 / TICK} steps a second, side by side:`;
}

/** `lab fight`: the fight built, its rooms run side by side and the canary after; its lines and problems. */
export async function measureFight(options) {
  const lines = [];
  const problems = [];
  lines.push(`built the fight for Node in ${(await buildFight()).toFixed(1)} s`);
  const { fought, canary } = roomsOf(options);
  const before = process.memoryUsage().rss;
  const rooms = await Promise.all(fought.map(openRoom));
  const rss = process.memoryUsage().rss;
  for (const { worker } of rooms) await worker.terminate();
  const reports = rooms.map((room) => room.report);
  lines.push(fightLine(options));
  reports.forEach((report, index) => {
    lines.push(`  ${roomLine(index, report)}`);
    for (const problem of judgeRoom(report, false)) problems.push(`room ${index + 1}: ${problem}`);
  });
  const allSteps = reports.flatMap((report) => report.stepMs);
  lines.push(`a room's step: ${stepLine(allSteps)}; `
    + `a room keeps ${(busyShare(reports, options.seconds) * 100).toFixed(2)}% of a core busy`);
  lines.push(`with every room up, each collected: the process ${((rss - before) / MB / options.rooms).toFixed(0)} `
    + `MB more a room (${(rss / MB).toFixed(0)} MB in all)`);
  const { report: canaryReport, worker } = await openRoom(canary);
  await worker.terminate();
  const canaryProblems = judgeRoom(canaryReport, true);
  const canaryOf = options.wave ? 'no one striking' : 'no hero';
  lines.push(`canary (${canaryOf}): ${outcomeOf(canaryReport)}, ${canaryProblems.length ? 'MISSED' : 'caught'}`);
  problems.push(...canaryProblems);
  return { lines, problems };
}
