import * as THREE from 'three';
import { CAPE, CAVE } from '../config';
import {
  caveCeiling,
  caveGroundHeightAt,
  caveInteriorBoundsAtHeight,
} from '../world/caveProfile';
import type { CaveHorizontalBounds } from '../world/CaveShellSampler';
import {
  isWorldRockCollider,
  type CapsuleCollider,
  type WorldCollider,
  type WorldRockCollider,
  type WorldSphereCollider,
} from './colliders';
import {
  ClothBodyCollision,
  getClothBodyClearance,
  getClothBodyDepthRadius,
} from './ClothBodyCollision';
import { ClothRockCollision } from './ClothRockCollision';
import { ClothCaveCollision } from './ClothCaveCollision';
import {
  CLOTH_ROCK_CLEARANCE,
  CLOTH_WORLD_CLEARANCE,
  ClothWorldCollision,
  getClothWorldClearance,
} from './ClothWorldCollision';
import { constrainSphereContactToFloor } from './floorConstrainedContact';
import {
  isBelowWalkableRockShoulder,
  RockColliderQuery,
} from './RockCollider';

const WORLD_QUERY_RADIUS = CAPE.lengthRange.max + 2.2;
const WORLD_BROADPHASE_SKIN = 0.08;
const CAVE_PROFILE_REFRESH_MARGIN = 0.16;
const BODY_FACE_SOLVER_PASSES = 3;
const CAVE_FACE_SOLVER_PASSES = 3;
// Discrete overlap recovery must not move one cloth particle by a sizeable
// fraction of a segment in one 120 Hz step. Continuous sweeps remain
// available for physical per-frame motion, so intentional motion cannot
// tunnel while iterative constraint displacement cannot masquerade as speed.
const MAXIMUM_DISCRETE_ROCK_CORRECTION = 0.015;
const MAXIMUM_BLOCKING_ROCK_CORRECTION = 0.03;
const MAXIMUM_CONTINUOUS_ROCK_SWEEP = 0.08;

interface PreparedBodyCollider {
  startX: number;
  startY: number;
  startZ: number;
  axisX: number;
  axisY: number;
  axisZ: number;
  lateralAxisX: number;
  lateralAxisY: number;
  lateralAxisZ: number;
  lateralLengthSquared: number;
  lateralRadius: number;
  depthRadius: number;
  minimumY: number;
  maximumY: number;
}

export interface WorldContactDiagnostics {
  readonly lastStep: number;
  readonly total: number;
}

export interface RockSurfaceContactDiagnostics {
  readonly distance: number;
  readonly center: readonly [number, number, number];
}

export interface EnvironmentPenetrationDiagnostics {
  readonly sphere: number;
  readonly rock: number;
  readonly floor: number;
  readonly wall: number;
  readonly sphereFace: number;
  readonly rockFace: number;
  readonly caveFace: number;
  readonly maximum: number;
  readonly floorParticleIndex: number | null;
  readonly floorPosition: readonly [number, number, number] | null;
  readonly floorHeight: number | null;
  readonly rockParticleIndex: number | null;
  readonly rockPosition: readonly [number, number, number] | null;
  readonly rockCenter: readonly [number, number, number] | null;
  readonly rockWalkable: boolean | null;
  readonly rockFaceDetail: {
    readonly triangle: readonly [number, number, number] | null;
    readonly positions: readonly [number, number, number][] | null;
    readonly previous: readonly [number, number, number][] | null;
    readonly rockCenter: readonly [number, number, number] | null;
  };
}

export interface BodyPenetrationDiagnostics {
  readonly point: number;
  readonly face: number;
  readonly maximum: number;
  readonly geometricPoint: number;
  readonly geometricFace: number;
  readonly geometricMaximum: number;
}

