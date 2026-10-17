// Painting the world's overlays (ui/overlay) with the canvas, as the page's own CSS drew them: its fonts, text
// shadows and gradients, in px of the labels' art (the UI's reference layout's), on a context scaled to the
// canvas's pixels.

/** A text shadow as CSS gives one: offset, blur radius (px) and colour. */
export interface Shadow { x: number; y: number; blur: number; color: string }

/** How a run of text is drawn. */
export interface TextStyle {
  /** 'display' (Cinzel) or 'body' (Alegreya Sans) */
  face: 'display' | 'body';
  size: number;
  weight?: number;
  color: string;
  shadows?: Shadow[];
  /** px between letters */
  spacing?: number;
  upper?: boolean;
}

/** the page's text shadow for labels over the world (`$outline` in the theme) */
export const OUTLINE: Shadow[] = [{ x: 0, y: 1, blur: 2, color: '#000' }, { x: 0, y: 0, blur: 6, color: '#000' }];

let faces: Record<TextStyle['face'], string> | null = null;
/** The page's font stacks, as its stylesheet sets them (`--font-display`, `--font-body`), the body's lining twin
 *  first (until it has loaded, the canvas paints in the next). */
function fontFaces(): Record<TextStyle['face'], string> {
  if (faces) return faces;
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue('--font-display').trim() || "'Cinzel', Georgia, serif";
  const body = css.getPropertyValue('--font-body').trim() || "'Alegreya Sans', 'Segoe UI', sans-serif";
  const family = body.split(',')[0].replace(/['"]/g, '').trim();
  lining = loadLining(family).catch(() => undefined);
  faces = { display, body: `'${family}${LINING}', ${body}` };
  return faces;
}

// The page sets its text's digits lining (`font-variant-numeric`), as the body face's own are old-style, rising and
// dropping along a row of numbers as lower-case letters do; a canvas takes no such setting. So the body face has a
// twin with its lining digits on (`FontFace.featureSettings`), made from its web font stylesheet, which the labels
// paint in.
const LINING = ' Lining';
let lining: Promise<void> | null = null;

/**
 * `family`'s web font stylesheet alone, read with CORS: from an address of its own, as the page's own stylesheet is
 * asked for without, and the offline worker players have keeps a copy of it that can't answer a request with CORS
 * (asked for so, the page's lost its fonts under it: tools/lab `pwa`). Null if the page names no such family.
 */
async function fontSheet(family: string): Promise<string | null> {
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]');
  if (!link) return null;
  const url = new URL(link.href);
  const wanted = url.searchParams.getAll('family').find((asked) => asked.split(':')[0] === family);
  if (!wanted) return null;
  const response = await fetch(`${url.origin}${url.pathname}?family=${wanted.replace(/ /g, '+')}&display=swap`);
  return response.ok ? response.text() : null;
}

/** Each @font-face of a stylesheet's text, its descriptors by name. */
function fontFaceRules(css: string): Record<string, string>[] {
  return css.split('@font-face').slice(1).map((block) => {
    const descriptors: Record<string, string> = {};
    for (const [, name, value] of block.matchAll(/([a-z-]+)\s*:\s*([^;}]+);/g)) descriptors[name] = value.trim();
    return descriptors;
  });
}

/** `family`'s lining twin: each of its faces (a weight, a range of characters) added again under the twin's name with
 *  its lining digits on, and those of each weight that hold the digits loaded. */
