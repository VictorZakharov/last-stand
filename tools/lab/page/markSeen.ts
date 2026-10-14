// Quarry Mark's reticle over its quarry as the player sees it (tools/lab `held`'s rounds over a boss,
// page/heldBoss.ts): found over the foe, over its top as drawn, and seen whole from the camera, none of it inside a
// body. (Placed by the foe's height, it stood inside a boss's crown, which reaches up to 1.8 times that: its body hid
// it in every view.)
import * as THREE from 'three';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { drawnSolid, foeMetAlong } from './onScreen';

/** how near over the foe's middle the reticle stands (m) */
const OVER_MIDDLE = 0.01;
/** how far out from the reticle's middle its ring is drawn, as a share of half its size */
const RING = 0.8;

/** What the reticle over a foe showed: where it stood and what of it was seen. */
export interface MarkSeen {
  line: string;
  problem?: string;
}

/** The reticle over `foe`: the plane in the scene stood over its middle, above half its height. */
function reticleOver(foe: Enemy): THREE.Mesh | undefined {
  return G.scene.children.find((object): object is THREE.Mesh => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.geometry.type !== 'PlaneGeometry') return false;
    const over = Math.hypot(mesh.position.x - foe.pos.x, mesh.position.z - foe.pos.z) < OVER_MIDDLE;
    return over && mesh.position.y > foe.obj.position.y + foe.height / 2;
  });
}

/** The top of `foe`'s body as it's drawn now: its solid meshes, the skinned ones as posed (m, in the world). */
function drawnTop(foe: Enemy): number {
  const box = new THREE.Box3();
  foe.obj.updateWorldMatrix(true, true);
  foe.obj.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && drawnSolid(object)) box.expandByObject(object, true);
  });
  return box.max.y;
}

/** The reticle's middle and its ring's points left, right, up and down of it, as it faces the camera. */
function reticlePoints(reticle: THREE.Mesh): THREE.Vector3[] {
  const half = reticle.scale.x / 2 * RING;
  const right = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(G.camera.matrixWorld, 1);
  const round = [right, up].flatMap((axis) => [1, -1].map((sign) => {
    return reticle.position.clone().addScaledVector(axis, sign * half);
  }));
  return [reticle.position.clone(), ...round];
}

/** Whether `point` is on the screen. */
function onScreen(point: THREE.Vector3): boolean {
  const ndc = point.clone().project(G.camera);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z <= 1;
}

/**
 * The reticle over `foe` (marked), against what the camera sees: how far over its top as drawn it stands, and its
 * points hidden inside a body of `foes` (met by the eye's ray before it) or off the screen. A point hidden, the
 * reticle missing or under the top are problems. With `canary`, it's put at the foe's middle first, which must be
 * found hidden.
 */
export function markSeen(foe: Enemy, foes: Enemy[], canary: boolean): MarkSeen {
  const reticle = reticleOver(foe);
  if (!reticle) return { line: 'no reticle over it', problem: 'no reticle over the marked boss' };
  if (canary) reticle.position.y = foe.obj.position.y + foe.height / 2;
  reticle.updateMatrixWorld();
  const over = reticle.position.y - drawnTop(foe);
  const points = reticlePoints(reticle);
  const shown = points.filter(onScreen);
  const hidden = shown.filter((point) => foeMetAlong(G.camera.position, point, 0, foes)).length;
  const off = points.length - shown.length;
  const seen = hidden ? `${hidden} of its ${points.length} points inside a body` : 'none of it inside a body';
  const offScreen = off ? `, ${off} off the screen` : '';
  const line = `the reticle ${over.toFixed(2)} m over its top as drawn, ${seen}${offScreen}`;
  if (hidden) return { line, problem: `the mark's reticle hidden: ${line}` };
  if (over <= 0) return { line, problem: `the mark's reticle under its top: ${line}` };
  return { line };
}
