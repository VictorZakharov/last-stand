// The screen as the hero's Health runs low (tools/lab `health`): standing in a biome and a view, his Health held at
// shares of his most from whole down to nothing, and at each the frame drawn twice at the same moment, once as the
// player sees it and once with the low-health look taken off (core/lowLife.ts), so what it does is all that differs:
// how much of the frame's colour it drains (its saturation against the frame without it), how much of the screen the
// blood covers and how far in from the edge it reaches (at the heart's beat, where it reaches furthest), and how much
// of it lies in the middle of the view, which must stay clear. Above the share it starts at the two frames must be the
// same pixel for pixel; below it the colour drains and the blood spreads further the lower the Health.
import type { Lab, Pictured, Report } from './lab';
import { drawFrame, scenarioName, standIn, type Canvas, type LightScenario } from './light';
import { setLowLife } from '../../../src/core/renderer';
import { LOW_FROM, lowLifeShown, lowOf } from '../../../src/core/lowLife';

export interface HealthOptions {
  scenario: LightScenario;
  /** the shares of his most Health he is held at, in turn */
  shares: number[];
  /** the frames at the shares under `LOW_FROM` pictured as the player sees them */
  pictures: boolean;
  /** plant faults the measures must catch: the look drawn above the share it starts at, and its blood driven into
   *  the middle of the view */
  canary: boolean;
}

/** the frames stood at a share before it's measured: the look eases after the Health (5 a second: 0.05% left) */
const SETTLE_FRAMES = 90;
/** how far the look may be off its settled amount for the Health once stood */
const SETTLED_OFF = 0.005;
/** a pixel is blood where its red is this many times its green and blue, and this bright at least (encoded): the
 *  blood's darkest is about 0.13 over the frame, and a dark purple greyed a little came out red at 1.6 and 0.05 */
const BLOOD_RED = 2;
const BLOOD_FLOOR = 0.1;
/** how far apart a pixel may be between two draws of the same frame and still count as unchanged (encoded): a few
 *  pixels of the scene come out a 255th apart from one draw to the next, the look off */
const NOISE = 1.5 / 255;
/** a pixel this dark (encoded, its brightest channel) has no colour to judge */
const DARK = 0.03;
/** the middle of the view that must stay clear: this share of the screen each way round its middle */
const MIDDLE = 1 / 3;
/** how much less a lower Health's drain or cover may come out than a higher one's (pixels' rounding) */
const SLACK = 0.002;
/** at nothing left, the least share of the colour drained and of the screen covered in blood */
const DRAINED_LEAST = 0.6;
const COVER_LEAST = 0.08;
/** with --canary: the share the look is drawn at above where it starts, and the planted amount that drives its
 *  blood into the middle of the view */
const CANARY_SHARE = 0.75;
const CANARY_FLOOD = 4;

/** What the look did to one frame, against the same moment without it. */
interface LowLook {
  share: number;
  /** the look's amount as the game eased it, and what it settles at for the share */
  low: number;
  settled: number;
  /** the pixels that differ between two draws of the moment without the look (left out of every count), and those
   *  more than a 255th apart with it, as shares of the frame */
  unsteady: number;
  changed: number;
  /** how many pixels changed, and the first: where and its colour with the look and without */
  changedPixels: number;
  firstChange: string;
  /** the share of the frame's colour taken out (its mean saturation against the frame without it) */
  drained: number;
  /** the share of the screen in blood, of its middle, and how far in from the nearest edge it reaches (screen heights:
   *  the 95th percentile of its pixels, and the furthest) */
  cover: number;
  middle: number;
  reach: number;
  furthest: number;
  /** where the furthest is (shares of the screen across and down) and its colour with the look and without */
  furthestAt: string;
}

/** A pixel's saturation (its channels' spread against its brightest), or null for one too dark to judge. */
function saturation(pixels: Float32Array, at: number): number | null {
  const red = pixels[at];
  const green = pixels[at + 1];
  const blue = pixels[at + 2];
  const top = Math.max(red, green, blue);
  if (top < DARK) return null;
  return (top - Math.min(red, green, blue)) / top;
}

/** Whether the pixel at `at` is blood red. */
function bloodRed(pixels: Float32Array, at: number): boolean {
  const red = pixels[at];
  return red >= BLOOD_FLOOR && red > BLOOD_RED * Math.max(pixels[at + 1], pixels[at + 2]);
}

/** The pixel at column `x`, row `y` (the canvas's rows from its bottom) is in the middle of the view. */
function inMiddle(canvas: Canvas, x: number, y: number): boolean {
  const low = (1 - MIDDLE) / 2;
  const high = 1 - low;
  const across = x / canvas.width;
  const up = y / canvas.height;
  return across >= low && across <= high && up >= low && up <= high;
}

