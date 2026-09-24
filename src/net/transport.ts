// Peer-to-peer links for co-op. Players meet in a room named by a short code: WebRTC data channels,
// set up over free public Nostr relays (Trystero), so no server of our own is needed. `?net=local`
// swaps in a BroadcastChannel between tabs of one browser, for testing without the relays.

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

export async function openLink(code: string): Promise<Link> {
  if (new URLSearchParams(location.search).get('net') === 'local') return localLink(code);
  // loaded on first use: solo players never download it
  const { joinRoom, selfId } = await import('trystero/nostr');
  const room = joinRoom({ appId: APP }, code);
  let onMsg: (ch: Channel, data: unknown, from: string) => void = () => {};
  const senders = new Map<Channel, (data: never, opts?: { target?: string }) => Promise<void>>();
  for (const ch of CHANNELS) {
    const a = room.makeAction(ch);
    a.onMessage = (data, ctx) => onMsg(ch, data, ctx.peerId);
    senders.set(ch, a.send as never);
  }
  let join: (peer: string) => void = () => {}, gone: (peer: string) => void = () => {};
  room.onPeerJoin = (p) => join(p);
  room.onPeerLeave = (p) => gone(p);
  return {
    self: selfId,
    send(ch, data, to) { senders.get(ch)!(data as never, to ? { target: to } : undefined).catch(() => {}); },
    onMessage(fn) { onMsg = fn; },
    onJoin(fn) { join = fn; },
    onLeave(fn) { gone = fn; },
    leave() { room.leave().catch(() => {}); },
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
