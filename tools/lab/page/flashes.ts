// The flashes in a run of frames (tools/lab `cast`), as WCAG 2 counts a general flash: a pair of opposing changes
// of at least a tenth of white in an area's relative luminance, the darker of the two under 0.8 of white. Counted
// for each cell of the frame's grid (page/screenCells.ts: a sixteenth of the frame each), and judged by the most in
// any one second: three or more is a hazard (AGENTS.md: nothing large flashes faster than about 1.5 times a second).

/** the change in an area's light (a share of white) that counts as one of a flash's two */
const CHANGE = 0.1;
/** a change counts only where its darker end is under this */
const DARK_UNDER = 0.8;

/** The most flashes a cell had in any one second, and when that second started (s, from the first frame). */
export interface FlashCount {
  cell: number;
  most: number;
  at: number;
}

/** The frames (each a share of white) at which an area's light changed by `CHANGE` against the way it last went. */
function changesOf(lights: number[]): number[] {
  const changes: number[] = [];
  // (the darkest and brightest it was since the last change: a rise is from the one, a fall from the other)
  let low = lights[0];
  let high = lights[0];
  let rising: boolean | null = null;
  for (let frame = 1; frame < lights.length; frame++) {
    const light = lights[frame];
    low = Math.min(low, light);
    high = Math.max(high, light);
    const rose = light - low >= CHANGE && low < DARK_UNDER;
    const fell = high - light >= CHANGE && light < DARK_UNDER;
    const risen: boolean = rose && rising !== true;
    const fallen: boolean = fell && rising !== false;
    if (!risen && !fallen) continue;
    changes.push(frame);
    rising = risen;
    low = light;
    high = light;
  }
  return changes;
}

/** The most flashes (pairs of changes) within any `perSecond` frames of `changes`, and the frame they started at. */
function mostInASecond(changes: number[], perSecond: number): { most: number; from: number } {
  let most = 0;
  let from = 0;
  let first = 0;
  for (let last = 0; last < changes.length; last++) {
    while (changes[last] - changes[first] >= perSecond) first++;
    const flashes = Math.floor((last - first + 1) / 2);
    if (flashes > most) {
      most = flashes;
      from = changes[first];
    }
  }
  return { most, from };
}

/**
 * The cell with the most flashes in any one second, of `cellLights` (a frame's cells' lights, frame by frame), the
 * frames `frameTime` s apart.
 */
export function worstFlashing(cellLights: number[][], frameTime: number): FlashCount {
  const perSecond = Math.round(1 / frameTime);
  const cells = cellLights[0]?.length ?? 0;
  let worst: FlashCount = { cell: 0, most: 0, at: 0 };
  for (let cell = 0; cell < cells; cell++) {
    const lights = cellLights.map((frame) => frame[cell]);
    const { most, from } = mostInASecond(changesOf(lights), perSecond);
    if (most > worst.most) worst = { cell, most, at: from * frameTime };
  }
  return worst;
}
