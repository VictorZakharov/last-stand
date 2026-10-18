// tools/lab swing's path: a swing through the eyes stepped through in small shares as the game lays it out
// (src/entities/viewSwing.ts `swingAt`), the elbow's move each step against the grip's. An elbow laid out as an arm
// moves goes about as far as the grip, or less, being nearer the shoulder; turned over round the line to the grip, it
// goes far in a step the grip hardly moves in. (Power Strike's and Thunder Crescent's planes turned from the guard's
// through upright, and the elbow's drop went over to the plane's other side between two frames: 18 and 25 cm through
// the eyes, each key as placed alone looking right.) Pure but for the placing it's given, so the canary can plant a
// flip in the steps.
import * as THREE from 'three';

/** One step of a swing laid out: its share, and the point its plane turns about, the grip and the elbow there (camera
 *  space, m), and how far a two-hander's lower grip is past the other arm's reach (m: under 0 within it; null for a
 *  one-hander). */
export interface PathStep {
  share: number;
  pivot: THREE.Vector3;
  grip: THREE.Vector3;
  elbow: THREE.Vector3;
  lowerPast: number | null;
}

/** the steps a swing is laid out in, from its start to its end */
export const PATH_STEPS = 100;
/** an elbow moving at least this far in a step (m) and this many times as far as the grip has turned over */
const PATH_JUMP = 0.03;
const PATH_TIMES = 3;

/** A step the elbow jumped in: its share, and how far the elbow and the grip moved into it (m). */
export interface PathJump { share: number; elbow: number; grip: number }

/** The shares a swing is stepped through. */
export const pathShares = (): number[] => Array.from({ length: PATH_STEPS + 1 }, (_, i) => i / PATH_STEPS);

/** Each step's move into it, the elbow's and the grip's, from the step before. */
function movesOf(steps: readonly PathStep[]): PathJump[] {
  return steps.slice(1).map((step, i) => ({
    share: step.share,
    elbow: step.elbow.distanceTo(steps[i].elbow),
    grip: step.grip.distanceTo(steps[i].grip),
  }));
}

/** The steps the elbow jumped in: at least `PATH_JUMP`, and `PATH_TIMES` the grip's move. */
export function pathJumps(steps: readonly PathStep[]): PathJump[] {
  return movesOf(steps).filter((move) => move.elbow >= PATH_JUMP && move.elbow >= PATH_TIMES * move.grip);
}

/** The path as lines, its most an elbow moved in a step against the grip and a two-hander's lower grip against the
 *  other arm's reach, and each jump and each run of steps the lower grip is past `letGo` beyond it (m: where the game
 *  lets go of it) as a problem. (Its keys alone placed, the backhand's way back to the guard had its lower grip within
 *  reach at both ends, and carried it 11 cm past between them.) */
export function describePath(
  name: string, steps: readonly PathStep[], letGo: number,
): { lines: string[]; problems: string[] } {
  const moves = movesOf(steps);
  const most = moves.reduce((was, move) => (move.elbow > was.elbow ? move : was), moves[0]);
  const jumps = pathJumps(steps);
  const head = `${name}'s elbow through it in steps of ${100 / PATH_STEPS}%`;
  const lines = [`${head}: the most in a step ${moveWords(most)}; turned over (at least ${PATH_JUMP * 100} cm, `
    + `${PATH_TIMES} times the grip's): ${jumps.length ? jumps.map(moveWords).join('; ') : 'none'}`];
  const problems = jumps.length ? [`${name}'s elbow turns over between steps: ${jumps.map(moveWords).join('; ')}`] : [];
  const lower = lowerWords(steps, letGo);
  if (lower) {
    lines.push(`${name}'s lower grip through it: ${lower.line}`);
    if (lower.past) problems.push(`${name}'s lower grip past the other arm's reach: ${lower.past}`);
  }
  return { lines, problems };
}

/** A two-hander's lower grip through the steps as words: its furthest past the other arm's reach (or nearest within
 *  it), and the runs of steps it's past `letGo` beyond it (null when there are none); null for a one-hander. */
function lowerWords(steps: readonly PathStep[], letGo: number): { line: string; past: string | null } | null {
  const measured = steps.filter((step) => step.lowerPast !== null);
  if (!measured.length) return null;
  const pastOf = (step: PathStep) => step.lowerPast ?? 0;
  const worst = measured.reduce((was, step) => (pastOf(step) > pastOf(was) ? step : was), measured[0]);
  const runs: PathStep[][] = [];
  for (const step of measured) {
    if (pastOf(step) <= letGo) continue;
    const run = runs.at(-1);
    const follows = run && Math.abs(run[run.length - 1].share + 1 / PATH_STEPS - step.share) < 0.5 / PATH_STEPS;
    if (run && follows) run.push(step);
    else runs.push([step]);
  }
  const runWords = runs.map((run) => {
    const most = Math.max(...run.map(pastOf));
    return `${run[0].share.toFixed(2)}-${run[run.length - 1].share.toFixed(2)} up to ${centimetres(most)}`;
  });
  const furthest = pastOf(worst) > 0 ? `${centimetres(pastOf(worst))} past` : `${centimetres(-pastOf(worst))} within`;
  const line = `at its furthest ${furthest} the other arm's reach, at ${worst.share.toFixed(2)}; let go of past `
    + `${centimetres(letGo)}: ${runWords.length ? runWords.join(', ') : 'nowhere'}`;
  return { line, past: runWords.length ? runWords.join(', ') : null };
}

/** A length as words, in cm. */
const centimetres = (m: number) => `${(m * 100).toFixed(1)} cm`;

/** A step's moves as words. */
function moveWords(move: PathJump): string {
  return `${(move.elbow * 100).toFixed(1)} cm at ${move.share.toFixed(2)} (the grip ${(move.grip * 100).toFixed(1)})`;
}

/** The steps with one elbow turned half round the line from its pivot to its grip, as the canary plants a flip:
 *  the middle half's furthest from that line (on it, an elbow turned round it stays put), which must read as a jump
 *  there. */
export function plantedFlip(steps: readonly PathStep[]): { steps: PathStep[]; share: number } {
  const planted = steps.map((step) => ({ ...step, elbow: step.elbow.clone() }));
  const middle = planted.slice(Math.floor(steps.length / 4), Math.ceil((3 * steps.length) / 4));
  const step = middle.reduce((was, next) => (offLine(next) > offLine(was) ? next : was), middle[0]);
  const axis = step.grip.clone().sub(step.pivot).normalize();
  step.elbow.sub(step.pivot).applyAxisAngle(axis, Math.PI).add(step.pivot);
  return { steps: planted, share: step.share };
}

/** How far a step's elbow is from the line from its pivot to its grip (m). */
function offLine({ pivot, grip, elbow }: PathStep): number {
  const axis = grip.clone().sub(pivot).normalize();
  const out = elbow.clone().sub(pivot);
  return out.addScaledVector(axis, -out.dot(axis)).length();
}
