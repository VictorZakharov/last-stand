import * as THREE from 'three';
import { CAMERA_NEAR_OPACITY, CAPE } from '../config';
import { createCapeFabricTextures } from '../graphics/proceduralTextures';
import {
  CRIMSON_CAPE_PALETTE,
  type CapeFabricPalette,
} from './CapeAppearance';
import type { CapeAnchors } from '../player/Character';
import { reconcileCapeProjectionPreviousY } from './CapeProjectionVelocity';
import {
  CapeContactSolver,
  type BodyPenetrationDiagnostics,
  type EnvironmentPenetrationDiagnostics,
  type RockSurfaceContactDiagnostics,
  type WorldContactDiagnostics,
} from './CapeContactSolver';
import {
  CapePerformanceProfiler,
  type CapePerformanceDiagnostics,
} from './CapePerformanceProfiler';
import {
  createCapeInitialParticlePositions,
  setCapeAnchorTarget,
} from './CapeInitialState';
import {
  normalizeCapePhysicsSettings,
  type CapePhysicsSettings,
} from './CapeSettings';
import {
  BODY_CONTACT_RECONCILIATION_FULL,
  BODY_CONTACT_RECONCILIATION_START,
  IDLE_DRAPE_RECOVERY_DELAY_SECONDS,
  IDLE_DRAPE_RECOVERY_HEM_DROP,
  IDLE_DRAPE_RECOVERY_RAMP_SECONDS,
  IDLE_DRAPE_RECOVERY_TARGET,
  MAXIMUM_SETTLED_HORIZONTAL_OFFSET,
  MAXIMUM_SLEEP_BODY_PENETRATION,
  MINIMUM_SETTLED_LOWER_CAPE_DROP,
  SETTLED_MOTION_THRESHOLD,
  SLEEP_AFTER_SETTLED_SECONDS,
  WAKE_SPEED,
} from './CapeSolverConstants';
import { CapeCpuPrediction } from './CapeCpuPrediction';
import { CapeCpuConstraints } from './CapeCpuConstraints';
import type {
  CapeSimulationOptions,
  PackedCapeState,
} from './CapeSolverTypes';
export type {
  CapeSimulationOptions,
  PackedCapeState,
} from './CapeSolverTypes';
import { CapeCpuShapeGuards } from './CapeCpuShapeGuards';
import { CapeCpuShapeDiagnostics } from './CapeCpuShapeDiagnostics';
import { CapeCpuMotionTracker } from './CapeCpuMotionTracker';
import type { CapsuleCollider, WorldCollider } from './colliders';

export function createCapeFabricMaterial(
  appearance: CapeFabricPalette,
): THREE.MeshPhysicalMaterial {
  const textures = createCapeFabricTextures(256, appearance);
  textures.color.repeat.set(1, 1);
  textures.normal.repeat.set(1, 1);
  textures.roughness.repeat.set(1, 1);
  const material = new THREE.MeshPhysicalMaterial({
    map: textures.color,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.48, 0.48),
    roughnessMap: textures.roughness,
    roughness: 0.78,
    metalness: 0.01,
    sheen: 0.92,
    sheenColor: new THREE.Color(appearance.sheenColor),
    sheenRoughness: 0.72,
    clearcoat: 0.04,
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });
  material.name = appearance.materialName;
  return material;
}

export class CapeSimulation {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private readonly positions: THREE.Vector3[] = [];
  private readonly previous: THREE.Vector3[] = [];
  private readonly inverseMass: Float32Array;
  private readonly predictedVerticalDisplacement: Float32Array;
  private readonly constraints: CapeCpuConstraints;
  private readonly positionAttribute: THREE.BufferAttribute | null;
  private readonly shapeGuards: CapeCpuShapeGuards;
  private readonly contactSolver: CapeContactSolver;
  private readonly prediction: CapeCpuPrediction;
  private readonly shapeDiagnostics: CapeCpuShapeDiagnostics;
  private readonly motionTracker: CapeCpuMotionTracker;
  private readonly profiler = new CapePerformanceProfiler();
  private readonly anchorTarget = new THREE.Vector3();
  private readonly anchorCenter = new THREE.Vector3();
  private opacity = 1;
  private settledSeconds = 0;
  private idleDrapeRecoverySeconds = 0;
  private sleeping = false;
  private readonly ownsMaterial: boolean;
  private settings: CapePhysicsSettings;

