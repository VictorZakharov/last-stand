// tools/lab an arm held at its stops (`range`): the joints of one arm at the ends of their ranges on the same frame.
// The arm IK (models/armIK.ts) stops the forearm's turn and the wrist at their ends, and keeps the shoulder within its
// raise for its plane, so a pose asking more of an arm than it can give is held there, every joint "within its range",
// and `breaches` never says so. Two-handed Power Strike's end read so: the upper arm raised 78° and swung 145° across
// the chest, the forearm turned 89.9° of its 90, the wrist bent 30° of its 30, and the arm looked "straight up broken"
// to the owner. An arm at one stop is a reach or a twist a body makes; at two or more it is pinned.
// (the body's limits are handed in, `ArmLimits`, so the unit tests load it without the game's modules)

/** every angle of the body, by name (anatomy.ts `BodyAngles`) */
export type BodyAngles = Record<string, number>;

/** A body's limits for an arm, as anatomy.ts has them (`armLimits` in range.ts hands its own in). */
export interface ArmLimits {
  /** the forearm's and the wrist's ranges (degrees), by `forearm.pronation`, `wrist.flexion` and `wrist.radial` */
  ranges: Ranges;
  /** how high the upper arm can rise in the plane it rises in (degrees) */
  elevationLimit: (plane: number) => number;
  /** the upper arm's turn about itself at a raise (degrees) */
  rotationRange: (elevation: number) => readonly [number, number];
}

/** a joint this near an end of its range (degrees) is at its stop */
export const AT_STOP = 2;
/** an arm with this many joints at their stops on a frame is pinned */
export const PINNED_AT = 2;
/** over this the shoulder's plane means nothing (straight up), as `shoulderExcess` has it */
const OVERHEAD = 165;

/** A joint at its stop: which end (`joint` and the end, as the tally counts it) and its value, as words. */
export interface Stop {
  /** the joint and the end it is at (`wristR.radial at -30°`) */
  end: string;
  /** the joint, its value and its range, as words */
  words: string;
}

/** One arm's joints at their stops on a frame. */
export interface Strain {
  side: 'L' | 'R';
  stops: Stop[];
}

/** The ranges a range's name is judged against: a wrist gripping a handle by `gripping`'s, else the body's. */
export type Ranges = Readonly<Record<string, readonly [number, number]>>;

/** Each arm pinned at `PINNED_AT` or more stops in `angles` (`measureBody`'s), its wrist judged by `gripping` (the
 *  ranges of a gripping wrist, by `wrist.flexion`...) where its hand holds a handle. */
export function pinnedArms(
  angles: BodyAngles, limits: ArmLimits, gripping: Partial<Record<'L' | 'R', Ranges>> = {},
): Strain[] {
  const found: Strain[] = [];
  for (const side of ['L', 'R'] as const) {
    const stops = armStops(angles, side, limits, gripping[side] ?? {});
    if (stops.length >= PINNED_AT) found.push({ side, stops });
  }
  return found;
}

/** The joints of one arm at their stops. */
function armStops(angles: BodyAngles, side: 'L' | 'R', limits: ArmLimits, held: Ranges): Stop[] {
  const stops: Stop[] = [];
  const elevation = angles[`shoulder${side}.elevation`];
  const plane = angles[`shoulder${side}.plane`];
  const raise = limits.elevationLimit(plane);
  if (elevation < OVERHEAD && raise - elevation <= AT_STOP) {
    const most = `at most ${deg(raise)} in its plane ${deg(plane)}`;
    stops.push({ end: `shoulder${side} raised its most`, words: `shoulder${side} raised ${deg(elevation)} (${most})` });
  }
  const turn = stopOf(`shoulder${side}.rotation`, angles[`shoulder${side}.rotation`], limits.rotationRange(elevation));
  if (turn) stops.push(turn);
  for (const range of ['forearm.pronation', 'wrist.flexion', 'wrist.radial'] as const) {
    const name = range.replace('.', `${side}.`);
    const stop = stopOf(name, angles[name], held[range] ?? limits.ranges[range]);
    if (stop) stops.push(stop);
  }
  return stops;
}

/** `name` at `value` as a stop, if it is within `AT_STOP` of (or past) either end of `range`. */
function stopOf(name: string, value: number, [min, max]: readonly [number, number]): Stop | null {
  const atMin = value - min <= AT_STOP;
  if (!atMin && max - value > AT_STOP) return null;
  const range = `${min.toFixed(0)}..${max.toFixed(0)}`;
  return { end: `${name} at ${deg(atMin ? min : max)}`, words: `${name} ${deg(value)} (${range})` };
}

const deg = (value: number) => `${value.toFixed(0)}°`;

/** The frames an arm was pinned through a scenario, the first of the worst (the most stops), and each stop's count. */
export class ArmsPinned {
  private frames = 0;
  private worst: { stops: number; at: string; strain: Strain } | null = null;
  private readonly ends = new Map<string, number>();
  /** each frame one was, as words */
  readonly listed: string[] = [];

  /** the scenario's name, as its listed frames say it */
  private readonly scenario: string;
  /** the body's limits the arms are judged by */
  private readonly limits: ArmLimits;

  /** `scenario`: the scenario's name, as its listed frames say it; `limits`: the body's */
  constructor(scenario: string, limits: ArmLimits) {
    this.scenario = scenario;
    this.limits = limits;
  }

  /** Notes the arms pinned this frame (`frame`: the frame as the report names it). Returns the arm pinned at more stops
   *  than any before it, if one is (the scenario's worst so far, to picture). */
  observe(angles: BodyAngles, gripping: Partial<Record<'L' | 'R', Ranges>>, frame: string): Strain | null {
    const pinned = pinnedArms(angles, this.limits, gripping);
    if (!pinned.length) return null;
    let worse: Strain | null = null;
    this.frames++;
    this.listed.push(`  ${this.scenario} frame ${frame}: ${pinned.map(describeStrain).join('; ')}`);
    for (const strain of pinned) {
      for (const stop of strain.stops) this.ends.set(stop.end, (this.ends.get(stop.end) ?? 0) + 1);
      if (this.worst && strain.stops.length <= this.worst.stops) continue;
      this.worst = { stops: strain.stops.length, at: frame, strain };
      worse = strain;
    }
    return worse;
  }

  /** The frames pinned as words, or none if no arm ever was. */
  describe(): string {
    if (!this.worst) return '';
    return `an arm held at its stops on ${this.frames} frames, the most at frame ${this.worst.at}: `
      + describeStrain(this.worst.strain);
  }

  /** The stops the pinned arms were at, the most frequent first, with the frames each was. */
  tally(): string {
    const ends = [...this.ends].sort((a, b) => b[1] - a[1]);
    return ends.map(([end, frames]) => `${end} ${frames}`).join(', ');
  }
}

/** An arm's stops, as words. */
export function describeStrain(strain: Strain): string {
  const arm = strain.side === 'R' ? 'right' : 'left';
  return `the ${arm} arm at ${strain.stops.length} stops, ${strain.stops.map((stop) => stop.words).join(', ')}`;
}

/** The canary: `angles` with the right forearm turned to its end and the wrist bent to its, as Power Strike's end
 *  held them. Returns whether that arm reads pinned. */
export function pinnedCanary(angles: BodyAngles, limits: ArmLimits): boolean {
  const turned = limits.ranges['forearm.pronation'][1];
  const bent = limits.ranges['wrist.radial'][0];
  const planted = { ...angles, 'forearmR.pronation': turned, 'wristR.radial': bent };
  return pinnedArms(planted, limits).some((strain) => strain.side === 'R');
}
