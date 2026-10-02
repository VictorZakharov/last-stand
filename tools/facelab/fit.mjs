// Face harness: a face's shape fitted to the reference by least squares instead of by hand (analysis by synthesis): the
// distance from our skin (face.ts's field) at each point of the reference rebuilt in 3D (dense.py's fit-target.*), plus
// the front view's half-widths from the hand-placed points where that rebuilt face doesn't reach (the face's sides), over
// the mask's knots and the shape's broad scalars, the reference's pose free but its eyes held on ours (Levenberg-Marquardt,
// robust: points far off, where the reference is a guess or a feature we shape apart, count less). The mask is kept smooth
// along its heights and every value is pulled weakly to where it started; the knots the reference doesn't reach (under
// the chin, the forehead's top) are held. The nose, the lips and the eyes are left to the pictures' landmarks (the face
// model's are coarse): their points are out of the target, and the lips are kept where they were when the muzzle moves.
//   node fit.mjs <out dir> [--class warrior] [--iters 25] [--smooth 1] [--pull 0.15] [--fixknots 0,14,15]
//                [--scalars a,b,c] [--apply]
// Prints the fit and the new values; writes <out dir>/fit.json; --apply writes them into FACES in face.ts.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadFace } from './sdf.mjs';

const args = process.argv.slice(2), OUT = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const CLS = opt('class', 'warrior'), ITERS = +opt('iters', 25), LS = +opt('smooth', 1), L0 = +opt('pull', 0.15);
const FIXED = opt('fixknots', '0,14,15').split(',').filter(Boolean).map(Number);
const SCAL = opt('scalars', 'skullFwd,templeNarrow,jaw,chin,chinFwd,muzzleFwd,brow,browFwd,browDrop').split(',').filter(Boolean);
const MK = ['front', 'half', 'side', 'p', 'pz'];
// (an option's value when it isn't set: face.ts's own default for it)
const DEF = { skullFwd: 0, templeNarrow: 0, muzzleFwd: 0, browFwd: 0, browDrop: 0, lipFwd: 0 };

const { face, close } = await loadFace();
const buf = readFileSync(join(OUT, 'fit-target.f32'));
const T = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)), N = T.length / 4;
const meta = JSON.parse(readFileSync(join(OUT, 'fit-target.json'), 'utf8'));
const F0 = structuredClone(face.FACES[CLS]);
if (!F0.mask) { console.error(`fit: ${CLS} has no mask to fit`); process.exit(1); }
for (const k of [...SCAL, 'lipFwd']) if (F0[k] === undefined) F0[k] = DEF[k] ?? 0;
const F = structuredClone(F0), lf0 = F0.muzzleFwd + F0.lipFwd;

const P = [], pose = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < 6; i++) P.push({ pose: true, get: () => pose[i], set: (_, v) => { pose[i] = v; }, step: i < 3 ? 0.002 : 0.2, lo: -1e9, hi: 1e9 });
for (const k of MK) for (let i = 0; i < F.mask[k].length; i++) {
  if (FIXED.includes(i)) continue;
  const ex = k === 'p' || k === 'pz';
  P.push({ get: (G) => G.mask[k][i], set: (G, v) => { G.mask[k][i] = v; }, step: ex ? 0.03 : 0.3, sc: ex ? 0.3 : 4, lo: ex ? 1.2 : k === 'side' ? -40 : 4, hi: ex ? 6 : 200 });
}
if (F.mask.hollow !== undefined) P.push({ get: (G) => G.mask.hollow, set: (G, v) => { G.mask.hollow = v; }, step: 0.2, sc: 1, lo: 0, hi: 6 });
for (const k of SCAL) {
  const small = ['cheek', 'brow', 'nosePro', 'tip', 'lips', 'mouthW'].includes(k);
  P.push({ get: (G) => G[k], set: (G, v) => { G[k] = v; }, step: small ? 0.02 : 0.3, sc: small ? 0.15 : 4, lo: -1e9, hi: 1e9 });
}
const th0 = P.map((p) => p.get(F0));
const eT = meta.eyesT, eO = meta.eyesO, c0 = [0, 1, 2].map((j) => (eT[0][j] + eT[1][j]) / 2);
let wsum = 0; for (let i = 0; i < N; i++) wsum += T[i * 4 + 3];
const norm = Math.sqrt(1000 / wsum), sdf = (G, x, y, z) => face.headSDF(x, y, z, G);

