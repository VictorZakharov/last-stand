// tools/lab corners: each distinct corner of a mesh's surface once. A mesh repeats a corner for each face whose
// normals or texture part there (the mage's staff: 12,234 points, 2,515 places), and a measure reading the deepest
// point of a weapon every frame (page/weaponFloor.ts, page/weaponBody.ts) read each place about five times over.

/** The points of a geometry's positions, as a `THREE.BufferAttribute` gives them. */
export interface Positions {
  count: number;
  /** none on an interleaved attribute, whose corners are found once */
  version?: number;
  getX(index: number): number;
  getY(index: number): number;
  getZ(index: number): number;
}

/** each positions' distinct corners, while it stays at the version they were found at */
const found = new WeakMap<Positions, { version?: number; firsts: number[] }>();

/** The index of the first point at each distinct place among `positions`, in their order: a measure keeping the first
 *  of equal readings reads the same over these as over every point. Found once a geometry (until it changes). */
export function distinctCorners(positions: Positions): number[] {
  const kept = found.get(positions);
  if (kept && kept.version === positions.version) return kept.firsts;
  const places = new Set<string>();
  const firsts: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const place = `${positions.getX(i)},${positions.getY(i)},${positions.getZ(i)}`;
    if (places.has(place)) continue;
    places.add(place);
    firsts.push(i);
  }
  found.set(positions, { version: positions.version, firsts });
  return firsts;
}
