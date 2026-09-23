import * as THREE from 'three';
import { CAPE } from '../config';
import type { CapeAnchors } from '../player/Character';
import { getCapeRestBackOffset, getCapeRestWidth } from './CapeRestShape';
import type { CapePhysicsSettings } from './CapeSettings';

export function setCapeAnchorTarget(
  anchors: CapeAnchors,
  progress: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const neckline = Math.sin(progress * Math.PI);
  target.lerpVectors(anchors.left, anchors.right, progress);
  target.y += neckline * CAPE.attachment.necklineRise;
  target.addScaledVector(anchors.back, neckline * CAPE.attachment.necklineDepth);
  return target;
}

export function createCapeInitialParticlePositions(
  anchors: CapeAnchors,
  settings: Pick<CapePhysicsSettings, 'length' | 'width'>,
): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const anchorWidth = anchors.right.distanceTo(anchors.left);
  const right = anchors.right.clone().sub(anchors.left).normalize();
  const center = anchors.left.clone().add(anchors.right).multiplyScalar(0.5);
  for (let row = 0; row < CAPE.rows; row += 1) {
    const down = row / (CAPE.rows - 1);
    const width = getCapeRestWidth(anchorWidth, down, settings.width);
    for (let column = 0; column < CAPE.columns; column += 1) {
      const across = column / (CAPE.columns - 1) - 0.5;
      const position = center.clone()
        .addScaledVector(right, across * width)
        .addScaledVector(anchors.back, getCapeRestBackOffset(down, across))
        .add(new THREE.Vector3(
          0,
          -down * settings.length * (1 - Math.abs(across) * 0.085),
          0,
        ));
      if (row === 0) {
        setCapeAnchorTarget(anchors, column / (CAPE.columns - 1), position);
      }
      positions.push(position);
    }
  }
  return positions;
}

export function packCapeParticlePositions(positions: readonly THREE.Vector3[]): Float32Array {
  const packed = new Float32Array(positions.length * 4);
  positions.forEach((position, index) => {
    const offset = index * 4;
    packed[offset] = position.x;
    packed[offset + 1] = position.y;
    packed[offset + 2] = position.z;
  });
  return packed;
}

export function createPackedCapeInitialState(
  anchors: CapeAnchors,
  settings: Pick<CapePhysicsSettings, 'length' | 'width'>,
): Float32Array {
  return packCapeParticlePositions(createCapeInitialParticlePositions(anchors, settings));
}
