// Whether a page's element shows (`checkVisibility()`, its `display` and its ancestors'), asked again only as what
// decides it changes (#973). The kit's panels follow the page's elements kept out of sight, and each frame each one
// asked the browser whether its element showed: every ask after the page's own writes laid out its styles again, 2.6 s
// of a slowed CPU's wave 36 (`lab perf --wave 36 --throttle 4 --profile=frame`). An element's `display` is decided by
// its own attributes and its ancestors' (a class, a style, `hidden`) and by the window's size (a media query), so the
// answer is kept until a mutation observer sees one of those attributes change, the window resized, or
// `REFRESH_FRAMES` frames went by (a rule met another way: a sibling's class, a stylesheet added).
import { kitFrame } from './kitCounts';

/** the frames an answer is kept at most, whatever changed */
const REFRESH_FRAMES = 60;
/** the attributes that decide whether an element shows */
const DECIDING = ['class', 'style', 'hidden'];

interface Kept {
  shown: boolean;
  /** the frame it was asked at, and the window's size then */
  frame: number;
  width: number;
  height: number;
  /** its own attributes and its ancestors', watched, as they stood under `parent` */
  watch: MutationObserver;
  parent: Element | null;
  /** a change seen by the watch's own callback (records handed to it are gone from `takeRecords`) */
  changed: boolean;
}

const kept = new WeakMap<Element, Kept>();

/** A watch on `element`'s attributes and each of its ancestors' that decide whether it shows, `entry` marked
 *  changed as they do. */
function watchOf(element: Element, entry: Kept): MutationObserver {
  const watch = new MutationObserver(() => {
    entry.changed = true;
  });
  for (let at: Element | null = element; at; at = at.parentElement) {
    watch.observe(at, { attributes: true, attributeFilter: DECIDING });
  }
  return watch;
}

/** Whether the answer kept for `element` may stand: nothing that decides it changed, and not too old. */
function stands(entry: Kept): boolean {
  if (entry.changed || entry.watch.takeRecords().length) return false;
  if (entry.width !== innerWidth || entry.height !== innerHeight) return false;
  return kitFrame() - entry.frame < REFRESH_FRAMES;
}

/** Whether `element` shows on the page (`checkVisibility()`), kept till what decides it changes. */
export function shownOnPage(element: Element): boolean {
  let entry = kept.get(element);
  if (entry && element.isConnected && entry.parent === element.parentElement && stands(entry)) return entry.shown;
  if (!entry || entry.parent !== element.parentElement) {
    // (moved under another parent: its new ancestors watched)
    entry?.watch.disconnect();
    const made: Kept = {
      shown: false, frame: 0, width: 0, height: 0, watch: null!, parent: element.parentElement, changed: true,
    };
    made.watch = watchOf(element, made);
    entry = made;
    kept.set(element, entry);
  }
  entry.changed = false;
  entry.shown = element.checkVisibility();
  entry.frame = kitFrame();
  entry.width = innerWidth;
  entry.height = innerHeight;
  return entry.shown;
}

/** Whether `element` is there and shows on the page (`shownOnPage`). */
export const shownIf = (element: Element | null): boolean => !!element && shownOnPage(element);
