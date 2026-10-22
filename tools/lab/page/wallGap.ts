// `lab wall`: how near the hero walks up to the wall (tools/lab). In each biome, at angles round the ring, he's put
// three metres in from the wall's face and walks straight out with the touch stick until it stops him; then rays run
// out from him at a body's heights, across the way he walked, against every solid surface the biome draws (and the
// thicket's leaves, which he brushes up against), and the nearest is the gap between his body and the wall. A ring
// of air kept him 1.2 to 3.2 m off the wall. Angles with a prop between him and the wall are skipped (he'd stop at
// the prop), and the gates' openings (he walks up to the portal, which draws no surface). `--canary` reads the first
// angle's gap a metre short of where he stopped: it must be seen.
import * as THREE from 'three';
import type { Frame, Lab, Report } from './lab';
import { BIOME_IDS, BIOMES, type BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { cameraYaw, render } from '../../../src/core/renderer';
import { WALL_R } from '../../../src/world/props';
import { pastWall } from '../../../src/world/edge';
import { drawnInShadowsOnly } from '../../../src/world/culling';

export interface WallOptions {
  /** the biomes walked (every one by default) */
  biomes?: BiomeId[];
  /** the angles round the ring he walks out at */
  angles: number;
  canary: boolean;
}

/** how far in from the face he starts (m), and the most frames he walks (into a notch between two bushes, pushed off
 *  its sides in turn, he settles into it slowly) */
const START_IN = 3;
const WALK_FRAMES = 600;
/** the frames he stands on his spot before he walks (put there, his feet are where he was) */
const SETTLE_FRAMES = 30;
/** he's stopped when he's gone less than this further out (m) over STILL_FRAMES frames (3 cm/s: braked as he nears
 *  the wall, he creeps the last centimetres into a corner along a face he walked into at a slant) */
const STILL = 5e-3;
const STILL_FRAMES = 10;
/** a walk that never stops: its way said every TRACE_EVERY frames, the last TRACE_KEPT of them */
const TRACE_EVERY = 50;
const TRACE_KEPT = 8;
/** the heights the gap is read at (m: above the grass, a hip, a head), and the ways across his walk (rad either side) */
const HEIGHTS = [0.6, 1.1, 1.6];
const ACROSS = (75 * Math.PI) / 180;
const ACROSS_STEPS = 15;
/** a gap more than this is air between him and the wall (m); less than INTO is his body in it (cloth gives that
 *  much: a banner's hem) */
const MOST_GAP = 0.2;
const INTO = -0.07;
/**
 * how far short of the thicket's leaves he may stop (m: their cards are ragged), and how near his middle they may come
 * (m): leaves give, brushed through, so his body may stand in their outer cards, but not up to his middle (a bush's
 * outer cards stand half its lumps' size out past them, and a line kept out of them all left air between; kept off
 * the lumps' outlines, a card hanging low at his thigh came 9 cm from his middle, wherever their swelling was set)
 */
const LEAVES_GIVE = 0.3;
const LEAVES_CLEAR = 0.08;
/** a prop this near his way out (m past its circle) skips the angle */
const PROP_CLEAR = 1;
/** how far the canary reads short of his stop (m) */
const CANARY_SHORT = 1;

/** One walk out: its angle (degrees), where he stopped (m from the middle) and the gap there (m). */
interface Walk {
  degrees: number;
  stopped: number;
  gap: number;
  /** the mesh nearest him, and the height it's nearest at (m) */
  against: string;
  /** whether that's the thicket's leaves (they give) */
  leaves: boolean;
  /** the joints his walk put past their ranges (the anatomy's warnings it logged) */
  joints: string[];
}

/** How far out from the middle the face is along `angle` (m): an octagon's face further toward its corners. */
function faceAt(biome: BiomeId, angle: number): number {
  if (BIOMES[biome].minimap.wall !== 'octagon') return WALL_R;
  const side = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return WALL_R / Math.cos(angle - side);
}

/** Whether a prop stands near the way from `from` out to the face's point `to` (x, z). */
function propInWay(from: THREE.Vector2, to: THREE.Vector2): boolean {
  const way = new THREE.Line3(new THREE.Vector3(from.x, 0, from.y), new THREE.Vector3(to.x, 0, to.y));
  const on = new THREE.Vector3();
  return G.arena.obstacles.some((o) => {
    way.closestPointToPoint(new THREE.Vector3(o.x, 0, o.z), true, on);
    return Math.hypot(on.x - o.x, on.z - o.z) < o.r + PROP_CLEAR;
  });
}

/** the leaves the hero brushes up against: the thicket's (the ferns' and the trees' stand clear of his way) */
const BRUSHED = 'thicket leaves';
/** what he walks through, low on the floor: the grass, the weeds and the pebbles */
const WALKED_THROUGH = /^(grass|weeds|pebbles)/;

/** Whether a mesh draws a surface he walks up to: opaque, not cut out (but for the thicket's leaves), seen from
 *  outside (not a sky). */
function solid(mesh: THREE.Mesh): boolean {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material.transparent || material.side === THREE.BackSide) return false;
  if ((material.alphaTest > 0 && mesh.name !== BRUSHED) || WALKED_THROUGH.test(mesh.name)) return false;
  return material.blending === THREE.NormalBlending;
}

