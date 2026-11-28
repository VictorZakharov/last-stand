// Every generator held to three 0.187's output for the same arguments, to the vertex (`fixtures/generators.json`,
// read off three once by `fixtures.mjs`): positions, normals, uvs, the index and its width, the groups.
import { test } from 'node:test';
import { Vec2 } from '../math/index.ts';
import type { Geometry } from '../geometry/index.ts';
import * as shapes from './index.ts';
import type { ExtrudeOptions } from './extrude.ts';
import { assertGeometry, curveOf, fixture, shapesOf } from './testing.ts';
import type { CurveRecipe, Described, OutlineRecipe } from './testing.ts';

interface Case {
  name: string;
  args: unknown[];
  geometry: Described;
}

const { curves, cases } = fixture<{ curves: Record<string, CurveRecipe>; cases: Case[] }>('generators');

type Args = unknown[];
const numbers = (args: Args): number[] => args as number[];
const profile = (points: unknown): Vec2[] => (points as [number, number][]).map(([x, y]) => new Vec2(x, y));

/** Our generator for each name, from a case's arguments as the fixture holds them. */
const OURS: Record<string, (args: Args) => Geometry> = {
  sphere: (args) => shapes.sphere(...numbers(args)),
  box: (args) => shapes.box(...numbers(args)),
  cylinder: (args) => shapes.cylinder(...(args as Parameters<typeof shapes.cylinder>)),
  cone: (args) => shapes.cone(...(args as Parameters<typeof shapes.cone>)),
  torus: (args) => shapes.torus(...numbers(args)),
  torusKnot: (args) => shapes.torusKnot(...numbers(args)),
  lathe: ([points, ...rest]) => shapes.lathe(profile(points), ...numbers(rest)),
  plane: (args) => shapes.plane(...numbers(args)),
  circle: (args) => shapes.circle(...numbers(args)),
  ring: (args) => shapes.ring(...numbers(args)),
  capsule: (args) => shapes.capsule(...numbers(args)),
  icosahedron: (args) => shapes.icosahedron(...numbers(args)),
  octahedron: (args) => shapes.octahedron(...numbers(args)),
  dodecahedron: (args) => shapes.dodecahedron(...numbers(args)),
  tube: ([curve, segments, radius, radial, closed]) => shapes.tube(curveOf(curves[curve as string]),
    segments as number, radius as number, radial as number, closed as boolean),
  extrude: ([recipe, options]) => shapes.extrude(shapesOf(recipe as OutlineRecipe), options as ExtrudeOptions),
  flat: ([recipe, segments]) => shapes.flat(shapesOf(recipe as OutlineRecipe), segments as number | undefined),
  roundedBox: (args) => shapes.roundedBox(...numbers(args)),
};

for (const { name, args, geometry } of cases) {
  const label = `${name}(${JSON.stringify(args).slice(1, -1).slice(0, 70)})`;
  test(`${label} is three's to the vertex`, () => {
    assertGeometry(OURS[name](args), geometry, label);
  });
}
