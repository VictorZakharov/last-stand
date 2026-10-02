// Face harness: a full beard's shape, in the head's own millimetres (the face's frame), seen square from the front and the
// side: its meshes (a volume over the skin and its tufts, or cards) and the painted beard on the skin, z-buffered against
// each other and the body. Row by row below the chin: its width, the runs it splits into (a fork, tails beside the neck),
// how full it is between its edges, how it tapers against the jaw's width; from the side its back and front edges and how
// deep it is (a volume, or a sheet lying on what is under it); where the painted cheek line runs; and how much of it the
// body hides (buried in a cowl). Hung straight down from the jaw as cards, a beard stood out as a ruff, its sides as two
// tails and its middle inside the robe's cowl; draped over the cowl, a thin sheet of cards read as a liquid. Run in the
// page by facelab.mjs.
import * as THREE from 'three';
import { FACES, LOOKS, beardAt, headSDF } from '../../src/entities/models/face';
import { HEAD_MM } from '../../src/entities/models/head';

export interface BeardShape {
  /** the chin's underside (mm), the jaw's width (mm), the beard's visible bottom (mm) and its length below the chin */
  chin: number; jawW: number; bottom: number; len: number;
  /** below the chin: its widest against the jaw's width, the share of rows split in two or more, how full between its edges */
  flare: number; split: number; fill: number;
  /** its width at a quarter, half, three quarters and nine tenths of its length below the chin, against the jaw's */
  taper: number[];
  /** the share of the cards the body hides from the front */
  hidden: number;
  /** the painted cheek line's height (mm) at 20, 30, 40 and 50 mm from the middle, and at the face's outline */
  cheek: number[]; cheekOut: number;
  /** the side view's back and front edge (z, mm) every 20 mm down from 40, and how deep its own meshes are below the chin */
  side: string[]; depth: number;
  /** the masks (PNG data urls): skin, painted beard, cards, body; cards the body hides in red */
  front: string; sideView: string;
}

const X0 = -130, Y0 = -280, Z0 = -120, W = 260, H = 450, D = 340;

