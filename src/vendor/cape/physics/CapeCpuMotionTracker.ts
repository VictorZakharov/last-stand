import * as THREE from 'three';
import { CAPE } from '../config';

export interface CapeParticleMotionDiagnostics {
  readonly particleIndex: number;
  readonly displacement: readonly [number, number, number];
  readonly verticalParticleIndex: number;
  readonly verticalDelta: number;
}

export class CapeCpuMotionTracker {
  private readonly stepStart: THREE.Vector3[] = [];
  private maximumParticleMotion = 0;
  private maximumParticleVerticalMotion = 0;
  private maximumParticleMotionIndex = -1;
  private maximumParticleMotionX = 0;
  private maximumParticleMotionY = 0;
  private maximumParticleMotionZ = 0;
  private maximumParticleVerticalMotionIndex = -1;
  private maximumParticleVerticalDelta = 0;

  public constructor(private readonly positions: THREE.Vector3[]) {}

  public captureStepStart(): void {
    this.synchronizeStepStart();
  }

  public synchronizeStepStart(): void {
    this.positions.forEach((position, index) => {
      const start = this.stepStart[index];
      if (start) start.copy(position);
      else this.stepStart.push(position.clone());
    });
  }

  public clearMaximumMotion(): void {
    this.maximumParticleMotion = 0;
    this.maximumParticleVerticalMotion = 0;
  }

  public measureStepMotion(): void {
    let maximum = 0;
    let maximumVertical = 0;
    this.maximumParticleMotionIndex = -1;
    this.maximumParticleVerticalMotionIndex = -1;
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const start = this.stepStart[index];
      if (!position || !start) continue;
      const deltaX = position.x - start.x;
      const deltaY = position.y - start.y;
      const deltaZ = position.z - start.z;
      const motion = Math.hypot(deltaX, deltaY, deltaZ);
      if (motion > maximum) {
        maximum = motion;
        this.maximumParticleMotionIndex = index;
        this.maximumParticleMotionX = deltaX;
        this.maximumParticleMotionY = deltaY;
        this.maximumParticleMotionZ = deltaZ;
      }
      if (Math.abs(deltaY) > maximumVertical) {
        maximumVertical = Math.abs(deltaY);
        this.maximumParticleVerticalMotionIndex = index;
        this.maximumParticleVerticalDelta = deltaY;
      }
    }
    this.maximumParticleMotion = maximum;
    this.maximumParticleVerticalMotion = maximumVertical;
  }

  public getMaximumParticleMotion(): number {
    return this.maximumParticleMotion;
  }

  public getMaximumParticleVerticalMotion(): number {
    return this.maximumParticleVerticalMotion;
  }

  public getDiagnostics(): CapeParticleMotionDiagnostics {
    return {
      particleIndex: this.maximumParticleMotionIndex,
      displacement: [
        this.maximumParticleMotionX,
        this.maximumParticleMotionY,
        this.maximumParticleMotionZ,
      ],
      verticalParticleIndex: this.maximumParticleVerticalMotionIndex,
      verticalDelta: this.maximumParticleVerticalDelta,
    };
  }
}