export class CapeContactSolver {
  private readonly nearbyWorldColliders: WorldCollider[] = [];
  private readonly activeWorldColliders: WorldCollider[] = [];
  private readonly activeWorldSpheres: WorldSphereCollider[] = [];
  private readonly activeRocks: WorldRockCollider[] = [];
  private readonly preparedBodyColliders: PreparedBodyCollider[] = [];
  private readonly delta = new THREE.Vector3();
  private readonly sweep = new THREE.Vector3();
  private readonly sweepStart = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly contactNormal = new THREE.Vector3();
  private readonly bodySideOrigin = new THREE.Vector3();
  private readonly remainingMotion = new THREE.Vector3();
  private readonly boundsMinimum = new THREE.Vector3();
  private readonly boundsMaximum = new THREE.Vector3();
  private readonly caveBounds: CaveHorizontalBounds = { minimum: 0, maximum: 0 };
  private worldContactsLastStep = 0;
  private worldContactEvents = 0;
  private bodySolvePass = 0;
  private caveSolvePass = 0;
  private readonly bodyFaceCollision: ClothBodyCollision;
  private readonly faceCollision: ClothWorldCollision;
  private readonly rockFaceCollision: ClothRockCollision;
  private readonly caveFaceCollision: ClothCaveCollision;
  private readonly rockQuery = new RockColliderQuery();
  private readonly rockCorrectionUsed: Float32Array;
  private readonly bodyCorrectionUsed: Float32Array;
  private readonly rockSweepResolved: Uint8Array;
  private readonly caveFloor: Float64Array;
  private readonly caveCeilingHeight: Float64Array;
  private readonly caveMinimumX: Float64Array;
  private readonly caveMaximumX: Float64Array;
  private readonly caveNearBoundary: Uint8Array;
  private readonly caveNearWall: Uint8Array;

  public constructor(
    private readonly positions: readonly THREE.Vector3[],
    private readonly previous: readonly THREE.Vector3[],
    inverseMass: Float32Array,
  ) {
    this.rockCorrectionUsed = new Float32Array(inverseMass.length);
    this.bodyCorrectionUsed = new Float32Array(inverseMass.length);
    this.rockSweepResolved = new Uint8Array(inverseMass.length);
    this.caveFloor = new Float64Array(inverseMass.length);
    this.caveCeilingHeight = new Float64Array(inverseMass.length);
    this.caveMinimumX = new Float64Array(inverseMass.length);
    this.caveMaximumX = new Float64Array(inverseMass.length);
    this.caveNearBoundary = new Uint8Array(inverseMass.length);
    this.caveNearWall = new Uint8Array(inverseMass.length);
    this.bodyFaceCollision = new ClothBodyCollision(
      positions,
      previous,
      inverseMass,
      CAPE.columns,
      CAPE.rows,
    );
    this.caveFaceCollision = new ClothCaveCollision(
      positions,
      previous,
      inverseMass,
      CAPE.columns,
      CAPE.rows,
      this.caveNearWall,
    );
    this.faceCollision = new ClothWorldCollision(
      positions,
      previous,
      inverseMass,
      CAPE.columns,
      CAPE.rows,
    );
    this.rockFaceCollision = new ClothRockCollision(
      positions,
      previous,
      inverseMass,
      CAPE.columns,
      CAPE.rows,
      CLOTH_ROCK_CLEARANCE,
    );
  }

  public beginStep(
    anchorCenter: THREE.Vector3,
    colliders: readonly WorldCollider[],
    bodyColliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): void {
    this.worldContactsLastStep = 0;
    this.bodySolvePass = 0;
    this.caveSolvePass = 0;
    this.prepareBodyColliders(bodyColliders, back);
    this.bodySideOrigin.copy(anchorCenter);
    this.bodyCorrectionUsed.fill(0);
    this.bodyFaceCollision.beginStep();
    this.rockCorrectionUsed.fill(0);
    this.rockSweepResolved.fill(0);
    this.faceCollision.beginStep();
    this.rockFaceCollision.beginStep();
    this.nearbyWorldColliders.length = 0;
    for (const collider of colliders) {
      const range = WORLD_QUERY_RADIUS + collider.radius;
      if (collider.center.distanceToSquared(anchorCenter) <= range * range) {
        this.nearbyWorldColliders.push(collider);
      }
    }
  }

