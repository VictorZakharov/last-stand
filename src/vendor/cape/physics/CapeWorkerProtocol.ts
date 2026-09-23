import * as THREE from 'three';
import type { CapeAnchors } from '../player/Character';
import type { CapePhysicsSettings } from './CapeSettings';
import {
  isWorldRockCollider,
  type CapsuleCollider,
  type WorldCollider,
  type WorldColliderKind,
} from './colliders';

export type SerializedVector3 = readonly [number, number, number];

export interface SerializedCapeAnchors {
  readonly left: SerializedVector3;
  readonly right: SerializedVector3;
  readonly back: SerializedVector3;
}

export interface SerializedCapsuleCollider {
  readonly start: SerializedVector3;
  readonly end: SerializedVector3;
  readonly radius: number;
  readonly depthRadius?: number;
  readonly name: string;
  readonly clearance?: number;
  readonly faceSampleSpacing?: number;
}

interface SerializedWorldColliderBase {
  readonly center: SerializedVector3;
  readonly radius: number;
  readonly walkable: boolean;
  readonly kind: WorldColliderKind;
}

export interface SerializedWorldSphereCollider extends SerializedWorldColliderBase {
  readonly shape: 'sphere';
}

export interface SerializedWorldRockFace {
  readonly a: SerializedVector3;
  readonly b: SerializedVector3;
  readonly c: SerializedVector3;
  readonly normal: SerializedVector3;
  readonly planeConstant: number;
  readonly boundsMin: SerializedVector3;
  readonly boundsMax: SerializedVector3;
}

export interface SerializedWorldRockCollider extends SerializedWorldColliderBase {
  readonly shape: 'convex-rock';
  readonly kind: 'rock';
  readonly boundsMin: SerializedVector3;
  readonly boundsMax: SerializedVector3;
  readonly faces: readonly SerializedWorldRockFace[];
}

export type SerializedWorldCollider =
  | SerializedWorldSphereCollider
  | SerializedWorldRockCollider;

export interface SerializedCapeStepInput {
  readonly capeId: number;
  readonly anchors: SerializedCapeAnchors;
  /** Packed start.xyz/end.xyz values; collider metadata is registered once. */
  readonly bodyColliderEndpoints: Float32Array;
  readonly characterVelocity: SerializedVector3;
}

export interface CapeWorkerStepFrame {
  readonly deltaTime: number;
  readonly time: number;
  readonly capes: readonly SerializedCapeStepInput[];
}

export interface CapeWorkerInitializeMessage {
  readonly type: 'initialize';
  readonly worldColliders: readonly SerializedWorldCollider[];
}

export interface CapeWorkerAddCapeMessage {
  readonly type: 'add-cape';
  readonly capeId: number;
  readonly revision: number;
  readonly anchors: SerializedCapeAnchors;
  readonly bodyColliders: readonly SerializedCapsuleCollider[];
  readonly settings: CapePhysicsSettings;
  readonly positions: Float32Array;
  readonly previous: Float32Array;
}

export interface CapeWorkerUpdateCapeMessage {
  readonly type: 'update-cape';
  readonly capeId: number;
  readonly revision: number;
  readonly anchors: SerializedCapeAnchors;
  readonly settings: CapePhysicsSettings;
  readonly positions: Float32Array;
  readonly previous: Float32Array;
}

export interface CapeWorkerRemoveCapeMessage {
  readonly type: 'remove-cape';
  readonly capeId: number;
}

export interface CapeWorkerStepBatchMessage {
  readonly type: 'step-batch';
  readonly requestId: number;
  readonly frames: readonly CapeWorkerStepFrame[];
}

export interface CapeWorkerDisposeMessage {
  readonly type: 'dispose';
}

export type CapeWorkerRequest =
  | CapeWorkerInitializeMessage
  | CapeWorkerAddCapeMessage
  | CapeWorkerUpdateCapeMessage
  | CapeWorkerRemoveCapeMessage
  | CapeWorkerStepBatchMessage
  | CapeWorkerDisposeMessage;

export interface CapeWorkerResultState {
  readonly capeId: number;
  readonly revision: number;
  readonly positions: Float32Array;
  readonly previous: Float32Array;
}

export interface CapeWorkerBatchResult {
  readonly type: 'batch-result';
  readonly requestId: number;
  readonly states: readonly CapeWorkerResultState[];
}

export interface CapeWorkerFailure {
  readonly type: 'failure';
  readonly message: string;
}

export type CapeWorkerResponse = CapeWorkerBatchResult | CapeWorkerFailure;

export function serializeVector3(vector: THREE.Vector3): SerializedVector3 {
  return [vector.x, vector.y, vector.z];
}

export function deserializeVector3(vector: SerializedVector3): THREE.Vector3 {
  return new THREE.Vector3(vector[0], vector[1], vector[2]);
}

