// Breakable scenery: low props (stumps, logs, boulders, drums, gravestones, sarcophagi) have hit points
// and give way to focused fire, an enemy's included, so nobody can sit behind one for the whole wave.
// A prop is one or more of the obstacle circles; when it breaks its circles leave the biome's list (the
// flow field is rebuilt from `state.rev`), its mesh goes, and rubble flies. Tall props (trees, pillars,
// walls, the lights) stay. The fight's owner deals the damage (`simulates`); a co-op guest is told which
// prop's health (`setPropSink` / `setPropLife`). A damaged prop shows a bar for a few seconds. A new run brings everything back (`restoreProps`).
import * as THREE from 'three';
import type { Obstacle } from '../types';
import type { Updater } from './props';
import { simulates } from '../net/role';
import { burst, debris, smokePuff } from '../fx/particles';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { G } from '../state';
import { addAnchored, removeAnchored } from '../ui/floaters';

export interface Prop {
  id: number;
  life: number;
  max: number;
  broken: boolean;
  color: number;
  /** its circles, and the biome's list they stand in */
  parts: Obstacle[];
  list: Obstacle[];
  hide(): void;
  show(): void;
  chipT: number;
  /** game time of the last damage, and its health bar while it shows */
  hurtT: number;
  bar: HTMLElement | null;
  fill: HTMLElement | null;
}

/** Bumped whenever the set of obstacles changes, so the navigation grid follows */
export const state = { rev: 0 };

/** How much one strike takes off a prop's `hp`: a player's bolt, an enemy's bolt, a melee swing, a second of the Void Lance */
export const PROP_DAMAGE = { bolt: 1, hostile: 0.5, swing: 1, beam: 3 };

let propSink: (id: number, life: number) => void = () => {};
/** the fight's owner reports each prop's health as it changes (0: broken) */
export function setPropSink(fn: typeof propSink): void { propSink = fn; }

/** a bar shows this long after the last damage, then fades */
const BAR_SHOWN = 5, BAR_FADE = 0.6;

/** A biome's breakable props, made as it's built */
export class PropSet {
  readonly list: Prop[] = [];
  constructor(private obstacles: Obstacle[]) {}
  /** The obstacle circles pushed since `from` (an index into the list) become one prop of `hp`. `hide` /
   *  `show` take its look away and bring it back. */
  add(from: number, hp: number, color: number, look: { hide(): void; show(): void }): void {
    const parts = this.obstacles.slice(from);
    const prop: Prop = { id: this.list.length, life: hp, max: hp, broken: false, color, parts, list: this.obstacles, chipT: 0, hurtT: -1e9, bar: null, fill: null, ...look };
    for (const o of parts) o.prop = prop;
    this.list.push(prop);
  }
}

const _p = new THREE.Vector3();
/** hide / show for one instance of an InstancedMesh (call once the instance is placed) */
export function instanceLook(mesh: THREE.InstancedMesh, i: number): { hide(): void; show(): void } {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(i, m);
  const gone = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4).setPosition(_p.setFromMatrixPosition(m));
  const set = (to: THREE.Matrix4): void => { mesh.setMatrixAt(i, to); mesh.instanceMatrix.needsUpdate = true; };
  return { hide: () => set(gone), show: () => set(m) };
}
/** hide / show for plain meshes (they're kept out of the shadow bake, so they cast for themselves) */
export function meshLook(...meshes: THREE.Object3D[]): { hide(): void; show(): void } {
  for (const m of meshes) m.userData.noBake = true;
  return { hide: () => meshes.forEach((m) => { m.visible = false; }), show: () => meshes.forEach((m) => { m.visible = true; }) };
}

const centre = (p: Prop, out: THREE.Vector3): THREE.Vector3 => {
  out.set(0, 0, 0);
  for (const o of p.parts) out.x += o.x, out.z += o.z;
  return out.multiplyScalar(1 / Math.max(1, p.parts.length)).setY(Math.min(1, Math.max(...p.parts.map((o) => o.h)) * 0.5));
};

