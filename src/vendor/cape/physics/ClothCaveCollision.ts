import * as THREE from 'three';
import { caveInteriorBoundsAtHeight } from '../world/caveProfile';
import type { CaveHorizontalBounds } from '../world/CaveShellSampler';
import { CLOTH_WORLD_CLEARANCE } from './ClothWorldCollision';

const DISTANCE_EPSILON = 0.000_001;

interface TriangleSample {
  readonly first: number;
  readonly second: number;
  readonly third: number;
}

// The centroid and edge midpoints catch a curved cave wall passing through a
// cloth face even when all three vertices remain just inside the shell.
const TRIANGLE_SAMPLES: readonly TriangleSample[] = [
  { first: 1 / 3, second: 1 / 3, third: 1 / 3 },
  { first: 1 / 2, second: 1 / 2, third: 0 },
  { first: 1 / 2, second: 0, third: 1 / 2 },
  { first: 0, second: 1 / 2, third: 1 / 2 },
];

/** Keeps cloth triangle interiors inside the curved procedural cave walls. */
export class ClothCaveCollision {
  private readonly sample = new THREE.Vector3();
  private readonly bounds: CaveHorizontalBounds = { minimum: 0, maximum: 0 };

  public constructor(
    private readonly positions: readonly THREE.Vector3[],
    private readonly previous: readonly THREE.Vector3[],
    private readonly inverseMass: Float32Array,
    private readonly columns: number,
    private readonly rows: number,
    private readonly nearBoundary?: Uint8Array,
  ) {}

  public solve(): number {
    let contacts = 0;
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let column = 0; column < this.columns - 1; column += 1) {
        const topLeft = this.index(column, row);
        const bottomLeft = this.index(column, row + 1);
        if (this.isNearBoundary(topLeft, bottomLeft, topLeft + 1)) {
          contacts += this.solveTriangle(topLeft, bottomLeft, topLeft + 1);
        }
        if (this.isNearBoundary(bottomLeft, bottomLeft + 1, topLeft + 1)) {
          contacts += this.solveTriangle(bottomLeft, bottomLeft + 1, topLeft + 1);
        }
      }
    }
    return contacts;
  }

  public getMaximumPenetration(): number {
    let maximum = 0;
    for (let row = 0; row < this.rows - 1; row += 1) {
      for (let column = 0; column < this.columns - 1; column += 1) {
        const topLeft = this.index(column, row);
        const bottomLeft = this.index(column, row + 1);
        maximum = Math.max(
          maximum,
          this.getTrianglePenetration(topLeft, bottomLeft, topLeft + 1),
          this.getTrianglePenetration(bottomLeft, bottomLeft + 1, topLeft + 1),
        );
      }
    }
    return maximum;
  }

  private solveTriangle(firstIndex: number, secondIndex: number, thirdIndex: number): number {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    if (!first || !second || !third) return 0;

    let contacts = 0;
    for (const weights of TRIANGLE_SAMPLES) {
      const correction = this.getSampleCorrection(first, second, third, weights);
      if (Math.abs(correction) <= DISTANCE_EPSILON) continue;
      const firstWeight = this.inverseMass[firstIndex] ?? 0;
      const secondWeight = this.inverseMass[secondIndex] ?? 0;
      const thirdWeight = this.inverseMass[thirdIndex] ?? 0;
      const denominator = firstWeight * weights.first * weights.first
        + secondWeight * weights.second * weights.second
        + thirdWeight * weights.third * weights.third;
      if (denominator <= DISTANCE_EPSILON) continue;

      const lambda = correction / denominator;
      this.applyCorrection(firstIndex, firstWeight * weights.first * lambda);
      this.applyCorrection(secondIndex, secondWeight * weights.second * lambda);
      this.applyCorrection(thirdIndex, thirdWeight * weights.third * lambda);
      contacts += 1;
    }
    return contacts;
  }

  private getTrianglePenetration(
    firstIndex: number,
    secondIndex: number,
    thirdIndex: number,
  ): number {
    const first = this.positions[firstIndex];
    const second = this.positions[secondIndex];
    const third = this.positions[thirdIndex];
    if (!first || !second || !third) return 0;
    let maximum = 0;
    for (const weights of TRIANGLE_SAMPLES) {
      maximum = Math.max(
        maximum,
        Math.abs(this.getSampleCorrection(first, second, third, weights)),
      );
    }
    return maximum;
  }

  private getSampleCorrection(
    first: THREE.Vector3,
    second: THREE.Vector3,
    third: THREE.Vector3,
    weights: TriangleSample,
  ): number {
    this.sample.set(
      first.x * weights.first + second.x * weights.second + third.x * weights.third,
      first.y * weights.first + second.y * weights.second + third.y * weights.third,
      first.z * weights.first + second.z * weights.second + third.z * weights.third,
    );
    caveInteriorBoundsAtHeight(
      this.sample.y,
      this.sample.z,
      CLOTH_WORLD_CLEARANCE,
      this.bounds,
    );
    if (this.sample.x < this.bounds.minimum) return this.bounds.minimum - this.sample.x;
    if (this.sample.x > this.bounds.maximum) return this.bounds.maximum - this.sample.x;
    return 0;
  }

  private applyCorrection(index: number, correction: number): void {
    if (Math.abs(correction) <= DISTANCE_EPSILON) return;
    const position = this.positions[index];
    const previous = this.previous[index];
    if (!position || !previous) return;
    const direction = Math.sign(correction);
    const inwardMotion = (position.x - previous.x) * direction;
    position.x += correction;
    previous.x += correction;
    if (inwardMotion < 0) previous.x += inwardMotion * direction;
  }

  private index(column: number, row: number): number {
    return row * this.columns + column;
  }

  private isNearBoundary(first: number, second: number, third: number): boolean {
    return !this.nearBoundary
      || this.nearBoundary[first] === 1
      || this.nearBoundary[second] === 1
      || this.nearBoundary[third] === 1;
  }
}
