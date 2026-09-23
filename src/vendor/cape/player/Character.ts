// Shim: the cape solver only needs the anchor type from cape-physics' Character.
import type * as THREE from 'three';

/** World-space neckline anchors: the two shoulder ends and a point on the upper back. */
export interface CapeAnchors {
  readonly left: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly back: THREE.Vector3;
}
