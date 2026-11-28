// tools/lab neck's gaps: where the neck stands loose in its collar, a line of sight dropped into the gap between them
// from the collar's top, as steep as the game's cameras look down on the hero (`STEEPEST`), once in towards the neck
// and once out towards the collar, as a camera on either side of him would look in. The eye sees there the first face
// the line meets from its front (or one drawn from both sides; a card where its texture is drawn); a line that meets
// none ran down inside the clothes to nothing, and the ground shows through round his neck, where the gap's mouth is in
// view at all from where the line looks from. (Straight down, every collar a few mm loose read as a hole, though no
// view the game takes showed one; looking out over the neck, a single-sided neckline seen from inside read as one,
// though the head and neck stand in front of it.)
import { Box2, Maths, Ray, Triangle, Vec2, Vec3 } from './sceneApi.ts';
import { CAMERA } from '../../../src/data/balance';
import type { NeckFace, Part } from './neckSlices';

/** the steepest the game's cameras look down (rad above the horizon: the top-down view's at its default zoom, the
 *  third person view's highest) */
export const STEEPEST = Math.max(CAMERA.pitch, CAMERA.third.maxPitch);

/** Where a line round the neck stands loose in its collar: its angle (degrees), the height its lines of sight fall
 *  from and how far out from the axis (m, the neck's frame), and the gap's width there (mm). */
export interface Gap {
  angle: number;
  from: number;
  r: number;
  width: number;
}

/** What a line of sight into a gap showed: a face it met, the ground through the gap, or none of the gap (its mouth
 *  hidden from where it looks from). */
export type Sight = 'closed' | 'through' | 'hidden';

/** A gap and what its lines of sight showed. */
export interface Fall extends Gap {
  inward: Sight;
  outward: Sight;
}

/** Whether a line of sight looking `along` sees `triangle` where it meets it at `place`: from its front, or a face
 *  drawn from both sides, and drawn there. */
function seenAlong(triangle: NeckFace, parts: Part[], along: Vec3, place: Vec3): boolean {
  const part = parts[triangle.part];
  if (triangle.facing.dot(along) >= 0 && !part.bothSides) return false;
  const [a, b, c] = triangle.places;
  const [ua, ub, uc] = triangle.uvs;
  const uv = Triangle.getInterpolation(place, a, b, c, ua, ub, uc, new Vec2());
  return !uv || part.drawnAt(uv.x, uv.y);
}

/** Whether a line of sight looking `along` sees a face on the ray from `origin` `heading` (`along` or against it),
 *  up or down to height `limit` (m, the neck's frame). */
function seesOn(
  origin: Vec3, heading: Vec3, along: Vec3, limit: number, surfaces: Surfaces,
): boolean {
  const reach = (limit - origin.y) / heading.y;
  const end = origin.clone().addScaledVector(heading, reach);
  const ends = [new Vec2(origin.x, origin.z), new Vec2(end.x, end.z)];
  const box = new Box2().setFromPoints(ends);
  const [low, high] = [Math.min(origin.y, limit), Math.max(origin.y, limit)];
  const ray = new Ray(origin, heading);
  for (const triangle of surfaces.triangles) {
    if (triangle.low > high || triangle.high < low || !triangle.plan.intersectsBox(box)) continue;
    const [a, b, c] = triangle.places;
    const place = ray.intersectTriangle(a, b, c, false, new Vec3());
    if (place && place.y >= low && place.y <= high && seenAlong(triangle, surfaces.parts, along, place)) return true;
  }
  return false;
}

/** The hero's triangles round his neck and their parts, and the heights the lines of sight are followed down to and
 *  their mouths seen from up to (m, the neck's frame). */
export interface Surfaces {
  triangles: NeckFace[];
  parts: Part[];
  floor: number;
  ceiling: number;
}

/** What a line of sight looking `along` into a gap at `mouth` shows. */
function sightOf(mouth: Vec3, along: Vec3, surfaces: Surfaces): Sight {
  if (seesOn(mouth, along, along, surfaces.floor, surfaces)) return 'closed';
  return seesOn(mouth, along.clone().negate(), along, surfaces.ceiling, surfaces) ? 'hidden' : 'through';
}

/** What the lines of sight dropped into `gap` show. */
export function fallOf(gap: Gap, surfaces: Surfaces): Fall {
  const angle = Maths.degToRad(gap.angle);
  const [out, down] = [Math.cos(STEEPEST), Math.sin(STEEPEST)];
  const mouth = new Vec3(Math.sin(angle) * gap.r, gap.from, Math.cos(angle) * gap.r);
  const towards = (way: number) => new Vec3(Math.sin(angle) * out * way, -down, Math.cos(angle) * out * way);
  return { ...gap, inward: sightOf(mouth, towards(-1), surfaces), outward: sightOf(mouth, towards(1), surfaces) };
}

/** Whether either of `fall`'s lines of sight showed the ground through the gap. */
export const fellThrough = (fall: Fall) => fall.inward === 'through' || fall.outward === 'through';
