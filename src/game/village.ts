// The village's objects at work (data/village.ts says where each stands and what it does; world/village.ts builds them):
// the one the hero is near, its name over it and what using it does; using it (E, or the touch Use button, near it; a
// click or a tap on it from anywhere, which walks him there first); the panel or card a use opened put away as he walks
// off; and his skills cast in the training yard alone. In the top view the pointer picks an object; in the close views
// the one he's near, E using it.
import * as THREE from 'three';
import { seeFrom, seenShareAt, sightWalls } from '../core/sight';
import {
  fadeWhole, HALL_WALL_KINDS, type HallWallKind, openThroughDoor, propsLeftWhole, ROOF_GHOST_ABOVE,
} from '../core/seeThrough';
import { G } from '../state';
import { RUN } from '../data/balance';
import { VILLAGE_OBJECTS, YARD, worldToYard, type VillageObject } from '../data/village';
import { input, wasPressed, cylinder } from '../core/input';
import { viewMode } from '../core/renderer';
import { groundHeight } from '../world/ground';
import { anchorLabel, promptArt, textArt } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { OUTLINE } from '../ui/overlay/paint';
import { want } from './warm';
import { stands, walkLength } from '../world/walkPath';
import { completeStep } from './training';
import { HALL, TERRACE, inHall } from '../data/village';
import { inHallsBulk } from '../world/village';
import { meadowFromAbove } from '../world/meadow';
import { CLASS_IDS } from '../data/classes/index';
import { LAMP_SOFT } from '../core/lamps';
import { on } from '../events';
import { standHeroes } from './hall';
import { isWarm } from './warm';
import { flash, release, type LightSlot } from '../fx/lights';
import { lampsOut, lightLamp, placeLamps, type LampPlace } from '../core/lamps';
import { RUNNING } from '../core/rendererChoice';
import { bakeLampShadows } from '../world/lampAtlas';
import { drawLampShadows, lampShadow } from '../world/props';

export interface VillageHooks {
  /** `object` used: its panel, its card or its screen opened */
  use(object: VillageObject): void;
  /** the hero walked off from `object`, whose panel or card is open: put it away */
  leave(object: VillageObject): void;
  /** whether the village takes the hero's input now (the lobby up, nothing over it) */
  active(): boolean;
  /** whether what `object` opened is still up (its panel, card or dialog) */
  shows(object: VillageObject): boolean;
}

/** how near the chest or the chronicle the hero comes before its lid opens or its candle lights, and how far he goes
 *  before it shuts or goes out (m): inside
 *  its reach, or it opened for everyone going through the middle of the hall's door beside it */
const WAKES = { near: 2.0, far: 2.15 };
/** how far past an object's reach the hero may walk before what it opened is put away (m) */
const LEAVE = 1.5;
/** how far apart in height the hero and an object may stand for him to use it (m: the terrace's chest from under it) */
const LEVEL = 0.9;
/** how near the hall the hero comes before its heroes are readied, if they aren't yet (m) */
const HALL_NEAR = 22;
/** how near the hall's door (m) the other heroes stand on its dais with the door in view, as inside it: from the stair
 *  the dais stood empty through the door ("on approach heroes are not there"). Stood from anywhere on the square, their
 *  builds' poses and draws took 5 ms of a frame's CPU and 400 draws (a perf report from play) */
const HALL_SEEN = 12;
/** how far before the hall's door its portico reaches (m), where a camera looking in sees no grass but through it */
const PORTICO_DEEP = 3;
/** how far into the yard the hero must stand to cast (m in from its fence) */
const YARD_IN = 0.2;
/** an object's column for the pointer: as wide as its reach's share, and up to its name */
const PICK_SHARE = 0.55, PICK_MOST = 2.6;

/** the street lamps' light (`lightLamps`): its colour, intensity (a point light's, in candela), reach (m) and how far
 *  under the lantern's middle it burns. From play: "lights are lame": pools drawn on the ground lit nothing round them */
const LAMPLIGHT = { color: 0xffb46a, intensity: 85, distance: 18, below: 0 };
/** the hall's torches as the pool lights them: brighter and nearer than a street lamp (lit like one, the hall stood
 *  dark round its heroes) */
const TORCHLIGHT = { intensity: 6, distance: 9, dais: 2, daisIntensity: 16, daisDistance: 8, door: 6, porchIntensity: 10 };
/** how many of the lamps lit, the brightest, cast shadows (from play, "need shadow from lights too"): the village's
 *  two casting lights, the hall's braziers', handed to them while they're lit, so the count every lit program is made
 *  for stays two and nothing compiles */
const LAMP_SHADOWS = 2;

let hooks: VillageHooks;
/** the object the hero is near (the one E uses), the pointer's (top view), the one he's walking to use, and the one
 *  whose panel or card is open */
let near: VillageObject | null = null, pointed: VillageObject | null = null, going: VillageObject | null = null;
let opened: VillageObject | null = null;
/** each object's name over it, and what it last said */
const labels = new Map<string, { label: Label; says: string }>();

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const _to = new THREE.Vector3();

/** the most light a highlight on a hero reflects here (`Player.shine`): a lamp over his steel, a glint on an axe's head
 *  and a shield's rim burned white and bloomed */
const VILLAGE_SHINE = 0.55;
/** how fast what he can't see blacks as the view comes down from above (the whole of it a second) */
const SIGHT_EASES = 3;
/** whether the place's walls were told to what he can see */
let sightTold = false;
/** how far before a plinth's hero the hall's hint stands (m) */
const HERO_HINT_BEFORE = 0.8;

