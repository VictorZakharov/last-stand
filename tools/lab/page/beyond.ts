// `lab beyond`: the ranger's arrows loosed over the wall (tools/lab). In each biome, at angles round the ring, he
// stands six metres in from the wall facing out and looses his basic attack, drawn to full, over the shoulder, the
// crosshair turned onto what lies beyond it:
// the ground past the wall, and the nearest tree (or the crypt's dead tree) that way, low and high up its trunk. Each arrow is followed until it
// ends, and every arrow it leaves standing is judged by the surfaces the biome draws, not by the game's own idea of
// them: a ray along the arrow, from behind it, must meet a surface near its point. With no height to the wall, an
// arrow over it stood in the air at the wall's line (#290). `--canary` plants an arrow standing in the air over the
// ground past the wall in the first biome: it must be found.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { BIOME_IDS, BIOMES, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { render } from '../../../src/core/renderer';
import { WALL_R } from '../../../src/world/props';
import { pastWall } from '../../../src/world/edge';
import { drawnInShadowsOnly } from '../../../src/world/culling';
import { spentPoints, stickAt } from '../../../src/fx/stuckArrows';
import { drawAt, letGo } from './shots';
import { groundHeight } from '../../../src/world/ground';

export interface BeyondOptions {
  /** the biomes shot in (every one by default) */
  biomes?: BiomeId[];
  /** the angles round the ring he shoots out at */
  angles: number;
  canary: boolean;
}

/** how far in from the wall's face he stands (m), and how far past it the ground he aims at lies */
const STAND_IN = 6;
const GROUND_PAST = 8;
/** the trees he aims at: their names, how far either side of his way (rad) and how far out (m) */
const TREE = /^(trees' bark|dead trees)/;
const TREE_SIDE = 0.35;
const TREE_FURTHEST = 48;
/** how high up a tree's trunk he aims (m): low, into the thicket before it, and high, over the wall */
const TRUNK_UP = [1.5, 5];
/** the most frames an arrow flies, and that what it struck may still be falling after */
const FLIGHT_FRAMES = 300;
const FALL_FRAMES = 240;
/** a standing arrow's point must have a surface this near it, looked for along it from this far behind (m) */
const NEAR = 0.3;
const BEHIND = 1;
/** a prop this near his way out (m past its circle) skips the angle */
const PROP_CLEAR = 1;
/** the canary's arrow: how far past the face it stands, and how high (m) */
const CANARY_PAST = 4;
const CANARY_UP = 3;
/** an arrow this near the floor lies on it (m), and what's over it this far up covers it */
const LYING = 0.1;
const COVER = 2;

/** A standing arrow judged: where its point is, what it's in (the surface met near it), and whether that's air. */
interface Stood {
  tip: THREE.Vector3;
  in: string;
  air: boolean;
  /** lying on the floor inside something drawn over it */
  buried?: boolean;
}

/** One shot: what it was aimed at, where its flight ended (m out, m up) and the arrows it left standing (none if it
 *  flew out of the world). */
interface Shot {
  degrees: number;
  aimed: string;
  ended: string;
  stood: Stood[];
}

/** How far out from the middle the face is along `angle` (m): an octagon's further toward its corners. */
function faceAt(biome: BiomeId, angle: number): number {
  if (BIOMES[biome].minimap.wall !== 'octagon') return WALL_R;
  const side = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return WALL_R / Math.cos(angle - side);
}

/** A mesh's name: its own, else its material's colour and the name up its parents. */
function nameOf(mesh: THREE.Object3D): string {
  if (mesh.name) return mesh.name;
  const colour = ((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
  const look = colour ? `a mesh #${colour.getHexString()}` : 'a mesh';
  for (let at = mesh.parent; at; at = at.parent) if (at.name) return `${look} in ${at.name}`;
  return look;
}

/** what an arrow on the floor lies among, not under: the grass, the weeds and the pebbles */
const AMONG = /^(grass|weeds|pebbles)/;

/** Whether a mesh draws a solid surface an arrow can stand in: opaque, not cut out, seen from outside. */
function solid(mesh: THREE.Mesh): boolean {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material.transparent || material.alphaTest > 0 || material.side === THREE.BackSide) return false;
  if (AMONG.test(mesh.name)) return false;
  return material.blending === THREE.NormalBlending && !drawnInShadowsOnly(mesh);
}

/** The biome's solid meshes, its culled ones' instances all packed: drawn once unculled (a culled mesh holds only the
 *  instances in view as it was last drawn, and the lab's frames aren't drawn). */
function solidsOf(lab: Lab, group: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && solid(mesh)) meshes.push(mesh);
  });
  const culled = meshes.filter((mesh) => (mesh as THREE.InstancedMesh).isInstancedMesh && mesh.frustumCulled);
  const drawing = lab.drawing;
  for (const mesh of culled) mesh.frustumCulled = false;
  lab.drawing = true;
  try {
    render();
  } finally {
    lab.drawing = drawing;
    for (const mesh of culled) mesh.frustumCulled = true;
  }
  return meshes;
}

