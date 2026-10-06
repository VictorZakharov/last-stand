// Co-op connection diagnostics: what the link did (relays, peers, every WebRTC connection's ICE
// candidates, states and errors, the path and round trip once connected), kept as a short log and
// a report a player can copy or share when a partner can't connect. Addresses are left out of the
// report: a candidate's type and protocol say what's needed.

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
  clearInterval(pollTimer);
  polls = 0;
  pollTimer = setInterval(poll, 250);
}

export function unwatchLink(): void {
  clearInterval(pollTimer);
  pollTimer = undefined;
  poll();
  sockets = () => ({});
  peers = () => ({});
}

const host = (url: string): string => url.replace(/^wss?:\/\//, '');
const READY = ['connecting', 'open', 'closing', 'closed'];

function poll(): void {
  const socks = sockets();
  for (const r of relays.values()) {
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
export function netSummary(): { relays: { name: string; state: string }[]; conns: { name: string; state: string; path: string; rtt: number | null }[]; msgs: typeof msgs } {
  return {
    relays: [...relays.values()].map((r) => ({ name: host(r.url), state: r.state })),
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
    'Relays:',
    ...(relayList.length ? [...relays.values()].map((r) =>
      `  ${host(r.url).padEnd(34)} ${r.state.padEnd(10)} opened ${r.opened}x, dropped ${r.closed}x${r.firstOpen !== null ? `, first open at ${stamp(r.firstOpen)}` : ''}`) : ['  (no room opened)']),
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
