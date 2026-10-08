// The soles of the hero's feet as the leg IK sees them: each foot's shape (how its sole hangs below its ankle and how
// far it reaches ahead and behind) and its points heel to toe in the world, for the measures that judge the feet
// against the ground (`feet`) and the body's balance over them (`balance.ts`).
import * as THREE from 'three';
import type { Lab } from './lab';
// (the module whole: a commit from before `footShape` has none, and a named import of it would stop every command's
// page loading on an A/B's side on that commit, `main` included)
import * as legIK from '../../../src/entities/models/ik';
import type { FootShape, LegIK } from '../../../src/entities/models/ik';

/** the sole's points along it, this far apart (m) */
export const SOLE_STEP = 0.01;

/** Each foot's shape as the leg IK measures it: by its exported `footShape`, or on a commit from before that export
 *  (`main`'s), the shapes the IK keeps once it has run (its `shape`), so an A/B measures both sides alike. */
export function shapesOf(lab: Lab, ik: LegIK, ankles: THREE.Object3D[]): FootShape[] {
  const footShape = (legIK as Partial<typeof legIK>).footShape;
  if (footShape) return ankles.map((ankle) => footShape(ankle, lab.model.root));
  const kept = (ik as unknown as { shape?: FootShape[] | null }).shape;
  if (kept) return kept;
  throw new Error('lab: this commit\'s leg IK has no foot shape (`footShape` or `LegIK.shape`)');
}

/** The sole of `ankle`'s foot (`shape`): its points heel to toe in the world, `SOLE_STEP` apart, into `points`. */
export function solePoints(ankle: THREE.Object3D, shape: FootShape, points: THREE.Vector3[] = []): THREE.Vector3[] {
  const scale = ankle.getWorldScale(new THREE.Vector3()).x;
  let count = 0;
  for (let along = -shape.heel; along <= shape.toe; along += SOLE_STEP / scale) {
    points[count] ??= new THREE.Vector3();
    ankle.localToWorld(points[count].set(0, -shape.sole, along));
    count++;
  }
  points.length = count;
  return points;
}
