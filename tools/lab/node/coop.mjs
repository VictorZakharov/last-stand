// The lab's co-op (`npm run lab -- coop`): the host's game in the side's page and the guest's in a partner page beside
// it, stepped together a turn of frames at a time on the lab's clock, the messages each sends carried to the other as
// a link of `--ping` and `--jitter` delivers them: each way half the ping and up to the jitter later, in the order
// sent (a WebSocket's TCP never reorders, so a late message holds up the ones behind it), and every couple of seconds
// on average a stall of several times the jitter (a mobile network's). The pages play each scenario (page/coop.ts),
// and what each showed is judged against the other (coopJudge.mjs).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { judgeScenario } from './coopJudge.mjs';
import { OUT } from './paths.mjs';

/** where `--pictures` puts each scenario's pictures of the two screens */
const PICTURES = join(OUT, 'coop');

/** the round trip's least and how much later each way may be, ms, unless the command says */
export const DEFAULT_PING = 300;
export const DEFAULT_JITTER = 60;
/** how often on average the link stalls, ms (by time: a message's chance of one is its share of that since the one
 *  before), and how many jitters late a stalled message comes */
const STALL_EVERY = 2000;
const STALL_JITTERS = 3;
/** the most frames a turn runs (a turn can't be longer than the quickest message takes, or it would come late) */
const MOST_TURN = 8;
/** the frames the guest has to join, and the run to start on both, before the command gives up */
const JOIN_FRAMES = 1800;
const START_FRAMES = 900;
/** the seed the link's delays are drawn from */
const LINK_SEED = 0x9e3779b9;

/** Random numbers in [0, 1) from `seed`, the same every time (mulberry32). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** One way of the link: each message sent (page/coop.ts `Sent`) given the time it arrives, in the order sent. */
export class Way {
  constructor({ delay, jitter, random }) {
    this.delay = delay;
    this.jitter = jitter;
    this.random = random;
    this.last = 0;
    this.lastSent = 0;
  }

  /** The messages `sent`, as they arrive (page/coop.ts `Arriving`). */
  carry(sent) {
    return sent.map((message) => {
      const stalled = this.random() < (message.at - this.lastSent) / STALL_EVERY;
      this.lastSent = message.at;
      const late = this.jitter * this.random() * (stalled ? STALL_JITTERS : 1);
      const due = Math.max(this.last, message.at + this.delay + late);
      this.last = due;
      return { due, name: message.name, data: message.data };
    });
  }
}

/** Calls `fn` of page/coop.ts in `page` with the page's lab and `args`. */
function callPage(page, fn, args = {}) {
  return page.evaluate(async ([fn, args]) => {
    const coop = await import('/tools/lab/page/coop.ts');
    return coop[fn](window.__lab, args);
  }, [fn, args]);
}

/** The two games and the link between them, stepped together. */
class Pair {
  constructor({ host, guest, ping, jitter, frameMs }) {
    this.host = host;
    this.guest = guest;
    const random = seededRandom(LINK_SEED);
    this.toGuest = new Way({ delay: ping / 2, jitter, random });
    this.toHost = new Way({ delay: ping / 2, jitter, random });
    this.forGuest = [];
    this.forHost = [];
    // (a turn's messages are handed over after it, so none may be due before the next turn ends)
    this.turnFrames = Math.max(1, Math.min(MOST_TURN, Math.floor(ping / 2 / frameMs)));
  }

  /** Runs `frames` frames on both games, a turn at a time, playing `scenario` (none: standing). */
  async run(frames, scenario) {
    let states = null;
    for (let done = 0; done < frames; done += this.turnFrames) {
      states = await this.turn(Math.min(this.turnFrames, frames - done), scenario);
    }
    return states;
  }

  /** Runs frames until `done(hostState, guestState)`, at most `limit`; throws, saying `what` failed, if it never is. */
  async until(done, limit, what) {
    for (let frames = 0; frames < limit; frames += this.turnFrames) {
      const [hostState, guestState] = await this.turn(this.turnFrames);
      if (done(hostState, guestState)) return;
    }
    throw labError(`coop: ${what} (not within ${limit} frames)`);
  }

