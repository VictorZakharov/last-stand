// Outlines stood up into solids (three's `ExtrudeGeometry`): each outline's points moved out by its bevel at each
// of its layers, its two lids triangulated, its sides a quad a step between each pair of layers; unindexed, its
// uvs the world's (three's `WorldUVGenerator`), flat normals. Follows three 0.187's (three.js, MIT) to the vertex.
import { Vec2 } from '../math/index.ts';
import { Geometry } from '../geometry/index.ts';
import { geometryOf } from './build.ts';
import type { Outline } from './path.ts';
import { isClockWise, triangulate } from './triangulate.ts';
import { bevelVector } from './extrudeBevel.ts';

/** How an outline is stood up (three's `ExtrudeGeometryOptions` but its path along a curve and its uv maker). */
export interface ExtrudeOptions {
  /** points a curved piece of the outline (12) */
  curveSegments?: number;
  /** layers along its depth (1) */
  steps?: number;
  /** how far it's stood up, along +z (1) */
  depth?: number;
  /** whether its edges are bevelled (true) */
  bevelEnabled?: boolean;
  /** how far the bevel reaches along z past each lid (0.2) */
  bevelThickness?: number;
  /** how far the bevel reaches out from the outline (`bevelThickness - 0.1`) */
  bevelSize?: number;
  /** how far the bevel starts out from the outline (0) */
  bevelOffset?: number;
  /** layers in each bevel (3) */
  bevelSegments?: number;
}

/** Takes out the points of a ring that sit (to within a hair, scaled by their size) on the one before. */
function mergeOverlappingPoints(points: Vec2[]): void {
  const thresholdSq = 1e-10 * 1e-10;
  let previous = points[0];
  for (let i = 1; i <= points.length; i++) {
    const at = i % points.length;
    const current = points[at];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const scale = Math.max(Math.abs(current.x), Math.abs(current.y), Math.abs(previous.x), Math.abs(previous.y));
    if (dx * dx + dy * dy <= thresholdSq * scale * scale) {
      points.splice(at, 1);
      i--;
      continue;
    }
    previous = current;
  }
}

/** Each point's bevel way, from its neighbours round the ring. */
function movementsOf(ring: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0, count = ring.length; i < count; i++) {
    out.push(bevelVector(ring[i], ring[(i + count - 1) % count], ring[(i + 1) % count]));
  }
  return out;
}

/** `point` moved `size` along `way` (a new point). */
function moved(point: Vec2, way: Vec2, size: number): Vec2 {
  return point.clone().addScaledVector(way, size);
}

