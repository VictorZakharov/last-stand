// tools/lab's co-op (`npm run lab -- coop`): two games playing together, the host's in the side's page and the
// guest's in a partner page, their messages carried by the lab with the delay a link of the given ping and jitter
// gives them (tools/lab/node/coop.mjs). Each page's BroadcastChannel, which the game's `?net=local` link talks over, is
// replaced by one the lab carries, so the two games talk as they would through the relay server, every frame on the
// lab's clock. What each game shows is recorded frame by frame and judged against what the other one has: how late
// and how roughly a hero or a foe follows where its own game has it, whether an arrow that struck a foe on the guest's
// screen counted on the host, and whether a blow the guest dodged on its screen hurt it.
import { G } from '../../../src/state';
import { input } from '../../../src/core/input';
import { cameraYaw } from '../../../src/core/renderer';
import { hostRoom, joinRoom, session } from '../../../src/net/session';
import { spawnEnemy } from '../../../src/entities/spawner';
import { clearEnemies, type Enemy } from '../../../src/entities/enemy';
import { Projectile } from '../../../src/combat/projectiles';
import type { EnemyId } from '../../../src/data/enemies';
import type { Player } from '../../../src/entities/player';
import type { Frame, Lab } from './lab';

/** Which game a page plays. */
export type Role = 'host' | 'guest';

/** A message a game sent: when (ms since the co-op began, on the lab's clock), on which channel, what. */
export interface Sent {
  at: number;
  name: string;
  data: unknown;
}

/** A message on its way to a game: when it arrives (ms since the co-op began), on which channel, what. */
export interface Arriving {
  due: number;
  name: string;
  data: unknown;
}

/** A point on the ground, x and z. */
export type XZ = [number, number];

/** A hero standing, down (to be raised) or dead. */
export type HeroState = 'up' | 'down' | 'dead';

/** A foe as one game shows it in one frame. */
export interface FoeSample {
  id: number;
  x: number;
  z: number;
  life: number;
  /** its attack, as shown, reached the moment its blow lands this frame */
  blow: boolean;
  /** this game's own hero is where that blow would land (in its reach and before it, the game's own rule) */
  inReach: boolean;
}

/** What one game shows in one frame of a scenario. */
export interface Sample {
  /** its own hero */
  self: XZ;
  /** its own hero's life */
  life: number;
  /** its own hero and its partner's as it shows them: standing (`up`), down waiting to be raised, or dead */
  standing: { self: HeroState; partner: HeroState | null };
  /** its partner's hero as it shows it (none before it has arrived) */
  partner: XZ | null;
  /** how it plays its partner's reports out (net/timeline, where this tree has one): how far behind the freshest it
   *  plays (ms), its clock's rate this frame, whether a stall held it at the newest report */
  playout: { behind: number; rate: number; held: boolean } | null;
  foes: FoeSample[];
  /** the foes its own hero's arrows struck this frame, by id, one entry an arrow */
  struck: number[];
  /** its own hero's arrows loosed this frame */
  loosed: number;
}

/** Where a page's co-op stands, for the lab to wait on. */
export interface CoopState {
  mode: string;
  status: string;
  /** the partners' heroes it has */
  partners: number;
}

/** A turn of frames the lab asks a page for: the messages arrived meanwhile, and what to play. */
export interface CoopTurn {
  arriving: Arriving[];
  frames: number;
  /** the scenario playing (none: standing still, nothing recorded) */
  scenario?: string;
}

/** What a turn of frames gave: the messages sent, where the co-op stands. */
export interface CoopTurnResult {
  sent: Sent[];
  state: CoopState;
}

