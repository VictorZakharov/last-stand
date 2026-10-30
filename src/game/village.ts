// The village's objects at work (data/village.ts says where each stands and what it does; world/village.ts builds them):
// the one the hero is near, its name over it and what using it does; using it (E, or the touch Use button, near it; a
// click or a tap on it from anywhere, which walks him there first); the panel or card a use opened put away as he walks
// off; and his skills cast in the training yard alone. In the top view the pointer picks an object; in the close views
// the one he's near, E using it.
import * as THREE from 'three';
import { G } from '../state';
import { VILLAGE_OBJECTS, YARD, worldToYard, type VillageObject } from '../data/village';
import { input, wasPressed, cylinder } from '../core/input';
import { viewMode } from '../core/renderer';
import { groundHeight } from '../world/ground';
import { anchorLabel, textArt } from '../ui/floaters';
import { ORDER, type Label } from '../ui/overlay/layer';
import { OUTLINE } from '../ui/overlay/paint';
import { want } from './warm';
import { completeStep } from './training';
import { HALL, TERRACE, inHall } from '../data/village';
import { standHeroes } from './hall';
import { isWarm } from './warm';
import { flash, release, type LightSlot } from '../fx/lights';
import { lampsGlow, lightLamp, placeLamps, LAMP_REACH } from '../core/lamps';
import { drawLampShadows, lampShadow } from '../world/props';

export interface VillageHooks {
  /** `object` used: its panel, its card or its screen opened */
  use(object: VillageObject): void;
  /** the hero walked off from `object`, whose panel or card is open: put it away */
  leave(object: VillageObject): void;
  /** whether the village takes the hero's input now (the lobby up, nothing over it) */
  active(): boolean;
}

/** how far past an object's reach the hero may walk before what it opened is put away (m) */
const LEAVE = 1.5;
/** how far apart in height the hero and an object may stand for him to use it (m: the terrace's chest from under it) */
const LEVEL = 0.9;
/** how near the hall the hero comes before its heroes are readied, if they aren't yet (m) */
const HALL_NEAR = 22;
/** how near the hall's door (m, on the terrace) the other heroes stand on its dais, as inside it: stood from the
 *  square, their builds' poses and draws took 5 ms of a frame's CPU and 400 draws (a perf report from play) */
const HALL_SEEN = 7;
/** how far before the hall's door its portico reaches (m), where a camera looking in sees no grass but through it */
const PORTICO_DEEP = 3;
/** how far into the yard the hero must stand to cast (m in from its fence) */
const YARD_IN = 0.2;
/** an object's column for the pointer: as wide as its reach's share, and up to its name */
const PICK_SHARE = 0.55, PICK_MOST = 2.6;

/** the street lamps lit by the pool's lights (fx/lights.ts: their count never changes, so nothing compiles): how many
 *  lamps at once (the nearest the hero), the pool's lights held for them (one more, for a lamp fading out as another
 *  fades in), each lamp's light and how fast it fades in or out (a second's share). From play: "lights are lame":
 *  pools drawn on the ground lit nothing round them */
const LAMPLIGHT = { lit: 3, held: 5, color: 0xffb46a, intensity: 50, distance: LAMP_REACH, below: 0, fade: 2.5 };
/** the hall's torches as the pool lights them: brighter and nearer than a street lamp (lit like one, the hall stood
 *  dark round its heroes) */
const TORCHLIGHT = { intensity: 10, distance: 9, dais: 2, daisIntensity: 16, daisDistance: 8, door: 6 };
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