async function loadLining(family: string): Promise<void> {
  const weights = new Set<string>();
  for (const d of fontFaceRules((await fontSheet(family)) ?? '')) {
    if (d['font-family']?.replace(/['"]/g, '') !== family || !d.src) continue;
    const weight = d['font-weight'] ?? 'normal';
    document.fonts.add(new FontFace(family + LINING, d.src, {
      style: d['font-style'] ?? 'normal', weight,
      unicodeRange: d['unicode-range'] ?? 'U+0-10FFFF', featureSettings: '"lnum"',
    }));
    weights.add(weight);
  }
  await Promise.all([...weights].map((w) => document.fonts.load(`${w} 16px '${family}${LINING}'`, '0123456789')));
}

/** Resolves once the body face's lining twin has loaded, or failed to (for a harness: tools/lab `ui`'s digits). */
export function liningLoaded(): Promise<void> {
  fontFaces();
  return lining ?? Promise.resolve();
}

/** The canvas font for `s`. */
export const fontOf = (s: TextStyle): string => `${s.weight ?? 400} ${s.size}px ${fontFaces()[s.face]}`;

let measurer: CanvasRenderingContext2D | null = null;
/** A context to measure text with (never drawn). */
function measuring(): CanvasRenderingContext2D {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')!;
  return measurer;
}

/** How far a style's shadows reach past its text (px), so the label leaves room for them. */
export function shadowReach(s: TextStyle): number {
  let reach = 0;
  for (const sh of s.shadows ?? []) reach = Math.max(reach, sh.blur + Math.max(Math.abs(sh.x), Math.abs(sh.y)));
  return Math.ceil(reach);
}

/** A run of text laid out: its width and the height of its line box (px), the font's ascent within it. */
export interface Measured { text: string; w: number; h: number; ascent: number }

/** Lays `text` out in style `s`: as wide as the page sets it, a line box of the font's size. */
export function measure(text: string, s: TextStyle): Measured {
  const c = measuring();
  const shown = s.upper ? text.toUpperCase() : text;
  c.font = fontOf(s);
  setSpacing(c, s.spacing ?? 0);
  const m = c.measureText(shown);
  const ascent = m.fontBoundingBoxAscent ?? s.size * 0.8;
  const descent = m.fontBoundingBoxDescent ?? s.size * 0.25;
  return { text: shown, w: m.width, h: ascent + descent, ascent };
}

/** Sets the context's letter spacing where the browser has it (Chrome, Firefox, Safari 17+). */
function setSpacing(c: CanvasRenderingContext2D, px: number): void {
  const spaced = c as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in spaced) spaced.letterSpacing = `${px}px`;
}

/**
 * Draws laid-out text with its top left at (x, y) (px) in style `s`: its shadows first, the last CSS lists
 * lowest, as CSS stacks them, then the text. `scale` is the canvas's pixels per px (a shadow's blur and offset
 * aren't scaled by the context's transform).
 */
export function drawText(c: CanvasRenderingContext2D, t: Measured, x: number, y: number, s: TextStyle, scale: number): void {
  c.font = fontOf(s);
  setSpacing(c, s.spacing ?? 0);
  c.textBaseline = 'alphabetic';
  c.fillStyle = s.color;
  const baseline = y + t.ascent;
  const shadows = [...(s.shadows ?? [])].reverse();
  for (const sh of shadows) {
    c.shadowColor = sh.color;
    c.shadowBlur = sh.blur * scale;
    c.shadowOffsetX = sh.x * scale;
    c.shadowOffsetY = sh.y * scale;
    c.fillText(t.text, x, baseline);
  }
  c.shadowColor = 'transparent';
  c.shadowBlur = c.shadowOffsetX = c.shadowOffsetY = 0;
  c.fillText(t.text, x, baseline);
}

/** A vertical gradient over a box (`stops` top to bottom, evenly). */
export function vertical(c: CanvasRenderingContext2D, y: number, h: number, stops: string[]): CanvasGradient {
  const g = c.createLinearGradient(0, y, 0, y + h);
  stops.forEach((col, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), col));
  return g;
}

/** A ring of `width` px drawn round a box, outside it (as CSS's `box-shadow: 0 0 0 width colour`). */
export function ringAround(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, width: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(x - width, y - width, w + width * 2, width);
  c.fillRect(x - width, y + h, w + width * 2, width);
  c.fillRect(x - width, y, width, h);
  c.fillRect(x + w, y, width, h);
}

/** A rounded rectangle's path. */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

const images = new Map<string, HTMLImageElement>();
/**
 * An SVG's markup as an image to draw (made once per markup), and whether it has loaded yet: `onLoad` runs once it
 * has, for a label to paint itself again.
 */
export function svgImage(svg: string, onLoad: () => void): HTMLImageElement | null {
  let img = images.get(svg);
  if (!img) {
    img = new Image();
    // (an inline icon's markup sets no size or namespace of its own: as an image it needs both)
    const sized = svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
    images.set(svg, img);
  }
  if (img.complete && img.naturalWidth > 0) return img;
  img.addEventListener('load', onLoad, { once: true });
  return null;
}
