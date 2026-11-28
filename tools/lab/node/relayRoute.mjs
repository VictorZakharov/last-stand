// `lab relay`'s measure: what a round trip through the co-op relay is made of, from this PC. A room of four sockets is
// opened on the relay (a private one, on a random code, never listed) and timed four ways: the relay's own ping; a
// message from one socket to another through it, sent and received on one clock (so the whole route, out and back);
// both again while the "host" sends a wave-44-sized fight to three "guests"; and the pings again while this process is
// kept busy as a game's long frames keep its page, which must read longer (the measure's canary: a ping read where a
// busy thread hands it over counts the thread's wait, as the game's did on the page before its socket went to a
// worker, src/net/relaySocket.ts).
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { labError } from './errors.mjs';
import { REPO } from './paths.mjs';

/** the relay every game meets on (`VITE_COOP_SERVER`'s default) */
export const RELAY = 'wss://ls.wellscoped.dev';
/** the page the sockets say they come from: one the relay takes (`ORIGINS` in server/relay/compose.yaml) */
const ORIGIN = 'http://localhost:5173';
/** the room's app, as the game's (`APP` in src/net/transport.ts) */
const APP = 'last-stand-coop-1';
/** how often each socket pings, and how long each part pings for (ms) */
const PING_EVERY = 100;
const PART_MS = 5000;
/** the fight's messages: a frame's events 60 a second, a snapshot every third frame, a guest's state each frame */
const FRAME_MS = 1000 / 60;
const EVENTS_BYTES = 400;
const GUEST_BYTES = 300;
/** how long of every frame the busy part keeps this process busy (ms): a game at 20 fps */
const BUSY_MS = 40;
const BUSY_FRAME_MS = 50;
/** how much longer the busy pings must read than the idle ones, or the measure saw nothing (ms) */
const BUSY_SEEN = 15;

/** The relay's own `ws` package (`npm ci --prefix server/relay`, as `lab rooms` needs too). */
function webSocketClass() {
  try {
    return createRequire(join(REPO, 'server', 'relay', 'package.json'))('ws');
  } catch {
    throw labError('relay: the relay\'s packages aren\'t installed (once: npm ci --prefix server/relay)');
  }
}

/** Waits `ms` on the clock. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Holds this process busy for `ms`, as a long frame holds a page. */
function busyFor(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // (busy: what a frame's work does to the messages waiting behind it)
  }
}

/** `values`' least, median, 90th and 98th percentiles and most, as a line (ms). */
export function spread(values) {
  if (!values.length) return 'none';
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const ms = (value) => value.toFixed(1);
  return `median ${ms(at(0.5))} ms (least ${ms(sorted[0])}, 90% ${ms(at(0.9))}, 98% ${ms(at(0.98))}, `
    + `most ${ms(sorted.at(-1))}; ${sorted.length} read)`;
}

/** The median of `values`. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** One socket of the room: its round trips and the one-way times of what reached it, by channel. */
class Probe {
  constructor(WebSocket, url) {
    this.socket = new WebSocket(url, { headers: { origin: ORIGIN } });
    this.rtts = [];
    this.oneWay = new Map();
    this.socket.on('message', (raw) => this.heard(JSON.parse(raw.toString())));
  }

  /** Opened, or the reason it wasn't. */
  opened() {
    return new Promise((resolve, reject) => {
      this.socket.on('open', resolve);
      this.socket.on('error', reject);
      this.socket.on('unexpected-response', (_, answer) => reject(new Error(`answered ${answer.statusCode}`)));
    });
  }

  heard(message) {
    if (message.t === 'pong') {
      this.rtts.push(performance.now() - message.n);
      return;
    }
    if (!message.ch) return;
    const times = this.oneWay.get(message.ch) ?? [];
    times.push(performance.now() - message.d.at);
    this.oneWay.set(message.ch, times);
  }

  ping() {
    this.socket.send(JSON.stringify({ t: 'ping', n: performance.now() }));
  }

  send(channel, bytes) {
    this.socket.send(JSON.stringify({ ch: channel, d: { at: performance.now(), fill: 'x'.repeat(bytes) } }));
  }

  /** Its times so far, let go. */
  taken() {
    const taken = { rtts: this.rtts, oneWay: this.oneWay };
    this.rtts = [];
    this.oneWay = new Map();
    return taken;
  }

