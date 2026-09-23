import * as THREE from 'three';
import type { WorldRockCollider } from './colliders';
import {
  isBelowWalkableRockShoulder,
  RockColliderQuery,
} from './RockCollider';
import { TriangleContactQuery } from './TriangleContactQuery';

const DISTANCE_EPSILON = 0.000_001;
const FACE_INTERSECTION_RELEASE_CLEARANCES = 1.5;
const SWEPT_FACE_INTERVALS = 4;
// Face contacts are a last-resort anti-piercing constraint. A cloth edge can
// span a sharp rock corner by more than one clearance, so one pass may need a
// tightly bounded centimetre-scale translation. Position and previous are
// moved together below, preventing that separation from becoming velocity.
const MAXIMUM_FACE_CORRECTION_CLEARANCES = 10;

export interface ClothRockSurfaceContact {
  readonly distance: number;
  readonly collider: WorldRockCollider;
}

export interface ClothRockPenetrationDiagnostics {
  readonly maximum: number;
  readonly triangle: readonly [number, number, number] | null;
  readonly positions: readonly [number, number, number][] | null;
  readonly previous: readonly [number, number, number][] | null;
  readonly rockCenter: readonly [number, number, number] | null;
}

/**
 * Resolves convex-rock surface intersections against cloth triangle faces.
 * Vertex contacts are handled separately; this closes the complementary case
 * where a sharp rock edge enters the middle of a coarse cloth triangle.
 */
export class ClothRockCollision {
  private readonly clothTriangle = new THREE.Triangle();
  private readonly previousTriangle = new THREE.Triangle();
  private readonly clothPoint = new THREE.Vector3();
  private readonly candidateCloth = new THREE.Vector3();
  private readonly candidateRock = new THREE.Vector3();
  private readonly barycentric = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly boundsMinimum = new THREE.Vector3();
  private readonly boundsMaximum = new THREE.Vector3();
  private readonly clothBounds = new THREE.Box3();
  private readonly previousBounds = new THREE.Box3();
  private readonly vertexNormal = new THREE.Vector3();
  private readonly previousCentroid = new THREE.Vector3();
  private readonly referenceDirection = new THREE.Vector3();
  private readonly candidateContactNormal = new THREE.Vector3();
  private readonly intersectionNormal = new THREE.Vector3();
  private intersectionSeparation = 0;
  private readonly motion = new THREE.Vector3();
  private readonly rockQuery = new RockColliderQuery();
  private readonly triangleQuery = new TriangleContactQuery();
  private readonly faceCorrectionUsed: Float32Array;
  private sweptFaceRecoveryPending = true;

  public constructor(
    private readonly positions: readonly THREE.Vector3[],
    private readonly previous: readonly THREE.Vector3[],
    private readonly inverseMass: Float32Array,
    private readonly columns: number,
    private readonly rows: number,
    private readonly clearance: number,
  ) {
    this.faceCorrectionUsed = new Float32Array(inverseMass.length);
  }

  public beginStep(): void {
    this.sweptFaceRecoveryPending = true;
    this.beginPass();
  }

  public getCorrectionUsed(index: number): number {
    return this.faceCorrectionUsed[index] ?? 0;
  }

  public beginPass(): void {
    this.faceCorrectionUsed.fill(0);
  }

  public solve(
    colliders: readonly WorldRockCollider[],
    contactColliders?: WorldRockCollider[],
  ): number {
    const allowSweptFaceRecovery = this.sweptFaceRecoveryPending;
    this.sweptFaceRecoveryPending = false;
    this.updateBounds();
    let contacts = 0;
    for (const collider of colliders) {
      if (!this.intersectsColliderBounds(collider)) continue;
      let colliderContacts = 0;
      this.forEachTriangle((first, second, third) => {
        colliderContacts += this.solveTriangle(
          first,
          second,
          third,
          collider,
          allowSweptFaceRecovery,
        );
      });
      contacts += colliderContacts;
      if (
        colliderContacts > 0
        && contactColliders
        && !contactColliders.includes(collider)
      ) {
        contactColliders.push(collider);
      }
    }
    return contacts;
  }

  public getMaximumPenetration(colliders: readonly WorldRockCollider[]): number {
    return this.getMaximumPenetrationDiagnostics(colliders).maximum;
  }

