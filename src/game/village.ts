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
import { HALL, TERRACE } from '../data/village';

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
const HALL_NEAR = 15;
/** how far into the yard the hero must stand to cast (m in from its fence) */
const YARD_IN = 0.2;
/** an object's column for the pointer: as wide as its reach's share, and up to its name */
const PICK_SHARE = 0.55, PICK_MOST = 2.6;

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
export function updateVillage(): void {
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
  if (Math.hypot(p.pos.x - TERRACE.x, p.pos.z - HALL.z) < HALL_NEAR) want('heroes');
  syncLabels();
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
