// Items on the lobby floor. Gear thrown out of the stash lands here instead of vanishing, so it can be
// picked up again (click its name) or, in co-op, by a partner. Whatever is left there is lost when a run
// starts. In co-op every game shows every drop, and the host says who got one first (net/session).
import * as THREE from 'three';
import { G } from '../state';
import { additive } from '../core/materials';
import { radialDecal } from '../core/textures';
import { sfx } from '../core/audio';
import { ARENA, RUN } from '../data/balance';
import { CLASSES } from '../data/classes/index';
import { basesFor, newItemId, rarityOf } from '../loot/items';
import { groundHeight } from '../world/ground';
import { project, floatText } from '../ui/floaters';
import { bindTooltip, hideTooltip, itemTooltip, itemTooltipHTML } from '../ui/tooltip';
import { input } from '../core/input';
import { itemIconSVG } from '../ui/itemIcons';
import type { Item, RarityId } from '../types';

/** A drop as the games tell each other about it: the item, where it lies and where it was thrown from. */
export interface GroundDrop { id: string; item: Item; x: number; z: number; fx: number; fz: number }

/** How a drop reaches the other games (set by net/session while in a room). */
export interface GroundNet {
  /** tell the others about a drop */
  dropped(d: GroundDrop): void;
  /** a guest asks the host for a drop (true); solo or on the host there's nobody to ask (false) */
  ask(id: string): boolean;
  /** the local player took a drop: the others remove it */
  taken(id: string): void;
}

/** metres: the farthest an item is thrown (dragged farther, it lands this far out that way) */
const THROW_MAX = 9;
/** seconds in the air */
const TOSS = 0.55;
/** a guest's request to the host: tried again after this long without an answer */
const ASK_AGAIN = 2;

interface Drop extends GroundDrop {
  group: THREE.Group; shard: THREE.Mesh; beam: THREE.Group; glow: THREE.Mesh; label: HTMLElement;
  /** age (s): the toss, then the beam growing */
  t: number;
  /** when a guest last asked the host for it */
  asked: number;
  /** the label's size (px), measured once shown */
  w: number; h: number;
}

const drops = new Map<string, Drop>();
let net: GroundNet | null = null;
let picked: (item: Item) => boolean = () => false;
/** drop ids: unique between games (a page tag) and within one */
const TAG = Math.random().toString(36).slice(2, 7);
let seq = 0;

let geo: { beam: THREE.PlaneGeometry; glow: THREE.PlaneGeometry; shard: THREE.BufferGeometry } | null = null;
let soft: THREE.Texture | null = null;
const mats = new Map<RarityId, { beam: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; shard: THREE.MeshBasicMaterial }>();

/** `pick` puts a picked-up item in the stash; false when there's no room. */
export function initGround(pick: (item: Item) => boolean): void { picked = pick; }
export function setGroundNet(n: GroundNet | null): void { net = n; }

// one set of materials per rarity, in its colour (all additive, the effects' own shader programs)
function matsFor(r: RarityId) {
  let m = mats.get(r);
  if (m) return m;
  geo ??= {
    beam: new THREE.PlaneGeometry(1, 1),
    glow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    shard: new THREE.OctahedronGeometry(0.09, 0).scale(1, 1.8, 1),
  };
  soft ??= radialDecal('rgba(255,255,255,1)', 'rgba(255,255,255,0)', false);
  const c = rarityOf(r).color;
  const beam = additive(c, 0.9, 0.5), glow = additive(c, 1, 0.55), shard = additive(c, 2.2);
  beam.map = glow.map = soft;
  m = { beam, glow, shard };
  mats.set(r, m);
  return m;
}

/** Sample meshes for the load-time shader warm-up. */
export function groundSamples(): THREE.Object3D[] {
  const m = matsFor('common');
  return [new THREE.Mesh(geo!.beam, m.beam), new THREE.Mesh(geo!.shard, m.shard)];
}

/** The classes that can use an item (its base is one of theirs). */
const usersOf = (it: Item) => Object.values(CLASSES).filter((c) => basesFor(it.slot, c).includes(it.base));

