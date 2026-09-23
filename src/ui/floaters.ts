// World-anchored DOM overlays: damage numbers, labels and enemy health bars.
import * as THREE from 'three';
import { G } from '../state';

type WorldPos = { x: number; y: number; z: number };
export type FloatKind = 'dmg' | 'crit' | 'heal' | 'player' | 'info';

interface Floater { el: HTMLDivElement; x: number; y: number; z: number; t: number; life: number; vx: number }
/** DOM element tracking a world position; `getPos` returns null to hide it. */
type Anchored = HTMLElement & { _getPos: () => WorldPos | null };

let layer: HTMLElement | null = null;
const floats: Floater[] = [];
const anchored = new Set<Anchored>();
const v = new THREE.Vector3();

export function initFloaters(el: HTMLElement): void { layer = el; }

export function project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
  v.set(x, y, z).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 };
}

const pool: HTMLDivElement[] = [];
export function floatText(x: number, y: number, z: number, text: string | number, kind: FloatKind = 'dmg', color: number | string = 0xffffff): void {
  if (!layer) return;
  const el = pool.pop() ?? document.createElement('div');
  el.className = `float ${kind}`;
  el.textContent = String(text);
  el.style.color = typeof color === 'number' ? '#' + new THREE.Color(color).getHexString() : color;
  layer.appendChild(el);
  floats.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, t: 0, life: kind === 'crit' ? 1.1 : 0.85, vx: (Math.random() - 0.5) * 40 });
}

/** Attach an element that tracks a world position. Remove it with removeAnchored(). */
export function addAnchored(el: HTMLElement, getPos: () => WorldPos | null): HTMLElement {
  const a = el as Anchored;
  a._getPos = getPos;
  layer?.appendChild(a);
  anchored.add(a);
  return a;
}

export function removeAnchored(el: HTMLElement | null | undefined): void {
  if (!el) return;
  anchored.delete(el as Anchored);
  el.remove();
}

export function updateFloaters(dt: number): void {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { f.el.remove(); pool.push(f.el); floats.splice(i, 1); continue; }
    const p = project(f.x, f.y, f.z);
    const rise = 60 * (1 - (1 - k) ** 2);
    const pop = f.t < 0.12 ? 1 + (0.12 - f.t) * 6 : 1;
    f.el.style.transform = `translate(${p.x + f.vx * k}px, ${p.y - rise}px) translate(-50%,-50%) scale(${pop})`;
    f.el.style.opacity = String(k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1);
  }
  for (const el of anchored) {
    const w = el._getPos();
    if (!w) { el.style.display = 'none'; continue; }
    const p = project(w.x, w.y, w.z);
    if (p.behind) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-100%)`;
  }
}

export function clearFloaters(): void {
  for (const f of floats) f.el.remove();
  floats.length = 0;
}