  public getMaximumPenetrationDiagnostics(
    colliders: readonly WorldRockCollider[],
  ): ClothRockPenetrationDiagnostics {
    this.updateBounds();
    let maximum = 0;
    let triangle: readonly [number, number, number] | null = null;
    let positions: readonly [number, number, number][] | null = null;
    let previous: readonly [number, number, number][] | null = null;
    let rockCenter: readonly [number, number, number] | null = null;
    for (const collider of colliders) {
      if (!this.intersectsColliderBounds(collider)) continue;
      this.forEachTriangle((first, second, third) => {
        const penetration = this.getTrianglePenetration(first, second, third, collider);
        if (penetration <= maximum) return;
        maximum = penetration;
        triangle = [first, second, third];
        positions = [first, second, third].map((index) => {
          const point = this.positions[index] ?? new THREE.Vector3();
          return [point.x, point.y, point.z] as const;
        });
        previous = [first, second, third].map((index) => {
          const point = this.previous[index] ?? new THREE.Vector3();
          return [point.x, point.y, point.z] as const;
        });
        rockCenter = [collider.center.x, collider.center.y, collider.center.z];
      });
    }
    return { maximum, triangle, positions, previous, rockCenter };
  }

  public getClosestSurfaceContact(
    colliders: readonly WorldRockCollider[],
  ): ClothRockSurfaceContact | null {
    this.updateBounds();
    const candidates = colliders.map((collider) => ({
      collider,
      lowerBoundSquared: this.getBoundsDistanceSquared(
        this.boundsMinimum,
        this.boundsMaximum,
        collider.bounds.min,
        collider.bounds.max,
      ),
    })).sort((first, second) => first.lowerBoundSquared - second.lowerBoundSquared);
    let minimumDistanceSquared = Number.POSITIVE_INFINITY;
    let closestCollider: WorldRockCollider | undefined;
    for (const candidate of candidates) {
      if (candidate.lowerBoundSquared > minimumDistanceSquared) break;
      const { collider } = candidate;
      this.forEachTriangle((firstIndex, secondIndex, thirdIndex) => {
        const first = this.positions[firstIndex];
        const second = this.positions[secondIndex];
        const third = this.positions[thirdIndex];
        if (!first || !second || !third) return;
        this.clothTriangle.set(first, second, third);
        this.clothBounds.makeEmpty();
        this.clothBounds.expandByPoint(first);
        this.clothBounds.expandByPoint(second);
        this.clothBounds.expandByPoint(third);
        for (const face of collider.faces) {
          if (this.getBoundsDistanceSquared(
            this.clothBounds.min,
            this.clothBounds.max,
            face.bounds.min,
            face.bounds.max,
          ) > minimumDistanceSquared) continue;
          const distanceSquared = this.triangleQuery.closestPoints(
            this.clothTriangle,
            face.triangle,
            this.candidateCloth,
            this.candidateRock,
          );
          if (distanceSquared >= minimumDistanceSquared) continue;
          minimumDistanceSquared = distanceSquared;
          closestCollider = collider;
        }
      });
    }
    return closestCollider && Number.isFinite(minimumDistanceSquared)
      ? { distance: Math.sqrt(minimumDistanceSquared), collider: closestCollider }
      : null;
  }

  private getBoundsDistanceSquared(
    firstMinimum: THREE.Vector3,
    firstMaximum: THREE.Vector3,
    secondMinimum: THREE.Vector3,
    secondMaximum: THREE.Vector3,
  ): number {
    const x = Math.max(0, secondMinimum.x - firstMaximum.x, firstMinimum.x - secondMaximum.x);
    const y = Math.max(0, secondMinimum.y - firstMaximum.y, firstMinimum.y - secondMaximum.y);
    const z = Math.max(0, secondMinimum.z - firstMaximum.z, firstMinimum.z - secondMaximum.z);
    return x * x + y * y + z * z;
  }

  private solveTriangle(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    collider: WorldRockCollider,
    allowSweptFaceRecovery: boolean,
  ): number {
    const penetration = this.findTrianglePenetration(
      firstIndex,
      secondIndex,
      thirdIndex,
      collider,
      true,
    );
    if (penetration <= 0) {
      if (
        allowSweptFaceRecovery
        && this.sweptTriangleIntersectsCollider(
          firstIndex,
          secondIndex,
          thirdIndex,
          collider,
        )
        && this.restorePreviousTriangle(
          firstIndex,
          secondIndex,
          thirdIndex,
          collider,
        )
      ) return 1;
      return 0;
    }
    if (this.clothTriangle.getBarycoord(this.clothPoint, this.barycentric) === null) return 0;
    // A face-only crossing was created during this physics step. Returning
    // its three vertices to their last non-intersecting state is continuous,
    // energy-dissipating contact: it cannot choose a new facet normal each
    // iteration or ratchet a millimetre correction into a metre-long spike.
    if (this.restorePreviousTriangle(
      firstIndex,
      secondIndex,
      thirdIndex,
      collider,
    )) return 1;

    if (
      isBelowWalkableRockShoulder(collider, this.clothPoint.y)
      || (
        this.normal.y < 0
        && this.clothPoint.y <= collider.bounds.min.y + this.clearance * 2
      )
    ) {
      this.normal.set(
        this.clothPoint.x - collider.center.x,
        0,
        this.clothPoint.z - collider.center.z,
      );
      if (this.normal.lengthSq() < DISTANCE_EPSILON) this.normal.set(1, 0, 0);
      else this.normal.normalize();
    }

    // Move the intersected face coherently. Barycentric-only correction can
    // lift the nearest vertex while leaving the opposite edge threaded
    // through a sharp facet, producing the persistent triangular holes seen
    // when a long cape rests on a rock.
    for (const index of [firstIndex, secondIndex, thirdIndex]) {
      if ((this.inverseMass[index] ?? 0) > 0) this.applyCorrection(index, penetration);
    }
    return 1;
  }