/** Throw an item from the local player's stash onto the floor, a couple of metres ahead. */
export function throwItem(item: Item, at?: { x: number; z: number }): void {
  const p = G.player;
  // towards `at` (where it was dragged to, within a throw), else a few metres ahead
  let f = p.facing, reach = 2.4;
  if (at) { f = Math.atan2(at.x - p.pos.x, at.z - p.pos.z); reach = Math.min(THROW_MAX, Math.max(1.5, Math.hypot(at.x - p.pos.x, at.z - p.pos.z))); }
  const sx = Math.sin(f), sz = Math.cos(f);
  // a little to either side, clear of the other drops
  let x = 0, z = 0;
  for (let i = 0; i < 8; i++) {
    const ahead = at ? reach + (i ? (Math.random() - 0.5) * 0.8 : 0) : reach + Math.random() * 0.8;
    const side = at ? (i ? (Math.random() - 0.5) * 0.8 : 0) : (Math.random() - 0.5) * 1.6;
    x = p.pos.x + sx * ahead + sz * side;
    z = p.pos.z + sz * ahead - sx * side;
    const r = Math.hypot(x, z), max = ARENA.radius - 1;
    if (r > max) { x *= max / r; z *= max / r; }
    if (![...drops.values()].some((d) => Math.hypot(d.x - x, d.z - z) < 0.7)) break;
  }
  const d: GroundDrop = { id: `${TAG}.${seq++}`, item, x, z, fx: p.pos.x, fz: p.pos.z };
  addDrop(d);
  net?.dropped(d);
}

const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
/** The floor under a point of the screen (client px), or null when it points above the horizon. */
export function floorAt(cx: number, cy: number): { x: number; z: number } | null {
  const r = G.renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  return ray.ray.intersectPlane(floorPlane, hit) ? { x: hit.x, z: hit.z } : null;
}

/** A drop appears: thrown from where it was thrown from, or already lying there (`toss` false). */
export function addDrop(g: GroundDrop, toss = true): void {
  if (drops.has(g.id)) return;
  const m = matsFor(g.item.rarity);
  const group = new THREE.Group();
  const shard = new THREE.Mesh(geo!.shard, m.shard);
  const glow = new THREE.Mesh(geo!.glow, m.glow);
  glow.scale.setScalar(0.9);
  glow.position.y = 0.04;   // clear of the floor: level with it, the two flicker in and out
  // a soft shaft of light, two crossed cards
  const beam = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const b = new THREE.Mesh(geo!.beam, m.beam);
    b.rotation.y = a;
    beam.add(b);
  }
  beam.position.y = 1.1;
  group.add(shard, glow, beam);
  for (const o of [shard, glow, ...beam.children]) { o.castShadow = false; o.receiveShadow = false; }
  group.position.set(g.x, groundHeight(g.x, g.z), g.z);
  G.scene.add(group);

  const label = document.createElement('div');
  label.className = 'gdrop';
  label.style.setProperty('--c', rarityOf(g.item.rarity).color);
  label.innerHTML = `${itemIconSVG(g.item)}<span>${g.item.name}</span>`;
  const d: Drop = { ...g, group, shard, beam, glow, label, t: toss ? 0 : TOSS + 1, asked: -Infinity, w: 0, h: 0 };
  bindTooltip(label, () => {
    const own = usersOf(d.item).some((c) => c.id === G.player.cls.id);
    const how = own ? (input.touchMode ? 'Tap again to pick it up' : 'Click to pick it up') : `Only a ${usersOf(d.item).map((c) => c.name).join(' or ') || 'nobody'} can use it`;
    return { ...(own ? itemTooltip(d.item)() : itemTooltipHTML(d.item)), foot: `${how}<br>Left on the floor, it's lost when a run starts` };
  });
  // picked up only on purpose: a click (a tap shows the card first, the next tap takes it)
  label.addEventListener('click', () => {
    if (input.touchMode && tapped !== d.id) { tapped = d.id; return; }
    tapped = null;
    pickUp(d);
  });
  label.style.display = 'none';
  document.getElementById('floaters')?.appendChild(label);
  drops.set(d.id, d);
  pose(d);
}

/** Take a drop off the floor (it's gone, or someone took it). Returns it, if it was there. */
export function removeDrop(id: string): GroundDrop | null {
  const d = drops.get(id);
  if (!d) return null;
  drops.delete(id);
  G.scene.remove(d.group);
  d.label.remove();
  hideTooltip();
  return { id: d.id, item: d.item, x: d.x, z: d.z, fx: d.fx, fz: d.fz };
}