/** A scenario the two heroes play, each one's input frame by frame. */
interface Scenario {
  about: string;
  /** frames recorded, once both heroes and the foes have settled */
  frames: number;
  host: XZ;
  guest: XZ;
  /** the foes the host spawns as it starts */
  foes: { type: EnemyId; at: XZ }[];
  /** the guest's life as it starts (unhurt by default) */
  guestLife?: number;
  /** the frames (after it settled) each game's screen is pictured at, with `--pictures` */
  pictures?: number[];
  hostInput(frame: number): Frame;
  guestInput(frame: number): Frame;
}

/** the frames a scenario plays before it is recorded: the heroes on their spots, their copies arrived */
export const SETTLE_FRAMES = 90;
/** the life every hero is given, so that no blow in a scenario brings one down */
const UNHURT = 1e6;
/** the life a foe is given, so that no arrow kills it */
const UNKILLED = 1e5;
/** the most an arrow ends from a foe's edge and still counts as having struck it */
const STRUCK_REACH = 0.8;
/** the eight ways round, as the keys held for each */
const ROUND = [['w'], ['w', 'd'], ['d'], ['d', 's'], ['s'], ['s', 'a'], ['a'], ['a', 'w']];

/** The keys of running round in a circle, each way for `frames` frames. */
function roundAt(frame: number, frames: number): string[] {
  return ROUND[Math.floor(frame / frames) % ROUND.length];
}

/** Zigzags up the screen, a stop now and then. */
function zigzagAt(frame: number): string[] {
  const beat = frame % 80;
  if (beat < 30) return ['w', 'a'];
  if (beat < 60) return ['w', 'd'];
  return [];
}

/** The partner page's hero walks the touch stick towards (dx, dz) in the world, or stands with none. */
function stickToward(dx: number, dz: number): void {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) {
    input.stick.x = 0;
    input.stick.y = 0;
    return;
  }
  const yaw = cameraYaw();
  const x = dx / length;
  const z = dz / length;
  input.stick.x = x * Math.cos(yaw) - z * Math.sin(yaw);
  input.stick.y = x * Math.sin(yaw) + z * Math.cos(yaw);
}

/** The foe nearest the local hero, as this game shows it. */
function nearestFoe(): Enemy | null {
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  for (const foe of G.enemies) {
    if (!foe.alive) continue;
    const distance = foe.pos.distanceTo(G.player.pos);
    if (distance < bestDistance) {
      best = foe;
      bestDistance = distance;
    }
  }
  return best;
}

/** the guest's reaction to a blow it sees coming, s into the foe's attack */
const REACTION = 0.15;
/** how long the guest runs from a blow it dodges, frames */
const FLEE_FRAMES = 40;

/**
 * The guest in `dodge`: it stands by the foe, and as it sees an attack begin it runs from every other one (a dodge)
 * and takes the rest standing; once away it walks back.
 */
class Dodger {
  private fleeing = 0;
  private dodgeNext = true;
  private seen: unknown = null;

  input(): Frame {
    const foe = nearestFoe();
    if (!foe) return {};
    const away = { x: G.player.pos.x - foe.pos.x, z: G.player.pos.z - foe.pos.z };
    const action = foe.action;
    if (action && action.name === 'attack' && action !== this.seen && action.t >= REACTION) {
      this.seen = action;
      if (this.dodgeNext) this.fleeing = FLEE_FRAMES;
      this.dodgeNext = !this.dodgeNext;
    }
    if (this.fleeing > 0) {
      this.fleeing--;
      stickToward(away.x, away.z);
    } else if (Math.hypot(away.x, away.z) > 1.6) stickToward(-away.x, -away.z);
    else stickToward(0, 0);
    return {};
  }
}

let dodger = new Dodger();

/** how near the host comes to raise the guest, m (inside the revive's reach) */
const RAISE_FROM = 1.4;

/** The host in `down`: it stands until it sees the guest down, then goes to it and holds the revive key. */
function raiseInput(): Frame {
  const partner = G.players.find((player) => !player.local);
  if (!partner?.downed) {
    stickToward(0, 0);
    return {};
  }
  const dx = partner.pos.x - G.player.pos.x;
  const dz = partner.pos.z - G.player.pos.z;
  if (Math.hypot(dx, dz) > RAISE_FROM) {
    stickToward(dx, dz);
    return {};
  }
  stickToward(0, 0);
  return { keys: ['e'] };
}

