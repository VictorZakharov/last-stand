// Presses on the kit's panels (#973: the UI drawn by the engine takes the pointer). The engine's canvas takes every
// press; one on a panel that takes the pointer is the panel's, never the world's (`overPanels` in core/input.ts: no
// attack, no look by drag), and one let go on the panel it was pressed on clicks the page's button the panel stands
// for. That button stays on the page out of sight (`.kit-mirror`, _base.scss): its handler, its keyboard focus, its
// name for a screen reader and its `disabled` are the panel's, so the game's code and the lab press it as before.
import { uiHit } from '../../engine/ui';
import { engineCanvas } from '../../engine/index';
import { overPanels } from '../../core/input';
import type { Panel } from './panel';

/** How a pressable panel shows the pointer: not on it, over it, or pressing it. */
export type PressState = 'none' | 'hover' | 'down';

/** A panel that takes presses: the page's button it stands for, and how it shows the pointer. */
export interface Pressable {
  panel: Panel;
  /** the button on the page it stands for: clicked by a press, its `disabled` the panel's */
  mirror: HTMLButtonElement;
  /** shows `state` (each change once) */
  shows?: (state: PressState) => void;
}

const pressables = new Map<number, Pressable>();
const shown = new Map<Pressable, PressState>();
let down: Pressable | null = null;
let listening = false;

/** `p.panel` takes presses from now on, standing for `p.mirror`. */
export function pressable(p: Pressable): void {
  pressables.set(p.panel.id, p);
  p.panel.look({ hits: true });
  listen();
}

/** `panel` takes no presses from now on. */
export function unpressable(panel: Panel): void {
  const p = pressables.get(panel.id);
  if (!p) return;
  pressables.delete(panel.id);
  shown.delete(p);
  if (down === p) down = null;
}

/** The pressable panel under (`x`, `y`) css px that can be pressed now, if any. */
function pressableAt(x: number, y: number): Pressable | null {
  const id = uiHit(x, y);
  const p = id === null ? undefined : pressables.get(id);
  return p && !p.mirror.disabled ? p : null;
}

/** Each pressable shown as the pointer stands now: over `over`, pressing `down`. */
function showAll(over: Pressable | null): void {
  for (const p of pressables.values()) {
    const state: PressState = p === over ? (down === p ? 'down' : 'hover') : 'none';
    if ((shown.get(p) ?? 'none') === state) continue;
    shown.set(p, state);
    p.shows?.(state);
  }
  const canvas = engineCanvas();
  if (canvas) canvas.style.cursor = over ? 'var(--cursor-hand)' : '';
}

/** Whether a pointer event is the engine's canvas's, its place meaning a place on it (not under the mouse's lock). */
function onCanvas(e: PointerEvent): boolean {
  return e.target === engineCanvas() && !document.pointerLockElement;
}

/** The page's pointer listened to for the panels, once the first is made. */
function listen(): void {
  if (listening) return;
  listening = true;
  // (a press on a panel that takes the pointer is none of the world's)
  overPanels.at = (x, y) => uiHit(x, y) !== null;
  window.addEventListener('pointerdown', (e) => {
    if (!onCanvas(e) || e.button !== 0) return;
    down = pressableAt(e.clientX, e.clientY);
    showAll(down);
  }, true);
  window.addEventListener('pointerup', (e) => {
    const pressed = down;
    down = null;
    const over = onCanvas(e) ? pressableAt(e.clientX, e.clientY) : null;
    showAll(e.pointerType === 'mouse' ? over : null);
    if (pressed && over === pressed) pressed.mirror.click();
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    showAll(onCanvas(e) ? pressableAt(e.clientX, e.clientY) : null);
  }, true);
  window.addEventListener('pointercancel', () => {
    down = null;
    showAll(null);
  }, true);
}

/** The pressable panels' count and how each shows the pointer (the lab reads them). */
export function pressablesShown(): { panel: number; label: string; state: PressState }[] {
  return [...pressables.values()].map((p) => ({
    panel: p.panel.id, label: p.mirror.textContent?.trim() ?? '', state: shown.get(p) ?? 'none',
  }));
}

/** the panels drawn in place of the page's elements out of sight (`standIn`), besides the pressable ones */
const standIns = new Map<Element, Panel>();

/** `panel` is drawn in place of `element`, which stays on the page out of sight (`.kit-mirror`). */
export function standIn(element: Element, panel: Panel): void {
  standIns.set(element, panel);
}

/** The box (css px) of the panel drawn in place of `element` (a page's element out of sight, or what's in it), if
 *  one is and it's shown: where a player sees and presses it (the lab's clicks, taps and boxes). */
export function drawnAt(element: Element): { x: number; y: number; w: number; h: number } | null {
  for (const p of pressables.values()) {
    if (p.mirror === element || p.mirror.contains(element)) return p.panel.rect();
  }
  for (const [shown, panel] of standIns) {
    if (shown === element || shown.contains(element)) return panel.rect();
  }
  return null;
}

/** Whether the panel drawn in place of `element` can be seen (none drawn: no). */
export function drawnSeen(element: Element): boolean {
  for (const [shown, panel] of standIns) {
    if (shown === element || shown.contains(element)) return panel.seen;
  }
  return false;
}
