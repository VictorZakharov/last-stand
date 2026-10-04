// A man's plain tunic over the rig's chest (the mage's under his robe, the ranger's coat): its shape round the chest and
// over the shoulders, the neckline round the neck and its rolled hem there, and the waist below it. Shared by the heroes
// built on the same frame, so each meets the neck as a man's does.
import * as THREE from 'three';
import { belt, TILE } from './armor';
import { curve, type Keys } from './motion';
import { clamp } from '../../util';

/** chest joint space (m): at each height its half-width and half-depth, and how square its section is. Over the shoulders
 *  it is as broad as the arms' tops and thin front to back, the trapezius sloping down from the neck and a deltoid
 *  rounding over each shoulder joint down into the armpit (a round barrel of a body, with the arms' tubes stood beside it
 *  under their own round tops, read as a coat hanger) */
const TUNIC_W: Keys = [[-0.12, 0.143], [-0.02, 0.152], [0.1, 0.162], [0.15, 0.18], [0.19, 0.232], [0.215, 0.248], [0.238, 0.24], [0.256, 0.2], [0.274, 0.14], [0.289, 0.098], [0.3, 0.0765]];
const TUNIC_D: Keys = [[-0.12, 0.125], [-0.02, 0.133], [0.1, 0.142], [0.16, 0.138], [0.21, 0.118], [0.25, 0.094], [0.275, 0.08], [0.3, 0.0715]];
const TUNIC_P: Keys = [[-0.12, 2], [0.12, 2], [0.2, 2.6], [0.26, 2.6], [0.3, 2]];
/** how far back the neckline sits (m): round the neck, which rises from the back of the chest (its middle a centimetre
 *  behind the chest's: centred on the chest, the collar was tight at the back and a man's neck came through it; a few mm
 *  loose all round, as the neck leans back in it at a run and turns in it) */
const NECKLINE_BACK = 0.0125;
const neckBack = (y: number) => { const t = clamp((y - 0.26) / 0.04, 0, 1); return -NECKLINE_BACK * t * t * (3 - 2 * t); };
/** the tunic's height range on the chest joint (m): from below the chest's joint up to the neckline */
export const TUNIC_Y: [number, number] = [-0.12, 0.3];
/** below it, round the spine joint (m): half-width at each height, the depth 0.86 of it */
export const WAIST: [number, number][] = [[0.148, -0.05], [0.15, 0.08], [0.152, 0.2], [0.155, 0.26]];

