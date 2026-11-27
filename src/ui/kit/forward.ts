// The pointer's events over a screen the kit draws, dispatched to the page's element drawn there (#973: the lobby's
// panels hang their behaviour on the page's events: a tooltip on the mouse's enter and leave, a right-click that
// unequips, HTML's drag and drop between the stash and the equipment, a long press on touch). The engine's canvas
// takes the pointer, and each screen's elements stay on the page out of sight (`.kit-mirror`); here, each event of
// the pointer's on the canvas is told to the element whose panel is drawn under it, as the browser tells its own:
// over and out (bubbling), enter and leave (each element entered or left), move, down and up, a click where a press
// began and ended on one element, the context menu, and a drag of a `draggable` element (dragstart, dragenter,
// dragover, dragleave, drop and dragend, with a `DataTransfer` the page's handlers write and read). The game's code
// listens as it did.
import { focusAtEnd } from './field';
import { engineCanvas } from '../../engine/index';
import { overPanels } from '../../core/input';
import { uiHit } from '../../engine/ui';
import { Panel, LAYERS, layer } from './panel';
import { uiScales } from '../scale';
import { beginAltRange, dragAltRange, endAltRange } from '../altForms';

/** A screen whose elements take the pointer's events: the element drawn under a point, if any takes the pointer. */
export interface Forwarded {
  /** the deepest element taking the pointer whose panel is drawn under (`x`, `y`) css px, or none */
  elementAt(x: number, y: number): Element | null;
  /** told which of its elements the pointer's over (with every element round it, as CSS's `:hover`), and which it
   *  presses (`:active`) */
  hovers(over: Element | null, pressed: Element | null): void;
}

/** how far a press moves before it's a drag (css px), as a browser's threshold */
const DRAG_AFTER = 4;
/** the drag's picture: its side (px of the touch controls), its look */
const GHOST = 40;
const GHOST_LOOK = { fill: 'rgba(240,200,96,.18)', border: 'rgba(240,200,96,.8)', radius: 3 };

const screens: Forwarded[] = [];
let listening = false;
let over: Element | null = null;
let pressed: { element: Element; x: number; y: number; button: number } | null = null;
let drag: { source: Element; data: DataTransfer; over: Element | null; accepted: boolean; ghost: Panel } | null = null;
/** whether this press's click was told already, so the browser's own after it is none of the page's: a tap on a
 *  stash item opened its sheet, and the browser's click of the same tap, coming after, landed on the sheet's backdrop
 *  and shut it */
let clicked = false;
/** whether a slider's being dragged (`altForms.ts`) */
let sliding = false;

/** `screen`'s elements take the pointer's events from now on (the last one given is over the ones before). */
export function forwards(screen: Forwarded): void {
  screens.push(screen);
  listen();
}

/** `screen`'s elements take no events from now on. */
export function unforward(screen: Forwarded): void {
  const at = screens.indexOf(screen);
  if (at >= 0) screens.splice(at, 1);
}

/** The element drawn under (`x`, `y`) taking the pointer, of the screen laid over the others first. */
export function elementAt(x: number, y: number): Element | null {
  for (let at = screens.length - 1; at >= 0; at--) {
    const found = screens[at].elementAt(x, y);
    if (found) return found;
  }
  return null;
}

/** the page's elements over the canvas that the kit's screens are drawn over (`seeThrough`) */
const through = new Set<EventTarget>();

/** `element`, a page's element over the engine's canvas, under the kit's screens as the player sees them: a press on
 *  it where one of their elements is drawn is that element's (the touch controls' move pad, over the left half of the
 *  screen: the page's panels stood over it, and drawn by the kit the village's card took no tap there). */
export function seeThrough(element: Element): void {
  through.add(element);
}

/** Whether a pointer event is the engine's canvas's, its place a place on it (not under the mouse's lock). */
function onCanvas(e: PointerEvent | MouseEvent): boolean {
  const target = e.target;
  return !!target && (target === engineCanvas() || through.has(target)) && !document.pointerLockElement;
}

/** The mouse event `type` as the browser makes it at `e`'s place. */
function mouse(type: string, e: MouseEvent, bubbles = true, related: Element | null = null): MouseEvent {
  return new MouseEvent(type, {
    bubbles, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX,
    screenY: e.screenY, button: e.button, buttons: e.buttons, detail: type === 'click' ? 1 : 0,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, relatedTarget: related,
  });
}

