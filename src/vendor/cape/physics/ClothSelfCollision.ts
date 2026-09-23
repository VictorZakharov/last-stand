import * as THREE from 'three';

export const CLOTH_THICKNESS = 0.058;

const CELL_SIZE = 0.072;
const HASH_BUCKETS = 521;

export class ClothSelfCollision {
  private readonly heads = new Int32Array(HASH_BUCKETS);
  private readonly next: Int16Array;
  private readonly cellX: Int16Array;
  private readonly cellY: Int16Array;
  private readonly cellZ: Int16Array;
  private readonly delta = new THREE.Vector3();
  private readonly correction = new THREE.Vector3();

  public constructor(
    particleCount: number,
    private readonly columns: number,
  ) {
    this.next = new Int16Array(particleCount);
    this.cellX = new Int16Array(particleCount);
    this.cellY = new Int16Array(particleCount);
    this.cellZ = new Int16Array(particleCount);
  }

  public solve(
    positions: readonly THREE.Vector3[],
    previous: readonly THREE.Vector3[],
    inverseMass: Float32Array,
  ): void {
    this.rebuild(positions);
    const minimumSquared = CLOTH_THICKNESS * CLOTH_THICKNESS;

    for (let first = 0; first < positions.length; first += 1) {
      const firstPosition = positions[first];
      const firstPrevious = previous[first];
      if (!firstPosition || !firstPrevious) continue;
      const baseX = this.cellX[first] ?? 0;
      const baseY = this.cellY[first] ?? 0;
      const baseZ = this.cellZ[first] ?? 0;

      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
            const x = baseX + offsetX;
            const y = baseY + offsetY;
            const z = baseZ + offsetZ;
            let second = this.heads[this.hash(x, y, z)] ?? -1;
            while (second >= 0) {
              if (
                second < first
                && this.cellX[second] === x
                && this.cellY[second] === y
                && this.cellZ[second] === z
                && !this.isTopologicalNeighbor(first, second)
              ) {
                const secondPosition = positions[second];
                const secondPrevious = previous[second];
                if (secondPosition && secondPrevious) {
                  this.delta.copy(firstPosition).sub(secondPosition);
                  const distanceSquared = this.delta.lengthSq();
                  if (distanceSquared < minimumSquared) {
                    const distance = Math.sqrt(distanceSquared);
                    if (distance < 0.000_001) this.fallbackNormal(first, second);
                    else this.delta.multiplyScalar(1 / distance);
                    const firstWeight = inverseMass[first] ?? 0;
                    const secondWeight = inverseMass[second] ?? 0;
                    const totalWeight = firstWeight + secondWeight;
                    if (totalWeight > 0) {
                      this.correction.copy(this.delta).multiplyScalar((CLOTH_THICKNESS - distance) / totalWeight);
                      if (firstWeight > 0) {
                        firstPosition.addScaledVector(this.correction, firstWeight);
                        firstPrevious.addScaledVector(this.correction, firstWeight);
                      }
                      if (secondWeight > 0) {
                        secondPosition.addScaledVector(this.correction, -secondWeight);
                        secondPrevious.addScaledVector(this.correction, -secondWeight);
                      }
                    }
                  }
                }
              }
              second = this.next[second] ?? -1;
            }
          }
        }
      }
    }
  }

  public getMinimumSeparation(positions: readonly THREE.Vector3[]): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (let first = 0; first < positions.length; first += 1) {
      const firstPosition = positions[first];
      if (!firstPosition) continue;
      for (let second = 0; second < first; second += 1) {
        const secondPosition = positions[second];
        if (!secondPosition || this.isTopologicalNeighbor(first, second)) continue;
        minimum = Math.min(minimum, firstPosition.distanceTo(secondPosition));
      }
    }
    return minimum;
  }

  private rebuild(positions: readonly THREE.Vector3[]): void {
    this.heads.fill(-1);
    for (let index = 0; index < positions.length; index += 1) {
      const position = positions[index];
      if (!position) continue;
      const x = Math.floor(position.x / CELL_SIZE);
      const y = Math.floor(position.y / CELL_SIZE);
      const z = Math.floor(position.z / CELL_SIZE);
      this.cellX[index] = x;
      this.cellY[index] = y;
      this.cellZ[index] = z;
      const bucket = this.hash(x, y, z);
      this.next[index] = this.heads[bucket] ?? -1;
      this.heads[bucket] = index;
    }
  }

  private isTopologicalNeighbor(first: number, second: number): boolean {
    const firstRow = Math.floor(first / this.columns);
    const secondRow = Math.floor(second / this.columns);
    const firstColumn = first % this.columns;
    const secondColumn = second % this.columns;
    return Math.abs(firstRow - secondRow) <= 2 && Math.abs(firstColumn - secondColumn) <= 2;
  }

  private hash(x: number, y: number, z: number): number {
    return ((Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ Math.imul(z, 83_492_791)) >>> 0) % HASH_BUCKETS;
  }

  private fallbackNormal(first: number, second: number): void {
    const phase = first * 0.754_877_666 + second * 0.569_840_291;
    this.delta.set(Math.sin(phase), Math.cos(phase * 1.37), Math.sin(phase * 0.73 + 1.1)).normalize();
  }
}