/** a point on the tunic towards `a` round it (0 the front, +x his left) at height y, `lift` above it */
export function onTunic(a: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const X = curve(TUNIC_W, y) + lift, Z = curve(TUNIC_D, y) + lift, e = 2 / curve(TUNIC_P, y), s = Math.sin(a), c = Math.cos(a);
  return out.set(Math.sign(s) * Math.abs(s) ** e * X, y, Math.sign(c) * Math.abs(c) ** e * Z + neckBack(y));
}
/** the point on the tunic's front `x` across */
export const tunicFront = (x: number, y: number, lift: number) => onTunic(Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the point on the tunic's back `x` across (+x his left) */
export const tunicBack = (x: number, y: number, lift: number) => onTunic(Math.PI - Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the rolled hem round the neckline */
export const neckHem = () => belt(0.0765, 0.0715, 0.297, 0.012, 0.006, 0, 28).translate(0, 0, neckBack(0.297));

/** the armhole cut round each shoulder, in the tunic's own terms: its middle's height up the side (`y`), its half-width round
 *  the tunic (`A`, rad) and its half-height (`B`), from the shoulder's top over the joint down to the armpit, where the
 *  sleeve is set in (a sleeve's tube stood in a whole tunic: raised, it came out of the cloth over the shoulder as a tube
 *  stuck into the body) */
export const ARMHOLE = { y: 0.196, A: 0.4, B: 0.056 };
const H_TAU = Math.PI * 2;
/** side s's armhole (+1 his left) at `t` round it (0 its top, π/2 its front, π the armpit), as the tunic's angle round and
 *  height (`onTunic`'s) */
export const armholeAt = (s: number, t: number): [number, number] => [s * (Math.PI / 2 - ARMHOLE.A * Math.sin(t)), ARMHOLE.y + ARMHOLE.B * Math.cos(t)];
/** `n` points round side s's armhole on the tunic, `lift` off it */
export const armholeEdge = (s: number, n: number, lift = 0) => Array.from({ length: n }, (_, i) => onTunic(...armholeAt(s, i / n * H_TAU), lift));

/**
 * The tunic over the chest with each armhole cut out, as its left and right halves (split down the middle front and back):
 * each a grid laid out from its armhole, `around` points round the hole's edge (the sleeve's own, `setInSleeve` with as
 * many) and `rows` out from there to the half's edges (its middle front and back, the neckline and the foot), so the edge
 * it shares with the sleeve is the same points. Shaded with the surface's own normals (the same on both halves where they
 * meet). Its uvs run in metres / TILE, the right half's from the back's middle round to the front's, the left's on from
 * there. (A grid round the body with its points inside the hole moved out onto its edge folded its triangles over along
 * the seam, and the sleeve's top met it between their points: a jagged seam, with gaps)
 */
export function tunicCut(around: number, rows: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  // (laid out in the half's own terms with the angle round in metres at about the chest's width, about the hole's middle)
  const RW = 0.18, X = Math.PI / 2 * RW, Y0 = TUNIC_Y[0] - ARMHOLE.y, Y1 = TUNIC_Y[1] - ARMHOLE.y;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), da = new THREE.Vector3(), dy = new THREE.Vector3();
  // uvs: arc length round the chest at the hole's height and up the front's middle, read at each point's place
  const NS = 128, su = [0], sv = [0], ys = Array.from({ length: NS + 1 }, (_, j) => TUNIC_Y[0] + (TUNIC_Y[1] - TUNIC_Y[0]) * j / NS);
  for (let i = 1; i <= NS; i++) su.push(su[i - 1] + onTunic(-Math.PI + i / NS * H_TAU, ARMHOLE.y, 0, p).distanceTo(onTunic(-Math.PI + (i - 1) / NS * H_TAU, ARMHOLE.y, 0, q)) / TILE);
  for (let j = 1; j <= NS; j++) sv.push(sv[j - 1] + onTunic(0, ys[j], 0, p).distanceTo(onTunic(0, ys[j - 1], 0, q)) / TILE);
  const at = (tab: number[], x: number) => { const i = Math.min(NS - 1, Math.max(0, Math.floor(x))); return tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
  const uAt = (a: number) => at(su, (a + Math.PI) / H_TAU * NS), vAt = (y: number) => at(sv, (y - TUNIC_Y[0]) / (TUNIC_Y[1] - TUNIC_Y[0]) * NS);
  return [1, -1].map((s) => {
    // each column from the hole's edge straight out (in those terms) to where that line leaves the half
    const P: THREE.Vector3[][] = [], A: [number, number][][] = [];
    for (let i = 0; i < around; i++) {
      const [a0, y0] = armholeAt(s, i / around * H_TAU), ex = (s * a0 - Math.PI / 2) * RW, ey = y0 - ARMHOLE.y, l = Math.hypot(ex, ey), dx = ex / l, dyy = ey / l;
      const t = Math.min(dx > 1e-9 ? X / dx : dx < -1e-9 ? -X / dx : Infinity, dyy > 1e-9 ? Y1 / dyy : dyy < -1e-9 ? Y0 / dyy : Infinity);
      const col: THREE.Vector3[] = [], ac: [number, number][] = [];
      for (let k = 0; k <= rows; k++) {
        const f = (k / rows) ** 1.4, mx = ex + (dx * t - ex) * f, my = ey + (dyy * t - ey) * f;
        const a = s * (Math.PI / 2 + mx / RW), y = ARMHOLE.y + my;
        col.push(onTunic(a, y, 0)); ac.push([a, y]);
      }
      P.push(col); A.push(ac);
    }
    // the surface's own normal at each point, facing out
    const N = A.map((col, i) => col.map(([a, y], k) => {
      onTunic(a + 1e-3, y, 0, p); onTunic(a - 1e-3, y, 0, q); da.subVectors(p, q);
      onTunic(a, y + 1e-3, 0, p); onTunic(a, y - 1e-3, 0, q); dy.subVectors(p, q);
      const n = new THREE.Vector3().crossVectors(da, dy).normalize(), c = P[i][k];
      return n.dot(q.set(c.x, c.y - 0.1, c.z)) < 0 ? n.negate() : n;
    }));
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
    const put = (i: number, k: number) => { const c = P[i % around][k], n = N[i % around][k], [a, y] = A[i % around][k]; pos.push(c.x, c.y, c.z); nrm.push(n.x, n.y, n.z); uv.push(uAt(a), vAt(y)); };
    for (let i = 0; i < around; i++) for (let k = 0; k < rows; k++) {
      // (wound to face the way its normals do)
      const c = P[i][k], e1 = q.subVectors(P[(i + 1) % around][k], c), e2 = da.subVectors(P[i][k + 1], c), out = dy.crossVectors(e1, e2).dot(N[i][k]) > 0;
      const quad: [number, number][] = out ? [[i, k], [i + 1, k], [i, k + 1], [i + 1, k], [i + 1, k + 1], [i, k + 1]] : [[i, k], [i, k + 1], [i + 1, k], [i + 1, k], [i, k + 1], [i + 1, k + 1]];
      for (const [ii, kk] of quad) put(ii, kk);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }) as [THREE.BufferGeometry, THREE.BufferGeometry];
}

/**
 * A sleeve set into side s's armhole: its top the armhole's edge on the tunic, over the shoulder from there (carrying on the
 * tunic's own slope across the seam outside, straight in under the arm) onto a tube round the arm `join` below the shoulder
 * joint `S` (the chest's frame), and on down as `limb` is (`len`, radius `r0` to `r1`, a `bulge` at `at`, a rounded end).
 * In the chest's frame, smooth-shaded all round; `capT` per vertex: 0 on the armhole's edge, 1 from the tube on.
 */
export function setInSleeve(s: number, S: THREE.Vector3, o: { len: number; r0: number; r1: number; bulge: number; at: number; join: number; joinIn?: number; full?: number; fullIn?: number; around?: number; cap?: number; tube?: number }): THREE.BufferGeometry {
  const M = o.around ?? 32, NC = o.cap ?? 8, NT = o.tube ?? 14, NE = 4, full = o.full ?? 1.4;
  // (the tube's top ring lower under the arm, `joinIn` more: cut level, the cap's underside was a short flap folded in
  // under the armpit, stretched three times its length when the arm went up)
  const hj = (t: number) => o.join + (o.joinIn ?? 0) * (1 - Math.cos(t)) / 2;
  const rad = (h: number) => { const t = h / o.len; return (o.r0 + (o.r1 - o.r0) * t) * (1 + o.bulge * Math.exp(-(((t - o.at) / 0.28) ** 2))); };
  const rows: THREE.Vector3[][] = [], capT: number[] = [];
  const P0 = new THREE.Vector3(), P2 = new THREE.Vector3(), R = new THREE.Vector3(), m0 = new THREE.Vector3(), chord = new THREE.Vector3();
  const around = (h: number, phi: number, r: number) => new THREE.Vector3(S.x + s * Math.cos(phi) * r, S.y - h, S.z + Math.sin(phi) * r);
  // the cap: from the armhole's edge to the tube's top ring, a cubic leaving the edge along the tunic and reaching the ring going down
  const caps: THREE.Vector3[][] = [];
  for (let i = 0; i < M; i++) {
    const t = i / M * H_TAU, [a, y] = armholeAt(s, t);
    onTunic(a, y, 0, P0); onTunic(s * Math.PI / 2 + (a - s * Math.PI / 2) * 0.9, ARMHOLE.y + (y - ARMHOLE.y) * 0.9, 0, P2);
    R.copy(around(hj(t), t, rad(hj(t))));
    chord.subVectors(R, P0); const c = chord.length(); chord.divideScalar(c);
    // (all round on as the tunic runs, and under the arm turned over in the cap's first few centimetres down onto the arm: the
    // seam moves with the arm as the cloth either side of it does, so a fold at the seam stays one whatever the arm does,
    // and turned at the seam under the arm, raised it kept a crease there)
    const w = (1 + Math.cos(t)) / 2, fi = o.fullIn ?? full;
    m0.subVectors(P2, P0).normalize().multiplyScalar(c * (fi + (full - fi) * w));
    const col: THREE.Vector3[] = [];
    for (let k = 0; k <= NC; k++) {
      const u = k / NC, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
      col.push(new THREE.Vector3().addScaledVector(P0, h00).addScaledVector(m0, h10).addScaledVector(R, h01).add(new THREE.Vector3(0, -c, 0).multiplyScalar(h11)));
    }
    caps.push(col);
  }
  for (let k = 0; k <= NC; k++) { rows.push(caps.map((col) => col[k])); capT.push(k / NC); }
  // (the tube below the cap with a third as many points round it: only the seam needs the armhole's)
  const MT = Math.max(8, Math.round(M / 3));
  for (let r = 1; r <= NT; r++) { rows.push(Array.from({ length: MT }, (_, i) => { const t = i / MT * H_TAU, h = hj(t) + (o.len - hj(t)) * r / NT; return around(h, t, rad(h)); })); capT.push(1); }
  for (let e = 1; e <= NE; e++) { const q = e / NE * Math.PI / 2; rows.push(Array.from({ length: MT }, (_, i) => around(o.len + Math.sin(q) * o.r1 * 0.8, i / MT * H_TAU, Math.max(1e-4, Math.cos(q) * o.r1)))); capT.push(1); }
  // smooth normals round it (closed round), each row to the next as quads, or zipped where their counts differ
  const nr = rows.length, start: number[] = [], flat: number[] = [], frac: number[] = [], rowOf: number[] = [];
  for (let k = 0; k < nr; k++) { start.push(flat.length / 3); rows[k].forEach((v, i) => { flat.push(v.x, v.y, v.z); frac.push(i / rows[k].length); rowOf.push(k); }); }
  const tris: number[] = [];
  for (let k = 0; k + 1 < nr; k++) {
    const na = rows[k].length, nb = rows[k + 1].length, A = (i: number) => start[k] + (i % na), B = (j: number) => start[k + 1] + (j % nb);
    let i = 0, j = 0;
    while (i < na || j < nb) {
      if (j >= nb || (i < na && (i + 1) / na <= (j + 1) / nb)) { tris.push(A(i), B(j), A(i + 1)); i++; }
      else { tris.push(A(i), B(j), B(j + 1)); j++; }
    }
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3)); g0.setIndex(tris); g0.computeVertexNormals();
  const N = g0.attributes.normal;
  let facing = 0;
  for (let v = 0; v < N.count; v++) facing += N.getX(v) * (flat[v * 3] - S.x) + N.getZ(v) * (flat[v * 3 + 2] - S.z);
  const flip = facing < 0;
  // uvs: round the tube's top ring, and down the cap's columns' own lengths, then on down the tube
  const ring = 2 * Math.PI * rad(o.join) / TILE, down: number[][] = [];
  for (let i = 0; i < M; i++) { const col = [0]; for (let k = 1; k <= NC; k++) col.push(col[k - 1] + caps[i][k].distanceTo(caps[i][k - 1]) / TILE); down.push(col); }
  const vAt = (v: number) => {
    const k = rowOf[v], f = frac[v];
    if (k <= NC) return down[Math.round(f * M) % M][k];
    const i = f * M, i0 = Math.floor(i) % M, i1 = (i0 + 1) % M, end = down[i0][NC] + (down[i1][NC] - down[i0][NC]) * (i - Math.floor(i));
    return end + rows[k][Math.round(f * rows[k].length) % rows[k].length].distanceTo(rows[NC][Math.round(f * M) % M]) / TILE;
  };
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], ct: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const vs = flip ? [tris[t], tris[t + 2], tris[t + 1]] : [tris[t], tris[t + 1], tris[t + 2]];
    // (a triangle across the seam round the back: its points past it counted on round from there)
    const fs = vs.map((v) => frac[v]), wrap = Math.max(...fs) - Math.min(...fs) > 0.5;
    vs.forEach((v, q) => {
      const f = flip ? -1 : 1;
      pos.push(flat[v * 3], flat[v * 3 + 1], flat[v * 3 + 2]); nrm.push(N.getX(v) * f, N.getY(v) * f, N.getZ(v) * f);
      uv.push((wrap && fs[q] < 0.5 ? fs[q] + 1 : fs[q]) * ring, vAt(v)); ct.push(capT[rowOf[v]]);
    });
  }
  g0.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('capT', new THREE.Float32BufferAttribute(ct, 1));
  return g;
}
