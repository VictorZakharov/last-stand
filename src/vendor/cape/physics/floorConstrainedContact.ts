import type { Vector3 } from 'three';
import { caveGroundHeightAt } from '../world/caveProfile';

const FLOOR_CONTACT_HEIGHT_EPSILON = 0.045;

/**
 * Returns a lateral correction when a sphere's shortest escape direction would
 * send cloth down through the cave floor. The supplied normal is updated in
 * place; null means the unconstrained three-dimensional contact remains valid.
 */
export function constrainSphereContactToFloor(
  point: Vector3,
  sphereCenter: Vector3,
  radius: number,
  surfaceClearance: number,
  normal: Vector3,
  fallbackPoint: Vector3,
): number | null {
  const floor = caveGroundHeightAt(point.x, point.z) + surfaceClearance;
  if (normal.y >= 0 || point.y > floor + FLOOR_CONTACT_HEIGHT_EPSILON) return null;

  const deltaX = point.x - sphereCenter.x;
  const deltaY = point.y - sphereCenter.y;
  const deltaZ = point.z - sphereCenter.z;
  const planarDistance = Math.hypot(deltaX, deltaZ);
  const requiredPlanarDistance = Math.sqrt(
    Math.max(0, radius * radius - deltaY * deltaY),
  );
  normal.set(deltaX, 0, deltaZ);
  if (planarDistance < 0.000_001) {
    normal.set(
      fallbackPoint.x - sphereCenter.x,
      0,
      fallbackPoint.z - sphereCenter.z,
    );
    if (normal.lengthSq() < 0.000_001) normal.set(1, 0, 0);
    else normal.normalize();
  } else {
    normal.multiplyScalar(1 / planarDistance);
  }
  return Math.max(0, requiredPlanarDistance - planarDistance);
}