/** The pointer event `type` as the browser makes it at `e`'s place. */
function pointer(type: string, e: PointerEvent, bubbles = true, related: Element | null = null): PointerEvent {
  return new PointerEvent(type, {
    bubbles, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY, button: e.button,
    buttons: e.buttons, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, relatedTarget: related,
  });
}

/** `element` and every element round it, the outermost last. */
function chainOf(element: Element | null): Element[] {
  const chain: Element[] = [];
  for (let at = element; at; at = at.parentElement) chain.push(at);
  return chain;
}

/** The pointer moved onto `under` from `over`: out and leave told to what it left, over and enter to what it met. */
function moveOver(under: Element | null, e: PointerEvent): void {
  if (under === over) return;
  const left = chainOf(over);
  const met = chainOf(under);
  if (over) {
    over.dispatchEvent(pointer('pointerout', e, true, under));
    over.dispatchEvent(mouse('mouseout', e, true, under));
    for (const element of left.filter((one) => !met.includes(one))) {
      element.dispatchEvent(pointer('pointerleave', e, false, under));
      element.dispatchEvent(mouse('mouseleave', e, false, under));
    }
  }
  const before = over;
  over = under;
  if (under) {
    under.dispatchEvent(pointer('pointerover', e, true, before));
    under.dispatchEvent(mouse('mouseover', e, true, before));
    for (const element of met.filter((one) => !left.includes(one)).reverse()) {
      element.dispatchEvent(pointer('pointerenter', e, false, before));
      element.dispatchEvent(mouse('mouseenter', e, false, before));
    }
  }
}

/** Every screen told what the pointer's over and presses now. */
function showHover(): void {
  for (const screen of screens) screen.hovers(over, pressed?.element ?? null);
}

/** The drag of `source` begun: its start told, refused where the page cancels it. */
function startDrag(source: Element, e: PointerEvent): void {
  const data = new DataTransfer();
  const start = new DragEvent('dragstart', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
    dataTransfer: data });
  if (!source.dispatchEvent(start)) return;
  const ghost = new Panel(layer(LAYERS.drag), { position: 'absolute', width: GHOST, height: GHOST }, GHOST_LOOK,
    'touch');
  drag = { source, data, over: null, accepted: false, ghost };
}

/** The drag event `type` at `e`'s place, told to `element`; whether the page cancelled it (a drop it takes). */
function dragEvent(type: string, element: Element, e: PointerEvent, related: Element | null = null): boolean {
  const event = new DragEvent(type, { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
    dataTransfer: drag!.data, relatedTarget: related });
  return !element.dispatchEvent(event);
}

/** The drag moved to `e`'s place: its picture under the pointer, its enter, over and leave told. */
function moveDrag(e: PointerEvent): void {
  const now = drag!;
  // (its place in px of the touch controls' scale, which it's drawn at)
  const k = uiScales.touch;
  now.ghost.style({ inset: [e.clientY / k - GHOST / 2, 'auto', 'auto', e.clientX / k - GHOST / 2] });
  dragEvent('drag', now.source, e);
  const under = elementAt(e.clientX, e.clientY) ?? document.body;
  if (under !== now.over) {
    if (now.over) dragEvent('dragleave', now.over, e, under);
    dragEvent('dragenter', under, e, now.over);
    now.over = under;
  }
  now.accepted = dragEvent('dragover', under, e);
}

/** The drag let go at `e`'s place: dropped where the page took it, ended either way. */
function endDrag(e: PointerEvent): void {
  const now = drag!;
  drag = null;
  if (now.over && now.accepted) dragEvent('drop', now.over, e);
  else if (now.over) dragEvent('dragleave', now.over, e);
  const end = new DragEvent('dragend', { bubbles: true, clientX: e.clientX, clientY: e.clientY,
    dataTransfer: now.data });
  now.source.dispatchEvent(end);
  now.ghost.remove();
}

/** A press let go at `e`'s place: its up told, and a click where it began on the same element (a button's by its
 *  own `click`, which a disabled one refuses). */
function release(e: PointerEvent, under: Element | null): void {
  const began = pressed;
  pressed = null;
  // (told where it began too, as the pointer's capture would tell it: a held button let go off it, a colour disc's
  // drag ended past its edge)
  if (began && (!under || !began.element.contains(under))) began.element.dispatchEvent(pointer('pointerup', e));
  if (!under) return;
  under.dispatchEvent(pointer('pointerup', e));
  under.dispatchEvent(mouse('mouseup', e));
  if (!began || began.button !== e.button || e.button !== 0) return;
  const shared = chainOf(began.element).find((element) => element === under || element.contains(under));
  if (!shared) return;
  // (a button, a label, a ticked box and a summary by their own `click`: a dispatched click ticks nothing, and a
  // disabled button refuses its own)
  const own = shared.closest('button, label, input, summary, textarea');
  // (a field typed into focused, as a press on it focuses it: its own `click` focuses nothing)
  if (isTyped(own)) focusAtEnd(own);
  else if (own instanceof HTMLElement) own.click();
  else shared.dispatchEvent(mouse('click', e));
  clicked = true;
}

