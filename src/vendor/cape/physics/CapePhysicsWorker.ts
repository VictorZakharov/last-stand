import * as THREE from 'three';
import { CRIMSON_CAPE_PALETTE } from './CapeAppearance';
import { CapeSimulation } from './CapeSimulation';
import {
  applySerializedCapsuleEndpoints,
  copySerializedCapeAnchors,
  deserializeCapeAnchors,
  deserializeCapsuleColliders,
  deserializeWorldColliders,
  type CapeWorkerBatchResult,
  type CapeWorkerFailure,
  type CapeWorkerRequest,
} from './CapeWorkerProtocol';
import type { WorldCollider } from './colliders';

interface WorkerCape {
  readonly simulation: CapeSimulation;
  readonly anchors: ReturnType<typeof deserializeCapeAnchors>;
  readonly bodyColliders: ReturnType<typeof deserializeCapsuleColliders>;
  readonly characterVelocity: THREE.Vector3;
  revision: number;
}

const capes = new Map<number, WorkerCape>();
let worldColliders: readonly WorldCollider[] = [];

function postFailure(error: unknown): void {
  const response: CapeWorkerFailure = {
    type: 'failure',
    message: error instanceof Error ? error.stack ?? error.message : String(error),
  };
  self.postMessage(response);
}

function handleMessage(message: CapeWorkerRequest): void {
  switch (message.type) {
    case 'initialize':
      worldColliders = deserializeWorldColliders(message.worldColliders);
      return;
    case 'add-cape': {
      capes.get(message.capeId)?.simulation.dispose();
      const anchors = deserializeCapeAnchors(message.anchors);
      const simulation = new CapeSimulation(
        anchors,
        message.settings,
        CRIMSON_CAPE_PALETTE,
        { renderResources: false },
      );
      simulation.overwriteStateForHarness(message.positions, message.previous);
      capes.set(message.capeId, {
        simulation,
        anchors,
        bodyColliders: deserializeCapsuleColliders(message.bodyColliders),
        characterVelocity: new THREE.Vector3(),
        revision: message.revision,
      });
      return;
    }
    case 'update-cape': {
      const cape = capes.get(message.capeId);
      if (!cape) return;
      copySerializedCapeAnchors(message.anchors, cape.anchors);
      cape.simulation.updateSettings(message.settings, cape.anchors);
      cape.simulation.overwriteStateForHarness(message.positions, message.previous);
      cape.revision = message.revision;
      return;
    }
    case 'remove-cape':
      capes.get(message.capeId)?.simulation.dispose();
      capes.delete(message.capeId);
      return;
    case 'step-batch': {
      const touchedCapeIds = new Set<number>();
      for (const frame of message.frames) {
        for (const input of frame.capes) {
          const cape = capes.get(input.capeId);
          if (!cape) continue;
          copySerializedCapeAnchors(input.anchors, cape.anchors);
          applySerializedCapsuleEndpoints(input.bodyColliderEndpoints, cape.bodyColliders);
          cape.characterVelocity.fromArray(input.characterVelocity);
          cape.simulation.step(
            frame.deltaTime,
            cape.anchors,
            cape.bodyColliders,
            worldColliders,
            cape.characterVelocity,
            frame.time,
          );
          touchedCapeIds.add(input.capeId);
        }
      }
      const states = [...touchedCapeIds].flatMap((capeId) => {
        const cape = capes.get(capeId);
        if (!cape) return [];
        const state = cape.simulation.copyPackedState();
        return [{
          capeId,
          revision: cape.revision,
          positions: state.positions,
          previous: state.previous,
        }];
      });
      const response: CapeWorkerBatchResult = {
        type: 'batch-result',
        requestId: message.requestId,
        states,
      };
      const transfer = states.flatMap((state) => [
        state.positions.buffer,
        state.previous.buffer,
      ]);
      self.postMessage(response, { transfer });
      return;
    }
    case 'dispose':
      capes.forEach((cape) => cape.simulation.dispose());
      capes.clear();
      (self as unknown as { close: () => void }).close();
  }
}

self.onmessage = (event: MessageEvent<CapeWorkerRequest>) => {
  try {
    handleMessage(event.data);
  } catch (error) {
    postFailure(error);
  }
};
