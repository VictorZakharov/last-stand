import * as THREE from 'three';
import { CAPE } from '../config';
import { CAPE_DISTANCE_CONSTRAINTS } from './CapeConstraintTopology';

interface DistanceConstraint {
  readonly first: number;
  readonly second: number;
  readonly restLength: number;
  readonly stiffness: number;
  readonly structural: boolean;
}

export class CapeCpuConstraints {
  private readonly constraints: DistanceConstraint[] = [];
  private readonly correction = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();

  public constructor(
    private readonly positions: THREE.Vector3[],
    private readonly inverseMass: Float32Array,
  ) {}

  public rebuild(): void {
    this.constraints.length = 0;
    for (const definition of CAPE_DISTANCE_CONSTRAINTS) {
      this.addConstraint(
        definition.firstColumn,
        definition.firstRow,
        definition.secondColumn,
        definition.secondRow,
        definition.stiffness,
        definition.structural,
      );
    }
  }

  public solve(stiffnessScale: number): void {
    for (const constraint of this.constraints) {
      const first = this.positions[constraint.first];
      const second = this.positions[constraint.second];
      if (!first || !second) continue;
      this.delta.copy(second).sub(first);
      const length = this.delta.length();
      if (length < 0.000_001) continue;
      const firstWeight = this.inverseMass[constraint.first] ?? 0;
      const secondWeight = this.inverseMass[constraint.second] ?? 0;
      const totalWeight = firstWeight + secondWeight;
      if (totalWeight === 0) continue;
      const stiffness = Math.min(0.999, constraint.stiffness * stiffnessScale);
      this.correction.copy(this.delta).multiplyScalar(
        ((length - constraint.restLength) / length) * stiffness,
      );
      if (firstWeight > 0) first.addScaledVector(this.correction, firstWeight / totalWeight);
      if (secondWeight > 0) second.addScaledVector(this.correction, -secondWeight / totalWeight);
    }
  }

  public getMaximumStructuralError(): number {
    let maximum = 0;
    for (const constraint of this.constraints) {
      if (!constraint.structural) continue;
      const first = this.positions[constraint.first];
      const second = this.positions[constraint.second];
      if (!first || !second) continue;
      maximum = Math.max(maximum, Math.abs(first.distanceTo(second) - constraint.restLength));
    }
    return maximum;
  }

  private addConstraint(
    firstColumn: number,
    firstRow: number,
    secondColumn: number,
    secondRow: number,
    stiffness: number,
    structural: boolean,
  ): void {
    const first = firstRow * CAPE.columns + firstColumn;
    const second = secondRow * CAPE.columns + secondColumn;
    const firstPosition = this.positions[first];
    const secondPosition = this.positions[second];
    if (!firstPosition || !secondPosition) return;
    this.constraints.push({
      first,
      second,
      restLength: firstPosition.distanceTo(secondPosition),
      stiffness,
      structural,
    });
  }
}
