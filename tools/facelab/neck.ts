// Facelab: a hero's neck at rest against a man's. ANSUR II (4,082 men): the neck's girth just below the Adam's apple
// 397.6 mm, at its base 434.6, the head's 574.4; so along its length a neck keeps about 0.69 of the head's girth and flares
// to 0.76 only at its base, over the trapezius (the mage's narrowed upwards from the collar to 0.6 under the skull: a
// cone). Slices across the neck's own axis every 5 mm, rays from outside onto the skin (the head's, its ears' and the
// neck's; clothes only cover it): each slice's girth as a share of the head's, and how much of it the clothes cover. And
// the seam where the head's own skin takes over from the neck's: at each angle its height, the step between the two skins
// there, the turn between their normals and the change of colour between their base colours (CIE76). Run in the page by
// facelab.mjs.
import * as THREE from 'three';
import type { Model } from '../../src/types';
import { HEAD_MM } from '../../src/entities/models/head';

export interface NeckShape {
  /** the head's girth (mm): its widest slice of skin from the eyes up */
  head: number;
  /** per slice up the neck: its height above the collar at the back (mm), its girth (a share of the head's), the share of it
   *  the clothes cover */
  rows: { y: number; girth: number; covered: number }[];
  /** girth shares: just above the collar, the narrowest and its height, just under the jaw; the change per 10 mm over the free
   *  neck between them (a cone narrowing upwards is negative) */
  base: number; min: number; minAt: number; top: number; taper: number;
  /** where the head's skin takes over from the neck's: heights (mm, 10th 50th 90th percentiles round the neck), the step there
   *  over the slices' usual change (mm), the turn between the two skins' normals (degrees) and their colours' difference */
  seam: { y: number[]; step: number; turn: number; dE: number; face: number[]; neck: number[]; sectors: string; relief: number; rough: number; multi: number };
  /** the share of the rays within 40 mm of the collar's top where skin comes out through the clothes (met before them, their
   *  surface within 25 mm under it) */
  through: number; throughBy: number[];
  /** the collar's top at the back against a man's C7 vertebra (mm, 239 below the top of his head; above it, positive) */
  c7: number;
}

const NA = 72;