const rot = (rx, ry, rz) => {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, -sy, cy * sx, cy * cx];
};
const move = (R, x, y, z) => {
  x -= c0[0]; y -= c0[1]; z -= c0[2];
  return [R[0] * x + R[1] * y + R[2] * z + c0[0] + pose[3], R[3] * x + R[4] * y + R[5] * z + c0[1] + pose[4], R[6] * x + R[7] * y + R[8] * z + c0[2] + pose[5]];
};
// the front view's outline as the harness's camera sees it (in perspective from 1385 mm ahead of the pupils)
const CAM = 1385, ZP = 83;
const halfWidth = (G, y) => {
  let best = 0;
  for (let z = -30; z <= 110; z += 3) {
    let x = 110;
    for (let i = 0; i < 80; i++) { const d = sdf(G, x, y, z); if (d < 0.05) break; x -= Math.max(0.15, d * 0.9); if (x < 0) break; }
    if (x > 0) best = Math.max(best, x * CAM / (CAM + ZP - z));
  }
  return best;
};
const DELTA = 3, irls = new Float64Array(N).fill(1);
function residuals(G, out) {
  let k = 0;
  const R = rot(pose[0], pose[1], pose[2]);
  for (let i = 0; i < N; i++) { const q = move(R, T[i * 4], T[i * 4 + 1], T[i * 4 + 2]); out[k++] = norm * Math.sqrt(T[i * 4 + 3] * irls[i]) * sdf(G, q[0], q[1], q[2]); }
  for (let e = 0; e < 2; e++) { const q = move(R, ...eT[e]); for (let j = 0; j < 3; j++) out[k++] = 3 * (q[j] - eO[e][j]); }
  for (const [y, h, w] of meta.widths) out[k++] = w * (halfWidth(G, y) - h);
  for (const a of MK) { const v = G.mask[a], s = a === 'p' || a === 'pz' ? 10 : 1; for (let i = 1; i < v.length - 1; i++) out[k++] = LS * s * (v[i - 1] - 2 * v[i] + v[i + 1]); }
  for (let j = 0; j < P.length; j++) out[k++] = P[j].pose ? 0 : L0 * 4 * (P[j].get(G) - th0[j]) / P[j].sc;
  return k;
}
const M = N + 6 + meta.widths.length + MK.reduce((s, a) => s + F.mask[a].length - 2, 0) + P.length;
const r = new Float64Array(M), r2 = new Float64Array(M), J = P.map(() => new Float64Array(M));
const cost = (v) => v.reduce((s, x) => s + x * x, 0);
const stats = () => {
  const R = rot(pose[0], pose[1], pose[2]), ab = []; let s = 0, ws = 0;
  for (let i = 0; i < N; i++) { const q = move(R, T[i * 4], T[i * 4 + 1], T[i * 4 + 2]), d = sdf(F, ...q); s += T[i * 4 + 3] * d * d; ws += T[i * 4 + 3]; ab.push(Math.abs(d)); }
  ab.sort((a, b) => a - b);
  return `the reference's surface off ours by ${Math.sqrt(s / ws).toFixed(2)} mm rms, ${ab[N >> 1].toFixed(2)} median; widths off (mm) `
    + meta.widths.map(([y, h]) => `${(halfWidth(F, y) - h).toFixed(1)} at y ${y.toFixed(0)}`).join(', ');
};
function solve(A, b, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
    L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
  }
  const y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