/** The village's objects set going: their names over them, the pointer's picks. */
export function initVillage(h: VillageHooks): void {
  hooks = h;
  for (const o of VILLAGE_OBJECTS) {
    const at = (): { x: number; y: number; z: number } | null => (named(o) ? { x: o.at[0], y: floorAt(o) + o.label, z: o.at[1] } : null);
    labels.set(o.id, { label: anchorLabel(ORDER.tag, at, true), says: '' });
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

/** How far the hero is from `o` (m, across the floor), or Infinity where he stands on another level. */
function distanceTo(o: VillageObject): number {
  const p = G.player.pos;
  if (Math.abs(groundHeight(p.x, p.z) - floorAt(o)) > LEVEL) return Infinity;
  return Math.hypot(p.x - o.at[0], p.z - o.at[1]);
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
    const t = cylinder(r, o.at[0], o.at[1], rad, y0, y0 + o.label + 0.3);
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
  G.player.walkTo = new THREE.Vector3(o.stand[0], 0, o.stand[1]);
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
  hallInside(dt);
  const on = hooks.active();
  const p = G.player;
  p.armed = !on || inYard(p.pos.x, p.pos.z);
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
  if (going && distanceTo(going) < going.reach) useNow(going);
  else if (near && wasPressed('e') && opened !== near) useNow(near);
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
  // (the roof from above alone: over the shoulder the camera is under its ceiling; the front wall over the shoulder
  // too, which the camera stands behind)
  const [roof, front] = village.hallCutaway, view = viewMode();
  roof.visible = !inside || view !== 'top';
  // (but kept with the camera inside its face: turned to the door, the hall's inside ended at nothing, from play
  // "should see inner walls from inside the hall")
  front.visible = !inside || view === 'first' || G.camera.position.z < HALL.inFront;
  // (from inside, the grass is seen through the doorway alone: walls and roof hid its 750k triangles, drawn all the
  // same; from above the roof is away, and all of it shows)
  village.meadow.visible = !(inside && view !== 'top' && cameraInHall() && !doorInView());
  const onTerrace = p.obj.position.y > TERRACE.high - 0.1;
  const seen = inside || (onTerrace && Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.door) < HALL_SEEN);
  const near = Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.door) < HALL_NEAR;
  standHeroes(lobby && seen && isWarm('heroes'), dt, lobby && near && isWarm('heroes'));
}

const _door = new THREE.Box3(), _frustum = new THREE.Frustum(), _viewProj = new THREE.Matrix4();
const _look = new THREE.Vector3();

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
  const cam = G.camera, y0 = TERRACE.high;
  if (cam.position.z > HALL.door) return cam.getWorldDirection(_look).z > -0.3;
  // (wider and deeper than the doorway: the camera's matrices are the last frame's, and turning to it the grass came late)
  // (and reaching out of the doorway, not into the hall: reaching in, a camera within its depth always saw it)
  _door.min.set(TERRACE.x - HALL.doorHalf - 1, y0, HALL.door);
  _door.max.set(TERRACE.x + HALL.doorHalf + 1, y0 + HALL.doorHigh, HALL.door + 1);
  _frustum.setFromProjectionMatrix(_viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  return _frustum.intersectsBox(_door);
}

/** the lamps lit now by the pool's lights (by lantern index) and how lit each is, and the pool's lights held for them */
const lampLit = new Map<number, number>();
let lampLights: LightSlot[] = [];
/** the street lamps' colour, how much of their light the lit shaders' lamps give (0 to 1: out by the hall's door, as
 *  the torches come in), and whether their places are set */
const STREET_LIGHT = new THREE.Color(LAMPLIGHT.color);
let streetLit = 0;
let lampsPlaced = false;

/**
 * Every street lamp lit by night while the village is shown (none while the hall's room or a run is), by the lit
 * shaders' lamps (`core/lamps.ts`: its light at any distance, as a point light there lights; lit by the pool's lights
 * at the three nearest the hero and drawn as painted pools on the ground elsewhere, each turned into lit ground as he
 * walked up, "it looks lame"), but the two nearest him, whose shadows the pool's casting lights draw (`castOnNearest`):
 * each of those takes its lamp's light over as it comes, its list's share given back as it goes, so the light stays the
 * same and only its shadow fades in. In the hall, its dais's lights and the torches nearest him, the lamps out.
 */