function stateOf(player: Player): HeroState {
  if (player.alive) return 'up';
  return player.downed ? 'down' : 'dead';
}

/** The guest in `shoot`: a tap at the foe every so often, aimed where its screen shows it. */
function shootInput(frame: number): Frame {
  const foe = nearestFoe();
  if (!foe) return {};
  const aim = foe.pos.clone();
  aim.y = foe.height * 0.6;
  return { aim, m0: frame % 36 < 2 };
}

const SCENARIOS: Record<string, Scenario> = {
  walk: {
    about: 'the host runs round in circles and the guest zigzags, stopping now and then',
    frames: 480,
    host: [9, 19],
    guest: [15, 23],
    foes: [],
    hostInput: (frame) => ({ keys: roundAt(frame, 12) }),
    guestInput: (frame) => ({ keys: zigzagAt(frame) }),
  },
  foes: {
    about: 'five foes chase the heroes, the host running back and forth',
    frames: 480,
    host: [9, 19],
    guest: [15, 23],
    foes: [
      { type: 'thornling', at: [4, 14] },
      { type: 'thornling', at: [3, 19] },
      { type: 'thornling', at: [7, 25] },
      { type: 'mossback', at: [17, 14] },
      { type: 'mossback', at: [19, 19] },
    ],
    hostInput: (frame) => ({ keys: Math.floor(frame / 50) % 2 ? ['a'] : ['d'] }),
    guestInput: () => ({}),
  },
  shoot: {
    about: 'a foe chases the host round in circles while the guest shoots at it',
    frames: 600,
    host: [6, 16],
    guest: [16, 25],
    foes: [{ type: 'mossback', at: [10, 12] }],
    hostInput: (frame) => ({ keys: roundAt(frame, 22) }),
    guestInput: shootInput,
  },
  dodge: {
    about: 'a foe attacks the guest, who runs from every other blow as it sees it coming',
    frames: 900,
    host: [-4, 22],
    guest: [12, 22],
    foes: [{ type: 'mossback', at: [12, 20.4] }],
    hostInput: () => ({}),
    guestInput: () => dodger.input(),
  },
  down: {
    about: 'a foe brings the guest down across the arena, and the host comes and raises it',
    frames: 720,
    host: [-10, -12],
    guest: [12, 22],
    foes: [{ type: 'mossback', at: [12, 20.4] }],
    guestLife: 1,
    pictures: [140, 330, 460, 540],
    hostInput: raiseInput,
    guestInput: () => ({}),
  },
};

/** The scenarios, by name, and what each plays. */
export const COOP_SCENARIOS = Object.fromEntries(Object.entries(SCENARIOS).map(([name, s]) => [name, s.about]));

/** The channels of this page's game and the messages in and out, as the lab carries them. */
const wire = {
  /** the lab's clock as the co-op began, ms */
  start: 0,
  outbox: [] as Sent[],
  inbox: [] as Arriving[],
  channels: new Set<LabChannel>(),
};

function wireTime(): number {
  return window.__labClock.t - wire.start;
}

/** Stands in for the browser's BroadcastChannel, which the game's `?net=local` link talks over. */
class LabChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly name: string) {
    wire.channels.add(this);
  }

  postMessage(data: unknown): void {
    wire.outbox.push({ at: wireTime(), name: this.name, data: structuredClone(data) });
  }

  close(): void {
    wire.channels.delete(this);
  }
}

/** Hands the game the messages that have arrived by the frame about to run, in the order they arrive. */
function deliver(): void {
  const by = wireTime() + window.__labClock.frame;
  while (wire.inbox.length && wire.inbox[0].due <= by) {
    const message = wire.inbox.shift()!;
    for (const channel of wire.channels) {
      if (channel.name === message.name) channel.onmessage?.({ data: message.data });
    }
  }
}

