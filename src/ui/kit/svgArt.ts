// An SVG icon of the page's drawn as a panel's picture (#973: the touch buttons' icons, styled by the page's CSS).
// The page's `<svg>` is cloned with the paint its stylesheet gives it (fill, stroke, its width and ends, its colour)
// written on it, and loaded as an image once for each look; the picture paints that image.

import { followAll } from './sheetDirty';

/** the paint an icon takes from the stylesheet, as written on its clone */
const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity'] as const;

const images = new Map<string, HTMLImageElement>();
/** the pictures still loading */
const loading = new Set<Promise<void>>();
const markups = new WeakMap<SVGSVGElement, { look: string; markup: string }>();

/** `svg` as markup that draws alone: its stylesheet's paint written on it, `currentColor` its colour. */
function markupOf(svg: SVGSVGElement): string {
  const style = getComputedStyle(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  for (const name of PAINT) clone.setAttribute(name, style.getPropertyValue(name));
  // (each shape's own paint, where the stylesheet gives one: a graph's line)
  clone.querySelectorAll<SVGElement>('[class]').forEach((shape, at) => {
    const own = getComputedStyle(svg.querySelectorAll('[class]')[at]);
    for (const name of PAINT) shape.setAttribute(name, own.getPropertyValue(name));
  });
  withBorrowedDefs(clone);
  return clone.outerHTML.replace(/currentColor/g, style.color);
}

/** what an SVG's paint or `use` names of the page's: `url(#id)`, `href="#id"` */
const NAMED = /url\(#([\w-]+)\)|href="#([\w-]+)"/g;

/** `clone` given a copy of each gradient, filter or shape it names that the page defines elsewhere (the item icons'
 *  shared `<defs>`, a doll's gold from the mage's doll), and of what those name in turn: drawn alone as an image, it
 *  can't reach them. */
function withBorrowedDefs(clone: SVGSVGElement): void {
  const borrowed = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const have = new Set([...clone.querySelectorAll('[id]')].map((element) => element.id));
  const take = (markup: string): void => {
    for (const match of markup.matchAll(NAMED)) {
      const id = match[1] ?? match[2];
      if (have.has(id)) continue;
      have.add(id);
      const found = document.getElementById(id);
      if (!found) continue;
      const copy = found.cloneNode(true) as Element;
      borrowed.appendChild(copy);
      take(copy.outerHTML);
    }
  };
  take(clone.outerHTML);
  if (borrowed.childElementCount) clone.prepend(borrowed);
}

/** `svg` drawn as the page draws it, once its image has loaded (null till then: ask again the next frame); and a
 *  key that changes as its look does. */
export function svgArt(svg: SVGSVGElement): { key: string; image: HTMLImageElement | null } {
  // (its styles read again only as its button's classes or the page's change: a class's colour, a state)
  const look = `${svg.parentElement?.className ?? ''}|${document.body.className}`;
  let known = markups.get(svg);
  if (known?.look !== look) {
    known = { look, markup: markupOf(svg) };
    markups.set(svg, known);
  }
  const markup = known.markup;
  let image = images.get(markup);
  if (!image) {
    image = new Image();
    // (an image off the page tells the window nothing as it loads: the trees drawing it follow again, or a tree at
    // rest never drew it: the hero selection's arrows and his name stayed blank)
    image.addEventListener('load', followAll, { once: true });
    const shown = image;
    const loaded: Promise<void> = new Promise<void>((resolve) => {
      shown.addEventListener('load', () => resolve(), { once: true });
      shown.addEventListener('error', () => resolve(), { once: true });
    }).finally(() => loading.delete(loaded));
    loading.add(loaded);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    images.set(markup, image);
  }
  const ready = image.complete && image.naturalWidth > 0;
  return { key: markup, image: ready ? image : null };
}

/** Once every picture asked for has loaded (the lab's, before it pictures the screen: a picture loads on the
 *  browser's time, which its fixed clock never gives); whether any was still loading. */
export async function picturesLoaded(): Promise<boolean> {
  if (!loading.size) return false;
  while (loading.size) await Promise.all([...loading]);
  return true;
}
