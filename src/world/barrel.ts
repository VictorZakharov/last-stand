// A barrel of the houses' rooms (the tavern's, Odo's shop's; from play, "lets include barrel uplift too.. they are
// dull as well"): it was one smooth lathe under four thin rings. Now it is staves, each its own board a hair apart
// with the dark of the barrel between them, its tone one of a pale honey oak's (`woodTint.ts`), its
// edge a little proud or sunk; flat iron hoops following its bulge, two at each chime and one at each bilge; heads of
// boards set in from its rims, the rims' end grain round them; a lying keg a bung in its belly and a brass tap in its
// head. Each barrel's look is its own by where it stands, the room's stream untouched. Its size is the old one's (0.62
// m across at its belly, 0.8 tall), so the obstacles and what stands on a barrel stay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../util';
import type { Mats } from './rooms';
import { woodTint } from './woodTint';

/** the staves' woods: pale honey oak, a little of it a shade deeper, against the floor's and the walls' browns, under
 *  black hoops (in the rooms' oak, the barrels sank into the room, from play), and the heads a shade darker */
const STAVE_TONES = [0xd8a466, 0xd8a466, 0xd8a466, 0xc89058];
const HEAD_TONE = 0xb88450;

/** the barrel's half height, and its radius from its rim to its belly, by height (m) */
const HALF = 0.4;
const OUTLINE: readonly [number, number][] = [[0.24, -0.4], [0.272, -0.27], [0.295, -0.13], [0.31, 0], [0.295, 0.13],
  [0.272, 0.27], [0.24, 0.4]];
/** its staves, and the share of each one's turn its board fills (the rest the dark between) */
const STAVES = 18;
const BOARD = 0.965;
/** how far its heads are set in from its rims (m) */
const CHIME = 0.018;
/** its hoops: where up it each one sits, and how wide it is (m) */
const HOOPS = [-0.355, -0.27, -0.13, 0.13, 0.27, 0.355];
const HOOP_WIDE = 0.028;

/** the barrel's radius at height `y` (its outline's, between its points) */
function radiusAt(y: number): number {
  for (let k = 1; k < OUTLINE.length; k++) {
    const [r0, y0] = OUTLINE[k - 1], [r1, y1] = OUTLINE[k];
    if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return OUTLINE[OUTLINE.length - 1][0];
}

/** a seed of where a barrel stands, so each looks its own and the same every boot */
function seedAt(x: number, y: number, z: number): number {
  return Math.floor(Math.abs(x * 7919 + y * 104729 + z * 1299709)) + 17;
}

/** The staves, grouped by the wood each is: pale honey oak, some a shade deeper or paler. */
function staves(M: Mats, rng: () => number): Map<THREE.Material, THREE.BufferGeometry[]> {
  const woods = STAVE_TONES.map((tone) => woodTint(M.oak, tone));
  const byWood = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const each = (Math.PI * 2) / STAVES;
  for (let k = 0; k < STAVES; k++) {
    // (each board a little proud or sunk, as staves are bent and set by hand)
    const out = 1 + (rng() - 0.5) * 0.02;
    const points = OUTLINE.map(([r, y]) => new THREE.Vector2(r * out, y));
    const stave = new THREE.LatheGeometry(points, 2, k * each, each * BOARD);
    // (its slice of the wood's map round the barrel, as the one lathe it was had it: each stave the whole map across its
    // 6 cm, the grain blurred to a flat dark)
    const uv = stave.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i) * BOARD) / STAVES);
    const wood = woods[Math.floor(rng() * woods.length)];
    if (!byWood.has(wood)) byWood.set(wood, []);
    byWood.get(wood)!.push(stave);
  }
  return byWood;
}

/** the dark between the staves: the barrel's outline a little in, a lathe of its own */
function between(): THREE.BufferGeometry {
  return new THREE.LatheGeometry(OUTLINE.map(([r, y]) => new THREE.Vector2(r - 0.006, y)), STAVES);
}

/** a hoop at `y`: a flat iron band over the staves, as wide as `HOOP_WIDE`, following the bulge */
function hoop(y: number): THREE.BufferGeometry {
  const below = radiusAt(y - HOOP_WIDE / 2) + 0.006, above = radiusAt(y + HOOP_WIDE / 2) + 0.006;
  return new THREE.CylinderGeometry(above, below, HOOP_WIDE, STAVES, 1, true).translate(0, y, 0);
}

