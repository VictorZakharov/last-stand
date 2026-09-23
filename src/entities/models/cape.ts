// Skeleton-driven cape using the cape-physics PBD solver (src/vendor/cape).
// The solver works in world space; this adapter feeds it neckline anchors and
// a capsule body rig derived from our procedural humanoid's joints, and steps it
// at the solver's fixed 120 Hz rate: in a web worker (the solver's own WebGL worker
// pool), or on the main thread within a time budget when workers are unavailable.
import * as THREE from 'three';
import { CapeSimulation } from '../../vendor/cape/physics/CapeSimulation';
import { WebGlCapeWorkerPool } from '../../vendor/cape/physics/WebGlCapeWorkerPool';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { CapePhysicsSettings } from '../../vendor/cape/physics/CapeSettings';
import type { CapsuleCollider } from '../../vendor/cape/physics/colliders';
import type { CapeAnchors } from '../../vendor/cape/player/Character';
import { MAX_PHYSICS_STEPS, PHYSICS_STEP } from '../../vendor/cape/config';

type V3 = readonly [number, number, number];

/** One body capsule: from `a`+offA to `b`+offB (or a sphere at `a` when `b` is omitted). */
export interface CapsuleSpec {
  name: string;
  radius: number;
  /** front/back radius for elliptical torso capsules */
  depthRadius?: number;
  clearance?: number;
  faceSampleSpacing?: number;
  a: THREE.Object3D;
  offA?: V3;
  b?: THREE.Object3D;
  offB?: V3;
}

export interface SkeletonCapeOptions {
  /** joint the neckline is pinned to (e.g. chest) */
  anchor: THREE.Object3D;
  /** neckline ends, in anchor-local space */
  left: V3;
  right: V3;
  /** character root; its local -Z is "backwards" */
  root: THREE.Object3D;
  capsules: CapsuleSpec[];
  palette?: CapeFabricPalette;
  settings?: Partial<CapePhysicsSettings>;
}

const _p = new THREE.Vector3(), _neck = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Main-thread time the cloth may take per frame (a step costs about 2.5 ms on a fast desktop). */
const STEP_BUDGET_MS = 4;
/** A worker that falls this far behind gets no new steps until it catches up (slow motion, no backlog). */
const MAX_QUEUED_STEPS = 12;
const NECK_COLUMN = 6;   // middle of the pinned top row

// one worker pool for every cape; the cloth has no world colliders in the arena
let pool: WebGlCapeWorkerPool | null = null;
let nextId = 1;

export class SkeletonCape {
  readonly sim: CapeSimulation;
  readonly mesh: THREE.Mesh;
  private readonly anchors: { left: THREE.Vector3; right: THREE.Vector3; back: THREE.Vector3 };
  private readonly colliders: CapsuleCollider[];
  private readonly specs: CapsuleSpec[];
  private readonly id = nextId++;
  /** where the solver pins the neckline middle, relative to the anchor midpoint, in the root's frame */
  private readonly pinBias = new THREE.Vector3();
  private acc = 0;
  private time = 0;
  private needsReset = true;

  constructor(private readonly o: SkeletonCapeOptions) {
    this.anchors = { left: new THREE.Vector3(), right: new THREE.Vector3(), back: new THREE.Vector3(0, 0, -1) };
    this.specs = o.capsules;
    this.colliders = o.capsules.map((c) => ({
      start: new THREE.Vector3(), end: new THREE.Vector3(),
      radius: c.radius, depthRadius: c.depthRadius, name: c.name, clearance: c.clearance, faceSampleSpacing: c.faceSampleSpacing,
    }));
    this.updateAnchors();
    this.sim = new CapeSimulation(this.anchors as CapeAnchors, o.settings, o.palette);
    this.mesh = this.sim.mesh;
    pool ??= new WebGlCapeWorkerPool([]);
    pool.registerCape(this.id, this.sim, this.anchors as CapeAnchors, this.colliders);
  }

  private updateAnchors(): CapeAnchors {
    const { anchor, root, left, right } = this.o;
    root.updateMatrixWorld(true);
    anchor.localToWorld(this.anchors.left.set(...left));
    anchor.localToWorld(this.anchors.right.set(...right));
    this.anchors.back.set(0, 0, -1).transformDirection(root.matrixWorld);
    this.anchors.back.y = 0;
    this.anchors.back.normalize();
    return this.anchors;
  }