/** the inputs typed into (not ticked, slid or pressed) */
const TYPED = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** Whether `element` is a field typed into: a text area, or an input of a typed kind. */
function isTyped(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TYPED.has(element.type));
}

/** The browser's press `e`, told to the element under it already, stopped short of the page (heard on the window
 *  alone): the page's own listeners hear the element's copy, as they heard the element's press before the kit drew
 *  it. Left to go on, a finger's long press on a stash item was put out at once by the page's "a tap anywhere else"
 *  (its target the canvas). The right button's is the world's still (the camera turns with it over the HUD). */
function toldAlready(e: PointerEvent): void {
  if (e.button !== 2) e.stopPropagation();
}

/** The page's pointer listened to for the screens, once the first is given: the browser's own events alone (what's
 *  told to an element here comes round through the window too, and a move told to the item under the mouse read as
 *  the mouse leaving the canvas, the stash's focus put out as it lit). */
function listen(): void {
  if (listening) return;
  listening = true;
  const before = overPanels.at;
  // (a press over a screen's element taking the pointer is none of the world's)
  overPanels.at = (x, y) => elementAt(x, y) !== null || (before ? before(x, y) : uiHit(x, y) !== null);
  window.addEventListener('pointermove', (e) => {
    if (!e.isTrusted) return;
    if (drag) {
      moveDrag(e);
      return;
    }
    if (sliding) {
      dragAltRange({ x: e.clientX, y: e.clientY });
      return;
    }
    if (!onCanvas(e)) {
      moveOver(null, e);
      showHover();
      return;
    }
    const under = elementAt(e.clientX, e.clientY);
    moveOver(under, e);
    if (pressed && pressed.button === 0 && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_AFTER) {
      const source = pressed.element.closest('[draggable="true"]');
      if (source) {
        pressed = null;
        startDrag(source, e);
        if (drag) moveDrag(e);
        showHover();
        return;
      }
    }
    if (under) {
      under.dispatchEvent(pointer('pointermove', e));
      under.dispatchEvent(mouse('mousemove', e));
    }
    showHover();
  }, true);
  window.addEventListener('pointerdown', (e) => {
    if (!e.isTrusted) return;
    clicked = false;
    if (!onCanvas(e)) return;
    const under = elementAt(e.clientX, e.clientY);
    moveOver(under, e);
    if (!under) return;
    pressed = { element: under, x: e.clientX, y: e.clientY, button: e.button };
    under.dispatchEvent(pointer('pointerdown', e));
    under.dispatchEvent(mouse('mousedown', e));
    // (a slider pressed is dragged along, wherever the pointer goes, till it's let go)
    if (e.button === 0) sliding = beginAltRange(under, { x: e.clientX, y: e.clientY });
    toldAlready(e);
    showHover();
  }, true);
  window.addEventListener('pointerup', (e) => {
    if (!e.isTrusted) return;
    if (sliding) {
      sliding = false;
      endAltRange();
    }
    if (drag) {
      endDrag(e);
      showHover();
      return;
    }
    const under = onCanvas(e) ? elementAt(e.clientX, e.clientY) : null;
    release(e, under);
    if (under) toldAlready(e);
    if (e.pointerType !== 'mouse') moveOver(null, e);
    showHover();
  }, true);
  window.addEventListener('pointercancel', (e) => {
    if (!e.isTrusted) return;
    if (drag) endDrag(e);
    if (sliding) {
      sliding = false;
      endAltRange();
    }
    pressed = null;
    over?.dispatchEvent(pointer('pointercancel', e));
    moveOver(null, e);
    showHover();
  }, true);
  // (stopped short of the page, but heard on the window: what listens there, as the lab's taps do, still hears it)
  window.addEventListener('click', (e) => {
    if (!clicked || !e.isTrusted) return;
    clicked = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  window.addEventListener('contextmenu', (e) => {
    if (!e.isTrusted) return;
    if (!onCanvas(e)) return;
    const under = elementAt(e.clientX, e.clientY);
    if (under && !under.dispatchEvent(mouse('contextmenu', e))) e.preventDefault();
    if (under) e.stopPropagation();
  }, true);
}
