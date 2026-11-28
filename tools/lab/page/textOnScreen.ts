// Text drawn over other text as the page shows it (`textOverlap.ts` the pure part): each run of text's box on the
// page, or each line where the engine draws it (`.kit-mirror`), cut to what the boxes round it let show.
import { boxOf, kitDrawsItself } from './lab';
import { inked, overlapping, type TextBox } from './textOverlap';

/** `box` cut to what `element` and each element round it up to `root` lets show where it clips its overflow (where
 *  the engine draws it, as it draws it: `boxOf`). */
function clipped(box: TextBox, element: Element, root: Element): TextBox | null {
  let cut = { ...box };
  for (let at: Element | null = element; at && root.contains(at); at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const bounds = boxOf(at);
    cut = {
      name: cut.name, left: Math.max(cut.left, bounds.left), top: Math.max(cut.top, bounds.top),
      right: Math.min(cut.right, bounds.right), bottom: Math.min(cut.bottom, bounds.bottom),
    };
    if (cut.right <= cut.left || cut.bottom <= cut.top) return null;
  }
  return cut;
}

/**
 * Each line of text the engine draws under `root` (a page's element out of sight, `.kit-mirror`): its element's box
 * as drawn, the engine fitting a line's words inside it, named by all its words. Two runs in one line (a name and
 * the dot beside it, a stat's long and short names) are one box.
 */
function drawnTextBoxes(root: Element): TextBox[] {
  const lines = new Map<Element, string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const words = node.textContent?.trim() ?? '';
    const element = node.parentElement;
    if (!words || !element || element.getClientRects().length === 0) continue;
    if (getComputedStyle(element).visibility === 'hidden') continue;
    const line = drawnLineOf(element, root);
    lines.set(line, `${lines.get(line) ?? ''} ${words}`.trim());
  }
  return [...lines].flatMap(([line, words]) => {
    // (a line drawn in no panel of its own yet, a frame after its card's made, reads the box round it: the dialog's)
    if (!kitDrawsItself(line)) return [];
    const drawn = boxOf(line);
    if (drawn.width < 1 || drawn.height < 1) return [];
    const box = { name: words, left: drawn.left, top: drawn.top, right: drawn.right, bottom: drawn.bottom };
    const shown = clipped(inked(box), line, root);
    return shown ? [shown] : [];
  });
}

/** The element whose box a line of text is drawn in: the nearest round `element` that isn't inline (an inline
 *  element's words are runs of its line's). */
function drawnLineOf(element: Element, root: Element): Element {
  let at = element;
  while (at !== root && at.parentElement && getComputedStyle(at).display === 'inline') at = at.parentElement;
  return at;
}

/** Every run of shown text under `root`, each named by its words, as drawn and as its clipping lets it show. */
export function textBoxes(root: Element): TextBox[] {
  if (root.closest('.kit-mirror')) return drawnTextBoxes(root);
  const boxes: TextBox[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const words = node.textContent?.trim() ?? '';
    const element = node.parentElement;
    if (!words || !element || element.getClientRects().length === 0) continue;
    if (getComputedStyle(element).visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      const box = { name: words, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      const shown = clipped(inked(box), element, root);
      if (shown) boxes.push(shown);
    }
  }
  return boxes;
}

/** The text drawn over other text within each element `selector` matches, said with where it is. */
export function textOverOtherText(selector: string, where: string): string[] {
  return [...document.querySelectorAll(selector)].flatMap((root, i) =>
    overlapping(textBoxes(root)).map((found) => `${where} (${selector} ${i + 1}): ${found}`));
}