/** The trees' feet (x, z) in the biome: each instance of its trees' meshes. */
function treesOf(meshes: THREE.Mesh[]): THREE.Vector2[] {
  const feet: THREE.Vector2[] = [];
  const matrix = new THREE.Matrix4();
  const at = new THREE.Vector3();
  for (const mesh of meshes.filter((one) => TREE.test(one.name))) {
    const instanced = mesh as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) continue;
    for (let i = 0; i < instanced.count; i++) {
      instanced.getMatrixAt(i, matrix);
      at.setFromMatrixPosition(matrix.premultiply(mesh.matrixWorld));
      feet.push(new THREE.Vector2(at.x, at.z));
    }
  }
  return feet;
}

/** The nearest tree out along `angle` from `from`, within TREE_SIDE either side and TREE_FURTHEST out. */
function treeAlong(trees: THREE.Vector2[], from: THREE.Vector2, angle: number): THREE.Vector2 | null {
  let best: THREE.Vector2 | null = null;
  for (const foot of trees) {
    const off = Math.atan2(foot.y - from.y, foot.x - from.x) - angle;
    const side = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    const far = foot.distanceTo(from);
    if (side > TREE_SIDE || Math.hypot(foot.x, foot.y) > TREE_FURTHEST) continue;
    if (!best || far < best.distanceTo(from)) best = foot;
  }
  return best;
}

/** Whether a prop stands near the way from `from` out to `to` (x, z). */
function propInWay(from: THREE.Vector2, to: THREE.Vector2): boolean {
  const way = new THREE.Line3(new THREE.Vector3(from.x, 0, from.y), new THREE.Vector3(to.x, 0, to.y));
  const on = new THREE.Vector3();
  return G.arena.obstacles.some((o) => {
    way.closestPointToPoint(new THREE.Vector3(o.x, 0, o.z), true, on);
    return Math.hypot(on.x - o.x, on.z - o.z) < o.r + PROP_CLEAR;
  });
}

/** A standing arrow judged by the surfaces drawn: one lying on the floor by what's over it (nothing but the sky, the
 *  leaves), another by the first surface met along it from behind, near its point or not. */
function judge(p: THREE.Vector3, tip: THREE.Vector3, meshes: THREE.Mesh[]): Stood {
  if (tip.y - groundHeight(tip.x, tip.z) < LYING) return lying(tip, meshes);
  const along = tip.clone().sub(p).normalize();
  const ray = new THREE.Raycaster(tip.clone().addScaledVector(along, -BEHIND), along, 0, BEHIND + NEAR);
  ray.layers.enableAll();
  const [hit] = ray.intersectObjects(meshes, false);
  const near = hit ? Math.abs(hit.distance - BEHIND) <= NEAR : false;
  return { tip: tip.clone(), in: hit && near ? nameOf(hit.object) : 'the air', air: !near };
}

/** An arrow lying on the floor: under the sky, or in what covers it (the stone of the wall it fell into). */
function lying(tip: THREE.Vector3, meshes: THREE.Mesh[]): Stood {
  const ray = new THREE.Raycaster(tip.clone().setY(tip.y + COVER), new THREE.Vector3(0, -1, 0), 0, COVER - LYING);
  ray.layers.enableAll();
  const [hit] = ray.intersectObjects(meshes, false);
  return { tip: tip.clone(), in: hit ? `the floor under ${nameOf(hit.object)}` : 'the floor', air: false,
    buried: !!hit };
}

/** The arrows standing now (their points: each spent arrow keeps its own). */
const standing = (): Set<THREE.Vector3> => new Set(spentPoints().map((spent) => spent.tip));

/** One shot loosed at `point`, followed until it's over and what it struck has come to rest; the arrows it left. */
async function shootAt(lab: Lab, point: THREE.Vector3, meshes: THREE.Mesh[]): Promise<{ ended: string;
  stood: Stood[] }> {
  const before = standing();
  const flying = new Set(G.projectiles);
  await drawAt(lab, point);
  await lab.step(1, () => letGo(point));
  const shot = G.projectiles.find((projectile) => !flying.has(projectile) && !projectile.hostile);
  for (let f = 0; shot?.alive && f < FLIGHT_FRAMES; f++) await lab.step(1, () => letGo(point));
  const last = shot?.pos.clone();
  const ended = last ? `${Math.hypot(last.x, last.z).toFixed(1)} m out, ${last.y.toFixed(1)} m up` : 'never loosed';
  const resting = () => spentPoints().every((spent) => before.has(spent.tip) || spent.mode !== 'loose');
  for (let f = 0; !resting() && f < FALL_FRAMES; f++) await lab.step(1, () => letGo(point));
  await lab.until(() => !G.player.casting, FALL_FRAMES, 'the shot was never over', () => letGo(point));
  const left = spentPoints().filter((spent) => !before.has(spent.tip) && spent.mode === 'fixed');
  return { ended, stood: left.map((spent) => judge(spent.p, spent.tip, meshes)) };
}