  close() {
    this.socket.close(1000, 'left');
  }
}

/** A private room of a host and three guests on `server`. */
async function openRoom(server) {
  const WebSocket = webSocketClass();
  const code = `L${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const url = (id, host) => `${server}/room/${APP}/${code}?id=${id}${code}${host ? '&host=1&max=4' : ''}`;
  const host = new Probe(WebSocket, url('labhost', true));
  try {
    await host.opened();
    const guests = [0, 1, 2].map((index) => new Probe(WebSocket, url(`labguest${index}`, false)));
    await Promise.all(guests.map((guest) => guest.opened()));
    // (the relay's hi and joins let pass before anything is timed)
    await sleep(500);
    return { code, host, guests, all: [host, ...guests] };
  } catch (error) {
    host.close();
    throw labError(`relay: couldn't open a room on ${server} (${error.message})`);
  }
}

/** Every socket pinging `PING_EVERY` for `PART_MS`, `during` run each frame meanwhile; the round trips. */
async function pingAll(room, during) {
  const pinger = setInterval(() => room.all.forEach((probe) => probe.ping()), PING_EVERY);
  const framer = during ? setInterval(during, FRAME_MS) : null;
  await sleep(PART_MS);
  clearInterval(pinger);
  clearInterval(framer);
  await sleep(300);
  return room.all.map((probe) => probe.taken());
}

/** The room as a fight's frame sends: the host's events every frame and its snapshot every third, each guest's state. */
function fightFrame(room, snapshotBytes) {
  let frame = 0;
  return () => {
    frame++;
    room.host.send('ev', EVENTS_BYTES);
    if (frame % 3 === 0) room.host.send('snap', snapshotBytes);
    room.guests.forEach((guest) => guest.send('me', GUEST_BYTES));
  };
}

/** The one-way times of `channel` the guests heard. */
function guestsHeard(taken, channel) {
  return taken.slice(1).flatMap((one) => one.oneWay.get(channel) ?? []);
}

/**
 * The relay at `server` timed: its lines and its problems. `snapshotBytes` is the host's snapshot's size.
 */
export async function measureRelay({ server = RELAY, snapshotBytes = 12000 }) {
  const room = await openRoom(server);
  const lines = [`a private room of four on ${server} (${room.code}), each socket pinging every ${PING_EVERY} ms`];
  const problems = [];
  try {
    const idle = await pingAll(room, null);
    const idleRtts = idle.flatMap((one) => one.rtts);
    lines.push(`the relay's ping, idle: ${spread(idleRtts)}`);
    const echoed = await pingAll(room, () => room.host.send('echo', 0));
    lines.push(`host to guest through the relay, one clock (out and back): ${spread(guestsHeard(echoed, 'echo'))}`);
    const fight = await pingAll(room, fightFrame(room, snapshotBytes));
    lines.push(`with a fight (a ${snapshotBytes} B snapshot 20 a second, ${EVENTS_BYTES} B of events 60 a second, `
      + `each guest ${GUEST_BYTES} B 60 a second):`);
    lines.push(`  ping ${spread(fight.flatMap((one) => one.rtts))}`);
    lines.push(`  the host's snapshots to the guests ${spread(guestsHeard(fight, 'snap'))}`);
    lines.push(`  its events ${spread(guestsHeard(fight, 'ev'))}`);
    const busyFrame = setInterval(() => busyFor(BUSY_MS), BUSY_FRAME_MS);
    const busy = await pingAll(room, null);
    clearInterval(busyFrame);
    const busyRtts = busy.flatMap((one) => one.rtts);
    lines.push(`the ping read by a thread busy ${BUSY_MS} ms of every ${BUSY_FRAME_MS} (a game's frames on its `
      + `page): ${spread(busyRtts)}`);
    const longer = median(busyRtts) - median(idleRtts);
    if (!(longer >= BUSY_SEEN)) {
      problems.push(`relay: the busy thread's pings read ${longer.toFixed(1)} ms longer, not ${BUSY_SEEN}: the measure `
        + 'never saw a thread\'s wait');
    }
  } finally {
    room.all.forEach((probe) => probe.close());
    await sleep(200);
  }
  return { lines, problems };
}