/** The plinth of the hero standing nearest the way the camera looks from the hero, or from above, where it looks the
 *  same way wherever he stands and picked the one hero from every spot, nearest the hero himself (his own class's
 *  stands empty; "in top down, the hero selection is not based on proximity"; `lab village --only heroPickedNear`). */
export function heroLookedAt(): number {
  const p = G.player.pos;
  const sight = G.camera.getWorldDirection(_to);
  const fromAbove = viewMode() === 'top';
  let best = 0;
  let bestAim = -Infinity;
  HALL.plinths.forEach((x, i) => {
    if (CLASS_IDS[i] === G.player.cls.id) return;
    const dx = TERRACE.x + x - p.x, dz = HALL.plinthZ - p.z;
    const aim = fromAbove ? -Math.hypot(dx, dz)
      : (dx * sight.x + dz * sight.z) / Math.max(1e-3, Math.hypot(dx, dz) * Math.hypot(sight.x, sight.z));
    if (aim > bestAim) {
      bestAim = aim;
      best = i;
    }
  });
  return best;
}

/** The village's objects set going: their names over them, the pointer's picks. */
export function initVillage(h: VillageHooks): void {
  hooks = h;
  for (const o of VILLAGE_OBJECTS) {
    const at = (): { x: number; y: number; z: number } | null => {
      if (!named(o)) return null;
      // (on the hero he looks at, not the dais's middle, his own empty plinth there as often as not)
      if (o.use !== 'heroes') return { x: o.at[0], y: floorAt(o) + o.label, z: o.at[1] };
      return { x: TERRACE.x + HALL.plinths[heroLookedAt()], y: floorAt(o) + o.label, z: HALL.plinthZ + HERO_HINT_BEFORE };
    };
    const label = anchorLabel(ORDER.tag, at, true);
    // (its middle on the point: standing on it, the plate rose off a lectern's post over the book it named)
    label.ay = 0.5;
    labels.set(o.id, { label, says: '' });
  }
  bindPointer();
}

/** the floor's height under an object */
const floorAt = (o: VillageObject): number => groundHeight(o.at[0], o.at[1]);

/** Whether `o`'s name shows: the hero is near it or walking to it, or the pointer is on it. On touch the Use button
 *  names the one near, and its name over it stood under the button in the screen's corner. */
const named = (o: VillageObject): boolean => {
  if (!hooks.active() || opened === o) return false;
  if (o === near) return !input.touchMode;
  return o === pointed || o === going;
};

/** whether the chest stands open and the chronicle's candle lit for the hero (`wakeByHero`) */
let chestOpen = false, candleLit = false;

/** How far the hero is from `o` (m, across the floor), or Infinity where he stands on another level. */
function distanceTo(o: VillageObject): number {
  const p = G.player.pos;
  if (Math.abs(groundHeight(p.x, p.z) - floorAt(o)) > LEVEL) return Infinity;
  return Math.hypot(p.x - o.at[0], p.z - o.at[1]);
}

/** Whether what `id` is stands awake as the hero comes and goes, from whether it was (`on`: he walks the village). */
function awake(id: string, was: boolean, on: boolean): boolean {
  const o = villageObject(id);
  const off = on && o ? distanceTo(o) : Infinity;
  return off < WAKES.near || (was && off <= WAKES.far);
}

/** The chest's lid opened and the chronicle's candle lit as the hero comes to them, shut and out as he leaves. */
function wakeByHero(on: boolean): void {
  chestOpen = awake('chest', chestOpen, on);
  candleLit = awake('chronicle', candleLit, on);
  G.arena.village.setChestNear(chestOpen);
  G.arena.village.setCandleNear(candleLit);
  G.arena.village.setChestFull(G.profile.stash.length / RUN.bagLimit);
}

/** The object the hero is near enough to use (the nearest), or null. */
function nearest(): VillageObject | null {
  let best: VillageObject | null = null, bestD = Infinity;
  for (const o of VILLAGE_OBJECTS) {
    const d = distanceTo(o);
    if (d < o.reach && d < bestD) { best = o; bestD = d; }
  }
  return best;
}

/** The object whose column a ray from the eye enters first, or null. */
function objectAlong(r: THREE.Ray): VillageObject | null {
  let best: VillageObject | null = null, bestT = Infinity;
  for (const o of VILLAGE_OBJECTS) {
    const y0 = floorAt(o), rad = Math.min(PICK_MOST, o.reach * PICK_SHARE);
    const t = cylinder(r, o.at[0], o.at[1], rad, y0, y0 + o.tall + 0.3);
    if (t < bestT) { best = o; bestT = t; }
  }
  return best;
}

/** The object under a point of the screen (client px), in the top view, or null. */
function objectAt(x: number, y: number): VillageObject | null {
  if (!hooks.active() || viewMode() !== 'top') return null;
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  return objectAlong(ray.ray);
}

/** `o` used now if the hero is near it, else walked to and used as he gets there. */
export function goUse(o: VillageObject): void {
  if (distanceTo(o) < o.reach) { useNow(o); return; }
  going = o;
  const [x, z] = spotToUse(o);
  G.player.walkTo = new THREE.Vector3(x, 0, z);
}

/** the places round an object's reach looked at for the nearest to walk to, and how far in from its edge they are (m) */
const REACH_SPOTS = 24;
const REACH_IN = 0.15;

/** The nearest place by his way there from which `o` can be used: its reach's edge wherever a body stands on its level.
 *  Walked to `stand`, a place on one side of it, he went round the campfire and its logs to get there, from play, "when I
 *  click on campfire, hero moves in from the left side, it should be the shortest path". */
