// The look of rubble pieces (`rubble.ts` throws them around): procedural geometry and painted textures. Every
// builder is deterministic (seeded), and a piece is about 1 in half-extent so its instance scale sizes it.
import * as THREE from 'three';
import { mulberry } from '../util';
import { ctx2d, textureFromCanvas } from '../core/textures';

const fract = (x: number) => x - Math.floor(x);
const smooth = (a: number[]) => a.map((_, i) => (a[(i + a.length - 1) % a.length] + 2 * a[i] + a[(i + 1) % a.length]) / 4);
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// --- stone ---------------------------------------------------------------------------------------------

/** An irregular broken stone: a subdivided ball whose points are pushed in and out (as a function of position, so it
 * stays whole) and cut by a few planes, which leave the flat faces a fracture does. Points the cuts moved are fresh
 * stone (light); the rest is the weathered outside (darker, greener), as a vertex colour. Flat shaded. */
export function stoneGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry(seed), g = new THREE.IcosahedronGeometry(1, 1);
  const cuts = Array.from({ length: 4 }, () => ({ n: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(), d: 0.45 + rng() * 0.3 }));
  const a = rng() * 50, pos = g.getAttribute('position'), v = new THREE.Vector3(), col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = fract(Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + a) * 43758.5453);
    v.multiplyScalar(0.72 + 0.4 * h);
    let fresh = 0;
    for (const c of cuts) { const over = v.dot(c.n) - c.d; if (over > 0) { v.addScaledVector(c.n, -over); fresh = 1; } }
    pos.setXYZ(i, v.x, v.y, v.z);
    const k = fresh ? 1 : 0.62 + 0.12 * h;
    col.push(k, k, fresh ? k : k * 0.97);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Fine grain for a stone's bump map: speckle, pits and hairline cracks */
export function rockBump(): THREE.CanvasTexture {
  const S = 128, rng = mulberry(9), c = canvas(S, S), g = ctx2d(c);
  g.fillStyle = '#909090'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { const v = Math.floor(rng() * 255); g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2); }
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(30,30,30,0.5)'; g.beginPath(); g.arc(rng() * S, rng() * S, 1 + rng() * 3, 0, 6.3); g.fill(); }
  g.strokeStyle = 'rgba(20,20,20,0.6)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) { let x = rng() * S, y = rng() * S, a = rng() * 6.3; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { a += (rng() - 0.5) * 1.4; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
  return textureFromCanvas(c, false);
}

/** A hot coal: a dark crust with glowing cracks and a few bright patches, for the emissive map */
export function coalTexture(): THREE.CanvasTexture {
  const S = 128, rng = mulberry(57), c = canvas(S, S), g = ctx2d(c);
  g.fillStyle = '#1a0a04'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const r = 14 + rng() * 26, x = rng() * S, y = rng() * S, grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,140,40,0.75)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    let x = rng() * S, y = rng() * S, a = rng() * 6.3;
    g.strokeStyle = `rgba(255,${150 + Math.floor(rng() * 90)},60,${0.7 + rng() * 0.3})`; g.lineWidth = 1 + rng() * 2.2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { a += (rng() - 0.5) * 1.6; x += Math.cos(a) * (6 + rng() * 10); y += Math.sin(a) * (6 + rng() * 10); g.lineTo(x, y); }
    g.stroke();
  }
  return textureFromCanvas(c);
}

// --- wood ----------------------------------------------------------------------------------------------

