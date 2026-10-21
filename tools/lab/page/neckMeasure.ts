// tools/lab neck's measures, of the skin as the rays round the neck met it (page/neckSlices.ts): up each line of them
// from the clothes to the head, the shelves and ridges round it (the column neck's flat top stood out of the head's
// skin under the ears, a ledge the light picked out as a line across the neck), the steps and colour where the head's
// own skin takes over from the neck's (the warrior's head skin stood proud of his neck behind, a pale disc), and the
// neck's girth against a man's. Pure, so its unit tests run without a page.

/** what a ray met first: the face's skin (the head's, down its column), the neck's, an ear, hair, or anything else
 *  (clothes, armour, what he carries) */
export type Kind = 'face' | 'neck' | 'ear' | 'hair' | 'cloth';

/** A colour in linear light, 0-1 a channel. */
export type Rgb = [number, number, number];

/** What a ray met at one height of a line: the face's mm above the head's joint (the chin's underside), how far out
 *  from the neck's axis (mm), which way the shading faces (degrees above level: + up), what it is, and its paint. */
export interface Sample {
  y: number;
  r: number;
  tilt: number;
  kind: Kind | null;
  colour: Rgb | null;
}

/** One line up the neck: its angle round it (degrees from his front, + to his left) and a sample a row. */
export interface Line {
  angle: number;
  samples: Sample[];
}

/** the most a line's skin may go out between two rows and still be one surface (mm): past it the jaw, an ear or the
 *  beard stands over the neck */
export const OVERHANG = 6;
/** the rows a ridge is read over (each row 2 mm: page/neckSlices.ts `ROW_MM`) */
export const RIDGE_ROWS = 2;

const isSkin = (sample: Sample) => sample.kind === 'face' || sample.kind === 'neck';
const isCloth = (sample: Sample) => sample.kind === 'cloth' || sample.kind === null;

/** The free neck up a line: each run of rows from skin coming out of the clothes (or from the line's foot) up to where
 *  it stops being one surface of skin (hair over it, an ear, the jaw standing out), first and last. Skin above hair
 *  isn't the neck: over a beard it's the lips. (Under a collar standing off the coat's shoulders, a ray at the neck's
 *  foot meets it in the slot between them, and the neck above the collar is another run.) */
export function freeNecks(samples: Sample[]): [number, number][] {
  const runs: [number, number][] = [];
  for (let first = 0; first < samples.length; first++) {
    if (!isSkin(samples[first]) || (first > 0 && !isCloth(samples[first - 1]))) continue;
    let last = first;
    while (last + 1 < samples.length) {
      const next = samples[last + 1];
      if (!isSkin(next) || Math.abs(next.r - samples[last].r) > OVERHANG) break;
      last++;
    }
    runs.push([first, last]);
    first = last;
  }
  return runs;
}

/** The most the shading turns up going up a line's free neck over `RIDGE_ROWS` rows (degrees): a ridge round the
 *  neck, its outer edge turned to the light (a neck's own forms run up it, the muscles from behind the ears to the
 *  breastbone; across it a man's neck turns down into his jaw and skull, never up), and the row it starts at. */
export function ridgeOf(samples: Sample[], run: [number, number]): { turn: number; at: number } {
  let worst = { turn: 0, at: run[0] };
  for (let row = run[0]; row + RIDGE_ROWS <= run[1]; row++) {
    const turn = samples[row + RIDGE_ROWS].tilt - samples[row].tilt;
    if (turn > worst.turn) worst = { turn, at: row };
  }
  return worst;
}

/** The most up-facing skin on a line's free neck (degrees above level), and its row: a shelf. A man's neck faces up
 *  only at its foot, where it flares out over the trapezius into his shoulders, under the heroes' clothes in every
 *  dress; above them it rises straight or leans in a little and turns down into the jaw and the skull. */
export function shelfOf(samples: Sample[], run: [number, number]): { tilt: number; at: number } {
  let worst = { tilt: 0, at: run[0] };
  for (let row = run[0]; row <= run[1]; row++) {
    if (samples[row].tilt > worst.tilt) worst = { tilt: samples[row].tilt, at: row };
  }
  return worst;
}

/** The middle value of `values` (the lower of two middles), or 0 with none. */
function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** A seam up a line: its row (the lower side's), the step out between its sides over the line's usual change a row
 *  (mm), the difference of their paints (CIE76) and each one's lightness (CIELAB's L: the face's, the neck's). */
export interface Seam {
  at: number;
  step: number;
  dE: number | null;
  lightness: { face: number; neck: number } | null;
}

/** Where a line's free neck passes from one skin to the other (the face's and the neck's). */
export function seamsOf(samples: Sample[], run: [number, number]): Seam[] {
  const usual = [];
  for (let row = run[0]; row < run[1]; row++) {
    const [below, above] = [samples[row], samples[row + 1]];
    if (below.kind === above.kind) usual.push(Math.abs(above.r - below.r));
  }
  const change = medianOf(usual);
  const seams: Seam[] = [];
  for (let row = run[0]; row < run[1]; row++) {
    const [below, above] = [samples[row], samples[row + 1]];
    if (below.kind === above.kind) continue;
    const step = Math.max(0, Math.abs(above.r - below.r) - change);
    const [face, neck] = below.kind === 'face' ? [below.colour, above.colour] : [above.colour, below.colour];
    const painted = face && neck;
    seams.push({
      at: row,
      step,
      dE: painted ? deltaE(face, neck) : null,
      lightness: painted ? { face: labOf(face)[0], neck: labOf(neck)[0] } : null,
    });
  }
  return seams;
}

/** The length round a ring of points (mm, x and z each). */
export function girthOf(points: [number, number][]): number {
  let length = 0;
  for (let point = 0; point < points.length; point++) {
    const [x0, z0] = points[point];
    const [x1, z1] = points[(point + 1) % points.length];
    length += Math.hypot(x1 - x0, z1 - z0);
  }
  return length;
}

/** `rgb` (linear light) in CIELAB, D65. */
export function labOf([r, g, b]: Rgb): Rgb {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** The difference between two colours (CIE76: about 2.3 is the least an eye tells apart). */
export function deltaE(a: Rgb, b: Rgb): number {
  const [l0, a0, b0] = labOf(a);
  const [l1, a1, b1] = labOf(b);
  return Math.hypot(l1 - l0, a1 - a0, b1 - b0);
}