/** One outline's numbers pushed onto `positions` and `uvs`, its lid and side groups added to `geometry`. */
function addOutline(outline: Outline, options: ExtrudeOptions, geometry: Geometry, positions: number[],
  uvs: number[]): void {
  const curveSegments = options.curveSegments ?? 12;
  const steps = options.steps ?? 1;
  const depth = options.depth ?? 1;
  const bevelEnabled = options.bevelEnabled ?? true;
  const thicknessGiven = options.bevelThickness ?? 0.2;
  const bevelThickness = bevelEnabled ? thicknessGiven : 0;
  const bevelSize = bevelEnabled ? options.bevelSize ?? thicknessGiven - 0.1 : 0;
  const bevelOffset = bevelEnabled ? options.bevelOffset ?? 0 : 0;
  const bevelSegments = bevelEnabled ? options.bevelSegments ?? 3 : 0;
  const extracted = outline.extractPoints(curveSegments);
  let contour = extracted.shape;
  const holes = extracted.holes;
  if (!isClockWise(contour)) {
    contour = contour.reverse();
    holes.forEach((hole, holeIndex) => {
      if (isClockWise(hole)) holes[holeIndex] = hole.reverse();
    });
  }
  mergeOverlappingPoints(contour);
  holes.forEach(mergeOverlappingPoints);
  const vertices = contour.concat(...holes);
  const vlen = vertices.length;
  const contourMoves = movementsOf(contour);
  const holeMoves = holes.map(movementsOf);
  const vertexMoves = contourMoves.concat(...holeMoves);
  const layers: number[] = [];
  const v = (x: number, y: number, z: number): void => {
    layers.push(x, y, z);
  };
  const bevelLayer = (layer: number, zOf: (z: number) => number, lid: Vec2[][] | null): void => {
    const share = layer / bevelSegments;
    const z = bevelThickness * Math.cos((share * Math.PI) / 2);
    const bs = bevelSize * Math.sin((share * Math.PI) / 2) + bevelOffset;
    const rings = [contour, ...holes];
    const moves = [contourMoves, ...holeMoves];
    rings.forEach((ring, ringIndex) => {
      const kept: Vec2[] = [];
      ring.forEach((point, i) => {
        const vert = moved(point, moves[ringIndex][i], bs);
        v(vert.x, vert.y, zOf(z));
        kept.push(vert);
      });
      if (lid && share === 0) lid.push(kept);
    });
  };
  let faces: number[][];
  if (bevelSegments === 0) {
    faces = triangulate(contour, holes);
  } else {
    const lid: Vec2[][] = [];
    for (let layer = 0; layer < bevelSegments; layer++) bevelLayer(layer, (z) => -z, lid);
    faces = triangulate(lid[0], lid.slice(1));
  }
  const bs = bevelSize + bevelOffset;
  for (let step = 0; step <= steps; step++) {
    for (let i = 0; i < vlen; i++) {
      const vert = bevelEnabled ? moved(vertices[i], vertexMoves[i], bs) : vertices[i];
      v(vert.x, vert.y, (depth / steps) * step);
    }
  }
  for (let layer = bevelSegments - 1; layer >= 0; layer--) bevelLayer(layer, (z) => depth + z, null);
  const corner = (index: number): void => {
    positions.push(layers[index * 3], layers[index * 3 + 1], layers[index * 3 + 2]);
  };
  const lidsStart = positions.length / 3;
  const top = vlen * (bevelEnabled ? steps + bevelSegments * 2 : steps);
  for (const face of faces) triangle(positions, uvs, () => [face[2], face[1], face[0]].forEach(corner));
  for (const face of faces) {
    triangle(positions, uvs, () => [face[0], face[1], face[2]].forEach((i) => corner(i + top)));
  }
  geometry.addGroup(lidsStart, positions.length / 3 - lidsStart, 0);
  const sidesStart = positions.length / 3;
  let offset = 0;
  for (const ring of [contour, ...holes]) {
    for (let i = ring.length - 1; i >= 0; i--) {
      const previous = i === 0 ? ring.length - 1 : i - 1;
      for (let step = 0; step < steps + bevelSegments * 2; step++) {
        const cornerA = offset + i + vlen * step;
        const cornerB = offset + previous + vlen * step;
        const cornerC = offset + previous + vlen * (step + 1);
        const cornerD = offset + i + vlen * (step + 1);
        [cornerA, cornerB, cornerD, cornerB, cornerC, cornerD].forEach(corner);
        sideUvs(positions, uvs);
      }
    }
    offset += ring.length;
  }
  geometry.addGroup(sidesStart, positions.length / 3 - sidesStart, 1);
}

/** A lid's triangle: its corners pushed, then its uvs its first two numbers (the world's xy). */
function triangle(positions: number[], uvs: number[], push: () => void): void {
  push();
  const at = positions.length / 3 - 3;
  for (let corner = 0; corner < 3; corner++) {
    uvs.push(positions[(at + corner) * 3], positions[(at + corner) * 3 + 1]);
  }
}

/** A side's quad, pushed as six corners (a, b, d, b, c, d): its uvs along the wall and down z. */
function sideUvs(positions: readonly number[], uvs: number[]): void {
  const at = positions.length / 3 - 6;
  const read = (corner: number, axis: number): number => positions[(at + corner) * 3 + axis];
  const quad = [0, 3, 4, 5];
  const byX = Math.abs(read(0, 1) - read(3, 1)) < Math.abs(read(0, 0) - read(3, 0));
  const uv = quad.map((corner) => [byX ? read(corner, 0) : read(corner, 1), 1 - read(corner, 2)]);
  for (const pick of [0, 1, 3, 1, 2, 3]) uvs.push(uv[pick][0], uv[pick][1]);
}

/**
 * `shapes` stood up along +z by `options.depth` (three's `ExtrudeGeometry`), a lid group (0) and a side group (1)
 * an outline. Its path along a curve (`extrudePath`) and its own uv maker aren't kept: the game uses neither.
 */
export function extrude(shapes: Outline | readonly Outline[], options: ExtrudeOptions = {}): Geometry {
  const list = Array.isArray(shapes) ? shapes : [shapes as Outline];
  const positions: number[] = [];
  const uvs: number[] = [];
  const geometry = new Geometry();
  for (const outline of list) addOutline(outline, options, geometry, positions, uvs);
  const made = geometryOf({ index: null, attributes: [['position', positions, 3], ['uv', uvs, 2]] });
  for (const group of geometry.groups) made.addGroup(group.start, group.count, group.materialIndex);
  made.computeVertexNormals();
  return made;
}