/** The biome's meshes he walks up to, its culled ones' instances all packed: drawn once unculled (a culled mesh
 *  holds only the instances in view as it was last drawn, and the lab's frames aren't drawn). */
function solidsOf(lab: Lab, group: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && solid(mesh) && !drawnInShadowsOnly(mesh)) meshes.push(mesh);
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

/** The touch stick's push that walks him along `angle` on the screen as the camera turns it. */
function stickToward(angle: number): [number, number] {
  const tx = Math.cos(angle);
  const tz = Math.sin(angle);
  const yaw = cameraYaw();
  return [tx * Math.cos(yaw) - tz * Math.sin(yaw), tx * Math.sin(yaw) + tz * Math.cos(yaw)];
}

/** An angle in degrees as a line says it. */
const degreesOf = (angle: number): string => ((angle * 180) / Math.PI).toFixed(1);

/** Frames run with `frame`'s input until `done`, at most WALK_FRAMES of them; whether it was. */
async function stepsUntil(lab: Lab, done: () => boolean, frame: () => Frame): Promise<boolean> {
  for (let f = 0; f < WALK_FRAMES; f++) {
    await lab.step(1, frame);
    if (done()) return true;
  }
  return false;
}

/** Where the hero is as a walk's trace says it: how far out, how far round from `angle` (degrees), and his speed
 *  (m/s). */
function placeOf(angle: number): string {
  const hero = G.player;
  const round = (Math.atan2(hero.pos.z, hero.pos.x) - angle) * (180 / Math.PI);
  const speed = Math.hypot(hero.vel.x, hero.vel.z);
  const out = Math.hypot(hero.pos.x, hero.pos.z);
  return `${out.toFixed(2)} m out ${round.toFixed(2)}° round at ${speed.toFixed(2)} m/s`;
}

/** He walks out along `angle` from START_IN in from the face until he stops; how far from the middle he stood. */
async function walkOut(lab: Lab, angle: number, from: THREE.Vector2): Promise<number> {
  const hero = G.player;
  hero.place(new THREE.Vector3(from.x, 0, from.y), Math.atan2(Math.cos(angle), Math.sin(angle)));
  hero.vel.set(0, 0, 0);
  await lab.step(SETTLE_FRAMES, () => ({ stick: [0, 0] }));
  const stick = stickToward(angle);
  // (how far out along his way he's gone: pressed against a slanted face he slides along it, out no further)
  const outs: number[] = [];
  const still = () => {
    outs.push(hero.pos.x * Math.cos(angle) + hero.pos.z * Math.sin(angle));
    const back = outs[outs.length - 1 - STILL_FRAMES];
    return outs.length > STILL_FRAMES * 2 && outs[outs.length - 1] - back < STILL;
  };
  // (where he was every TRACE_EVERY frames: a walk that never stops says where it went)
  const path: string[] = [];
  const frame = () => {
    if (outs.length % TRACE_EVERY === 0) path.push(placeOf(angle));
    return { stick };
  };
  const walked = await stepsUntil(lab, still, frame);
  if (!walked) {
    const out = Math.hypot(hero.pos.x, hero.pos.z).toFixed(2);
    throw new Error(`lab: the hero never stopped walking out at ${degreesOf(angle)}°, ${out} m out `
      + `(not within ${WALK_FRAMES} frames); his way, every ${TRACE_EVERY} frames: `
      + path.slice(-TRACE_KEPT).join('; '));
  }
  await lab.step(1, () => ({ stick: [0, 0] }));
  return Math.hypot(hero.pos.x, hero.pos.z);
}