function lightLamps(dt: number): void {
  const village = G.arena.village, p = G.player.pos;
  if (!lampsPlaced) {
    placeLamps(village.lanterns.map((l) => l.clone().setY(l.y - LAMPLIGHT.below)));
    lampsPlaced = true;
  }
  // (inside the hall, or at its door, the lights on its dais and its torches, by day too: its roof shades it whatever
  // the hour, and from the door its heroes are seen at the far end)
  const onTerrace = G.player.obj.position.y > TERRACE.high - 0.1;
  const atDoor = Math.abs(p.x - TERRACE.x) < HALL.doorHalf * 2 && Math.abs(p.z - HALL.door) < TORCHLIGHT.door;
  const inside = onTerrace && (inHall(p.x, p.z) || atDoor);
  const lamps = inside ? village.hallTorches : village.lanterns, strength = inside ? 1 : village.night;
  const shown = G.mode === 'menu' && G.arena.place === 'village' && !G.arena.hallShown && strength > 0.01;
  if (!shown) {
    castFromLamps(false);
    for (const s of lampLights) release(s);
    lampLights = [];
    lampLit.clear();
    streetLit = 0;
    lampsGlow(STREET_LIGHT, 0);
    return;
  }
  if (!lampLights.length) {
    lampLights = Array.from({ length: LAMPLIGHT.held }, () => flash({ ...LAMPLIGHT, intensity: 0, life: 1, hold: Infinity }));
  }
  castFromLamps(true);
  // (a lamp is its list's index, the torches' after the lanterns', so walking in fades the lamps out and the torches in)
  const base = inside ? village.lanterns.length : 0;
  const lanterns = [...village.lanterns, ...village.hallTorches];
  // (in the hall its dais's lights always, the nearest torches with them)
  const dais = inside ? TORCHLIGHT.dais : 0;
  const nearest = lamps.map((l, i) => ({ i: base + i, d: i < dais ? -1 : Math.hypot(l.x - p.x, l.z - p.z) }))
    .sort((a, b) => a.d - b.d).slice(0, inside ? LAMPLIGHT.lit + 1 : LAMP_SHADOWS).map((l) => l.i);
  const wanted = new Set(nearest);
  for (const i of wanted) if (!lampLit.has(i)) lampLit.set(i, 0);
  for (const [i, k] of lampLit) {
    const to = wanted.has(i) ? 1 : 0, next = k + Math.sign(to - k) * Math.min(Math.abs(to - k), dt * LAMPLIGHT.fade);
    if (next <= 0 && !to) lampLit.delete(i); else lampLit.set(i, next);
  }
  castOnNearest(nearest.slice(0, LAMP_SHADOWS), dt);
  // (each lamp by the list as far as the pool's light doesn't light it; all out in the hall, fading as its door's walked)
  streetLit = Math.max(0, Math.min(1, streetLit + (inside ? -1 : 1) * dt * LAMPLIGHT.fade));
  lampsGlow(STREET_LIGHT, LAMPLIGHT.intensity * village.night * streetLit);
  for (let i = 0; i < village.lanterns.length; i++) lightLamp(i, 1 - (lampLit.get(i) ?? 0));
  // (the casting lights on their lamps, each other held light on a lit lamp, the brightest first; one more lamp than
  // lights waits dark for one to fade)
  const cast = new Set(casters.map((c) => c.lamp));
  const rest = [...lampLit].filter(([i]) => !cast.has(i)).sort((a, b) => b[1] - a[1]);
  const lit = casters.map((c): [number, number] => [c.lamp, lampLit.get(c.lamp) ?? 0]).concat(rest);
  for (const [k, slot] of lampLights.entries()) {
    const [i, share] = lit[k] ?? [-1, 0];
    const n = village.lanterns.length, torch = i >= n, onDais = torch && i < n + TORCHLIGHT.dais;
    const peak = onDais ? TORCHLIGHT.daisIntensity : torch ? TORCHLIGHT.intensity : LAMPLIGHT.intensity * village.night;
    slot.peak = i < 0 ? 0 : peak * share;
    slot.light.distance = onDais ? TORCHLIGHT.daisDistance : torch ? TORCHLIGHT.distance : LAMPLIGHT.distance;
    if (i >= 0) slot.light.position.copy(lanterns[i]).setY(lanterns[i].y - LAMPLIGHT.below);
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
 * another lamp, drawn there once of what stands still (`lampShadow`) and faded in: handed at once to whichever two
 * lamps were lit brightest, the shadows came and went as he walked ("shadows appear and disappear when walking next to
 * them, it looks lame").
 */
function castOnNearest(near: number[], dt: number): void {
  for (const [k, c] of casters.entries()) {
    const shadow = lampLights[k].light.shadow;
    const wanted = c.lamp >= 0 && near.includes(c.lamp) && lampLit.has(c.lamp);
    if (wanted) c.share = Math.min(1, c.share + dt * SHADOW_FADE);
    else c.share = Math.max(0, c.share - dt * SHADOW_FADE);
    if (!wanted && c.share === 0) c.lamp = -1;
    shadow.intensity = c.share;
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
    const says = o === near ? `E · ${o.verb}` : o.name;
    if (says === l.says) continue;
    l.says = says;
    l.label.show(textArt(says, { face: 'display', size: 15, weight: 700, color: o === near ? '#ffe7b0' : '#e8dcc8', shadows: OUTLINE, spacing: 0.5 }));
  }
}

/** The object `o`'s screen point of its name (the lab). */
export function labelPoint(o: VillageObject): THREE.Vector3 {
  return _to.set(o.at[0], floorAt(o) + o.label, o.at[1]);
}
