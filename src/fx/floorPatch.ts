// A mark on the floor that lies on it everywhere: a ring or a disc whose every point sits on the ground under it, so one
// crossing the dais's step climbs it. Laid in one plane at its middle's height, it went under the dais where it crossed
// the step and stood in the air off it.
import * as THREE from 'three';
import { groundHeight } from '../world/arena';

/** A ring `inner`..`outer` from its middle (a disc for `inner` 0), `rings` x `segs` points, flat on y = 0 until laid. */
export function floorPatch(inner: number, outer: number, rings: number, segs: number): THREE.BufferGeometry {
  const pos = new Float32Array((rings + 1) * (segs + 1) * 3), idx: number[] = [];
  for (let r = 0; r <= rings; r++) for (let k = 0; k <= segs; k++) {
    const a = k / segs * Math.PI * 2, d = inner + (outer - inner) * r / rings;
    pos.set([Math.cos(a) * d, 0, Math.sin(a) * d], (r * (segs + 1) + k) * 3);
  }
  for (let r = 0; r < rings; r++) for (let k = 0; k < segs; k++) { const i = r * (segs + 1) + k, j = i + segs + 1; idx.push(i, j, i + 1, i + 1, j, j + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}

/** A patch's points onto the ground under them: its mesh at (x, 0, z), unturned, scaled `scale` across (not up), `lift` above the ground. */
export function lay(g: THREE.BufferGeometry, x: number, z: number, lift: number, scale = 1): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(x + p.getX(i) * scale, z + p.getZ(i) * scale) + lift);
  p.needsUpdate = true;
}