export function spotToUse(o: VillageObject): [number, number] {
  const p = G.player;
  let best: [number, number] = [o.stand[0], o.stand[1]];
  let bestWay = walkLength(p.pos.x, p.pos.z, best[0], best[1], p.radius);
  for (let spot = 0; spot < REACH_SPOTS; spot++) {
    const round = (spot / REACH_SPOTS) * Math.PI * 2;
    const x = o.at[0] + Math.sin(round) * (o.reach - REACH_IN);
    const z = o.at[1] + Math.cos(round) * (o.reach - REACH_IN);
    if (Math.abs(groundHeight(x, z) - floorAt(o)) > LEVEL || !stands(x, z, p.radius)) continue;
    const way = walkLength(p.pos.x, p.pos.z, x, z, p.radius);
    if (way < bestWay) {
      best = [x, z];
      bestWay = way;
    }
  }
  return best;
}

/** The hero walked to (x, z), using nothing there (a place picked on the map: the training yard). */
export function goTo(x: number, z: number): void {
  going = null;
  G.player.walkTo = new THREE.Vector3(x, 0, z);
}

function useNow(o: VillageObject): void {
  going = null;
  G.player.walkTo = null;
  opened = o;
  hooks.use(o);
}

/** The panel or card `o` opened was put away (closed by its own button, Esc or I). */
export function closedFrom(o?: VillageObject): void { if (!o || opened === o) opened = null; }

/** The object the hero can use now (the touch Use button's, E's). */
export const objectNear = (): VillageObject | null => (hooks?.active() ? near : null);

/** The village's object of `id` (the lab, a panel naming where it was opened from). */
export const villageObject = (id: string): VillageObject | undefined => VILLAGE_OBJECTS.find((o) => o.id === id);

let armedAnywhere = false;
/** The hero armed wherever he stands (`lab village --only fountainStopsArrows`: there's no fountain in the yard). */
export function armedEverywhere(on: boolean): void {
  armedAnywhere = on;
}

/** Whether (x, z) is in the training yard, far enough in from its fence to cast. */
export function inYard(x: number, z: number): boolean {
  const [across, along] = worldToYard(x, z);
  return Math.abs(across) < YARD.halfX - YARD_IN && Math.abs(along) < YARD.halfZ - YARD_IN;
}

/** The pointer on the village's objects: over one, the hand cursor and its name; a click or a tap on one walks the hero
 *  to it and uses it (the press never reaches the game: no attack, no move stick). */
function bindPointer(): void {
  const canvas = G.renderer.domElement;
  const over = (e: MouseEvent): VillageObject | null => (e.target === canvas ? objectAt(e.clientX, e.clientY) : null);
  window.addEventListener('mousemove', (e) => {
    if (input.touchMode) return;
    const o = over(e);
    if (o === pointed) return;
    pointed = o;
    canvas.style.cursor = o ? 'var(--cursor-hand)' : '';
  });
  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const o = over(e);
    if (!o) return;
    e.preventDefault();
    e.stopPropagation();
    goUse(o);
  }, true);
}

/** The village's frame: what the hero is near and may use, his walk to an object, his casting (the yard alone), the
 *  names over the objects; nothing while the lobby isn't up. */
export function updateVillage(dt = 0): void {
  lightLamps(dt);
  // (from above alone: there the camera sees what he can't, and in any other view it stands where he does)
  const lobby = G.mode === 'menu' && G.arena.place === 'village' && !G.arena.hallShown;
  if (!sightTold) {
    sightTold = true;
    sightWalls(G.arena.village.sight.walls, G.arena.village.sight.hall, G.arena.village.sight.roofs);
  }
  seeFrom(G.player.pos.x, G.player.pos.z, lobby && viewMode() === 'top', Math.min(1, dt * SIGHT_EASES), dt);
  hallInside(dt);
  const on = hooks.active();
  const p = G.player;
  for (const hero of G.players) hero.shine = on ? VILLAGE_SHINE : 0;
  wakeByHero(on);
  p.armed = !on || armedAnywhere || inYard(p.pos.x, p.pos.z);
  if (on && inYard(p.pos.x, p.pos.z)) completeStep('yard');
  if (!on) {
    near = null;
    if (going) { going = null; p.walkTo = null; }
    if (G.mode !== 'menu') opened = null;
    syncLabels();
    return;
  }
  if (!p.walkTo) going = null;
  near = nearest();
  // (what it opened put away by its own button: E opens it again where he stands, as he hadn't walked off it, "when I
  // press got it, I cannot press E again until I move away")
  if (opened && !hooks.shows(opened)) opened = null;
  if (going && distanceTo(going) < going.reach) useNow(going);
  else if (near && wasPressed('e')) {
    // (E again puts it away, from play, "lets add option to dismiss with E as well"; the hall's screen has a place of its own)
    if (opened !== near) useNow(near);
    else if (near.use !== 'heroes') {
      opened = null;
      hooks.leave(near);
    }
  }
  if (opened && distanceTo(opened) > opened.reach + LEAVE) {
    const left = opened;
    opened = null;
    hooks.leave(left);
  }
  // (in the close views the pointer is the crosshair's, and picks nothing: the object near is named)
  if (viewMode() !== 'top') pointed = null;
  // (the other heroes readied as he nears their hall, where the warm-up behind the lobby hasn't yet)
  if (Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.door) < HALL_NEAR) want('heroes');
  syncLabels();
}

/** The hall of heroes as the hero walks into it: its roof, ceiling and front wall cut away over him (but through his eyes, which
 *  see them from under), and the other classes' heroes standing on its plinths while he's near and their programs
 *  are warm (readied as he nears it). */
