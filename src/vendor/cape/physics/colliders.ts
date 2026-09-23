import type * as THREE from 'three';

export interface CapsuleCollider {
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly radius: number;
  readonly depthRadius?: number;
  readonly name: string;
  readonly clearance?: number;
  readonly faceSampleSpacing?: number;
}

export type WorldColliderKind = 'formation' | 'rock' | 'torch' | 'mineral';

interface WorldColliderBase {
  readonly center: THREE.Vector3;
  readonly radius: number;
  readonly walkable: boolean;
  readonly kind: WorldColliderKind;
}

export interface WorldSphereCollider extends WorldColliderBase {
  readonly shape?: 'sphere';
}

export interface WorldRockFace {
  readonly triangle: THREE.Triangle;
  readonly normal: THREE.Vector3;
  readonly planeConstant: number;
  readonly bounds: THREE.Box3;
}

export interface WorldRockCollider extends WorldColliderBase {
  readonly shape: 'convex-rock';
  readonly kind: 'rock';
  readonly bounds: THREE.Box3;
  readonly faces: readonly WorldRockFace[];
}

export type WorldCollider = WorldSphereCollider | WorldRockCollider;

export function isWorldRockCollider(collider: WorldCollider): collider is WorldRockCollider {
  return collider.shape === 'convex-rock';
}
