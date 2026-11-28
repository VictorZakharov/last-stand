// `lab coop`'s `hitches` scenario judged (page/coopHitches.ts plays it): each game holds the messages come to it for a
// long frame's length every 2 s, from `HITCH_CALM` on. Each partner's play-out (`Timeline` in src/net/timeline.ts)
// waits for the lateness most of the link's messages come within; judged by when a message was handed over, each long
// frame of its own read as a late link, and it waited that much longer for every report. Judged by when each arrived
// (the relay's socket's worker stamps it), it waits as long as before.
import { median } from './coopJudge.mjs';
import { HITCH_CALM, HITCH_GROWN, HITCH_HOLD } from '../page/coopHitches.ts';

/** how much further behind a play-out may play with the hitches than before them, ms */
export const GROWN_MOST = 30;
/** the frames before the hitches start that the calm play-out is read over */
const CALM_READ = 180;
/** the name every problem the canary must cause begins with */
export const HITCHES_CANARY = 'hitches: the play-out waited';

/** The play-out's median wait over `samples` (ms), from the frames that have one. */
function behindOver(samples) {
  const waits = samples.map((sample) => sample.playout?.behind).filter(Number.isFinite);
  return waits.length ? median(waits) : null;
}

/** One game's play-out before the hitches and with them: its line, and its problem if it grew. */
function judgeGame(what, samples, frameMs) {
  const calm = behindOver(samples.slice(HITCH_CALM - CALM_READ, HITCH_CALM));
  const hitched = behindOver(samples.slice(HITCH_CALM + HITCH_GROWN));
  if (calm === null || hitched === null) {
    return { line: `${what}: no play-out read`, problem: `hitches: ${what} unread` };
  }
  const grown = hitched - calm;
  const hold = Math.round(HITCH_HOLD * frameMs);
  const line = `${what}: ${Math.round(calm)} ms behind the freshest report on a calm link, ${Math.round(hitched)} `
    + `with a ${hold} ms hitch every 2 s (${grown >= 0 ? '+' : ''}${Math.round(grown)})`;
  const problem = grown > GROWN_MOST
    ? `${HITCHES_CANARY} ${Math.round(grown)} ms longer on ${what} for its own game's hitches (at most ${GROWN_MOST})`
    : null;
  return { line, problem };
}

/** The scenario judged: `host` and `guest` are the two games' samples, frame for frame. */
export function describeHitches(host, guest, frameMs) {
  const games = [judgeGame('the host\'s play-out', host, frameMs), judgeGame('the guest\'s play-out', guest, frameMs)];
  const line = games.map((game) => game.line).join('\n  ');
  return { line, problems: games.map((game) => game.problem).filter(Boolean) };
}

/**
 * The canary's verdict, its line pushed onto `lines`: with no arrival stamps (main's link), the hitches must read as
 * a later link. Returns the problems left.
 */
export function hitchesCanaryLines(problems, lines) {
  const caught = problems.some((problem) => problem.includes(HITCHES_CANARY));
  lines.push(`canary: messages handed over unstamped ${caught ? 'caught' : 'missed'}`);
  if (!caught) return ['canary missed: the hitches never read as a later link with the arrival stamps left off'];
  return problems.filter((problem) => !problem.includes(HITCHES_CANARY));
}