/** This page's role, the scenario it plays and what it recorded. */
const play = {
  role: 'host' as Role,
  scenario: '',
  frame: 0,
  samples: [] as Sample[],
  /** arrows seen in flight, so a new one is counted as loosed once */
  seen: new WeakSet<Projectile>(),
  /** where this frame's friendly arrows ended */
  ended: [] as XZ[],
  /** each foe's shown attack and how far through it was last frame */
  attacks: new Map<number, { action: unknown; share: number }>(),
};

/** Notes where each friendly arrow ends, to tell an arrow that struck a foe on this game's screen. */
function watchArrows(): void {
  const proto = Projectile.prototype as Projectile & { labWatched?: boolean };
  if (proto.labWatched) return;
  proto.labWatched = true;
  const kill = proto.kill;
  proto.kill = function (this: Projectile) {
    if (!this.hostile) play.ended.push([this.pos.x, this.pos.z]);
    return kill.call(this);
  };
}

/** The room opened (the host) or joined (the guest) over the lab's channels. Returns the room's code. */
export async function coopOpen(lab: Lab, { role, code }: { role: Role; code?: string }): Promise<string> {
  history.replaceState(null, '', `${location.pathname}?net=local`);
  (window as unknown as { BroadcastChannel: unknown }).BroadcastChannel = LabChannel;
  wire.start = window.__labClock.t;
  play.role = role;
  lab.beforeFrame.push(deliver);
  watchArrows();
  if (role === 'host') await hostRoom();
  else await joinRoom(code!);
  return session.code;
}

/** The host starts the run (its guest comes along). */
export function coopStart(): void {
  document.getElementById('btn-start')?.click();
}

function stateNow(): CoopState {
  return { mode: G.mode, status: session.status, partners: G.players.length - 1 };
}

/** The run's countdown held (no wave comes) and every hero kept from falling. */
function holdTheRun(): void {
  const run = G.run;
  if (run && play.role === 'host') {
    run.queue = [];
    run.phase = 'countdown';
    run.timer = Infinity;
  }
}

function makeUnhurt(player: Player): void {
  player.stats.maxLife = UNHURT;
  player.life = UNHURT;
}

/** Sets scenario `name` up on this page: its hero on its spot, the foes spawned on the host, nothing recorded yet. */
export function coopScenario(lab: Lab, { name }: { name: string }): void {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`lab: coop: no scenario ${name}`);
  play.scenario = name;
  play.frame = 0;
  play.samples = [];
  play.attacks.clear();
  dodger = new Dodger();
  stickToward(0, 0);
  if (!lab.beforeFrame.includes(holdTheRun)) lab.beforeFrame.push(holdTheRun);
  const [x, z] = play.role === 'host' ? scenario.host : scenario.guest;
  G.player.place(new lab.THREE.Vector3(x, 0, z), Math.PI);
  G.player.vel.set(0, 0, 0);
  for (const player of G.players) makeUnhurt(player);
  if (play.role === 'guest' && scenario.guestLife !== undefined) G.player.life = scenario.guestLife;
  // (on both: the host clears its foes without a word to the guest, whose copies of them would stay where they were)
  clearEnemies();
  if (play.role !== 'host') return;
  for (const foe of scenario.foes) {
    const enemy = spawnEnemy(foe.type, new lab.THREE.Vector3(foe.at[0], 0, foe.at[1]), { wave: 1 });
    enemy.life = UNKILLED;
  }
}

