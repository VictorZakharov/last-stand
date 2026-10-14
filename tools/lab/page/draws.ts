// `lab draws`: one frame's draw calls, by what drew them (tools/lab). The crowd of foes `crowd` times stands before the
// hero in the biome and view the set-up asks for, and one frame is drawn with each of the renderer's draw calls
// recorded: the pass it was in (the scene's, the shadow map's, the frame's post and overlays), the geometry and the
// material it drew. Three lists: the geometries drawn most often (one drawn many times a frame, a fern or a rock, is
// one an instanced mesh would draw once), the geometries that drew the most triangles (what the GPU's vertices cost),
// and the scene's draws by their material's look (draws of one look, a merge of what doesn't move would make one).
// `--canary` stands seven boxes of one geometry before the hero, which must come out as seven draws of it.
import * as THREE from 'three';
import type { Lab, Fixture, Report } from './lab';
import { G } from '../../../src/state';
import { crowdPlaces, CROWD_FACING, CROWD_SPOT } from './crowd';
import { foesAt } from './death';

export interface DrawsOptions {
  fixture: Fixture;
  /** how many foes stand before the hero (38 by default, the most a wave keeps alive; 0: none) */
  count?: number;
  /** how many rows each list shows */
  rows?: number;
  canary: boolean;
}

/** the frames run before the one recorded: the camera's glide in and the foes' first frames come to rest */
const SETTLE_FRAMES = 30;
const ROWS = 16;
const CANARY_BOXES = 7;

type Pass = 'scene' | 'shadow' | 'other';
const PASSES: Pass[] = ['scene', 'shadow', 'other'];

/** What one geometry cost the frame: its draws in each pass, the triangles each drew, and what drew it. */
interface Drawn {
  draws: Record<Pass, number>;
  triangles: number;
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

/** The triangles a draw of `geometry` (by `object`) drew: its range, times its instances. */
function trianglesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  if (!(object as THREE.Mesh).isMesh) return 0;
  const vertices = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = Math.min(vertices, geometry.drawRange.count);
  const instanced = object as THREE.InstancedMesh;
  const shared = geometry as THREE.InstancedBufferGeometry;
  const instances = instanced.isInstancedMesh ? instanced.count
    : shared.isInstancedBufferGeometry ? shared.instanceCount : 1;
  return Math.floor(range / 3) * instances;
}

/** A material as the lists show it: its type, and its colour (or its name). */
function lookOf(material: THREE.Material): string {
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
      drawn = { draws: { scene: 0, shadow: 0, other: 0 }, triangles: 0, objects: new Set(), material, object };
      record.geometries.set(geometry, drawn);
    }
    drawn.draws[pass]++;
    drawn.triangles = trianglesOf(geometry, object);
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
function placeOf(object: THREE.Object3D): string {
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

/** The lists: the geometries drawn most often, those that drew the most triangles, and the scene's looks. */
function lists(record: FrameDraws, rows: number): string[] {
  const geometries = [...record.geometries.values()];
  const often = [...geometries].sort((a, b) => drawsOf(b) - drawsOf(a)).slice(0, rows).map(geometryRow);
  const heavy = [...geometries].sort((a, b) => trianglesIn(b) - trianglesIn(a)).slice(0, rows).map(geometryRow);
  const looks = [...record.looks].sort((a, b) => b[1].draws - a[1].draws).slice(0, rows)
    .map(([look, { draws, geometries: drew }]) => `  ${String(draws).padStart(4)}  ${look}  (${drew.size} geometries)`);
  return [
    'the geometries drawn most often:', ...often,
    'the geometries that drew the most triangles:', ...heavy,
    'the scene\'s draws by their material\'s look:', ...looks,
  ];
}

/** The frame's draws in each pass, and its triangles in the scene and shadows. */
function totalsOf(record: FrameDraws): string {
  const sum = { scene: 0, shadow: 0, other: 0, triangles: 0 };
  for (const drawn of record.geometries.values()) {
    for (const pass of PASSES) sum[pass] += drawn.draws[pass];
    sum.triangles += trianglesIn(drawn);
  }
  return `${sum.scene} draws in the scene, ${sum.shadow} in its shadow map, ${sum.other} after it; `
    + `${sum.triangles} triangles in the scene and shadows; ${record.geometries.size} geometries`;
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

/** Seven boxes of one geometry stood before the hero (the canary's); returns what takes them away. */
function plantBoxes(): () => void {
  const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const material = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const way = new THREE.Vector3(Math.sin(G.player.facing), 0, Math.cos(G.player.facing));
  const boxes = Array.from({ length: CANARY_BOXES }, (_, i) => {
    const box = new THREE.Mesh(geometry, material);
    box.name = 'canary box';
    box.position.copy(G.player.pos).addScaledVector(way, 2 + i * 0.4).setY(0.5);
    G.scene.add(box);
    return box;
  });
  return () => {
    for (const box of boxes) G.scene.remove(box);
    geometry.dispose();
    material.dispose();
  };
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
  const head = `${G.player.cls.id}, ${foes}, ${G.arena.biome}, ${options.fixture.view ?? 'top'} view: ${totalsOf(record)}`
    + `; ${objectsOf()}`;
  const problems: string[] = [];
  if (options.canary) {
    const boxes = [...record.geometries.values()].find((drawn) => drawn.object.name === 'canary box');
    if (!boxes || boxes.draws.scene !== CANARY_BOXES) {
      problems.push(`the canary's ${CANARY_BOXES} boxes came out as ${boxes?.draws.scene ?? 0} draws of their geometry`);
    }
  }
  return { text: [head, ...lists(record, options.rows ?? ROWS)].join('\n'), problems };
}
