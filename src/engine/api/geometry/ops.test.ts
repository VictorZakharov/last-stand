// The ops held to three 0.187's output (`../shapes/fixtures/ops.json`, read off three once by `fixtures.mjs`):
// mergeGeometries, mergeVertices, toNonIndexed, computeVertexNormals and ConvexGeometry, to the vertex.
import { test } from 'node:test';
import { Vec3 } from '../math/index.ts';
import { box, cylinder, icosahedron, octahedron, sphere, torus } from '../shapes/index.ts';
import { assertGeometry, fixture, geometryFrom } from '../shapes/testing.ts';
import type { Described } from '../shapes/testing.ts';
import { convexHull } from './hull.ts';
import { mergeGeometries, mergeVertices, unindexed } from './ops.ts';

interface Before {
  input: Described;
  output: Described;
}

interface HullCase {
  points: [number, number, number][];
  geometry: Described;
}

interface Ops {
  mergeGroups: Described;
  mergePlain: Described;
  weldBox: Described;
  weldSphere: Described;
  weldLoose: Described;
  unindexedTorus: Described;
  unindexedBox: Described;
  normalsIndexed: Before;
  normalsSoup: Before;
  hullCube: HullCase;
  hullBall: HullCase;
}

const ops = fixture<Ops>('ops');

test('merge with groups is mergeGeometries(..., true)', () => {
  const merged = mergeGeometries([box(1, 1, 1), sphere(1, 4, 3), cylinder(0.5, 0.5, 1, 4)], true);
  assertGeometry(merged, ops.mergeGroups, 'merge');
});

test('merge of unindexed geometries is mergeGeometries', () => {
  assertGeometry(mergeGeometries([octahedron(1, 0), icosahedron(0.5, 0)]), ops.mergePlain, 'merge');
});

test('weld is mergeVertices', () => {
  assertGeometry(mergeVertices(unindexed(box(1, 1, 1, 2, 1, 1))), ops.weldBox, 'weld box');
  assertGeometry(mergeVertices(unindexed(sphere(1, 5, 4)), 1e-3), ops.weldSphere, 'weld sphere');
  const loose = octahedron(1, 1).deleteAttribute('uv').deleteAttribute('normal');
  assertGeometry(mergeVertices(loose, 0.1), ops.weldLoose, 'weld loose');
});

test('unindexed is toNonIndexed, groups kept', () => {
  assertGeometry(unindexed(torus(1, 0.3, 3, 4)), ops.unindexedTorus, 'torus');
  assertGeometry(unindexed(box(1, 2, 3)), ops.unindexedBox, 'box');
});

test('computeVertexNormals is three\'s, smooth through the index and flat without', () => {
  for (const [name, { input, output }] of Object.entries({ indexed: ops.normalsIndexed, soup: ops.normalsSoup })) {
    const geometry = geometryFrom(input);
    geometry.computeVertexNormals();
    assertGeometry(geometry, output, name);
  }
});

test('hull is ConvexGeometry: the same faces in the same order', () => {
  for (const [name, { points, geometry }] of Object.entries({ cube: ops.hullCube, ball: ops.hullBall })) {
    assertGeometry(convexHull(points.map(([x, y, z]) => new Vec3(x, y, z))), geometry, name);
  }
});
