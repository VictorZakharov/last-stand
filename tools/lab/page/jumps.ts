// A weapon's jumps between frames (tools/lab `eyes`): a frame it moved in many times as far as in the frames round it,
// as a pose that leaps from one place to another in a frame does. (#249: through the eyes, Steel Tempest's blade
// jumped 53 cm in a frame as the spin ended, and over a metre in one each turn of it, the arm's elbow flipping over as
// its shoulder came round under the camera.) Measured against the median of the moves round it, not its neighbours: a
// blade out and back again in a frame moves far into the frame after it too; and against the slower of the frames
// either side of it, as a short, fast blow's middle frame moves far past the median of a round mostly still, but no
// further than the frames into it and out of it. Pure, for its tests (test/jumps.test.mjs).

/** the frames each side of one whose moves it's measured against */
export const JUMP_ROUND = 3;
/** a jump moves at least this many times as far as the median of the moves round it */
export const JUMP_TIMES = 3;
/** and this many times as far as the slower of the frames either side of it (a dual wielder's cut, fast for three
 *  frames, 22, 35 and 23 cm, read as a jump against the round's median of 11) */
export const JUMP_SIDE = 2;

/** A frame the weapon jumped in: its index, how far it moved into it, and the median move round it. */
export interface Jump {
  index: number;
  moved: number;
  round: number;
}

/** The middle of `values`, or the mean of the middle two. */
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** How far the weapon moved into a frame (m), or null where it isn't measured (the tip on another weapon than the frame
 *  before's: a blade in each hand strikes with each in turn). */
type Move = number | null;

/** The moves measured within `JUMP_ROUND` frames of `index` each side, but its own (fewer at the ends). */
function movesRound(moves: readonly Move[], index: number): number[] {
  const from = Math.max(0, index - JUMP_ROUND);
  const to = Math.min(moves.length - 1, index + JUMP_ROUND);
  const round: number[] = [];
  for (let i = from; i <= to; i++) {
    const move = moves[i];
    if (i !== index && move !== null) round.push(move);
  }
  return round;
}

/** The slower of the moves into the frames either side of `index` (the one there is at an end, or where the other
 *  isn't measured); null when neither is. */
function slowerSide(moves: readonly Move[], index: number): number | null {
  const measured = (move: Move | undefined): move is number => move !== null && move !== undefined;
  const sides = [moves[index - 1], moves[index + 1]].filter(measured);
  return sides.length ? Math.min(...sides) : null;
}

/** The frames of `moves` (how far the weapon moved into each frame) that jumped: moved at least `least`, `JUMP_TIMES`
 *  the median of the moves round it and `JUMP_SIDE` the slower of the frames either side of it. */
export function jumpsIn(moves: readonly Move[], least: number): Jump[] {
  const jumps: Jump[] = [];
  moves.forEach((moved, index) => {
    if (moved === null || moved < least) return;
    const round = median(movesRound(moves, index));
    const side = slowerSide(moves, index);
    const pastSides = side === null || moved >= JUMP_SIDE * side;
    if (moved >= JUMP_TIMES * round && pastSides) jumps.push({ index, moved, round });
  });
  return jumps;
}

/** A place (m; a `THREE.Vector3`). */
interface Place {
  x: number;
  y: number;
  z: number;
}

/** How far apart `a` and `b` are. */
const distance = (a: Place, b: Place): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A frame of a weapon as the eyes saw it, as far as its jumps go: its number, its tip's place in the camera's space,
 *  the weapon the tip is on, and whether that weapon was in or near the frame. */
export interface JumpFrame {
  frame: number;
  tip: Place;
  weapon: string;
  near: boolean;
}

/** A jump at a frame of the eyes'. */
export interface FrameJump extends Jump {
  frame: number;
}

/** How far the tip moved into each of `frames`, the first from `rest`: null where it's on another weapon than the
 *  frame before's. */
function movesOf(frames: readonly JumpFrame[], rest: JumpFrame): Move[] {
  return frames.map((now, i) => {
    const before = i ? frames[i - 1] : rest;
    return now.weapon === before.weapon ? distance(now.tip, before.tip) : null;
  });
}

/** The jumps through `frames` (from `rest`) of at least `least`: those seen, the weapon in or near the frame before or
 *  after it, and those out of it. */
export function jumpsOf(
  frames: readonly JumpFrame[], rest: JumpFrame, least: number,
): { seen: FrameJump[]; unseen: FrameJump[] } {
  const seen: FrameJump[] = [];
  const unseen: FrameJump[] = [];
  for (const jump of jumpsIn(movesOf(frames, rest), least)) {
    const before = jump.index ? frames[jump.index - 1] : rest;
    const now = frames[jump.index];
    const each = { ...jump, frame: now.frame };
    if (now.near || before.near) seen.push(each);
    else unseen.push(each);
  }
  return { seen, unseen };
}

/** The index of the frame in `frames` (from `rest`) whose moves round it are the least, the weapon in or near the
 *  frame and a full `JUMP_ROUND` each side of it: where a jump planted shows clearest. -1 if there's none. */
export function stillestFrame(frames: readonly JumpFrame[], rest: JumpFrame): number {
  const moves = movesOf(frames, rest);
  let stillest = -1;
  let least = Infinity;
  for (let i = JUMP_ROUND; i < frames.length - JUMP_ROUND; i++) {
    if (!frames[i].near) continue;
    const round = median(movesRound(moves, i));
    if (round < least) {
      least = round;
      stillest = i;
    }
  }
  return stillest;
}