/** How far the pixel at column `x`, row `y` is from the screen's nearest edge, in screen heights. */
function fromEdge(canvas: Canvas, x: number, y: number): number {
  const across = Math.min(x, canvas.width - 1 - x);
  const up = Math.min(y, canvas.height - 1 - y);
  return Math.min(across, up) / canvas.height;
}

/** The value `share` of the way up sorted `values` (0 for none). */
function percentile(values: number[], share: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** Where the pixel at column `x`, row `y` is on the screen: shares across and down. */
const placeOf = (canvas: Canvas, x: number, y: number): string =>
  `at ${(x / canvas.width).toFixed(2)}, ${(1 - y / canvas.height).toFixed(2)}`;

/** The pixel at `at` as encoded, a channel in 255ths each. */
const colourAt = (canvas: Canvas, at: number): string =>
  `rgb ${[0, 1, 2].map((channel) => Math.round(canvas.pixels[at + channel] * 255)).join(' ')}`;

/** Whether the pixel at `at` differs between two frames by more than `slack` in a channel (encoded). */
function differs(one: Canvas, other: Canvas, at: number, slack = 0): boolean {
  const a = one.pixels;
  const b = other.pixels;
  return Math.abs(a[at] - b[at]) > slack || Math.abs(a[at + 1] - b[at + 1]) > slack
    || Math.abs(a[at + 2] - b[at + 2]) > slack;
}

/** The frames of one moment: with the look, and twice without it (what differs between those two is unsteady). */
interface Moment {
  seen: Canvas;
  bare: Canvas;
  again: Canvas;
}

/** Sums over a moment's steady pixels, as `lookOf` counts them. */
class Tally {
  steady = 0;
  changed = 0;
  firstChange = '';
  saturated = 0;
  saturatedBare = 0;
  blood = 0;
  middle = 0;
  middleArea = 0;
  furthest = 0;
  furthestAt = '';
  readonly reaches: number[] = [];

  /** The pixel at column `x`, row `y` counted. */
  add(moment: Moment, x: number, y: number): void {
    const { seen, bare, again } = moment;
    const at = (y * seen.width + x) * 4;
    if (differs(bare, again, at)) return;
    this.steady++;
    if (differs(seen, bare, at, NOISE)) {
      this.changed++;
      if (!this.firstChange) this.firstChange = `${placeOf(seen, x, y)} ${colourAt(seen, at)} for ${colourAt(bare, at)}`;
    }
    const middle = inMiddle(seen, x, y);
    if (middle) this.middleArea++;
    if (bloodRed(seen.pixels, at) && !bloodRed(bare.pixels, at)) {
      this.blood++;
      if (middle) this.middle++;
      const reach = fromEdge(seen, x, y);
      this.reaches.push(reach);
      if (reach > this.furthest) {
        this.furthest = reach;
        this.furthestAt = `${placeOf(seen, x, y)} ${colourAt(seen, at)} for ${colourAt(bare, at)}`;
      }
      return;
    }
    // (the colour drained judged where no blood lies: the blood is colour of its own)
    const colour = saturation(seen.pixels, at);
    const colourBare = saturation(bare.pixels, at);
    if (colour === null || colourBare === null) return;
    this.saturated += colour;
    this.saturatedBare += colourBare;
  }
}

/** What the look did at a moment, against the same moment drawn without it. */
function lookOf(share: number, low: number, moment: Moment): LowLook {
  const { seen } = moment;
  const tally = new Tally();
  for (let y = 0; y < seen.height; y++) {
    for (let x = 0; x < seen.width; x++) tally.add(moment, x, y);
  }
  const area = seen.width * seen.height;
  return {
    share,
    low,
    settled: lowOf(share),
    unsteady: 1 - tally.steady / area,
    changed: tally.changed / area,
    changedPixels: tally.changed,
    firstChange: tally.firstChange,
    drained: tally.saturatedBare > 0 ? 1 - tally.saturated / tally.saturatedBare : 0,
    cover: tally.blood / area,
    middle: tally.middle / Math.max(1, tally.middleArea),
    reach: percentile(tally.reaches, 0.95),
    furthest: tally.furthest,
    furthestAt: tally.furthestAt,
  };
}

/**
 * The frame at this moment drawn twice without the look, then with it at `low` (and the heart's beat at its height).
 * The two without it come one after the other and the one with it two draws after the first: a few pixels in the
 * forest through the eyes come out a 255th apart every other draw, so with the look's frame between the two without
 * it, they agreed and it alone differed.
 */
function drawMoment(lab: Lab, low: number): Moment {
  setLowLife(0, 0);
  const bare = drawFrame(lab);
  const again = drawFrame(lab);
  setLowLife(low, low);
  const seen = drawFrame(lab);
  setLowLife(0, 0);
  return { seen, bare, again };
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** A share's look as a line. */
function lookLine(look: LowLook): string {
  return `  Health ${percent(look.share)}: look ${look.low.toFixed(3)} (settles at ${look.settled.toFixed(3)}), `
    + `unsteady ${percent(look.unsteady)}, changed ${percent(look.changed)}, colour drained ${percent(look.drained)}, blood ${percent(look.cover)} `
    + `of the screen, ${percent(look.middle)} of its middle, reaching ${look.reach.toFixed(3)} in `
    + `(furthest ${look.furthest.toFixed(3)}${look.furthestAt ? ` ${look.furthestAt}` : ''})`;
}

/** What's wrong with one share's look, by itself. */
function lookProblems(name: string, look: LowLook): string[] {
  const problems: string[] = [];
  const at = `${name} at ${percent(look.share)}`;
  if (Math.abs(look.low - look.settled) > SETTLED_OFF) {
    problems.push(`${at}: the look is at ${look.low.toFixed(3)}, not ${look.settled.toFixed(3)}, once stood`);
  }
  if (look.share >= LOW_FROM && look.changed > 0) {
    problems.push(`${at}: the frame changed above where the look starts (${look.changedPixels} pixels, the first ${look.firstChange})`);
  }
  if (look.middle > 0) problems.push(`${at}: blood in the middle of the view (${percent(look.middle)} of it)`);
  if (look.share === 0 && look.drained < DRAINED_LEAST) {
    problems.push(`${at}: only ${percent(look.drained)} of the colour drained with nothing left`);
  }
  if (look.share === 0 && look.cover < COVER_LEAST) {
    problems.push(`${at}: blood on only ${percent(look.cover)} of the screen with nothing left`);
  }
  return problems;
}

/** What's wrong across the shares: a lower Health whose look drains less or covers less than a higher one's. */
function orderProblems(name: string, looks: LowLook[]): string[] {
  const problems: string[] = [];
  const byShare = [...looks].sort((a, b) => b.share - a.share);
  for (let index = 1; index < byShare.length; index++) {
    const higher = byShare[index - 1];
    const lower = byShare[index];
    const between = `${percent(lower.share)} against ${percent(higher.share)}`;
    if (lower.drained < higher.drained - SLACK) problems.push(`${name}: less colour drained at ${between}`);
    if (lower.cover < higher.cover - SLACK) problems.push(`${name}: less blood at ${between}`);
  }
  return problems;
}

/**
 * The canaries: the look drawn at `CANARY_SHARE` of its amount at a Health above where it starts, which the check
 * above must find changed; and drawn at `CANARY_FLOOD`, its blood in the middle of the view, which the middle's check
 * must find.
 */
async function canaries(lab: Lab, name: string, lines: string[], problems: string[]): Promise<void> {
  lab.lifeShare = 1;
  await lab.step(SETTLE_FRAMES);
  const early = lookOf(1, 0, drawMoment(lab, CANARY_SHARE));
  const caughtEarly = lookProblems(name, early).length > 0;
  lines.push(`  canary, the look at ${CANARY_SHARE} with Health whole: changed ${percent(early.changed)}`
    + `${caughtEarly ? ': caught' : ''}`);
  if (!caughtEarly) problems.push(`${name}: the canary's look above where it starts went unseen`);
  const flooded = lookOf(0, CANARY_FLOOD, drawMoment(lab, CANARY_FLOOD));
  const caughtFlood = flooded.middle > 0;
  lines.push(`  canary, the look at ${CANARY_FLOOD}: ${percent(flooded.middle)} of the middle in blood`
    + `${caughtFlood ? ': caught' : ''}`);
  if (!caughtFlood) problems.push(`${name}: the canary's blood in the middle of the view went unseen`);
}

/**
 * `lab health`, one scenario: the hero standing in its biome and view, his Health held at each share in turn, the
 * look's frames against the same moments without it; with a canary, faults planted that the checks must catch.
 */
export async function health(lab: Lab, options: HealthOptions): Promise<Report> {
  const name = scenarioName(options.scenario);
  await standIn(lab, options.scenario);
  const lines = [name];
  const looks: LowLook[] = [];
  const moments: Pictured[] = [];
  for (const share of options.shares) {
    lab.lifeShare = share;
    await lab.step(SETTLE_FRAMES);
    const { low } = lowLifeShown();
    const look = lookOf(share, low, drawMoment(lab, low));
    looks.push(look);
    lines.push(lookLine(look));
    if (options.pictures && share < LOW_FROM) {
      setLowLife(low, low);
      moments.push(await lab.screen(`${name}, Health ${percent(share)}`, [lookLine(look).trim()]));
    }
  }
  const problems = [...looks.flatMap((look) => lookProblems(name, look)), ...orderProblems(name, looks)];
  if (options.canary) await canaries(lab, name, lines, problems);
  return { text: lines.join('\n'), problems, moments };
}
