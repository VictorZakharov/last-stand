import type { CapeAnchors } from '../player/Character';
import type { CapeSimulation, PackedCapeState } from './CapeSimulation';
import {
  serializeCapeAnchors,
  serializeCapsuleColliders,
  serializeCapsuleEndpoints,
  serializeVector3,
  serializeWorldColliders,
  type CapeWorkerRequest,
  type CapeWorkerResponse,
  type CapeWorkerStepFrame,
} from './CapeWorkerProtocol';
import type { CapsuleCollider, WorldCollider } from './colliders';
import type * as THREE from 'three';

export interface WebGlCapeStepInput {
  readonly capeId: number;
  readonly anchors: CapeAnchors;
  readonly bodyColliders: readonly CapsuleCollider[];
  readonly characterVelocity: THREE.Vector3;
}

export interface WebGlCapeWorkerDiagnostics {
  readonly active: boolean;
  readonly workers: number;
  readonly busyWorkers: number;
  readonly queuedSteps: number;
  readonly failure: string | null;
}

interface CapeRegistration {
  readonly slot: WorkerSlot;
  revision: number;
  latestState: PackedCapeState | null;
}

interface WorkerSlot {
  readonly worker: Worker;
  readonly capeIds: Set<number>;
  readonly pendingFrames: CapeWorkerStepFrame[];
  busy: boolean;
  nextRequestId: number;
}

function workerLimit(): number {
  const hardwareThreads = Math.max(2, navigator.hardwareConcurrency || 4);
  return Math.max(1, Math.min(10, hardwareThreads - 2));
}

export class WebGlCapeWorkerPool {
  private readonly serializedWorldColliders;
  private readonly maximumWorkers = workerLimit();
  private readonly slots: WorkerSlot[] = [];
  private readonly registrations = new Map<number, CapeRegistration>();
  private readonly drainWaiters = new Set<() => void>();
  private failure: string | null = null;
  private disposed = false;

  public constructor(worldColliders: readonly WorldCollider[]) {
    this.serializedWorldColliders = serializeWorldColliders(worldColliders);
  }

  public registerCape(
    capeId: number,
    cape: CapeSimulation,
    anchors: CapeAnchors,
    bodyColliders: readonly CapsuleCollider[],
  ): boolean {
    if (this.disposed || this.failure || typeof Worker === 'undefined') return false;
    this.unregisterCape(capeId);
    const slot = this.slots.length < this.maximumWorkers
      ? this.createSlot()
      : this.leastLoadedSlot();
    const registration: CapeRegistration = {
      slot,
      revision: 0,
      latestState: null,
    };
    this.registrations.set(capeId, registration);
    slot.capeIds.add(capeId);
    const state = cape.copyPackedState();
    this.post(slot.worker, {
      type: 'add-cape',
      capeId,
      revision: registration.revision,
      anchors: serializeCapeAnchors(anchors),
      bodyColliders: serializeCapsuleColliders(bodyColliders),
      settings: cape.getSettings(),
      positions: state.positions,
      previous: state.previous,
    }, [state.positions.buffer, state.previous.buffer]);
    return !this.failure;
  }

  public updateCape(
    capeId: number,
    cape: CapeSimulation,
    anchors: CapeAnchors,
  ): void {
    const registration = this.registrations.get(capeId);
    if (!registration || this.failure) return;
    registration.revision += 1;
    registration.latestState = null;
    const state = cape.copyPackedState();
    this.post(registration.slot.worker, {
      type: 'update-cape',
      capeId,
      revision: registration.revision,
      anchors: serializeCapeAnchors(anchors),
      settings: cape.getSettings(),
      positions: state.positions,
      previous: state.previous,
    }, [state.positions.buffer, state.previous.buffer]);
  }

  public unregisterCape(capeId: number): void {
    const registration = this.registrations.get(capeId);
    if (!registration) return;
    this.registrations.delete(capeId);
    registration.slot.capeIds.delete(capeId);
    this.post(registration.slot.worker, { type: 'remove-cape', capeId });
  }

  public enqueueStep(
    deltaTime: number,
    time: number,
    inputs: readonly WebGlCapeStepInput[],
  ): void {
    if (this.failure || this.disposed || this.registrations.size === 0) return;
    const byCapeId = new Map(inputs.map((input) => [input.capeId, input]));
    for (const slot of this.slots) {
      const capes = [...slot.capeIds].flatMap((capeId) => {
        const input = byCapeId.get(capeId);
        if (!input) return [];
        return [{
          capeId,
          anchors: serializeCapeAnchors(input.anchors),
          bodyColliderEndpoints: serializeCapsuleEndpoints(input.bodyColliders),
          characterVelocity: serializeVector3(input.characterVelocity),
        }];
      });
      if (capes.length > 0) slot.pendingFrames.push({ deltaTime, time, capes });
    }
  }