/** A mesh's name: its own, else its material's colour and the name up its parents. */
function nameOf(mesh: THREE.Object3D): string {
  if (mesh.name) return mesh.name;
  const colour = ((mesh as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
  const look = colour ? `a mesh #${colour.getHexString()}` : 'a mesh';
  for (let at = mesh.parent; at; at = at.parent) if (at.name) return `${look} in ${at.name}`;
  return look;
}

/** The gap between his body, standing at `at`, and the nearest surface across the way out along `angle` (m), and
 *  what that surface is. */
function gapAt(at: THREE.Vector3, angle: number, meshes: THREE.Mesh[]): Omit<Walk, 'degrees' | 'stopped' | 'joints'> {
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  let nearest: THREE.Intersection | null = null;
  for (const height of HEIGHTS) {
    for (let k = -ACROSS_STEPS; k <= ACROSS_STEPS; k++) {
      const way = angle + (k / ACROSS_STEPS) * ACROSS;
      ray.set(new THREE.Vector3(at.x, height, at.z), new THREE.Vector3(Math.cos(way), 0, Math.sin(way)));
      const [hit] = ray.intersectObjects(meshes, false);
      if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
    }
  }
  if (!nearest) return { gap: Infinity, against: 'nothing', leaves: false };
  const against = `${nameOf(nearest.object)} at ${nearest.point.y.toFixed(1)} m up`;
  return { gap: nearest.distance - G.player.radius, against, leaves: nearest.object.name === BRUSHED };
}

/** Every walk out in `biome`, at `angles` angles round the ring (with `canary`, the first read short). */
async function walksIn(lab: Lab, biome: BiomeId, angles: number, canary: boolean): Promise<{ walks: Walk[];
  skipped: number; caught: boolean | null }> {
  const walks: Walk[] = [];
  let skipped = 0;
  let caught: boolean | null = null;
  for (let i = 0; i < angles; i++) {
    const angle = ((i + 0.5) / angles) * Math.PI * 2;
    const face = faceAt(biome, angle);
    const out = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const from = out.clone().multiplyScalar(face - START_IN);
    const gate = pastWall(biome, out.x * face, out.y * face, new THREE.Vector3()).gate;
    if (gate || propInWay(from, out.clone().multiplyScalar(face))) {
      skipped++;
      continue;
    }
    const warned = lab.warnings.length;
    const stopped = await walkOut(lab, angle, from);
    const joints = lab.warnings.slice(warned).map(jointOf);
    const at = G.player.pos.clone();
    const meshes = solidsOf(lab, G.arena.groupOf(biome));
    if (canary && caught === null) {
      at.addScaledVector(new THREE.Vector3(out.x, 0, out.y), -CANARY_SHORT);
      caught = gapAt(at, angle, meshes).gap > MOST_GAP;
      continue;
    }
    walks.push({ degrees: (angle * 180) / Math.PI, stopped, joints, ...gapAt(at, angle, meshes) });
  }
  return { walks, skipped, caught };
}

/** An anatomy warning as a walk's line says it: the joint, how far and when (`hipL.flexion -43 deg, during
 *  moving`). */
function jointOf(warning: string): string {
  const said = /(\w+\.\w+ -?\d+ deg).*?(during \w+)/.exec(warning);
  return said ? `${said[1]} ${said[2]}` : warning;
}

/** What's wrong with where a walk stopped, if anything: air between him and the wall, or his body in it. */
function wrongOf(walk: Walk): string | null {
  const most = walk.leaves ? LEAVES_GIVE : MOST_GAP;
  const least = walk.leaves ? LEAVES_CLEAR - G.player.radius : INTO;
  if (walk.gap > most) return 'air between';
  return walk.gap < least ? 'his body in it' : null;
}

/** A walk as its line says it. */
const walkLine = (walk: Walk): string =>
  `${walk.degrees.toFixed(1)}°: stopped ${walk.stopped.toFixed(2)} m out, ${(walk.gap * 100).toFixed(0)} cm off `
  + `the wall (${walk.against})`;

/** The joints a walk put past their ranges, as its line says them. */
const jointsLine = (walk: Walk): string =>
  `${walk.degrees.toFixed(1)}°: walking out, his joints past their ranges: ${walk.joints.join('; ')}`;

/** `lab wall`: how near the hero walks up to the wall in each biome, at angles round the ring. */
export async function wallGap(lab: Lab, options: WallOptions): Promise<Report> {
  const was = G.arena.biome;
  const lines: string[] = [];
  const problems: string[] = [];
  let caught: boolean | null = null;
  for (const biome of options.biomes ?? [...BIOME_IDS]) {
    if (G.arena.biome !== biome) G.arena.setBiome(biome);
    await lab.setup({});
    const read = await walksIn(lab, biome, options.angles, options.canary && caught === null);
    caught ??= read.caught;
    const gaps = read.walks.map((walk) => walk.gap).sort((a, b) => a - b);
    const cm = (metres: number) => `${(metres * 100).toFixed(0)} cm`;
    const middle = gaps[Math.floor(gaps.length / 2)];
    lines.push(`${biome}: ${read.walks.length} walks out (${read.skipped} skipped: a gate, a prop in the way): stopped `
      + `${cm(gaps[0])} to ${cm(gaps[gaps.length - 1])} off the wall's surface, ${cm(middle)} in the middle`);
    for (const walk of read.walks.filter((one) => wrongOf(one))) {
      lines.push(`  ${walkLine(walk)}`);
      problems.push(`${biome}: ${walkLine(walk)} (${wrongOf(walk)})`);
    }
    for (const walk of read.walks.filter((one) => one.joints.length)) lines.push(`  ${jointsLine(walk)}`);
  }
  if (G.arena.biome !== was) G.arena.setBiome(was);
  if (caught === null) return { text: lines.join('\n'), problems };
  lines.push(`canary: a gap a metre short of his stop ${caught ? 'seen' : 'unseen'}`);
  if (!caught) problems.push('canary: a gap a metre short of the wall went unseen');
  return { text: lines.join('\n'), problems };
}