const wavy = (ctx: CanvasRenderingContext2D, H: number, x0: number, amp: number, ph: number, col: string, lw: number) => {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
  for (let y = 0; y <= H; y += 8) { const x = x0 + Math.sin(y * 0.03 + ph) * amp + Math.sin(y * 0.11 + ph * 2) * amp * 0.25; if (y) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
};

/** Grain and bark, painted: the left half is fresh wood (pale, with growth rings, grain and fibres), the right half
 * bark (dark furrows). One canvas for colour, one as a bump map. */
export function woodAtlas(): { albedo: HTMLCanvasElement; height: HTMLCanvasElement } {
  const W = 256, H = 256, rng = mulberry(31), albedo = canvas(W, H), height = canvas(W, H), a = ctx2d(albedo), h = ctx2d(height);
  a.fillStyle = '#dcc08a'; a.fillRect(0, 0, W / 2, H);
  a.fillStyle = '#3f2e1c'; a.fillRect(W / 2, 0, W / 2, H);
  h.fillStyle = '#b0b0b0'; h.fillRect(0, 0, W, H);
  // fresh wood: growth rings as long dark bands, fine grain between, pale fibre streaks
  for (let i = 0; i < 9; i++) { const x = 6 + i * 13.5 + rng() * 5; wavy(a, H, x, 4 + rng() * 5, rng() * 6, `rgba(150,105,55,${0.22 + rng() * 0.2})`, 2 + rng() * 3); wavy(h, H, x, 4, rng() * 6, 'rgba(60,60,60,0.5)', 2); }
  for (let i = 0; i < 70; i++) {
    const x = (rng() * W) / 2, dark = rng() < 0.5;
    wavy(a, H, x, 1.5 + rng() * 3, rng() * 6, dark ? `rgba(120,80,40,${0.1 + rng() * 0.18})` : `rgba(245,225,180,${0.15 + rng() * 0.2})`, 0.6 + rng());
    wavy(h, H, x, 2, rng() * 6, dark ? 'rgba(40,40,40,0.25)' : 'rgba(230,230,230,0.25)', 0.8);
  }
  for (let i = 0; i < 260; i++) { const x = (rng() * W) / 2, y = rng() * H, l = 4 + rng() * 14; a.fillStyle = `rgba(90,60,30,${0.08 + rng() * 0.12})`; a.fillRect(x, y, 0.8, l); h.fillStyle = 'rgba(40,40,40,0.3)'; h.fillRect(x, y, 0.8, l); }
  // bark: deep furrows between ridges
  for (let i = 0; i < 16; i++) {
    const x = W / 2 + 4 + i * 7.6 + rng() * 3;
    wavy(a, H, x, 3 + rng() * 5, rng() * 6, `rgba(14,9,5,${0.55 + rng() * 0.3})`, 2 + rng() * 3); wavy(h, H, x, 3, rng() * 6, 'rgba(0,0,0,0.85)', 3);
    wavy(a, H, x + 4, 3, rng() * 6, 'rgba(110,84,56,0.35)', 2); wavy(h, H, x + 4, 3, rng() * 6, 'rgba(255,255,255,0.5)', 2);
  }
  for (let i = 0; i < 200; i++) { const x = W / 2 + (rng() * W) / 2, y = rng() * H; a.fillStyle = `rgba(${rng() < 0.5 ? '20,14,8' : '120,96,66'},0.25)`; a.fillRect(x, y, 1 + rng() * 2, 2 + rng() * 6); }
  return { albedo, height };
}

/** A tapered, jagged-edged lens of wood with the grain along z: a sliver, a flake or a strip of bark. Half-width,
 * half-length and half-thickness about 1, bent a little. A splinter and a flake show wood on top and bark below (a
 * strip: bark on both). */
export function flakeGeometry(kind: 'splinter' | 'chip' | 'bark', seed: number): THREE.BufferGeometry {
  const rng = mulberry(seed), NU = 7, NV = 14, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const split = kind === 'splinter';
  // per row: how far each edge is dragged in or out (jagged), and a sideways drift (a curved sliver)
  const jl: number[] = [], jr: number[] = [], drift: number[] = [];
  for (let j = 0; j < NV; j++) { jl.push(1 + (rng() - 0.5) * (split ? 0.5 : 0.35)); jr.push(1 + (rng() - 0.5) * (split ? 0.5 : 0.35)); drift.push((rng() - 0.5) * 0.12); }
  const u0 = rng() * 0.12, v0 = rng() * 0.4, lean = (rng() - 0.5) * 0.5;
  for (const face of [1, -1]) {
    const base = pos.length / 3, bark = kind === 'bark' || face < 0;
    for (let j = 0; j < NV; j++) {
      const v = -1 + (2 * j) / (NV - 1), av = Math.abs(v);
      // pointed ends: a sliver runs to a point, a flake is rounder; one end blunter than the other
      const taper = split ? Math.pow(Math.max(0, 1 - Math.pow(av, 1.3)), 0.9) : Math.pow(Math.max(0, 1 - Math.pow(av, 2.2)), 0.55);
      const along = Math.min(1, Math.max(0.35, (v * 0.5 + 0.5) * (1 + lean) + 0.5 - lean * 0.5));
      for (let i = 0; i < NU; i++) {
        const u = -1 + (2 * i) / (NU - 1);
        const w = taper * (u < 0 ? jl[j] : jr[j]) * (0.55 + 0.45 * along);
        const t = Math.sqrt(Math.max(0, 1 - u * u)) * Math.pow(Math.max(0, 1 - v * v), 0.35);
        // bowed across the width (a flake curls) and along its length (a sliver springs)
        const bend = (split ? 0.5 * v * v : 0.9 * u * u) - 0.25;
        pos.push(u * w + drift[j] * 3 * (1 - av), bend + face * t, v);
        uv.push((bark ? 0.5 : 0) + 0.03 + u0 + ((u + 1) / 2) * 0.4, v0 + ((v + 1) / 2) * 0.55);
      }
    }
    for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) {
      const a = base + j * NU + i, b = a + 1, c = a + NU, d = c + 1;
      // the top faces up, the underside down
      if (face > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  return build(pos, uv, idx);
}

function build(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- mushroom ------------------------------------------------------------------------------------------

/** The atlas columns of `mushroomAtlas` (each a quarter of the width): a stem's skin, flesh, a cap's skin, gills */
const COL = { skin: 0, flesh: 1, cap: 2, gills: 3 };

/** A glowcap, painted: stem skin (cream, fibrous, with faint rings and bruises), flesh (spongy white), the cap's skin
 * (teal, mottled, with pale warts) and gills (radial). Colour, bump and glow: the glow is bright through the cap's
 * skin, faint through the gills, and barely there on the stem. */
export function mushroomAtlas(): { albedo: HTMLCanvasElement; height: HTMLCanvasElement; glow: HTMLCanvasElement } {
  const S = 128, W = S * 4, rng = mulberry(77), albedo = canvas(W, S), height = canvas(W, S), glow = canvas(W, S), a = ctx2d(albedo), h = ctx2d(height), e = ctx2d(glow);
  const fill = (ctx: CanvasRenderingContext2D, col: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(col * S, 0, S, S); };
  fill(a, COL.skin, '#b9ab8a'); fill(a, COL.flesh, '#b9b198'); fill(a, COL.cap, '#2c9c7c'); fill(a, COL.gills, '#7f9a8a');
  h.fillStyle = '#909090'; h.fillRect(0, 0, W, S);
  fill(e, COL.skin, '#040505'); fill(e, COL.flesh, '#0a0e0c'); fill(e, COL.cap, '#22a888'); fill(e, COL.gills, '#286650');
  const x0 = (c: number) => c * S;
  // stem skin: fibres running up the column, faint ring bands, a few bruises
  for (let i = 0; i < 90; i++) {
    const x = x0(COL.skin) + rng() * S, dark = rng() < 0.55;
    a.strokeStyle = dark ? `rgba(150,128,96,${0.12 + rng() * 0.2})` : `rgba(255,250,235,${0.2 + rng() * 0.25})`; a.lineWidth = 0.6 + rng() * 1.4;
    a.beginPath(); a.moveTo(x, 0); a.bezierCurveTo(x + (rng() - 0.5) * 8, S * 0.3, x + (rng() - 0.5) * 8, S * 0.7, x + (rng() - 0.5) * 6, S); a.stroke();
    h.strokeStyle = dark ? 'rgba(50,50,50,0.3)' : 'rgba(230,230,230,0.25)'; h.lineWidth = 1; h.beginPath(); h.moveTo(x, 0); h.lineTo(x + (rng() - 0.5) * 6, S); h.stroke();
  }
  for (let i = 0; i < 3; i++) { const y = 20 + rng() * 90; a.fillStyle = 'rgba(140,115,80,0.16)'; a.fillRect(x0(COL.skin), y, S, 2 + rng() * 4); }
  for (let i = 0; i < 4; i++) { const g = a.createRadialGradient(x0(COL.skin) + rng() * S, rng() * S, 0, x0(COL.skin) + rng() * S, rng() * S, 14); g.addColorStop(0, 'rgba(120,90,60,0.28)'); g.addColorStop(1, 'rgba(120,90,60,0)'); a.fillStyle = g; a.fillRect(x0(COL.skin), 0, S, S); }
  // flesh: spongy speckle
  for (let i = 0; i < 700; i++) {
    const x = x0(COL.flesh) + rng() * S, y = rng() * S, r = 0.6 + rng() * 1.8, dark = rng() < 0.5;
    a.fillStyle = dark ? 'rgba(190,175,140,0.35)' : 'rgba(255,255,250,0.5)'; a.beginPath(); a.arc(x, y, r, 0, 6.3); a.fill();
    h.fillStyle = dark ? 'rgba(40,40,40,0.4)' : 'rgba(230,230,230,0.35)'; h.beginPath(); h.arc(x, y, r, 0, 6.3); h.fill();
  }
  // cap skin: lighter and darker mottling, then pale warts that stand proud (and glow a little brighter)
  for (let i = 0; i < 26; i++) {
    const x = x0(COL.cap) + rng() * S, y = rng() * S, r = 8 + rng() * 22, light = rng() < 0.55, g = a.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, light ? 'rgba(120,225,190,0.45)' : 'rgba(10,80,66,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    a.fillStyle = g; a.fillRect(x0(COL.cap), 0, S, S);
  }
  for (let i = 0; i < 34; i++) {
    const x = x0(COL.cap) + rng() * S, y = rng() * S, r = 1.5 + rng() * 4.5;
    a.fillStyle = 'rgba(232,245,236,0.8)'; a.beginPath(); a.arc(x, y, r, 0, 6.3); a.fill();
    h.fillStyle = 'rgba(255,255,255,0.7)'; h.beginPath(); h.arc(x, y, r, 0, 6.3); h.fill();
    e.fillStyle = 'rgba(150,255,225,0.6)'; e.beginPath(); e.arc(x, y, r * 1.2, 0, 6.3); e.fill();
  }
  for (let i = 0; i < 18; i++) {
    const x = x0(COL.cap) + rng() * S, y = rng() * S, g = e.createRadialGradient(x, y, 0, x, y, 10 + rng() * 14);
    g.addColorStop(0, 'rgba(120,255,215,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); e.fillStyle = g; e.fillRect(x0(COL.cap), 0, S, S);
  }
  // gills: fine radial plates from the middle of the column
  const cx = x0(COL.gills) + S / 2, cy = S / 2;
  for (let i = 0; i < 90; i++) {
    const an = (i / 90) * 6.283 + rng() * 0.03, dark = i % 2 === 0;
    for (const [ctx, col] of [[a, dark ? 'rgba(150,175,155,0.7)' : 'rgba(250,255,250,0.55)'], [h, dark ? 'rgba(40,40,40,0.6)' : 'rgba(225,225,225,0.4)'], [e, dark ? 'rgba(30,70,58,0.7)' : 'rgba(90,170,145,0.5)']] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 6, cy + Math.sin(an) * 6); ctx.lineTo(cx + Math.cos(an) * S * 0.5, cy + Math.sin(an) * S * 0.5); ctx.stroke();
    }
  }
  return { albedo, height, glow };
}

/** Where a tube's side and ends sample the atlas: [left edge, width] in u */
interface Cols { side: [number, number]; cap: [number, number] }
export const STEM_COLS: Cols = { side: [0.02, 0.21], cap: [0.27, 0.21] };
export const STUB_COLS: Cols = { side: [0.53, 0.4], cap: [0.03, 0.4] };

/** A torn piece of a stem or trunk: a tube whose two ends are ragged and dished, the inside showing as flesh or fresh
 * wood. The axis is y. */
export function tornTubeGeometry(seed: number, { side, cap }: Cols): THREE.BufferGeometry {
  const rng = mulberry(seed), N = 12, M = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const ragged = () => smooth(smooth(Array.from({ length: N }, () => rng() * 0.6)));
  const jt = ragged(), jb = ragged(), rj = smooth(Array.from({ length: N }, () => 1 + (rng() - 0.5) * 0.24)), phase = rng() * 6;
  const yt = (j: number) => 1 - jt[j % N], yb = (j: number) => -1 + jb[j % N];
  const ang = (j: number) => (j / N) * Math.PI * 2;
  const at = (j: number, y: number, r: number) => pos.push(Math.cos(ang(j)) * r, y, Math.sin(ang(j)) * r);
  // the side: N + 1 columns (the seam is doubled for the uvs), rings from the bottom tear to the top tear
  for (let m = 0; m <= M; m++) for (let j = 0; j <= N; j++) {
    const f = m / M, r = (1 + 0.08 * Math.sin(f * 3 + phase)) * rj[j % N];
    at(j, yb(j) + (yt(j) - yb(j)) * f, r);
    uv.push(side[0] + (j / N) * side[1], f * 0.9);
  }
  for (let m = 0; m < M; m++) for (let j = 0; j < N; j++) { const a = m * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  // each end: the ragged rim, an inner ring dished in, and the middle lower still
  for (const top of [true, false]) {
    const base = pos.length / 3, y = (j: number) => (top ? yt(j) : yb(j)), sgn = top ? -1 : 1;
    for (let j = 0; j < N; j++) { at(j, y(j), rj[j]); uv.push(cap[0] + cap[1] / 2 + Math.cos(ang(j)) * cap[1] * 0.46, 0.5 + Math.sin(ang(j)) * 0.46); }
    for (let j = 0; j < N; j++) { at(j, y(j) + sgn * (0.1 + rng() * 0.25), 0.55 * rj[j]); uv.push(cap[0] + cap[1] / 2 + Math.cos(ang(j)) * cap[1] * 0.25, 0.5 + Math.sin(ang(j)) * 0.25); }
    pos.push(0, (top ? 1 : -1) + sgn * 0.45, 0); uv.push(cap[0] + cap[1] / 2, 0.5);
    for (let j = 0; j < N; j++) {
      const o = base + j, o2 = base + ((j + 1) % N), q = base + N + j, q2 = base + N + ((j + 1) % N), c = base + 2 * N;
      if (top) idx.push(o, q, o2, o2, q, q2, q, c, q2); else idx.push(o, o2, q, o2, q2, q, q, q2, c);
    }
  }
  const g = build(pos, uv, idx), n = g.getAttribute('normal');
  // one normal across the doubled seam, or a line shows down the tube
  for (let m = 0; m <= M; m++) {
    const i0 = m * (N + 1), i1 = i0 + N, x = n.getX(i0) + n.getX(i1), y = n.getY(i0) + n.getY(i1), z = n.getZ(i0) + n.getZ(i1), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i0, x / l, y / l, z / l); n.setXYZ(i1, x / l, y / l, z / l);
  }
  return g;
}

/** A fragment of a cap: a jagged-edged piece of a dome, the teal skin outside and the gills underneath, with the
 * cut edge showing flesh. The dome faces up (+y). */
export function shellGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry(seed), NA = 16, NR = 5, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const R = smooth(smooth(Array.from({ length: NA }, () => 0.6 + rng() * 0.4)));
  const K = NA + 1;
  const outerY = (s: number) => Math.sqrt(Math.max(0.05, 1 - 0.8 * s * s)) - 0.6, thick = (rho: number) => 0.2 * (1 - 0.6 * rho) + 0.03;
  const ring = (i: number, k: number) => { const rho = i / NR, an = ((k % NA) / NA) * Math.PI * 2, s = rho * R[k % NA]; return { x: Math.cos(an) * s, z: Math.sin(an) * s, rho, an, s }; };
  const disc = (col: number, p: { rho: number; an: number }) => uv.push(col * 0.25 + 0.125 + Math.cos(p.an) * p.rho * 0.115, 0.5 + Math.sin(p.an) * p.rho * 0.46);
  for (const face of [1, -1]) {
    for (let i = 0; i <= NR; i++) for (let k = 0; k < K; k++) {
      const p = ring(i, k), y = outerY(p.s) - (face < 0 ? thick(p.rho) : 0);
      pos.push(p.x, y, p.z); disc(face > 0 ? COL.cap : COL.gills, p);
    }
  }
  const at = (face: number, i: number, k: number) => (face > 0 ? 0 : (NR + 1) * K) + i * K + k;
  for (const face of [1, -1]) for (let i = 0; i < NR; i++) for (let k = 0; k < NA; k++) {
    const a = at(face, i, k), b = at(face, i, k + 1), c = at(face, i + 1, k), d = at(face, i + 1, k + 1);
    if (face > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  // the cut edge between the two skins
  const base = pos.length / 3;
  for (const face of [1, -1]) for (let k = 0; k < K; k++) { const p = ring(NR, k); pos.push(p.x, outerY(p.s) - (face < 0 ? thick(1) : 0), p.z); uv.push(COL.flesh * 0.25 + 0.03 + (k / NA) * 0.19, face > 0 ? 0.3 : 0.55); }
  for (let k = 0; k < NA; k++) { const oa = base + k, ob = oa + 1, ia = base + K + k, ib = ia + 1; idx.push(oa, ob, ia, ob, ib, ia); }
  return build(pos, uv, idx);
}
