// A broken tree stump, sculpted as a distance field (models/sdf.ts) and meshed with surface nets, as sdf-harness
// sculpts one (github.com/VictorZakharov/sdf-harness, MIT: its tree_stump, a revolved trunk flaring at its foot with
// cone roots blended into it): the trunk flaring into its roots, six of them reaching out and down into the ground,
// its top broken off in splinters, gnarled all over. Its foot and its roots go on under the floor: standing on it,
// its open foot showed the floor through the parallax under it, the roots thin wedges to the ground (#287). Its two
// groups: the wood the break laid bare, then the bark. A cylinder with a jagged rim and six tube roots before. Sculpted
// by a worker while the game loads (`preloadStump`: on the page it took 0.2 s), and here only if that failed.
import * as THREE from 'three';
import { fieldOf, IDENTITY, type Part, type Shape } from '../entities/models/sdf';
import { surfaceNets } from '../entities/models/surfaceNets';
import { valueNoise3 } from '../core/patterns';
import { clamp, mulberry, TAU } from '../util';

/** the stream its splinters and roots are drawn from */
const SEED = 7101;
/** the grid it's meshed on (m: at 4.5 cm it was 11k triangles) */
const CELL = 0.06;
/** the trunk's radius over its foot's flare, the flare's width and how high it reaches (m) */
const TRUNK = 0.5;
const FLARE = 0.24;
const FLARE_UP = 0.2;
/** how far under the floor its foot goes (m): a body standing on the ground goes into it */
const SUNK = 0.25;
/** the break: its lowest (in the middle), and how high its splinters rise at the rim (m) */
const BREAK = 0.78;
const SPLINTERS = 0.42;
/** the splinters round the rim */
const SPLINTER_COUNT = 13;
/** how far the gnarls move the surface (m), and how big they are */
const GNARL = 0.035;
const GNARL_SIZE = 3.2;
/** the roots: how many, their radius where they leave the trunk and at their ends, how far out they reach (m) */
const ROOTS = 6;
const ROOT_FROM = 0.2;
const ROOT_TO = 0.05;
const ROOT_REACH = [1.05, 1.4];
/** how softly the roots join the trunk (m): the buttress between them */
const ROOT_BLEND = 0.16;
/** the wood laid bare: a surface further in than the bark's thickness (m) */
const BARK_THICK = 0.06;
/** the wood's rings a metre out from the middle, and its grain's tiles once round (as `stumpTop` laid them) */
const RINGS = 2.4;
const ROUND = 12;

/** The trunk's radius at height `y`: flaring out at its foot. */
const trunkRadius = (y: number): number => TRUNK + FLARE * Math.exp(-Math.max(0, y) / FLARE_UP);

/** The trunk: a column as wide as `trunkRadius`, gnarled. */
function trunk(salt: number): Shape {
  return {
    distance: (x, y, z) => {
      const gnarl = GNARL * valueNoise3(x * GNARL_SIZE, y * GNARL_SIZE, z * GNARL_SIZE, salt);
      return (Math.hypot(x, z) - trunkRadius(y) + gnarl) * 0.8;
    },
    centre: [0, 0.4, 0],
    radius: 1.2,
  };
}

/** A root from `a` to `b`, its radius `r0` to `r1`, gnarled. */
function root(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, salt: number): Shape {
  const ab = new THREE.Vector3().subVectors(b, a);
  const length2 = ab.lengthSq();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return {
    distance: (x, y, z) => {
      const t = clamp(((x - a.x) * ab.x + (y - a.y) * ab.y + (z - a.z) * ab.z) / length2, 0, 1);
      const off = Math.hypot(x - a.x - ab.x * t, y - a.y - ab.y * t, z - a.z - ab.z * t);
      const gnarl = GNARL * 0.6 * valueNoise3(x * GNARL_SIZE * 1.5, y * GNARL_SIZE * 1.5, z * GNARL_SIZE * 1.5, salt);
      return (off - (r0 + (r1 - r0) * t) + gnarl) * 0.8;
    },
    centre: mid.toArray(),
    radius: Math.sqrt(length2) / 2 + r0,
  };
}

/** Everything over the break (cut away): splinters round the rim, lower in the middle. */
function overBreak(rng: () => number): Shape {
  const heights = Array.from({ length: SPLINTER_COUNT }, () => rng());
  /** the splinters' height round the rim at angle `a`: each sector's own, peaked in its middle */
  const splinter = (a: number): number => {
    const k = ((a / TAU) % 1 + 1) % 1 * SPLINTER_COUNT;
    const i = Math.floor(k), f = k - i;
    const peak = 1 - Math.abs(f - 0.5) * 2;
    return heights[i] ** 2 * peak ** 1.5;
  };
  return {
    distance: (x, y, z) => {
      const out = clamp(Math.hypot(x, z) / TRUNK, 0, 1);
      const top = BREAK + SPLINTERS * splinter(Math.atan2(z, x)) * out * out - 0.12 * (1 - out);
      return (top - y) * 0.5;
    },
    centre: [0, 0, 0],
    radius: Infinity,
  };
}

/** Everything under the floor deeper than its foot goes (cut away). */
const underFoot: Shape = { distance: (_x, y) => y + SUNK, centre: [0, 0, 0], radius: Infinity };