  async turn(frames, scenario) {
    const [hostTurn, guestTurn] = await Promise.all([
      callPage(this.host, 'coopFrames', { arriving: this.forHost.splice(0), frames, scenario }),
      callPage(this.guest, 'coopFrames', { arriving: this.forGuest.splice(0), frames, scenario }),
    ]);
    this.forGuest.push(...this.toGuest.carry(hostTurn.sent));
    this.forHost.push(...this.toHost.carry(guestTurn.sent));
    return [hostTurn.state, guestTurn.state];
  }

  /**
   * Runs `frames` frames playing `scenario`, picturing both screens at each of `at` (frames from the start, as drawn:
   * the frame before is drawn as the game draws it) into `PICTURES`. Returns the pictures' files.
   */
  async runPicturing(frames, scenario, at) {
    mkdirSync(PICTURES, { recursive: true });
    const files = [];
    let done = 0;
    for (const frame of [...at].sort((a, b) => a - b)) {
      if (frame <= done || frame > frames) continue;
      await this.run(frame - 1 - done, scenario);
      await Promise.all([this.host, this.guest].map((page) => callPage(page, 'coopDrawing', { on: true })));
      await this.turn(1, scenario);
      for (const [role, page] of [['host', this.host], ['guest', this.guest]]) {
        const file = join(PICTURES, `${scenario}-${frame}-${role}.png`);
        await page.screenshot({ path: file });
        files.push(file);
      }
      await Promise.all([this.host, this.guest].map((page) => callPage(page, 'coopDrawing', { on: false })));
      done = frame;
    }
    await this.run(frames - done, scenario);
    return files;
  }

  /** Readies both pages' random numbers again, as a command does. */
  async reseed() {
    await Promise.all([this.host, this.guest].map((page) => page.evaluate(() => window.__lab.begin())));
  }
}

/** The room opened on the host, the guest in it, and the run started on both. */
async function startTogether(pair) {
  await pair.reseed();
  const code = await callPage(pair.host, 'coopOpen', { role: 'host' });
  await callPage(pair.guest, 'coopOpen', { role: 'guest', code });
  const joined = (host, guest) => guest.status === 'joined' && host.partners > 0 && guest.partners > 0;
  await pair.until(joined, JOIN_FRAMES, 'the guest never joined the room');
  await pair.reseed();
  await callPage(pair.host, 'coopStart');
  const inRun = (host, guest) => host.mode === 'run' && guest.mode === 'run';
  await pair.until(inRun, START_FRAMES, 'the run never started on both games');
}

/**
 * Runs `scenarios` (names of page/coop.ts's) on a side as host, a partner page as guest, over a link of `ping` and
 * `jitter` (ms). Returns the report: each scenario judged, and the problems found.
 */
export async function runCoop(side, { scenarios, ping = DEFAULT_PING, jitter = DEFAULT_JITTER, pictures = false }) {
  const guest = await side.openPartner(side.heroClass);
  try {
    const frameMs = await side.page.evaluate(() => window.__labClock.frame);
    const about = await side.page.evaluate(async () => (await import('/tools/lab/page/coop.ts')).COOP_SCENARIOS);
    const settle = await side.page.evaluate(async () => (await import('/tools/lab/page/coop.ts')).SETTLE_FRAMES);
    const pair = new Pair({ host: side.page, guest, ping, jitter, frameMs });
    await startTogether(pair);
    const lines = [`a link of ${ping} ms round trip, each way up to ${jitter} ms later`];
    const problems = [];
    for (const name of scenarios ?? Object.keys(about)) {
      if (!about[name]) throw labError(`coop: no scenario ${name} (there are ${Object.keys(about).join(', ')})`);
      await Promise.all([side.page, guest].map((page) => callPage(page, 'coopScenario', { name })));
      const { frames, pictures: at } = await callPage(side.page, 'coopScenarioFrames', { name });
      if (pictures && at.length) {
        const files = await pair.runPicturing(settle + frames, name, at.map((frame) => settle + frame));
        lines.push(`${name}: pictured ${files.length} screens in ${PICTURES}`);
      } else await pair.run(settle + frames, name);
      const samplesOf = (page) => callPage(page, 'coopSamples');
      const [hostSamples, guestSamples] = await Promise.all([side.page, guest].map(samplesOf));
      const judged = judgeScenario({ name, about: about[name], host: hostSamples, guest: guestSamples, frameMs });
      lines.push(...judged.lines);
      problems.push(...judged.problems);
    }
    return { text: lines.join('\n'), problems };
  } finally {
    await side.closePartner();
  }
}