/** a head at the end `end` (1 up, -1 down): a disc set in from the rim, the joints of its boards across it */
function head(end: number): { boards: THREE.BufferGeometry; joints: THREE.BufferGeometry[] } {
  const y = end * (HALF - CHIME), r = radiusAt(y) - 0.004;
  const boards = new THREE.CircleGeometry(r, 18).rotateX(-end * Math.PI / 2).translate(0, y, 0);
  const joints = [-0.08, 0.08].map((across) => {
    const long = 2 * Math.sqrt(r * r - across * across);
    return new THREE.BoxGeometry(0.005, 0.002, long).translate(across, y + end * 0.001, 0);
  });
  return { boards, joints };
}

/** the rims' end grain: a ring round each end, the staves' thickness seen from above */
function rims(): THREE.BufferGeometry[] {
  return [-1, 1].map((end) => {
    const r = radiusAt(end * HALF) - 0.009;
    return new THREE.TorusGeometry(r, 0.011, 3, STAVES).rotateX(Math.PI / 2).translate(0, end * (HALF - 0.004), 0);
  });
}

/** a lying keg's fittings: a bung in its belly (at -z: up, as it's laid by a quarter turn about x) and a brass tap low
 *  in its head (`y` up, toward +z: down as it lies) */
function fittings(): { bung: THREE.BufferGeometry; tap: THREE.BufferGeometry[] } {
  const belly = radiusAt(0);
  const bung = new THREE.CylinderGeometry(0.022, 0.026, 0.02, 10).rotateX(Math.PI / 2).translate(0, 0, -belly);
  const headY = HALF - CHIME, spout = new THREE.CylinderGeometry(0.014, 0.016, 0.1, 10).translate(0, headY + 0.05, 0.1);
  const mouth = new THREE.CylinderGeometry(0.011, 0.014, 0.05, 8).rotateX(Math.PI / 2).translate(0, headY + 0.095, 0.12);
  const key = new THREE.BoxGeometry(0.06, 0.012, 0.012).translate(0, headY + 0.07, 0.1);
  return { bung, tap: [spout, mouth, key] };
}

/** One mesh of `parts` merged, casting and taking shadows, added to `into`. */
function addMerged(into: THREE.Object3D, parts: THREE.BufferGeometry[], material: THREE.Material): void {
  // (each part's own attributes: merged, a lathe's and a box's must match)
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  for (const part of plain) for (const name of Object.keys(part.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') part.deleteAttribute(name);
  }
  const mesh = new THREE.Mesh(mergeGeometries(plain), material);
  mesh.castShadow = mesh.receiveShadow = true;
  into.add(mesh);
}

/** A barrel on its side or standing at (x, y, z): staves of the rooms' woods, iron hoops, heads of boards; a lying
 *  one a bung and a tap. */
export function barrel(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, lying = false, turn = 0): void {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.set(lying ? Math.PI / 2 : 0, turn, 0);
  if (lying) b.position.y += 0.3;
  g.add(b);
  const rng = mulberry(seedAt(x, y, z));
  // (each barrel turned on its own about its axis, so its staves' tones and its heads' joints aren't all alike)
  const own = new THREE.Group();
  own.rotation.y = rng() * Math.PI * 2;
  b.add(own);
  for (const [wood, parts] of staves(M, rng)) addMerged(own, parts, wood);
  addMerged(own, [between()], M.dark);
  addMerged(own, HOOPS.map(hoop), M.iron);
  const ends = [head(-1), head(1)];
  addMerged(own, [...ends.map((end) => end.boards), ...rims()], woodTint(M.oak, HEAD_TONE));
  addMerged(own, ends.flatMap((end) => end.joints), M.dark);
  if (lying) {
    // (its fittings not turned with its staves: the bung up, the tap out of its head)
    const { bung, tap } = fittings();
    addMerged(b, [bung], M.oak);
    addMerged(b, tap, M.brass);
  }
  if (!lying) b.position.y += HALF;
}
