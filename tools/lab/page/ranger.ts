// The ranger's bow as the lab sees it (tools/lab): the model's own `Bow`, and how it is carried.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Bow } from '../../../src/entities/models/bow';

const DEGREES = 180 / Math.PI;

/** The hero's bow, from its handle on the model (`models/ranger.ts`), or null for a hero without one. */
export function bowOf(lab: Lab): Bow | null {
  const group = lab.model.root.getObjectByName('bow');
  return (group?.userData.bow as Bow | undefined) ?? null;
}

/** How the bow is held now, for a picture's notes: its length's angle from level, and where the nocked arrow points. */
export function describeBow(lab: Lab, bow: Bow): string {
  const length = new THREE.Vector3(0, 1, 0).transformDirection(bow.group.matrixWorld);
  const tilt = Math.round(Math.asin(Math.min(1, Math.abs(length.y))) * DEGREES);
  const arrow = bow.arrows.find((a) => a.visible);
  if (!arrow) return `bow: ${tilt}° from level; no arrow on the string`;
  const direction = new THREE.Vector3(0, 0, 1).transformDirection(arrow.matrixWorld);
  const facing = lab.player.facing;
  const ahead = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const left = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const below = Math.round(-Math.asin(direction.y) * DEGREES);
  const toLeft = Math.round(Math.atan2(direction.dot(left), direction.dot(ahead)) * DEGREES);
  return `bow: ${tilt}° from level; arrow ${below}° below level, pointing ${toLeft}° to his left of ahead`;
}
