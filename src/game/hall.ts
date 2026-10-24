// The hall of heroes: the hero selection screen's stage (ui/heroSelect.ts), in a room of its own shown in the biome's
// place (world/heroHall.ts). Every class's hero stands in a row on a plinth in his gear from the save slot in play, each a remote player's copy (its casts play for show, dealing nothing:
// net/role.ts `dealsDamage`), the lobby's own hero hidden meanwhile. The camera comes to the hero in focus, lit by a key
// light and a rim light from the pool (fx/lights.ts: the count never changes), and he shows off a skill of his as it
// arrives (`HallDef.showcase`). Every hero's programs are warm before it opens (game/warm.ts, the `heroes` need).
import * as THREE from 'three';
import { G } from '../state';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { Player } from '../entities/player';
import { loadProfile } from '../loot/profile';
import { clearEnemies } from '../entities/enemy';
import { clearProjectiles } from '../combat/projectiles';
import { clearEffects } from '../fx/effects';
import { flash, release, type LightSlot } from '../fx/lights';
import { particles } from '../fx/particles';
import { stageCamera, type Shot } from '../core/renderer';
import { angleDamp } from '../util';
import { groundHeight } from '../world/ground';
import { hallSpot } from '../world/heroHall';
import type { Profile } from '../types';

/** the way the heroes face (to the camera) */
const ROW = { facing: 0 };
/** The shot on the hero in focus: the camera `back` m in front of him at `high`, looking at him at `at` m up (over
 *  where he stands), both `upright` m higher on an upright screen (`frameHall`); the
 *  field of view, and how far it drifts round him (rad, with reduced motion none) over `driftS` s */
const SHOT = { back: 6.4, high: 1.15, at: 0.65, fov: 30, drift: 0.07, driftS: 14, upright: 0.3 };
/** The key light (warm, ahead of him and up to one side) and the rim light (cold, behind him), from the pool */
const KEY = { color: 0xffd2a0, intensity: 9, distance: 9, ahead: 2.2, side: 1.4, up: 2.25 };
const RIM = { color: 0x8fb4ff, intensity: 14, distance: 6, behind: 1.3, side: -0.8, up: 1.95 };
/** how fast a hero turns to his showcase's spot and back (`angleDamp`'s rate) */
const TURN = 9;
/** a drag along the row (ui/heroSelect.ts): how far past either end it may pull the camera (heroes), and how fast the
 *  camera follows it (`stageCamera`'s glide: about a frame and a half behind the finger) */
const DRAG = { over: 0.35, glide: 24 };
/** how long after the camera starts towards a hero he shows off his skill (s), and how long before he can again */
const SHOWCASE = { after: 0.8, again: 6 };

/** A hero of the hall: his class, the profile he wears, his copy, and his showcase's clock. */
export interface HallHero {
  id: string;
  profile: Profile;
  player: Player;
  /** game time his showcase is next due (Infinity: not until he's in focus again) */
  due: number;
  /** game time he last showed off */
  shown: number;
  /** the way he turns to face (the camera, or his showcase's spot) */
  facing: number;
  /** a showcase under way: the skill's spot and when it fires (game time), and when he faces the camera again */
  cast: { target: THREE.Vector3; fireAt: number; doneAt: number; drawn: boolean } | null;
}

let heroes: HallHero[] = [];
let focus = 0;
let lights: LightSlot[] = [];
/** the co-op partners' heroes the lobby showed, hidden while the hall is up (they'd stand in its room) */
let partners: Player[] = [];
let opened = 0;
/** how much further back than `SHOT.back` the camera stands, so the hero fits the room the screen leaves him
 *  (`frameHall`) */
let further = 1;
/** the camera's place along the row while the scene is dragged (heroes from the first; null: on the hero in focus) */
let dragged: number | null = null;
/** whether the shot is an upright screen's: looking at his middle, so he stands in the middle of the room above the
 *  panel, his head clear of the window's top (looking at his hips, as beside a panel, it was cut off) */
let upright = false;
const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const hallOpen = (): boolean => heroes.length > 0;
export const hallHeroes = (): readonly HallHero[] => heroes;
export const hallFocus = (): number => focus;

