// Whether the digits shown sit on their line (tools/lab `ui`'s digits check). A font's old-style digits rise and drop
// as lower-case letters do (a 3, 4, 5, 7 and 9 below the line, a 6 and 8 over the rest), and a row of them reads as
// numbers jumping up and down. Each look of the page's text showing digits (its font, weight, style and numeric
// settings, as the page sets them) has the ten digits set out alone in it on top of the page, pictured by the browser,
// and the ink of each read: their tops and bottoms must line up. The world's labels are painted on a canvas, which
// takes no numeric settings: each font they're painted in (`overlay/paint.ts` `fontOf`) has each digit's ink measured
// by the canvas. (The owner, of the skill tooltips: "digits are all jumping up and down in the same line".)
import type { Clip, Lab, Pictured } from './lab';
import * as paint from '../../../src/ui/overlay/paint';

/** what the digits are read from */
const DIGITS = '0123456789';
/** the size they're set out at (css px): large, so a pixel is a small share of them */
const SIZE = 64;
/** how far apart their tops or bottoms may be, as a share of their size: a round digit's overshoot, and the display
 *  face's 3 and 5 dipping 6% under its line by design (old-style ones are 11% apart) */
const LEVEL_SLACK = 0.08;
/** how far inside the probe's box it's pictured (css px; its padding is 8) */
const INSET = 2;
/** a pixel's red at or over this is ink (the digits set out white on black) */
const INK = 96;
/** the probe's id, which the looks shown leave out */
const PROBE_ID = 'lab-digits';
/** the weights the world's labels are painted at (`TextStyle.weight`: 400 when it's left out) */
const PAINTED_WEIGHTS = [400, 500, 700];
const FACES: paint.TextStyle['face'][] = ['body', 'display'];

/** A look of text: what picks its digits' glyphs. */
interface Look {
  family: string;
  weight: string;
  style: string;
  numeric: string;
  features: string;
}

/** Digits as read in a look: how far apart their tops and their bottoms are, as shares of their size. */
interface Level {
  tops: number;
  bottoms: number;
  /** the digits whose tops are highest and lowest, and whose bottoms are */
  extremes: string;
  /** the digits as pictured to be read, where they were (the page's) */
  picture?: Pictured;
}

/** What the check found: lines for the report, and its problems. */
export interface Found {
  lines: string[];
  problems: string[];
  /** the pictures of the digits that jump, set out as they were read */
  moments: Pictured[];
}

/** each look of the page read so far, by its key: a picture each, so each is read once a page */
const read = new Map<string, Level>();

const keyOf = (look: Look): string => Object.values(look).join('|');
const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The look of `element`'s text. */
function lookOf(element: Element): Look {
  const style = getComputedStyle(element);
  return {
    family: style.fontFamily,
    weight: style.fontWeight,
    style: style.fontStyle,
    numeric: style.fontVariantNumeric,
    features: style.fontFeatureSettings,
  };
}

/** A look named for a report: its font's first family, its weight, and its numeric settings if any. */
function lookName(look: Look): string {
  const family = look.family.split(',')[0].replace(/['"]/g, '').trim();
  const numeric = look.numeric === 'normal' ? '' : ` ${look.numeric}`;
  return `${family} ${look.weight}${look.style === 'normal' ? '' : ` ${look.style}`}${numeric}`;
}

/** `element` named for a report: its tag, id or first class, and the id of what it's in. */
function nameOf(element: Element): string {
  const own = element.id ? `#${element.id}` : element.classList[0] ? `.${element.classList[0]}` : '';
  const within = element.parentElement?.closest('[id]');
  return `${element.tagName.toLowerCase()}${own}${within ? ` in #${within.id}` : ''}`;
}

/** Whether `element` shows: an area on the page, seen. */
function shown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
}

/** Each look of the page's shown text with a digit in it, with the elements showing it. */
function looksShown(): Map<string, { look: Look; elements: Element[] }> {
  const looks = new Map<string, { look: Look; elements: Element[] }>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!element || !/\d/.test(node.textContent ?? '')) continue;
    if (element.closest(`#${PROBE_ID}, script, style`) || !shown(element)) continue;
    const look = lookOf(element);
    const key = keyOf(look);
    const seen = looks.get(key) ?? { look, elements: [] };
    seen.elements.push(element);
    looks.set(key, seen);
  }
  return looks;
}

