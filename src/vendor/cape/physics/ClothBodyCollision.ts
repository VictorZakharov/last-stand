import * as THREE from 'three';
import type { CapsuleCollider } from './colliders';

export const CLOTH_BODY_CLEARANCE = 0.026;

export function getClothBodyClearance(collider: CapsuleCollider): number {
  return collider.clearance ?? CLOTH_BODY_CLEARANCE;
}

export function getClothBodyDepthRadius(collider: CapsuleCollider): number {
  return (collider.depthRadius ?? collider.radius) + getClothBodyClearance(collider);
}

/**
 * Resolves one-sided character contact against cloth triangle faces. Vertex-only
 * capsules can otherwise pass through the middle of a coarse cloth triangle.
 */
export class ClothBodyCollision {
  private readonly triangle = new THREE.Triangle();
  private readonly closestPoint = new THREE.Vector3();
  private readonly barycentric = new THREE.Vector3();
  private readonly capsuleAxis = new THREE.Vector3();
  private readonly sampleCenter = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly boundsMinimum = new THREE.Vector3();
  private readonly boundsMaximum = new THREE.Vector3();
  private readonly motion = new THREE.Vector3();
  private readonly contactNormal = new THREE.Vector3();
  private readonly previousClosestPoint = new THREE.Vector3();
  private readonly rowMinimumY: Float32Array;
  private readonly rowMaximumY: Float32Array;
  private readonly correctionUsed: Float32Array;

  public constructor(
    private readonly positions: readonly THREE.Vector3[],
    private readonly previous: readonly THREE.Vector3[],
    private readonly inverseMass: Float32Array,
    private readonly columns: number,
    private readonly rows: number,
  ) {
    this.rowMinimumY = new Float32Array(rows);
    this.rowMaximumY = new Float32Array(rows);
    this.correctionUsed = new Float32Array(inverseMass.length);
  }

  public beginStep(): void {
    this.correctionUsed.fill(0);
  }

  public getCorrectionUsed(index: number): number {
    return this.correctionUsed[index] ?? 0;
  }

  public solve(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
    sideOrigin?: THREE.Vector3,
  ): void {
    this.updateBounds();
    this.forEachCapsuleSample(colliders, (center, lateralRadius, depthRadius) => {
      const boundsRadius = Math.max(lateralRadius, depthRadius);
      if (!this.intersectsBounds(center, boundsRadius)) return;
      this.forEachTriangle(center.y, boundsRadius, (first, second, third) => {
        this.solveTriangle(first, second, third, center, lateralRadius, depthRadius, back, sideOrigin);
      });
    });
  }

  public getMaximumPenetration(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): number {
    this.updateBounds();
    let maximum = 0;
    this.forEachCapsuleSample(colliders, (center, lateralRadius, depthRadius) => {
      const boundsRadius = Math.max(lateralRadius, depthRadius);
      if (!this.intersectsBounds(center, boundsRadius)) return;
      this.forEachTriangle(center.y, boundsRadius, (first, second, third) => {
        maximum = Math.max(
          maximum,
          this.getTrianglePenetration(
            first,
            second,
            third,
            center,
            lateralRadius,
            depthRadius,
            back,
          ),
        );
      });
    });
    return maximum;
  }

  public getMaximumGeometricPenetration(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): number {
    this.updateBounds();
    let maximum = 0;
    this.forEachCapsuleSample(colliders, (center, lateralRadius, depthRadius) => {
      const boundsRadius = Math.max(lateralRadius, depthRadius);
      if (!this.intersectsBounds(center, boundsRadius)) return;
      this.forEachTriangle(center.y, boundsRadius, (first, second, third) => {
        const firstPoint = this.positions[first];
        const secondPoint = this.positions[second];
        const thirdPoint = this.positions[third];
        if (!firstPoint || !secondPoint || !thirdPoint) return;
        if (!this.intersectsTriangleBounds(
          firstPoint,
          secondPoint,
          thirdPoint,
          center,
          boundsRadius,
        )) return;
        this.triangle.set(firstPoint, secondPoint, thirdPoint);
        this.triangle.closestPointToPoint(center, this.closestPoint);
        maximum = Math.max(maximum, this.getGeometricPenetration(
          this.closestPoint,
          center,
          lateralRadius,
          depthRadius,
          back,
        ));
      });
    });
    return maximum;
  }

