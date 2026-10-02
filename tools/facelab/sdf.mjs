// Face harness: our head's distance field (src/entities/models/face.ts, loaded through Vite) for the Python stages and
// the fitter. As a process it answers requests on stdin, one a line, so the module loads once:
//   eval <in.f32> <out.f32> <class> [overrides.json]   points (x, y, z mm) -> distance and its gradient (d, gx, gy, gz)
//   grid <out.f32> <class> [overrides.json]            the skin's own mesh (headGrid, 220 x 160) and its mean curvature
//                                                     at each point (x, y, z, H; H > 0 bulging, < 0 hollow, 1/mm)
// and answers "ok" (or "error ...") on stdout.
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** face.ts as a module, through a Vite server with no HTTP side (close it when done) */
export async function loadFace() {
  const server = await createServer({ root: ROOT, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
  const face = await server.ssrLoadModule('/src/entities/models/face.ts');
  return { face, close: () => server.close() };
}

export const shapeOf = (face, cls, over) => {
  const F = structuredClone(face.FACES[cls]);
  if (over) { const o = JSON.parse(readFileSync(over, 'utf8')); Object.assign(F, o, o.mask ? { mask: { ...F.mask, ...o.mask } } : {}); }
  return F;
};

const f32 = (path) => { const b = readFileSync(path); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };

function evalPoints(face, F, inp, out) {
  const P = f32(inp), n = P.length / 3, O = new Float32Array(n * 4), e = 0.25, f = (x, y, z) => face.headSDF(x, y, z, F);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    O[i * 4] = f(x, y, z);
    O[i * 4 + 1] = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e);
    O[i * 4 + 2] = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e);
    O[i * 4 + 3] = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
  }
  writeFileSync(out, Buffer.from(O.buffer));
}

function gridCurvature(face, F, out) {
  const nu = 220, nv = 160, g = face.headGrid(F, nu, nv), n = (nu + 1) * (nv + 1), h = 1.2, f = (x, y, z) => face.headSDF(x, y, z, F);
  const O = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const x = g.p[k * 3], y = g.p[k * 3 + 1], z = g.p[k * 3 + 2], c = f(x, y, z);
    // (a distance field's Laplacian is twice the surface's mean curvature)
    const lap = (f(x + h, y, z) + f(x - h, y, z) + f(x, y + h, z) + f(x, y - h, z) + f(x, y, z + h) + f(x, y, z - h) - 6 * c) / (h * h);
    O[k * 4] = x; O[k * 4 + 1] = y; O[k * 4 + 2] = z; O[k * 4 + 3] = lap / 2;
  }
  writeFileSync(out, Buffer.from(O.buffer));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { face, close } = await loadFace();
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    const [cmd, ...a] = line.trim().split(/\s+/);
    try {
      if (cmd === 'eval') evalPoints(face, shapeOf(face, a[2], a[3]), a[0], a[1]);
      else if (cmd === 'grid') gridCurvature(face, shapeOf(face, a[1], a[2]), a[0]);
      else if (cmd === 'quit') break;
      else throw new Error('unknown request ' + cmd);
      process.stdout.write('ok\n');
    } catch (err) { process.stdout.write('error ' + String(err.message).replace(/\n/g, ' ') + '\n'); }
  }
  // (a Vite server can take its time closing its watchers: nothing here needs it to)
  await Promise.race([close(), new Promise((r) => setTimeout(r, 300))]);
  process.exit(0);
}
