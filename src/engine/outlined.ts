// An outline round what the page names (Quarry Mark's foe, the seat E would sit on: ui/overlay/outline.ts) drawn by
// the engine (Bulwark's gpu/outline.rs): each frame the named meshes' records are written again beside the frame's
// own, flagged `OUTLINED`, so the engine draws them into the outline's mask alone, whatever stands before them, and
// the mask's edge over its finished frame. The page drew it with three's renderer on a canvas laid over the engine's.
import * as THREE from './three';
import { RECORD, type Core } from './core';
import { engineCanvas } from './index';

/** A record's flag (Bulwark's plan.rs): drawn into the outline's mask alone, in no view. */
const OUTLINED = 2048;
/** A record's flag: the hero's arms, drawn by their own view (the outline's mask is the camera's). */
const ARMS = 8;
/** where a record's flags and its instance set are, and its matrix from */
const FLAGS_AT = 6;
const SET_AT = 4;
const MATRIX_AT = 8;

/** One thing outlined: a mesh, or one instance of an instanced mesh. */
export interface OutlinedMesh {
  mesh: THREE.Mesh;
  instance?: number;
}

/** What the page outlines this frame: its meshes, its colour (as the screen shows it) and strength, its line's and
 *  glow's reach and the box on the screen it's drawn within, in pixels of a frame `frame` big (three's canvas's,
 *  which the page places by; the box from its top left). */
export interface OutlineAsked {
  meshes: OutlinedMesh[];
  color: THREE.Color;
  strength: number;
  line: number;
  glow: number;
  box: { x: number; y: number; w: number; h: number };
  frame: { width: number; height: number };
}

let asked: OutlineAsked | null = null;

/** What the engine outlines from the next frame on; null, nothing. */
export function outlineForEngine(next: OutlineAsked | null): void {
  asked = next;
}

const instanceMatrix = new THREE.Matrix4();
const placed = new THREE.Matrix4();

/** `mesh`'s records written by `add`, then made the outline's: flagged for its mask alone, and an instance's its own,
 *  out of its set. */
function writeOne(core: Core, add: (mesh: THREE.Mesh) => void, each: OutlinedMesh): void {
  const from = core.count;
  add(each.mesh);
  const records = core.records;
  if (each.instance !== undefined) {
    (each.mesh as THREE.InstancedMesh).getMatrixAt(each.instance, instanceMatrix);
    placed.multiplyMatrices(each.mesh.matrixWorld, instanceMatrix);
  }
  for (let record = from; record < core.count; record++) {
    const at = record * RECORD;
    records[at + FLAGS_AT] = (records[at + FLAGS_AT] | OUTLINED) & ~ARMS;
    if (each.instance === undefined) continue;
    records[at + SET_AT] = 0;
    records.set(placed.elements, at + MATRIX_AT);
  }
}

/**
 * The outlined meshes' records written beside the frame's (`add`: the bridge's, which writes a mesh's records and
 * its bones), and the engine told the outline's look, sized to its canvas; or told there's none.
 */
export function writeOutlined(core: Core, add: (mesh: THREE.Mesh) => void): void {
  const canvas = engineCanvas();
  if (!asked || !canvas || !asked.meshes.length || asked.strength <= 0) {
    core.engine.no_outline();
    return;
  }
  for (const each of asked.meshes) writeOne(core, add, each);
  const sx = canvas.width / Math.max(1, asked.frame.width);
  const sy = canvas.height / Math.max(1, asked.frame.height);
  const { color, strength, box } = asked;
  const x = Math.max(0, Math.floor(box.x * sx));
  const y = Math.max(0, Math.floor(box.y * sy));
  const w = Math.ceil(box.w * sx);
  const h = Math.ceil(box.h * sy);
  core.engine.set_outline(color.r, color.g, color.b, strength, asked.line * sx, asked.glow * sx, x, y, w, h);
}
