// Co-op connection diagnostics: what the link did (relays, peers, every WebRTC connection's ICE
// candidates, states and errors, the path and round trip once connected), kept as a short log and
// a report a player can copy or share when a partner can't connect. Addresses are left out of the
// report: a candidate's type and protocol say what's needed. It also widens the relays' subscriptions to take events
// from a clock that's off (`loosenSince`), counts what each relay takes, refuses and passes on, and tests each relay
// end to end (`testRelays`).

export interface NetEntry { t: number; msg: string }

const MAX_LOG = 400;
const t0 = performance.now();
const log: NetEntry[] = [];

/** One RTCPeerConnection the link made, and what happened to it. */
interface Conn {
  n: number;
  peer: string;
  pc: RTCPeerConnection;
  born: number;
  /** how long it took to connect (ms), once it did */
  upAfter: number | null;
  local: Record<string, number>;
  remote: Record<string, number>;
  /** an answer or offer came back: a real attempt, not one of Trystero's pooled offers */
  used: boolean;
  ice: string;
  state: string;
  path: string;
  rtt: number | null;
  sent: number;
  got: number;
}

interface RelayState { url: string; state: string; since: number; opened: number; closed: number; firstOpen: number | null }

const conns: Conn[] = [];
/** ICE errors (a STUN or TURN server that failed), once each */
const iceErrors = new Map<string, number>();
let unusedDropped = 0;
const relays = new Map<string, RelayState>();
let relayList: string[] = [];
let watching = false;
/** what each relay did with our events and what it passed on, by its url without a trailing slash */
interface RelayCount { sent: number; ok: number; refused: number; got: number; why: string[] }
const counts = new Map<string, RelayCount>();
const count = (url: string): RelayCount => counts.get(url) ?? counts.set(url, { sent: 0, ok: 0, refused: 0, got: 0, why: [] }).get(url)!;
/** this machine's clock against the page's server (s, + ahead), once measured */
let clockOff: number | null = null;
/** the relay test's results, by url */
const tested = new Map<string, string>();
let testing = false;
/** makes a signed event on a topic (Trystero's), for the relay test */
let makeEvent: ((topic: string, content: string) => Promise<string>) | null = null;
const bare = (url: string): string => url.replace(/\/+$/, '');
let sockets: () => Record<string, WebSocket> = () => ({});
let peers: () => Record<string, RTCPeerConnection> = () => ({});
let pollTimer: ReturnType<typeof setInterval> | undefined;
let polls = 0;
let connNo = 0;
const msgs = { in: 0, out: 0 };

const now = (): number => performance.now() - t0;
const stamp = (ms: number): string => `${(ms / 1000).toFixed(1).padStart(6)}s`;