/** Measure the beard of `who`'s model (its root posed as it is, its meshes as shown) */
export function measureBeard(root: THREE.Object3D, who: keyof typeof FACES): BeardShape {
  const F = FACES[who], L = LOOKS[who];
  root.updateMatrixWorld(true);
  let face: THREE.Mesh | null = null;
  root.traverse((o) => { if (o.name === 'face') face = o as THREE.Mesh; });
  const head = face!.parent!, Hinv = head.matrixWorld.clone().invert();
  const shown = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const inHead = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q === head) return true; return false; };
  const beards = head.children.filter((o) => o.name === 'beard' && o.visible) as THREE.Mesh[];
  const mk = (n: number) => new Float32Array(n).fill(-1e9);
  const fBody = mk(W * H), fFace = mk(W * H), fCard = mk(W * H), sBody = mk(D * H), sFace = mk(D * H), sCard = mk(D * H);
  const fFlag = new Uint8Array(W * H), sFlag = new Uint8Array(D * H);
  // a triangle into a raster: u its horizontal axis (0 x, 2 z), its depth along w (larger nearer the viewer)
  const tri = (buf: Float32Array, flag: Uint8Array | null, fv: number, NW: number, U0: number, a: number[], b: number[], c: number[], u: number, w: number) => {
    const ax = a[u] - U0, ay = a[1] - Y0, bx = b[u] - U0, by = b[1] - Y0, cx = c[u] - U0, cy = c[1] - Y0;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(NW - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const d = l1 * a[w] + l2 * b[w] + l3 * c[w], k = y * NW + x;
      if (d > buf[k]) { buf[k] = d; if (flag) flag[k] = fv; }
    }
  };
  const v = new THREE.Vector3();
  const mm = (o: THREE.Mesh, i: number, out: number[]) => {
    o.getVertexPosition(i, v);
    v.applyMatrix4(o.matrixWorld).applyMatrix4(Hinv);
    out[0] = v.x / HEAD_MM; out[1] = v.y / HEAD_MM; out[2] = v.z / HEAD_MM + 5;
    return out;
  };
  const each = (o: THREE.Mesh, fn: (a: number[], b: number[], c: number[]) => void) => {
    const g = o.geometry, idx = g.index, n = idx ? idx.count : g.attributes.position.count, A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
    for (let t = 0; t + 2 < n; t += 3) fn(mm(o, idx ? idx.getX(t) : t, A), mm(o, idx ? idx.getX(t + 1) : t + 1, B), mm(o, idx ? idx.getX(t + 2) : t + 2, C));
  };
  // (the side seen from his left, +x)
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || inHead(o) || !shown(o)) return;
    each(o as THREE.Mesh, (a, b, c) => { tri(fBody, null, 0, W, X0, a, b, c, 0, 2); tri(sBody, null, 0, D, Z0, a, b, c, 2, 0); });
  });
  each(face!, (a, b, c) => {
    const x = (a[0] + b[0] + c[0]) / 3, y = (a[1] + b[1] + c[1]) / 3, z = (a[2] + b[2] + c[2]) / 3;
    const fl = y < 125 && z > -40 && L.beard * beardAt(Math.abs(x), y, z, F, 1.5 + 2.5 * (L.stubble ?? 0)) > 0.5 ? 1 : 2;
    tri(fFace, fFlag, fl, W, X0, a, b, c, 0, 2); tri(sFace, sFlag, fl, D, Z0, a, b, c, 2, 0);
  });
  for (const beard of beards) each(beard, (a, b, c) => { tri(fCard, null, 0, W, X0, a, b, c, 0, 2); tri(sCard, null, 0, D, Z0, a, b, c, 2, 0); });
  // what shows: 0 nothing, 1 skin, 2 painted beard, 3 cards, 4 body; and the cards the body hides
  const view = (NW: number, body: Float32Array, fz: Float32Array, fl: Uint8Array, card: Float32Array) => {
    const out = new Uint8Array(NW * H), hid = new Uint8Array(NW * H);
    for (let k = 0; k < NW * H; k++) {
      const best = Math.max(body[k], fz[k], card[k]);
      if (best < -1e8) continue;
      out[k] = best === card[k] ? 3 : best === fz[k] ? (fl[k] === 1 ? 2 : 1) : 4;
      if (card[k] > -1e8 && body[k] > card[k] + 2) hid[k] = 1;
    }
    return { out, hid };
  };
  const FV = view(W, fBody, fFace, fFlag, fCard), SV = view(D, sBody, sFace, sFlag, sCard);
  const isB = (c: number) => c === 2 || c === 3;
  const rows: { y: number; w: number; fill: number; runs: number }[] = [];
  for (let y = 0; y < H; y++) {
    // (a split is a gap of 6 mm or more: a ragged edge of tufts is a beard's)
    let lo = -1, hi = -1, n = 0, runs = 0, gap = 99;
    for (let x = 0; x < W; x++) {
      if (isB(FV.out[y * W + x])) { if (lo < 0) lo = x; hi = x; n++; if (gap >= 6) runs++; gap = 0; } else gap++;
    }
    if (lo >= 0) rows.push({ y: y + Y0, w: hi - lo + 1, fill: n / (hi - lo + 1), runs });
  }
  const skinW = (yy: number) => { const y = yy - Y0; let lo = -1, hi = -1; for (let x = 0; x < W; x++) { const c = FV.out[y * W + x]; if (c === 1 || c === 2) { if (lo < 0) lo = x; hi = x; } } return lo < 0 ? 0 : hi - lo + 1; };
  // the chin's underside, from the distance field
  let chin = 40;
  for (let y = 40; y > -60; y -= 0.25) { let inside = false; for (let z = 40; z < 140 && !inside; z += 1) inside = headSDF(0, y, z, F) < 0; if (!inside) { chin = y; break; } }
  // (the jaw's width from the distance field: a beard's volume over it hides the skin)
  let jawW = 0;
  for (let y = 15; y <= 45; y += 2) for (let z = 30; z < 120; z += 4) { let x = 100; while (x > 0 && headSDF(x, y, z, F) > 0) x -= 0.5; jawW = Math.max(jawW, 2 * x); }
  const bottom = rows.length ? Math.min(...rows.map((q) => q.y)) : chin, len = chin - bottom;
  const at = (y: number) => rows.find((q) => q.y === Math.round(y));
  const below = rows.filter((q) => q.y < chin - 3), body = below.filter((q) => q.y > chin - 0.7 * len);
  const cheekAt = (x: number) => { const c = Math.round(x) - X0; for (let y = 125 - Y0; y >= 0; y--) if (FV.out[y * W + c] === 2) return y + Y0; return NaN; };
  // (how deep its own meshes are below the chin, front to back: a volume, or a sheet lying on what is under it)
  let depth = 0;
  for (let y = Math.round(chin); y > chin - 60; y--) { const r = y - Y0; let lo = -1, hi = -1; for (let z = 0; z < D; z++) if (SV.out[r * D + z] === 3) { if (lo < 0) lo = z; hi = z; } if (lo >= 0) depth = Math.max(depth, hi - lo); }
  const sideAt = (y: number) => { const r = y - Y0; let lo = -1, hi = -1; for (let z = 0; z < D; z++) if (isB(SV.out[r * D + z])) { if (lo < 0) lo = z; hi = z; } return lo < 0 ? `${y}: -` : `${y}: ${lo + Z0}..${hi + Z0}`; };
  let cards = 0, hid = 0; for (let k = 0; k < W * H; k++) if (fCard[k] > -1e8) { cards++; if (FV.hid[k]) hid++; }
  const pic = (NW: number, V: { out: Uint8Array; hid: Uint8Array }) => {
    const cv = document.createElement('canvas'); cv.width = NW * 2; cv.height = H * 2;
    const g = cv.getContext('2d')!, col = ['#8a8f96', '#e6d2c0', '#7a4a2c', '#2a1a10', '#4a5a7a'];
    for (let y = 0; y < H; y++) for (let x = 0; x < NW; x++) { const k = y * NW + x; g.fillStyle = V.hid[k] && V.out[k] === 4 ? '#c03030' : col[V.out[k]]; g.fillRect(x * 2, (H - 1 - y) * 2, 2, 2); }
    g.fillStyle = '#ff0'; g.fillRect(0, (H - 1 - (chin - Y0)) * 2, NW * 2, 1);
    return cv.toDataURL('image/png');
  };
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    chin, jawW, bottom, len,
    flare: r2(Math.max(0, ...below.map((q) => q.w)) / jawW), split: r2(body.filter((q) => q.runs > 1).length / Math.max(1, body.length)),
    fill: r2(below.reduce((s, q) => s + q.fill, 0) / Math.max(1, below.length)),
    taper: [0.25, 0.5, 0.75, 0.9].map((f) => r2((at(chin - f * len)?.w ?? 0) / jawW)),
    hidden: Math.round((hid / Math.max(1, cards)) * 1000) / 1000,
    cheek: [20, 30, 40, 50].map(cheekAt), cheekOut: cheekAt(skinW(95) / 2 - 4),
    side: [40, 20, 0, -20, -40, -60, -80, -100, -120].map(sideAt), depth,
    front: pic(W, FV), sideView: pic(D, SV),
  };
}