  private solveTriangle(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    center: THREE.Vector3,
    lateralRadius: number,
    depthRadius: number,
    back: THREE.Vector3,
    sideOrigin?: THREE.Vector3,
  ): void {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    if (!first || !second || !third) return;
    const boundsRadius = Math.max(lateralRadius, depthRadius);
    if (!this.intersectsTriangleBounds(first, second, third, center, boundsRadius)) return;

    this.triangle.set(first, second, third);
    this.triangle.closestPointToPoint(center, this.closestPoint);
    if (this.triangle.getBarycoord(this.closestPoint, this.barycentric) === null) return;
    const previousFirst = this.previous[firstIndex];
    const previousSecond = this.previous[secondIndex];
    const previousThird = this.previous[thirdIndex];
    if (!previousFirst || !previousSecond || !previousThird) return;
    this.previousClosestPoint.set(0, 0, 0)
      .addScaledVector(previousFirst, this.barycentric.x)
      .addScaledVector(previousSecond, this.barycentric.y)
      .addScaledVector(previousThird, this.barycentric.z);
    const topologyColumn = firstIndex % this.columns * this.barycentric.x
      + secondIndex % this.columns * this.barycentric.y
      + thirdIndex % this.columns * this.barycentric.z;
    const topologySide = topologyColumn / (this.columns - 1) - 0.5;
    const penetration = this.oneSidedPenetration(
      this.closestPoint,
      center,
      lateralRadius,
      depthRadius,
      back,
      this.previousClosestPoint,
      sideOrigin,
      topologySide,
    );
    if (penetration <= 0) return;

    const firstWeight = this.inverseMass[firstIndex] ?? 0;
    const secondWeight = this.inverseMass[secondIndex] ?? 0;
    const thirdWeight = this.inverseMass[thirdIndex] ?? 0;
    const denominator = firstWeight * this.barycentric.x * this.barycentric.x
      + secondWeight * this.barycentric.y * this.barycentric.y
      + thirdWeight * this.barycentric.z * this.barycentric.z;
    if (denominator < 0.000_001) return;

    const lambda = penetration / denominator;
    this.applyCorrection(
      firstIndex,
      firstWeight * this.barycentric.x * lambda,
      this.contactNormal,
    );
    this.applyCorrection(
      secondIndex,
      secondWeight * this.barycentric.y * lambda,
      this.contactNormal,
    );
    this.applyCorrection(
      thirdIndex,
      thirdWeight * this.barycentric.z * lambda,
      this.contactNormal,
    );
  }

  private getTrianglePenetration(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
    center: THREE.Vector3,
    lateralRadius: number,
    depthRadius: number,
    back: THREE.Vector3,
  ): number {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    if (!first || !second || !third) return 0;
    const boundsRadius = Math.max(lateralRadius, depthRadius);
    if (!this.intersectsTriangleBounds(first, second, third, center, boundsRadius)) return 0;
    this.triangle.set(first, second, third);
    this.triangle.closestPointToPoint(center, this.closestPoint);
    return this.oneSidedPenetration(
      this.closestPoint,
      center,
      lateralRadius,
      depthRadius,
      back,
    );
  }

