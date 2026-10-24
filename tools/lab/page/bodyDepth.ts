// How deep a point lies in a part of the body (tools/lab `range`'s weapon through the body, `weaponBody.ts`): in a
// capsule (a thigh, a shin) or an ellipsoid (the belly, the chest). Plain numbers, so it's tested without a page.

/** a point, or a capsule's end */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** How far inside the capsule from `a` to `b` of radius `radius` the point `p` is: its radius less the point's
 *  distance from the line between its ends (none outside, 0 or less). */
export function capsuleDepth(p: Point, a: Point, b: Point, radius: number): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const length2 = abx * abx + aby * aby + abz * abz;
  const onto = (p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz;
  const along = length2 > 0 ? Math.min(1, Math.max(0, onto / length2)) : 0;
  const dx = p.x - (a.x + abx * along);
  const dy = p.y - (a.y + aby * along);
  const dz = p.z - (a.z + abz * along);
  return radius - Math.hypot(dx, dy, dz);
}

/** How far inside an ellipsoid of half-axes `half` the point `p` (in the ellipsoid's own frame, from its centre) is,
 *  along the line from its centre: its surface's distance out that way less the point's (0 or less outside). */
export function ellipsoidDepth(p: Point, half: Point): number {
  const out = Math.hypot(p.x / half.x, p.y / half.y, p.z / half.z);
  const distance = Math.hypot(p.x, p.y, p.z);
  if (out < 1e-9) return Math.min(half.x, half.y, half.z);
  return distance / out - distance;
}
