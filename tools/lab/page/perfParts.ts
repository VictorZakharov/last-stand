// tools/lab perf --parts: what the frame's biggest parts take of the GPU, drawn and hidden in turns (`flameCost` in
// fireCost.ts: the machine's load drifts, and two runs apart read two loads): the draws with the most triangles, those
// spread widest (a ground of few triangles fills the screen), and the meadow and the fountain each whole. From play,
// "low fps at night": the GPU at 12 ms of the frame, the phases' lines telling only scene and shadow. Its canary times
// the meadow drawn four times over, which must read as more than it does once. The hero is first turned all round: the
// report's GPU was 12 ms one way and 6 another, so the parts are timed turned the dearest way.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { canaryCost, flameCost, medianOf, timedRenders, timerOf } from './fireCost';
import type { Lab } from './lab';

/** how many of the draws with the most triangles are timed, and how many of those spread widest */
const BY_TRIANGLES = 6;
const BY_REACH = 6;
/** the groups timed whole */
const WHOLE = ['meadow', 'fountain'];

/** the ways he's turned (a turn's share each), the frames he's given to settle, and the renders timed each way */
const TURNS = 8;
const SETTLE = 20;
const TURN_RENDERS = 16;

/** The hero turned each way, the GPU's time of the frame (ms) that way; left turned the dearest. */
async function dearestWay(lab: Lab, lines: string[]): Promise<void> {
  const timer = timerOf(G.renderer);
  if (!timer) return;
  let dearest = 0;
  let most = -Infinity;
  const read: string[] = [];
  const turnTo = async (turn: number): Promise<void> => {
    const facing = (turn / TURNS) * Math.PI * 2;
    G.player.facing = facing;
    renderer.faceCamera(facing);
    await lab.step(SETTLE);
  };
  for (let turn = 0; turn < TURNS; turn++) {
    await turnTo(turn);
    const took = medianOf(await timedRenders(timer, () => renderer.render(), TURN_RENDERS));
    read.push(`${((turn * 360) / TURNS).toFixed(0)}: ${took.toFixed(1)}`);
    if (took > most) {
      most = took;
      dearest = turn;
    }
  }
  lines.push(`the GPU's frame turned each way (degrees: ms): ${read.join(', ')}`);
  await turnTo(dearest);
}

/** What's timed: its name and the meshes hidden together. */
interface Part {
  name: string;
  meshes: THREE.Mesh[];
}

/** How many triangles `mesh` draws, every instance counted. */
function trianglesOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
  const corners = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const instanced = mesh as THREE.InstancedMesh;
  const instances = instanced.isInstancedMesh ? instanced.count : geometry.instanceCount ?? 1;
  return (corners / 3) * (Number.isFinite(instances) ? instances : 1);
}

/** How far `mesh` spreads (m): its bounding sphere's radius. */
function reachOf(mesh: THREE.Mesh): number {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  return mesh.geometry.boundingSphere?.radius ?? 0;
}

/** A mesh's name: its own or its parent's, and what it's drawn in. */
function nameOf(mesh: THREE.Mesh): string {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const colour = material.color ? `#${material.color.getHexString()}` : '';
  const name = mesh.name || mesh.parent?.name || 'unnamed';
  const thousands = (trianglesOf(mesh) / 1000).toFixed(0);
  return `${name} (${thousands}k, ${reachOf(mesh).toFixed(0)} m, ${material.type} ${colour})`;
}

/** Whether `mesh` stands under the group called `name`. */
function under(mesh: THREE.Object3D, name: string): boolean {
  for (let at: THREE.Object3D | null = mesh; at; at = at.parent) {
    if (at.name === name) return true;
  }
  return false;
}

/** a mesh's reach from which it's taken for the sky's dome (m), left drawn with all else hidden */
const SKY = 200;

/** The meshes shown that hold nothing under them. */
function shownMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.children.length === 0) meshes.push(mesh);
  });
  return meshes;
}

/** What's timed: the meshes shown alone, as hiding what holds a light would compile every lit program again. */
function partsShown(): Part[] {
  const meshes = shownMeshes();
  const whole = WHOLE.map((name) => ({ name, meshes: meshes.filter((mesh) => under(mesh, name)) }));
  const rest = meshes.filter((mesh) => !WHOLE.some((name) => under(mesh, name)));
  const top = (score: (mesh: THREE.Mesh) => number, count: number): THREE.Mesh[] => [...rest]
    .sort((a, b) => score(b) - score(a))
    .slice(0, count);
  const singles = new Set([...top(trianglesOf, BY_TRIANGLES), ...top(reachOf, BY_REACH)]);
  return [...whole, ...[...singles].map((mesh) => ({ name: nameOf(mesh), meshes: [mesh] }))];
}

/** Each part's time on the GPU as it's drawn and hidden, and its canary's problems. */
export async function partCosts(lab: Lab, canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  const draw = (): void => renderer.render();
  const lines: string[] = [];
  await dearestWay(lab, lines);
  lines.push('what the biggest parts take of the GPU that way (the frame drawn with each, and without):');
  const problems: string[] = [];
  const parts = partsShown();
  const allButSky = shownMeshes().filter((mesh) => reachOf(mesh) < SKY);
  const everything: Part = { name: 'everything but the sky', meshes: allButSky };
  for (const { name, meshes } of [everything, ...parts]) {
    const cost = await flameCost(G.renderer, meshes, draw);
    if (!cost) {
      lines.push(`  ${name}: untimed (the browser has no timer)`);
      continue;
    }
    const took = (cost.shown - cost.hidden).toFixed(2);
    lines.push(`  ${took} ms: ${name}, the frame ${cost.shown.toFixed(2)} with it, ${cost.hidden.toFixed(2)} without`);
  }
  if (canary) {
    const { meshes } = parts[0];
    const once = await flameCost(G.renderer, meshes, draw);
    const over = await canaryCost(G.renderer, meshes, draw);
    if (once && over !== null) {
      const single = once.shown - once.hidden;
      lines.push(`  canary: ${parts[0].name} once ${single.toFixed(2)} ms, four times over ${over.toFixed(2)}`);
      if (over <= single) problems.push(`canary missed: drawn four times over it read ${over.toFixed(2)} ms`);
    }
  }
  return { lines, problems };
}
