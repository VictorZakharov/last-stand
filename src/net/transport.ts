// Peer-to-peer links for co-op. Players meet in a room named by a short code: WebRTC data channels,
// set up over free public Nostr relays (Trystero), so no server of our own is needed. `?net=local`
// swaps in a BroadcastChannel between tabs of one browser, for testing without the relays.
import { netLog, watchLink, unwatchLink, watchedConnection, countMsg } from './netlog';

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
  'bucket.coracle.social', 'relay.nostr.net', 'nostr.islandarea.net', 'nostr.oxtr.dev', 'nostr.bitcoiner.social',
];

const relayUrls = (): string[] => {
  const own = new URLSearchParams(location.search).get('relays');
  return (own ? own.split(',').map((r) => r.trim()).filter(Boolean) : RELAYS).map((r) => (r.includes('://') ? r : 'wss://' + r));
};

export async function openLink(code: string): Promise<Link> {
  if (new URLSearchParams(location.search).get('net') === 'local') return localLink(code);
  // loaded on first use: solo players never download it
  const { joinRoom, selfId, getRelaySockets } = await import('trystero/nostr');
  const urls = relayUrls();
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
