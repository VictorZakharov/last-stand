// The relay's socket as `transport.ts` uses it, its WebSocket held by a worker (`relaySocket.worker.ts`): each message
// comes with the moment it arrived, and the round trip to the server is timed there. On the page both waited for the
// frame being drawn: four players in one city, 20 ms from the relay, saw pings of 56 to 97 ms at wave 44, and each
// long frame read as a late link, so a partner's play-out waited 80 to 210 ms more than the link needed.
// Where no worker can be made, the page's own WebSocket, stamped as each message is handled.

/** What the page tells the worker. */
export type ToSocket =
  | { k: 'open'; url: string }
  | { k: 'send'; text: string }
  | { k: 'ping'; every: number }
  | { k: 'close'; code?: number; reason?: string };
/** What the worker tells the page (`at`: when it arrived, its clock's epoch, `performance.timeOrigin` + now). */
export type FromSocket =
  | { k: 'open' }
  | { k: 'msg'; text: string; at: number }
  | { k: 'rtt'; ms: number }
  | { k: 'close'; code: number; reason: string };

export interface RelaySocket {
  readonly open: boolean;
  send(text: string): void;
  /** the relay pinged every `every` ms from now on, each round trip told to `onRtt` */
  ping(every: number): void;
  close(code?: number, reason?: string): void;
  onopen: () => void;
  /** a message, and when it arrived (the page's `performance.now()`) */
  onmessage: (text: string, at: number) => void;
  onclose: (code: number, reason: string) => void;
  onRtt: (ms: number) => void;
}

/** how far before now an arrival may be and still be taken as one of this page's clock (ms) */
const ARRIVED_WITHIN = 3000;

/**
 * When a message arrived, on the page's clock: `at` where it's a moment of that clock no further back than
 * `ARRIVED_WITHIN`, else now (a clock not the page's: the lab's own, which the page's `performance.now` reads and a
 * worker's doesn't; or a message held longer than that, which is judged as it was before, by when it was handled).
 */
export function arrivedAt(at: number): number {
  const now = performance.now();
  return Number.isFinite(at) && at <= now && at > now - ARRIVED_WITHIN ? at : now;
}

/** a worker that failed to load (a browser that can't make module workers, a blocked script): every socket after it
 *  is the page's own */
let workerFailed = false;

/** A socket to the relay at `url`, in a worker where one can be made. */
export function relaySocket(url: string): RelaySocket {
  if (workerFailed) return onPage(url);
  try {
    return inWorker(url);
  } catch {
    workerFailed = true;
    return onPage(url);
  }
}

/** `socket` carried on by a page's own socket to `url` from now on, its handlers as they are. */
function carryOnPage(socket: RelaySocket, url: string): void {
  const page = onPage(url);
  page.onopen = () => socket.onopen();
  page.onmessage = (text, at) => socket.onmessage(text, at);
  page.onclose = (code, reason) => socket.onclose(code, reason);
  page.onRtt = (ms) => socket.onRtt(ms);
  Object.defineProperty(socket, 'open', { get: () => page.open });
  socket.send = (text) => page.send(text);
  socket.ping = (every) => page.ping(every);
  socket.close = (code, reason) => page.close(code, reason);
}

function inWorker(url: string): RelaySocket {
  const worker = new Worker(new URL('./relaySocket.worker.ts', import.meta.url), { type: 'module', name: 'relay' });
  const order = (message: ToSocket) => worker.postMessage(message);
  let state: 'connecting' | 'open' | 'closed' = 'connecting';
  const socket: RelaySocket = {
    get open() { return state === 'open'; },
    send(text) { if (state === 'open') order({ k: 'send', text }); },
    ping(every) { order({ k: 'ping', every }); },
    close(code, reason) {
      if (state === 'closed') return;
      order({ k: 'close', code, reason });
    },
    onopen: () => {}, onmessage: () => {}, onclose: () => {}, onRtt: () => {},
  };
  worker.onmessage = (event: MessageEvent<FromSocket>) => {
    const told = event.data;
    if (told.k === 'msg') socket.onmessage(told.text, arrivedAt(told.at - performance.timeOrigin));
    else if (told.k === 'rtt') socket.onRtt(told.ms);
    else if (told.k === 'open') { state = 'open'; socket.onopen(); }
    else { state = 'closed'; worker.terminate(); socket.onclose(told.code, told.reason); }
  };
  // (a worker that fails to load says so here, not at its making: before its socket opened, the page's own carries
  // on in its place, and every socket after it is the page's; after, the socket is lost as a dropped one is)
  worker.onerror = () => {
    if (state === 'closed') return;
    const opened = state === 'open';
    state = 'closed';
    worker.terminate();
    workerFailed = true;
    if (opened) socket.onclose(1006, 'the socket\'s worker failed');
    else carryOnPage(socket, url);
  };
  order({ k: 'open', url });
  return socket;
}

function onPage(url: string): RelaySocket {
  const ws = new WebSocket(url);
  let pinger: ReturnType<typeof setInterval> | undefined;
  const socket: RelaySocket = {
    get open() { return ws.readyState === WebSocket.OPEN; },
    send(text) { if (ws.readyState === WebSocket.OPEN) ws.send(text); },
    ping(every) {
      clearInterval(pinger);
      pinger = setInterval(() => socket.send(JSON.stringify({ t: 'ping', n: performance.now() })), every);
    },
    close(code, reason) { ws.close(code, reason); },
    onopen: () => {}, onmessage: () => {}, onclose: () => {}, onRtt: () => {},
  };
  ws.onopen = () => socket.onopen();
  ws.onmessage = (e) => {
    const text = e.data as string;
    if (text.startsWith('{"t":"pong"')) {
      const sent = (JSON.parse(text) as { n?: unknown }).n;
      if (typeof sent === 'number') socket.onRtt(performance.now() - sent);
      return;
    }
    socket.onmessage(text, performance.now());
  };
  ws.onclose = (e) => { clearInterval(pinger); socket.onclose(e.code, e.reason); };
  return socket;
}
