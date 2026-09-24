// Co-op sessions: hosting or joining a room, the shared lobby, and the players' own state.
// Every game reports its own player (position, aim, casts) to the others, in the lobby and in a
// run; the host's game also reports the fight (net/sync). The host hands out the party slots
// (0 is the host) and starts the runs. Built for up to COOP.maxPlayers.
import { G } from '../state';
import { COOP } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { Player, setActionSink, type PlayerAction } from '../entities/player';
import { openLink, type Link } from './transport';
import { role } from './role';
import { showBiomeSetting } from '../game/biome';
import { hostSync, stopSync, onWorld, onGuestControl, sendWorld } from './sync';

import type { Profile } from '../types';

/** bumped when the messages change: games of different versions don't play together */
const PROTOCOL = 1;
/** how long a guest waits for the host before giving up (s) */
const JOIN_TIMEOUT = 25;
/** room codes: no look-alike letters or digits */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A player's class and gear, which is all another game needs to show them. */
export interface Look { cls: string; eq: Profile['equipped'] }

export type SessionStatus = 'off' | 'hosting' | 'joining' | 'joined' | 'failed';

interface Peer { id: string; slot: number; player: Player | null; look: Look | null; inRun: boolean }

/** What the rest of the game does when the session changes (set by main). */
export interface SessionHooks {
  /** the host started a run: a guest starts its side of it */
  startRun(biome: BiomeId, wave: number): void;
  /** the host left, or the room broke up */
  hostGone(): void;
  /** anything the lobby shows changed (status, partner, roster) */
  changed(): void;
}

export const session = {
  status: 'off' as SessionStatus,
  code: '',
  /** why joining failed */
  error: '',
  /** the host's peer id, on a guest */
  hostId: '',
  /** the host's lobby choice, shown on a guest */
  biome: null as BiomeId | null,
  wave: 1,
  peers: new Map<string, Peer>(),
};

let link: Link | null = null;
let hooks: SessionHooks;
let joinTimer: ReturnType<typeof setTimeout> | undefined;
let sendT = 0;
/** the local player's actions since the last send, in order */
let actions: PlayerAction[] = [];

export function initSession(h: SessionHooks): void {
  hooks = h;
  setActionSink((a) => { if (link) actions.push(a); });
  window.addEventListener('pagehide', () => leaveRoom());
}

const newCode = (): string => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** The invite link: this page with the room in it. */
export const inviteLink = (): string => {
  const u = new URL(location.href);
  u.search = '';
  u.searchParams.set('room', session.code);
  const local = new URLSearchParams(location.search).get('net');
  if (local) u.searchParams.set('net', local);
  return u.toString();
};

/** A room code from the address bar (an invite link), if any. */
export function invitedRoom(): string | null {
  const c = new URLSearchParams(location.search).get('room');
  return c && /^[A-Z0-9]{4,8}$/i.test(c) ? c.toUpperCase() : null;
}

export const myLook = (): Look => ({ cls: G.profile.classId, eq: G.profile.equipped });

// --- rooms -------------------------------------------------------------------------------
export async function hostRoom(): Promise<void> {
  if (link) return;
  session.code = newCode();
  session.status = 'hosting';
  session.error = '';
  role.current = 'host';
  G.player.slot = 0;
  placeSpawns();
  hooks.changed();
  try {
    link = await openLink(session.code);
  } catch (e) {
    fail(`Couldn't open a room (${(e as Error).message})`);
    return;
  }
  wire(link);
  hostSync();
}

export async function joinRoom(code: string): Promise<void> {
  if (link) leaveRoom();
  session.code = code.toUpperCase();
  session.status = 'joining';
  session.error = '';
  hooks.changed();
  try {
    link = await openLink(session.code);
  } catch (e) {
    fail(`Couldn't reach the room (${(e as Error).message})`);
    return;
  }
  wire(link);
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => { if (session.status === 'joining') fail('Nobody answered: check the code, or ask the host to open the room again.'); }, JOIN_TIMEOUT * 1000);
}

/** Leave the room (the partners' characters go with it). */
export function leaveRoom(): void {
  clearTimeout(joinTimer);
  if (link) { link.send('ctl', { t: 'bye' }); link.leave(); }
  link = null;
  for (const peer of session.peers.values()) dropPlayer(peer);
  session.peers.clear();
  session.status = 'off';
  session.hostId = '';
  session.biome = null;
  role.current = 'solo';
  stopSync();
  actions = [];
  G.player.slot = 0;
  placeSpawns();
  // back to our own battleground
  if (G.mode === 'menu') showBiomeSetting();
  // an invite link in the address bar would join again on reload
  if (invitedRoom()) history.replaceState(null, '', location.pathname);
  hooks?.changed();
}

