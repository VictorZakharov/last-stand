// Presses on the kit's panels (#973: the UI drawn by the engine takes the pointer). The engine's canvas takes every
// press; one on a panel that takes the pointer is the panel's, never the world's (`overPanels` in core/input.ts: no
// attack, no look by drag), and one let go on the panel it was pressed on clicks the page's button the panel stands
// for. That button stays on the page out of sight (`.kit-mirror`, _base.scss): its handler, its keyboard focus, its
// name for a screen reader and its `disabled` are the panel's, so the game's code and the lab press it as before.
// A panel that only shows a tip (`tipped`: the skill bar's slots, whose press is the world's, core/input.ts's
// TIP_ONLY) takes no press: the mouse over it is told to its page element as the mouse's own enter, move and leave,
// which the tooltip listens to (ui/tooltip.ts `bindTooltip`).
import { uiHit } from '../../engine/ui';
import { engineCanvas } from '../../engine/index';
import { overPanels } from '../../core/input';
import type { Panel } from './panel';
import { pressDragged } from './scroll';

/** How a pressable panel shows the pointer: not on it, over it, or pressing it. */
export type PressState = 'none' | 'hover' | 'down';

/** A panel that takes presses: the page's button it stands for, and how it shows the pointer. */
export interface Pressable {
  panel: Panel;
  /** the control on the page it stands for: clicked by a press, its `disabled` the panel's */
  mirror: HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement;
  /** what a press does in place of clicking it (a field's: its input focused) */
  press?: () => void;
  /** shows `state` (each change once) */
  shows?: (state: PressState) => void;
  /** told as a press on it begins and as it ends, wherever it's let go (a button held: the touch revive's) */
  held?: (on: boolean) => void;
  /** a press on it takes no focus from what has it (the chat's Send and field: the field's blur shut the box under
   *  the press), as a `pointerdown` prevented on the page's button kept it */
  keepsFocus?: boolean;
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
  if (down === p) {
    p.held?.(false);
    down = null;
  }
}

/** The pressable panel under (`x`, `y`) css px that can be pressed now, if any. */
function pressableAt(x: number, y: number): Pressable | null {
  forgetGone();
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
    if (down?.keepsFocus) e.preventDefault();
    down?.held?.(true);
    showAll(down);
  }, true);
  window.addEventListener('pointerup', (e) => {
    const pressed = down;
    down = null;
    pressed?.held?.(false);
    const over = onCanvas(e) ? pressableAt(e.clientX, e.clientY) : null;
    showAll(e.pointerType === 'mouse' ? over : null);
    // (a finger that dragged a list to scroll it pressed nothing)
    if (pressed && over === pressed && !(e.pointerType !== 'mouse' && pressDragged())) pressOf(pressed);
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    showAll(onCanvas(e) ? pressableAt(e.clientX, e.clientY) : null);
    tipUnder(e);
  }, true);
  window.addEventListener('pointercancel', () => {
    down?.held?.(false);
    down = null;
    showAll(null);
  }, true);
}

/** What a press on `p` does: its own, else its control clicked. */
function pressOf(p: Pressable): void {
  if (p.press) p.press();
  else p.mirror.click();
}

/** the panels that show a tip under the mouse and take no press, each with the page element it stands for */
const tipped = new Map<Panel, HTMLElement>();
/** the tipped panel the mouse is over */
let tipOver: Panel | null = null;

/** `panel` shows the tip its page element `mirror` shows under the mouse, taking no press (its press the world's). */
export function tips(panel: Panel, mirror: HTMLElement): void {
  tipped.set(panel, mirror);
  listen();
}

/** The page element a panel under (`x`, `y`) css px stands for, if any: a pressable's button, else a tipped
 *  panel's element (the Alt cursor over mouse look hovers and presses it as the page's own, ui/altCursor.ts). */
export function standsForAt(x: number, y: number): HTMLElement | null {
  const pressed = pressableAt(x, y);
  if (pressed) return pressed.mirror;
  const panel = tippedAt(x, y);
  return panel ? tipped.get(panel) ?? null : null;
}