/** Runs a turn of frames: the messages arrived meanwhile handed over as they arrive, the scenario's input. */
export async function coopFrames(lab: Lab, turn: CoopTurn): Promise<CoopTurnResult> {
  wire.inbox.push(...turn.arriving);
  const scenario = turn.scenario ? SCENARIOS[turn.scenario] : null;
  const inputOf = (frame: number): Frame => {
    if (!scenario) return {};
    const at = play.frame + frame - SETTLE_FRAMES;
    if (at < 0) return {};
    return play.role === 'host' ? scenario.hostInput(at) : scenario.guestInput(at);
  };
  const record = (frame: number): void => {
    if (!scenario) return;
    const sample = sampleNow();
    if (play.frame + frame >= SETTLE_FRAMES) play.samples.push(sample);
  };
  await lab.step(turn.frames, inputOf, record);
  play.frame += turn.frames;
  return { sent: wire.outbox.splice(0), state: stateNow() };
}

/** How many frames scenario `name` records, and the frames its screens are pictured at. */
export function coopScenarioFrames(_lab: Lab, { name }: { name: string }): { frames: number; pictures: number[] } {
  return { frames: SCENARIOS[name].frames, pictures: SCENARIOS[name].pictures ?? [] };
}

/** Draws the game's frames as it does (on: for a picture) or skips the drawing (off). */
export function coopDrawing(lab: Lab, { on }: { on: boolean }): void {
  lab.drawing = on;
}

/** What this game recorded of the scenario. */
export function coopSamples(): Sample[] {
  return play.samples;
}

/** What this game shows this frame (called once a frame: it notes each foe's attack as it goes). */
function sampleNow(): Sample {
  const self = G.player;
  const partner = G.players.find((player) => !player.local);
  const sample: Sample = {
    self: [self.pos.x, self.pos.z],
    life: self.life,
    standing: { self: stateOf(self), partner: partner ? stateOf(partner) : null },
    partner: partner ? [partner.pos.x, partner.pos.z] : null,
    playout: playoutNow(),
    foes: G.enemies.filter((foe) => foe.alive).map((foe) => foeSample(foe, self)),
    struck: struckFoes(),
    loosed: loosedArrows(),
  };
  play.ended = [];
  return sample;
}

function foeSample(foe: Enemy, hero: Player): FoeSample {
  const action = foe.action;
  const def = foe.def;
  const hitAt = def.windup / (def.windup + def.recover);
  const share = action && action.name === 'attack' ? action.t / action.dur : -1;
  const last = play.attacks.get(foe.id);
  const fresh = !last || last.action !== action;
  const blow = share >= hitAt && (fresh || last.share < hitAt);
  play.attacks.set(foe.id, { action, share });
  const distance = Math.hypot(hero.pos.x - foe.pos.x, hero.pos.z - foe.pos.z);
  const inReach = distance < def.range + hero.radius + 0.3 && foe.inFront(hero.pos.x, hero.pos.z, 1.3);
  return { id: foe.id, x: foe.pos.x, z: foe.pos.z, life: foe.life, blow, inReach };
}

/** How this game plays its partner's reports out, where this tree's session has a timeline for it. */
function playoutNow(): Sample['playout'] {
  const peer = [...session.peers.values()][0] as { clock?: { behind: number; rate: number; held: boolean } } | undefined;
  const clock = peer?.clock;
  return clock ? { behind: clock.behind, rate: clock.rate, held: clock.held } : null;
}

/** The foes this frame's arrows ended on, as this game shows them. */
function struckFoes(): number[] {
  const struck: number[] = [];
  for (const [x, z] of play.ended) {
    const foe = G.enemies.find((enemy) => Math.hypot(enemy.pos.x - x, enemy.pos.z - z) < enemy.radius + STRUCK_REACH);
    if (foe) struck.push(foe.id);
  }
  return struck;
}

/** The local hero's arrows that went up this frame (on the host, its partner's replayed ones too). */
function loosedArrows(): number {
  let loosed = 0;
  for (const projectile of G.projectiles) {
    if (projectile.hostile || play.seen.has(projectile)) continue;
    play.seen.add(projectile);
    loosed++;
  }
  return loosed;
}
