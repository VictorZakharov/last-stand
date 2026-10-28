// Face harness, the head's sections: across the head at several heights, how far out its side reaches at each depth
// (front to back), from its distance field. A lump on the side of the face, a crevice between the cheek and the ear or
// a temple narrower than the cheekbones reads here as numbers, where a picture shows only a dark patch that the light may
// have made (the mage's cheeks, 2026-10-27).
//   node tools/facelab/section.mjs <class> [heights, mm up from the chin: 60,75,90,100,110] [depths: -60..100 by 10]
//   node tools/facelab/section.mjs <class> profile [from,to,step: 0,140,2]: how far forward the middle of the face reaches
//   at each height (the lips, the groove under them and the chin as numbers)
import { loadFace } from './sdf.mjs';

const CLS = process.argv[2] ?? 'mage';
const list = (arg, def) => (arg ? arg.split(',').map(Number) : def);
const HEIGHTS = list(process.argv[3], [60, 75, 90, 100, 110]);
const DEPTHS = list(process.argv[4], Array.from({ length: 17 }, (_, i) => -60 + 10 * i));

/** how far out (mm from the middle) the skin is at this height and depth: the last point inside, marching out */
function sideAt(face, F, y, z) {
  let x = 0;
  if (face.headSDF(0, y, z, F) > 0) return NaN;
  while (x < 120 && face.headSDF(x + 1, y, z, F) <= 0) x += 1;
  let lo = x, hi = x + 1;
  for (let k = 0; k < 12; k++) {
    const m = (lo + hi) / 2;
    if (face.headSDF(m, y, z, F) <= 0) lo = m;
    else hi = m;
  }
  return lo;
}

/** how far forward (mm) the skin is at the middle at this height: the last point inside, marching forward */
function frontAt(face, F, y) {
  let z = 160;
  while (z > -120 && face.headSDF(0, y, z, F) > 0) z -= 0.25;
  return z;
}

const { face, close } = await loadFace();
const F = face.FACES[CLS];
if (!F) throw new Error(`section: no face ${CLS}`);
if (process.argv[3] === 'profile') {
  const [from, to, step] = list(process.argv[4], [0, 140, 2]);
  console.log(`${CLS}: the face's middle, how far forward (mm) by height (mm up from the chin)`);
  for (let y = from; y <= to; y += step) console.log(String(y).padStart(6) + frontAt(face, F, y).toFixed(2).padStart(9));
  await close();
  process.exit(0);
}
const cell = (v) => (Number.isNaN(v) ? '    -' : v.toFixed(0).padStart(5));
console.log(`${CLS}: the head's half-width (mm) by height (rows, mm up from the chin) and depth (columns, mm forward)`);
console.log('  y \\ z' + DEPTHS.map((z) => String(z).padStart(5)).join(''));
for (const y of HEIGHTS) console.log(String(y).padStart(6) + DEPTHS.map((z) => cell(sideAt(face, F, y, z))).join(''));
await close();