/** `head`: the head's girth if already measured (a live model measured again and again) */
export function measureNeck(m: Model, head0?: number): NeckShape | null {
  m.root.updateMatrixWorld(true);
  const j = m.joints!, neck = j.neck, V = THREE.Vector3;
  let face: THREE.Mesh | null = null;
  m.root.traverse((o) => { if (o.name === 'face') face = o as THREE.Mesh; });
  if (!face) return null;
  const headG = (face as THREE.Mesh).parent!;
  const vis = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const under = (o: THREE.Object3D, r: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q === r) return true; return false; };
  // the skins: the face, the ears (skin-coloured meshes of the head without a map), the neck (on its joint, outside the head)
  const kind = new Map<THREE.Object3D, 'face' | 'ear' | 'neck' | 'cloth'>(), targets: THREE.Mesh[] = [];
  m.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || !vis(o) || o.name === 'hair' || o.name === 'beard' || (m.tip && under(o, m.tip.parent!)) || o.name === 'flask') return;
    if (o === face) kind.set(o, 'face');
    else if (under(o, headG)) { const mt = me.material as THREE.MeshStandardMaterial; if (!mt.map && mt.color && mt.color.r > mt.color.b * 1.2 && me.geometry.attributes.color) kind.set(o, 'ear'); else return; }
    else if (o.parent === neck) kind.set(o, 'neck');
    else if (under(o, j.chest) && !under(o, j.shoulderL) && !under(o, j.shoulderR)) kind.set(o, 'cloth');
    else return;
    targets.push(me);
  });
  // (all in the neck joint's own space, the model's metres: the head's mm are HEAD_MM of them)
  const mm = (d: number) => d / HEAD_MM, W = neck.matrixWorld, rc = new THREE.Raycaster();
  const o = new V(), dir = new V(), nrm = new V(), loc = new V(), inv = W.clone().invert();
  type Hit = { k: string; r: number; n: THREE.Vector3; hit: THREE.Intersection };
  // the outermost skin (and whether clothes cover it) on each ray of a slice at height h (the neck's own metres)
  const slice = (h: number) => {
    const out: (Hit | null)[] = [], cov: boolean[] = [], thru: boolean[] = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      o.set(Math.sin(a) * 0.3, h, Math.cos(a) * 0.3).applyMatrix4(W); dir.set(-Math.sin(a), 0, -Math.cos(a)).transformDirection(W);
      rc.set(o, dir); rc.far = 0.7;
      const hits = rc.intersectObjects(targets, false);
      const skinHit = hits.find((x) => kind.get(x.object) !== 'cloth');
      cov.push(!!hits[0] && kind.get(hits[0].object) === 'cloth' && (!skinHit || hits[0].distance < skinHit.distance));
      // (skin come out through the clothes: met before them, their surface just under it)
      const clothAfter = skinHit && hits.find((x) => kind.get(x.object) === 'cloth' && x.distance > skinHit.distance);
      thru.push(!!clothAfter && clothAfter.distance - skinHit!.distance < 25 * HEAD_MM * neck.getWorldScale(new V()).x);
      if (!skinHit) { out.push(null); continue; }
      loc.copy(skinHit.point).applyMatrix4(inv);
      // (the shading's normal: the vertices' normals across the triangle; a skinned mesh's from its posed triangle, its normals
      // being the bind pose's)
      const me = skinHit.object as THREE.Mesh, N = me.geometry.attributes.normal, f = skinHit.face!, b = skinHit.barycoord;
      if ((me as THREE.SkinnedMesh).isSkinnedMesh && N && b) {
        // (each corner's normal carried by its bones as the shader does: a point a little along it, skinned, from the corner skinned)
        const sk = me as THREE.SkinnedMesh, P = me.geometry.attributes.position, sn = (i: number) => {
          const p0 = new V().fromBufferAttribute(P, i), p1 = p0.clone().addScaledVector(new V().fromBufferAttribute(N, i), 1e-3);
          return sk.applyBoneTransform(i, p1).sub(sk.applyBoneTransform(i, p0)).normalize();
        };
        nrm.set(0, 0, 0).addScaledVector(sn(f.a), b.x).addScaledVector(sn(f.b), b.y).addScaledVector(sn(f.c), b.z);
      } else if (N && b) nrm.set(0, 0, 0).addScaledVector(new V().fromBufferAttribute(N, f.a), b.x).addScaledVector(new V().fromBufferAttribute(N, f.b), b.y).addScaledVector(new V().fromBufferAttribute(N, f.c), b.z);
      else nrm.copy(f.normal);
      nrm.transformDirection(me.matrixWorld);
      out.push({ k: kind.get(skinHit.object)!, r: Math.hypot(loc.x, loc.z), n: nrm.clone(), hit: skinHit });
    }
    return { out, cov, thru };
  };
  const girthOf = (out: (Hit | null)[], only?: (k: string) => boolean) => {
    const pts = out.map((x, i) => (x && (!only || only(x.k)) ? [Math.sin((i / NA) * Math.PI * 2) * x.r, Math.cos((i / NA) * Math.PI * 2) * x.r] : null));
    if (pts.some((p) => !p)) return NaN;
    let g = 0; for (let i = 0; i < NA; i++) { const a = pts[i]!, b = pts[(i + 1) % NA]!; g += Math.hypot(a[0] - b[0], a[1] - b[1]); }
    return mm(g);
  };
  // the head's girth: the widest slice of the face's own skin (no ears) from the eyes up
  const headJ = j.head.getWorldPosition(new V()).applyMatrix4(inv).y;
  let head = head0 ?? 0;
  if (!head0) for (let h = headJ + 0.08; h < headJ + 0.22; h += 0.004) head = Math.max(head, girthOf(slice(h).out, (k) => k === 'face') || 0);
  // the top of the head (the face's own skin), for the C7 vertebra: 239 mm below it in a man (ANSUR II: stature less
  // cervicale height)
  let top = -1e9; { const P = (face as THREE.Mesh).geometry.attributes.position, q = new V(); for (let i = 0; i < P.count; i++) top = Math.max(top, q.fromBufferAttribute(P, i).applyMatrix4((face as THREE.Mesh).matrixWorld).applyMatrix4(inv).y); }
  // up the neck from below the collar to above the jaw
  const rows: { h: number; out: (Hit | null)[]; cov: boolean[]; thru: boolean[]; g: number }[] = [];
  for (let h = -0.06; h < headJ + 0.06; h += 5 * HEAD_MM) { const { out, cov, thru } = slice(h); rows.push({ h, out, cov, thru, g: girthOf(out) }); }
  // the collar's top at the back (the lowest height every ray behind the neck is free of clothes)
  const backFree = (r: typeof rows[number]) => r.cov.every((c, i) => !c || Math.cos((i / NA) * Math.PI * 2) > -0.5);
  const iC = rows.findIndex((r, i) => backFree(r) && rows.slice(i).every(backFree));
  const y0 = rows[Math.max(0, iC)].h, Y = (h: number) => Math.round(mm(h - y0));
  // the free neck: from the first slice the clothes cover nowhere to the last before the jaw comes in (the girth jumping)
  const iB = rows.findIndex((r, i) => i >= iC && r.cov.every((c) => !c) && Number.isFinite(r.g));
  if (iB < 0) return null;
  let iMin = iB; for (let i = iB; i < rows.length && rows[i].h < headJ; i++) if (rows[i].g < rows[iMin].g) iMin = i;
  // (the jaw coming in: the girth rising 5% over the narrowest)
  let iT = iMin; while (iT + 1 < rows.length && rows[iT + 1].g < rows[iMin].g * 1.05) iT++;
  const sh = (g: number) => Math.round(g / head * 1000) / 1000;
  // (the slope over the free neck above the base's flare: least squares, per 10 mm)
  const fit = rows.slice(Math.min(iT, iB + 3), Math.max(iB + 4, iT - 1)).filter((r) => Number.isFinite(r.g));
  const mx = fit.reduce((a, r) => a + mm(r.h), 0) / fit.length, my = fit.reduce((a, r) => a + r.g, 0) / fit.length;
  const slope = fit.reduce((a, r) => a + (mm(r.h) - mx) * (r.g - my), 0) / Math.max(1e-9, fit.reduce((a, r) => a + (mm(r.h) - mx) ** 2, 0));
  // the seam: at each angle the first slice up whose outermost skin is the face's, the step and turn there, the colours
  const seamY: number[] = [], steps: number[] = [], usual: number[] = [], turns: number[] = [], dEs: number[] = [], labF: RGB[] = [], labN: RGB[] = [];
  const albedo = faceAlbedo(face), sect: number[][][] = [[], [], [], [], [], [], [], []], maps = faceMaps(face), reliefs: number[] = [], roughs: number[] = [];
  // (and how often going up the neck the skins change more than once: one showing through the other)
  let multi = 0;
  for (let i = 0; i < NA; i++) {
    let changes = 0;
    for (let k = Math.max(1, iB) + 1; k < rows.length && rows[k].h < headJ; k++) { const a = rows[k - 1].out[i], b = rows[k].out[i]; if (a && b && (a.k === 'neck') !== (b.k === 'neck') && (a.k === 'face' || b.k === 'face')) changes++; }
    if (changes > 1) multi++;
    for (let k = Math.max(1, iB); k < rows.length; k++) {
      const a = rows[k - 1].out[i], b = rows[k].out[i]; if (!a || !b) continue;
      if (a.k === 'neck' && b.k === 'face') {
        seamY.push(Y(rows[k].h)); steps.push(mm(Math.abs(b.r - a.r))); turns.push(THREE.MathUtils.radToDeg(a.n.angleTo(b.n)));
        // (the face's relief and sheen over the 15 mm above it against the neck's: its normal map's tilt as drawn, its roughness)
        for (let q = k; q < rows.length && mm(rows[q].h - rows[k].h) <= 15; q++) { const c = rows[q].out[i]; if (c && c.k === 'face') { const t = maps(c.hit); if (t) { reliefs.push(t[0]); roughs.push(t[1] - ((a.hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial).roughness); } } }
        const cf = albedo(b.hit), cn = baseColour(a.hit); if (cf && cn) { dEs.push(deltaE(cf, cn)); labF.push(lab(cf)); labN.push(lab(cn)); sect[Math.round(i / NA * 8) % 8].push([Y(rows[k].h), mm(b.r - a.r), deltaE(cf, cn), lab(cf)[0], lab(cn)[0], THREE.MathUtils.radToDeg(a.n.angleTo(b.n))]); }
        break;
      }
      if (a.k === b.k) usual.push(mm(Math.abs(b.r - a.r)));
    }
  }
  const pct = (v: number[], f: number) => { if (!v.length) return NaN; const q = v.slice().sort((x, y) => x - y); return q[Math.floor(f * (q.length - 1))]; };
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    head: Math.round(head),
    rows: rows.slice(Math.max(0, iC - 4), iT + 4).map((r) => ({ y: Y(r.h), girth: sh(r.g), covered: Math.round(r.cov.filter(Boolean).length / NA * 100) / 100 })),
    base: sh(rows[iB].g), min: sh(rows[iMin].g), minAt: Y(rows[iMin].h), top: sh(rows[iT].g), taper: Math.round(slope * 10 / head * 10000) / 10000,
    seam: { y: [0.1, 0.5, 0.9].map((f) => pct(seamY, f)), step: r1(pct(steps, 0.5) - pct(usual, 0.5)), turn: r1(pct(turns, 0.5)), dE: r1(pct(dEs, 0.5)),
      face: [0, 1, 2].map((c) => r1(pct(labF.map((x) => x[c]), 0.5))), neck: [0, 1, 2].map((c) => r1(pct(labN.map((x) => x[c]), 0.5))),
      // (round the neck from the front, his left first: height, step, colour difference, the two lightnesses, turn)
      relief: r1(pct(reliefs, 0.5)), rough: Math.round(pct(roughs, 0.5) * 100) / 100, multi: Math.round(multi / NA * 100) / 100,
      sectors: sect.map((v, i) => `${['front', 'f-left', 'left', 'b-left', 'back', 'b-right', 'right', 'f-right'][i]} ${v.length ? [0, 1, 2, 3, 4, 5].map((c) => Math.round(pct(v.map((x) => x[c]), 0.5))).join('/') : '-'}`).join('  ') },
    c7: Math.round(mm(y0 - top) + 239),
    throughBy: (() => { const band = rows.filter((r) => Math.abs(r.h - y0) < 40 * HEAD_MM), c = [0, 0, 0, 0, 0, 0, 0, 0]; for (const r of band) r.thru.forEach((t, i) => { if (t) c[Math.round(i / NA * 8) % 8]++; }); return c; })(),
    through: (() => { const band = rows.filter((r) => Math.abs(r.h - y0) < 40 * HEAD_MM); return Math.round(band.reduce((a, r) => a + r.thru.filter(Boolean).length, 0) / Math.max(1, band.length * NA) * 1000) / 1000; })(),
  };
}