export function netLog(msg: string): void {
  log.push({ t: now(), msg });
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

/** A candidate's kind without its address: "srflx udp ipv4". */
function candidateKind(c: string): string {
  const f = c.replace(/^a=/, '').split(' ');
  // candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> ...
  const addr = f[4] ?? '';
  const fam = addr.endsWith('.local') ? 'mdns' : addr.includes(':') ? 'ipv6' : 'ipv4';
  const tcp = f[2]?.toLowerCase() === 'tcp';
  return `${f[7] ?? '?'} ${tcp ? 'tcp' : 'udp'} ${fam}`;
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

/** An RTCPeerConnection that reports what it does (the link's `rtcPolyfill`). */
export function watchedConnection(): typeof RTCPeerConnection {
  return class extends RTCPeerConnection {
    constructor(cfg?: RTCConfiguration) {
      super(cfg);
      const c: Conn = {
        n: ++connNo, peer: '', pc: this, born: now(), upAfter: null, local: {}, remote: {}, used: false,
        ice: 'new', state: 'new', path: '', rtt: null, sent: 0, got: 0,
      };
      conns.push(c);
      // the answered connections are kept, at most the last 12
      const used = conns.filter((x) => x.used);
      if (used.length > 12) conns.splice(conns.indexOf(used[0]), 1);
      if (connNo === 1) {
        const servers = (cfg?.iceServers ?? []).flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
        netLog(`ICE servers: ${servers.filter((u) => u.startsWith('stun')).length} STUN, ${servers.filter((u) => u.startsWith('turn')).length} TURN`);
      }
      this.addEventListener('icecandidate', (e) => {
        if (e.candidate?.candidate) bump(c.local, candidateKind(e.candidate.candidate));
        else if (c.used) netLog(`pc${c.n} gathered: ${fmtKinds(c.local)}`);
      });
      this.addEventListener('icecandidateerror', (e) => {
        const ev = e as RTCPeerConnectionIceErrorEvent;
        const err = `${ev.url ?? ''} ${ev.errorCode} ${ev.errorText ?? ''}`.trim();
        if (!iceErrors.has(err)) netLog(`ICE error ${err}`);
        iceErrors.set(err, (iceErrors.get(err) ?? 0) + 1);
      });
      this.addEventListener('iceconnectionstatechange', () => {
        c.ice = this.iceConnectionState;
        netLog(`pc${c.n} ICE ${c.ice}${c.ice === 'failed' ? ` (remote offered: ${fmtKinds(c.remote)})` : ''}`);
      });
      this.addEventListener('connectionstatechange', () => {
        c.state = this.connectionState;
        if (c.state === 'connected' && c.upAfter === null) c.upAfter = now() - c.born;
        netLog(`pc${c.n} ${c.state}${c.state === 'connected' ? ` after ${((c.upAfter ?? 0) / 1000).toFixed(1)}s` : ''}`);
        if (c.state === 'connected') void readStats(c);
      });
    }
    override async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
      const c = conns.find((x) => x.pc === this);
      for (const line of d.sdp?.split(/\r?\n/) ?? []) if (c && line.startsWith('a=candidate:')) bump(c.remote, candidateKind(line));
      if (c) { c.used = true; netLog(`pc${c.n} got the remote ${d.type}`); }
      return super.setRemoteDescription(d);
    }
    override async addIceCandidate(cand?: RTCIceCandidateInit | null): Promise<void> {
      const c = conns.find((x) => x.pc === this);
      if (c && cand?.candidate) bump(c.remote, candidateKind(cand.candidate));
      return super.addIceCandidate(cand ?? undefined);
    }
  };
}

const fmtKinds = (m: Record<string, number>): string => Object.entries(m).map(([k, v]) => `${v} ${k}`).join(', ') || 'none';

/** The selected path of a connected link, its round trip and traffic. */
async function readStats(c: Conn): Promise<void> {
  let st: RTCStatsReport;
  try { st = await c.pc.getStats(); } catch { return; }
  let pair: RTCIceCandidatePairStats | undefined;
  st.forEach((s) => {
    if (s.type === 'transport' && s.selectedCandidatePairId) pair = st.get(s.selectedCandidatePairId);
  });
  if (!pair) st.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
  if (!pair) return;
  const lc = st.get(pair.localCandidateId), rc = st.get(pair.remoteCandidateId);
  const path = `${lc?.candidateType ?? '?'} ${lc?.protocol ?? ''} -> ${rc?.candidateType ?? '?'}${lc?.relayProtocol ? ` (relayed over ${lc.relayProtocol})` : ''}`;
  if (path !== c.path) { c.path = path; netLog(`pc${c.n} path ${path}`); }
  c.rtt = pair.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : null;
  c.sent = pair.bytesSent ?? 0;
  c.got = pair.bytesReceived ?? 0;
}

/** The link's relays and connections to keep an eye on (set when a room opens). */
export function watchLink(urls: string[], getSockets: () => Record<string, WebSocket>, getPeers: () => Record<string, RTCPeerConnection>): void {
  relayList = urls;
  sockets = getSockets;
  peers = getPeers;
  relays.clear();
  for (const url of urls) relays.set(url, { url, state: 'connecting', since: now(), opened: 0, closed: 0, firstOpen: null });
  netLog(`relays: ${urls.map(host).join(', ')}`);
  watching = true;
  counts.clear();
  clearInterval(pollTimer);
  polls = 0;
  pollTimer = setInterval(poll, 250);
}

export function unwatchLink(): void {
  clearInterval(pollTimer);
  pollTimer = undefined;
  poll();
  // (what each relay was doing when the room was left stays in the report: polled after, every one read "not opened")
  watching = false;
  sockets = () => ({});
  peers = () => ({});
}

const host = (url: string): string => url.replace(/^wss?:\/\//, '');
const READY = ['connecting', 'open', 'closing', 'closed'];

function poll(): void {
  const socks = sockets();
  if (watching) for (const r of relays.values()) {
    const ws = socks[r.url] ?? socks[r.url + '/'];
    const s = ws ? READY[ws.readyState] : 'not opened';
    if (s === r.state) continue;
    if (s === 'open') { r.opened++; r.firstOpen ??= now(); }
    if (s === 'closed' && r.state === 'open') r.closed++;
    netLog(`relay ${host(r.url)} ${s}${s === 'open' && r.opened === 1 ? ` after ${((now() - r.since) / 1000).toFixed(1)}s` : ''}`);
    r.state = s;
  }
  // Trystero keeps a pool of offers ready and closes the ones nobody answered
  for (let i = conns.length - 1; i >= 0; i--) {
    const c = conns[i];
    if (!c.used && c.pc.signalingState === 'closed') { conns.splice(i, 1); unusedDropped++; }
  }
  const map = peers();
  for (const [id, pc] of Object.entries(map)) {
    const c = conns.find((x) => x.pc === pc);
    if (c && !c.peer) c.peer = id;
  }
  // the connected links' stats every 2 s
  if (++polls % 8 === 0) for (const c of conns) if (c.state === 'connected') void readStats(c);
}

/** Messages through the link, both ways (counted by the transport). */
export function countMsg(dir: 'in' | 'out'): void { msgs[dir]++; }

/** For the overlay: one line per relay and connection. */
export function netSummary(): { relays: { name: string; state: string; note: string }[]; conns: { name: string; state: string; path: string; rtt: number | null }[]; msgs: typeof msgs; clock: number | null; testing: boolean } {
  return {
    clock: clockOff, testing,
    relays: [...relays.values()].map((r) => {
      const c = counts.get(bare(r.url)), t = tested.get(bare(r.url));
      // (a relay that refuses what we send, or passes nothing on, is as good as closed)
      const state = c && c.refused > 0 && c.ok === 0 ? 'refusing' : t && !t.startsWith('delivered') ? 'failed test' : r.state;
      return { name: host(r.url), state, note: c ? `sent ${c.sent}, taken ${c.ok}, refused ${c.refused}, got ${c.got}${c.why.length ? ': ' + c.why[0] : ''}${t ? ` | test: ${t}` : ''}` : t ? `test: ${t}` : '' };
    }),
    conns: conns.filter((c) => c.used && (c.state !== 'closed' || now() - c.born < 60_000)).map((c) => ({
      name: c.peer ? c.peer.slice(0, 6) : `pc${c.n}`, state: c.state === 'new' ? c.ice : c.state, path: c.path, rtt: c.rtt,
    })),
    msgs,
  };
}

/** Everything above as text, for a bug report. */
export function netReport(header: string[]): string {
  poll();
  return [
    'Last Stand network report',
    ...header,
    `Online ${navigator.onLine} | connection ${(navigator as { connection?: { effectiveType?: string; type?: string } }).connection?.effectiveType ?? '?'} | timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `UA ${navigator.userAgent}`,
    `Messages in ${msgs.in}, out ${msgs.out}`,
    `Clock ${clockOff === null ? 'not measured' : `${clockOff >= 0 ? '+' : ''}${clockOff.toFixed(1)} s against the server${corrected ? ' (set right for the page)' : ''}`} | subscriptions widened ${SINCE_SLACK} s back`,
    'Relays (socket; our events sent, taken, refused; events passed on to us; the end-to-end test):',
    ...(relayList.length ? [...relays.values()].map((r) => {
      const c = counts.get(bare(r.url)), t = tested.get(bare(r.url));
      return `  ${host(r.url).padEnd(30)} ${r.state.padEnd(10)} opened ${r.opened}x, dropped ${r.closed}x${r.firstOpen !== null ? `, first at ${stamp(r.firstOpen)}` : ''}`
        + (c ? ` | sent ${c.sent}, taken ${c.ok}, refused ${c.refused}, got ${c.got}${c.why.length ? ` (${c.why.join('; ')})` : ''}` : '')
        + (t ? ` | test: ${t}` : '');
    }) : ['  (no room opened)']),
    `ICE errors: ${[...iceErrors].map(([e, k]) => `${e} (${k}x)`).join('; ') || 'none'}`,
    `Connections (and ${conns.filter((c) => !c.used).length + unusedDropped} pooled offers never answered):`,
    ...(conns.some((c) => c.used) ? conns.filter((c) => c.used).map((c) => [
      `  pc${c.n} peer ${c.peer || '?'} at ${stamp(c.born)}: ${c.state} / ICE ${c.ice}${c.upAfter !== null ? `, up after ${(c.upAfter / 1000).toFixed(1)}s` : ''}`,
      `    local:  ${fmtKinds(c.local)}`,
      `    remote: ${fmtKinds(c.remote)}`,
      ...(c.path ? [`    path ${c.path} | rtt ${c.rtt !== null ? c.rtt.toFixed(0) + ' ms' : '?'} | sent ${(c.sent / 1024).toFixed(0)} KB, got ${(c.got / 1024).toFixed(0)} KB`] : []),
    ].join('\n')) : ['  (none)']),
    'Log:',
    ...log.map((e) => `${stamp(e.t)}  ${e.msg}`),
  ].join('\n');
}

// --- the relays' own side ----------------------------------------------------------------------------------------------
/** a relay subscription takes events this far back (s): Trystero asks from the moment it subscribes, by this machine's
 *  clock, and an event is stamped by its sender's: a partner whose clock was behind ours was never heard (its offer
 *  stamped before our subscription), and the join timed out. Its events are ephemeral (kinds 20000 to 29999, never
 *  stored), so asking further back replays nothing. */
export const SINCE_SLACK = 3600;
let patched = false;
const testSockets = new WeakSet<WebSocket>();

/** A subscription asked for further back (`SINCE_SLACK`). */
function loosenSince(req: string): string {
  try {
    const m = JSON.parse(req) as unknown[];
    for (let i = 2; i < m.length; i++) { const f = m[i] as { since?: number }; if (typeof f?.since === 'number') f.since -= SINCE_SLACK; }
    return JSON.stringify(m);
  } catch { return req; }
}

function onRelayMessage(url: string, data: unknown): void {
  if (typeof data !== 'string') return;
  const kind = data.slice(2, 8);
  const c = count(url);
  if (kind.startsWith('EVENT')) { c.got++; return; }
  let m: unknown[];
  try { m = JSON.parse(data) as unknown[]; } catch { return; }
  const why = (r: unknown) => { const t = String(r ?? '').slice(0, 120); if (t && !c.why.includes(t) && c.why.length < 3) { c.why.push(t); netLog(`relay ${host(url)}: ${t}`); } };
  if (m[0] === 'OK') { if (m[2]) c.ok++; else { c.refused++; why(m[3]); } }
  else if (m[0] === 'NOTICE') why(m[1]);
  else if (m[0] === 'CLOSED') why(m[2]);
  else if (m[0] === 'AUTH') why('asks to log in (AUTH)');
}

/**
 * Watches the relays' sockets from the page's side (once): their subscriptions widened (`loosenSince`), and what each
 * one takes, refuses and passes on counted. Only sockets to `isRelay` urls, and not the relay test's own.
 */
export function watchRelaySockets(isRelay: (url: string) => boolean, maker: (topic: string, content: string) => Promise<string>): void {
  makeEvent = maker;
  if (patched) return;
  patched = true;
  const send = WebSocket.prototype.send, seen = new WeakSet<WebSocket>();
  WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
    if (typeof data === 'string' && isRelay(bare(this.url)) && !testSockets.has(this)) {
      const url = bare(this.url);
      if (!seen.has(this)) { seen.add(this); this.addEventListener('message', (e) => onRelayMessage(url, e.data)); }
      if (data.startsWith('["REQ"')) data = loosenSince(data);
      else if (data.startsWith('["EVENT"')) count(url).sent++;
    }
    return send.call(this, data);
  };
}

/** a clock further off than this (s) is set right for the page (`correctClock`) */
const CLOCK_SLACK = 2;
let corrected = false;
/**
 * Sets this page's clock (`Date.now`) to the server's when this machine's is off, before a room opens (once). The relays
 * judge an event by the time stamped in it, which Trystero takes from `Date.now` and signs: from a clock two minutes
 * behind, half of them refused every event as expired. Only differences of `Date.now` are used anywhere else (Trystero's
 * own timers, an item id's seed, a save's age), which a constant shift leaves as they were.
 */
export async function correctClock(): Promise<void> {
  if (clockOff === null) await Promise.race([measureClock(), new Promise((r) => setTimeout(r, 2000))]);
  if (corrected || clockOff === null || Math.abs(clockOff) <= CLOCK_SLACK) return;
  corrected = true;
  const real = Date.now.bind(Date), off = clockOff * 1000;
  Date.now = () => real() - off;
  netLog(`clock set ${clockOff > 0 ? 'back' : 'forward'} ${Math.abs(clockOff).toFixed(1)} s, to the server's`);
}

/** This machine's clock against the page's server, from its reply's Date header (to about a second). */
async function measureClock(): Promise<void> {
  try {
    const t0 = Date.now(), r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' }), t1 = Date.now();
    const d = r.headers.get('date');
    if (!d) return;
    // (the header is whole seconds: the reply's middle against it, give or take half a second)
    clockOff = ((t0 + t1) / 2 - Date.parse(d) - 500) / 1000;
    netLog(`clock ${clockOff >= 0 ? '+' : ''}${clockOff.toFixed(1)} s against the server`);
  } catch { /* offline, or the server sends no date */ }
}

const strNum = (s: string): number => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

/**
 * Each relay end to end, as Trystero uses it: two sockets of its own, one subscribed to a topic of its own, the other
 * publishing a signed event on it, and whether the first is sent it (and how soon), the relay refuses it (and why) or
 * passes nothing on. Run when a join gets no answer, and from the network overlay.
 */
export async function testRelays(): Promise<void> {
  if (testing || !makeEvent || !relayList.length) return;
  testing = true;
  tested.clear();
  netLog('testing the relays');
  const topic = `last-stand-test-${Math.random().toString(36).slice(2, 10)}`, kind = strNum(topic) % 1e4 + 2e4;
  const one = (url: string) => new Promise<string>((done) => {
    const socks: WebSocket[] = [];
    let end = false;
    const finish = (r: string) => { if (end) return; end = true; for (const s of socks) { try { s.close(); } catch { /* */ } } done(r); };
    const open = () => { const s = new WebSocket(url); testSockets.add(s); socks.push(s); return s; };
    const timer = setTimeout(() => finish(socks.every((s) => s.readyState === 1) ? 'open, nothing passed on in 8 s' : 'could not open'), 8000);
    const sub = open(), pub = open();
    let t0 = 0, refused = '';
    sub.onmessage = (e) => { if (String(e.data).startsWith('["EVENT"')) { clearTimeout(timer); finish(`delivered in ${Math.round(performance.now() - t0)} ms`); } };
    pub.onmessage = (e) => {
      try { const m = JSON.parse(String(e.data)) as unknown[]; if (m[0] === 'OK' && !m[2]) { refused = String(m[3] ?? '').slice(0, 100); clearTimeout(timer); finish(`refused: ${refused}`); } } catch { /* */ }
    };
    let ready = 0;
    const go = async () => {
      if (++ready < 2) return;
      sub.send(JSON.stringify(['REQ', 't', { kinds: [kind], '#x': [topic], since: Math.floor(Date.now() / 1000) - SINCE_SLACK }]));
      await new Promise((r) => setTimeout(r, 500));
      t0 = performance.now();
      try { pub.send(await makeEvent!(topic, 'test')); } catch { finish('could not sign'); }
    };
    sub.onopen = pub.onopen = () => void go();
    sub.onerror = pub.onerror = () => { clearTimeout(timer); finish('could not open'); };
  });
  const res = await Promise.all(relayList.map(async (u) => [u, await one(u)] as const));
  for (const [u, r] of res) { tested.set(bare(u), r); }
  const ok = res.filter(([, r]) => r.startsWith('delivered')).length;
  netLog(`relay test: ${ok} of ${res.length} pass events on (${res.filter(([, r]) => !r.startsWith('delivered')).map(([u, r]) => `${host(u)}: ${r}`).join('; ') || 'all'})`);
  testing = false;
}