export function serializeCapeAnchors(anchors: CapeAnchors): SerializedCapeAnchors {
  return {
    left: serializeVector3(anchors.left),
    right: serializeVector3(anchors.right),
    back: serializeVector3(anchors.back),
  };
}

export function deserializeCapeAnchors(anchors: SerializedCapeAnchors): CapeAnchors {
  return {
    left: deserializeVector3(anchors.left),
    right: deserializeVector3(anchors.right),
    back: deserializeVector3(anchors.back),
  };
}

export function copySerializedCapeAnchors(
  source: SerializedCapeAnchors,
  target: CapeAnchors,
): void {
  target.left.fromArray(source.left);
  target.right.fromArray(source.right);
  target.back.fromArray(source.back);
}

export function serializeCapsuleColliders(
  colliders: readonly CapsuleCollider[],
): readonly SerializedCapsuleCollider[] {
  return colliders.map((collider) => ({
    start: serializeVector3(collider.start),
    end: serializeVector3(collider.end),
    radius: collider.radius,
    depthRadius: collider.depthRadius,
    name: collider.name,
    clearance: collider.clearance,
    faceSampleSpacing: collider.faceSampleSpacing,
  }));
}

export function deserializeCapsuleColliders(
  colliders: readonly SerializedCapsuleCollider[],
): readonly CapsuleCollider[] {
  return colliders.map((collider) => ({
    start: deserializeVector3(collider.start),
    end: deserializeVector3(collider.end),
    radius: collider.radius,
    depthRadius: collider.depthRadius,
    name: collider.name,
    clearance: collider.clearance,
    faceSampleSpacing: collider.faceSampleSpacing,
  }));
}

export function serializeCapsuleEndpoints(
  colliders: readonly CapsuleCollider[],
): Float32Array {
  const endpoints = new Float32Array(colliders.length * 6);
  colliders.forEach((collider, index) => {
    collider.start.toArray(endpoints, index * 6);
    collider.end.toArray(endpoints, index * 6 + 3);
  });
  return endpoints;
}

export function applySerializedCapsuleEndpoints(
  endpoints: Float32Array,
  colliders: readonly CapsuleCollider[],
): void {
  if (endpoints.length !== colliders.length * 6) {
    throw new RangeError('Cape worker body-collider endpoint count changed after registration.');
  }
  colliders.forEach((collider, index) => {
    collider.start.fromArray(endpoints, index * 6);
    collider.end.fromArray(endpoints, index * 6 + 3);
  });
}

export function serializeWorldColliders(
  colliders: readonly WorldCollider[],
): readonly SerializedWorldCollider[] {
  return colliders.map((collider) => {
    if (!isWorldRockCollider(collider)) {
      return {
        shape: 'sphere',
        center: serializeVector3(collider.center),
        radius: collider.radius,
        walkable: collider.walkable,
        kind: collider.kind,
      };
    }
    return {
      shape: 'convex-rock',
      center: serializeVector3(collider.center),
      radius: collider.radius,
      walkable: collider.walkable,
      kind: collider.kind,
      boundsMin: serializeVector3(collider.bounds.min),
      boundsMax: serializeVector3(collider.bounds.max),
      faces: collider.faces.map((face) => ({
        a: serializeVector3(face.triangle.a),
        b: serializeVector3(face.triangle.b),
        c: serializeVector3(face.triangle.c),
        normal: serializeVector3(face.normal),
        planeConstant: face.planeConstant,
        boundsMin: serializeVector3(face.bounds.min),
        boundsMax: serializeVector3(face.bounds.max),
      })),
    };
  });
}

export function deserializeWorldColliders(
  colliders: readonly SerializedWorldCollider[],
): readonly WorldCollider[] {
  return colliders.map((collider) => {
    if (collider.shape === 'sphere') {
      return {
        center: deserializeVector3(collider.center),
        radius: collider.radius,
        walkable: collider.walkable,
        kind: collider.kind,
        shape: 'sphere',
      };
    }
    return {
      center: deserializeVector3(collider.center),
      radius: collider.radius,
      walkable: collider.walkable,
      kind: collider.kind,
      shape: 'convex-rock',
      bounds: new THREE.Box3(
        deserializeVector3(collider.boundsMin),
        deserializeVector3(collider.boundsMax),
      ),
      faces: collider.faces.map((face) => ({
        triangle: new THREE.Triangle(
          deserializeVector3(face.a),
          deserializeVector3(face.b),
          deserializeVector3(face.c),
        ),
        normal: deserializeVector3(face.normal),
        planeConstant: face.planeConstant,
        bounds: new THREE.Box3(
          deserializeVector3(face.boundsMin),
          deserializeVector3(face.boundsMax),
        ),
      })),
    };
  });
}
