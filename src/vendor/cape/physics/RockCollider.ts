import * as THREE from 'three';
import type {
  WorldRockCollider,
  WorldRockFace,
} from './colliders';

const PLANE_EPSILON = 0.000_01;
const SUPPORT_EPSILON = 0.000_01;
const CARTESIAN_AXES = ['x', 'y', 'z'] as const;
export const WALKABLE_ROCK_SHOULDER_FRACTION = 0.72;

export function isBelowWalkableRockShoulder(
  collider: WorldRockCollider,
  height: number,
): boolean {
  return collider.walkable
    && height <= collider.bounds.min.y
      + (collider.bounds.max.y - collider.bounds.min.y)
        * WALKABLE_ROCK_SHOULDER_FRACTION;
}

/**
 * Builds one convex contact surface from the exact transformed render mesh.
 * The bounding sphere remains only a broadphase; contact and walkable support
 * use the actual triangles, so no oversized proxy shell is visible.
 */
export function createWorldRockCollider(
  geometry: THREE.BufferGeometry,
  instanceMatrix: THREE.Matrix4,
  walkable: boolean,
): WorldRockCollider {
  const positions = geometry.getAttribute('position');
  if (!positions) throw new Error('Rock collision geometry has no positions.');
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const localBounds = geometry.boundingSphere;
  if (!localBounds) throw new Error('Rock collision geometry has no bounding sphere.');

  const center = localBounds.center.clone().applyMatrix4(instanceMatrix);
  const faces: WorldRockFace[] = [];
  const samples = new Map<string, THREE.Vector3>();
  const index = geometry.index;
  const triangleCount = (index?.count ?? positions.count) / 3;
  const local = new THREE.Vector3();

  const readVertex = (offset: number): THREE.Vector3 => {
    const vertexIndex = index?.getX(offset) ?? offset;
    return local.fromBufferAttribute(positions, vertexIndex).clone().applyMatrix4(instanceMatrix);
  };
  const sampleKey = (point: THREE.Vector3): string => (
    `${point.x.toFixed(6)}:${point.y.toFixed(6)}:${point.z.toFixed(6)}`
  );

  for (let faceIndex = 0; faceIndex < triangleCount; faceIndex += 1) {
    const offset = faceIndex * 3;
    const first = readVertex(offset);
    const second = readVertex(offset + 1);
    const third = readVertex(offset + 2);
    const triangle = new THREE.Triangle(first, second, third);
    const normal = triangle.getNormal(new THREE.Vector3());
    const centroid = triangle.getMidpoint(new THREE.Vector3());
    if (normal.dot(centroid.sub(center)) < 0) normal.negate();
    if (normal.lengthSq() < 0.5) continue;

    faces.push({
      triangle,
      normal,
      planeConstant: normal.dot(first),
      bounds: new THREE.Box3().setFromPoints([first, second, third]),
    });
    for (const point of [first, second, third]) {
      const key = sampleKey(point);
      if (!samples.has(key)) samples.set(key, point.clone());
    }
  }

  if (faces.length === 0) throw new Error('Rock collision geometry has no valid faces.');
  const worldPoints = [...samples.values()];
  const bounds = new THREE.Box3().setFromPoints(worldPoints);
  let radius = 0;
  for (const point of worldPoints) radius = Math.max(radius, point.distanceTo(center));

  return {
    center,
    radius,
    walkable,
    kind: 'rock',
    shape: 'convex-rock',
    bounds,
    faces,
  };
}

/** Allocation-free exact point, sweep, and support queries for convex rocks. */
export class RockColliderQuery {
  private readonly closestSurface = new THREE.Vector3();
  private readonly candidate = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  public intersectsExpandedBounds(
    collider: WorldRockCollider,
    start: THREE.Vector3,
    end: THREE.Vector3,
    expansion: number,
  ): boolean {
    let entry = 0;
    let exit = 1;
    for (const axis of CARTESIAN_AXES) {
      const minimum = collider.bounds.min[axis] - expansion;
      const maximum = collider.bounds.max[axis] + expansion;
      const origin = start[axis];
      const direction = end[axis] - origin;
      if (Math.abs(direction) < PLANE_EPSILON) {
        if (origin < minimum || origin > maximum) return false;
        continue;
      }
      let first = (minimum - origin) / direction;
      let second = (maximum - origin) / direction;
      if (first > second) {
        const swap = first;
        first = second;
        second = swap;
      }
      entry = Math.max(entry, first);
      exit = Math.min(exit, second);
      if (entry > exit) return false;
    }
    return exit >= 0 && entry <= 1;
  }

