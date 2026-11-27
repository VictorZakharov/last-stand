// What makes a screen drawn as a style sheet follow its page element again (#973). Followed every frame, the pause
// menu's 1,400 nodes cost 3 to 6 ms of the main thread on this PC standing still (`lab ui --cost`), a phone's frame
// several times over. A tree now follows only when something it reads may have changed:
// - a mutation inside its element (a class, an attribute, its words, its children), or of any screen's own element
//   or what holds one (`body.touch`, a screen shown or hidden that another's rule reads);
// - the window's size, the UI's scales, the ratio or the class's accent;
// - the focus, a field's input or change, a picture loaded, the pointer's hover over it (`hovers`);
// - and the frame after one that sent the engine anything, until one sends nothing: a rule reading a box laid out
//   (the keyboard's column, the report's picture under its field) settles, an easing or a pulse runs to its end.
// A box ticked and a slider follow their inputs each frame apart from this (`SheetTree`), as code sets `checked`
// and `value` without an event.
import { uiScales } from '../scale';
import { accent } from '../diagFrame';
import { kitFrame } from './panel';

/** A tree that can be told to follow again: its page element, and how it's told. */
export interface Followed {
  element: Element;
  again: () => void;
}

const followed = new Set<Followed>();
let observer: MutationObserver | null = null;
/** the frame the mutations were last taken in */
let takenAt = -1;
/** the window, the scales and the accent as the last frame read them, and whether they changed this frame */
let lastEnvironment = '';
let readAt = -1;
let changedNow = false;

/** Every tree told to follow again. */
export function followAll(): void {
  for (const tree of followed) tree.again();
}

/** The trees a mutation of `target` concerns: every one where it's a screen's own element or holds one, else the
 *  one it's inside. */
function concerned(target: Node): void {
  for (const tree of followed) {
    if (target === tree.element || target.contains(tree.element)) {
      followAll();
      return;
    }
  }
  for (const tree of followed) {
    if (tree.element.contains(target)) tree.again();
  }
}

/** The page watched for what makes a tree follow again, once the first tree is made. */
function watch(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((records) => {
    for (const record of records) concerned(record.target);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
    characterData: true });
  for (const type of ['focusin', 'focusout', 'input', 'change', 'load', 'toggle']) {
    window.addEventListener(type, followAll, { capture: true, passive: true });
  }
  addEventListener('resize', followAll);
}

/** `tree` followed again as what it reads changes, until `forget`. */
export function watchTree(tree: Followed): () => void {
  watch();
  followed.add(tree);
  return () => followed.delete(tree);
}

/** The mutations made since they were last told, told now, once a frame: their records come in a microtask, and a
 *  frame run before one (the lab's frames, stepped without yielding) left a card opened in it untold, never drawn. */
export function takeMutations(): void {
  if (!observer || takenAt === kitFrame()) return;
  takenAt = kitFrame();
  for (const record of observer.takeRecords()) concerned(record.target);
}

/** Whether the window, the scales or the accent changed since the frame before (every tree follows again then). */
export function environmentChanged(): boolean {
  if (readAt === kitFrame()) return changedNow;
  readAt = kitFrame();
  const now = `${innerWidth}x${innerHeight} ${devicePixelRatio} ${uiScales.ui} ${uiScales.hud} ${uiScales.touch} `
    + accent();
  changedNow = now !== lastEnvironment;
  lastEnvironment = now;
  return changedNow;
}