  /** Submits at most one in-flight batch per worker; later steps stay coalesced locally. */
  public flush(): void {
    if (this.failure || this.disposed) return;
    this.slots.forEach((slot) => this.dispatch(slot));
  }

  public consumeLatestState(capeId: number): PackedCapeState | null {
    const registration = this.registrations.get(capeId);
    if (!registration) return null;
    const state = registration.latestState;
    registration.latestState = null;
    return state;
  }

  public isDrivingCape(capeId: number): boolean {
    return !this.failure && this.registrations.has(capeId);
  }

  /** Harness barrier only. The animation loop never waits for worker completion. */
  public async synchronize(): Promise<void> {
    this.flush();
    if (this.failure || this.isDrained()) return;
    await new Promise<void>((resolve) => this.drainWaiters.add(resolve));
  }

  public getDiagnostics(): WebGlCapeWorkerDiagnostics {
    return {
      active: !this.disposed && !this.failure && this.registrations.size > 0,
      workers: this.slots.length,
      busyWorkers: this.slots.filter((slot) => slot.busy).length,
      queuedSteps: this.slots.reduce((sum, slot) => sum + slot.pendingFrames.length, 0),
      failure: this.failure,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      this.post(slot.worker, { type: 'dispose' });
      slot.worker.terminate();
    }
    this.slots.length = 0;
    this.registrations.clear();
    this.resolveDrainWaiters();
  }

  private createSlot(): WorkerSlot {
    const worker = new Worker(new URL('./CapePhysicsWorker.ts', import.meta.url), {
      type: 'module',
      name: `cape-physics-${this.slots.length + 1}`,
    });
    const slot: WorkerSlot = {
      worker,
      capeIds: new Set(),
      pendingFrames: [],
      busy: false,
      nextRequestId: 1,
    };
    worker.onmessage = (event: MessageEvent<CapeWorkerResponse>) => {
      this.handleResponse(slot, event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.disable(`Cape worker failed: ${event.message || 'unknown worker error'}`);
    };
    worker.onmessageerror = () => {
      this.disable('Cape worker returned an unreadable message.');
    };
    this.slots.push(slot);
    this.post(worker, {
      type: 'initialize',
      worldColliders: this.serializedWorldColliders,
    });
    return slot;
  }

  private leastLoadedSlot(): WorkerSlot {
    const slot = [...this.slots].sort((left, right) => (
      left.capeIds.size - right.capeIds.size
    ))[0];
    if (!slot) throw new Error('Cape worker pool has no worker slots.');
    return slot;
  }

  private dispatch(slot: WorkerSlot): void {
    if (slot.busy || slot.pendingFrames.length === 0 || this.failure) return;
    const frames = slot.pendingFrames.splice(0);
    const transfer = frames.flatMap((frame) => frame.capes.map(
      (cape) => cape.bodyColliderEndpoints.buffer,
    ));
    slot.busy = true;
    this.post(slot.worker, {
      type: 'step-batch',
      requestId: slot.nextRequestId,
      frames,
    }, transfer);
    slot.nextRequestId += 1;
  }

  private handleResponse(slot: WorkerSlot, response: CapeWorkerResponse): void {
    if (response.type === 'failure') {
      this.disable(`Cape worker solver failed: ${response.message}`);
      return;
    }
    slot.busy = false;
    for (const state of response.states) {
      const registration = this.registrations.get(state.capeId);
      if (!registration || registration.slot !== slot) continue;
      if (registration.revision !== state.revision) continue;
      registration.latestState = {
        positions: state.positions,
        previous: state.previous,
      };
    }
    this.dispatch(slot);
    if (this.isDrained()) this.resolveDrainWaiters();
  }

  private post(worker: Worker, message: CapeWorkerRequest, transfer: Transferable[] = []): void {
    if (this.failure || this.disposed) return;
    try {
      worker.postMessage(message, { transfer });
    } catch (error) {
      this.disable(`Could not submit cape worker work: ${
        error instanceof Error ? error.message : String(error)
      }`);
    }
  }

  private disable(message: string): void {
    if (this.failure) return;
    this.failure = message;
    console.error(message);
    this.slots.forEach((slot) => slot.worker.terminate());
    this.resolveDrainWaiters();
  }

  private isDrained(): boolean {
    return this.slots.every((slot) => !slot.busy && slot.pendingFrames.length === 0);
  }

  private resolveDrainWaiters(): void {
    this.drainWaiters.forEach((resolve) => resolve());
    this.drainWaiters.clear();
  }
}
