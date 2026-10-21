// tools/lab neck's read: what the lines up a hero's neck (page/neckSlices.ts) say against the limits a neck is held to,
// the worst of each with where it is, and a hero's report and problems from them.
import { fellThrough, type Fall } from './neckGaps';
import { freeNecks, ridgeOf, seamsOf, shelfOf, type Line } from './neckMeasure';
import { ANGLES, type Slices } from './neckSlices';

/** the most the skin may turn up over a ridge's rows (degrees), and face up above the neck's narrowest (a shelf) */
export const RIDGE_MOST = 20;
export const SHELF_MOST = 30;
/** the most the head's skin may stand out from the neck's where it takes over (mm), and their paints differ (dE) */
export const STEP_MOST = 1;
export const SEAM_DE_MOST = 3;
/** a man's neck's girth at its narrowest as a share of his head's (ANSUR II, 4,082 men: 397.6 mm to 574.4), and how
 *  far off it may be (about a standard deviation of the share) */
export const NECK_SHARE = 0.69;
export const NECK_SHARE_SLACK = 0.05;
/** the most of the rays round the collar that may meet skin come out through the clothes: none (the gambeson's
 *  collar, centred on his chest, had the back of the warrior's column neck come out through it; the mage's robe a
 *  notch of it on 2 rays, a 1% allowance let pass) */
export const THROUGH_MOST = 0;
/** the most lines where a ray dropped down between the neck and the clothes may fall through: none (the ranger's
 *  collar, let out for his neck to turn in, showed the ground through it round his neck from above) */
export const HOLES_MOST = 0;
/** The side of the neck an angle round it is on (degrees from his front, + to his left). */
export function sideOf(angle: number): string {
  const sides = ['front', 'front left', 'left', 'back left', 'back', 'back right', 'right', 'front right'];
  return sides[Math.round(angle / 45) % sides.length];
}

/** What the lines up the neck read, worst first: the highest ridge, the most up-facing shelf, the largest step and
 *  colour difference at a seam, each with the line and height it's on, and the share of lines past each limit. */
export interface NeckRead {
  ridge: { turn: number; angle: number; y: number; share: number };
  shelf: { tilt: number; angle: number; y: number; share: number };
  step: { mm: number; angle: number; y: number } | null;
  dE: { value: number; angle: number; y: number; lightness: { face: number; neck: number } } | null;
  /** the lines that show skin, of all of them */
  seen: number;
}

/** The worst of the lines' ridges, shelves and seams. */
export function readLines(lines: Line[]): NeckRead {
  const read: NeckRead = {
    ridge: { turn: 0, angle: 0, y: 0, share: 0 },
    shelf: { tilt: 0, angle: 0, y: 0, share: 0 },
    step: null,
    dE: null,
    seen: 0,
  };
  let ridged = 0;
  let shelved = 0;
  for (const line of lines) {
    const runs = freeNecks(line.samples);
    if (!runs.length) continue;
    read.seen++;
    const at = (row: number) => line.samples[row].y;
    const ridges = runs.map((run) => ridgeOf(line.samples, run));
    const ridge = ridges.reduce((worst, next) => (next.turn > worst.turn ? next : worst));
    if (ridge.turn > RIDGE_MOST) ridged++;
    if (ridge.turn > read.ridge.turn) read.ridge = { turn: ridge.turn, angle: line.angle, y: at(ridge.at), share: 0 };
    const shelves = runs.map((run) => shelfOf(line.samples, run));
    const shelf = shelves.reduce((worst, next) => (next.tilt > worst.tilt ? next : worst));
    if (shelf.tilt > SHELF_MOST) shelved++;
    if (shelf.tilt > read.shelf.tilt) read.shelf = { tilt: shelf.tilt, angle: line.angle, y: at(shelf.at), share: 0 };
    for (const seam of runs.flatMap((run) => seamsOf(line.samples, run))) {
      if (!read.step || seam.step > read.step.mm) read.step = { mm: seam.step, angle: line.angle, y: at(seam.at) };
      if (seam.dE !== null && seam.lightness && (!read.dE || seam.dE > read.dE.value)) {
        read.dE = { value: seam.dE, angle: line.angle, y: at(seam.at), lightness: seam.lightness };
      }
    }
  }
  read.ridge.share = read.seen ? ridged / read.seen : 0;
  read.shelf.share = read.seen ? shelved / read.seen : 0;
  return read;
}

/** The neck's narrowest girth from its joint up to the head's as a share of the head's, and its height (face mm above
 *  the head's joint): the body's own, whatever he wears (the girth is the skin's, under the clothes too). */