  private oneSidedPenetration(
    point: THREE.Vector3,
    center: THREE.Vector3,
    lateralRadius: number,
    depthRadius: number,
    back: THREE.Vector3,
    preferredPoint?: THREE.Vector3,
    sideOrigin?: THREE.Vector3,
    preferredTopologySide = 0,
  ): number {
    this.delta.copy(point).sub(center);
    const depth = this.delta.dot(back);
    const lateralSquared = Math.max(0, this.delta.lengthSq() - depth * depth);
    if (lateralSquared >= lateralRadius * lateralRadius) return 0;
    const normalizedLateralSquared = lateralSquared / (lateralRadius * lateralRadius);
    const surfaceDepth = depthRadius * Math.sqrt(1 - normalizedLateralSquared);
    const backCorrection = Math.max(0, surfaceDepth - depth);
    this.contactNormal.copy(back);
    if (backCorrection <= 0 || depth >= 0) return backCorrection;

    // Cloth that first meets the front of the body must travel around its
    // nearest side. Projecting every front contact through the full capsule
    // depth makes a coarse triangle jump to the cape side in one solve pass.
    if (depth <= -depthRadius) return 0;
    const depthRatio = THREE.MathUtils.clamp(depth / depthRadius, -1, 0);
    const lateralBoundary = lateralRadius
      * Math.sqrt(Math.max(0, 1 - depthRatio * depthRatio));
    const preferred = preferredPoint ?? point;
    const rightX = back.z;
    const rightZ = -back.x;
    const spatialSide = sideOrigin
      ? (preferred.x - sideOrigin.x) * rightX + (preferred.z - sideOrigin.z) * rightZ
      : 0;
    const preferredSide = Math.abs(preferredTopologySide) > 0.000_001
      ? preferredTopologySide
      : spatialSide;
    if (Math.abs(preferredSide) > 0.000_001) {
      const sideSign = Math.sign(preferredSide);
      this.contactNormal.set(rightX * sideSign, 0, rightZ * sideSign);
    } else {
      this.contactNormal.copy(preferred).sub(center);
      const preferredDepth = this.contactNormal.dot(back);
      this.contactNormal.addScaledVector(back, -preferredDepth);
      this.contactNormal.y = 0;
      if (this.contactNormal.lengthSq() > 0.000_001) this.contactNormal.normalize();
      else if (lateralSquared > 0.000_001) {
        this.contactNormal.copy(this.delta).addScaledVector(back, -depth).normalize();
      } else this.contactNormal.set(rightX, 0, rightZ).normalize();
    }
    const lateralProjection = this.delta.dot(this.contactNormal);
    const lateralCorrection = lateralBoundary - lateralProjection;
    return lateralCorrection > 0 ? lateralCorrection : backCorrection;
  }

  private getGeometricPenetration(
    point: THREE.Vector3,
    center: THREE.Vector3,
    lateralRadius: number,
    depthRadius: number,
    back: THREE.Vector3,
  ): number {
    this.delta.copy(point).sub(center);
    const depth = this.delta.dot(back);
    const lateralSquared = Math.max(0, this.delta.lengthSq() - depth * depth);
    const normalizedDistanceSquared = lateralSquared / (lateralRadius * lateralRadius)
      + depth * depth / (depthRadius * depthRadius);
    if (normalizedDistanceSquared >= 1) return 0;
    const distance = this.delta.length();
    if (normalizedDistanceSquared < 0.000_001 || distance < 0.000_001) {
      return Math.min(lateralRadius, depthRadius);
    }
    return distance * (1 / Math.sqrt(normalizedDistanceSquared) - 1);
  }