function fail(why: string): void {
  leaveRoom();
  session.status = 'failed';
  session.error = why;
  hooks.changed();
}

function wire(l: Link): void {
  l.onJoin((peer) => {
    // a guest introduces itself to everyone it meets; the host answers with a slot
    if (role.current === 'guest' || session.status === 'joining') send('hello', hello(), peer);
  });
  l.onLeave((peer) => peerLeft(peer));
  l.onMessage((ch, data, from) => {
    const m = data as Record<string, unknown>;
    if (ch === 'hello') onHello(from, m);
    else if (ch === 'look') onLook(from, m as unknown as Look);
    else if (ch === 'pl') onState(from, m as unknown as StateMsg);
    else if (ch === 'ev') onActions(from, m as unknown as PlayerAction[]);
    else if (ch === 'w') onWorld(m);
    else if (ch === 'ctl') onControl(from, m);
  });
  if (session.status === 'joining') role.current = 'guest';
}

const hello = () => ({ v: PROTOCOL, look: myLook(), slot: G.player.slot, host: role.current === 'host' });

function send(ch: Parameters<Link['send']>[0], data: unknown, to?: string): void { link?.send(ch, data, to); }

function onHello(from: string, m: Record<string, unknown>): void {
  if (m.v !== PROTOCOL) {
    if (role.current === 'host') send('ctl', { t: 'refuse', why: 'version' }, from);
    return;
  }
  const look = m.look as Look;
  if (role.current === 'host') {
    // a new guest: a free slot, if the party has room (and no run is on: joining mid-run waits)
    if (session.peers.has(from)) return;
    const used = new Set([0, ...[...session.peers.values()].map((p) => p.slot)]);
    let slot = 1;
    while (used.has(slot)) slot++;
    if (slot >= COOP.maxPlayers) { send('ctl', { t: 'refuse', why: 'full' }, from); return; }
    addPeer(from, slot, look);
    send('ctl', { t: 'welcome', slot, biome: G.arena.biome, wave: session.wave, inRun: G.mode === 'run' }, from);
    send('hello', hello(), from);
    hooks.changed();
    return;
  }
  // a guest meets the host (or another guest)
  const slot = m.slot as number;
  if (m.host) session.hostId = from;
  if (!session.peers.has(from) && slot >= 0) addPeer(from, slot, look);
  hooks.changed();
}

function onControl(from: string, m: Record<string, unknown>): void {
  if (m.t === 'bye') { peerLeft(from); return; }
  if (role.current === 'guest') {
    if (m.t === 'welcome') {
      clearTimeout(joinTimer);
      session.status = 'joined';
      session.hostId = from;
      G.player.slot = m.slot as number;
      session.biome = m.biome as BiomeId;
      session.wave = m.wave as number;
      if (G.mode === 'menu' && BIOME_IDS.includes(session.biome)) G.arena.setBiome(session.biome);
      placeSpawns();
      // step over to our side of the spawn
      if (G.mode === 'menu') G.player.place(G.player.spawn, G.player.facing);
      send('hello', hello());   // our slot, to everyone
      hooks.changed();
    } else if (m.t === 'refuse') {
      fail(m.why === 'full' ? 'That room is full.' : 'That game is on another version: both reload the page to play together.');
    } else if (m.t === 'lobby') {
      session.biome = m.biome as BiomeId;
      session.wave = m.wave as number;
      if (G.mode === 'menu') G.arena.setBiome(session.biome);
      hooks.changed();
    } else if (m.t === 'start' && G.mode === 'menu') {
      const host = session.peers.get(from);
      if (host) host.inRun = true;
      hooks.startRun(m.biome as BiomeId, m.wave as number);
    }
    return;
  }
  // host: a guest's choices in the run
  const peer = session.peers.get(from);
  if (peer?.player) onGuestControl(peer.player, m);
}

function onLook(from: string, look: Look): void {
  const peer = session.peers.get(from);
  if (!peer || !CLASSES[look.cls]) return;
  peer.look = look;
  // a new class is a new character; new gear re-dresses the one there
  if (peer.player && peer.player.cls.id === look.cls) {
    peer.player.recomputeStats(look.eq);
  } else {
    const at = peer.player?.pos.clone(), facing = peer.player?.facing ?? Math.PI;
    dropPlayer(peer);
    makePlayer(peer);
    if (at) peer.player!.place(at, facing);
  }
  hooks.changed();
}

interface StateMsg { x: number; z: number; vx: number; vz: number; f: number; ax: number; az: number; run: 0 | 1; rv: 0 | 1; e: number }

