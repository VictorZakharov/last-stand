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
  tree.loadFromJson(json as never);
  const bark = tree.branchesMesh.geometry, leaves = tree.leavesMesh.geometry;
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
  return { bark, leaves, reach };
}