// --- colour: the face's paint at a hit (its albedo canvas), the neck's (its colour times its vertex colour), CIE Lab -----

type RGB = [number, number, number];
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function faceAlbedo(face: THREE.Mesh): (h: THREE.Intersection) => RGB | null {
  const map = (face.material as THREE.MeshStandardMaterial).map, cv = map?.image as HTMLCanvasElement | undefined;
  if (!cv || !cv.getContext) return () => null;
  const W = cv.width, H = cv.height, px = cv.getContext('2d')!.getImageData(0, 0, W, H).data;
  return (h) => {
    if (!h.uv) return null;
    const u = ((h.uv.x % 1) + 1) % 1, v = map!.flipY ? 1 - h.uv.y : h.uv.y, x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), k = (y * W + x) * 4;
    return [lin(px[k] / 255), lin(px[k + 1] / 255), lin(px[k + 2] / 255)];
  };
}
/** the face's normal map's tilt at a hit as the material draws it (degrees) and its roughness there */
function faceMaps(face: THREE.Mesh): (h: THREE.Intersection) => [number, number] | null {
  const mt = face.material as THREE.MeshStandardMaterial, read = (t: THREE.Texture | null) => {
    const cv = t?.image as HTMLCanvasElement | undefined; if (!cv || !cv.getContext) return null;
    return { W: cv.width, H: cv.height, px: cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data, flip: t!.flipY };
  };
  const N = read(mt.normalMap), R = read(mt.roughnessMap), sc = mt.normalScale?.x ?? 1;
  if (!N || !R || !mt.normalMap) return () => null;
  const at = (m: NonNullable<ReturnType<typeof read>>, h: THREE.Intersection) => { const u = ((h.uv!.x % 1) + 1) % 1, v = m.flip ? 1 - h.uv!.y : h.uv!.y; return (Math.min(m.H - 1, Math.max(0, Math.floor(v * m.H))) * m.W + Math.min(m.W - 1, Math.floor(u * m.W))) * 4; };
  return (h) => {
    if (!h.uv) return null;
    const k = at(N, h), x = (N.px[k] / 255 * 2 - 1) * sc, y = (N.px[k + 1] / 255 * 2 - 1) * sc, z = N.px[k + 2] / 255 * 2 - 1;
    return [THREE.MathUtils.radToDeg(Math.atan2(Math.hypot(x, y), z)), R.px[at(R, h) + 1] / 255 * mt.roughness];
  };
}
function baseColour(h: THREE.Intersection): RGB | null {
  const me = h.object as THREE.Mesh, mt = me.material as THREE.MeshStandardMaterial, c = mt.color, col = me.geometry.attributes.color;
  let k: RGB = [1, 1, 1];
  if (col && h.face) {
    const b = h.barycoord ?? new THREE.Vector3(1 / 3, 1 / 3, 1 / 3), f = h.face;
    k = [0, 1, 2].map((ch) => col.getComponent(f.a, ch) * b.x + col.getComponent(f.b, ch) * b.y + col.getComponent(f.c, ch) * b.z) as RGB;
  }
  return [c.r * k[0], c.g * k[1], c.b * k[2]];
}
function lab([r, g, b]: RGB): RGB {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a: RGB, b: RGB) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
