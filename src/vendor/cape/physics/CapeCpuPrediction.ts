import * as THREE from 'three';
import { CAPE, PLAYER } from '../config';
import {
  CAPE_DRAG_PER_SECOND,
  CAPE_FLUTTER_ACCELERATION,
  MAXIMUM_CAPE_PARTICLE_SPEED,
} from './CapeAerodynamics';
import {
  MAXIMUM_PLANAR_CAPE_PARTICLE_SPEED,
  WAKE_SPEED,
} from './CapeSolverConstants';
import type { CapePhysicsSettings } from './CapeSettings';

export class CapeCpuPrediction {
  private readonly velocity = new THREE.Vector3();
  private readonly airflow = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly flutterDirection = new THREE.Vector3();
  private readonly tangentAcross = new THREE.Vector3();
  private readonly tangentDown = new THREE.Vector3();

  public constructor(
    private readonly positions: THREE.Vector3[],
    private readonly previous: THREE.Vector3[],
    private readonly predictedVerticalDisplacement: Float32Array,
  ) {}

  public predict(
    deltaTime: number,
    characterVelocity: THREE.Vector3,
    time: number,
    settings: Pick<CapePhysicsSettings, 'damping' | 'weight'>,
  ): void {
    const characterSpeed = characterVelocity.length();
    const planarSpeed = Math.hypot(characterVelocity.x, characterVelocity.z);
    const movementBlend = THREE.MathUtils.smoothstep(characterSpeed, WAKE_SPEED, 2.4);
    const runningBlend = THREE.MathUtils.smoothstep(
      planarSpeed,
      PLAYER.walkSpeed * 1.02,
      PLAYER.runSpeed * 0.92,
    );
    const locomotionAirflow = THREE.MathUtils.lerp(0.28, 1, runningBlend);
    const velocityAirflow = THREE.MathUtils.lerp(0.32, 1.28, runningBlend);
    this.airflow.set(
      Math.sin(time * 0.47) * 0.38 + Math.sin(time * 1.91) * 0.16,
      0.08 + Math.sin(time * 0.71) * 0.05,
      0.62 + Math.cos(time * 0.31) * 0.24,
    ).multiplyScalar(THREE.MathUtils.lerp(0.025, locomotionAirflow, movementBlend))
      .addScaledVector(characterVelocity, -velocityAirflow);

    const deltaSquared = deltaTime * deltaTime;
    for (let row = 1; row < CAPE.rows; row += 1) {
      for (let column = 0; column < CAPE.columns; column += 1) {
        const index = this.index(column, row);
        const position = this.positions[index];
        const previous = this.previous[index];
        if (!position || !previous) continue;

        const drag = CAPE_DRAG_PER_SECOND * settings.damping;
        this.velocity.copy(position).sub(previous).multiplyScalar(Math.exp(-drag * deltaTime));
        const particlePlanarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        const maximumPlanarDisplacement = MAXIMUM_PLANAR_CAPE_PARTICLE_SPEED * deltaTime;
        if (particlePlanarSpeed > maximumPlanarDisplacement) {
          const planarScale = maximumPlanarDisplacement / particlePlanarSpeed;
          this.velocity.x *= planarScale;
          this.velocity.z *= planarScale;
        }
        this.velocity.y = THREE.MathUtils.clamp(
          this.velocity.y,
          -MAXIMUM_CAPE_PARTICLE_SPEED * deltaTime,
          MAXIMUM_CAPE_PARTICLE_SPEED * deltaTime,
        );
        previous.copy(position);
        this.estimateNormal(column, row);
        const pressure = this.airflow.dot(this.normal);
        const turbulence = Math.sin(time * 4.3 + row * 0.83 + column * 1.71) * 0.42;
        const across = column / (CAPE.columns - 1) - 0.5;
        const flutterEnvelope = Math.sin(Math.PI * row / (CAPE.rows - 1)) ** 2;
        const flutterProfile = 0.3 + across * 0.4;
        const fabricFlutter = Math.sin(time * 3.4 + row * 0.28)
          * flutterProfile
          * flutterEnvelope;
        position.add(this.velocity);
        position.y -= 9.81 * settings.weight * deltaSquared;
        position.addScaledVector(
          this.normal,
          pressure * Math.abs(pressure) * 0.026 * deltaSquared,
        );
        // Synthetic flutter only breaks perfect grid symmetry; it must not
        // become an artificial lift force when contact turns the cape flat.
        this.flutterDirection.copy(this.normal).setY(0);
        position.addScaledVector(
          this.flutterDirection,
          fabricFlutter * movementBlend * CAPE_FLUTTER_ACCELERATION * deltaSquared,
        );
        position.addScaledVector(
          this.airflow,
          (0.048 + turbulence * 0.011) * deltaSquared,
        );
        this.predictedVerticalDisplacement[index] = position.y - previous.y;
      }
    }
  }

  private estimateNormal(column: number, row: number): void {
    const left = this.positions[this.index(Math.max(0, column - 1), row)];
    const right = this.positions[this.index(Math.min(CAPE.columns - 1, column + 1), row)];
    const up = this.positions[this.index(column, Math.max(0, row - 1))];
    const down = this.positions[this.index(column, Math.min(CAPE.rows - 1, row + 1))];
    if (!left || !right || !up || !down) {
      this.normal.set(0, 0, 1);
      return;
    }
    this.tangentAcross.copy(right).sub(left);
    this.tangentDown.copy(down).sub(up);
    this.normal.crossVectors(this.tangentAcross, this.tangentDown).normalize();
  }

  private index(column: number, row: number): number {
    return row * CAPE.columns + column;
  }
}