  public solveBody(colliders: readonly CapsuleCollider[], back: THREE.Vector3): void {
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      for (const collider of this.preparedBodyColliders) {
        const topologySide = index % CAPE.columns / (CAPE.columns - 1) - 0.5;
        const penetration = this.getCapsulePenetration(
          position,
          collider,
          back,
          previous,
          topologySide,
        );
        if (penetration <= 0) continue;
        position.addScaledVector(this.contactNormal, penetration);
        previous.addScaledVector(this.contactNormal, penetration);
        this.removeInwardMotion(position, previous, this.contactNormal);
        this.bodyCorrectionUsed[index] = (this.bodyCorrectionUsed[index] ?? 0) + penetration;
      }
    }
    this.bodySolvePass += 1;
    if (this.bodySolvePass > CAPE.solverIterations - BODY_FACE_SOLVER_PASSES) {
      this.bodyFaceCollision.solve(colliders, back, this.bodySideOrigin);
    }
  }

  public solveWorld(): void {
    this.updateActiveWorldColliders();
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      for (const collider of this.activeWorldColliders) {
        isWorldRockCollider(collider)
          ? this.solveWorldRock(index, position, previous, collider)
          : this.solveWorldSphere(position, previous, collider);
      }
    }
    const sphereFaceContacts = this.faceCollision.solve(this.activeWorldSpheres);
    const rockFaceContacts = this.rockFaceCollision.solve(this.activeRocks);
    const faceContacts = sphereFaceContacts + rockFaceContacts;
    this.worldContactsLastStep += faceContacts;
    this.worldContactEvents += faceContacts;
  }

  public solvePostCaveWorldContacts(): number {
    if (
      this.activeWorldSpheres.length === 0
      && this.activeRocks.length === 0
    ) return 0;
    // Cave and body projection can reintroduce a vertex or face contact after
    // the ordinary world pass. Recheck every broad-phase candidate so the
    // final rendered state is authoritative, including first-step floor
    // projection beside a formation. Ordinary iterations remain correction-
    // bounded; this final pass mirrors the GPU solver's hard recovery and its
    // inward-velocity damping prevents the exact expulsion from adding energy.
    this.rockFaceCollision.beginPass();
    let vertexContacts = 0;
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      for (const collider of this.activeWorldColliders) {
        if (
          isWorldRockCollider(collider)
            ? this.solveWorldRock(index, position, previous, collider, true)
            : this.solveWorldSphere(position, previous, collider)
        ) vertexContacts += 1;
      }
    }
    const faceContacts = this.faceCollision.solve(this.activeWorldSpheres)
      + this.rockFaceCollision.solve(this.activeRocks);
    this.worldContactsLastStep += faceContacts;
    this.worldContactEvents += faceContacts;
    return vertexContacts + faceContacts;
  }

  public solveCave(): void {
    this.caveSolvePass += 1;
    // Constraint projection moves particles only a few centimetres per pass.
    // Reuse the static cave samples between the first and final pass, while
    // still applying their bounds every pass. Particles close to the floor,
    // wall, or ceiling resample every pass, and the final refresh preserves
    // exact contact after all intervening body and cloth corrections.
    const refreshAllProfiles = this.caveSolvePass === 1
      || this.caveSolvePass >= CAPE.solverIterations;
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      const refreshProfile = refreshAllProfiles || this.caveNearBoundary[index] === 1;

      const clampedZ = THREE.MathUtils.clamp(position.z, CAVE.endZ + 0.08, CAVE.startZ - 0.08);
      if (clampedZ !== position.z) this.applyAxisCorrection(position, previous, 'z', clampedZ - position.z);

      const floor = refreshProfile
        ? caveGroundHeightAt(position.x, position.z) + CLOTH_WORLD_CLEARANCE
        : this.caveFloor[index] ?? 0;
      if (refreshProfile) this.caveFloor[index] = floor;
      if (position.y < floor) this.applyAxisCorrection(position, previous, 'y', floor - position.y);

      const ceiling = refreshProfile
        ? caveCeiling(position.z) + 0.12 - CLOTH_WORLD_CLEARANCE
        : this.caveCeilingHeight[index] ?? 0;
      if (refreshProfile) this.caveCeilingHeight[index] = ceiling;
      if (position.y > ceiling) this.applyAxisCorrection(position, previous, 'y', ceiling - position.y);

      if (refreshProfile) {
        caveInteriorBoundsAtHeight(
          position.y,
          position.z,
          CLOTH_WORLD_CLEARANCE,
          this.caveBounds,
        );
        this.caveMinimumX[index] = this.caveBounds.minimum;
        this.caveMaximumX[index] = this.caveBounds.maximum;
      }
      const clampedX = THREE.MathUtils.clamp(
        position.x,
        this.caveMinimumX[index] ?? 0,
        this.caveMaximumX[index] ?? 0,
      );
      if (clampedX !== position.x) this.applyAxisCorrection(position, previous, 'x', clampedX - position.x);
      if (refreshProfile) {
        this.caveNearWall[index] = (
          position.x - this.caveMinimumX[index]! < CAVE_PROFILE_REFRESH_MARGIN
          || this.caveMaximumX[index]! - position.x < CAVE_PROFILE_REFRESH_MARGIN
        ) ? 1 : 0;
        this.caveNearBoundary[index] = (
          position.y - floor < CAVE_PROFILE_REFRESH_MARGIN
          || ceiling - position.y < CAVE_PROFILE_REFRESH_MARGIN
          || this.caveNearWall[index] === 1
        ) ? 1 : 0;
      }
    }
    if (this.caveSolvePass > CAPE.solverIterations - CAVE_FACE_SOLVER_PASSES) {
      this.caveFaceCollision.solve();
    }
  }

  public getMaximumBodyPenetration(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): number {
    return this.getBodyPenetrationDiagnostics(colliders, back).maximum;
  }

  public getBodyPenetrationDiagnostics(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): BodyPenetrationDiagnostics {
    this.prepareBodyColliders(colliders, back);
    let point = 0;
    let geometricPoint = 0;
    for (let index = 0; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      if (!position) continue;
      for (const collider of this.preparedBodyColliders) {
        point = Math.max(point, this.getCapsulePenetration(position, collider, back));
        geometricPoint = Math.max(
          geometricPoint,
          this.getCapsulePenetration(position, collider, back, position, 0, true),
        );
      }
    }
    const face = this.bodyFaceCollision.getMaximumPenetration(colliders, back);
    const geometricFace = this.bodyFaceCollision.getMaximumGeometricPenetration(
      colliders,
      back,
    );
    return {
      point,
      face,
      maximum: Math.max(point, face),
      geometricPoint,
      geometricFace,
      geometricMaximum: Math.max(geometricPoint, geometricFace),
    };
  }

  public getMaximumEnvironmentPenetration(colliders: readonly WorldCollider[]): number {
    return this.getEnvironmentPenetrationDiagnostics(colliders).maximum;
  }

  public getEnvironmentPenetrationDiagnostics(
    colliders: readonly WorldCollider[],
  ): EnvironmentPenetrationDiagnostics {
    let sphere = 0;
    let rock = 0;
    let floor = 0;
    let wall = 0;
    let floorParticleIndex: number | null = null;
    let floorPosition: readonly [number, number, number] | null = null;
    let floorHeight: number | null = null;
    let rockParticleIndex: number | null = null;
    let rockPosition: readonly [number, number, number] | null = null;
    let rockCenter: readonly [number, number, number] | null = null;
    let rockWalkable: boolean | null = null;
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      if (!position) continue;
      for (const collider of colliders) {
        const penetration = isWorldRockCollider(collider)
          ? CLOTH_ROCK_CLEARANCE
            - this.rockQuery.getSignedDistance(collider, position, this.contactNormal)
          : collider.radius
            + getClothWorldClearance(collider)
            - position.distanceTo(collider.center);
        if (isWorldRockCollider(collider)) {
          if (penetration > rock) {
            rock = penetration;
            rockParticleIndex = index;
            rockPosition = [position.x, position.y, position.z];
            rockCenter = [collider.center.x, collider.center.y, collider.center.z];
            rockWalkable = collider.walkable;
          }
        } else sphere = Math.max(sphere, penetration);
      }
      const expectedFloor = caveGroundHeightAt(position.x, position.z) + CLOTH_WORLD_CLEARANCE;
      const floorPenetration = expectedFloor - position.y;
      if (floorPenetration > floor) {
        floor = floorPenetration;
        floorParticleIndex = index;
        floorPosition = [position.x, position.y, position.z];
        floorHeight = expectedFloor;
      }
      caveInteriorBoundsAtHeight(
        position.y,
        position.z,
        CLOTH_WORLD_CLEARANCE,
        this.caveBounds,
      );
      wall = Math.max(
        wall,
        this.caveBounds.minimum - position.x,
        position.x - this.caveBounds.maximum,
      );
    }
    const sphereFace = this.faceCollision.getMaximumPenetration(
      colliders.filter((collider): collider is WorldSphereCollider => !isWorldRockCollider(collider)),
    );
    const rockFaceDiagnostics = this.rockFaceCollision.getMaximumPenetrationDiagnostics(
      colliders.filter(isWorldRockCollider),
    );
    const rockFace = rockFaceDiagnostics.maximum;
    const caveFace = this.caveFaceCollision.getMaximumPenetration();
    return {
      sphere,
      rock,
      floor,
      wall,
      sphereFace,
      rockFace,
      caveFace,
      maximum: Math.max(sphere, rock, floor, wall, sphereFace, rockFace, caveFace),
      floorParticleIndex,
      floorPosition,
      floorHeight,
      rockParticleIndex,
      rockPosition,
      rockCenter,
      rockWalkable,
      rockFaceDetail: {
        triangle: rockFaceDiagnostics.triangle,
        positions: rockFaceDiagnostics.positions,
        previous: rockFaceDiagnostics.previous,
        rockCenter: rockFaceDiagnostics.rockCenter,
      },
    };
  }

  public getMaximumEnvironmentFacePenetration(colliders: readonly WorldCollider[]): number {
    return Math.max(
      this.faceCollision.getMaximumPenetration(
        colliders.filter((collider): collider is WorldSphereCollider => !isWorldRockCollider(collider)),
      ),
      this.rockFaceCollision.getMaximumPenetration(colliders.filter(isWorldRockCollider)),
      this.caveFaceCollision.getMaximumPenetration(),
    );
  }

  public getClosestActiveRockSurfaceContact(
    colliders: readonly WorldCollider[] = this.activeRocks,
  ): RockSurfaceContactDiagnostics | null {
    const contact = this.rockFaceCollision.getClosestSurfaceContact(
      colliders.filter(isWorldRockCollider),
    );
    if (!contact) return null;
    const { center } = contact.collider;
    return {
      distance: contact.distance,
      center: [center.x, center.y, center.z],
    };
  }

  public getDiagnostics(): WorldContactDiagnostics {
    return { lastStep: this.worldContactsLastStep, total: this.worldContactEvents };
  }

  public getBodyCorrectionUsed(index: number): number {
    return (this.bodyCorrectionUsed[index] ?? 0)
      + this.bodyFaceCollision.getCorrectionUsed(index);
  }

  public getParticleRockCorrectionDiagnostics(index: number) {
    return {
      pointCorrection: this.rockCorrectionUsed[index] ?? 0,
      faceCorrection: this.rockFaceCollision.getCorrectionUsed(index),
      swept: this.rockSweepResolved[index] === 1,
      bodyPointCorrection: this.bodyCorrectionUsed[index] ?? 0,
      bodyFaceCorrection: this.bodyFaceCollision.getCorrectionUsed(index),
    };
  }

  private getCapsulePenetration(
    position: THREE.Vector3,
    prepared: PreparedBodyCollider,
    back: THREE.Vector3,
    preferredPosition: THREE.Vector3 = position,
    preferredTopologySide = 0,
    geometric = false,
  ): number {
    if (position.y < prepared.minimumY || position.y > prepared.maximumY) return 0;
    const fromStartX = position.x - prepared.startX;
    const fromStartY = position.y - prepared.startY;
    const fromStartZ = position.z - prepared.startZ;
    const particleDepth = fromStartX * back.x
      + fromStartY * back.y
      + fromStartZ * back.z;
    const particleLateralX = fromStartX - back.x * particleDepth;
    const particleLateralY = fromStartY - back.y * particleDepth;
    const particleLateralZ = fromStartZ - back.z * particleDepth;
    const progress = prepared.lateralLengthSquared > 0.000_001
      ? THREE.MathUtils.clamp(
        (
          particleLateralX * prepared.lateralAxisX
          + particleLateralY * prepared.lateralAxisY
          + particleLateralZ * prepared.lateralAxisZ
        ) / prepared.lateralLengthSquared,
        0,
        1,
      )
      : 0;
    const closestX = prepared.startX + prepared.axisX * progress;
    const closestY = prepared.startY + prepared.axisY * progress;
    const closestZ = prepared.startZ + prepared.axisZ * progress;
    const deltaX = position.x - closestX;
    const deltaY = position.y - closestY;
    const deltaZ = position.z - closestZ;
    const depth = deltaX * back.x + deltaY * back.y + deltaZ * back.z;
    const lateralSquared = Math.max(
      0,
      deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ - depth * depth,
    );
    if (lateralSquared >= prepared.lateralRadius * prepared.lateralRadius) return 0;
    const normalizedLateralSquared = lateralSquared
      / (prepared.lateralRadius * prepared.lateralRadius);
    if (geometric) {
      const normalizedDistanceSquared = normalizedLateralSquared
        + depth * depth / (prepared.depthRadius * prepared.depthRadius);
      if (normalizedDistanceSquared >= 1) return 0;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      if (normalizedDistanceSquared < 0.000_001 || distance < 0.000_001) {
        return Math.min(prepared.lateralRadius, prepared.depthRadius);
      }
      return distance * (1 / Math.sqrt(normalizedDistanceSquared) - 1);
    }
    const surfaceDepth = prepared.depthRadius
      * Math.sqrt(1 - normalizedLateralSquared);
    const backCorrection = Math.max(0, surfaceDepth - depth);
    this.contactNormal.copy(back);
    if (backCorrection <= 0 || depth >= 0) return backCorrection;

    // A front-side particle should slide around the capsule instead of being
    // teleported through the full body depth to the cape side. Keep normal
    // one-sided response once it is behind the collider.
    if (depth <= -prepared.depthRadius) return 0;
    const depthRatio = THREE.MathUtils.clamp(depth / prepared.depthRadius, -1, 0);
    const lateralBoundary = prepared.lateralRadius
      * Math.sqrt(Math.max(0, 1 - depthRatio * depthRatio));
    const rightX = back.z;
    const rightZ = -back.x;
    const spatialSide = (preferredPosition.x - this.bodySideOrigin.x) * rightX
      + (preferredPosition.z - this.bodySideOrigin.z) * rightZ;
    const preferredSide = Math.abs(preferredTopologySide) > 0.000_001
      ? preferredTopologySide
      : spatialSide;
    if (Math.abs(preferredSide) > 0.000_001) {
      const sideSign = Math.sign(preferredSide);
      this.contactNormal.set(rightX * sideSign, 0, rightZ * sideSign);
    } else {
      const preferredDeltaX = preferredPosition.x - closestX;
      const preferredDeltaY = preferredPosition.y - closestY;
      const preferredDeltaZ = preferredPosition.z - closestZ;
      const preferredDepth = preferredDeltaX * back.x
        + preferredDeltaY * back.y
        + preferredDeltaZ * back.z;
      this.contactNormal.set(
        preferredDeltaX - back.x * preferredDepth,
        preferredDeltaY - back.y * preferredDepth,
        preferredDeltaZ - back.z * preferredDepth,
      );
      this.contactNormal.y = 0;
      if (this.contactNormal.lengthSq() > 0.000_001) this.contactNormal.normalize();
      else if (lateralSquared > 0.000_001) {
        this.contactNormal.set(
          deltaX - back.x * depth,
          deltaY - back.y * depth,
          deltaZ - back.z * depth,
        ).normalize();
      } else this.contactNormal.set(rightX, 0, rightZ).normalize();
    }
    const lateralProjection = deltaX * this.contactNormal.x
      + deltaY * this.contactNormal.y
      + deltaZ * this.contactNormal.z;
    const lateralCorrection = lateralBoundary - lateralProjection;
    return lateralCorrection > 0 ? lateralCorrection : backCorrection;
  }

  private prepareBodyColliders(
    colliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): void {
    this.preparedBodyColliders.length = colliders.length;
    for (let index = 0; index < colliders.length; index += 1) {
      const collider = colliders[index];
      if (!collider) continue;
      const prepared = this.preparedBodyColliders[index] ?? {
        startX: 0,
        startY: 0,
        startZ: 0,
        axisX: 0,
        axisY: 0,
        axisZ: 0,
        lateralAxisX: 0,
        lateralAxisY: 0,
        lateralAxisZ: 0,
        lateralLengthSquared: 0,
        lateralRadius: 0,
        depthRadius: 0,
        minimumY: 0,
        maximumY: 0,
      };
      const axisX = collider.end.x - collider.start.x;
      const axisY = collider.end.y - collider.start.y;
      const axisZ = collider.end.z - collider.start.z;
      const axisDepth = axisX * back.x + axisY * back.y + axisZ * back.z;
      const lateralAxisX = axisX - back.x * axisDepth;
      const lateralAxisY = axisY - back.y * axisDepth;
      const lateralAxisZ = axisZ - back.z * axisDepth;
      const lateralRadius = collider.radius + getClothBodyClearance(collider);
      const depthRadius = getClothBodyDepthRadius(collider);
      const verticalRadius = Math.max(lateralRadius, depthRadius);
      prepared.startX = collider.start.x;
      prepared.startY = collider.start.y;
      prepared.startZ = collider.start.z;
      prepared.axisX = axisX;
      prepared.axisY = axisY;
      prepared.axisZ = axisZ;
      prepared.lateralAxisX = lateralAxisX;
      prepared.lateralAxisY = lateralAxisY;
      prepared.lateralAxisZ = lateralAxisZ;
      prepared.lateralLengthSquared = lateralAxisX * lateralAxisX
        + lateralAxisY * lateralAxisY
        + lateralAxisZ * lateralAxisZ;
      prepared.lateralRadius = lateralRadius;
      prepared.depthRadius = depthRadius;
      if (Math.abs(back.y) < 0.000_1) {
        prepared.minimumY = Math.min(collider.start.y, collider.end.y) - verticalRadius;
        prepared.maximumY = Math.max(collider.start.y, collider.end.y) + verticalRadius;
      } else {
        prepared.minimumY = Number.NEGATIVE_INFINITY;
        prepared.maximumY = Number.POSITIVE_INFINITY;
      }
      this.preparedBodyColliders[index] = prepared;
    }
  }

  private solveWorldSphere(
    position: THREE.Vector3,
    previous: THREE.Vector3,
    collider: WorldSphereCollider,
  ): boolean {
    const clearance = getClothWorldClearance(collider);
    const radius = collider.radius + clearance;
    this.delta.copy(position).sub(collider.center);
    const distanceSquared = this.delta.lengthSq();
    if (distanceSquared < radius * radius) {
      this.registerWorldContact();
      const distance = Math.sqrt(distanceSquared);
      if (distance < 0.000_001) {
        this.contactNormal.copy(previous).sub(collider.center);
        if (this.contactNormal.lengthSq() < 0.000_001) this.contactNormal.set(0, 1, 0);
        else this.contactNormal.normalize();
      } else {
        this.contactNormal.copy(this.delta).multiplyScalar(1 / distance);
      }
      let correction = radius - distance;
      const constrainedCorrection = constrainSphereContactToFloor(
        position,
        collider.center,
        radius,
        clearance,
        this.contactNormal,
        previous,
      );
      if (constrainedCorrection !== null) correction = constrainedCorrection;
      position.addScaledVector(this.contactNormal, correction);
      previous.addScaledVector(this.contactNormal, correction);
      this.removeInwardMotion(position, previous, this.contactNormal);
      return true;
    }

    this.sweep.copy(position).sub(previous);
    const sweepLengthSquared = this.sweep.lengthSq();
    if (sweepLengthSquared < 0.000_000_1) return false;
    this.sweepStart.copy(previous).sub(collider.center);
    const startDistance = this.sweepStart.lengthSq() - radius * radius;
    if (startDistance <= 0) return false;
    const approach = this.sweepStart.dot(this.sweep);
    if (approach >= 0) return false;
    const discriminant = approach * approach - sweepLengthSquared * startDistance;
    if (discriminant < 0) return false;
    const hitTime = (-approach - Math.sqrt(discriminant)) / sweepLengthSquared;
    if (hitTime < 0 || hitTime > 1) return false;

    this.registerWorldContact();
    this.hitPoint.copy(previous).addScaledVector(this.sweep, hitTime);
    this.contactNormal.copy(this.hitPoint).sub(collider.center).normalize();
    this.remainingMotion.copy(this.sweep).multiplyScalar(1 - hitTime);
    const inwardMotion = this.remainingMotion.dot(this.contactNormal);
    if (inwardMotion < 0) this.remainingMotion.addScaledVector(this.contactNormal, -inwardMotion);
    this.remainingMotion.multiplyScalar(0.76);
    this.hitPoint.addScaledVector(this.contactNormal, 0.0015);
    previous.copy(this.hitPoint);
    position.copy(this.hitPoint).add(this.remainingMotion);
    return true;
  }

  private solveWorldRock(
    particleIndex: number,
    position: THREE.Vector3,
    previous: THREE.Vector3,
    collider: WorldRockCollider,
    hardRecovery = false,
  ): boolean {
    if (!this.rockQuery.intersectsExpandedBounds(
      collider,
      previous,
      position,
      CLOTH_ROCK_CLEARANCE,
    )) return false;
    const startDistance = this.rockQuery.getSignedDistance(
      collider,
      previous,
      this.delta,
    );
    this.sweep.copy(position).sub(previous);
    if (
      this.rockSweepResolved[particleIndex] === 0
      && this.sweep.lengthSq() <= MAXIMUM_CONTINUOUS_ROCK_SWEEP ** 2
      && startDistance >= CLOTH_ROCK_CLEARANCE
    ) {
      const hitTime = this.rockQuery.sweep(
        collider,
        previous,
        position,
        CLOTH_ROCK_CLEARANCE,
        this.contactNormal,
      );
      if (hitTime !== null) {
        this.registerWorldContact();
        this.rockSweepResolved[particleIndex] = 1;
        this.hitPoint.copy(previous).addScaledVector(this.sweep, hitTime);
        this.redirectRockContactAlongFloor(this.hitPoint, collider);
        this.remainingMotion.copy(this.sweep).multiplyScalar(1 - hitTime);
        const inwardMotion = this.remainingMotion.dot(this.contactNormal);
        if (inwardMotion < 0) {
          this.remainingMotion.addScaledVector(this.contactNormal, -inwardMotion);
        }
        this.remainingMotion.multiplyScalar(0.76);
        this.hitPoint.addScaledVector(this.contactNormal, 0.001);
        previous.copy(this.hitPoint);
        position.copy(this.hitPoint).add(this.remainingMotion);
        return true;
      }
    }

    const signedDistance = this.rockQuery.getSignedDistance(
      collider,
      position,
      this.contactNormal,
    );
    if (signedDistance < CLOTH_ROCK_CLEARANCE) {
      this.registerWorldContact();
      let correction = CLOTH_ROCK_CLEARANCE - signedDistance;
      if (this.redirectRockContactAlongFloor(position, collider)) {
        correction = Math.min(correction, collider.radius * 0.5);
      }
      const remainingCorrection = hardRecovery
        ? Number.POSITIVE_INFINITY
        : Math.max(
          0,
          (collider.walkable
            ? MAXIMUM_DISCRETE_ROCK_CORRECTION
            : MAXIMUM_BLOCKING_ROCK_CORRECTION)
            - (this.rockCorrectionUsed[particleIndex] ?? 0),
        );
      correction = Math.min(correction, remainingCorrection);
      if (correction <= 0) return true;
      position.addScaledVector(this.contactNormal, correction);
      previous.addScaledVector(this.contactNormal, correction);
      this.removeInwardMotion(position, previous, this.contactNormal);
      this.rockCorrectionUsed[particleIndex] = (
        this.rockCorrectionUsed[particleIndex] ?? 0
      ) + correction;
      return true;
    }
    return false;
  }

  private redirectRockContactAlongFloor(
    position: THREE.Vector3,
    collider: WorldRockCollider,
  ): boolean {
    const trappedBelowSurface = this.contactNormal.y < 0
      && position.y <= caveGroundHeightAt(position.x, position.z)
        + CLOTH_ROCK_CLEARANCE * 2;
    if (
      !isBelowWalkableRockShoulder(collider, position.y)
      && !trappedBelowSurface
    ) return false;
    this.contactNormal.set(
      position.x - collider.center.x,
      0,
      position.z - collider.center.z,
    );
    if (this.contactNormal.lengthSq() < 0.000_001) this.contactNormal.set(1, 0, 0);
    else this.contactNormal.normalize();
    return true;
  }

  private applyAxisCorrection(
    position: THREE.Vector3,
    previous: THREE.Vector3,
    axis: 'x' | 'y' | 'z',
    correction: number,
  ): void {
    const inwardMotion = (position[axis] - previous[axis]) * Math.sign(correction);
    position[axis] += correction;
    previous[axis] += correction;
    if (inwardMotion < 0) previous[axis] += inwardMotion * Math.sign(correction);
  }

  private removeInwardMotion(
    position: THREE.Vector3,
    previous: THREE.Vector3,
    normal: THREE.Vector3,
  ): void {
    const inwardMotion = this.delta.copy(position).sub(previous).dot(normal);
    if (inwardMotion < 0) previous.addScaledVector(normal, inwardMotion);
  }

  private registerWorldContact(): void {
    this.worldContactsLastStep += 1;
    this.worldContactEvents += 1;
  }

  private updateActiveWorldColliders(): void {
    this.boundsMinimum.set(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    this.boundsMaximum.set(
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    );
    for (let index = 0; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (position) {
        this.boundsMinimum.min(position);
        this.boundsMaximum.max(position);
      }
      if (previous) {
        this.boundsMinimum.min(previous);
        this.boundsMaximum.max(previous);
      }
    }

    this.activeWorldColliders.length = 0;
    this.activeWorldSpheres.length = 0;
    this.activeRocks.length = 0;
    for (const collider of this.nearbyWorldColliders) {
      if (isWorldRockCollider(collider)) {
        const clearance = CLOTH_ROCK_CLEARANCE + WORLD_BROADPHASE_SKIN;
        if (
          collider.bounds.max.x + clearance < this.boundsMinimum.x
          || collider.bounds.min.x - clearance > this.boundsMaximum.x
          || collider.bounds.max.y + clearance < this.boundsMinimum.y
          || collider.bounds.min.y - clearance > this.boundsMaximum.y
          || collider.bounds.max.z + clearance < this.boundsMinimum.z
          || collider.bounds.min.z - clearance > this.boundsMaximum.z
        ) continue;
        this.activeWorldColliders.push(collider);
        this.activeRocks.push(collider);
        continue;
      }
      const radius = collider.radius + getClothWorldClearance(collider) + WORLD_BROADPHASE_SKIN;
      if (
        collider.center.x + radius < this.boundsMinimum.x
        || collider.center.x - radius > this.boundsMaximum.x
        || collider.center.y + radius < this.boundsMinimum.y
        || collider.center.y - radius > this.boundsMaximum.y
        || collider.center.z + radius < this.boundsMinimum.z
        || collider.center.z - radius > this.boundsMaximum.z
      ) continue;
      this.activeWorldColliders.push(collider);
      this.activeWorldSpheres.push(collider);
    }
  }
}