/** `panel` shows no tip from now on (taken away: the mouse leaves it). */
export function untipped(panel: Panel): void {
  if (tipOver === panel) leaveTip(new MouseEvent('mouseleave'));
  tipped.delete(panel);
}

/** Every panel taken away forgotten: its presses, its tip, what it stood for (a rebuilt bar's old panels). */
function forgetGone(): void {
  for (const [id, p] of pressables) if (p.panel.gone) pressables.delete(id);
  for (const panel of tipped.keys()) if (panel.gone) tipped.delete(panel);
  for (const [element, panel] of standIns) if (panel.gone) standIns.delete(element);
  if (tipOver?.gone) tipOver = null;
}

/** The tipped panel shown under (`x`, `y`) css px, if any (the last laid over the others). */
function tippedAt(x: number, y: number): Panel | null {
  forgetGone();
  let found: Panel | null = null;
  for (const panel of tipped.keys()) {
    const box = panel.seen ? panel.rect() : null;
    if (box && x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h) found = panel;
  }
  return found;
}

/** The mouse's leave told to the tipped panel's element it was over. */
function leaveTip(e: MouseEvent): void {
  const mirror = tipOver && tipped.get(tipOver);
  tipOver = null;
  mirror?.dispatchEvent(new MouseEvent('mouseleave', { clientX: e.clientX, clientY: e.clientY }));
}

/** The mouse's place told to the tipped panel under it: its enter, its move, and its leave of the one before. */
function tipUnder(e: PointerEvent): void {
  const under = onCanvas(e) ? tippedAt(e.clientX, e.clientY) : null;
  const at = { clientX: e.clientX, clientY: e.clientY };
  if (under !== tipOver) {
    leaveTip(e);
    tipOver = under;
    if (under) tipped.get(under)!.dispatchEvent(new MouseEvent('mouseenter', at));
  }
  if (under) tipped.get(under)!.dispatchEvent(new MouseEvent('mousemove', at));
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
  return drawnFor(element)?.rect() ?? null;
}

/** Where `element` is shown (css px): the panel drawn in its place where the kit draws it (`.kit-mirror`), else
 *  its own box (the tutorial's ring round the skill bar's slots). */
export function shownBox(element: Element): DOMRect {
  if (!element.closest('.kit-mirror')) return element.getBoundingClientRect();
  const at = drawnAt(element);
  return at ? new DOMRect(at.x, at.y, at.w, at.h) : new DOMRect(0, 0, 0, 0);
}

/** Whether the panel drawn in place of `element` can be seen (none drawn: no). */
export function drawnSeen(element: Element): boolean {
  return drawnFor(element)?.seen ?? false;
}

/** The panel drawn in place of `element`: its own, else the nearest round it (a slot's before its bar's). */
export function drawnFor(element: Element): Panel | null {
  forgetGone();
  let nearest: { panel: Panel; depth: number } | null = null;
  const consider = (shown: Element, panel: Panel) => {
    if (shown !== element && !shown.contains(element)) return;
    const depth = depthOf(shown);
    if (!nearest || depth > nearest.depth) nearest = { panel, depth };
  };
  for (const p of pressables.values()) consider(p.mirror, p.panel);
  for (const [shown, panel] of standIns) consider(shown, panel);
  for (const [panel, mirror] of tipped) consider(mirror, panel);
  return (nearest as { panel: Panel } | null)?.panel ?? null;
}

/** Whether a panel is drawn in place of `element` itself (not only of what's round it). */
export function drawsItself(element: Element): boolean {
  forgetGone();
  for (const p of pressables.values()) if (p.mirror === element) return true;
  for (const mirror of tipped.values()) if (mirror === element) return true;
  return standIns.has(element);
}

/** How deep in the page `element` is. */
function depthOf(element: Element): number {
  let depth = 0;
  for (let at: Element | null = element; at; at = at.parentElement) depth++;
  return depth;
}

/** `element` is drawn by no panel from now on (its panel taken away). */
export function noStandIn(element: Element): void {
  standIns.delete(element);
}
