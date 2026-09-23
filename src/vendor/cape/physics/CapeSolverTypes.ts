import type * as THREE from 'three';
import type { CapeAnchors } from '../player/Character';
import type { CapsuleCollider } from './colliders';

export interface CapeSimulationOptions {
  /**
   * Worker-owned simulations never render. Skipping their geometry, textures,
   * and material prevents every worker from generating a duplicate fabric
   * atlas and keeps the worker bundle independent from a canvas.
   */
  readonly renderResources?: boolean;
  /** Immutable fabric material shared by same-palette performance bots. */
  readonly material?: THREE.MeshPhysicalMaterial;
}

export interface PackedCapeState {
  readonly positions: Float32Array;
  readonly previous: Float32Array;
}

export interface GpuCapeKernelTiming {
  readonly index: number;
  readonly name: string;
  readonly averageMilliseconds: number;
  readonly minimumMilliseconds: number;
  readonly maximumMilliseconds: number;
  readonly estimatedArithmeticMilliseconds: number;
}

export interface GpuCapeKernelProfile {
  readonly samples: number;
  readonly noOpMilliseconds: number;
  readonly separatePassTotalMilliseconds: number;
  readonly estimatedArithmeticTotalMilliseconds: number;
  readonly kernels: readonly GpuCapeKernelTiming[];
  readonly projectionComponents: {
    readonly fullMilliseconds: number;
    readonly contactsMilliseconds: number;
    readonly selfCollisionMilliseconds: number;
    readonly constraintsAndFoldMilliseconds: number;
  };
}

export interface GpuCapeStepInput {
  readonly anchors: CapeAnchors;
  readonly bodyColliders: readonly CapsuleCollider[];
  readonly characterVelocity: THREE.Vector3;
}

export interface GpuCapeBatchHarnessState {
  readonly capeIndex: number;
  readonly maximumNecklineAttachmentError: number;
  /** Particle triples in neckline-local right/up/back coordinates. */
  readonly particles: readonly number[];
}
