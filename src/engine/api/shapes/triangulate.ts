// A flat outline's points cut into triangles (three's `ShapeUtils`): its winding read from its signed area, and
// the outline with its holes handed to earcut.
import type { Vec2 } from '../math/index.ts';
import { earcut } from './earcut.ts';

/** The signed area of the ring `contour`: above 0 counter-clockwise. */
export function area(contour: readonly Vec2[]): number {
  const n = contour.length;
  let sum = 0;
  for (let p = n - 1, q = 0; q < n; p = q++) sum += contour[p].x * contour[q].y - contour[q].x * contour[p].y;
  return sum * 0.5;
}

/** Whether the ring `points` winds clockwise. */
export function isClockWise(points: readonly Vec2[]): boolean {
  return area(points) < 0;
}

/** Takes off a ring's last point where it repeats its first (of three or more). */
function dropRepeatedEnd(points: Vec2[]): void {
  const l = points.length;
  if (l > 2 && points[l - 1].equals(points[0])) points.pop();
}

/**
 * The triangles of `contour` with `holes` cut out of it, each three indices into the contour's points then each
 * hole's in turn. As three's `ShapeUtils.triangulateShape` (three.js, MIT, 0.187.0), a ring's last point is taken
 * off where it repeats its first, in the arrays given; the cutting is earcut's (`earcut.ts`).
 */
export function triangulate(contour: Vec2[], holes: Vec2[][]): number[][] {
  const data: number[] = [];
  const holeIndices: number[] = [];
  dropRepeatedEnd(contour);
  for (const point of contour) data.push(point.x, point.y);
  let start = contour.length;
  holes.forEach(dropRepeatedEnd);
  for (const hole of holes) {
    holeIndices.push(start);
    start += hole.length;
    for (const point of hole) data.push(point.x, point.y);
  }
  const triangles = earcut(data, holeIndices);
  const faces: number[][] = [];
  for (let i = 0; i < triangles.length; i += 3) faces.push(triangles.slice(i, i + 3));
  return faces;
}