  public constructor(
    initialAnchors: CapeAnchors,
    settings: Partial<CapePhysicsSettings> = {},
    appearance: CapeFabricPalette = CRIMSON_CAPE_PALETTE,
    options: CapeSimulationOptions = {},
  ) {
    this.settings = normalizeCapePhysicsSettings(settings);
    const particleCount = CAPE.columns * CAPE.rows;
    this.inverseMass = new Float32Array(particleCount);
    this.predictedVerticalDisplacement = new Float32Array(particleCount);
    this.contactSolver = new CapeContactSolver(this.positions, this.previous, this.inverseMass);
    this.prediction = new CapeCpuPrediction(
      this.positions,
      this.previous,
      this.predictedVerticalDisplacement,
    );
    this.constraints = new CapeCpuConstraints(this.positions, this.inverseMass);
    this.shapeGuards = new CapeCpuShapeGuards(
      this.positions,
      this.previous,
      this.inverseMass,
      this.anchorCenter,
    );
    this.shapeDiagnostics = new CapeCpuShapeDiagnostics(
      this.positions,
      this.anchorCenter,
    );
    this.motionTracker = new CapeCpuMotionTracker(this.positions);
    this.initializeParticles(initialAnchors);
    this.motionTracker.synchronizeStepStart();
    this.constraints.rebuild();
    const renderResources = options.renderResources !== false;
    const geometry = renderResources ? this.createGeometry() : new THREE.BufferGeometry();
    this.positionAttribute = renderResources
      ? geometry.getAttribute('position') as THREE.BufferAttribute
      : null;

    const material = options.material
      ?? (renderResources
        ? createCapeFabricMaterial(appearance)
        : new THREE.MeshPhysicalMaterial());
    this.ownsMaterial = !options.material;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'PBD cape';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  public step(
    deltaTime: number,
    anchors: CapeAnchors,
    bodyColliders: readonly CapsuleCollider[],
    worldColliders: readonly WorldCollider[],
    characterVelocity: THREE.Vector3,
    time: number,
  ): void {
    const characterSpeed = characterVelocity.length();
    const profileActive = this.profiler.beginStep(
      !this.sleeping || characterSpeed > WAKE_SPEED,
    );
    const profileStepStart = profileActive ? performance.now() : 0;
    let profilePhaseStart = profileStepStart;
    this.motionTracker.captureStepStart();
    if (characterSpeed > WAKE_SPEED) {
      this.settledSeconds = 0;
      this.idleDrapeRecoverySeconds = 0;
      this.sleeping = false;
    } else {
      this.idleDrapeRecoverySeconds += deltaTime;
    }
    this.pinAnchors(anchors);
    this.contactSolver.beginStep(
      this.anchorCenter,
      worldColliders,
      bodyColliders,
      anchors.back,
    );
    if (this.sleeping) {
      this.motionTracker.measureStepMotion();
      if (profileActive) {
        const profileEnd = performance.now();
        this.profiler.record('prediction', profileEnd - profilePhaseStart);
        this.profiler.endStep(profileEnd - profileStepStart);
      }
      return;
    }
    this.prediction.predict(deltaTime, characterVelocity, time, this.settings);
    if (profileActive) {
      const profileNow = performance.now();
      this.profiler.record('prediction', profileNow - profilePhaseStart);
      profilePhaseStart = profileNow;
    }

    for (let iteration = 0; iteration < CAPE.solverIterations; iteration += 1) {
      this.constraints.solve(this.settings.stiffness);
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('constraints', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      this.shapeGuards.solveSelfCollision();
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('selfCollision', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      this.shapeGuards.solveFoldAndRows(anchors, this.settings.width);
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('foldGuard', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      if (
        iteration === 0
        && this.idleDrapeRecoverySeconds > IDLE_DRAPE_RECOVERY_DELAY_SECONDS
        && this.getHemDrop() < IDLE_DRAPE_RECOVERY_HEM_DROP
        && this.getMaximumLowerCapeHorizontalOffset() > IDLE_DRAPE_RECOVERY_TARGET
      ) {
        this.shapeGuards.solveIdleDrapeRecovery(THREE.MathUtils.smoothstep(
          this.idleDrapeRecoverySeconds,
          IDLE_DRAPE_RECOVERY_DELAY_SECONDS,
          IDLE_DRAPE_RECOVERY_DELAY_SECONDS + IDLE_DRAPE_RECOVERY_RAMP_SECONDS,
        ));
      }
      this.contactSolver.solveBody(bodyColliders, anchors.back);
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('bodyCollision', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      this.contactSolver.solveWorld();
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('worldCollision', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      this.contactSolver.solveCave();
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('caveCollision', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      if (iteration === CAPE.solverIterations - 1) {
        // Cave-floor projection can re-enter the face of a floor-seated rock.
        // Recheck triangles only against colliders that actually touched this
        // iteration; vertex contacts were already solved above.
        this.contactSolver.solvePostCaveWorldContacts();
        // The fixed-world projection can in turn press cloth back into an
        // animated boot or lower leg. Finish on the moving body constraint so
        // rendered limb geometry cannot emerge through a stone-pinned cape,
        // then reconcile exact world-face crossings once more. Both rock
        // point projections share one strict per-particle step budget; exact
        // face translations are independently bounded and velocity-neutral.
        this.contactSolver.solveBody(bodyColliders, anchors.back);
        if (this.contactSolver.solvePostCaveWorldContacts() > 0) {
          this.contactSolver.solveBody(bodyColliders, anchors.back);
          this.contactSolver.solvePostCaveWorldContacts();
        }
        // Final world/body reconciliation can push a triangle interior back
        // through the curved cave side while all of its vertices stay valid.
        // Recheck the cave face, then alternate the compatible moving-body and
        // fixed-world constraints to convergence. Always end on the fixed
        // world so the rendered cloth cannot remain inside a floor formation.
        this.contactSolver.solveCave();
        for (let pass = 0; pass < 4; pass += 1) {
          this.contactSolver.solveBody(bodyColliders, anchors.back);
          if (this.contactSolver.solvePostCaveWorldContacts() === 0) break;
        }
      }
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('reconciliation', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
      this.pinAnchors(anchors);
      if (profileActive) {
        const profileNow = performance.now();
        this.profiler.record('anchors', profileNow - profilePhaseStart);
        profilePhaseStart = profileNow;
      }
    }

    this.reconcileBodyContactVelocity();
    // Fixed-world and material body contacts are authoritative. Their
    // projection may need upward velocity to clear a rock, floor, or boot.
    this.reconcileProjectionVerticalVelocity(
      this.contactSolver.getDiagnostics().lastStep > 0
        || this.hasMaterialBodyContactCorrection(),
    );
    this.motionTracker.measureStepMotion();
    const horizontallySettled = this.getMaximumLowerCapeHorizontalOffset()
      < MAXIMUM_SETTLED_HORIZONTAL_OFFSET;
    const settledShape = characterSpeed <= WAKE_SPEED
      && this.getHemDrop() > 0.72
      && this.getMinimumLowerCapeDrop() > MINIMUM_SETTLED_LOWER_CAPE_DROP
      && horizontallySettled;
    const fullyDraped = settledShape
      && this.contactSolver.getMaximumBodyPenetration(bodyColliders, anchors.back)
        < MAXIMUM_SLEEP_BODY_PENETRATION;
    if (fullyDraped) this.dampResidualMotion(0.14);
    if (
      fullyDraped
      && this.motionTracker.getMaximumParticleMotion() < SETTLED_MOTION_THRESHOLD
    ) {
      this.settledSeconds += deltaTime;
    } else if (fullyDraped) {
      this.settledSeconds = Math.max(0, this.settledSeconds - deltaTime * 0.2);
    } else {
      this.settledSeconds = 0;
    }
    if (this.settledSeconds >= SLEEP_AFTER_SETTLED_SECONDS) {
      this.sleeping = true;
      this.positions.forEach((position, index) => this.previous[index]?.copy(position));
    }
    this.guardAgainstInvalidState(anchors);
    if (profileActive) {
      const profileEnd = performance.now();
      this.profiler.record('finalization', profileEnd - profilePhaseStart);
      this.profiler.endStep(profileEnd - profileStepStart);
    }
  }

  public syncGeometry(): void {
    if (!this.positionAttribute) return;
    const array = this.positionAttribute.array as Float32Array;
    this.positions.forEach((position, index) => {
      array[index * 3] = position.x;
      array[index * 3 + 1] = position.y;
      array[index * 3 + 2] = position.z;
    });
    this.positionAttribute.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    const normalAttribute = this.mesh.geometry.getAttribute('normal');
    if (normalAttribute) normalAttribute.needsUpdate = true;
  }

  /**
   * CPU simulations already own authoritative particle data. The WebGPU
   * implementation exposes the same hook and uses it for explicit diagnostic
   * readback, so browser audits never add a fence to the animation loop.
   */
  public async refreshDiagnostics(): Promise<void> {}

  /** Updates the CPU diagnostic mirror from tightly packed vec4 GPU buffers. */
  public overwriteStateFromGpu(
    positionData: Float32Array,
    previousData: Float32Array,
  ): void {
    const expectedLength = this.positions.length * 4;
    if (positionData.length < expectedLength || previousData.length < expectedLength) {
      throw new RangeError('GPU cape state is smaller than the simulation grid.');
    }
    this.positions.forEach((position, index) => {
      const offset = index * 4;
      position.set(
        positionData[offset] ?? 0,
        positionData[offset + 1] ?? 0,
        positionData[offset + 2] ?? 0,
      );
      this.previous[index]?.set(
        previousData[offset] ?? 0,
        previousData[offset + 1] ?? 0,
        previousData[offset + 2] ?? 0,
      );
    });
  }

  /** Returns a transferable vec4 snapshot used by the WebGL worker pool. */
  public copyPackedState(): PackedCapeState {
    const positions = new Float32Array(this.positions.length * 4);
    const previous = new Float32Array(this.previous.length * 4);
    this.positions.forEach((position, index) => {
      const offset = index * 4;
      positions[offset] = position.x;
      positions[offset + 1] = position.y;
      positions[offset + 2] = position.z;
      positions[offset + 3] = this.inverseMass[index] ?? 0;
      const prior = this.previous[index];
      previous[offset] = prior?.x ?? position.x;
      previous[offset + 1] = prior?.y ?? position.y;
      previous[offset + 2] = prior?.z ?? position.z;
      previous[offset + 3] = this.inverseMass[index] ?? 0;
    });
    return { positions, previous };
  }

  /** Harness-only state injection shared with the WebGPU implementation. */
  public overwriteStateForHarness(
    positionData: Float32Array,
    previousData: Float32Array = positionData,
  ): void {
    this.overwriteStateFromGpu(positionData, previousData);
    this.motionTracker.synchronizeStepStart();
    this.settledSeconds = 0;
    this.idleDrapeRecoverySeconds = 0;
    this.sleeping = false;
    this.motionTracker.clearMaximumMotion();
  }

  /** Keeps GPU readback diagnostics relative to the current moving neckline. */
  public synchronizeAnchorDiagnostics(anchors: CapeAnchors): void {
    this.anchorCenter.copy(anchors.left).add(anchors.right).multiplyScalar(0.5);
  }

  public reset(anchors: CapeAnchors): void {
    this.positions.length = 0;
    this.previous.length = 0;
    this.initializeParticles(anchors);
    this.pinAnchors(anchors);
    this.motionTracker.synchronizeStepStart();
    this.settledSeconds = 0;
    this.idleDrapeRecoverySeconds = 0;
    this.sleeping = false;
    this.motionTracker.clearMaximumMotion();
  }

  public updateSettings(
    settings: Partial<CapePhysicsSettings>,
    anchors: CapeAnchors,
  ): void {
    const next = normalizeCapePhysicsSettings(settings);
    const dimensionsChanged = next.length !== this.settings.length
      || next.width !== this.settings.width;
    this.settings = next;
    this.settledSeconds = 0;
    this.idleDrapeRecoverySeconds = 0;
    this.sleeping = false;
    if (!dimensionsChanged) return;

    this.reset(anchors);
    this.constraints.rebuild();
    this.syncGeometry();
  }

  public getSettings(): CapePhysicsSettings {
    return { ...this.settings };
  }

  public setOpacity(opacity: number): void {
    const nextOpacity = THREE.MathUtils.clamp(opacity, CAMERA_NEAR_OPACITY, 1);
    if (Math.abs(nextOpacity - this.opacity) < 0.002) return;
    this.opacity = nextOpacity;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    if (this.ownsMaterial) this.disposeMaterial();
  }

  public disposeMaterial(): void {
    this.mesh.material.map?.dispose();
    this.mesh.material.normalMap?.dispose();
    this.mesh.material.roughnessMap?.dispose();
    this.mesh.material.dispose();
  }

  public getParticlePosition(column: number, row: number): THREE.Vector3 {
    return this.shapeDiagnostics.getParticlePosition(column, row);
  }

  public getMaximumStructuralError(): number {
    return this.constraints.getMaximumStructuralError();
  }

  public getMaximumBodyPenetration(
    bodyColliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): number {
    return this.contactSolver.getMaximumBodyPenetration(bodyColliders, back);
  }

  public getBodyPenetrationDiagnostics(
    bodyColliders: readonly CapsuleCollider[],
    back: THREE.Vector3,
  ): BodyPenetrationDiagnostics {
    return this.contactSolver.getBodyPenetrationDiagnostics(bodyColliders, back);
  }

  public getMaximumEnvironmentPenetration(worldColliders: readonly WorldCollider[]): number {
    return this.contactSolver.getMaximumEnvironmentPenetration(worldColliders);
  }

  public getEnvironmentPenetrationDiagnostics(
    worldColliders: readonly WorldCollider[],
  ): EnvironmentPenetrationDiagnostics {
    return this.contactSolver.getEnvironmentPenetrationDiagnostics(worldColliders);
  }

  public getMaximumEnvironmentFacePenetration(worldColliders: readonly WorldCollider[]): number {
    return this.contactSolver.getMaximumEnvironmentFacePenetration(worldColliders);
  }

  public getMinimumSelfSeparation(): number {
    return this.shapeGuards.getMinimumSelfSeparation();
  }

  public getMaximumUpwardFold(): number {
    return this.shapeGuards.getMaximumUpwardFold();
  }

  public getHemDrop(): number {
    return this.shapeDiagnostics.getHemDrop();
  }

  public getMinimumLowerCapeDrop(): number {
    return this.shapeDiagnostics.getMinimumLowerCapeDrop();
  }

  public getMaximumLowerCapeLateralOffset(anchors: CapeAnchors): number {
    return this.shapeDiagnostics.getMaximumLowerCapeLateralOffset(anchors);
  }

  public getMaximumLowerCapeHorizontalOffset(): number {
    return this.shapeDiagnostics.getMaximumLowerCapeHorizontalOffset();
  }

  /**
   * Detects a cape that has rolled its rows into a tube while retaining valid
   * edge lengths. A healthy lower cape keeps most of each row aligned with the
   * character's shoulder axis even while it trails, folds, or contacts rocks.
   */
  public getAverageLowerCapeSpanRatio(anchors: CapeAnchors): number {
    return this.shapeDiagnostics.getAverageLowerCapeSpanRatio(anchors, this.settings.width);
  }

  /**
   * Measures changing cross-cape orientation down the cloth. A rigid planar
   * sheet has almost no range, while a naturally waving cape twists successive
   * rows forward and backward around its centerline.
   */
  public getCapeRowTwistRange(anchors: CapeAnchors): number {
    return this.shapeDiagnostics.getCapeRowTwistRange(anchors, this.settings.width);
  }

  /** Maximum row-center departure from the straight neckline-to-hem chord. */
  public getCapeCenterlineDeviation(): number {
    return this.shapeDiagnostics.getCapeCenterlineDeviation();
  }

  /** Largest interior departure from a lower row's outer-edge chord. */
  public getMaximumLowerCapeRowCurlRatio(anchors: CapeAnchors): number {
    return this.shapeDiagnostics.getMaximumLowerCapeRowCurlRatio(
      anchors,
      this.settings.width,
    );
  }

  public getHemBackOffset(anchors: CapeAnchors): number {
    return this.shapeDiagnostics.getHemBackOffset(anchors);
  }

  public getMinimumHemGroundClearance(): number {
    return this.shapeDiagnostics.getMinimumHemGroundClearance();
  }

  public getMaximumParticleMotion(): number {
    return this.motionTracker.getMaximumParticleMotion();
  }

  public getMaximumParticleVerticalMotion(): number {
    return this.motionTracker.getMaximumParticleVerticalMotion();
  }

  public getMaximumParticleMotionDiagnostics() {
    const diagnostics = this.motionTracker.getDiagnostics();
    return {
      ...diagnostics,
      rockContact: this.contactSolver.getParticleRockCorrectionDiagnostics(
        diagnostics.particleIndex,
      ),
    };
  }

  public isSleeping(): boolean {
    return this.sleeping;
  }

  public getWorldContactDiagnostics(): WorldContactDiagnostics {
    return this.contactSolver.getDiagnostics();
  }

  public getPerformanceDiagnostics(): CapePerformanceDiagnostics {
    return this.profiler.getDiagnostics();
  }

  public getClosestActiveRockSurfaceContact(
    worldColliders?: readonly WorldCollider[],
  ): RockSurfaceContactDiagnostics | null {
    return this.contactSolver.getClosestActiveRockSurfaceContact(worldColliders);
  }

  private initializeParticles(anchors: CapeAnchors): void {
    this.anchorCenter.copy(anchors.left).add(anchors.right).multiplyScalar(0.5);
    const initialPositions = createCapeInitialParticlePositions(anchors, this.settings);
    initialPositions.forEach((position, index) => {
      this.positions.push(position);
      this.previous.push(position.clone());
      this.inverseMass[index] = index < CAPE.columns ? 0 : 1;
    });
  }

  private createGeometry(): THREE.BufferGeometry {
    const positionData = new Float32Array(this.positions.length * 3);
    const uvData = new Float32Array(this.positions.length * 2);
    const indices: number[] = [];
    this.positions.forEach((position, index) => {
      position.toArray(positionData, index * 3);
      const column = index % CAPE.columns;
      const row = Math.floor(index / CAPE.columns);
      uvData[index * 2] = column / (CAPE.columns - 1);
      uvData[index * 2 + 1] = 1 - row / (CAPE.rows - 1);
    });
    for (let row = 0; row < CAPE.rows - 1; row += 1) {
      for (let column = 0; column < CAPE.columns - 1; column += 1) {
        const topLeft = this.index(column, row);
        const bottomLeft = this.index(column, row + 1);
        indices.push(topLeft, bottomLeft, topLeft + 1, bottomLeft, bottomLeft + 1, topLeft + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(positionData, 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvData, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private pinAnchors(anchors: CapeAnchors): void {
    this.anchorCenter.copy(anchors.left).add(anchors.right).multiplyScalar(0.5);
    for (let column = 0; column < CAPE.columns; column += 1) {
      const index = this.index(column, 0);
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      setCapeAnchorTarget(anchors, column / (CAPE.columns - 1), this.anchorTarget);
      position.copy(this.anchorTarget);
      previous.copy(this.anchorTarget);
    }
  }

  /**
   * Body projection is positional and intentionally resolves penetration in
   * full. Repeated constraint/contact passes can nevertheless encode that
   * projection as Verlet velocity. Treat sustained body contact as inelastic
   * so a boot can push cloth aside without catapulting it on the next step.
   */
  private reconcileBodyContactVelocity(): void {
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const correction = this.contactSolver.getBodyCorrectionUsed(index);
      if (correction <= BODY_CONTACT_RECONCILIATION_START) continue;
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      const strength = THREE.MathUtils.smoothstep(
        correction,
        BODY_CONTACT_RECONCILIATION_START,
        BODY_CONTACT_RECONCILIATION_FULL,
      );
      previous.lerp(position, strength);
    }
  }

  /**
   * Projection may repair a stretched link upward even though physical
   * prediction was still descending. Do not encode that positional repair as
   * an upward Verlet velocity for the next step. Upward physical prediction,
   * planar response, and the corrected position itself remain unchanged.
   */
  private reconcileProjectionVerticalVelocity(hasMaterialContact: boolean): void {
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (!position || !previous) continue;
      previous.y = reconcileCapeProjectionPreviousY({
        predictedVerticalDisplacement: this.predictedVerticalDisplacement[index] ?? 0,
        projectedPositionY: position.y,
        previousPositionY: previous.y,
        hasMaterialContact,
      });
    }
  }

  private hasMaterialBodyContactCorrection(): boolean {
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      if (
        this.contactSolver.getBodyCorrectionUsed(index)
          > BODY_CONTACT_RECONCILIATION_START
      ) return true;
    }
    return false;
  }

  private dampResidualMotion(strength: number): void {
    for (let index = CAPE.columns; index < this.positions.length; index += 1) {
      const position = this.positions[index];
      const previous = this.previous[index];
      if (position && previous) previous.lerp(position, strength);
    }
  }

  private guardAgainstInvalidState(anchors: CapeAnchors): void {
    const invalid = this.positions.some(
      (position) => !Number.isFinite(position.lengthSq()) || position.distanceToSquared(this.anchorCenter) > 25,
    );
    if (!invalid) return;
    this.reset(anchors);
  }

  private index(column: number, row: number): number {
    return row * CAPE.columns + column;
  }
}
