// `lab draws`: one frame's draw calls, by what drew them (tools/lab). The crowd of foes `crowd` times stands before the
// hero in the biome and view the set-up asks for, and one frame is drawn with each of the renderer's draw calls
// recorded: the pass it was in (the scene's, the shadow map's, the frame's post and overlays), the geometry and the
// material it drew. Its lists: the geometries drawn most often (one drawn many times a frame, a fern or a rock, is
// one an instanced mesh would draw once), the geometries that drew the most triangles (what the GPU's vertices cost),
// and the scene's draws by their material's look (draws of one look, a merge of what doesn't move would make one).
// And the triangles drawn for nothing: an instanced mesh's instances outside the view of the pass that drew them (the
// camera's, or the shadow map's box), as three.js culls an instanced mesh only whole, by the sphere round all of it.
// And the draws that drew nothing: an instanced mesh of no instances, a geometry of nothing in its range, each the
// renderer's work for a draw on the CPU. `--canary` stands seven boxes of one geometry before the hero, which must
// come out as seven draws of it, seven instanced boxes, four of them far behind the camera, which must come out as
// four drawn outside the view, and an instanced mesh of none, which must come out as a draw of nothing.
import * as THREE from 'three';
import type { Lab, Fixture, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import { G } from '../../../src/state';
import { crowdPlaces, CROWD_FACING, CROWD_SPOT } from './crowd';
import { foesAt } from './death';

export interface DrawsOptions {
  fixture: Fixture;
  /** how many foes stand before the hero (38 by default, the most a wave keeps alive; 0: none) */
  count?: number;
  /** how many rows each list shows */
  rows?: number;
  /** the biome (as the page has it when not given) */
  biome?: BiomeId;
  canary: boolean;
}

/** the frames run before the one recorded: the camera's glide in and the foes' first frames come to rest */
const SETTLE_FRAMES = 30;
const ROWS = 16;
const CANARY_BOXES = 7;
/** the canary's instanced boxes put far behind the camera, and how far (m) */
const CANARY_OFF = 4;
const CANARY_AWAY = 500;

type Pass = 'scene' | 'shadow' | 'other';
const PASSES: Pass[] = ['scene', 'shadow', 'other'];

/** What one geometry cost the frame: its draws in each pass, the vertices and triangles each drew, those of them
 *  outside the view of the pass that drew them, in each pass, and what drew it. */
interface Drawn {
  geometry: THREE.BufferGeometry;
  draws: Record<Pass, number>;
  vertices: number;
  triangles: number;
  off: Record<Pass, number>;
  objects: Set<THREE.Object3D>;
  material: THREE.Material;
  object: THREE.Object3D;
}

/** The scene's draws of one material's look, and the geometries they drew. */
interface Look {
  draws: number;
  geometries: Set<THREE.BufferGeometry>;
}

/** One frame's draws: by geometry, and the scene's by look. */
interface FrameDraws {
  geometries: Map<THREE.BufferGeometry, Drawn>;
  looks: Map<string, Look>;
}

/** The vertices a draw of `geometry` (by `object`) ran: its range, times its instances. */
function verticesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  const vertices = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = Math.min(vertices, geometry.drawRange.count);
  const instanced = object as THREE.InstancedMesh;
  const shared = geometry as THREE.InstancedBufferGeometry;
  const instances = instanced.isInstancedMesh ? instanced.count
    : shared.isInstancedBufferGeometry ? shared.instanceCount : 1;
  return range * instances;
}

/** The triangles a draw of `geometry` (by `object`) drew: none but a mesh's (a point or a line is none). */
function trianglesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  if (!(object as THREE.Mesh).isMesh) return 0;
  return Math.floor(verticesOf(geometry, object) / 3);
}

const _frustum = new THREE.Frustum();
const _viewing = new THREE.Matrix4();
const _instance = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/** How many of `object`'s instances of `geometry` lie outside `camera`'s view, each by its own bounding sphere: drawn
 *  for nothing. None for an object that isn't an instanced mesh. */