/** The host gave us a drop: into the stash, or back on the floor at our feet if it has filled up meanwhile. */
export function receiveItem(item: Item): void {
  const it = { ...item, id: newItemId() };
  if (picked(it)) { sfx.pickup(); return; }
  floatText(G.player.pos.x, 2.6, G.player.pos.z, 'Stash full', 'info', '#ffcf70');
  throwItem(it);
}

/** Everything on the floor, as the games tell each other about it (for a guest joining). */
export const groundDrops = (): GroundDrop[] => [...drops.values()].map((d) => ({ id: d.id, item: d.item, x: d.x, z: d.z, fx: d.fx, fz: d.fz }));

/** Whatever is left on the floor is lost (a run starts, or a guest leaves the host's lobby). */
export function clearGround(): void { for (const id of [...drops.keys()]) removeDrop(id); }

function pose(d: Drop): void {
  const t = d.t, g = d.group, y0 = groundHeight(d.x, d.z);
  if (t < TOSS) {
    // an arc from the thrower's hand to the floor, the shard tumbling
    const k = t / TOSS;
    g.position.set(d.fx + (d.x - d.fx) * k, 0, d.fz + (d.z - d.fz) * k);
    d.shard.position.y = (groundHeight(d.fx, d.fz) + 1.2) * (1 - k) + y0 * k + 1.6 * k * (1 - k) - y0 + 0.18;
    g.position.y = y0;
    d.shard.rotation.set(t * 11, t * 7, 0);
    d.beam.visible = d.glow.visible = false;
    return;
  }
  const s = Math.min(1, (t - TOSS) / 0.4);   // the light grows once it lands
  g.position.set(d.x, y0, d.z);
  d.beam.visible = d.glow.visible = true;
  d.beam.scale.set(0.45, 2.2 * s, 1);
  d.beam.position.y = 1.1 * s;
  d.glow.scale.setScalar(0.9 * s);
  d.shard.rotation.set(0, t * 1.4, 0);
  d.shard.position.y = 0.3 + Math.sin(t * 2.2) * 0.04;
}

/** The labels over the drops, stacked upwards where they would overlap (the nearest keep their place). */
function placeLabels(): void {
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const shown = [...drops.values()].filter((d) => {
    const on = d.t >= TOSS && G.mode === 'menu';
    if (!on) d.label.style.display = 'none';
    return on;
  }).map((d) => ({ d, s: project(d.x, d.group.position.y + 0.5, d.z) })).filter(({ d, s }) => {
    if (s.behind) d.label.style.display = 'none';
    return !s.behind;
  }).sort((a, b) => b.s.y - a.s.y);
  for (const { d, s } of shown) {
    const el = d.label;
    el.style.display = '';
    if (!d.w) { d.w = el.offsetWidth; d.h = el.offsetHeight; }
    const { w, h } = d;
    const r = { x: s.x - w / 2, y: s.y - h, w, h };
    for (let i = 0; i < 20; i++) {
      const hit = placed.find((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
      if (!hit) break;
      r.y = hit.y - h - 2;
    }
    placed.push(r);
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
  }
}

/** the label a touch tapped last: the next tap on it picks the item up */
let tapped: string | null = null;

/** The local player picks a drop up: into the stash, if the class can use it and there's room. */
function pickUp(d: Drop): void {
  const p = G.player;
  if (G.mode !== 'menu' || d.t < TOSS || G.time - d.asked < ASK_AGAIN) return;
  const own = usersOf(d.item).some((c) => c.id === p.cls.id);
  if (!own || G.profile.stash.length >= RUN.bagLimit) {
    floatText(d.x, 1.6, d.z, own ? 'Stash full' : `Not for a ${p.cls.name}`, 'info', '#ffcf70');
    return;
  }
  hideTooltip();
  // a guest asks the host, who may have given it to someone else already
  if (net?.ask(d.id)) { d.asked = G.time; return; }
  const g = removeDrop(d.id);
  if (!g) return;
  net?.taken(g.id);
  if (picked({ ...g.item, id: newItemId() })) sfx.pickup();
}

/** Every frame: the drops' motion and labels. */
export function updateGround(dt: number): void {
  const lobby = G.mode === 'menu';
  for (const d of drops.values()) {
    d.t += dt;
    d.group.visible = lobby;
    pose(d);
    // the class on show can change (a class or save slot switch in the lobby)
    d.label.classList.toggle('other', !usersOf(d.item).some((c) => c.id === G.player.cls.id));
  }
  placeLabels();
}
