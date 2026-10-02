// Face harness: what makes hair read as a wig, from its meshes at rest in the head's own millimetres (the face's frame):
// how far it stands off the skin just behind the hairline (a wig's edge is a ledge; combed hair lies close there), where
// its locks end round the head (one level hem all round is a bob; combed back, they end at the nape), and how much of the
// ears it covers. The mage's old swept hair, a cap standing 6 mm off within 16 mm of the hairline and locks hung straight
// down from where they left the head to about the jaw, read as a wig. Run in the page by facelab.mjs.
import * as THREE from 'three';
import { FACES, LOOKS, headSDF, hairline } from '../../src/entities/models/face';
import { HEAD_MM } from '../../src/entities/models/head';

export interface HairShape {
  /** how far the hair stands off the skin (mm, the 90th percentile) 0-10 mm behind the hairline, across the forehead and
   *  at the temples */
  edgeFront: number; edgeTemple: number;
  /** the locks' ends' heights (mm: 10th, 50th, 90th percentiles) at the sides (from the ear forward) and behind */
  endsSide: number[]; endsBack: number[];
  /** the share of each ear's outline, seen from its side, that hair covers */
  ears: number;
}

export function measureHair(root: THREE.Object3D, who: keyof typeof FACES): HairShape | null {
  const F = FACES[who], L = LOOKS[who];
  root.updateMatrixWorld(true);
  let face: THREE.Mesh | null = null;
  root.traverse((o) => { if (o.name === 'face') face = o as THREE.Mesh; });
  const head = face!.parent!, Hinv = head.matrixWorld.clone().invert();
  const hair = head.children.filter((o) => o.name === 'hair' && o.visible) as THREE.Mesh[];
  if (!hair.length) return null;
  const v = new THREE.Vector3(), mm = (o: THREE.Mesh, i: number) => { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld).applyMatrix4(Hinv); return [v.x / HEAD_MM, v.y / HEAD_MM, v.z / HEAD_MM + 5]; };
  const front: number[] = [], temple: number[] = [], side: number[] = [], back: number[] = [];
  // the ears seen from each side (1 mm cells, y 50..160, z -70..40): which of their cells hair lies outside of
  const ears = head.children.filter((o) => (o as THREE.Mesh).isMesh && o.name !== 'face' && o.name !== 'hair' && o.name !== 'beard' && (o as THREE.Mesh).geometry.attributes.color && !((o as THREE.Mesh).material as THREE.MeshStandardMaterial).map) as THREE.Mesh[];
  const EW = 110, EH = 110, earX = [new Float32Array(EW * EH).fill(NaN), new Float32Array(EW * EH).fill(NaN)], hairX = [new Float32Array(EW * EH).fill(-1e9), new Float32Array(EW * EH).fill(-1e9)];
  const raster = (o: THREE.Mesh, into: Float32Array[], keep: (cur: number, x: number) => boolean) => {
    const g = o.geometry, idx = g.index, n = idx ? idx.count : g.attributes.position.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const T = [0, 1, 2].map((k) => mm(o, idx ? idx.getX(t + k) : t + k));
      const side = T[0][0] + T[1][0] + T[2][0] > 0 ? 0 : 1, buf = into[side];
      const P = T.map(([x, y, z]) => [z + 70, y - 50, Math.abs(x)]);
      const den = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]); if (Math.abs(den) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(EW - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(EH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const px = xx + 0.5, py = yy + 0.5, l1 = ((P[1][1] - P[2][1]) * (px - P[2][0]) + (P[2][0] - P[1][0]) * (py - P[2][1])) / den, l2 = ((P[2][1] - P[0][1]) * (px - P[2][0]) + (P[0][0] - P[2][0]) * (py - P[2][1])) / den;
        if (l1 < -1e-6 || l2 < -1e-6 || 1 - l1 - l2 < -1e-6) continue;
        const d = l1 * P[0][2] + l2 * P[1][2] + (1 - l1 - l2) * P[2][2], k = yy * EW + xx;
        if (keep(buf[k], d)) buf[k] = d;
      }
    }
  };
  for (const e of ears) raster(e, earX, (cur, x) => Number.isNaN(cur) || x > cur);
  for (const o of hair) {
    const P = o.geometry.attributes.position, U = o.geometry.attributes.uv, cardsOf = !!o.geometry.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const [x, y, z] = mm(o, i), ax = Math.abs(x), a = Math.atan2(ax, z + 12), hr = Math.hypot(ax, z + 12);
      const inside = y - hairline(hr * Math.sin(a), hr * Math.cos(a) - 12, L.hairDrop, L.templeDrop), off = headSDF(x, y, z, F);
      if (inside >= 0 && inside < 10 && off > -2) (a < 0.6 ? front : a < 1.2 ? temple : null)?.push(Math.max(0, off));
      // (a card's end: its texture's tip)
      if (cardsOf && U && U.getY(i) < 0.02) (a < 1.9 ? side : back).push(y);
    }
    if (o.geometry.attributes.color) raster(o, hairX, (cur, x) => x > cur);
  }
  let earCells = 0, covered = 0;
  for (let s2 = 0; s2 < 2; s2++) for (let k = 0; k < EW * EH; k++) if (!Number.isNaN(earX[s2][k])) { earCells++; if (hairX[s2][k] > earX[s2][k] + 0.5) covered++; }
  const pct = (a: number[], f: number) => { if (!a.length) return NaN; const s = a.slice().sort((p, q) => p - q); return Math.round(s[Math.floor(f * (s.length - 1))] * 10) / 10; };
  return {
    edgeFront: pct(front, 0.9), edgeTemple: pct(temple, 0.9),
    endsSide: [0.1, 0.5, 0.9].map((f) => pct(side, f)), endsBack: [0.1, 0.5, 0.9].map((f) => pct(back, f)),
    ears: Math.round(covered / Math.max(1, earCells) * 100) / 100,
  };
}
