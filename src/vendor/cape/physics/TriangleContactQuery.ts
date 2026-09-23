import * as THREE from 'three';

const DISTANCE_EPSILON = 0.000_001;
const INTERSECTION_EPSILON = 0.000_01;

/**
 * Triangle intersection and closest-point queries shared by coarse-cloth
 * contact diagnostics. The solver hot-path intersection query is
 * allocation-free. A higher intersection kind has priority: cloth-edge/
 * surface contact (2) over a rock edge piercing cloth interior (1).
 */
export class TriangleContactQuery {
  private readonly firstDirection = new THREE.Vector3();
  private readonly secondDirection = new THREE.Vector3();
  private readonly segmentOffset = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private readonly triangleFirstEdge = new THREE.Vector3();
  private readonly triangleSecondEdge = new THREE.Vector3();
  private readonly determinantVector = new THREE.Vector3();
  private readonly vertexOffset = new THREE.Vector3();
  private readonly barycentricVector = new THREE.Vector3();
  private readonly candidateFirst = new THREE.Vector3();
  private readonly candidateSecond = new THREE.Vector3();

  public intersectAtPoint(
    first: THREE.Triangle,
    second: THREE.Triangle,
    secondNormal: THREE.Vector3,
    referenceDirection: THREE.Vector3,
    target: THREE.Vector3,
    normalTarget: THREE.Vector3,
  ): number {
    if (
      this.intersectSegmentTriangle(first.a, first.b, second, target)
      || this.intersectSegmentTriangle(first.b, first.c, second, target)
      || this.intersectSegmentTriangle(first.c, first.a, second, target)
    ) {
      normalTarget.copy(secondNormal);
      return 2;
    }

    if (
      this.intersectSegmentTriangle(second.a, second.b, first, target)
      || this.intersectSegmentTriangle(second.b, second.c, first, target)
      || this.intersectSegmentTriangle(second.c, second.a, first, target)
    ) {
      first.getNormal(normalTarget);
      if (normalTarget.dot(referenceDirection) < 0) normalTarget.negate();
      if (normalTarget.lengthSq() < DISTANCE_EPSILON) {
        normalTarget.copy(secondNormal);
      }
      return 1;
    }
    // Coplanar proximity is not a crossing. Particle contact handles it
    // without turning a shared/near-shared plane into a face impulse.
    return 0;
  }

  public closestPoints(
    first: THREE.Triangle,
    second: THREE.Triangle,
    firstTarget: THREE.Vector3,
    secondTarget: THREE.Vector3,
  ): number {
    let minimum = Number.POSITIVE_INFINITY;
    const update = (
      firstPoint: THREE.Vector3,
      secondPoint: THREE.Vector3,
    ): void => {
      const distanceSquared = firstPoint.distanceToSquared(secondPoint);
      if (distanceSquared >= minimum) return;
      minimum = distanceSquared;
      firstTarget.copy(firstPoint);
      secondTarget.copy(secondPoint);
    };

    second.closestPointToPoint(first.a, this.candidateSecond);
    update(first.a, this.candidateSecond);
    second.closestPointToPoint(first.b, this.candidateSecond);
    update(first.b, this.candidateSecond);
    second.closestPointToPoint(first.c, this.candidateSecond);
    update(first.c, this.candidateSecond);
    first.closestPointToPoint(second.a, this.candidateFirst);
    update(this.candidateFirst, second.a);
    first.closestPointToPoint(second.b, this.candidateFirst);
    update(this.candidateFirst, second.b);
    first.closestPointToPoint(second.c, this.candidateFirst);
    update(this.candidateFirst, second.c);

    const updateEdges = (
      firstStart: THREE.Vector3,
      firstEnd: THREE.Vector3,
      secondStart: THREE.Vector3,
      secondEnd: THREE.Vector3,
    ): void => {
      this.closestSegmentPoints(
        firstStart,
        firstEnd,
        secondStart,
        secondEnd,
        this.candidateFirst,
        this.candidateSecond,
      );
      update(this.candidateFirst, this.candidateSecond);
    };
    updateEdges(first.a, first.b, second.a, second.b);
    updateEdges(first.a, first.b, second.b, second.c);
    updateEdges(first.a, first.b, second.c, second.a);
    updateEdges(first.b, first.c, second.a, second.b);
    updateEdges(first.b, first.c, second.b, second.c);
    updateEdges(first.b, first.c, second.c, second.a);
    updateEdges(first.c, first.a, second.a, second.b);
    updateEdges(first.c, first.a, second.b, second.c);
    updateEdges(first.c, first.a, second.c, second.a);
    return minimum;
  }

