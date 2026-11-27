// The curves, outlines and triangulation held to three 0.187's numbers (`fixtures/curves.json`, read off three
// once by `fixtures.mjs`): points, spaced points, lengths, tangents and Frenet frames; an ellipse's points; an
// outline's extracted points; earcut's triangles.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vec2 } from '../math/index.ts';
import { Ellipse } from './path.ts';
import { triangulate } from './triangulate.ts';
import { assertNear, curveOf, fixture, flatPoints, outlineOf } from './testing.ts';
import type { CurveRecipe, OutlineRecipe } from './testing.ts';

interface SpaceCase {
  points: number[];
  spaced: number[];
  length: number;
  lengths: number[];
  tangents: number[];
  frames: { tangents: number[]; normals: number[]; binormals: number[] };
}

interface Curves {
  space: Record<string, SpaceCase>;
  ellipses: { args: (number | boolean)[]; points: number[] }[];
  outlines: { recipe: OutlineRecipe; shape: number[]; holes: number[][]; spaced: number[]; length: number }[];
  polygons: { contour: [number, number][]; holes: [number, number][][]; faces: number[][] }[];
}

const curves = fixture<Curves>('curves');
const { curves: recipes } = fixture<{ curves: Record<string, CurveRecipe> }>('generators');

for (const [name, expected] of Object.entries(curves.space)) {
  test(`the ${name} curve is three's: points, lengths, tangents, frames`, () => {
    const recipe = recipes[name];
    const curve = curveOf(recipe);
    assertNear(flatPoints(curve.getPoints(8)), expected.points, 'points');
    assertNear(flatPoints(curve.getSpacedPoints(6)), expected.spaced, 'spaced');
    assertNear([curve.getLength()], [expected.length], 'length');
    assertNear(curve.getLengths(10), expected.lengths, 'lengths');
    assertNear(flatPoints([0, 0.25, 0.5, 0.9, 1].map((u) => curve.getTangentAt(u))), expected.tangents, 'tangents');
    const frames = curve.computeFrenetFrames(6, recipe.closed ?? false);
    assertNear(flatPoints(frames.tangents), expected.frames.tangents, 'frame tangents');
    assertNear(flatPoints(frames.normals), expected.frames.normals, 'frame normals');
    assertNear(flatPoints(frames.binormals), expected.frames.binormals, 'frame binormals');
  });
}

test('an ellipse\'s points are three\'s, clockwise, turned and of no span', () => {
  for (const { args, points } of curves.ellipses) {
    const ellipse = new Ellipse(...(args as ConstructorParameters<typeof Ellipse>));
    assertNear(flatPoints(ellipse.getPoints(14)), points, JSON.stringify(args));
  }
});

test('an outline\'s points, spaced points and length are three\'s', () => {
  curves.outlines.forEach(({ recipe, shape, holes, spaced, length }, i) => {
    const outline = outlineOf(recipe);
    const extracted = outline.extractPoints(6);
    assertNear(flatPoints(extracted.shape), shape, `outline ${i}`);
    assert.equal(extracted.holes.length, holes.length, `outline ${i}: holes`);
    extracted.holes.forEach((hole, holeIndex) => {
      assertNear(flatPoints(hole), holes[holeIndex], `outline ${i} hole ${holeIndex}`);
    });
    assertNear(flatPoints(outline.getSpacedPoints(10)), spaced, `outline ${i} spaced`);
    assertNear([outline.getLength()], [length], `outline ${i} length`);
  });
});

test('triangulate is three\'s triangulateShape: earcut\'s triangles, past 80 points by z-order too', () => {
  for (const { contour, holes, faces } of curves.polygons) {
    const points = contour.map(([x, y]) => new Vec2(x, y));
    const cut = holes.map((hole) => hole.map(([x, y]) => new Vec2(x, y)));
    assert.deepEqual(triangulate(points, cut), faces);
  }
});