/** The canary's arrow, standing in the air past the wall along `angle`, judged as a shot's are. */
function canaryArrow(biome: BiomeId, angle: number, meshes: THREE.Mesh[]): Stood | undefined {
  const before = standing();
  const out = faceAt(biome, angle) + CANARY_PAST;
  const tip = new THREE.Vector3(Math.cos(angle) * out, CANARY_UP, Math.sin(angle) * out);
  stickAt(tip, new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), 0);
  const planted = spentPoints().find((spent) => !before.has(spent.tip));
  return planted && judge(planted.p, planted.tip, meshes);
}

/** Every shot over the wall in `biome` (with `canary`, the canary's arrow first). */
async function shotsIn(lab: Lab, biome: BiomeId, angles: number, canary: boolean): Promise<{ shots: Shot[];
  caught: boolean | null }> {
  // (over the shoulder, the crosshair turned onto each point: from above, the aim is the ground under the cursor)
  await lab.setup({ view: 'third' });
  const meshes = solidsOf(lab, G.arena.groupOf(biome));
  const trees = treesOf(meshes);
  const shots: Shot[] = [];
  let caught: boolean | null = null;
  for (let i = 0; i < angles; i++) {
    const angle = ((i + 0.5) / angles) * Math.PI * 2;
    const face = faceAt(biome, angle);
    const out = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const from = out.clone().multiplyScalar(face - STAND_IN);
    const gate = pastWall(biome, out.x * face, out.y * face, new THREE.Vector3()).gate;
    if (gate || propInWay(from, out.clone().multiplyScalar(face))) continue;
    if (canary && caught === null) caught = canaryArrow(biome, angle, meshes)?.air ?? false;
    G.player.place(new THREE.Vector3(from.x, 0, from.y), Math.atan2(out.x, out.y));
    G.player.vel.set(0, 0, 0);
    const ground = out.clone().multiplyScalar(face + GROUND_PAST);
    const targets: [string, THREE.Vector3][] = [['the ground past the wall', new THREE.Vector3(ground.x, 0, ground.y)]];
    const tree = treeAlong(trees, from, angle);
    for (const up of tree ? TRUNK_UP : []) {
      targets.push([`a tree ${tree!.length().toFixed(0)} m out, ${up} m up`, new THREE.Vector3(tree!.x, up, tree!.y)]);
    }
    for (const [aimed, point] of targets) {
      const meshesNow = solidsOf(lab, G.arena.groupOf(biome));
      shots.push({ degrees: (angle * 180) / Math.PI, aimed, ...await shootAt(lab, point, meshesNow) });
    }
  }
  return { shots, caught };
}

/** A shot's arrows as its line says them. */
function shotLine(shot: Shot): string {
  const ends = shot.stood.map((stood) => {
    const at = `${Math.hypot(stood.tip.x, stood.tip.z).toFixed(1)} m out, ${stood.tip.y.toFixed(1)} m up`;
    return `in ${stood.in} (${at})`;
  });
  const left = ends.join(', ') || 'none left';
  return `${shot.degrees.toFixed(0)}°, at ${shot.aimed}: its flight ended ${shot.ended}; ${left}`;
}

/** `lab beyond`: the ranger's arrows loosed over the wall at what lies beyond it, each judged where it stood. */
export async function beyond(lab: Lab, options: BeyondOptions): Promise<Report> {
  if (!G.player.cls.quiver) {
    const why = `the ${G.player.cls.id} shoots no arrows: run it with --class ranger`;
    return { text: why, problems: [why] };
  }
  const was = G.arena.biome;
  const lines: string[] = [];
  const problems: string[] = [];
  let caught: boolean | null = null;
  for (const biome of options.biomes ?? [...BIOME_IDS]) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    const read = await shotsIn(lab, biome, options.angles, options.canary && caught === null);
    caught ??= read.caught;
    const stood = read.shots.flatMap((shot) => shot.stood);
    const air = read.shots.filter((shot) => shot.stood.some((one) => one.air));
    lines.push(`${biome}: ${read.shots.length} shots over the wall, ${stood.length} arrows left standing, `
      + `${stood.length - stood.filter((one) => one.air).length} in a surface`);
    for (const shot of read.shots) lines.push(`  ${shotLine(shot)}`);
    for (const shot of air) problems.push(`${biome}: ${shotLine(shot)}: an arrow stands in the air`);
    const buried = read.shots.filter((shot) => shot.stood.some((one) => one.buried));
    for (const shot of buried) problems.push(`${biome}: ${shotLine(shot)}: an arrow lies inside what's over it`);
  }
  if (G.arena.biome !== was) G.arena.setBiome(was);
  if (caught === null) return { text: lines.join('\n'), problems };
  lines.push(`canary: an arrow standing in the air past the wall ${caught ? 'found' : 'unseen'}`);
  if (!caught) problems.push('canary: an arrow standing in the air past the wall went unseen');
  return { text: lines.join('\n'), problems };
}
