// A stool of the houses' rooms (the tavern's, the bar's, the records', the library's), built as a joiner builds one
// (from play, "we need to update all chairs too, they are not well engineered (from topology/physics perspective)",
// "how chairs currently are, they will break on first day of service"): three pins of 2 cm splayed under a disc, held
// by nothing, it is now four legs, thicker where they're socketed into a thick seat and splayed out to a wide stance,
// their tenons wedged through its top; four stretchers joining the legs, two pairs at two heights so no two meet in a
// leg at one point (as a turner bores them); a bar stool's foot ring too. Its seat honey oak and its legs a ruddy
// stain, apart from the floor's and the walls' browns (from play, "adjust chair material too, so they stand out from
// floor/walls"). Its seat stands where it did, so what a hero sits on stays (`stoolSeat` reads its top).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Furniture, Mats } from './rooms';
import { woodTint } from './woodTint';

/** A stool's top's radius (m). */
export const STOOL_R = 0.17;
/** the seat's thickness (m), and its chamfer underneath */
const SEAT = 0.05;
const CHAMFER = 0.016;
/** where the legs go into the seat (m from its middle), how far they splay (rad), and their radii at top and foot */
const LEG_IN = 0.1;
const SPLAY = 0.14;
const LEG_TOP = 0.024;
const LEG_FOOT = 0.019;
/** the stretchers' radius, and their heights (a share of the legs' height: one pair, the other pair above it) */
const STRETCHER = 0.012;
const STRETCHERS_AT = [0.26, 0.34];
/** the woods: the seat's honey oak, the legs' ruddy stain */
const SEAT_TONE = 0xd0a068;
const LEG_TONE = 0x9a4420;

const UP = new THREE.Vector3(0, 1, 0);
/** a leg's or a stretcher's sides round, open at its ends (they're in the seat, the floor and the legs) */
const PIECE_SIDES = 6;

/** The parts of a seat (`group`) but those `kept` joined into one mesh a material, each named as `names` says: a seat
 *  is kept out of its room's merge (`keepApart` in rooms.ts, so the one pointed at is outlined alone), and its legs,
 *  stretchers and tenons, a mesh each, took the tavern from 249 draws to 409 (`lab village --only
 *  sweepWithinBudgets`). */
export function joinParts(group: THREE.Object3D, kept: readonly THREE.Object3D[],
  names: ReadonlyMap<THREE.Material, string> = new Map()): void {
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const parts: THREE.Mesh[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || kept.includes(mesh)) return;
    parts.push(mesh);
  });
  for (const mesh of parts) {
    const material = mesh.material as THREE.Material;
    const placed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(placed.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') placed.deleteAttribute(name);
    }
    placed.applyMatrix4(toGroup.clone().multiply(mesh.matrixWorld));
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material)!.push(placed);
    mesh.removeFromParent();
  }
  for (const [material, geometries] of byMaterial) {
    const joined = new THREE.Mesh(mergeGeometries(geometries), material);
    joined.name = names.get(material) ?? '';
    joined.castShadow = joined.receiveShadow = true;
    group.add(joined);
  }
}

/** The woods a seat is made of, the rooms' woods tinted: its seat's honey oak and its frame's ruddy stain (a stool's,
 *  a bench's, a chair's). */
export function seatWoods(M: Mats): { seat: THREE.MeshStandardMaterial; frame: THREE.MeshStandardMaterial } {
  return { seat: woodTint(M.oak, SEAT_TONE), frame: woodTint(M.timber, LEG_TONE) };
}

/** A round piece from `a` to `b`, of radius `r` (`rEnd` at `b`), in `material`, added to `into`. */
function piece(into: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, rEnd: number,
  material: THREE.Material): THREE.Mesh {
  const along = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rEnd, r, along.length(), PIECE_SIDES, 1, true), material);
  mesh.position.copy(a).addScaledVector(along, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, along.normalize());
  mesh.castShadow = mesh.receiveShadow = true;
  into.add(mesh);
  return mesh;
}

/** A stool at (x, z), its seat's top at `high`; `ring`, a foot ring at that height (a bar stool's). */
export function stool(g: THREE.Object3D, M: Mats, x: number, z: number, high = 0.5, ring?: number): Furniture {
  const s = new THREE.Group();
  g.add(s);
  const { seat: seatWood, frame: legWood } = seatWoods(M);
  const under = high - SEAT;
  // (the seat, a thick disc, its edge chamfered underneath)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(STOOL_R, STOOL_R, SEAT - CHAMFER, 14), seatWood);
  top.position.set(x, under + CHAMFER + (SEAT - CHAMFER) / 2, z);
  top.castShadow = top.receiveShadow = true;
  s.add(top);
  const chamfer = new THREE.Mesh(new THREE.CylinderGeometry(STOOL_R, STOOL_R - CHAMFER, CHAMFER, 14, 1, true), seatWood);
  chamfer.position.set(x, under + CHAMFER / 2, z);
  chamfer.castShadow = true;
  s.add(chamfer);
  // (each leg's middle at height y, its way round from the stool's middle at `turn`)
  const legAt = (turn: number, y: number): THREE.Vector3 => {
    const out = LEG_IN + (under - y) * Math.tan(SPLAY);
    return new THREE.Vector3(x + Math.cos(turn) * out, y, z + Math.sin(turn) * out);
  };
  const turns = [0, 1, 2, 3].map((k) => (k + 0.5) * Math.PI / 2);
  for (const turn of turns) {
    // (from its foot into the seat, through it: its wedged tenon's end grain shows on the seat's top)
    piece(s, legAt(turn, 0), legAt(turn, under + 0.02), LEG_FOOT, LEG_TOP, legWood);
    const tenon = new THREE.Mesh(new THREE.CircleGeometry(LEG_TOP * 0.8, 6).rotateX(-Math.PI / 2), legWood);
    tenon.position.copy(legAt(turn, under)).setY(high + 0.0005);
    s.add(tenon);
  }
  // (two stretchers across from each other at one height, the other two a little above them)
  turns.forEach((turn, k) => {
    const next = turns[(k + 1) % turns.length], y = under * STRETCHERS_AT[k % 2];
    piece(s, legAt(turn, y), legAt(next, y), STRETCHER, STRETCHER, legWood);
  });
  if (ring !== undefined) {
    // (a ring through the legs at its height, where the feet rest)
    const radius = LEG_IN + (under - ring) * Math.tan(SPLAY);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 4, 16).rotateX(Math.PI / 2), legWood);
    hoop.position.set(x, ring, z);
    hoop.castShadow = true;
    s.add(hoop);
  }
  joinParts(s, [top]);
  return { group: s, top };
}
