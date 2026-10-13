// World-anchored overlays: damage numbers and floating words, and labels over a point of the world (foes' bars, the
// props' gauges, the dummies' meters, the partners' tags), drawn over the frame by the renderer (ui/overlay).
import * as THREE from 'three';
import { G } from '../state';
import { Label, ORDER, layoutLabels } from './overlay/layer';
import { drawText, measure, type Shadow, type TextStyle } from './overlay/paint';
import { uiScales } from './scale';

type WorldPos = { x: number; y: number; z: number };
export type FloatKind = 'dmg' | 'crit' | 'heal' | 'player' | 'info';

interface Floater { label: Label; x: number; y: number; z: number; t: number; life: number; vx: number }
interface Anchored { label: Label; at: () => WorldPos | null; clamp: boolean }

const floats: Floater[] = [];
/** the most floating texts shown at once: past it, the oldest goes to make room (each takes a slot of the label
 *  atlas, which grows with the canvas's ratio: 250 of a heavy fight's take a third to a half of it at any ratio) */
const MAX_FLOATS = 250;
const anchored = new Map<Label, Anchored>();
const v = new THREE.Vector3();

export function project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
  v.set(x, y, z).project(G.camera);
  return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, behind: v.z > 1 };
}

/** a damage number's shadows: a dark rim and a soft glow round it */
const FLOAT_SHADOWS: Shadow[] = [
  { x: 0, y: 0, blur: 3, color: '#000' }, { x: 0, y: 2, blur: 3, color: '#000' }, { x: 0, y: 0, blur: 8, color: 'rgba(0,0,0,.8)' },
];
/** each kind of floating text's look (its colour is the caller's: a crit's its damage's, as a plain hit's) */
const FLOAT_STYLE: Record<FloatKind, Omit<TextStyle, 'color'>> = {
  dmg: { face: 'display', weight: 700, size: 17, shadows: FLOAT_SHADOWS },
  crit: { face: 'display', weight: 700, size: 26, shadows: FLOAT_SHADOWS },
  player: { face: 'display', weight: 700, size: 20, shadows: FLOAT_SHADOWS },
  heal: { face: 'display', weight: 700, size: 18, shadows: FLOAT_SHADOWS },
  info: { face: 'body', weight: 500, size: 16, shadows: FLOAT_SHADOWS },
};

/** Art for a line of text in style `s`, with room round it for its shadows. */
export function textArt(text: string, s: TextStyle): { w: number; h: number; paint(c: CanvasRenderingContext2D, scale: number): void } {
  const t = measure(text, s), pad = Math.ceil(Math.max(...(s.shadows ?? []).map((sh) => sh.blur + Math.abs(sh.y)), 0));
  return { w: t.w + pad * 2, h: t.h + pad * 2, paint: (c, scale) => drawText(c, t, pad, pad, s, scale) };
}

export function floatText(x: number, y: number, z: number, text: string | number, kind: FloatKind = 'dmg', color: number | string = 0xffffff): void {
  const col = typeof color === 'number' ? '#' + new THREE.Color(color).getHexString() : color;
  const label = new Label(ORDER.float);
  label.show(textArt(kind === 'crit' ? `${text}!` : String(text), { ...FLOAT_STYLE[kind], color: col }));
  label.ax = label.ay = 0.5;
  if (floats.length >= MAX_FLOATS) floats.shift()!.label.remove();
  floats.push({ label, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, t: 0, life: kind === 'crit' ? 1.1 : 0.85, vx: (Math.random() - 0.5) * 40 });
}

/** how far a clamped label keeps from the screen's edges (px of the UI's reference layout, at the HUD's scale) */
const CLAMP = { side: 40, top: 40, bottom: 110 };

/** A label over a point of the world (`at` gives it each frame; null hides it): `clamp` keeps it on screen, above the
 *  hotbar and below the top (a tall prop seen from close by reaches past the frame). */
export function anchorLabel(order: number, at: () => WorldPos | null, clamp = false): Label {
  const label = new Label(order);
  anchored.set(label, { label, at, clamp });
  return label;
}

/** The labels anchored to the world, each with where it's anchored now and whether it's held on the screen
 *  (tools/lab measures them against the camera). */
export function anchoredLabels(): { label: Label; at: WorldPos | null; clamp: boolean }[] {
  return [...anchored.values()].map((a) => ({ label: a.label, at: a.at(), clamp: a.clamp }));
}

/** Takes an anchored label off the screen for good. */
export function removeLabel(label: Label | null | undefined): void {
  if (!label) return;
  anchored.delete(label);
  label.remove();
}

/** Every label where it shows now (run after the camera has moved), and the frame's draw of them laid out. */
export function updateFloaters(dt: number): void {
  // (a float's rise and drift are px of the UI's reference layout, as its text is)
  const u = uiScales.hud;
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { f.label.remove(); floats.splice(i, 1); continue; }
    const p = project(f.x, f.y, f.z);
    const rise = 60 * (1 - (1 - k) ** 2);
    f.label.shown = !p.behind;
    f.label.x = p.x + f.vx * k * u;
    f.label.y = p.y - rise * u;
    f.label.scale = f.t < 0.12 ? 1 + (0.12 - f.t) * 6 : 1;
    f.label.alpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
  }
  for (const a of anchored.values()) {
    const w = a.at();
    const p = w ? project(w.x, w.y, w.z) : null;
    a.label.shown = !!p && !p.behind;
    if (!p || p.behind) continue;
    a.label.x = a.clamp ? Math.min(window.innerWidth - CLAMP.side * u, Math.max(CLAMP.side * u, p.x)) : p.x;
    a.label.y = a.clamp ? Math.min(window.innerHeight - CLAMP.bottom * u, Math.max(CLAMP.top * u, p.y)) : p.y;
  }
  layoutHooks.forEach((hook) => hook());
  layoutLabels();
}

/** what places labels of its own each frame (the floor's names, stacked; a downed partner's marker), after the camera */
const layoutHooks: (() => void)[] = [];
/** Runs `hook` every frame where the labels are placed: after the camera, before they're drawn. */
export function onLayout(hook: () => void): void { layoutHooks.push(hook); }

export function clearFloaters(): void {
  for (const f of floats) f.label.remove();
  floats.length = 0;
}
