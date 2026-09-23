// Skeleton-driven cape using the cape-physics PBD solver (src/vendor/cape).
// The solver works in world space; this adapter feeds it neckline anchors and
// a capsule body rig derived from our procedural humanoid's joints, and steps it
// at the solver's fixed 120 Hz rate.
import * as THREE from 'three';
import { CapeSimulation } from '../../vendor/cape/physics/CapeSimulation';
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

const _p = new THREE.Vector3();
/** Main-thread time the cloth may take per frame (a step costs about 2.5 ms on a fast desktop). */
const STEP_BUDGET_MS = 4;

export class SkeletonCape {
  readonly sim: CapeSimulation;
  readonly mesh: THREE.Mesh;
  private readonly anchors: { left: THREE.Vector3; right: THREE.Vector3; back: THREE.Vector3 };
  private readonly colliders: CapsuleCollider[];
  private readonly specs: CapsuleSpec[];
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
    let stepped = false;
    // large jumps (respawn / teleport) re-drape instead of whipping across the arena
    if (this.needsReset || this.sim.getParticlePosition(6, 0).distanceTo(_p.copy(anchors.left).lerp(anchors.right, 0.5)) > 2) {
      this.sim.reset(anchors);
      this.needsReset = false;
      this.acc = 0;
      stepped = true;
    }
    this.acc = Math.min(this.acc + dt, PHYSICS_STEP * MAX_PHYSICS_STEPS);
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
    if (stepped) this.sim.syncGeometry();
  }

  setVisible(v: boolean): void { this.mesh.visible = v; }

  dispose(): void { this.sim.dispose(); }
}