export function narrowestOf(slices: Slices): { share: number; y: number } | null {
  const free = slices.girths.filter((row) => row.y >= slices.base && row.y <= 0);
  if (!free.length || !slices.head) return null;
  const narrowest = free.reduce((least, row) => (row.girth < least.girth ? row : least));
  return { share: narrowest.girth / slices.head, y: narrowest.y };
}

export const degrees = (value: number) => `${Math.round(value)}°`;
export const mm = (value: number) => `${value >= 0 ? '+' : ''}${Math.round(value)} mm`;
export const percent = (share: number) => `${Math.round(share * 100)}%`;
const where = (found: { angle: number; y: number }) => `${sideOf(found.angle)} at ${mm(found.y)}`;

/** A read's lines for the report, and its problems (`what` names the hero, his dress and his pose). */
export function verdicts(what: string, slices: Slices): { lines: string[]; problems: string[] } {
  const read = readLines(slices.lines);
  const narrowest = narrowestOf(slices);
  const lines: string[] = [];
  const problems: string[] = [];
  const say = (text: string, bad: boolean) => {
    lines.push(`  ${text}`);
    if (bad) problems.push(`${what}: ${text}`);
  };
  lines.push(`${what}: skin seen up ${read.seen} of ${ANGLES} lines round the neck`);
  if (narrowest) {
    const off = Math.abs(narrowest.share - NECK_SHARE) > NECK_SHARE_SLACK;
    say(`girth at its narrowest ${narrowest.share.toFixed(2)} of the head's (a man's ${NECK_SHARE}) at `
      + `${mm(narrowest.y)}`, off);
  }
  const { ridge, shelf, step, dE } = read;
  say(`ridge round it ${degrees(ridge.turn)} (${where(ridge)}; past ${RIDGE_MOST}° on ${percent(ridge.share)} of `
    + 'the lines)', ridge.turn > RIDGE_MOST);
  say(`skin facing up ${degrees(shelf.tilt)} (${where(shelf)}; past ${SHELF_MOST}° on ${percent(shelf.share)})`,
    shelf.tilt > SHELF_MOST);
  if (step) {
    say(`where the head's skin takes over: a step of ${step.mm.toFixed(1)} mm (${where(step)})`, step.mm > STEP_MOST);
  }
  if (dE) {
    const { face, neck } = dE.lightness;
    say(`its paint against the neck's: dE ${dE.value.toFixed(1)} (${where(dE)}; lightness ${Math.round(face)} `
      + `against ${Math.round(neck)})`, dE.value > SEAM_DE_MOST);
  }
  if (!step) lines.push('  the head\'s skin and the neck\'s meet nowhere in view');
  say(`skin through the clothes on ${percent(slices.through)} of the rays round the collar${whereThrough(slices)}`,
    slices.through > THROUGH_MOST);
  const holes = slices.falls.filter(fellThrough);
  say(`seen through round the neck from above on ${holes.length} of the ${slices.falls.length} lines where it stands `
    + `loose in the clothes${whereHoles(holes)}`, holes.length > HOLES_MOST);
  return { lines, problems };
}

/** Where `slices` read skin come out through the clothes: the heights, the arcs of angles and how far out it came,
 *  or nothing where none did. */
function whereThrough(slices: Slices): string {
  if (!slices.throughAt.length) return '';
  const heights = slices.throughAt.map((row) => row.y);
  const angles = [...new Set(slices.throughAt.flatMap((row) => row.angles))].sort((a, b) => a - b);
  const deepest = Math.max(...slices.throughAt.map((row) => row.deepest));
  return ` (at ${mm(Math.min(...heights))} to ${mm(Math.max(...heights))}, ${arcsOf(angles)}; `
    + `out of them by up to ${deepest.toFixed(1)} mm)`;
}

/** Sorted angles (degrees, a ray's step apart where they run on) as arcs: "30-60°, 300°". */
export function arcsOf(angles: number[]): string {
  const step = 360 / ANGLES;
  const arcs: [number, number][] = [];
  for (const angle of angles) {
    const last = arcs[arcs.length - 1];
    if (last && angle - last[1] <= step + 1e-6) last[1] = angle;
    else arcs.push([angle, angle]);
  }
  const whole = (angle: number) => `${Math.round(angle)}`;
  const arc = ([from, to]: [number, number]) => (from === to ? `${whole(from)}°` : `${whole(from)}-${whole(to)}°`);
  return arcs.map(arc).join(', ');
}

/** Where a ray dropped down round the neck fell through: the arcs of angles and how wide the gap was, or nothing. */
function whereHoles(holes: Fall[]): string {
  if (!holes.length) return '';
  const widest = Math.max(...holes.map((hole) => hole.width));
  return ` (${arcsOf(holes.map((hole) => hole.angle))}; the gap up to ${widest.toFixed(1)} mm wide)`;
}
