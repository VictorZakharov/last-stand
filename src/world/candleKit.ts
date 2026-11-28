// A candle as the chronicle's lectern by the hall of heroes' door burns one (`buildLectern`, `candleFlame` in
// village.ts), and the houses' rooms do too (`candle` in rooms.ts): a taper melted hollow at its top, wax run down it
// in runs that end in beads, pooled round its foot in a dish, a wick bent over, and a flame of a see-through orange
// tongue round a pale core. Its shapes alone: each caller gives the materials.
import * as THREE from 'three';

/** A flame's outline turned round its axis, `r` its widest and `h` its height: round at its foot, drawn in to a tip
 *  (`lean` puts its tip off its axis along x, as a draught bends it). */
export function flameGeometry(r: number, h: number, lean: number, rows = 12, sides = 10): THREE.BufferGeometry {
  const outline: THREE.Vector2[] = [];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows;
    // (a round foot to its widest a fifth up, then in to the tip by a curve)
    const wide = t < 0.2 ? Math.sin((t / 0.2) * Math.PI / 2) : Math.pow(1 - (t - 0.2) / 0.8, 1.6);
    outline.push(new THREE.Vector2(Math.max(r * wide, 0.0005), h * t));
  }
  const g = new THREE.LatheGeometry(outline, sides);
  const at = g.attributes.position;
  for (let i = 0; i < at.count; i++) at.setX(i, at.getX(i) + lean * (at.getY(i) / h) ** 2);
  g.computeVertexNormals();
  return g;
}

/** a candle's flame: its tongue's widest, height and lean, and its core's, standing `coreOver` over the tongue's foot
 *  (m); the flame's foot is `over` over the wax's rim */
export const CANDLE_FLAME = {
  tongue: { r: 0.015, h: 0.07, lean: 0.004 },
  core: { r: 0.008, h: 0.038, lean: 0.002 },
  coreOver: 0.006,
  over: 0.002,
};

/** the runs of wax down a taper: round it (rad), how far under its rim each starts, and how long it is (m) */
const RUNS = [[0.6, 0.004, 0.05], [1.9, 0.004, 0.085], [3.1, 0.006, 0.03], [4.3, 0.004, 0.066], [5.4, 0.006, 0.1]] as const;

/** how finely a taper is made: the lectern's, seen close by a hero reading, or a room's, one of a dozen or more (a
 *  lectern's taper is some 1000 triangles, a room's 330) */
const DETAIL = {
  lectern: { sides: 16, runs: 5, runSides: 6, runCaps: 3, beadSides: 6, beadRings: 5 },
  // (a room's chandeliers hold most of its candles, a few pixels each: at the lectern's three runs of 6 sides the
  // house of records drew 12 thousand triangles more than main, `lab village --only sweepWithinBudgets`)
  room: { sides: 8, runs: 2, runSides: 5, runCaps: 1, beadSides: 4, beadRings: 2 },
} as const;

/** A taper's wax in `group` (its foot at the group's origin, `high` m to its rim): its body melted hollow at the top,
 *  runs down it each ending in a bead, and (`pooled`) the wax pooled round its foot in a dish. */
export function taperWax(group: THREE.Object3D, wax: THREE.Material, high: number, pooled: boolean,
  detail: keyof typeof DETAIL = 'lectern'): void {
  const made = DETAIL[detail];
  const outline: [number, number][] = [
    ...(pooled ? [[0.048, 0.001], [0.03, 0.006], [0.022, 0.016]] as [number, number][] : [[0.001, 0], [0.021, 0]] as [number, number][]),
    [0.02, Math.min(0.05, high - 0.03)], [0.0195, high - 0.018], [0.021, high - 0.006], [0.017, high], [0.012, high - 0.005],
    [0.001, high - 0.008],
  ];
  group.add(new THREE.Mesh(new THREE.LatheGeometry(outline.map(([r, y]) => new THREE.Vector2(r, y)), made.sides), wax));
  for (const [a, under, length] of RUNS.slice(0, made.runs)) {
    const top = high - under, long = Math.min(length, high * 0.85);
    const run = new THREE.Mesh(new THREE.CapsuleGeometry(0.0028, long, made.runCaps, made.runSides), wax);
    run.position.set(Math.cos(a) * 0.0205, top - long / 2, Math.sin(a) * 0.0205);
    group.add(run);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0048, made.beadSides, made.beadRings), wax);
    bead.position.set(Math.cos(a) * 0.0215, top - long, Math.sin(a) * 0.0215);
    group.add(bead);
  }
}

/** A taper's wick in `group`, standing out of its melted top at `high` and bent a little over. */
export function taperWick(group: THREE.Object3D, material: THREE.Material, high: number): THREE.Mesh {
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.016, 4), material);
  wick.position.set(0.001, high, 0);
  wick.rotation.z = -0.28;
  group.add(wick);
  return wick;
}

/** A candle's dish, as the lectern's is: a round tray with a lip, its foot at the origin. */
export function candleDish(): THREE.BufferGeometry {
  return new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.066, 0.016], [0.06, 0.018], [0.046, 0.006], [0.001, 0.006]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 28);
}
