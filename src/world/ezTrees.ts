// The Thornwood's trees from ez-tree (procedural branching trees, MIT: github.com/dgreenheck/ez-tree), its geometry
// only: our own bark and leaf materials go on it (its pictures never ship, see vite.config.ts). Each kind is grown once
// at boot from a preset with its detail capped (a preset's whole tree was 4k to 24k triangles, and 120 of them stand
// round the clearing), its many small leaves made fewer, bigger cards carrying a cluster of leaves each, and scaled to
// a height of 1 with its foot at the origin, for instancing.
import * as THREE from 'three';
import { Tree, TreePreset } from 'ez-tree';

/** a tree kind: its two geometries, the bark's and the leaves', 1 high, foot at the origin */
export interface TreeKind {
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  /** its trunk alone, the bark's first branch: what an arrow meets (`world/wall.ts`; its limbs are let go) */
  trunk: THREE.BufferGeometry;
  /** how far it reaches from the trunk, over its height, in each of REACH_BANDS bands of height from its foot */
  reach: number[];
}
export const REACH_BANDS = 10;

type Preset = keyof typeof TreePreset;
export interface Grow {
  preset: Preset;
  seed: number;
  /** most sections (along) and segments (round) a branch has, per level from the trunk */
  sections: number[];
  segments: number[];
  /** leaves a branch carries against the preset's, each as much bigger as keeps the crown as full */
  leaves: number;
  /** leaf cards a size this much more again (a cluster of leaves on each) */
  leafSize?: number;
  /** fewer levels of branching than the preset's (its finest twigs were most of a tree's triangles) */
  levels?: number;
  /** a trunk this much longer, its limbs as long as they were, starting `crownStart` of the way up it (0 to 1): a
   *  giant's tall bare bole under its crown (a later start alone moved its crown only a little: its limbs grow up) */
  trunk?: number;
  crownStart?: number;
  /** a trunk this much thicker (longer, it stood as a pole) */
  girth?: number;
}

/** Grows one kind (deterministic: ez-tree's own generator, seeded). */
/** a branch as ez-tree grows it among the bark's vertices: its first, how many rings it has, how many vertices each
 *  (its segments and the first again, at u = 1) */
interface Rings { from: number; rings: number; round: number }

/**
 * The bark's v laid down each branch by its girth: a tile as long as the branch is round where it is, its u one tile
 * round it as ez-tree lays it. A map repeated as often both ways then has square tiles everywhere, a branch's as wide
 * as it is round over the repeat. (ez-tree lays one tile up each section, there and back: on a trunk 2.2 m round,
 * 1.3 m up and every other one mirrored, and round a thin branch streaks five times as long as wide: `lab tiles`.)
 * Left as it is where the rings don't add up to the bark's vertices (an ez-tree laid out otherwise).
 */
function barkAlongByGirth(bark: THREE.BufferGeometry, branches: Rings[]): void {
  const p = bark.attributes.position, uv = bark.attributes.uv;
  if (branches.reduce((n, b) => n + b.rings * b.round, 0) !== p.count) return;
  const centre = new THREE.Vector3(), last = new THREE.Vector3(), at = new THREE.Vector3();
  for (const { from, rings, round } of branches) {
    let v = 0, lastGirth = 0;
    for (let i = 0; i < rings; i++) {
      const first = from + i * round, n = round - 1;
      centre.set(0, 0, 0);
      for (let j = 0; j < n; j++) centre.add(at.fromBufferAttribute(p, first + j));
      centre.divideScalar(n);
      let radius = 0;
      for (let j = 0; j < n; j++) radius += at.fromBufferAttribute(p, first + j).distanceTo(centre) / n;
      const girth = 2 * Math.PI * radius;
      // (by the wider of a section's two rings: a branch's last one closes to a point)
      if (i > 0) v += centre.distanceTo(last) / Math.max(girth, lastGirth);
      for (let j = 0; j < round; j++) uv.setY(first + j, v);
      last.copy(centre);
      lastGirth = girth;
    }
  }
  uv.needsUpdate = true;
}

/** The bark's triangles on `trunk`'s rings alone, as a geometry of its own (positions only). */
function trunkOf(bark: THREE.BufferGeometry, trunk: Rings): THREE.BufferGeometry {
  const end = trunk.from + trunk.rings * trunk.round;
  const index = bark.index!.array, kept: number[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const corners = [index[i], index[i + 1], index[i + 2]];
    if (corners.every((c) => c >= trunk.from && c < end)) kept.push(...corners.map((c) => c - trunk.from));
  }
  const positions = bark.attributes.position.array.slice(trunk.from * 3, end * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(kept);
  geo.computeBoundingSphere();
  return geo;
}

export function growTree(g: Grow): TreeKind {
  const json = structuredClone(TreePreset[g.preset]) as unknown as {
    seed: number;
    branch: { levels: number; sections: Record<string, number>; segments: Record<string, number> };
    leaves: { count: number; size: number; billboard: string };
    bark: { textured: boolean };
  };
  json.seed = g.seed;
  json.bark.textured = false;
  if (g.levels !== undefined) json.branch.levels = Math.min(json.branch.levels, g.levels);
  const br = json.branch as unknown as { start: Record<string, number>; length: Record<string, number>; radius: Record<string, number> };
  if (g.trunk !== undefined) br.length['0'] *= g.trunk;
  if (g.girth !== undefined) br.radius['0'] *= g.girth;
  if (g.crownStart !== undefined) br.start['1'] = g.crownStart;
  for (let l = 0; l <= json.branch.levels; l++) {
    const k = String(l);
    json.branch.sections[k] = Math.min(json.branch.sections[k], g.sections[Math.min(l, g.sections.length - 1)]);
    json.branch.segments[k] = Math.max(3, Math.min(json.branch.segments[k], g.segments[Math.min(l, g.segments.length - 1)]));
  }
  json.leaves.count = Math.max(1, Math.round(json.leaves.count * g.leaves));
  json.leaves.size *= (g.leafSize ?? 1) / Math.sqrt(g.leaves);
  const tree = new Tree();
  const branches: Rings[] = [];
  const grow = tree.generateBranch.bind(tree);
  tree.generateBranch = (branch) => {
    const from = tree.branches.verts.length / 3;
    grow(branch);
    branches.push({ from, rings: branch.sectionCount + 1, round: branch.segmentCount + 1 });
  };
  tree.loadFromJson(json as never);
  const bark = tree.branchesMesh.geometry, leaves = tree.leavesMesh.geometry;
  barkAlongByGirth(bark, branches);
  for (const m of [tree.branchesMesh.material, tree.leavesMesh.material]) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  const box = new THREE.Box3().setFromBufferAttribute(bark.attributes.position as THREE.BufferAttribute).union(new THREE.Box3().setFromBufferAttribute(leaves.attributes.position as THREE.BufferAttribute));
  const h = box.max.y - box.min.y, s = 1 / h;
  for (const geo of [bark, leaves]) { geo.scale(s, s, s); geo.computeBoundingSphere(); geo.computeBoundingBox(); }
  const reach = new Array<number>(REACH_BANDS).fill(0);
  for (const geo of [bark, leaves]) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const b = Math.min(REACH_BANDS - 1, Math.max(0, Math.floor(p.getY(i) * REACH_BANDS)));
      reach[b] = Math.max(reach[b], Math.hypot(p.getX(i), p.getZ(i)));
    }
  }
  return { bark, leaves, trunk: trunkOf(bark, branches[0]), reach };
}
