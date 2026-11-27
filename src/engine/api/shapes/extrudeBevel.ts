// The way a point of an extruded outline moves as its bevel grows (`extrude.ts`): along the bisector of its two
// edges, as far as keeps both edges a unit out, shrunk where that runs long. Follows three 0.187's
// `ExtrudeGeometry`'s `getBevelVec` (three.js, MIT) to the number.
import { Vec2 } from '../math/index.ts';

/** Whether the turn at a point with edges along x `prevX` before it and `nextX` after it goes on the same way. */
function sameWay(prevX: number, nextX: number): boolean {
  if (prevX > Number.EPSILON) return nextX > Number.EPSILON;
  if (prevX < -Number.EPSILON) return nextX < -Number.EPSILON;
  return false;
}

/** The bevel way of `point`, between `before` and `after` on its ring. */
export function bevelVector(point: Vec2, before: Vec2, after: Vec2): Vec2 {
  const prevX = point.x - before.x;
  const prevY = point.y - before.y;
  const nextX = after.x - point.x;
  const nextY = after.y - point.y;
  const prevLengthSq = prevX * prevX + prevY * prevY;
  const collinear = prevX * nextY - prevY * nextX;
  if (Math.abs(collinear) > Number.EPSILON) {
    const prevLength = Math.sqrt(prevLengthSq);
    const nextLength = Math.sqrt(nextX * nextX + nextY * nextY);
    const prevShiftX = before.x - prevY / prevLength;
    const prevShiftY = before.y + prevX / prevLength;
    const nextShiftX = after.x - nextY / nextLength;
    const nextShiftY = after.y + nextX / nextLength;
    const sf = ((nextShiftX - prevShiftX) * nextY - (nextShiftY - prevShiftY) * nextX) / (prevX * nextY - prevY * nextX);
    const transX = prevShiftX + prevX * sf - point.x;
    const transY = prevShiftY + prevY * sf - point.y;
    const transLengthSq = transX * transX + transY * transY;
    if (transLengthSq <= 2) return new Vec2(transX, transY);
    const shrink = Math.sqrt(transLengthSq / 2);
    return new Vec2(transX / shrink, transY / shrink);
  }
  const straightOn = Math.abs(prevX) <= Number.EPSILON
    ? Math.sign(prevY) === Math.sign(nextY)
    : sameWay(prevX, nextX);
  if (straightOn) {
    const shrink = Math.sqrt(prevLengthSq);
    return new Vec2(-prevY / shrink, prevX / shrink);
  }
  const shrink = Math.sqrt(prevLengthSq / 2);
  return new Vec2(prevX / shrink, prevY / shrink);
}
