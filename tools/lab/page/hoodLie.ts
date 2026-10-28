// tools/lab hood: how the hood's capelet lies on him. From play: "this doesn't seem like cloth, why it sticks out from
// body": laid as a cone over the shoulders, held there and fended off by capsules 4 cm over the coat, it stood off his
// shoulders as pauldrons do. Each point of its outside from the row below where it begins (`HoodCloth`'s
// `userData.grid.capelet`: the join, where the hood's gathers fold onto it) down to its hem is read by a ray from
// `LIE_FROM` out along its normal back in onto his body as drawn (`BakedBody`:
// what he holds and the hood itself left out): how far it stands off what it covers, or, where the ray meets him
// before it, how deep his body has come out through it. Read round him: the front, over the shoulders, down the back;
// with --rows, row by row from its first, and where its farthest and deepest points are and what they lie over.
import * as THREE from 'three';
import type { Lab } from './lab';
import { BakedBody, isUnder } from './geometry';

/** where round him a point is: how far from his front about the chest's axis, either way (degrees), at most */
const REGIONS = [
  { name: 'front', most: 45 },
  { name: 'shoulders', most: 135 },
  { name: 'back', most: 180 },
] as const;
type Region = (typeof REGIONS)[number]['name'];

/** the most the capelet may stand off him (cm): as a rule (its median), and at its tenth farthest */
const MOST_OFF = { typical: 2, far: 4 };
/** the deepest his body may come out through it (cm): the cloth's own thickness lies over him */
const MOST_THROUGH = 0.3;
/** how far out along a point's normal its ray starts back in (m): past anything the capelet lies over */
const LIE_FROM = 0.15;
/** how far past the point its ray looks for him (m): beyond, the point covers nothing */
const LIE_PAST = 0.2;
/** how many of a region's farthest and deepest points --rows names */
const NAMED = 3;
/** with --canary: how far the capelet is lifted off him (cm), and how much further off the measure must read it */
const CANARY_LIFT = 4;
const CANARY_LEAST_LIFT = 3;
/** with --canary: how deep its back is sunk (cm: past where it stands off him, `MOST_OFF.far`, and on into him), and how
 *  deep the measure must read him come through */
const CANARY_SINK = 7;
const CANARY_LEAST_SINK = 2;

/** The hood's outside, its grid and the row its capelet begins on. */
export interface CapeletMesh {
  mesh: THREE.Mesh;
  across: number;
  down: number;
  capelet: number;
}

/** A point of the capelet read: how far it stands off him (cm; negative, how deep he's come through), its row from
 *  where the capelet begins, where it is in the chest's space, and what it lies over. */
interface LiePoint {
  off: number;
  row: number;
  inChest: THREE.Vector3;
  over: string;
}

/** One region's points read, and how many cover nothing. */
interface RegionLie {
  points: LiePoint[];
  bare: number;
}

export interface Lie {
  regions: Record<Region, RegionLie>;
  rows: number;
}

/** A point of the capelet's outside in the world: where it is, which way it faces, and its row. */
interface ClothPoint {
  at: THREE.Vector3;
  normal: THREE.Vector3;
  row: number;
}

/** A region's reading (cm): its median, its tenth farthest and its deepest through. */
interface Reading {
  typical: number;
  far: number;
  through: number;
}

function emptyLie(rows: number): Lie {
  const region = (): RegionLie => ({ points: [], bare: 0 });
  return { regions: { front: region(), shoulders: region(), back: region() }, rows };
}

/** His body as drawn this frame, but what he holds and the hood. */
function bodyOf(lab: Lab, held: THREE.Object3D[]): THREE.Mesh[] {
  const include = (mesh: THREE.Mesh) => !mesh.userData.hoodPart && !held.some((thing) => isUnder(mesh, thing));
  return new BakedBody(lab.model.root, lab.joints, include).bake();
}

/** The capelet's first row: the one below the row it begins on, the join, where the hood's gathers fold onto it (the
 *  join's normal is the fold's: along it, his back read 10 cm through the capelet). */
function firstRow(hood: CapeletMesh): number {
  return hood.capelet + 1;
}

