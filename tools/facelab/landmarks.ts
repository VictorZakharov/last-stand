// Face harness: anthropometric landmarks on the model, found from its distance field (face.ts, mm in the face's frame)
// with the definitions the reference's hand-placed points follow (annotate.py), so the two compare point for point
// (points.py). Used by facelab.mjs in the page (projected through its camera) and by quick Node checks.
import { headSDF, EYE, type FaceShape } from '../../src/entities/models/face';

export type P3 = [number, number, number];

/** how far the head reaches along `h` at height y (an orthographic view along v, h its horizontal): the outline's point */
export function extent(F: FaceShape, y: number, h: [number, number], v: [number, number], dMin = -60, dMax = 150): P3 | null {
  let best: P3 | null = null, bs = -Infinity;
  for (let d = dMin; d <= dMax; d += 2) {
    let s = 160;
    for (let i = 0; i < 300; i++) {
      const x = d * v[0] + s * h[0], z = d * v[1] + s * h[1], f = headSDF(x, y, z, F);
      if (f < 0.05) { if (s > bs) { bs = s; best = [x, y, z]; } break; }
      s -= Math.max(0.15, f * 0.9);
      if (s < 0) break;
    }
  }
  return best;
}

/** the face's front at (x, y): the skin's nearest point to a camera straight ahead */
export function front(F: FaceShape, x: number, y: number): number {
  let z = 200;
  for (let i = 0; i < 500; i++) { const f = headSDF(x, y, z, F); if (f < 0.05) return z; z -= Math.max(0.15, f * 0.9); if (z < -120) return NaN; }
  return z;
}

/** the jaw's lower edge seen from the front at x: going down the face, the last point before its front falls back to the
 *  neck behind it (or away) */
export function jawEdge(F: FaceShape, x: number, from = 60): P3 | null {
  let last: P3 | null = null;
  for (let y = from; y > -60; y -= 0.5) {
    const z = front(F, x, y);
    if (!Number.isFinite(z) || (last && z < last[2] - 6)) return last;
    last = [x, y, z];
  }
  return last;
}

const far = (p: P3, a: P3, b: P3) => {
  // (distance from p to the line a-b in the picture's plane, x and y)
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.hypot(dx, dy);
};

/**
 * The front view's points, his left side (+x; the right mirrors it): the pupil, the face's side at the brow (ft), its widest
 * at the cheekbones (zy), at the mouth's corners (cheek), the jaw's angle (go: the corner between the side and the jaw's
 * line), the jaw line's middle (jaw), the chin's corner (chin: where the jaw line turns along the chin's bottom), its
 * bottom (me). The cheek is taken `cheekAt` of the way down from the pupils to the chin's bottom (a reference's mouth
 * corners: 0.61).
 */
export function frontPoints(F: FaceShape, cheekAt = 0.61): Record<string, P3> {
  const H: [number, number] = [1, 0], V: [number, number] = [0, 1];
  const side = (y: number) => extent(F, y, H, V, 12);
  const P: Record<string, P3> = {};
  P.pupil = [EYE.x, EYE.y, EYE.z + EYE.r];
  P.ft = side(EYE.y + 13)!;
  let zy: P3 | null = null;
  for (let y = 84; y <= 110; y += 1) { const s = side(y); if (s && (!zy || s[0] > zy[0])) zy = s; }
  P.zy = zy!;
  // the outline from the chin out along the jaw's line, then up the side
  const jaw: P3[] = [], mouthY = EYE.y - 64;
  for (let x = 0; x <= 75; x += 1) { const e = jawEdge(F, x, mouthY); if (!e) break; jaw.push(e); }
  P.me = jaw[0];
  P.cheek = side(EYE.y - cheekAt * (EYE.y - P.me[1]))!;
  const out: P3[] = [...jaw];
  for (let y = jaw[jaw.length - 1][1]; y <= mouthY; y += 1) { const s = side(y); if (s && s[0] >= out[out.length - 1][0] - 0.5) out.push(s); }
  let go = out[0], gd = -1;
  for (const p of out) { const d = far(p, P.me, P.zy); if (p[1] < P.zy[1] && d > gd) { gd = d; go = p; } }
  P.go = go;
  let chin = jaw[0], cd = -1;
  for (const p of jaw) { if (p[0] > go[0]) break; const d = far(p, P.me, go); if (d > cd) { cd = d; chin = p; } }
  P.chin = chin;
  const mid = (chin[0] + go[0]) / 2;
  P.jaw = jaw.reduce((a, b) => (Math.abs(b[0] - mid) < Math.abs(a[0] - mid) ? b : a));
  return P;
}