/** Where hero `i` of the row stands: on his plinth. */
const spot = (i: number): THREE.Vector3 => {
  const at = hallSpot(i);
  return at.setY(groundHeight(at.x, at.z));
};

/**
 * The hall built, the hero of class `focusId` in focus: the lobby's dummies and skill visuals cleared, its hero and
 * a co-op room's partners hidden. Each hero wears his profile in the save slot in play (the local hero's own, a class never played there its
 * starter gear, kept for it if it's chosen). The camera flies in from the lobby's view, or is there at once (`cut`: a
 * first visit's, under the loading screen).
 */
export function openHall(focusId: string, cut = false): void {
  if (hallOpen()) return;
  clearEnemies(); clearProjectiles(); clearEffects(); particles.clear();
  G.player.idle = true;
  G.player.show(false);
  partners = G.players.filter((p) => p !== G.player && p.obj.visible);
  for (const p of partners) p.show(false);
  G.arena.showHall(true);
  heroes = CLASS_IDS.map((id, i) => {
    const profile = id === G.profile.classId ? G.profile : loadProfile(id);
    const player = new Player(id, profile.equipped, false);
    const at = spot(i);
    player.spawn.copy(at);
    player.reset();
    place(player, at, ROW.facing);
    return { id, profile, player, due: Infinity, shown: -Infinity, facing: ROW.facing, cast: null };
  });
  opened = G.time;
  lights = [flash({ ...KEY, life: 1, hold: Infinity }), flash({ ...RIM, life: 1, hold: Infinity })];
  focusHall(Math.max(0, CLASS_IDS.indexOf(focusId)), cut);
}

/** The hall taken down, the lobby's hero shown again. */
export function closeHall(): void {
  if (!hallOpen()) return;
  for (const h of heroes) h.player.dispose();
  heroes = [];
  dragged = null;
  for (const l of lights) release(l);
  lights = [];
  clearProjectiles(); clearEffects(); particles.clear();
  G.arena.showHall(false);
  G.player.show(true);
  for (const p of partners) if (G.players.includes(p)) p.show(true);
  partners = [];
  G.player.idle = false;
  stageCamera(null);
}

/** Hero `i` in focus: the camera comes to him (`cut`: at once), and once it nears him he shows off his skill. */
export function focusHall(i: number, cut = false): void {
  const n = heroes.length;
  focus = ((i % n) + n) % n;
  for (const [j, h] of heroes.entries()) h.due = j === focus && G.time - h.shown > SHOWCASE.again ? G.time + SHOWCASE.after : Infinity;
  stageCamera(shotAlong(focus, G.time), cut || reduced());
}

/** The camera's place along the row: where a drag holds it, or on the hero in focus. */
export const hallAlong = (): number => dragged ?? focus;

/** The scene dragged: the camera held `along` the row (heroes from the first, a little past either end). */
export function dragHall(along: number): void {
  dragged = Math.max(-DRAG.over, Math.min(heroes.length - 1 + DRAG.over, along));
}

/** The drag let go `along` the row: the hero nearest in focus (returned). */
export function dropHall(along: number): number {
  dragged = null;
  const i = nearest(along);
  focusHall(i);
  return i;
}

/** The hero nearest `along` the row. */
const nearest = (along: number): number => Math.max(0, Math.min(heroes.length - 1, Math.round(along)));

/** The shot `along` the row at game time `t` (heroes from the first: on a hero, in front of him, drifting slowly
 *  round him; between two, between them), at the height of the plinth nearest (`glide`: how fast the camera follows
 *  it, `stageCamera`). */
function shotAlong(along: number, t: number, glide?: number): Shot {
  const at = hallSpot(along).setY(spot(nearest(along)).y);
  const yaw = reduced() ? 0 : Math.sin(((t - opened) / SHOT.driftS) * Math.PI * 2) * SHOT.drift;
  const back = SHOT.back * further;
  const lift = upright ? SHOT.upright : 0;
  const pos = new THREE.Vector3(at.x + Math.sin(yaw) * back, at.y + SHOT.high + lift, at.z + Math.cos(yaw) * back);
  return { pos, look: new THREE.Vector3(at.x, at.y + SHOT.at + lift, at.z), fov: SHOT.fov, glide };
}