/** The capelet's outside, point by point, from its first row down to its hem. */
function capeletPoints(hood: CapeletMesh): ClothPoint[] {
  const geometry = hood.mesh.geometry;
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const world = hood.mesh.matrixWorld;
  const turn = new THREE.Matrix3().getNormalMatrix(world);
  const points: ClothPoint[] = [];
  for (let k = firstRow(hood) * hood.across; k < hood.down * hood.across; k++) {
    const at = new THREE.Vector3().fromBufferAttribute(position, k).applyMatrix4(world);
    const facing = new THREE.Vector3().fromBufferAttribute(normal, k).applyMatrix3(turn).normalize();
    points.push({ at, normal: facing, row: Math.floor(k / hood.across) - firstRow(hood) });
  }
  return points;
}

/** What the point lies over and how far it stands off it (cm; negative, how deep it's come through), or null if it
 *  covers nothing. */
function overAt(point: ClothPoint, body: THREE.Mesh[], ray: THREE.Raycaster): { off: number; over: string } | null {
  const from = point.at.clone().addScaledVector(point.normal, LIE_FROM);
  ray.set(from, point.normal.clone().negate());
  ray.far = LIE_FROM + LIE_PAST;
  const hit = ray.intersectObjects(body, false)[0];
  if (!hit) return null;
  return { off: (hit.distance - LIE_FROM) * 100, over: String(hit.object.userData.label ?? hit.object.name) };
}

/** Where round him a point is, from where it is in the chest's space. */
function regionOf(inChest: THREE.Vector3): Region {
  const round = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(inChest.x, inChest.z)));
  return REGIONS.find((region) => round <= region.most)!.name;
}

/** How the capelet lies on him as he stands now. */
export function lieOf(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[]): Lie {
  const body = bodyOf(lab, held);
  const ray = new THREE.Raycaster();
  const toChest = lab.joints.chest.matrixWorld.clone().invert();
  const lie = emptyLie(hood.down - firstRow(hood));
  for (const point of capeletPoints(hood)) {
    const inChest = point.at.clone().applyMatrix4(toChest);
    const region = lie.regions[regionOf(inChest)];
    const read = overAt(point, body, ray);
    if (read) region.points.push({ ...read, row: point.row, inChest });
    else region.bare++;
  }
  return lie;
}

