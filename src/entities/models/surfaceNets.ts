// Surface nets: the mesh of the surface where a distance field crosses zero, over a grid. Each cell the surface
// crosses has one vertex, where the field's crossings of its edges average out, moved onto the surface along the
// field's gradient; each grid edge the surface crosses has a quad across it, joining the four cells round it. Its
// normals are the field's own gradient, so it shades smooth at any grid size. Organic shapes (a hand's palm, its
// knuckles and the webs between its fingers) are sculpted as distance fields and meshed with it.
import * as THREE from 'three';

/** A signed distance (m): negative inside the shape, positive outside. A field made of parts may give one of only
 *  the parts near a ball (`within`: right in it, its sign and its value near the surface), cheaper to ask. */
export interface Field {
  (x: number, y: number, z: number): number;
  within?: (x: number, y: number, z: number, radius: number) => Field;
}

export interface Net {
  positions: Float32Array;
  normals: Float32Array;
  index: Uint32Array;
}

/** the corners of a cell, as offsets along x, y and z, and its twelve edges as pairs of them */
const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1]);
const EDGES: [number, number][] = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);
/** the steps a vertex takes onto the surface along the gradient (each one asks the field four times; a vertex starts
 *  within a cell of it) */
const PROJECTIONS = 1;

/** `field`'s gradient at (x, y, z), where it's `d`, into `out`, by differences `h` long. */
function gradient(field: Field, x: number, y: number, z: number, d: number, h: number, out: THREE.Vector3):
  THREE.Vector3 {
  return out.set(field(x + h, y, z) - d, field(x, y + h, z) - d, field(x, y, z + h) - d).divideScalar(h);
}

/** The surface of `field` within `box`, meshed on a grid of `cell` (m). */
export function surfaceNets(field: Field, box: THREE.Box3, cell: number): Net {
  const min = box.min;
  const size = box.getSize(new THREE.Vector3());
  const n = [size.x, size.y, size.z].map((extent) => Math.ceil(extent / cell) + 1);
  const [nx, ny, nz] = n;
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const blocks = new Map<number, Field>();
  /** the field near the block holding point (i, j, k) of the grid */
  const near = (i: number, j: number, k: number): Field => {
    const [bi, bj, bk] = [i, j, k].map((v) => Math.floor(v / BLOCK) * BLOCK);
    const key = bi + nx * (bj + ny * bk);
    let local = blocks.get(key);
    if (!local) {
      const half = BLOCK / 2;
      const [cx, cy, cz] = [min.x + (bi + half) * cell, min.y + (bj + half) * cell, min.z + (bk + half) * cell];
      local = field.within?.(cx, cy, cz, (BLOCK * Math.sqrt(3) / 2 + REACH) * cell) ?? field;
      blocks.set(key, local);
    }
    return local;
  };
  const values = sampled(near, min, n, cell);

  // one vertex in each cell the surface crosses
  const cellAt = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const vertexOf = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  const corner = new Float32Array(8);
  const point = new THREE.Vector3();
  const slope = new THREE.Vector3();
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      const [dx, dy, dz] = CORNERS[c];
      corner[c] = values[at(i + dx, j + dy, k + dz)];
      if (corner[c] < 0) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    point.set(0, 0, 0);
    let crossings = 0;
    for (const [a, b] of EDGES) {
      if ((corner[a] < 0) === (corner[b] < 0)) continue;
      const t = corner[a] / (corner[a] - corner[b]);
      const [ax, ay, az] = CORNERS[a];
      const [bx, by, bz] = CORNERS[b];
      point.x += ax + (bx - ax) * t;
      point.y += ay + (by - ay) * t;
      point.z += az + (bz - az) * t;
      crossings++;
    }
    point.divideScalar(crossings);
    point.set(min.x + (i + point.x) * cell, min.y + (j + point.y) * cell, min.z + (k + point.z) * cell);
    onto(near(i, j, k), point, cell, slope);
    vertexOf[cellAt(i, j, k)] = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    normals.push(slope.x, slope.y, slope.z);
  }

  // a quad across each grid edge the surface crosses, wound to face out of the shape
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, out: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (out) index.push(a, b, c, a, c, d);
    else index.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const here = values[at(i, j, k)] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && here !== (values[at(i + 1, j, k)] < 0)) {
      quad(vertexOf[cellAt(i, j - 1, k - 1)], vertexOf[cellAt(i, j, k - 1)], vertexOf[cellAt(i, j, k)],
        vertexOf[cellAt(i, j - 1, k)], here);
    }
    if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && here !== (values[at(i, j + 1, k)] < 0)) {
      quad(vertexOf[cellAt(i - 1, j, k - 1)], vertexOf[cellAt(i - 1, j, k)], vertexOf[cellAt(i, j, k)],
        vertexOf[cellAt(i, j, k - 1)], here);
    }
    if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && here !== (values[at(i, j, k + 1)] < 0)) {
      quad(vertexOf[cellAt(i - 1, j - 1, k)], vertexOf[cellAt(i, j - 1, k)], vertexOf[cellAt(i, j, k)],
        vertexOf[cellAt(i - 1, j, k)], here);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), index: new Uint32Array(index) };
}