/** The camera `k` times as far back as the shot's own (1 or more): an upright screen leaves the hero a share of its
 *  height above the panel, and he's framed for all of it at 1 (ui/heroSelect.ts `layOut`); `up`: an upright
 *  screen's shot. */
export function frameHall(k: number, up = false): void {
  further = k;
  upright = up;
}

/** Stand a remote copy at `at`, facing `facing`: its reports, as its game would send them. */
function place(p: Player, at: THREE.Vector3, facing: number): void {
  Object.assign(p.remote, { x: at.x, z: at.z, vx: 0, vz: 0, f: facing, ax: at.x + Math.sin(facing) * 4, az: at.z + Math.cos(facing) * 4 });
  p.place(at, facing);
}

/** The hall's frame: each hero stepped, the one in focus showing off when due, the lights on him, the camera's
 *  drift. */
export function updateHall(dt: number): void {
  if (!hallOpen()) return;
  const t = G.time;
  for (const h of heroes) {
    if (t >= h.due) showOff(h, t);
    stepCast(h, t);
    const r = h.player.remote;
    r.f = angleDamp(r.f, h.facing, TURN, dt);
    r.ax = r.x + Math.sin(r.f) * 4; r.az = r.z + Math.cos(r.f) * 4;
    h.player.update(dt);
  }
  const at = spot(nearest(hallAlong()));
  const [key, rim] = lights;
  key.light.position.set(at.x + KEY.side, at.y + KEY.up, at.z + KEY.ahead);
  rim.light.position.set(at.x + RIM.side, at.y + RIM.up, at.z - RIM.behind);
  stageCamera(dragged === null ? shotAlong(focus, t) : shotAlong(dragged, t, DRAG.glide));
}

/** Hero `h` begins his showcase: the cast reported as his game would report it (a drawn shot drawn to full). */
function showOff(h: HallHero, t: number): void {
  h.due = Infinity;
  h.shown = t;
  const { skill, at } = CLASSES[h.id].hall.showcase;
  const known = h.player.known.get(skill);
  if (!known) return;
  const def = known.def, from = spot(heroes.indexOf(h));
  const f = ROW.facing, right = f - Math.PI / 2;
  const target = new THREE.Vector3(from.x + Math.sin(f) * at[0] + Math.sin(right) * at[1], 0, from.z + Math.cos(f) * at[0] + Math.cos(right) * at[1]);
  h.facing = Math.atan2(target.x - from.x, target.z - from.z);
  const drawn = def.draw !== undefined;
  // (a bow's arrows taken from the quiver first, as the hero's own cast reports it: without, he drew an empty string)
  const nockT = h.player.nockTime(known), n = nockT ? { n: nockT } : {};
  const dur = drawn ? def.draw! : nockT + def.castTime;
  const fireIn = nockT + (drawn ? def.draw! : def.castTime * (def.fireAt ?? 0.55));
  const aim = { x: target.x, z: target.z, ...n };
  h.player.replay(drawn ? { t: 'cast', s: skill, dur, h: 1, ...aim } : { t: 'cast', s: skill, dur, ...aim });
  h.cast = { target, fireAt: t + fireIn, doneAt: t + Math.max(dur, fireIn) + 0.9, drawn };
}

/** A showcase under way: fired when due, the hero turned back to the camera once it's done. */
function stepCast(h: HallHero, t: number): void {
  const c = h.cast;
  if (!c) return;
  if (t >= c.fireAt && c.fireAt > 0) {
    const p = h.player;
    const skill = CLASSES[h.id].hall.showcase.skill;
    p.replay({ t: 'fire', s: skill, x: c.target.x, z: c.target.z, px: p.pos.x, pz: p.pos.z, f: h.facing, ...(c.drawn ? { k: 1 } : {}) });
    c.fireAt = 0;
  }
  if (t >= c.doneAt) {
    h.cast = null;
    h.facing = ROW.facing;
  }
}