  private getTrianglePenetration(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    collider: WorldRockCollider,
  ): number {
    const penetration = this.findTrianglePenetration(
      firstIndex,
      secondIndex,
      thirdIndex,
      collider,
      false,
    );
    return Math.max(0, penetration);
  }

  private restorePreviousTriangle(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    collider: WorldRockCollider,
  ): boolean {
    const previousFirst = this.previous[firstIndex];
    const previousSecond = this.previous[secondIndex];
    const previousThird = this.previous[thirdIndex];
    if (!previousFirst || !previousSecond || !previousThird) return false;
    if (
      this.rockQuery.getSignedDistance(collider, previousFirst, this.vertexNormal) < 0
      || this.rockQuery.getSignedDistance(collider, previousSecond, this.vertexNormal) < 0
      || this.rockQuery.getSignedDistance(collider, previousThird, this.vertexNormal) < 0
    ) return false;

    this.previousTriangle.set(previousFirst, previousSecond, previousThird);
    if (this.triangleIntersectsCollider(this.previousTriangle, collider)) return false;

    let restored = false;
    for (const index of [firstIndex, secondIndex, thirdIndex]) {
      if ((this.inverseMass[index] ?? 0) <= 0) continue;
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      position.copy(previous);
      restored = true;
    }
    return restored;
  }

  private sweptTriangleIntersectsCollider(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    collider: WorldRockCollider,
  ): boolean {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    const previousFirst = this.previous[firstIndex];
    const previousSecond = this.previous[secondIndex];
    const previousThird = this.previous[thirdIndex];
    if (
      !first
      || !second
      || !third
      || !previousFirst
      || !previousSecond
      || !previousThird
    ) return false;

    this.previousBounds.makeEmpty();
    this.previousBounds.expandByPoint(first);
    this.previousBounds.expandByPoint(second);
    this.previousBounds.expandByPoint(third);
    this.previousBounds.expandByPoint(previousFirst);
    this.previousBounds.expandByPoint(previousSecond);
    this.previousBounds.expandByPoint(previousThird);
    if (!this.previousBounds.intersectsBox(collider.bounds)) return false;

    for (let interval = 1; interval < SWEPT_FACE_INTERVALS; interval += 1) {
      const progress = interval / SWEPT_FACE_INTERVALS;
      this.previousTriangle.set(
        this.candidateCloth.lerpVectors(previousFirst, first, progress),
        this.candidateRock.lerpVectors(previousSecond, second, progress),
        this.motion.lerpVectors(previousThird, third, progress),
      );
      if (this.triangleIntersectsCollider(this.previousTriangle, collider)) return true;
    }
    return false;
  }

  private triangleIntersectsCollider(
    triangle: THREE.Triangle,
    collider: WorldRockCollider,
  ): boolean {
    this.previousBounds.setFromPoints([
      triangle.a,
      triangle.b,
      triangle.c,
    ]);
    if (!this.previousBounds.intersectsBox(collider.bounds)) return false;
    triangle.getMidpoint(this.referenceDirection).sub(collider.center);
    if (this.referenceDirection.lengthSq() < DISTANCE_EPSILON) {
      triangle.getNormal(this.referenceDirection);
    } else {
      this.referenceDirection.normalize();
    }
    for (const face of collider.faces) {
      if (!this.previousBounds.intersectsBox(face.bounds)) continue;
      if (this.triangleQuery.intersectAtPoint(
        triangle,
        face.triangle,
        face.normal,
        this.referenceDirection,
        this.candidateCloth,
        this.candidateContactNormal,
      ) > 0) return true;
    }
    return false;
  }

