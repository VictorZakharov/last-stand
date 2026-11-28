// The theme's colours as the kit's panels take them (#973: `styles/_theme.scss`'s, which the page's markup reads as
// custom properties): one place for a port to take them from, so a screen moved off the page keeps its colours.

/** `$frame`: frame lines and borders */
export const FRAME = '#a07c46';
/** `$frame-dark`: the dark outer border of framed boxes */
export const FRAME_DARK = '#4a3620';
/** `$accent`: headings, titles, active tabs */
export const ACCENT = '#e2c07e';
/** `$accent-glow`: the glow behind accent text */
export const ACCENT_GLOW = '#f0be5a';
/** `$highlight`: what's chosen, new or hovered */
export const HIGHLIGHT = '#f0c860';
/** `$ink`: text */
export const INK = '#e6dcc8';
/** `$ink-dim`: secondary text */
export const INK_DIM = '#9a8f7c';
/** `$danger`: warnings, losses, discarding */
export const DANGER = '#ff5a4a';
/** `$well`: a sunken field's fill, top to bottom */
export const WELL: [string, string] = ['#141212', '#0a0909'];
/** `--panel`: a panel's fill */
export const PANEL = 'rgba(12,11,14,.92)';

/** `$well-lit`: a sunken field's fill when chosen, top to bottom */
export const WELL_LIT: [string, string] = ['#2a2218', '#120e0a'];

/** `colour` (`#rrggbb`) and `base` (`#rrggbb`, at `baseAlpha`) mixed, `share` of the first (CSS's `color-mix(in
 *  srgb, colour share, base)`). */
export function mix(colour: string, share: number, base: string, baseAlpha = 1): string {
  const parts = (hex: string): number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const [one, two] = [parts(colour.length === 4 ? long(colour) : colour), parts(base)];
  const [r, g, b] = one.map((value, at) => Math.round(value * share + two[at] * (1 - share)));
  return `rgba(${r},${g},${b},${share + baseAlpha * (1 - share)})`;
}

/** `#rgb` as `#rrggbb`. */
const long = (short: string): string => `#${[...short.slice(1)].map((digit) => digit + digit).join('')}`;

/** `colour` (`#rrggbb`) at `alpha`, as SCSS's `rgba($colour, alpha)`. */
export function alpha(colour: string, share: number): string {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
  return `rgba(${r},${g},${b},${share})`;
}