console.log(`fit: ${CLS}, ${P.length} values to ${N} points of the reference and ${meta.widths.length} widths`);
console.log('  before:', stats());
let mu = 1e-2;
for (let it = 0; it < ITERS; it++) {
  { const R = rot(pose[0], pose[1], pose[2]); for (let i = 0; i < N; i++) { const d = Math.abs(sdf(F, ...move(R, T[i * 4], T[i * 4 + 1], T[i * 4 + 2]))); irls[i] = d < DELTA ? 1 : DELTA / d; } }
  residuals(F, r);
  const c = cost(r), n = P.length;
  for (let j = 0; j < n; j++) {
    const p = P[j], v = p.get(F);
    p.set(F, v + p.step); residuals(F, r2); p.set(F, v);
    for (let i = 0; i < M; i++) J[j][i] = (r2[i] - r[i]) / p.step;
  }
  const A = new Float64Array(n * n), g = new Float64Array(n);
  for (let a = 0; a < n; a++) {
    let s = 0; for (let i = 0; i < M; i++) s += J[a][i] * r[i]; g[a] = -s;
    for (let b = a; b < n; b++) { let t = 0; for (let i = 0; i < M; i++) t += J[a][i] * J[b][i]; A[a * n + b] = A[b * n + a] = t; }
  }
  let ok = false;
  for (let tries = 0; tries < 8 && !ok; tries++) {
    const B = Float64Array.from(A); for (let a = 0; a < n; a++) B[a * n + a] += mu * (A[a * n + a] + 1e-9);
    const dx = solve(B, g, n), old = P.map((p) => p.get(F));
    for (let j = 0; j < n; j++) P[j].set(F, Math.min(P[j].hi, Math.max(P[j].lo, old[j] + dx[j])));
    // (the mask's front stays ahead of its widest point)
    for (let i = 0; i < F.mask.front.length; i++) F.mask.front[i] = Math.max(F.mask.front[i], F.mask.side[i] + 5);
    residuals(F, r2);
    if (cost(r2) < c) { ok = true; mu = Math.max(1e-6, mu / 3); } else { for (let j = 0; j < n; j++) P[j].set(F, old[j]); mu *= 4; }
  }
  if (!ok || it === ITERS - 1) break;
}
// (the lips where they were: the muzzle carries them forwards and back)
F.lipFwd = lf0 - F.muzzleFwd;
console.log('  after: ', stats());
console.log(`  the reference turned ${pose.slice(0, 3).map((v) => (v * 180 / Math.PI).toFixed(1)).join(', ')} deg and moved ${pose.slice(3).map((v) => v.toFixed(1)).join(', ')} mm onto ours`);
const r1 = (v) => Math.round(v * 10) / 10, r2d = (v) => Math.round(v * 100) / 100;
const out = {};
for (const k of [...SCAL, 'lipFwd']) { out[k] = r1(F[k]); if (Math.abs(F[k] - F0[k]) > 0.05) console.log(`  ${k}: ${r1(F0[k])} -> ${r1(F[k])}`); }
out.mask = {};
for (const k of MK) { out.mask[k] = F.mask[k].map(k === 'p' || k === 'pz' ? r2d : r1); console.log(`  mask.${k}: [${out.mask[k].join(', ')}]`); }
if (F.mask.hollow !== undefined) out.mask.hollow = r1(F.mask.hollow);
writeFileSync(join(OUT, 'fit.json'), JSON.stringify(out));
if (args.includes('--apply')) {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../src/entities/models/face.ts');
  let s = readFileSync(path, 'utf8');
  // (the class's entry runs to its mask's end)
  const i = s.indexOf(`  ${CLS}: {`), j = s.indexOf('} },', i) + 4;
  let block = s.slice(i, j);
  const num = (v) => String(v);
  for (const k of [...SCAL, 'lipFwd']) {
    const re = new RegExp(`(\\b${k}: )(-?[\\d.]+)`);
    block = re.test(block) ? block.replace(re, `$1${num(out[k])}`) : block.replace('mask: {', `${k}: ${num(out[k])},\n    mask: {`);
  }
  for (const k of MK) block = block.replace(new RegExp(`(\\b${k}: \\[)[^\\]]*\\]`), `$1${out.mask[k].join(', ')}]`);
  if (out.mask.hollow !== undefined) block = block.replace(/hollow: [\d.]+/, `hollow: ${out.mask.hollow}`);
  writeFileSync(path, s.slice(0, i) + block + s.slice(j));
  console.log(`  written into FACES.${CLS} in face.ts`);
}
await Promise.race([close(), new Promise((res) => setTimeout(res, 300))]);
process.exit(0);