function hallInside(dt: number): void {
  const village = G.arena.village, p = G.player;
  const lobby = G.mode === 'menu' && G.arena.place === 'village' && !G.arena.hallShown;
  const inside = lobby && inHall(p.pos.x, p.pos.z) && p.obj.position.y > TERRACE.high - 0.1;
  // (from above alone, in the hall and on its portico: over the shoulder the camera stands on his side of them, which
  // shows the room and a wall as a wall, from play "still seeing through walls from inside"; on the portico a hole round
  // him showed him alone, "need to show around him more")
  const view = viewMode();
  meadowFromAbove(view === 'top');
  const under = lobby && p.obj.position.y > TERRACE.high - 0.1 && Math.abs(p.pos.x - TERRACE.x) < HALL.half
    && p.pos.z < HALL.door + PORTICO_DEEP;
  // (and wherever the hall stands between the camera and him: from behind it, a hole his own size showed him alone in
  // its roof, "it needs to match the previous screenshot, logically")
  const roofAway = (inside || under || (lobby && view === 'top' && hallHidesHim())) && view === 'top';
  // (thinned to a ghost over a moment: gone at a stroke, walls and door vanished as he stepped in, from play "why here
  // geometry disappears ... it should fade to semi transparent")
  // (further the deeper he is in: the front wall then lies over half the frame, a dark veil with hard edges, a review)
  const deep = THREE.MathUtils.clamp((HALL.door - p.pos.z) / WALL_DEEP, 0, 1);
  const wallGhost = WALL_GHOST + (DEEP_GHOST - WALL_GHOST) * deep;
  frontFade = THREE.MathUtils.damp(frontFade, roofAway ? wallGhost : 0, CUT_AWAY_FADE, dt);
  propsLeftWhole(roofAway);
  // (stood at the door, the wall over it hides what he sees through it: it's past him, so it doesn't thin of itself)
  const offDoor = p.pos.z - HALL.inFront;
  // (looking in: from over the room, the wall before him thins as any wall does)
  const atDoor = lobby && view === 'top' && Math.abs(p.pos.x - TERRACE.x) < HALL.half && G.camera.position.z > HALL.door
    ? (1 - THREE.MathUtils.smoothstep(offDoor, DOOR_CONE.near, DOOR_CONE.far)) * THREE.MathUtils.smoothstep(offDoor, DOOR_CONE.inFrom, DOOR_CONE.in)
      * seesThroughDoor()
    : 0;
  doorCone = THREE.MathUtils.damp(doorCone, atDoor * DOOR_CONE.ghost, CUT_AWAY_FADE, dt);
  openThroughDoor(doorCone < CUT_AWAY_NONE ? 0 : doorCone);
  // (a ghost from above whatever it hides, as every roof is: `ROOF_GHOST_ABOVE`; away while he sees in through the door,
  // as inside: a ghost over the room, from the stair the floor past the door showed a sliver of it under the roof)
  const seesIn = atDoor > AT_DOOR_CONE;
  const roofWanted = roofAway || seesIn ? ROOF_GHOST : lobby && view === 'top' ? ROOF_GHOST_ABOVE : 0;
  roofFade = THREE.MathUtils.damp(roofFade, roofWanted, CUT_AWAY_FADE, dt);
  // (each wall by itself: stood at the door, the one over it hides what he sees through it alone, which the cone opens)
  for (const wall of HALL_WALL_SIDES) {
    const wanted = roofAway && !wallsNoneHeld && (wallsAllThinHeld || (wallHidesNearHim(wall) && !(wall.kind === 'hallFront' && atDoor > AT_DOOR_CONE)));
    const was = wallFades.get(wall.kind) ?? 0;
    const fade = THREE.MathUtils.damp(was, wanted ? wallGhost : 0, CUT_AWAY_FADE, dt);
    wallFades.set(wall.kind, fade);
    fadeWhole(wall.kind, fade < CUT_AWAY_NONE ? 0 : fade);
  }
  // (and while he sees in through the door from the stair: it lay over the room past the door, the roof away)
  const beamThins = !wallsNoneHeld && ((roofAway && beamHidesHim()) || seesIn);
  beamFade = THREE.MathUtils.damp(beamFade, beamThins ? WALL_GHOST : 0, CUT_AWAY_FADE, dt);
  fadeWhole('hallBeam', beamFade < CUT_AWAY_NONE ? 0 : beamFade);
  lightHim(lobby && view === 'top' && inside ? 1 : 0, dt);
  fadeWhole('hallRoof', roofFade < CUT_AWAY_NONE ? 0 : roofFade > 1 - CUT_AWAY_NONE ? 1 : roofFade);
  // (what stands free before him further: through a hole his own size in a column he showed alone, from play "need to
  // show around him more, to give scene context, not just hero by itself")
  fadeWhole('hallColumn', frontFade < CUT_AWAY_NONE ? 0 : Math.min(frontFade / CUT_AWAY_GHOST, 1) * COLUMN_GHOST);
  // (from inside, the grass is seen through the doorway alone: walls and roof hid its 750k triangles, drawn all the
  // same; from above the roof is away, and all of it shows)
  village.meadow.visible = !(inside && view !== 'top' && cameraInHall() && !doorInView());
  const byDoor = Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.door) < HALL_SEEN;
  // (from above, the camera sees past the walls: while he can see a plinth, from play, "pedestals are empty from this
  // position, they should display heroes if character can see them from their cone of view")
  const seen = inside || (byDoor && (view === 'top' ? aPlinthSeen() : doorwayOnScreen()));
  const near = Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.door) < HALL_NEAR;
  standHeroes(lobby && seen && isWarm('heroes'), dt, lobby && near && isWarm('heroes'));
}

