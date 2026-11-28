// The save slots' grids as the kit lays them out (#973): CSS's `repeat(n, minmax(0, 1fr))` and `max-content` columns
// are rows of flex here, each box given its column's width from the row's panel as laid out (`savesSheet.ts`, and
// the cloud dialog's lists in `cloudSheet.ts`).
import { measure, type TextStyle } from './overlay/paint';
import { uiScales } from './scale';
import type { Panel } from './kit/panel';

/** A panel's width as laid out, px of its own scale (0 till it is). */
export const widthOf = (panel: Panel | null): number =>
  (panel ? (panel.rect()?.w ?? 0) / uiScales[panel.scaled] : 0);

/** A grid's column (`repeat(n, minmax(0, 1fr))` with `gap` px between): its share of the row's width, a hair under
 *  (a row its items fill exactly wraps its last). */
export function columnOf(round: Panel | null, n: number, gap: number): number {
  return Math.max(0, (widthOf(round) - gap * (n - 1)) / n - 0.01);
}

/** The widest of a list's terms (`dt`) in `style` (px): a grid's `max-content` column. */
export function termsWidth(list: Element | null, style: TextStyle): number {
  const terms = list ? [...list.querySelectorAll(':scope > dt')] : [];
  return Math.max(0, ...terms.map((term) => measure(term.textContent ?? '', style).w)) + 1;
}