  private findTrianglePenetration(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    collider: WorldRockCollider,
    forCorrection: boolean,
  ): number {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    if (!first || !second || !third) return 0;
    this.clothTriangle.set(first, second, third);
    this.clothBounds.setFromPoints([first, second, third]).expandByScalar(this.clearance);
    if (!this.clothBounds.intersectsBox(collider.bounds)) return 0;

    const previousFirst = this.previous[firstIndex] ?? first;
    const previousSecond = this.previous[secondIndex] ?? second;
    const previousThird = this.previous[thirdIndex] ?? third;
    this.previousCentroid.copy(previousFirst)
      .add(previousSecond)
      .add(previousThird)
      .multiplyScalar(1 / 3);
    this.referenceDirection.copy(this.previousCentroid).sub(collider.center);
    if (this.referenceDirection.lengthSq() < DISTANCE_EPSILON) {
      this.clothTriangle.getMidpoint(this.referenceDirection).sub(collider.center);
    }
    if (this.referenceDirection.lengthSq() < DISTANCE_EPSILON) {
      this.clothTriangle.getNormal(this.referenceDirection);
    } else {
      this.referenceDirection.normalize();
    }

    let intersectionKind = 0;
    let bestIntersectionScore = Number.NEGATIVE_INFINITY;
    let bestIntersectionSeparation = Number.POSITIVE_INFINITY;
    for (const face of collider.faces) {
      if (!this.clothBounds.intersectsBox(face.bounds)) continue;
      const candidateKind = this.triangleQuery.intersectAtPoint(
        this.clothTriangle,
        face.triangle,
        face.normal,
        this.referenceDirection,
        this.candidateCloth,
        this.candidateContactNormal,
      );
      if (candidateKind > 0) {
        const score = this.candidateContactNormal.dot(this.referenceDirection);
        const separation = candidateKind === 2
          ? this.clearance - Math.min(
              face.normal.dot(first) - face.planeConstant,
              face.normal.dot(second) - face.planeConstant,
              face.normal.dot(third) - face.planeConstant,
            )
          : this.clearance * FACE_INTERSECTION_RELEASE_CLEARANCES;
        if (
          candidateKind > intersectionKind
          || (
            candidateKind === intersectionKind
            && (
              separation < bestIntersectionSeparation
              || (
                Math.abs(separation - bestIntersectionSeparation) < DISTANCE_EPSILON
                && score > bestIntersectionScore
              )
            )
          )
        ) {
          intersectionKind = candidateKind;
          bestIntersectionScore = score;
          bestIntersectionSeparation = separation;
          this.intersectionNormal.copy(this.candidateContactNormal);
          this.intersectionSeparation = separation;
          this.clothPoint.copy(this.candidateCloth);
        }
      }
    }

    if (intersectionKind > 0) {
      this.normal.copy(this.intersectionNormal);
      return forCorrection
        ? Math.max(
            this.clearance * FACE_INTERSECTION_RELEASE_CLEARANCES,
            this.intersectionSeparation,
          )
        : this.clearance;
    }
    return 0;
  }

  private applyCorrection(index: number, scale: number): void {
    if (scale <= 0) return;
    const remaining = Math.max(
      0,
      this.clearance * MAXIMUM_FACE_CORRECTION_CLEARANCES
        - (this.faceCorrectionUsed[index] ?? 0),
    );
    const appliedScale = Math.min(scale, remaining);
    if (appliedScale <= 0) return;
    const position = this.positions[index];
    const previous = this.previous[index];
    if (!position || !previous) return;
    position.addScaledVector(this.normal, appliedScale);
    previous.addScaledVector(this.normal, appliedScale);
    const inwardMotion = this.motion.copy(position).sub(previous).dot(this.normal);
    if (inwardMotion < 0) previous.addScaledVector(this.normal, inwardMotion);
    this.faceCorrectionUsed[index] = (
      this.faceCorrectionUsed[index] ?? 0
    ) + appliedScale;
  }

  private forEachTriangle(visit: (first: number, second: number, third: number) => void): void {
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let column = 0; column < this.columns - 1; column += 1) {
        const topLeft = row * this.columns + column;
        const bottomLeft = topLeft + this.columns;
        visit(topLeft, bottomLeft, topLeft + 1);
        visit(bottomLeft, bottomLeft + 1, topLeft + 1);
      }
    }
  }

  private updateBounds(): void {
    this.boundsMinimum.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    this.boundsMaximum.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (let index = 0; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (position) {
        this.boundsMinimum.min(position);
        this.boundsMaximum.max(position);
      }
      if (previous) {
        this.boundsMinimum.min(previous);
        this.boundsMaximum.max(previous);
      }
    }
  }

  private intersectsColliderBounds(collider: WorldRockCollider): boolean {
    return collider.bounds.max.x + this.clearance >= this.boundsMinimum.x
      && collider.bounds.min.x - this.clearance <= this.boundsMaximum.x
      && collider.bounds.max.y + this.clearance >= this.boundsMinimum.y
      && collider.bounds.min.y - this.clearance <= this.boundsMaximum.y
      && collider.bounds.max.z + this.clearance >= this.boundsMinimum.z
      && collider.bounds.min.z - this.clearance <= this.boundsMaximum.z;
  }
}