  private updateColliders(): CapsuleCollider[] {
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i], c = this.colliders[i];
      s.a.localToWorld(c.start.set(...(s.offA ?? [0, 0, 0])));
      (s.b ?? s.a).localToWorld(c.end.set(...(s.offB ?? s.offA ?? [0, 0, 0])));
    }
    return this.colliders;
  }

  /** Snap the cape back to a rest drape (teleports, respawn). */
  reset(): void { this.needsReset = true; }

  /** Advance the simulation; call after the skeleton has been posed for this frame. */
  update(dt: number, velocity: THREE.Vector3): void {
    const anchors = this.updateAnchors();
    const colliders = this.updateColliders();
    const neck = _neck.copy(anchors.left).lerp(anchors.right, 0.5);
    let reset = false;
    // large jumps (respawn / teleport) re-drape instead of whipping across the arena
    if (this.needsReset || this.sim.getParticlePosition(NECK_COLUMN, 0).distanceTo(neck) > 2) {
      this.sim.reset(anchors);
      pool?.updateCape(this.id, this.sim, anchors);   // newer revision: in-flight results are dropped
      this.o.root.getWorldQuaternion(_q).invert();
      this.pinBias.copy(this.sim.getParticlePosition(NECK_COLUMN, 0)).sub(neck).applyQuaternion(_q);
      this.needsReset = false;
      this.acc = 0;
      reset = true;
    }
    this.acc = Math.min(this.acc + dt, PHYSICS_STEP * MAX_PHYSICS_STEPS);
    // a failed worker stops driving the cape and it carries on here from the last result
    const synced = pool?.isDrivingCape(this.id) ? this.stepInWorker(anchors, colliders, velocity) : this.stepHere(anchors, colliders, velocity);
    if (synced || reset) this.sim.syncGeometry();
    // worker results are a frame or two old: shift the cloth onto this frame's neckline
    const pin = neck.add(_p.copy(this.pinBias).applyQuaternion(this.o.root.getWorldQuaternion(_q)));
    this.mesh.position.subVectors(pin, this.sim.getParticlePosition(NECK_COLUMN, 0));
  }

  /** Queue this frame's steps for the worker and apply its latest result. Returns whether one arrived. */
  private stepInWorker(anchors: CapeAnchors, colliders: CapsuleCollider[], velocity: THREE.Vector3): boolean {
    const p = pool!;
    const input = [{ capeId: this.id, anchors, bodyColliders: colliders, characterVelocity: velocity }];
    const backlog = p.getDiagnostics().queuedSteps >= MAX_QUEUED_STEPS;
    while (this.acc >= PHYSICS_STEP) {
      this.acc -= PHYSICS_STEP;
      this.time += PHYSICS_STEP;
      if (!backlog) p.enqueueStep(PHYSICS_STEP, this.time, input);
    }
    p.flush();
    const state = p.consumeLatestState(this.id);
    if (state) this.sim.overwriteStateForHarness(state.positions, state.previous);
    return state !== null;
  }

  /** Step on the main thread within the frame budget. Returns whether the cloth moved. */
  private stepHere(anchors: CapeAnchors, colliders: CapsuleCollider[], velocity: THREE.Vector3): boolean {
    let stepped = false;
    const start = performance.now();
    while (this.acc >= PHYSICS_STEP) {
      this.acc -= PHYSICS_STEP;
      this.time += PHYSICS_STEP;
      this.sim.step(PHYSICS_STEP, anchors, colliders, [], velocity, this.time);
      stepped = true;
      // Slow frames owe more catch-up steps, which make the next frame slower still. Past the
      // budget the cape drops its backlog and runs behind real time instead of spiralling.
      if (performance.now() - start > STEP_BUDGET_MS) { this.acc = 0; break; }
    }
    // step() only advances particles; upload them (and recompute normals, which costs
    // more than a step) only when they moved: at 144 Hz about one frame in six has no step
    return stepped;
  }

  setVisible(v: boolean): void { this.mesh.visible = v; }

  dispose(): void { pool?.unregisterCape(this.id); this.sim.dispose(); }
}