  public getSignedDistance(
    collider: WorldRockCollider,
    point: THREE.Vector3,
    normalTarget: THREE.Vector3,
  ): number {
    let inside = true;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let closestFace: WorldRockFace | undefined;

    for (const face of collider.faces) {
      if (face.normal.dot(point) - face.planeConstant > PLANE_EPSILON) inside = false;
      face.triangle.closestPointToPoint(point, this.candidate);
      const distanceSquared = this.candidate.distanceToSquared(point);
      if (distanceSquared >= closestDistanceSquared) continue;
      closestDistanceSquared = distanceSquared;
      closestFace = face;
      this.closestSurface.copy(this.candidate);
    }

    const distance = Math.sqrt(closestDistanceSquared);
    if (distance > PLANE_EPSILON) {
      normalTarget.copy(inside ? this.closestSurface : point)
        .sub(inside ? point : this.closestSurface)
        .multiplyScalar(1 / distance);
    } else if (closestFace) {
      normalTarget.copy(closestFace.normal);
    } else {
      normalTarget.copy(point).sub(collider.center);
      if (normalTarget.lengthSq() < PLANE_EPSILON) normalTarget.set(0, 1, 0);
      else normalTarget.normalize();
    }
    return inside ? -distance : distance;
  }

  public getSupportHeight(collider: WorldRockCollider, x: number, z: number): number | null {
    if (
      x < collider.bounds.min.x - SUPPORT_EPSILON
      || x > collider.bounds.max.x + SUPPORT_EPSILON
      || z < collider.bounds.min.z - SUPPORT_EPSILON
      || z > collider.bounds.max.z + SUPPORT_EPSILON
    ) return null;

    let height = Number.NEGATIVE_INFINITY;
    for (const face of collider.faces) {
      if (face.normal.y <= SUPPORT_EPSILON) continue;
      const { a, b, c } = face.triangle;
      if (
        x < face.bounds.min.x - SUPPORT_EPSILON
        || x > face.bounds.max.x + SUPPORT_EPSILON
        || z < face.bounds.min.z - SUPPORT_EPSILON
        || z > face.bounds.max.z + SUPPORT_EPSILON
      ) continue;
      const firstX = b.x - a.x;
      const firstZ = b.z - a.z;
      const secondX = c.x - a.x;
      const secondZ = c.z - a.z;
      const pointX = x - a.x;
      const pointZ = z - a.z;
      const denominator = firstX * secondZ - secondX * firstZ;
      if (Math.abs(denominator) < SUPPORT_EPSILON) continue;
      const firstWeight = (pointX * secondZ - secondX * pointZ) / denominator;
      const secondWeight = (firstX * pointZ - pointX * firstZ) / denominator;
      if (
        firstWeight < -SUPPORT_EPSILON
        || secondWeight < -SUPPORT_EPSILON
        || firstWeight + secondWeight > 1 + SUPPORT_EPSILON
      ) continue;
      const candidateHeight = a.y
        + firstWeight * (b.y - a.y)
        + secondWeight * (c.y - a.y);
      height = Math.max(height, candidateHeight);
    }
    return Number.isFinite(height) ? height : null;
  }

  public sweep(
    collider: WorldRockCollider,
    start: THREE.Vector3,
    end: THREE.Vector3,
    clearance: number,
    normalTarget: THREE.Vector3,
  ): number | null {
    if (!this.intersectsExpandedBounds(collider, start, end, clearance)) return null;
    let entry = 0;
    let exit = 1;
    let entryFace: WorldRockFace | undefined;
    let startsInside = true;

    for (const face of collider.faces) {
      const expandedConstant = face.planeConstant + clearance;
      const startDistance = face.normal.dot(start) - expandedConstant;
      const endDistance = face.normal.dot(end) - expandedConstant;
      if (startDistance > 0) startsInside = false;
      if (startDistance > 0 && endDistance > 0) return null;
      if (startDistance <= 0 && endDistance <= 0) continue;
      const progress = startDistance / (startDistance - endDistance);
      if (startDistance > endDistance) {
        if (progress > entry) {
          entry = progress;
          entryFace = face;
        }
      } else {
        exit = Math.min(exit, progress);
      }
      if (entry > exit) return null;
    }

    if (startsInside || !entryFace || entry < 0 || entry > 1) return null;
    normalTarget.copy(entryFace.normal);
    return entry;
  }

  public getPlanarSeparation(
    collider: WorldRockCollider,
    point: THREE.Vector3,
    clearance: number,
    target: THREE.Vector2,
  ): number {
    const signedDistance = this.getSignedDistance(collider, point, this.delta);
    const penetration = clearance - signedDistance;
    if (penetration <= 0) return 0;
    target.set(this.delta.x, this.delta.z);
    const planarLength = target.length();
    if (planarLength < PLANE_EPSILON) {
      target.set(point.x - collider.center.x, point.z - collider.center.z);
      if (target.lengthSq() < PLANE_EPSILON) target.set(1, 0);
      target.normalize();
    } else {
      target.multiplyScalar(1 / planarLength);
    }
    return penetration;
  }
}