/** How much of the hall's floor just past its door he sees, by the rays round him (0 to 1). */
function seesThroughDoor(): number {
  return Math.max(...DOOR_CONE.floorIn.map((inside) => seenShareAt(TERRACE.x, HALL.inFront - inside)));
}

/** Whether he sees any plinth of the hall's, by the rays round him. */
function aPlinthSeen(): boolean {
  return HALL.plinths.some((across) => seenShareAt(TERRACE.x + across, HALL.plinthZ) > 0);
}

/** A wall of the hall on the floor: what thins it, which way it runs, its outer and inner faces, and how far along. */
interface HallWallSide {
  kind: HallWallKind;
  acrossX: boolean;
  outer: number;
  inner: number;
  from: number;
  to: number;
}

const HALL_THICK = HALL.half - HALL.inHalf;
/** The hall's walls, in `HALL_WALL_KINDS`' order. */
const HALL_WALL_SIDES: HallWallSide[] = (['hallFront', 'hallBack', 'hallEast', 'hallWest'] as const).map((kind) => {
  const alongX = { from: TERRACE.x - HALL.half, to: TERRACE.x + HALL.half };
  const alongZ = { from: HALL.wall - HALL_THICK, to: HALL.door };
  if (kind === 'hallFront') return { kind, acrossX: true, outer: HALL.door, inner: HALL.inFront, ...alongX };
  if (kind === 'hallBack') return { kind, acrossX: true, outer: HALL.wall - HALL_THICK, inner: HALL.wall, ...alongX };
  const side = kind === 'hallEast' ? 1 : -1;
  return { kind, acrossX: false, outer: TERRACE.x + side * HALL.half, inner: TERRACE.x + side * HALL.inHalf, ...alongZ };
});

/** the portico's beam as a box, and the heights of him a sight to him is read at (m over his floor) */
const BEAM = new THREE.Box3(
  new THREE.Vector3(TERRACE.x - HALL.half, TERRACE.high + HALL.beamFoot, HALL.beamZ - HALL.beamDeep / 2),
  new THREE.Vector3(TERRACE.x + HALL.half, TERRACE.high + HALL.wallHigh, HALL.beamZ + HALL.beamDeep / 2),
);
const HIS_HEIGHTS = [0.3, 1.1, 1.8];
const _sight = new THREE.Ray(), _sightTo = new THREE.Vector3(), _sightHit = new THREE.Vector3();

/** Whether the portico's beam stands between the camera and him: from along it, it lay over him whole, a review. */
function beamHidesHim(): boolean {
  const eye = G.camera.position, p = G.player;
  for (const up of HIS_HEIGHTS) {
    _sightTo.set(p.pos.x, p.obj.position.y + up, p.pos.z).sub(eye);
    const away = _sightTo.length();
    _sight.set(eye, _sightTo.divideScalar(away));
    if (_sight.intersectBox(BEAM, _sightHit) && _sightHit.distanceTo(eye) < away) return true;
  }
  return false;
}

/** the light he's lit by in the hall from above: a share of what a lamp gives, warm, short, and how high over him. The
 *  room's torches stand on its columns, and on its dark floor he stood as a dark figure, the thinning for nothing, a review */
const HERO_LIGHT = { color: 0xffd9a8, intensity: 38, distance: 8, over: 3.2, eases: 6 };
const _heroLightAt = new THREE.Vector3();
/** the pool's light he's lit by, how bright now, and whether a harness holds it off */
let heroLight: LightSlot | null = null;
let heroLightNow = 0;
let heroLightOffHeld = false;

/** For a harness (tools/lab): the light he's lit by in the hall held off. */
export function holdHeroLightOff(held: boolean): void {
  heroLightOffHeld = held;
}

/** His light in the hall eased to `wanted` (a share), taken from the pool while it burns. */
function lightHim(wanted: number, dt: number): void {
  heroLightNow = THREE.MathUtils.damp(heroLightNow, heroLightOffHeld ? 0 : wanted, HERO_LIGHT.eases, dt);
  const burning = heroLightNow > CUT_AWAY_NONE;
  if (burning && !heroLight) {
    heroLight = flash({
      color: HERO_LIGHT.color, intensity: 0, distance: HERO_LIGHT.distance, life: 1, hold: Infinity,
      follow: () => _heroLightAt,
    });
    // (soft close to, as a lamp is: by the square alone, a column a stride from him burned white, a review)
    heroLight.light.decay = 2 + LAMP_SOFT;
  }
  if (!heroLight) return;
  _heroLightAt.set(G.player.pos.x, G.player.obj.position.y + HERO_LIGHT.over, G.player.pos.z);
  heroLight.peak = HERO_LIGHT.intensity * heroLightNow;
  if (!burning) {
    release(heroLight);
    heroLight = null;
  }
}

/** how far round him the floor a wall hides counts (m), how many places on that round are read, and how open the cone
 *  through the door must be for it to stand in for the front wall */
const NEAR_HIM = 2.5;
const NEAR_PLACES = 12;
const AT_DOOR_CONE = 0.5;
/** how far each wall is thinned now */
const wallFades = new Map<HallWallKind, number>();

/** Whether the sight from the camera to a place on his floor at (x, z) meets `wall` under its top, the place on his side
 *  of it. */