/** Wear a prop down by `amount` (only where the fight is simulated). Returns true if it broke. */
export function hurtProp(o: Obstacle, amount: number): boolean {
  const p = o.prop;
  if (!p || p.broken || !simulates()) return false;
  p.life -= amount;
  if (p.life <= 0) { breakProp(p); propSink(p.id, 0); return true; }
  showBar(p);
  const now = performance.now();
  if (now - p.chipT > 140) {
    p.chipT = now;
    propSink(p.id, Math.round(p.life * 10) / 10);
    debris(centre(p, _p), { count: 3, color: p.color, speed: 3, size: 0.12, life: 0.7 });
    sfx.clang();
  }
  return false;
}

/** A prop's health as the fight's owner reports it (a co-op guest) */
export function setPropLife(p: Prop, life: number): void {
  if (life <= 0) { breakProp(p); return; }
  p.life = life;
  showBar(p);
}

/** The bar over a damaged prop: unlike a foe's red one it's a stone-coloured, notched gauge with a diamond,
 *  and it goes a few seconds after the last blow */
function showBar(p: Prop): void {
  p.hurtT = G.time;
  if (!p.bar) {
    const el = document.createElement('div');
    el.className = 'pbar';
    el.innerHTML = '<div class="ptrack"><div class="pfill"></div></div>';
    p.fill = el.querySelector<HTMLElement>('.pfill');
    p.bar = addAnchored(el, () => {
      const age = G.time - p.hurtT;
      if (p.broken || age > BAR_SHOWN + BAR_FADE) { hideBar(p); return null; }
      el.style.opacity = String(age <= BAR_SHOWN ? 1 : 1 - (age - BAR_SHOWN) / BAR_FADE);
      return centre(p, new THREE.Vector3()).setY(Math.max(...p.parts.map((o) => o.h)) + 0.3);
    });
  }
  p.fill!.style.width = `${Math.max(0, p.life / p.max) * 100}%`;
}
function hideBar(p: Prop): void { removeAnchored(p.bar); p.bar = p.fill = null; }

/** hide / show for everything a builder put in `group` (built into it instead of the scene): its meshes go
 *  (and stay out of the shadow bake), its animation stops (the `updaters` it added since `from`), and its
 *  lights go dark but stay in the scene, since a different light count would recompile every shader */
export function groupLook(group: THREE.Object3D, updaters: Updater[], from: number): { hide(): void; show(): void } {
  const lights: [THREE.PointLight, number][] = [], shown: THREE.Object3D[] = [];
  group.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) lights.push([o as THREE.PointLight, (o as THREE.PointLight).intensity]);
    else if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) { shown.push(o); o.userData.noBake = true; }
  });
  let gone = false;
  for (let i = from; i < updaters.length; i++) { const u = updaters[i]; updaters[i] = (dt, t) => { if (!gone) u(dt, t); }; }
  return {
    hide() { gone = true; for (const o of shown) o.visible = false; for (const [l] of lights) l.intensity = 0; },
    show() { gone = false; for (const o of shown) o.visible = true; for (const [l, v] of lights) l.intensity = v; },
  };
}

/** The prop goes: its circles, its mesh, and a burst of rubble */
export function breakProp(p: Prop): void {
  if (p.broken) return;
  p.broken = true; p.life = 0;
  p.hide();
  hideBar(p);
  for (const o of p.parts) { const i = p.list.indexOf(o); if (i >= 0) p.list.splice(i, 1); }
  state.rev++;
  const c = centre(p, _p), size = Math.max(...p.parts.map((o) => o.r)) + p.parts.length * 0.25;
  debris(c, { count: 10 + Math.round(size * 8), color: p.color, speed: 4 + size * 2, size: 0.2 });
  smokePuff(c, { count: 4 + Math.round(size * 3), color: p.color, alpha: 0.4, size: 0.8 + size * 0.4, sizeEnd: 2 + size, life: 1.2, speed: 1.6 });
  burst(c, { count: 6, color: 0xffd9a0, intensity: 1.5, speed: 4, life: 0.35, size: 0.1, gravity: 8 });
  addShake(0.06 + size * 0.05);
  sfx.crumble();
}

/** Bring every prop of the set back (a new run, the lobby) */
export function restoreProps(props: Prop[]): void {
  let changed = false;
  for (const p of props) {
    if (!p.broken && p.life === p.max) continue;
    p.life = p.max;
    hideBar(p);
    if (p.broken) { p.broken = false; p.list.push(...p.parts); p.show(); }
    changed = true;
  }
  if (changed) state.rev++;
}
