// Co-op connection diagnostics: what the link to our relay server did (opened, dropped, turned away, its round trip),
// the session's steps, kept as a short log and a report a player can copy or share when a partner can't connect.

export interface NetEntry { t: number; msg: string }

const MAX_LOG = 400;
const t0 = performance.now();
const log: NetEntry[] = [];
const msgs = { in: 0, out: 0 };

/** the link to the relay server, while a room is open (and as it was left) */
interface ServerState { host: string; state: string; opened: number; dropped: number; firstOpen: number | null; rtt: number | null; rttMax: number | null }
let server: ServerState | null = null;

const now = (): number => performance.now() - t0;
const stamp = (ms: number): string => `${(ms / 1000).toFixed(1).padStart(6)}s`;

export function netLog(msg: string): void {
  log.push({ t: now(), msg });
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

/** A room's link to the server begins (`host`, as the game reaches it). */
export function watchServer(host: string): void {
  server = { host, state: 'connecting', opened: 0, dropped: 0, firstOpen: null, rtt: null, rttMax: null };
}

/** The server link's socket changed state. */
export function serverState(state: 'connecting' | 'open' | 'closed'): void {
  if (!server) return;
  if (state === 'open') { server.opened++; server.firstOpen ??= now(); }
  if (state === 'closed' && server.state === 'open') server.dropped++;
  server.state = state;
}

/** A round trip to the server and back (ms), from its pings. */
export function serverRtt(ms: number): void {
  if (!server) return;
  server.rtt = ms;
  server.rttMax = Math.max(server.rttMax ?? 0, ms);
}

/** Messages through the link, both ways (counted by the transport). */
export function countMsg(dir: 'in' | 'out'): void { msgs[dir]++; }

/** For the overlay. */
export function netSummary(): { server: ServerState | null; msgs: typeof msgs } {
  return { server, msgs };
}

/** Everything above as text, for a bug report. */
export function netReport(header: string[]): string {
  const s = server;
  return [
    'Last Stand network report',
    ...header,
    `Online ${navigator.onLine} | connection ${(navigator as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? '?'} | timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `UA ${navigator.userAgent}`,
    `Messages in ${msgs.in}, out ${msgs.out}`,
    s ? `Server ${s.host}: ${s.state}, opened ${s.opened}x, dropped ${s.dropped}x${s.firstOpen !== null ? `, first at ${stamp(s.firstOpen)}` : ''}`
      + ` | round trip ${s.rtt !== null ? `${s.rtt.toFixed(0)} ms (worst ${s.rttMax!.toFixed(0)} ms)` : '?'}` : 'Server: no room opened',
    'Log:',
    ...log.map((e) => `${stamp(e.t)}  ${e.msg}`),
  ].join('\n');
}