function wallHidesPlace(wall: HallWallSide, x: number, z: number): boolean {
  const eye = G.camera.position, p = G.player;
  const middle = (wall.outer + wall.inner) / 2;
  const off = (wall.acrossX ? z : x) - middle;
  const eyeOff = (wall.acrossX ? eye.z : eye.x) - middle;
  const hisOff = (wall.acrossX ? p.pos.z : p.pos.x) - middle;
  if (off * eyeOff >= 0 || off * hisOff <= 0) return false;
  const near = Math.abs(eyeOff + middle - wall.outer) < Math.abs(eyeOff + middle - wall.inner) ? wall.outer : wall.inner;
  const along = (near - eyeOff - middle) / (off - eyeOff);
  const floor = p.obj.position.y;
  if (eye.y + (floor - eye.y) * along >= TERRACE.high + HALL.wallHigh) return false;
  const across = wall.acrossX ? eye.x + (x - eye.x) * along : eye.z + (z - eye.z) * along;
  return across > wall.from && across < wall.to;
}

/** Whether `wall` hides him or the floor round him: a wall the camera's past may hide nothing near him, its top under the
 *  sight (from play, "we should not try to make transparent the side which doesn't help see the hero"), and one that
 *  leaves him clear may hide all the floor beside him ("here both should be transparent, but only 1 is"). */
function wallHidesNearHim(wall: HallWallSide): boolean {
  const { x, z } = G.player.pos;
  if (wallHidesPlace(wall, x, z)) return true;
  for (let place = 0; place < NEAR_PLACES; place++) {
    const round = (place / NEAR_PLACES) * Math.PI * 2;
    if (wallHidesPlace(wall, x + Math.sin(round) * NEAR_HIM, z + Math.cos(round) * NEAR_HIM)) return true;
  }
  return false;
}

/** whether a harness has every wall of the hall thin while any does, as they did */
let wallsAllThinHeld = false;

/** For a harness (tools/lab): every wall of the hall thinned while any is, as they were. */
export function holdHallWallsAllThin(held: boolean): void {
  wallsAllThinHeld = held;
}

/** whether a harness holds every wall of the hall whole */
let wallsNoneHeld = false;

/** For a harness (tools/lab): every wall of the hall held whole. */
export function holdHallWallsNone(held: boolean): void {
  wallsNoneHeld = held;
}

/** how far the hall's front wall and roof are thinned now, how far over the hero inside (a share of their pixels), how
 *  fast they go, and the share under which they're whole */
let frontFade = 0, roofFade = 0, beamFade = 0;
const CUT_AWAY_GHOST = 0.72, CUT_AWAY_FADE = 8, CUT_AWAY_NONE = 0.01;
/** how far a wall before him thins by the door: at 72% he stood dim behind it, a figure in the dark (`hallWallsOneByOne`) */
const WALL_GHOST = 0.85;
/** how far the walls thin with him deep in the hall, and how far in from the door that is (m) */
const DEEP_GHOST = 0.93;
const WALL_DEEP = 6;
/** how far the roof thins: all of it, as it lies over all the room before him: thinned as the walls are the room lay
 *  under a dark veil, and at 90% its beams were left as thin stray lines across the frame, a review */
const ROOF_GHOST = 1;
/** how far what stands free in the hall thins, before him and from above (a share of its pixels) */
const COLUMN_GHOST = 0.55;
/** the cone he sees through the hall's door: how far from the door's inner face it's open whole and shut (m, out from it),
 *  from how far in it's shut and open whole, what share of what hides it is thinned, and how far in from the door the
 *  floor he must see through it lies (m, down its middle). Open while he sees in, as far out as the dais's heroes stand
 *  for him: shut from 4 m out, a step down the stair saw nothing of the room from above, where over the shoulder he
 *  saw in, from play "when player is down even one stair, then in top down he cannot see into the hall" */
const DOOR_CONE = { near: HALL_SEEN - 1.5, far: HALL_SEEN, inFrom: -0.5, in: -0.1, ghost: 0.85, floorIn: [0.5, 1.5, 3] };
/** how far that cone is open now */
let doorCone = 0;
const _door = new THREE.Box3(), _frustum = new THREE.Frustum(), _viewProj = new THREE.Matrix4();
const _look = new THREE.Vector3();
/** the heights on him the camera's line runs to (m), and the points read along each */
const HIDDEN_AT = [0.3, 1.1, 1.8];
const HIDDEN_STEPS = 24;

/** Whether the hall stands between the camera and him. */
function hallHidesHim(): boolean {
  const cam = G.camera.position, p = G.player;
  const dx = p.pos.x - cam.x, dz = p.pos.z - cam.z;
  for (const up of HIDDEN_AT) {
    const y = p.obj.position.y + up;
    // (short of him: he isn't before himself, and stood in its bulk's edge beside it, it hides nothing)
    for (let step = 1; step < HIDDEN_STEPS; step++) {
      const along = step / HIDDEN_STEPS;
      if (inHallsBulk(cam.x + dx * along, cam.y + (y - cam.y) * along, cam.z + dz * along)) return true;
    }
  }
  return false;
}

/** Whether the camera stands inside the hall's walls, or over the portico before them looking in (over the shoulder
 *  its front wall is away, and before it lies the terrace, bare). */
function cameraInHall(): boolean {
  const { x, z } = G.camera.position;
  return Math.abs(x - TERRACE.x) < HALL.half && z > HALL.wall && z < HALL.door + PORTICO_DEEP;
}

/** Whether the hall's doorway is in the camera's view: from the portico, whether it looks out of the hall at all
 *  (looking in, all before it is the terrace's bare stone and the hall; the doorway's box lay before it, and the
 *  grass's 750k triangles were drawn for nothing). */
