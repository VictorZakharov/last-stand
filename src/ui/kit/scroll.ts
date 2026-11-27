// Panels that scroll (#973: a list or a page longer than its box, as CSS's `overflow: auto` scrolls one). The engine
// clips what's inside a panel whose overflow is `scroll` to its box and draws it moved up by its look's `scroll`
// (Bulwark's ui.rs); this moves that by the mouse's wheel over it and a finger's drag on it, never past what's inside
// it. The wheel over a scrolling panel is never the world's (no zoom), and a finger that drags one is no press.
import { engineCanvas } from '../../engine/index';
import { uiScales } from '../scale';
import { four, type Length, type Sides } from '../../engine/ui';
import type { Panel } from './panel';

/** how far a finger moves before its press is a drag that scrolls (css px) */
const DRAG_PX = 8;
/** px a line of the wheel's scrolls (a wheel that counts lines, as Firefox's may) */
const LINE_PX = 40;

const scrolling = new Set<Panel>();
let listening = false;

/** `panel` scrolls from now on: its overflow set to `scroll`, moved by the wheel and a finger's drag. */
export function scrolls(panel: Panel): void {
  panel.style({ overflow: 'scroll' });
  scrolling.add(panel);
  listen();
}

/** The foot of four sides (px of the reference layout; a share of the container's counts as none). */
function footOf(sides: Sides<Length> | Sides<number> | undefined): number {
  const foot = four<Length>(sides ?? 0)[2];
  return typeof foot === 'number' ? foot : 0;
}

/** How far `panel` can be scrolled (px of the reference layout): how far what's inside it reaches past its box, as
 *  CSS's flexbox reaches, each child's margin under it and the panel's own padding at its foot counted. */
export function scrollRoom(panel: Panel): number {
  const box = panel.rect();
  if (!box) return 0;
  const k = uiScales[panel.scaled];
  const scrolled = panel.scrolled * k;
  // (what's in its flow reaches its foot's padding past it; what's laid absolutely, its own foot alone, as CSS counts
  // them: a box's ring and brackets laid across it read as content and it scrolled by its padding)
  let flowing = 0;
  let laid = 0;
  for (const child of panel.inside) {
    const at = child.rect();
    if (!at) continue;
    const foot = at.y + at.h + scrolled - box.y;
    if (child.styled.position === 'absolute') laid = Math.max(laid, foot);
    else flowing = Math.max(flowing, foot + footOf(child.styled.margin) * k);
  }
  const reach = Math.max(flowing + (footOf(panel.styled.padding) + footOf(panel.styled.border)) * k, laid);
  return Math.max(0, (reach - box.h) / k);
}

/** `panel` scrolled to `to` (px of the reference layout), held within what's inside it. */
export function scrollTo(panel: Panel, to: number): void {
  const held = Math.min(scrollRoom(panel), Math.max(0, to));
  panel.look({ scroll: held });
}

/** The innermost scrolling panel shown under (`x`, `y`) css px, if any. */
function scrollingAt(x: number, y: number): Panel | null {
  let found: { panel: Panel; area: number } | null = null;
  for (const panel of scrolling) {
    if (panel.gone) {
      scrolling.delete(panel);
      continue;
    }
    const box = panel.seen ? panel.rect() : null;
    if (!box || x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) continue;
    const area = box.w * box.h;
    if (!found || area < found.area) found = { panel, area };
  }
  return found?.panel ?? null;
}

/** A finger's press on a scrolling panel, as it's dragged. */
interface Drag {
  panel: Panel;
  pointer: number;
  fromY: number;
  fromScroll: number;
  moved: boolean;
}
let drag: Drag | null = null;
/** whether the last finger's press dragged a scrolling panel (its lift presses nothing: `press.ts` asks) */
let dragged = false;

/** Whether an event is on the engine's canvas, its place a place on it (not under the mouse's lock). */
const onCanvas = (e: MouseEvent): boolean => e.target === engineCanvas() && !document.pointerLockElement;

/** The page's wheel and fingers listened to for the scrolling panels, once the first is made. */
function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('wheel', (e) => {
    if (!onCanvas(e)) return;
    const panel = scrollingAt(e.clientX, e.clientY);
    if (!panel) return;
    e.preventDefault();
    e.stopPropagation();
    const k = uiScales[panel.scaled];
    const by = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * LINE_PX : e.deltaY;
    scrollTo(panel, panel.scrolled + by / k);
  }, { capture: true, passive: false });
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !onCanvas(e)) return;
    const panel = scrollingAt(e.clientX, e.clientY);
    if (!panel) return;
    dragged = false;
    drag = { panel, pointer: e.pointerId, fromY: e.clientY, fromScroll: panel.scrolled, moved: false };
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dy = e.clientY - drag.fromY;
    if (!drag.moved && Math.abs(dy) < DRAG_PX) return;
    drag.moved = true;
    dragged = true;
    const k = uiScales[drag.panel.scaled];
    scrollTo(drag.panel, drag.fromScroll - dy / k);
  }, true);
  const end = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointer) drag = null;
  };
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
}

/** Whether the last finger's press dragged a scrolling panel: its lift presses nothing (`press.ts`). */
export const pressDragged = (): boolean => dragged;
