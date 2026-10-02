// Facelab: a hero's shoulders at rest, the body's outline seen square from the front (the chest joint's frame, 2 mm cells),
// its top edge from the neck out over each shoulder: the slope from the neck to the shoulder's top (a man's trapezius:
// about 20 degrees) and any bump, how far the outline rises again above its lowest point nearer the neck (the arm's tube top
// standing over the body: the mage's tunic, a round barrel with the arms' tubes stood beside it, read as a coat hanger).
// Run in the page by facelab.mjs.
import * as THREE from 'three';
import type { Model } from '../../src/types';

export interface ShoulderShape { side: string; slope: number; bump: number }

export function measureShoulders(m: Model): ShoulderShape[] {
  m.root.updateMatrixWorld(true);
  const j = m.joints!, inv = j.chest.matrixWorld.clone().invert(), v = new THREE.Vector3();
  let head: THREE.Object3D | null = null;
  m.root.traverse((o) => { if (o.name === 'face') head = o.parent; });
  const skip = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible || q === head || q === m.tip?.parent || q.name === 'flask') return true; return false; };
  const C = 0.002, X0 = -0.4, Y0 = -0.1, W = 400, H = 300, mask = new Uint8Array(W * H), P = [[0, 0], [0, 0], [0, 0]];
  m.root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || skip(o)) return;
    const mesh = o as THREE.Mesh, g = mesh.geometry, idx = g.index, n = idx ? idx.count : g.attributes.position.count;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) { mesh.getVertexPosition(idx ? idx.getX(t + k) : t + k, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); P[k][0] = (v.x - X0) / C; P[k][1] = (v.y - Y0) / C; }
      const [a, b, c] = P, den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5, l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
        if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) mask[y * W + x] = 1;
      }
    }
  });
  const top = (x: number) => { const c = Math.round((x - X0) / C); for (let y = H - 1; y >= 0; y--) if (mask[y * W + c]) return Y0 + (y + 0.5) * C; return NaN; };
  return [1, -1].map((s) => {
    const row: [number, number][] = [];
    for (let x = 0.08; x <= 0.3001; x += 0.01) row.push([x, top(s * x)]);
    const yN = row[0][1], yS = top(s * 0.2);
    // (the rise above the lowest point nearer the neck: a shoulder only falls from it)
    let bump = 0, lo = yN;
    for (const [, y] of row) { if (Number.isNaN(y)) continue; bump = Math.max(bump, y - lo); lo = Math.min(lo, y); }
    return { side: s > 0 ? 'left' : 'right', slope: Math.round(Math.atan2(yN - yS, 0.12) * 1800 / Math.PI) / 10, bump: Math.round(bump * 10000) / 10 };
  });
}
