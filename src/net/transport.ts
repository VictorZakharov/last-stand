// Links for co-op. Players meet in a room named by a short code, on our own relay server (`server/relay`): every
// message goes through it over a WebSocket, which gets through any network a web page does (peer to peer, a player
// behind a mobile carrier's NAT never connected, and that needs a TURN server). `?server=wss://host` picks another
// relay server, `?net=p2p` the old WebRTC links over public Nostr relays (Trystero), and `?net=local` a
// BroadcastChannel between tabs of one browser, for testing with no server at all.
import { netLog, watchLink, unwatchLink, watchedConnection, countMsg, watchRelaySockets, correctClock } from './netlog';

export type Channel = 'hello' | 'look' | 'pl' | 'ev' | 'w' | 'ctl';

export interface Link {
  /** this peer's id in the room */
  readonly self: string;
  send(ch: Channel, data: unknown, to?: string): void;
  onMessage(fn: (ch: Channel, data: unknown, from: string) => void): void;
  onJoin(fn: (peer: string) => void): void;
  onLeave(fn: (peer: string) => void): void;
  leave(): void;
}

/** the protocol changes with the game: a room only ever holds one version (the relays keep them apart) */
const APP = 'last-stand-coop-1';
const CHANNELS: Channel[] = ['hello', 'look', 'pl', 'ev', 'w', 'ctl'];
/** The relays every game meets on, each checked to pass Trystero's events end to end (left to Trystero,
 *  the app id picked 5 of its list, and 3 of those were down: a bad certificate, refusing, or taking
 *  events and passing none on). Every game uses all of them, so a relay one player can't reach costs
 *  nothing while any other is shared. `?relays=a.org,b.net` tries others. */
const RELAYS = [
  'relay.damus.io', 'relay.primal.net', 'nostr.mom', 'relay.mostro.network', 'nostr-pub.wellorder.net',
  'bucket.coracle.social', 'relay.nostr.net', 'nostr.islandarea.net', 'nostr.oxtr.dev', 'nostr-relay.corb.net',
  'nostr.sathoarder.com', 'relay.snort.social', 'schnorr.me', 'relay02.lnfi.network', 'relay.sigit.io', 'nostr.data.haus',
];

const relayUrls = (): string[] => {
  const own = new URLSearchParams(location.search).get('relays');
  return (own ? own.split(',').map((r) => r.trim()).filter(Boolean) : RELAYS).map((r) => (r.includes('://') ? r : 'wss://' + r));
};

/** the relay server every game meets on (`VITE_COOP_SERVER` at build time, `?server=` to try another) */
const SERVER: string = import.meta.env.VITE_COOP_SERVER ?? 'wss://ls.wellscoped.dev';
const netMode = (): string => new URLSearchParams(location.search).get('net') ?? 'server';
/** the server didn't answer and this game fell back on the public relays */
let fellBack = false;
/** whether this game links through the public Nostr relays (only then is there anything to test in them) */
export const usesRelays = (): boolean => netMode() === 'p2p' || fellBack;

export async function openLink(code: string): Promise<Link> {
  const mode = netMode();
  if (mode === 'local') return localLink(code);
  if (mode !== 'p2p') {
    // (the server down or not reachable from here: the peer-to-peer links, which the other player falls back on too)
    try { fellBack = false; return await serverLink(code, new URLSearchParams(location.search).get('server') ?? SERVER); } catch (e) {
      netLog(`${(e as Error).message}: trying peer to peer through the public relays`);
      fellBack = true;
    }
  }
  // loaded on first use: solo players never download it
  const { joinRoom, selfId, getRelaySockets, createEvent } = await import('trystero/nostr');
  const urls = relayUrls();
  watchRelaySockets((u) => urls.includes(u), createEvent);
  // (a clock that's off has its events refused by the relays as expired, or stamped before a partner's subscription)
  await correctClock();
  netLog(`opening the link to room ${code} as ${selfId.slice(0, 6)}`);
  const room = joinRoom({ appId: APP, relayConfig: { urls }, rtcPolyfill: watchedConnection() }, code, {
    onJoinError: (d) => netLog(`join error with ${d.peerId.slice(0, 6)}: ${d.error}`),
  });
  watchLink(urls, getRelaySockets as () => Record<string, WebSocket>, () => room.getPeers());
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  const senders = new Map<Channel, (data: never, opts?: { target?: string }) => Promise<void>>();
  for (const ch of CHANNELS) {
    const a = room.makeAction(ch);
    a.onMessage = (data, ctx) => { countMsg('in'); onMsg(ch, data, ctx.peerId); };
    senders.set(ch, a.send as never);
  }
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  room.onPeerJoin = (p) => { netLog(`peer ${p.slice(0, 6)} joined`); join(p); };
  room.onPeerLeave = (p) => { netLog(`peer ${p.slice(0, 6)} left`); gone(p); };
  return {
    self: selfId,
    send(ch, data, to) { countMsg('out'); senders.get(ch)!(data as never, to ? { target: to } : undefined).catch((e: Error) => netLog(`send ${ch} failed: ${e.message}`)); },
    onMessage(fn) { onMsg = fn; },
    onJoin(fn) { join = fn; },
    onLeave(fn) { gone = fn; },
    leave() { netLog('left the room'); unwatchLink(); room.leave().catch(() => {}); },
  };
}