function doorInView(): boolean {
  const cam = G.camera;
  if (cam.position.z > HALL.door) return cam.getWorldDirection(_look).z > -0.3;
  return doorwayOnScreen();
}

/** Whether the camera's view takes in the hall's doorway. */
function doorwayOnScreen(): boolean {
  const cam = G.camera, y0 = TERRACE.high;
  // (wider and deeper than the doorway: the camera's matrices are the last frame's, and turning to it the grass came late)
  // (and reaching out of the doorway, not into the hall: reaching in, a camera within its depth always saw it)
  _door.min.set(TERRACE.x - HALL.doorHalf - 1, y0, HALL.door);
  _door.max.set(TERRACE.x + HALL.doorHalf + 1, y0 + HALL.doorHigh, HALL.door + 1);
  _frustum.setFromProjectionMatrix(_viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return _frustum.intersectsBox(_door);
}

/** the pool's casting lights held for the lamps (`casters`), the lamps' colour, and whether their places are set */
let lampLights: LightSlot[] = [];
const LAMP_COLOR = new THREE.Color(LAMPLIGHT.color);
let lampsPlaced = false;

/** Every lamp in the list's order: the street lamps, the hall's torches (its dais's two first), the torches either
 *  side of its door. */
function allLamps(): THREE.Vector3[] {
  const village = G.arena.village;
  return [...village.lanterns, ...village.hallTorches, ...village.porchTorches];
}

/** Whether lamp `i` lights the hall's inside (its torches) or all round it (the street lamps, the door's torches). */
function lampInside(i: number): boolean {
  const village = G.arena.village, n = village.lanterns.length;
  return i >= n && i < n + village.hallTorches.length;
}

/** Lamp `i`'s light (in `allLamps`' order): its intensity now and its reach (m). */
function lampLight(i: number): { intensity: number; reach: number } {
  const village = G.arena.village, n = village.lanterns.length;
  if (i < n) return { intensity: LAMPLIGHT.intensity * village.night, reach: LAMPLIGHT.distance };
  if (i < n + TORCHLIGHT.dais) return { intensity: TORCHLIGHT.daisIntensity, reach: TORCHLIGHT.daisDistance };
  if (lampInside(i)) return { intensity: TORCHLIGHT.intensity, reach: TORCHLIGHT.distance };
  return { intensity: TORCHLIGHT.porchIntensity, reach: TORCHLIGHT.distance };
}

/** Every lamp (the street lamps' and the hall's torches') placed in the lit shaders' list, the hall's inside its
 *  shelter: the torches light it alone, the street lamps all but it. Returns their places. */
function placeTheLamps(): LampPlace[] {
  const shelter: [number, number, number, number] = [TERRACE.x - HALL.inHalf, HALL.wall, TERRACE.x + HALL.inHalf, HALL.inFront];
  const places = allLamps().map((at, i) => ({
    at: at.clone().setY(at.y - LAMPLIGHT.below), reach: lampLight(i).reach, inside: lampInside(i),
  }));
  placeLamps(shelter, places);
  return places;
}

/** The village's lamps placed in the lit shaders' list and their shadows of what stands still drawn, as the boot
 *  builds the world (`world/lampAtlas.ts`: a program of its own, compiled there and not at the first frame). */
export function prepareLamps(renderer: THREE.WebGLRenderer, village: THREE.Object3D): void {
  bakeLampShadows(renderer, village, placeTheLamps());
  lampsPlaced = true;
}

/**
 * Every lamp lit while the village is shown (none while the hall's room or a run is) by the lit shaders' lamps
 * (`core/lamps.ts`: its light at any distance, as a point light there lights): the street lamps by night, the hall's
 * torches always, each on its side of the hall's walls (switched over at its door, the street lamps went out as the
 * hero walked in, "lights turn off when I enter the hall"). Lit by the pool's lights at the three nearest the hero and
 * drawn as painted pools elsewhere, each lamp turned into lit ground as he walked up ("it looks lame"). The two nearest
 * him (in the hall, its dais's lights first) cast their shadows by the pool's casting lights (`castOnNearest`): each
 * takes its share of its lamp's light, shadowed, and the list lights the rest, so the light stays the same and only its
 * shadow comes in.
 */
function lightLamps(dt: number): void {
  const village = G.arena.village, p = G.player.pos;
  if (!lampsPlaced) {
    placeTheLamps();
    lampsPlaced = true;
  }
  const shown = G.mode === 'menu' && G.arena.place === 'village' && !G.arena.hallShown;
  if (!shown) {
    castFromLamps(false);
    for (const s of lampLights) release(s);
    lampLights = [];
    lampsOut();
    return;
  }
  // (inside the hall, or at its door, its dais's lights and the torches nearest him cast, by day too: its roof shades it
  // whatever the hour; outside, the street lamps nearest him by night)
  const onTerrace = G.player.obj.position.y > TERRACE.high - 0.1;
  const atDoor = Math.abs(p.x - TERRACE.x) < HALL.doorHalf * 2 && Math.abs(p.z - HALL.door) < TORCHLIGHT.door;
  const inside = onTerrace && (inHall(p.x, p.z) || atDoor);
  // (not on WebGPU: three's observer reads a render object's casting lights by the count it first drew with, and
  // threw as they changed; a lamp's shadow there has no depth copy to keep, `lampShadows.ts`)
  const casting = !RUNNING.webgpu && (inside || village.night > 0.01);
  if (!lampLights.length) {
    lampLights = Array.from({ length: LAMP_SHADOWS }, () => flash({ ...LAMPLIGHT, intensity: 0, life: 1, hold: Infinity }));
  }
  castFromLamps(casting);
  const n = village.lanterns.length;
  const near = inside ? village.hallTorches : village.lanterns, base = inside ? n : 0, dais = inside ? TORCHLIGHT.dais : 0;
  const nearest = !casting ? [] : near.map((l, i) => ({ i: base + i, d: i < dais ? -1 : Math.hypot(l.x - p.x, l.z - p.z) }))
    .sort((a, b) => a.d - b.d).slice(0, LAMP_SHADOWS).map((l) => l.i);
  if (casting) castOnNearest(nearest, dt);
  // (each lamp by the list, but what its casting light takes)
  const taken = new Map(casters.filter((c) => c.lamp >= 0).map((c) => [c.lamp, c.share]));
  const all = allLamps();
  for (let i = 0; i < all.length; i++) {
    lightLamp(i, LAMP_COLOR, lampLight(i).intensity * (1 - (taken.get(i) ?? 0)));
  }
  for (const [k, slot] of lampLights.entries()) {
    const { lamp, share } = casters[k];
    const light = lamp < 0 ? { intensity: 0, reach: LAMPLIGHT.distance } : lampLight(lamp);
    slot.peak = light.intensity * share;
    slot.light.distance = light.reach;
    slot.light.decay = 2 + LAMP_SOFT;
    if (lamp >= 0) slot.light.position.copy(all[lamp]).setY(all[lamp].y - LAMPLIGHT.below);
  }
}

/** whether the lamps' lights cast the shadows, the braziers' not */
let lampsCast = false;
/** how fast a lamp's shadow fades in or out (its share a second) */
const SHADOW_FADE = 2;
/** the casting lights' lamps (by lantern index, the torches' after; -1: none) and how much of each one's shadow shows
 *  (the first `LAMP_SHADOWS` held lights) */
const casters = Array.from({ length: LAMP_SHADOWS }, () => ({ lamp: -1, share: 0 }));

/**
 * The casting lights kept on the lamps nearest the hero (`near`), each shadow faded out before its light moves to
 * another lamp, drawn there once of what stands still (`lampShadow`) and faded in, by the share of its lamp's light it
 * takes from the lit shaders' list (`lightLamps`), its shadow whole: handed at once to whichever two lamps were lit
 * brightest, the shadows came and went as he walked ("shadows appear and disappear when walking next to them, it looks
 * lame").
 */
function castOnNearest(near: number[], dt: number): void {
  for (const [k, c] of casters.entries()) {
    const shadow = lampLights[k].light.shadow;
    const wanted = c.lamp >= 0 && near.includes(c.lamp);
    if (wanted) c.share = Math.min(1, c.share + dt * SHADOW_FADE);
    else c.share = Math.max(0, c.share - dt * SHADOW_FADE);
    if (!wanted && c.share === 0) c.lamp = -1;
    shadow.intensity = 1;
  }
  for (const lamp of near) {
    if (casters.some((c) => c.lamp === lamp)) continue;
    const free = casters.find((c) => c.lamp < 0);
    if (!free) break;
    free.lamp = lamp;
    free.share = 0;
    // (placed on it as the lights are, below, before its shadow is drawn there with the frame's still ones)
    drawLampShadows();
  }
}

// (at once: E at the dais opens the hall in this update, after `lightLamps`, and the frame drawn with the room's two
// casting lights and these compiled what it drew for four, 7.3 s, "choose hero in hall freezes for like 10sec")
on('hallShown', () => castFromLamps(false));

/**
 * The lamps' casting lights off for a draw of another place (a warm-up's), returning their undoing. By night, a biome
 * drawn to warm it with its own two beside these made every lit program for four inside that one draw, the page held up
 * 38 s on a cold cache ("when using a portal to the main game, it hangs"; `lab village --cold --only portalAtNight`).
 * Their shadows and shares are left as they are: this draw alone doesn't see them.
 */
export function lampsLetGo(): () => void {
  const casting = lampLights.map((slot) => slot.light).filter((light) => light.castShadow);
  for (const light of casting) light.castShadow = false;
  return () => {
    for (const light of casting) light.castShadow = true;
  };
}

/** The two casting lights' shadows handed to the lamps' (`castOnNearest`), or back to the braziers. */
function castFromLamps(on: boolean): void {
  if (on === lampsCast) return;
  lampsCast = on;
  for (const light of G.arena.village.stillLights) light.castShadow = !on;
  for (const [k, slot] of lampLights.entries()) if (k < LAMP_SHADOWS) lampShadow(slot.light, on);
  for (const c of casters) {
    c.lamp = -1;
    c.share = 0;
  }
}

/** Each object's name painted with what it says now: its name, or near it what using it does and how (E: on touch
 *  the one near has none, `named`). */
function syncLabels(): void {
  for (const o of VILLAGE_OBJECTS) {
    const l = labels.get(o.id)!;
    const says = o === near ? o.verb : o.name;
    if (says === l.says) continue;
    l.says = says;
    const look = { face: 'display', size: 14, weight: 700, spacing: 0.5 } as const;
    l.label.show(o === near ? promptArt('E', says, { ...look, color: '#ffe7b0' }) : textArt(says, { ...look, color: '#e8dcc8', shadows: OUTLINE }));
  }
}

/** The object `o`'s screen point of its name (the lab). */
export function labelPoint(o: VillageObject): THREE.Vector3 {
  return _to.set(o.at[0], floorAt(o) + o.label, o.at[1]);
}
