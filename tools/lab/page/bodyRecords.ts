// The bodies' share of what a frame hands the engine: the meshes each hero's and each foe's body hands over a frame
// (each a record, or more: a piece that casts from fewer triangles writes one for its shadow too), by kind, against
// the frame's whole count. Drawn piece by piece, every piece is walked, written and its material asked after each
// frame: from play, a party of four at wave 36 sent 2,668 draws on a laptop whose CPU took 25 ms a frame. A foe is
// drawn as one now (`entities/models/bodyAsOne.ts`, a mesh a material), `--tune bodyAsOne.on=0` piece by piece.
import { Material, Mesh, Node } from './sceneApi.ts';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';

/** One kind of body's count: how many bodies, and the meshes and the materials they handed over between them. */
interface KindCount {
  bodies: number;
  meshes: number;
  materials: Set<Material>;
}

/** What one drawn frame handed the engine, the bodies' share by kind. */
export interface BodyCensus {
  kinds: Map<string, KindCount>;
  /** the meshes handed over that are no body's */
  rest: number;
  /** the frame's records and draws (the scene's), and its walk's objects */
  records: number;
  draws: number;
  objects: number;
  /** the materials the frame asked whether they changed, and described again, by look (`Materials.counted`) */
  looked: Map<string, number>;
  described: Map<string, number>;
}

/** How many a count holds in all, then each name's, the most first. */
function countWords(counts: Map<string, number>): string {
  let all = 0;
  for (const count of counts.values()) all += count;
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const each = sorted.map(([name, count]) => `${name} ${count}`);
  return each.length ? `${all} (${each.join(', ')})` : '0';
}

/** Each body's root in the scene with its kind's name: every hero's and every standing foe's. */
function bodyRoots(): Map<Node, string> {
  const roots = new Map<Node, string>();
  for (const player of G.players) roots.set(player.obj, `hero (${player.cls.id})`);
  for (const foe of G.enemies) {
    if (foe.alive) roots.set(foe.model.root, foe.type);
  }
  return roots;
}

/** The body `object` is part of, by walking up to a root, or none: a body drawn as one names its own
 *  (`userData.bodyOf`, `entities/models/bodyAsOne.ts`). */
function bodyOf(object: Node, roots: Map<Node, string>): Node | null {
  const drawnFor = object.userData.bodyOf as Node | undefined;
  if (drawnFor && roots.has(drawnFor)) return drawnFor;
  for (let at: Node | null = object; at; at = at.parent) {
    if (roots.has(at)) return at;
  }
  return null;
}

/** The materials a mesh draws with. */
function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** One frame drawn with the engine watching what it's handed, counted by body. */
export async function bodyCensus(lab: Lab): Promise<BodyCensus> {
  const bridge = RUST.bridge;
  if (!bridge) throw new Error('lab: no engine to count what it is handed');
  const watched = new Set<Node>();
  const drawing = lab.drawing;
  bridge.watched = watched;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    bridge.watched = null;
    lab.drawing = drawing;
  }
  const roots = bodyRoots();
  const kinds = new Map<string, KindCount>();
  const bodiesSeen = new Set<Node>();
  let rest = 0;
  for (const object of watched) {
    const body = bodyOf(object, roots);
    if (!body) {
      rest++;
      continue;
    }
    const name = roots.get(body)!;
    let count = kinds.get(name);
    if (!count) {
      count = { bodies: 0, meshes: 0, materials: new Set() };
      kinds.set(name, count);
    }
    if (!bodiesSeen.has(body)) {
      bodiesSeen.add(body);
      count.bodies++;
    }
    count.meshes++;
    for (const material of materialsOf(object as Mesh)) count.materials.add(material);
  }
  const stats = bridge.stats;
  // (a commit before the count has none: an A/B's other side)
  const counted = (bridge as { materialsLooked?: { looked: Map<string, number>; described: Map<string, number> } })
    .materialsLooked;
  const looked = counted?.looked ?? new Map<string, number>();
  const described = counted?.described ?? new Map<string, number>();
  return {
    kinds, rest, records: stats.records, draws: stats.draws, objects: stats.objects,
    looked: new Map(looked), described: new Map(described),
  };
}

/** The census as a report's lines: the frame's counts, then each kind's, the most meshes first. */
export function censusLines(census: BodyCensus): string[] {
  const lines = [
    `handed to the engine in one frame: ${census.records} records, ${census.draws} draws, `
      + `${census.objects} objects walked; ${census.rest} meshes no body's`,
    `  its materials asked whether they changed: ${countWords(census.looked)}`,
    `  described again: ${countWords(census.described)}`,
  ];
  const sorted = [...census.kinds].sort((a, b) => b[1].meshes - a[1].meshes);
  for (const [name, count] of sorted) {
    const each = (count.meshes / count.bodies).toFixed(0);
    const materials = (count.materials.size / count.bodies).toFixed(0);
    lines.push(`  ${name}: ${count.bodies} bodies, ${count.meshes} meshes (${each} a body, ${materials} materials a body)`);
  }
  return lines;
}
