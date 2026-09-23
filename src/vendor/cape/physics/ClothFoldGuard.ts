import * as THREE from 'three';

// A small upward tuck remains possible as cloth rides over contact, but it
// cannot become the long crossed S-fold that used to form around stones.
export const MAXIMUM_LOCAL_UPWARD_FOLD = 0.022;
export const FOLD_RELAXATION = 0.8;

/**
 * A heavy shoulder cape may flare horizontally, but a lower row cannot pass
 * upward through the row above it without creating the persistent crossed
 * S-fold seen around small obstacles. This unilateral constraint preserves
 * free lateral drape while rejecting that local inversion.
 */
export class ClothFoldGuard {
  public constructor(
    private readonly columns: number,
    private readonly rows: number,
  ) {}

  public solve(
    positions: readonly THREE.Vector3[],
    previous: readonly THREE.Vector3[],
    inverseMass: Float32Array,
  ): void {
    for (let row = 1; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const upperIndex = (row - 1) * this.columns + column;
        const lowerIndex = row * this.columns + column;
        const upper = positions[upperIndex];
        const lower = positions[lowerIndex];
        const upperPrevious = previous[upperIndex];
        const lowerPrevious = previous[lowerIndex];
        if (!upper || !lower || !upperPrevious || !lowerPrevious) continue;
        const excess = lower.y - upper.y - MAXIMUM_LOCAL_UPWARD_FOLD;
        if (excess <= 0) continue;
        const upperWeight = inverseMass[upperIndex] ?? 0;
        const lowerWeight = inverseMass[lowerIndex] ?? 0;
        const totalWeight = upperWeight + lowerWeight;
        if (totalWeight <= 0) continue;

        const correction = excess * FOLD_RELAXATION;
        const upperCorrection = correction * upperWeight / totalWeight;
        const lowerCorrection = correction * lowerWeight / totalWeight;
        upper.y += upperCorrection;
        upperPrevious.y += upperCorrection;
        lower.y -= lowerCorrection;
        lowerPrevious.y -= lowerCorrection;
      }
    }
  }

  public getMaximumUpwardFold(positions: readonly THREE.Vector3[]): number {
    let maximum = 0;
    for (let row = 1; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const upper = positions[(row - 1) * this.columns + column];
        const lower = positions[row * this.columns + column];
        if (upper && lower) maximum = Math.max(maximum, lower.y - upper.y);
      }
    }
    return maximum;
  }
}