function onState(from: string, m: StateMsg): void {
  const peer = session.peers.get(from);
  const p = peer?.player;
  if (!peer || !p) return;
  const r = p.remote;
  r.x = m.x; r.z = m.z; r.vx = m.vx; r.vz = m.vz; r.f = m.f; r.ax = m.ax; r.az = m.az; r.at = performance.now();
  p.reviving = m.rv === 1;
  if (role.current === 'guest' || !G.run) p.energy = m.e * p.stats.maxEnergy;
  const inRun = m.run === 1;
  if (inRun !== peer.inRun) { peer.inRun = inRun; syncAway(); hooks.changed(); }
}

function onActions(from: string, list: PlayerAction[]): void {
  const p = session.peers.get(from)?.player;
  if (!p || p.away) return;
  for (const a of list) p.replay(a);
}

// --- players -------------------------------------------------------------------------------
function addPeer(id: string, slot: number, look: Look): void {
  const peer: Peer = { id, slot, player: null, look, inRun: false };
  session.peers.set(id, peer);
  makePlayer(peer);
}

function makePlayer(peer: Peer): void {
  if (!peer.look || !CLASSES[peer.look.cls]) return;
  const p = new Player(peer.look.cls, peer.look.eq, false);
  p.slot = peer.slot;
  peer.player = p;
  G.players.push(p);
  placeSpawns();
  p.reset();
  syncAway();
}

function dropPlayer(peer: Peer): void {
  const p = peer.player;
  if (!p) return;
  p.dispose();
  G.players.splice(G.players.indexOf(p), 1);
  for (const e of G.enemies) if (e.target === p) e.target = null;
  peer.player = null;
}

function peerLeft(id: string): void {
  const peer = session.peers.get(id);
  if (!peer) return;
  const wasHost = id === session.hostId;
  dropPlayer(peer);
  session.peers.delete(id);
  if (wasHost) { hooks.hostGone(); leaveRoom(); return; }
  hooks.changed();
}

/** Spawn points side by side, by slot (solo: the middle). */
function placeSpawns(): void {
  const n = role.current === 'solo' ? 1 : COOP.maxPlayers;
  for (const p of G.players) {
    const k = n === 1 ? 0 : (p.slot / (n - 1) - 0.5) * 2.4;
    p.spawn.set(k, 0, 3);
  }
}

/** A partner in the other place (the lobby while we're in a run, or the other way round) isn't shown. */
export function syncAway(): void {
  for (const peer of session.peers.values()) {
    const p = peer.player;
    if (!p) continue;
    p.away = peer.inRun !== (G.mode === 'run');
    p.show(!p.away && p.out !== 'banked');
  }
}

/** The local player's class or gear changed: show the others. */
export function sendLook(): void { send('look', myLook()); }

/** The host's lobby choices (battleground, starting wave), shown to the guests. */
export function sendLobby(biome: BiomeId, wave: number): void {
  session.wave = wave;
  if (role.current === 'host') send('ctl', { t: 'lobby', biome, wave });
}

/** The host starts a run: the guests in the lobby come along. */
export function sendStart(biome: BiomeId, wave: number): void {
  if (role.current !== 'host') return;
  for (const peer of session.peers.values()) if (!peer.inRun) send('ctl', { t: 'start', biome, wave }, peer.id);
  // they're in from now on (their reports will say so too)
  for (const peer of session.peers.values()) peer.inRun = true;
  syncAway();
}

/** A guest's choice in the run, for the host. */
export function sendControl(m: Record<string, unknown>): void { if (session.hostId) send('ctl', m, session.hostId); }

/** The partners in the room, whether or not they're in the arena with us. */
export const partners = (): Player[] => [...session.peers.values()].flatMap((p) => (p.player ? [p.player] : []));

/** A partner still in a run (finishing one, or one we're not in). */
export const partnerInRun = (): boolean => [...session.peers.values()].some((p) => p.inRun);


/** Every frame: report the local player (and the fight, on the host) at the send rate. */
export function updateSession(dt: number, reviving: boolean): void {
  if (!link) return;
  if (actions.length) { send('ev', actions); actions = []; }
  sendT -= dt;
  const due = sendT <= 0;
  if (due) {
    sendT = 1 / COOP.sendRate;
    const p = G.player, s = p.stats;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    send('pl', {
      x: r2(p.pos.x), z: r2(p.pos.z), vx: r2(p.vel.x), vz: r2(p.vel.z), f: r2(p.facing), ax: r2(p.aim.x), az: r2(p.aim.z),
      run: G.mode === 'run' ? 1 : 0, rv: reviving ? 1 : 0, e: r2(p.energy / s.maxEnergy),
    } satisfies StateMsg);
  }
  // the fight's events go out every frame, its snapshot at the send rate
  if (role.current === 'host' && G.mode === 'run') sendWorld((m) => send('w', m), due);
}
