// The guide's room as its sheets read it (#973, `guideSheet.ts`): the window's sizes its SCSS asks by media and
// container queries, a box's width inside its padding (a child's `100%`), a grid's `auto-fill` columns, and the
// colours the page writes as custom properties, the theme's resolved.
import { accent } from '../diagFrame';
import { mediaQuery } from '../controlsSheet';
import { DANGER, FRAME, HIGHLIGHT, INK } from '../kit/theme';
import { drawnFor } from '../kit/press';
import { readUnlaid } from '../kit/sheetDirty';
import { widthOf } from '../savesGrid';
import { four, type Length } from '../../engine/ui';
import type { Panel } from '../kit/panel';

/** a narrow or short window: the entries in a row over the page (`(max-width: 760px), (max-height: 520px)`) */
export const NARROW = mediaQuery('(max-width: 760px), (max-height: 520px)');
/** a window too narrow for things side by side (`(max-width: 520px)`) */
export const SKINNY = mediaQuery('(max-width: 520px)');

/** each panel's width when it was last laid out (px of its scale) */
const known = new WeakMap<Panel, number>();
/** the frames a panel not laid out yet is asked about before its tree may rest (one hidden for good asks no more) */
const UNLAID_FRAMES = 60;
/** how often each panel not laid out yet was asked about */
const unlaidAsked = new WeakMap<Panel, number>();

/** `round` read before it was ever laid out: its tree follows again next frame, a few frames at most. */
function unlaid(round: Panel): void {
  const asked = unlaidAsked.get(round) ?? 0;
  if (asked >= UNLAID_FRAMES) return;
  unlaidAsked.set(round, asked + 1);
  readUnlaid();
}

/** `round`'s width inside its padding and border (px of its scale): what a child's `100%` is. While it isn't laid
 *  out (made this frame, or the screen hidden for a moment) its last width, or none known, its own round's inside
 *  (a box stretched across a column), its tree followed again till it's laid out: read as none, every width made
 *  from it was none, and a tree at rest kept its trays and slots 0 px wide, or for some frames after a page
 *  opened, its tiles stood a hair wide. */
export function innerOf(round: Panel | null): number {
  if (!round) return 0;
  const width = widthOf(round);
  if (width > 0) known.set(round, width);
  else if (!known.has(round)) unlaid(round);
  const outer = known.get(round) ?? (round.parent ? innerOf(round.parent) : 0);
  const px = (length: Length): number => (typeof length === 'number' ? length : 0);
  const pad = four<Length>(round.styled.padding ?? 0);
  const border = four<number>(round.styled.border ?? 0);
  return Math.max(0, outer - px(pad[1]) - px(pad[3]) - border[1] - border[3]);
}

/** The page's width inside its padding (CSS's container on `.gd-page`, which its container queries ask). */
export function pageWidth(): number {
  const page = document.querySelector('#guide .gd-page');
  return page ? innerOf(drawnFor(page)) : 0;
}

/** A grid's `repeat(auto-fill, minmax(least, 1fr))` with `gap` px between: as many to a row as fit at their least,
 *  sharing the row, a hair under (a row its items fill exactly wraps its last). */
export function autoFill(least: number, gap: number) {
  return (_element: Element, round: Panel | null): { width: number; shrink: number } => {
    const room = innerOf(round);
    const n = Math.max(1, Math.floor((room + gap) / (least + gap)));
    return { width: Math.max(0, (room - gap * (n - 1)) / n - 0.01), shrink: 0 };
  };
}

/** A colour the page writes as a custom property (`--c`), its theme's own resolved (`var(--life-bar)`). */
export function colourOf(element: Element | null, fallback: string): string {
  const said = (element as HTMLElement | null)?.style.getPropertyValue('--c').trim() ?? '';
  return said ? themed(said) : fallback;
}

/** the theme's colours the guide's data names (`#guide`'s own and the page's) */
const THEMED: Record<string, () => string> = {
  '--life-bar': () => '#d8323a', '--energy-bar': () => '#1fae8a', '--ally': () => '#6ab8ff',
  '--highlight': () => HIGHLIGHT, '--accent': accent, '--frame': () => FRAME, '--ink': () => INK,
  '--danger': () => DANGER,
};
/** `value` with a `var(--name)` of the theme's resolved. */
export function themed(value: string): string {
  const named = /^var\((--[\w-]+)/.exec(value)?.[1];
  return named ? THEMED[named]?.() ?? INK : value;
}