/** The value `share` of the way up the sorted values. */
function quantile(sorted: number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

const sortedOffs = (points: LiePoint[]): number[] => points.map((point) => point.off).sort((a, b) => a - b);

/** A region's reading, or null where none of the capelet lies over it. */
function readingOf(region: RegionLie): Reading | null {
  if (!region.points.length) return null;
  const sorted = sortedOffs(region.points);
  return { typical: quantile(sorted, 0.5), far: quantile(sorted, 0.9), through: Math.max(0, -sorted[0]) };
}

/** The lie as lines, a problem for each region standing off or come through past its limit. */
export function lieLines(lie: Lie, problems: string[]): string[] {
  const lines = [`the capelet on him, cm off his body (${MOST_OFF.typical} as a rule and ${MOST_OFF.far} at its tenth `
    + `farthest at most; his body through it ${MOST_THROUGH} deep at most):`];
  for (const { name } of REGIONS) {
    const region = lie.regions[name];
    const read = readingOf(region);
    if (!read) {
      lines.push(`  ${name}: none of it`);
      continue;
    }
    const bare = region.bare ? `, ${region.bare} over nothing` : '';
    lines.push(`  ${name}: ${read.typical.toFixed(1)} as a rule, ${read.far.toFixed(1)} at its tenth farthest, `
      + `through it ${read.through.toFixed(1)} at worst (${region.points.length} points${bare})`);
    problems.push(...regionProblems(name, read));
  }
  const overNone = REGIONS.every(({ name }) => !lie.regions[name].points.length);
  if (overNone) problems.push('hood: the capelet lies over none of him');
  return lines;
}

/** A region's problems: standing off him, or him come through it, past the limits. */
function regionProblems(name: Region, read: Reading): string[] {
  const problems: string[] = [];
  if (read.typical > MOST_OFF.typical) {
    problems.push(`hood: the capelet stands ${read.typical.toFixed(1)} cm off his ${name}`);
  }
  if (read.far > MOST_OFF.far) {
    problems.push(`hood: a tenth of the capelet stands ${read.far.toFixed(1)} cm off his ${name}`);
  }
  if (read.through > MOST_THROUGH) {
    problems.push(`hood: his ${name} comes ${read.through.toFixed(1)} cm through the capelet`);
  }
  return problems;
}

/** A point as words: how far off (or through), its row, where in the chest's space (cm) and what it lies over. */
function pointWords(point: LiePoint): string {
  const where = [point.inChest.x, point.inChest.y, point.inChest.z].map((v) => (v * 100).toFixed(0)).join(', ');
  return `${point.off.toFixed(1)} at row ${point.row} (${where}) over ${point.over}`;
}

/** The lie row by row from where the capelet begins to its hem, each region's median there, and each region's
 *  farthest and deepest points. */
export function lieRows(lie: Lie): string[] {
  const lines = [`  row by row from its first below the join (${REGIONS.map(({ name }) => name).join(', ')}):`];
  for (let row = 0; row < lie.rows; row++) {
    const cells = REGIONS.map(({ name }) => {
      const offs = sortedOffs(lie.regions[name].points.filter((point) => point.row === row));
      return (offs.length ? quantile(offs, 0.5).toFixed(1) : '-').padStart(5);
    });
    lines.push(`  ${String(row).padStart(4)}: ${cells.join(' ')}`);
  }
  for (const { name } of REGIONS) {
    const points = [...lie.regions[name].points].sort((a, b) => b.off - a.off);
    if (!points.length) continue;
    lines.push(`  ${name}, farthest: ${points.slice(0, NAMED).map(pointWords).join('; ')}`);
    lines.push(`  ${name}, deepest: ${points.slice(-NAMED).reverse().map(pointWords).join('; ')}`);
  }
  return lines;
}

/** The capelet's outside moved along its normals by `cm` where `moved` says (in the chest's space); returns the undo. */
function moveCapelet(lab: Lab, hood: CapeletMesh, cm: number, moved: (inChest: THREE.Vector3) => boolean): () => void {
  const geometry = hood.mesh.geometry;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal;
  const kept = (position.array as Float32Array).slice();
  const toChest = new THREE.Matrix4().copy(lab.joints.chest.matrixWorld).invert().multiply(hood.mesh.matrixWorld);
  const scale = hood.mesh.getWorldScale(new THREE.Vector3()).x;
  const point = new THREE.Vector3();
  const facing = new THREE.Vector3();
  for (let k = firstRow(hood) * hood.across; k < hood.down * hood.across; k++) {
    if (!moved(point.fromBufferAttribute(position, k).applyMatrix4(toChest))) continue;
    facing.fromBufferAttribute(normal, k).multiplyScalar(cm / 100 / scale);
    position.setXYZ(k, position.getX(k) + facing.x, position.getY(k) + facing.y, position.getZ(k) + facing.z);
  }
  position.needsUpdate = true;
  return () => {
    (position.array as Float32Array).set(kept);
    position.needsUpdate = true;
  };
}

/** The lie with the capelet moved as `moveCapelet` moves it, put back after. */
function lieMoved(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[], cm: number,
  moved: (inChest: THREE.Vector3) => boolean): Lie {
  const undo = moveCapelet(lab, hood, cm, moved);
  try {
    return lieOf(lab, hood, held);
  } finally {
    undo();
  }
}

/** How much further off the lifted capelet reads than before, in the region it grew least (cm), of those it lies over;
 *  null if it lies over none. */
function leastGrowth(before: Lie, lifted: Lie): number | null {
  const growths: number[] = [];
  for (const { name } of REGIONS) {
    const was = readingOf(before.regions[name]);
    const now = readingOf(lifted.regions[name]);
    if (was && now) growths.push(now.typical - was.typical);
  }
  return growths.length ? Math.min(...growths) : null;
}

/** The canary: the capelet lifted off him, which must read as standing further off everywhere it lies, then its back
 *  sunk into him, which must read as his back come through. Returns its line; a miss is a problem. */
export function lieCanary(lab: Lab, hood: CapeletMesh, held: THREE.Object3D[], before: Lie, problems: string[]): string {
  const grew = leastGrowth(before, lieMoved(lab, hood, held, CANARY_LIFT, () => true));
  const onBack = (inChest: THREE.Vector3) => regionOf(inChest) === 'back';
  const sunk = readingOf(lieMoved(lab, hood, held, -CANARY_SINK, onBack).regions.back);
  const through = sunk?.through ?? 0;
  const further = grew === null ? 'nothing read' : `${grew.toFixed(1)} cm`;
  const read = `canary, the capelet lifted ${CANARY_LIFT} cm off him: ${further} further off at least; `
    + `its back sunk ${CANARY_SINK} cm into him: his back ${through.toFixed(1)} cm through it`;
  if (grew === null || grew < CANARY_LEAST_LIFT || through < CANARY_LEAST_SINK) problems.push(`missed: ${read}`);
  return read;
}