function instancesOff(object: THREE.Object3D, geometry: THREE.BufferGeometry, camera: THREE.Camera): number {
  const instanced = object as THREE.InstancedMesh;
  if (!instanced.isInstancedMesh) return 0;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  _frustum.setFromProjectionMatrix(_viewing.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let off = 0;
  for (let i = 0; i < instanced.count; i++) {
    instanced.getMatrixAt(i, _instance);
    _instance.premultiply(instanced.matrixWorld);
    _sphere.copy(geometry.boundingSphere!).applyMatrix4(_instance);
    if (!_frustum.intersectsSphere(_sphere)) off++;
  }
  return off;
}

/** A material as the lists show it: its type, and its colour (or its name). */
export function lookOf(material: THREE.Material): string {
  const colour = (material as THREE.MeshStandardMaterial).color;
  const look = material.name || (colour ? `#${colour.getHexString()}` : '');
  return `${material.type.replace(/Material$/, '')}${look ? ` ${look}` : ''}`;
}

/** Records every draw call until `stop()`: what was drawn, and the record. */
function recordDraws(): { record: FrameDraws; stop(): void } {
  const gl = G.renderer;
  const own = gl.renderBufferDirect.bind(gl);
  const record: FrameDraws = { geometries: new Map(), looks: new Map() };
  gl.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    const pass: Pass = scene === G.scene ? 'scene' : scene === null ? 'shadow' : 'other';
    let drawn = record.geometries.get(geometry);
    if (!drawn) {
      const none = { scene: 0, shadow: 0, other: 0 };
      drawn = { geometry, draws: { ...none }, vertices: 0, triangles: 0, off: { ...none }, objects: new Set(), material,
        object };
      record.geometries.set(geometry, drawn);
    }
    drawn.draws[pass]++;
    drawn.vertices = verticesOf(geometry, object);
    drawn.triangles = trianglesOf(geometry, object);
    const instances = (object as THREE.InstancedMesh).count;
    if (instances) drawn.off[pass] += (instancesOff(object, geometry, camera) * drawn.triangles) / instances;
    drawn.objects.add(object);
    if (pass === 'scene') {
      drawn.material = material;
      const key = lookOf(material);
      const look = record.looks.get(key) ?? { draws: 0, geometries: new Set() };
      look.draws++;
      look.geometries.add(geometry);
      record.looks.set(key, look);
    }
    own(camera, scene, geometry, material, object, group);
  };
  return { record, stop: () => { gl.renderBufferDirect = own; } };
}

/** An object's place in the scene as names (or types), from the scene down: `crowd mossback`, `forest > Group`. */
export function placeOf(object: THREE.Object3D): string {
  const path: string[] = [];
  for (let at: THREE.Object3D | null = object; at && at !== G.scene; at = at.parent) {
    path.unshift(at.name || at.type);
  }
  return path.slice(0, 2).join(' > ') + (path.length > 2 ? ' > …' : '');
}

/** A geometry's draws in all its passes. */
const drawsOf = (drawn: Drawn): number => drawn.draws.scene + drawn.draws.shadow + drawn.draws.other;
/** The triangles a geometry drew in the frame, in the scene and its shadows. */
const trianglesIn = (drawn: Drawn): number => drawn.triangles * (drawn.draws.scene + drawn.draws.shadow);

/** A geometry's row: its draws (and each pass's), the triangles, its material, and what drew it. */
function geometryRow(drawn: Drawn): string {
  const passes = PASSES.filter((pass) => drawn.draws[pass]).map((pass) => `${drawn.draws[pass]} ${pass}`).join(', ');
  const objects = drawn.objects.size > 1 ? `, ${drawn.objects.size} objects` : '';
  return `  ${String(drawsOf(drawn)).padStart(4)} (${passes})  ${trianglesIn(drawn)} triangles (${drawn.triangles} `
    + `each)  ${lookOf(drawn.material)}  ${drawn.object.type} in ${placeOf(drawn.object)}${objects}`;
}

/** The triangles a geometry drew outside the view of the pass that drew them, in the scene and its shadows. */
const offIn = (drawn: Drawn): number => Math.round(drawn.off.scene + drawn.off.shadow);

/** A geometry's row of what it drew outside the view: in the scene and in the shadow map, of all it drew in each. */
function offRow(drawn: Drawn): string {
  const of = (pass: Pass) => `${Math.round(drawn.off[pass])} of ${drawn.triangles * drawn.draws[pass]} in the ${pass}`;
  return `  ${String(offIn(drawn)).padStart(7)} (${of('scene')}, ${of('shadow')})  ${lookOf(drawn.material)}  `
    + `${drawn.object.type} in ${placeOf(drawn.object)}`;
}

/** Whether a geometry's draws drew nothing in the scene or its shadows (a draw after them, a full-screen pass's, is
 *  one triangle). */
const drewNothing = (drawn: Drawn): boolean => drawn.vertices === 0 && drawn.draws.scene + drawn.draws.shadow > 0;

/** Why a draw of `drawn` drew nothing: an instanced mesh holding no instance, or its geometry's range empty. */
function nothingWhy(drawn: Drawn): string {
  const instanced = drawn.object as THREE.InstancedMesh;
  const shared = drawn.geometry as THREE.InstancedBufferGeometry;
  const empty = instanced.isInstancedMesh ? instanced.count === 0
    : shared.isInstancedBufferGeometry && shared.instanceCount === 0;
  return `${drawn.geometry.type}, ${empty ? 'no instances' : 'nothing in its range'}`;
}

