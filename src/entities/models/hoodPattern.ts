// A hood as a tailor cuts one: two mirrored panels sewn together over the top of the head and down the back, each
// from the face's edge in front to that seam behind, with the neck at its foot and a capelet below it flaring out over
// the shoulders (after GarmentCode's hood panel, MIT, Korosteleva and Sorkine-Hornung 2023, and medieval hoods with a
// shoulder cape). Laid flat, it gives the cloth its lengths (`HoodCloth`'s `length`): where the head is narrower than
// the cut, the cloth is full, and it falls to a soft point behind the crown and gathers round the neck by itself.
// (Shaped by hand as offsets over the head, the hood stood as a box, then a chimney, its opening a straight-walled
// frame: never natural.)
//
// The cut's grid is the cloth's: `nu` columns across both panels, from one face edge round the back to the other (the
// back seam the middle column, shared), `nv` rows down, the top seam along row 0 and the neck at row `neckRow`. In the
// flat each hood panel's rows are level and its columns run from the face's edge to the seam; the capelet below the neck
// is a piece of its own sewn on there, a sector of a circle in one piece round the back (its rows arcs: cut with straight
// rows, it could only fold into flat planes, a paper cone).

/** a hood's cut (m, flat): its face edge from the top seam to the neck, its top seam from the face to the point behind,
 *  how far the back's curve stands out behind the skull, its neck edge (half the neckline), the capelet below the neck,
 *  and its hem (half of it); `chin`, how far back the face edge comes in at the throat. `widths`, each row's width from
 *  the top seam to the neck as measured off the head, in place of the top, the bulge and the neck's curve between */
export interface HoodCut {
  front: number;
  top: number;
  bulge: number;
  widths?: number[];
  neck: number;
  chin: number;
  mantle: number;
  hem: number;
}

export interface HoodDraft {
  /** each particle's place in its panel, flat (x back from the face, y down; the two panels' the same) */
  flat: Float32Array;
  /** each place from the neck down in the capelet's piece, flat */
  cape: Float32Array;
  /** the cloth's length between particles `a` and `b` as cut: flat in a panel, and across the back seam with the other
   *  panel folded over it */
  length(a: number, b: number): number;
}

const smooth = (t: number) => { const s = Math.min(1, Math.max(0, t)); return s * s * (3 - 2 * s); };

/** The panel's front and back edges at depth `y` down it: where the face's edge and the seam are across it (m). */
function edges(cut: HoodCut, y: number): [number, number] {
  const chin = cut.chin, neckBack = chin + cut.neck;
  if (y <= cut.front && cut.widths) {
    // (between the rows measured)
    const s = y / cut.front, at = s * (cut.widths.length - 1), k = Math.min(Math.floor(at), cut.widths.length - 2);
    const width = cut.widths[k] + (cut.widths[k + 1] - cut.widths[k]) * (at - k);
    return [chin * s * s, chin * s * s + width];
  }
  if (y <= cut.front) {
    const s = y / cut.front;
    // (the face's edge coming back under the chin; the seam from the point behind the crown out round the back of the
    // skull and in to the nape)
    return [chin * s * s, cut.top + (neckBack - cut.top) * smooth(s) + cut.bulge * Math.sin(Math.PI * s)];
  }
  return [chin, neckBack];
}

/** The cut laid out on the cloth's grid. */
export function draftHood(cut: HoodCut, nu: number, nv: number, neckRow: number): HoodDraft {
  const W = nu + 1, half = nu / 2, flat = new Float32Array(W * (nv + 1) * 2);
  const depth = (r: number) => (r <= neckRow ? (r / neckRow) * cut.front : cut.front + ((r - neckRow) / (nv - neckRow)) * cut.mantle);
  for (let r = 0; r <= nv; r++) {
    const y = depth(r), [x0, xb] = edges(cut, y);
    for (let c = 0; c <= nu; c++) {
      const f = (c <= half ? c : nu - c) / half, i = r * W + c;
      flat[i * 2] = x0 + f * (xb - x0);
      flat[i * 2 + 1] = y;
    }
  }
  // (the capelet: from the neck's arc, both panels' necklines long, out to the hem's, its depth between them)
  const cape = new Float32Array(W * (nv + 1) * 2), turn = (cut.hem - cut.neck) / cut.mantle, r0 = cut.neck / turn;
  for (let r = neckRow; r <= nv; r++) {
    const rad = r0 + ((r - neckRow) / (nv - neckRow)) * cut.mantle;
    for (let c = 0; c <= nu; c++) {
      const a = (c / nu - 0.5) * 2 * turn, i = r * W + c;
      cape[i * 2] = rad * Math.sin(a);
      cape[i * 2 + 1] = rad * Math.cos(a);
    }
  }
  const side = (i: number) => Math.sign((i % W) - half);
  const row = (i: number) => Math.floor(i / W);
  const length = (a: number, b: number): number => {
    const ra = row(a), rb = row(b), lo = Math.min(ra, rb), hi = Math.max(ra, rb);
    if (lo < neckRow && hi > neckRow) {
      // (over the neck's seam: down to it in the hood, on from it in the capelet)
      const at = neckRow * W + (a % W);
      return length(a, at) + length(at, b);
    }
    if (hi > neckRow) return Math.hypot(cape[a * 2] - cape[b * 2], cape[a * 2 + 1] - cape[b * 2 + 1]);
    return hoodLength(a, b);
  };
  const hoodLength = (a: number, b: number) => {
    const ax = flat[a * 2], ay = flat[a * 2 + 1];
    let bx = flat[b * 2], by = flat[b * 2 + 1];
    if (side(a) * side(b) < 0) {
      // (across the seam: the other panel folded over it, about the seam's line at b's row)
      const r = Math.floor(b / W), s = r * W + half, sx = flat[s * 2], sy = flat[s * 2 + 1];
      const e = 1e-3, y = depth(r), tx = edges(cut, y + e)[1] - edges(cut, y - e)[1], ty = 2 * e, tl = Math.hypot(tx, ty);
      const ux = tx / tl, uy = ty / tl, vx = bx - sx, vy = by - sy, along = vx * ux + vy * uy;
      bx = sx + 2 * along * ux - vx;
      by = sy + 2 * along * uy - vy;
    }
    return Math.hypot(ax - bx, ay - by);
  };
  return { flat, cape, length };
}