/** the blocks of the grid sampled whole or not at all (cells a side), and how far from the surface a block's middle
 *  must be for the block to be left out (a share of the reach from its middle to its corners and on a cell: the
 *  field may say a distance a little more than it is) */
const BLOCK = 4;
const FAR_SHARE = 1.25;
/** how many cells round its block a block's own field holds for (a vertex moved onto the surface may go a cell a
 *  step) */
const REACH = 3;

/**
 * `field` at each point of the grid (`n` points along x, y and z from `min`, `cell` apart), x fastest. A block of the
 * grid whose middle is far from the surface is filled with the field there, whose sign is every point's in it: most of
 * a hand's box is air, and a hand sampled at every point took seconds.
 */
function sampled(near: (i: number, j: number, k: number) => Field, min: THREE.Vector3, n: number[], cell: number):
  Float32Array {
  const [nx, ny, nz] = n;
  const values = new Float32Array(nx * ny * nz);
  const far = FAR_SHARE * (BLOCK * Math.sqrt(3) / 2 + 1) * cell;
  const half = BLOCK / 2;
  for (let bk = 0; bk < nz; bk += BLOCK) for (let bj = 0; bj < ny; bj += BLOCK) for (let bi = 0; bi < nx; bi += BLOCK) {
    const field = near(bi, bj, bk);
    const middle = field(min.x + (bi + half) * cell, min.y + (bj + half) * cell, min.z + (bk + half) * cell);
    const whole = Math.abs(middle) > far;
    for (let k = bk; k < Math.min(bk + BLOCK + 1, nz); k++) {
      for (let j = bj; j < Math.min(bj + BLOCK + 1, ny); j++) {
        for (let i = bi; i < Math.min(bi + BLOCK + 1, nx); i++) {
          const index = i + nx * (j + ny * k);
          // (a block's last points are the next one's first: one sampled there is kept)
          if (whole) {
            if (values[index] === 0) values[index] = middle;
          } else values[index] = field(min.x + i * cell, min.y + j * cell, min.z + k * cell);
        }
      }
    }
  }
  return values;
}

/** `point` moved onto `field`'s surface along its gradient (by at most a cell a step), and the surface's normal there
 *  into `normal`. */
function onto(field: Field, point: THREE.Vector3, cell: number, normal: THREE.Vector3): void {
  const h = cell * 0.05;
  for (let step = 0; step < PROJECTIONS; step++) {
    const d = field(point.x, point.y, point.z);
    gradient(field, point.x, point.y, point.z, d, h, normal);
    const length = normal.lengthSq();
    if (length < 1e-12) break;
    const move = THREE.MathUtils.clamp(-d / length, -cell / Math.sqrt(length), cell / Math.sqrt(length));
    point.addScaledVector(normal, move);
  }
  gradient(field, point.x, point.y, point.z, field(point.x, point.y, point.z), h, normal).normalize();
}