/** the sculpt's parts: the trunk and its roots, then the break and the floor cut away */
function stumpParts(rng: () => number): Part[] {
  const parts: Part[] = [];
  const join = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, bones: [] });
  const cut = (shape: Shape, blend: number) => parts.push({ shape, frame: IDENTITY, blend, cut: true, bones: [] });
  join(trunk(rng() * 100), 0.001);
  for (let i = 0; i < ROOTS; i++) {
    const a = (i / ROOTS) * TAU + (rng() - 0.5) * 0.5;
    const reach = ROOT_REACH[0] + rng() * (ROOT_REACH[1] - ROOT_REACH[0]);
    const from = new THREE.Vector3(Math.cos(a) * TRUNK * 0.6, 0.45, Math.sin(a) * TRUNK * 0.6);
    const to = new THREE.Vector3(Math.cos(a) * reach, -SUNK * 0.6, Math.sin(a) * reach);
    join(root(from, to, ROOT_FROM, ROOT_TO, rng() * 100), ROOT_BLEND);
  }
  cut(overBreak(rng), 0.02);
  cut(underFoot, 0.001);
  return parts;
}

/** Whether a point on the surface is the wood the break laid bare: further in than the bark, above the foot. */
const isWood = (x: number, y: number, z: number): boolean =>
  y > BREAK - 0.2 && Math.hypot(x, z) < trunkRadius(y) - BARK_THICK;

/** A corner's bark uv: once round the trunk across u, its height along v (the roots' grain on out along them). */
function barkUv(x: number, y: number, z: number): [number, number] {
  const out = Math.max(0, Math.hypot(x, z) - trunkRadius(y));
  return [Math.atan2(z, x) / TAU + 0.5, y - out];
}

/** A corner's wood uv: its rings round the middle across u, the grain round it along v. */
const woodUv = (x: number, _y: number, z: number): [number, number] =>
  [Math.hypot(x, z) * RINGS, (Math.atan2(z, x) / TAU + 0.5) * ROUND];

/** The stump's arrays, as a worker posts them: positions, normals and uvs, unindexed, and how many of its corners are
 *  the wood's (its first). */
export interface PackedStump {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  wood: number;
}

/** The stump sculpted afresh (`rng` drawn from for its splinters and roots). */
export function sculptStump(rng: () => number = mulberry(SEED)): PackedStump {
  const box = new THREE.Box3(new THREE.Vector3(-1.7, -SUNK - 0.05, -1.7), new THREE.Vector3(1.7, 1.4, 1.7));
  const net = surfaceNets(fieldOf(stumpParts(rng)), box, CELL);
  const groups: [number[], number[]] = [[], []];
  for (let i = 0; i < net.index.length; i += 3) {
    const [a, b, c] = [net.index[i], net.index[i + 1], net.index[i + 2]];
    const middle = [0, 1, 2].map((axis) => (net.positions[a * 3 + axis] + net.positions[b * 3 + axis]
      + net.positions[c * 3 + axis]) / 3);
    groups[isWood(middle[0], middle[1], middle[2]) ? 0 : 1].push(a, b, c);
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  groups.forEach((corners, group) => {
    for (let i = 0; i < corners.length; i += 3) {
      const tri = [corners[i], corners[i + 1], corners[i + 2]];
      const uv = tri.map((v) => (group ? barkUv : woodUv)(net.positions[v * 3], net.positions[v * 3 + 1],
        net.positions[v * 3 + 2]));
      unwrap(uv, group ? 0 : 1, group ? 1 : ROUND);
      tri.forEach((v, k) => {
        positions.push(net.positions[v * 3], net.positions[v * 3 + 1], net.positions[v * 3 + 2]);
        normals.push(net.normals[v * 3], net.normals[v * 3 + 1], net.normals[v * 3 + 2]);
        uvs.push(...uv[k]);
      });
    }
  });
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    wood: groups[0].length,
  };
}

/** The stump's geometry from its arrays: its wood (group 0), then its bark. */
function geometryOf(stump: PackedStump): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(stump.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(stump.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(stump.uvs, 2));
  g.normalizeNormals();
  g.addGroup(0, stump.wood, 0);
  g.addGroup(stump.wood, stump.positions.length / 3 - stump.wood, 1);
  g.computeBoundingSphere();
  return g;
}

/** the stump a worker sculpted, and the wait for it */
let sculpted: PackedStump | null = null;
let preloaded: Promise<void> = Promise.resolve();

/** The stump sculpted by a worker while the game loads; a worker that fails leaves it to the page. */
export function preloadStump(): void {
  if (typeof Worker === 'undefined') return;
  preloaded = new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./stump.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve();
      return;
    }
    worker.onmessage = (e: MessageEvent<PackedStump>) => {
      sculpted = e.data;
      worker.terminate();
      resolve();
    };
    worker.onerror = () => {
      worker.terminate();
      resolve();
    };
  });
}

/** Waits for the worker's stump (or its failure): before the forest is built. */
export const stumpPreloaded = (): Promise<void> => preloaded;

/** The stump's geometry: the worker's, else sculpted here. */
export const buildStumpGeo = (): THREE.BufferGeometry => geometryOf(sculpted ?? sculptStump());

/** A triangle's uvs made whole across the seam where the turn round the middle starts again (coordinate `axis`,
 *  whose turn is `whole`): the corners short of the rest moved a turn on. */
function unwrap(uv: [number, number][], axis: number, whole: number): void {
  const values = uv.map((corner) => corner[axis]);
  if (Math.max(...values) - Math.min(...values) < whole / 2) return;
  for (const corner of uv) if (corner[axis] < whole / 2) corner[axis] += whole;
}