/** The ten digits set out in `look`, white on black on top of the page, each in a box of its own. */
function setOut(look: Look): HTMLElement {
  const probe = document.createElement('div');
  probe.id = PROBE_ID;
  Object.assign(probe.style, {
    position: 'fixed', left: '0', top: '0', zIndex: '2147483647', padding: '8px', pointerEvents: 'none',
    background: '#000', color: '#fff', textShadow: 'none', letterSpacing: '0', whiteSpace: 'nowrap',
    fontFamily: look.family, fontWeight: look.weight, fontStyle: look.style, fontSize: `${SIZE}px`,
    lineHeight: '1.6', fontVariantNumeric: look.numeric, fontFeatureSettings: look.features,
  });
  for (const digit of DIGITS) {
    const box = document.createElement('span');
    box.textContent = digit;
    box.style.marginRight = '0.3em';
    probe.append(box);
  }
  document.body.append(probe);
  return probe;
}

/** The area of the page a probe is pictured in (css px): inside its edges, as the picture's last row took in a
 *  sliver of the page under it, read as a digit's ink. */
function insideOf(box: DOMRect): Clip {
  return { x: box.left + INSET, y: box.top + INSET, width: box.width - 2 * INSET, height: box.height - 2 * INSET };
}

/** The page's pixels within `clip` (css px) as the browser pictures them, and how many pixels a css px is. */
async function pixelsIn(
  lab: Lab, clip: Clip, label: string,
): Promise<{ pixels: ImageData; scale: number; picture: Pictured }> {
  const picture = await lab.screen(label, [], clip);
  const image = new Image();
  image.src = picture.tiles[0].png;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  return { pixels, scale: image.width / clip.width, picture };
}

/** The first and last rows with ink between the columns `from` and `to` (pixels), or null if there's none. */
function inkRows(pixels: ImageData, from: number, to: number): [number, number] | null {
  let first = -1;
  let last = -1;
  for (let row = 0; row < pixels.height; row++) {
    for (let column = from; column < to; column++) {
      if (pixels.data[(row * pixels.width + column) * 4] < INK) continue;
      if (first < 0) first = row;
      last = row;
      break;
    }
  }
  return first < 0 ? null : [first, last];
}

/** How far apart the tops and the bottoms of `inks` are ([top, bottom] each, px), as shares of `size`. */
function levelOf(inks: [number, number][], size: number): Level {
  const tops = inks.map((ink) => ink[0]);
  const bottoms = inks.map((ink) => ink[1]);
  return {
    tops: (Math.max(...tops) - Math.min(...tops)) / size,
    bottoms: (Math.max(...bottoms) - Math.min(...bottoms)) / size,
    extremes: `the ${extremeOf(tops, Math.min)} highest, the ${extremeOf(bottoms, Math.max)} lowest`,
  };
}

/** The digits whose `values` are `extreme` (Math.min or Math.max), as `3, 5`. */
function extremeOf(values: number[], extreme: (...values: number[]) => number): string {
  const most = extreme(...values);
  return [...DIGITS].filter((_, i) => values[i] === most).join(', ');
}