/** The draws that drew nothing, alike ones together: their draws (each pass's), how many geometries, why, the
 *  material and what drew them. */
function nothingRows(geometries: Drawn[], rows: number): string[] {
  const alike = new Map<string, { draws: Record<Pass, number>; geometries: number }>();
  for (const drawn of geometries.filter(drewNothing)) {
    const key = `${nothingWhy(drawn)}  ${lookOf(drawn.material)}  ${drawn.object.type} in ${placeOf(drawn.object)}`;
    const sum = alike.get(key) ?? { draws: { scene: 0, shadow: 0, other: 0 }, geometries: 0 };
    for (const pass of PASSES) sum.draws[pass] += drawn.draws[pass];
    sum.geometries++;
    alike.set(key, sum);
  }
  const draws = (sum: { draws: Record<Pass, number> }) => sum.draws.scene + sum.draws.shadow + sum.draws.other;
  return [...alike].sort((a, b) => draws(b[1]) - draws(a[1])).slice(0, rows).map(([key, sum]) => {
    const passes = PASSES.filter((pass) => sum.draws[pass]).map((pass) => `${sum.draws[pass]} ${pass}`).join(', ');
    return `  ${String(draws(sum)).padStart(4)} (${passes}), ${sum.geometries} geometries  ${key}`;
  });
}

/** The lists: the geometries drawn most often, those that drew the most triangles, those that drew the most outside
 *  the view, the draws that drew nothing, and the scene's looks. */
function lists(record: FrameDraws, rows: number): string[] {
  const geometries = [...record.geometries.values()];
  const often = [...geometries].sort((a, b) => drawsOf(b) - drawsOf(a)).slice(0, rows).map(geometryRow);
  const heavy = [...geometries].sort((a, b) => trianglesIn(b) - trianglesIn(a)).slice(0, rows).map(geometryRow);
  const unseen = geometries.filter((drawn) => offIn(drawn) > 0).sort((a, b) => offIn(b) - offIn(a)).slice(0, rows)
    .map(offRow);
  const looks = [...record.looks].sort((a, b) => b[1].draws - a[1].draws).slice(0, rows)
    .map(([look, { draws, geometries: drew }]) => `  ${String(draws).padStart(4)}  ${look}  (${drew.size} geometries)`);
  return [
    'the geometries drawn most often:', ...often,
    'the geometries that drew the most triangles:', ...heavy,
    'the geometries that drew the most triangles outside the view (an instanced mesh\'s instances beyond the camera '
      + 'of the pass that drew them, the scene\'s or the shadow map\'s):', ...unseen,
    'the draws that drew nothing (the renderer\'s work for a draw each, on the CPU: an instanced mesh of none never '
      + 'reaches the GPU, and the perf overlay counts no draw of it), alike ones together:',
    ...nothingRows(geometries, rows),
    'the scene\'s draws by their material\'s look:', ...looks,
  ];
}

/** The frame's draws in each pass, those that drew nothing, and its triangles in the scene and shadows, and of them
 *  outside the view. */
function totalsOf(record: FrameDraws): string {
  const sum = { scene: 0, shadow: 0, other: 0, nothing: 0, triangles: 0, off: 0 };
  for (const drawn of record.geometries.values()) {
    for (const pass of PASSES) sum[pass] += drawn.draws[pass];
    if (drewNothing(drawn)) sum.nothing += drawsOf(drawn);
    sum.triangles += trianglesIn(drawn);
    sum.off += offIn(drawn);
  }
  return `${sum.scene} draws in the scene, ${sum.shadow} in its shadow map, ${sum.other} after it, ${sum.nothing} `
    + `of them of nothing; ${sum.triangles} triangles in the scene and shadows, ${sum.off} of them outside the view; `
    + `${record.geometries.size} geometries`;
}

/** The scene's objects as the frame updates their matrices: all of them, those whose own matrix is made again each
 *  frame, and of those the ones off the camera's layer (a crowd's bodies' own meshes, models/crowd.ts: only what reads
 *  them needs them). */
function objectsOf(): string {
  let all = 0, auto = 0, hidden = 0;
  G.scene.traverse((object) => {
    all++;
    if (!object.matrixAutoUpdate) return;
    auto++;
    if (!object.layers.isEnabled(0)) hidden++;
  });
  return `${all} objects in the scene, ${auto} made again each frame (${hidden} of them off the camera's layer)`;
}