/**
 * Through our relay server: one WebSocket, JSON text frames (`server/relay/relay.mjs`). A dropped socket reconnects
 * with the same id, and the server holds the peer for a few seconds meanwhile, so a blip doesn't end a run.
 */
const OPEN_TIMEOUT = 6;
function serverLink(code: string, server: string): Promise<Link> {
  const self = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
  const url = `${server.replace(/\/+$/, '')}/room/${APP}/${code}?id=${self}`;
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  const peers = new Set<string>();
  let ws: WebSocket | null = null, left = false, tries = 0, opened = false;
  const host = new URL(server).host;
  netLog(`opening the link to room ${code} as ${self.slice(0, 6)} through ${host}`);
  return new Promise((resolve, reject) => {
    const link: Link = {
      self,
      send(ch, data, to) {
        countMsg('out');
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(to ? { ch, d: data, to } : { ch, d: data }));
      },
      onMessage(fn) { onMsg = fn; },
      onJoin(fn) { join = fn; },
      onLeave(fn) { gone = fn; },
      leave() { left = true; netLog('left the room'); ws?.close(); },
    };
    const connect = () => {
      const t0 = performance.now(), sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => { tries = 0; netLog(`server ${host} open after ${((performance.now() - t0) / 1000).toFixed(1)}s`); };
      sock.onmessage = (e) => {
        let m: { t?: string; p?: string; peers?: string[]; ch?: Channel; d?: unknown; from?: string };
        try { m = JSON.parse(e.data as string); } catch { return; }
        if (m.t === 'hi') {
          // (the peers already there are met once the session has its handlers on the link, after it's resolved)
          if (!opened) { opened = true; resolve(link); setTimeout(() => sock.onmessage?.(e), 0); return; }
          // (after a reconnect: whoever left meanwhile is gone, whoever came is new)
          const now = new Set(m.peers ?? []);
          for (const p of [...peers]) if (!now.has(p)) { peers.delete(p); netLog(`peer ${p.slice(0, 6)} left`); gone(p); }
          for (const p of now) if (!peers.has(p)) { peers.add(p); netLog(`peer ${p.slice(0, 6)} joined`); join(p); }
        } else if (m.t === 'join' && m.p && !peers.has(m.p)) { peers.add(m.p); netLog(`peer ${m.p.slice(0, 6)} joined`); join(m.p); }
        else if (m.t === 'leave' && m.p && peers.delete(m.p)) { netLog(`peer ${m.p.slice(0, 6)} left`); gone(m.p); }
        else if (m.ch && m.from && peers.has(m.from)) { countMsg('in'); onMsg(m.ch, m.d, m.from); }
      };
      sock.onclose = (e) => {
        if (ws !== sock || left) return;
        netLog(`server ${host} closed (${e.code}${e.reason ? ' ' + e.reason : ''})`);
        // (never opened: the server is down or turned us away; open, it gets a few tries to come back)
        if (!opened) { reject(new Error(`the co-op server ${host} didn't answer`)); return; }
        if (++tries > 5) { for (const p of [...peers]) { peers.delete(p); gone(p); } return; }
        setTimeout(connect, 500 * tries);
      };
    };
    connect();
    setTimeout(() => { if (!opened) { left = true; ws?.close(); reject(new Error(`the co-op server ${host} didn't answer`)); } }, OPEN_TIMEOUT * 1000);
  });
}

/** Tabs of one browser, over a BroadcastChannel: the same messages, no relays or WebRTC. */
function localLink(code: string): Link {
  const self = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel(`${APP}:${code}`);
  const peers = new Set<string>();
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  type Packet = { from: string; to?: string; ch?: Channel; data?: unknown; sys?: 'here' | 'bye' | 'ack' };
  const post = (p: Omit<Packet, 'from'>) => bc.postMessage({ from: self, ...p });
  bc.onmessage = (e: MessageEvent<Packet>) => {
    const p = e.data;
    if (p.to && p.to !== self) return;
    if (p.sys === 'bye') { if (peers.delete(p.from)) gone(p.from); return; }
    if (p.sys) {
      if (!peers.has(p.from)) { peers.add(p.from); join(p.from); }
      if (p.sys === 'here') post({ sys: 'ack', to: p.from });
      return;
    }
    if (peers.has(p.from) && p.ch) onMsg(p.ch, p.data, p.from);
  };
  const bye = () => post({ sys: 'bye' });
  window.addEventListener('pagehide', bye);
  setTimeout(() => post({ sys: 'here' }), 50);
  return {
    self,
    send(ch, data, to) { post({ ch, data, to }); },
    onMessage(fn) { onMsg = fn; },
    onJoin(fn) { join = fn; },
    onLeave(fn) { gone = fn; },
    leave() { bye(); window.removeEventListener('pagehide', bye); bc.close(); },
  };
}