  private intersectSegmentTriangle(
    start: THREE.Vector3,
    end: THREE.Vector3,
    triangle: THREE.Triangle,
    target: THREE.Vector3,
  ): boolean {
    this.segmentDirection.copy(end).sub(start);
    this.triangleFirstEdge.copy(triangle.b).sub(triangle.a);
    this.triangleSecondEdge.copy(triangle.c).sub(triangle.a);
    this.determinantVector.copy(this.segmentDirection).cross(this.triangleSecondEdge);
    const determinant = this.triangleFirstEdge.dot(this.determinantVector);
    if (Math.abs(determinant) <= INTERSECTION_EPSILON) return false;

    const inverseDeterminant = 1 / determinant;
    this.vertexOffset.copy(start).sub(triangle.a);
    const firstWeight = this.vertexOffset.dot(this.determinantVector) * inverseDeterminant;
    if (firstWeight < -INTERSECTION_EPSILON || firstWeight > 1 + INTERSECTION_EPSILON) {
      return false;
    }

    this.barycentricVector.copy(this.vertexOffset).cross(this.triangleFirstEdge);
    const secondWeight = this.segmentDirection.dot(this.barycentricVector)
      * inverseDeterminant;
    if (
      secondWeight < -INTERSECTION_EPSILON
      || firstWeight + secondWeight > 1 + INTERSECTION_EPSILON
    ) return false;

    const progress = this.triangleSecondEdge.dot(this.barycentricVector)
      * inverseDeterminant;
    if (progress < -INTERSECTION_EPSILON || progress > 1 + INTERSECTION_EPSILON) {
      return false;
    }
    target.copy(start).addScaledVector(
      this.segmentDirection,
      THREE.MathUtils.clamp(progress, 0, 1),
    );
    return true;
  }

  private closestSegmentPoints(
    firstStart: THREE.Vector3,
    firstEnd: THREE.Vector3,
    secondStart: THREE.Vector3,
    secondEnd: THREE.Vector3,
    firstTarget: THREE.Vector3,
    secondTarget: THREE.Vector3,
  ): void {
    this.firstDirection.copy(firstEnd).sub(firstStart);
    this.secondDirection.copy(secondEnd).sub(secondStart);
    this.segmentOffset.copy(firstStart).sub(secondStart);
    const firstLengthSquared = this.firstDirection.lengthSq();
    const secondLengthSquared = this.secondDirection.lengthSq();
    const secondProjection = this.secondDirection.dot(this.segmentOffset);
    let firstProgress = 0;
    let secondProgress = 0;

    if (firstLengthSquared <= DISTANCE_EPSILON && secondLengthSquared <= DISTANCE_EPSILON) {
      firstTarget.copy(firstStart);
      secondTarget.copy(secondStart);
      return;
    }
    if (firstLengthSquared <= DISTANCE_EPSILON) {
      secondProgress = THREE.MathUtils.clamp(secondProjection / secondLengthSquared, 0, 1);
    } else {
      const firstProjection = this.firstDirection.dot(this.segmentOffset);
      if (secondLengthSquared <= DISTANCE_EPSILON) {
        firstProgress = THREE.MathUtils.clamp(-firstProjection / firstLengthSquared, 0, 1);
      } else {
        const crossProjection = this.firstDirection.dot(this.secondDirection);
        const denominator = firstLengthSquared * secondLengthSquared
          - crossProjection * crossProjection;
        if (Math.abs(denominator) > DISTANCE_EPSILON) {
          firstProgress = THREE.MathUtils.clamp(
            (crossProjection * secondProjection - firstProjection * secondLengthSquared)
              / denominator,
            0,
            1,
          );
        }
        secondProgress = (
          crossProjection * firstProgress + secondProjection
        ) / secondLengthSquared;
        if (secondProgress < 0) {
          secondProgress = 0;
          firstProgress = THREE.MathUtils.clamp(-firstProjection / firstLengthSquared, 0, 1);
        } else if (secondProgress > 1) {
          secondProgress = 1;
          firstProgress = THREE.MathUtils.clamp(
            (crossProjection - firstProjection) / firstLengthSquared,
            0,
            1,
          );
        }
      }
    }
    firstTarget.copy(firstStart).addScaledVector(this.firstDirection, firstProgress);
    secondTarget.copy(secondStart).addScaledVector(this.secondDirection, secondProgress);
  }
}