/** Seven boxes of one geometry stood before the hero, and seven instanced boxes of another, `CANARY_OFF` of them far
 *  behind the camera (the canary's); returns what takes them away. */
function plantBoxes(): () => void {
  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const instancedGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  const ahead = (i: number) => G.player.pos.clone().addScaledVector(way, 2 + i * 0.4).setY(0.5);
  const boxes = Array.from({ length: CANARY_BOXES }, (_, i) => {
    const box = new THREE.Mesh(geometry, material);
    box.name = 'canary box';
    box.position.copy(ahead(i));
    G.scene.add(box);
    return box;
  });
  const instanced = new THREE.InstancedMesh(instancedGeometry, material, CANARY_BOXES);
  instanced.name = 'canary instances';
  const behind = G.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-CANARY_AWAY).add(G.camera.position);
  for (let i = 0; i < CANARY_BOXES; i++) {
    const at = i < CANARY_OFF ? behind : ahead(i).setY(0.9);
    instanced.setMatrixAt(i, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
  }
  G.scene.add(instanced);
  // (drawn though it holds none: three culls an instanced mesh of none by its empty sphere)
  const emptyGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const empty = new THREE.InstancedMesh(emptyGeometry, material, 1);
  empty.name = 'canary of nothing';
  empty.count = 0;
  empty.frustumCulled = false;
  G.scene.add(empty);
  return () => {
    for (const box of boxes) G.scene.remove(box);
    G.scene.remove(instanced, empty);
    geometry.dispose();
    instancedGeometry.dispose();
    emptyGeometry.dispose();
    material.dispose();
  };
}

/** The canary's problems: its boxes not seven draws of their geometry, its instanced boxes behind the camera not read
 *  as drawn outside the view. */
function canaryProblems(record: FrameDraws): string[] {
  const problems: string[] = [];
  const geometries = [...record.geometries.values()];
  const boxes = geometries.find((drawn) => drawn.object.name === 'canary box');
  if (!boxes || boxes.draws.scene !== CANARY_BOXES) {
    problems.push(`the canary's ${CANARY_BOXES} boxes came out as ${boxes?.draws.scene ?? 0} draws of their geometry`);
  }
  const instanced = geometries.find((drawn) => drawn.object.name === 'canary instances');
  const perBox = instanced ? instanced.triangles / CANARY_BOXES : 0;
  const offScene = instanced && perBox ? Math.round(instanced.off.scene / perBox) : 0;
  if (offScene !== CANARY_OFF) {
    problems.push(`the canary's ${CANARY_OFF} instanced boxes behind the camera came out as ${offScene} outside `
      + 'the view');
  }
  const empty = geometries.find((drawn) => drawn.object.name === 'canary of nothing');
  if (!empty || !drewNothing(empty) || !nothingWhy(empty).endsWith('no instances')) {
    problems.push('the canary\'s instanced mesh of no instances didn\'t come out as a draw of nothing');
  }
  return problems;
}

/** One frame drawn with its draw calls recorded, after the set-up's frames have settled. */
async function recordedFrame(lab: Lab): Promise<FrameDraws> {
  // (the frames drawn: the lab skips the draws of a command that reads none)
  lab.drawing = true;
  try {
    await lab.step(SETTLE_FRAMES);
    const recording = recordDraws();
    try {
      await lab.step(1);
    } finally {
      recording.stop();
    }
    return recording.record;
  } finally {
    lab.drawing = false;
  }
}

export async function draws(lab: Lab, options: DrawsOptions): Promise<Report> {
  const count = options.count ?? 38;
  if (options.biome && G.arena.biome !== options.biome) G.arena.setBiome(options.biome);
  G.arena.restoreProps();
  const facing = options.fixture.facing ?? (CROWD_FACING * Math.PI) / 180;
  await lab.setup({ ...options.fixture, at: options.fixture.at ?? CROWD_SPOT, facing });
  if (count > 0) await foesAt(lab, crowdPlaces(count, G.player.pos, G.player.facing), Array(count).fill(1));
  const unplant = options.canary ? plantBoxes() : () => {};
  let record: FrameDraws;
  try {
    record = await recordedFrame(lab);
  } finally {
    unplant();
  }
  const foes = `${count} ${count === 1 ? 'foe' : 'foes'}`;
  const view = options.fixture.view ?? 'top';
  const head = `${G.player.cls.id}, ${foes}, ${G.arena.biome}, ${view} view: ${totalsOf(record)}; ${objectsOf()}`;
  const problems = options.canary ? canaryProblems(record) : [];
  return { text: [head, ...lists(record, options.rows ?? ROWS)].join('\n'), problems };
}