/** The digits of `look` read from the page's picture of them set out alone. */
async function readLook(lab: Lab, look: Look): Promise<Level> {
  const probe = setOut(look);
  try {
    const clip = insideOf(probe.getBoundingClientRect());
    const { pixels, scale, picture } = await pixelsIn(lab, clip, `digits ${read.size + 1}`);
    const inks: [number, number][] = [];
    for (const digit of probe.children) {
      const own = digit.getBoundingClientRect();
      const from = Math.round((own.left - clip.x) * scale);
      const to = Math.round((own.right - clip.x) * scale);
      const rows = inkRows(pixels, from, to);
      if (!rows) throw new Error(`lab: digits: no ink of the ${digit.textContent} set out in ${lookName(look)}`);
      inks.push(rows);
    }
    return { ...levelOf(inks, SIZE * scale), picture };
  } finally {
    probe.remove();
  }
}

/** Whether a level is off: tops or bottoms further apart than a round digit's overshoot. */
const jumping = (level: Level): boolean => level.tops > LEVEL_SLACK || level.bottoms > LEVEL_SLACK;
const levelText = (level: Level): string =>
  `tops ${percent(level.tops)} apart, bottoms ${percent(level.bottoms)}: ${level.extremes}`;

/** The page's text: each look showing digits read (once a page), a problem for each whose digits jump. */
async function pageDigits(lab: Lab): Promise<Found> {
  await document.fonts.ready;
  const looks = looksShown();
  const problems: string[] = [];
  const moments: Pictured[] = [];
  for (const [key, { look, elements }] of looks) {
    if (!read.has(key)) read.set(key, await readLook(lab, look));
    const level = read.get(key)!;
    if (!jumping(level)) continue;
    const where = elements.slice(0, 3).map(nameOf).join(', ');
    const more = elements.length > 3 ? ` and ${elements.length - 3} more` : '';
    const jumped = `digits jump up and down in the page's text, ${lookName(look)} (${levelText(level)})`;
    problems.push(`${jumped}: ${where}${more}`);
    if (level.picture) moments.push({ ...level.picture, notes: [jumped] });
  }
  return { lines: [`  digits: ${looks.size} looks of the page's text show them`], problems, moments };
}

/** The ink of each digit painted in `font` on a canvas, [top, bottom] from the line (px). */
function paintedInks(font: string): [number, number][] {
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = font;
  return [...DIGITS].map((digit) => {
    const measured = context.measureText(digit);
    return [-measured.actualBoundingBoxAscent, measured.actualBoundingBoxDescent];
  });
}

/** The world's labels: each font they're painted in, loaded, its digits' ink measured by the canvas. */
async function worldDigits(): Promise<Found> {
  await paint.liningLoaded?.();
  const problems: string[] = [];
  let fonts = 0;
  for (const face of FACES) {
    for (const weight of PAINTED_WEIGHTS) {
      const font = paint.fontOf({ face, weight, size: SIZE, color: '#fff' });
      await document.fonts.load(font, DIGITS);
      fonts++;
      const level = levelOf(paintedInks(font), SIZE);
      if (!jumping(level)) continue;
      problems.push(`digits jump up and down in the world's labels, ${font} (${levelText(level)})`);
    }
  }
  return { lines: [`  digits: ${fonts} fonts of the world's labels`], problems, moments: [] };
}

/**
 * The canary's plants: the page's text given old-style digits, and the world's labels' fonts with lining ones taken
 * away (the canvas then paints the face's own); both must be found jumping.
 */
function plantOldStyle(): void {
  document.body.style.fontVariantNumeric = 'oldstyle-nums';
  for (const face of [...document.fonts]) {
    if (face.featureSettings.includes('lnum')) document.fonts.delete(face);
  }
}

/** The digits shown in this state, on the page and over the world, each look and font of them on its line. */
export async function digitsShown(lab: Lab, canary: boolean): Promise<Found> {
  if (canary) plantOldStyle();
  const page = await pageDigits(lab);
  const world = await worldDigits();
  if (canary) document.body.style.fontVariantNumeric = '';
  const lines = [...page.lines, ...world.lines];
  return { lines, problems: [...page.problems, ...world.problems], moments: page.moments };
}