  private forEachCapsuleSample(
    colliders: readonly CapsuleCollider[],
    visit: (
      center: THREE.Vector3,
      lateralRadius: number,
      depthRadius: number,
    ) => void,
  ): void {
    for (const collider of colliders) {
      this.capsuleAxis.copy(collider.end).sub(collider.start);
      const length = this.capsuleAxis.length();
      const clearance = getClothBodyClearance(collider);
      const lateralRadius = collider.radius + clearance;
      const depthRadius = getClothBodyDepthRadius(collider);
      const sampleSpacing = collider.faceSampleSpacing
        ?? Math.max(0.04, lateralRadius * 0.82);
      const segments = length < 0.000_001
        ? 0
        : Math.max(1, Math.ceil(length / sampleSpacing));
      const stepLength = segments > 0 ? length / segments : 0;
      const sampleLateralRadius = Math.hypot(lateralRadius, stepLength * 0.5);
      const sampleDepthRadius = depthRadius * sampleLateralRadius / lateralRadius;
      for (let sample = 0; sample <= segments; sample += 1) {
        const progress = segments > 0 ? sample / segments : 0;
        this.sampleCenter.lerpVectors(collider.start, collider.end, progress);
        visit(this.sampleCenter, sampleLateralRadius, sampleDepthRadius);
      }
    }
  }

  private forEachTriangle(
    centerY: number,
    radius: number,
    visit: (first: number, second: number, third: number) => void,
  ): void {
    for (let row = 0; row < this.rows - 1; row += 1) {
      const minimumY = Math.min(this.rowMinimumY[row]!, this.rowMinimumY[row + 1]!);
      const maximumY = Math.max(this.rowMaximumY[row]!, this.rowMaximumY[row + 1]!);
      if (centerY + radius < minimumY || centerY - radius > maximumY) continue;
      for (let column = 0; column < this.columns - 1; column += 1) {
        const topLeft = this.index(column, row);
        const bottomLeft = this.index(column, row + 1);
        visit(topLeft, bottomLeft, topLeft + 1);
        visit(bottomLeft, bottomLeft + 1, topLeft + 1);
      }
    }
  }

  private applyCorrection(index: number, scale: number, normal: THREE.Vector3): void {
    if (scale <= 0) return;
    const position = this.positions[index];
    const previous = this.previous[index];
    if (!position || !previous) return;
    position.addScaledVector(normal, scale);
    previous.addScaledVector(normal, scale);
    const inwardMotion = this.motion.copy(position).sub(previous).dot(normal);
    if (inwardMotion < 0) previous.addScaledVector(normal, inwardMotion);
    this.correctionUsed[index] = (this.correctionUsed[index] ?? 0) + scale;
  }

  private updateBounds(): void {
    this.boundsMinimum.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    this.boundsMaximum.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    this.rowMinimumY.fill(Number.POSITIVE_INFINITY);
    this.rowMaximumY.fill(Number.NEGATIVE_INFINITY);
    for (let index = 0; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      if (!position) continue;
      this.boundsMinimum.min(position);
      this.boundsMaximum.max(position);
      const row = Math.floor(index / this.columns);
      this.rowMinimumY[row] = Math.min(this.rowMinimumY[row]!, position.y);
      this.rowMaximumY[row] = Math.max(this.rowMaximumY[row]!, position.y);
    }
  }

  private intersectsBounds(center: THREE.Vector3, radius: number): boolean {
    return center.x + radius >= this.boundsMinimum.x
      && center.x - radius <= this.boundsMaximum.x
      && center.y + radius >= this.boundsMinimum.y
      && center.y - radius <= this.boundsMaximum.y
      && center.z + radius >= this.boundsMinimum.z
      && center.z - radius <= this.boundsMaximum.z;
  }

  private intersectsTriangleBounds(
    first: THREE.Vector3,
    second: THREE.Vector3,
    third: THREE.Vector3,
    center: THREE.Vector3,
    radius: number,
  ): boolean {
    return center.x + radius >= Math.min(first.x, second.x, third.x)
      && center.x - radius <= Math.max(first.x, second.x, third.x)
      && center.y + radius >= Math.min(first.y, second.y, third.y)
      && center.y - radius <= Math.max(first.y, second.y, third.y)
      && center.z + radius >= Math.min(first.z, second.z, third.z)
      && center.z - radius <= Math.max(first.z, second.z, third.z);
  }

  private index(column: number, row: number): number {
    return row * this.columns + column;
  }
}
