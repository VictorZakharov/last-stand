// What the geometry's and the shapes' tests share: the fixtures read off three 0.187 (`fixtures.mjs`), the
// outlines and curves rebuilt from their recipes, and a geometry held to its fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vec3 } from '../math/index.ts';
import { Geometry, floats } from '../geometry/index.ts';
import { Bezier2Curve3, Bezier3Curve3, CatmullRom3, Line3Curve } from './curves.ts';
import type { CatmullRomKind } from './curves.ts';
import type { Curve } from './curve.ts';
import { Outline, Path } from './path.ts';

/** A geometry as a fixture holds it. */
export interface Described {
  attributes: { name: string; itemSize: number; array: number[] }[];
  index: number[] | null;
  indexBits: number;
  groups: { start: number; count: number; materialIndex: number }[];
}

/** An outline's recipe: a pen's steps (its method and numbers), and its holes'. */
export interface OutlineRecipe {
  steps: [string, ...(number | boolean)[]][];
  holes?: OutlineRecipe[];
}

/** A curve's recipe. */
export interface CurveRecipe {
  kind: 'catmull' | 'line' | 'bezier2' | 'bezier3';
  points: [number, number, number][];
  closed?: boolean;
  type?: CatmullRomKind;
  tension?: number;
}

/** The fixture `name` (`fixtures/<name>.json`). */
export function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
}

/** What a pen does with a recipe's step. */
type Pen = (outline: Path, args: (number | boolean)[]) => void;

const num = (args: (number | boolean)[], i: number): number => args[i] as number;

const PEN: Record<string, Pen> = {
  moveTo: (path, args) => path.moveTo(num(args, 0), num(args, 1)),
  lineTo: (path, args) => path.lineTo(num(args, 0), num(args, 1)),
  quadraticCurveTo: (path, args) => path.quadraticCurveTo(num(args, 0), num(args, 1), num(args, 2), num(args, 3)),
  bezierCurveTo: (path, args) => {
    path.bezierCurveTo(num(args, 0), num(args, 1), num(args, 2), num(args, 3), num(args, 4), num(args, 5));
  },
  absarc: (path, args) => {
    path.absarc(num(args, 0), num(args, 1), num(args, 2), num(args, 3), num(args, 4), args[5] as boolean);
  },
  closePath: (path) => path.closePath(),
};

/** The path a recipe draws (an outline, its holes paths). */
function drawn<P extends Path>(recipe: OutlineRecipe, path: P): P {
  for (const [method, ...args] of recipe.steps) PEN[method](path, args);
  return path;
}

/** The outline a recipe draws, with its holes. */
export function outlineOf(recipe: OutlineRecipe): Outline {
  const outline = drawn(recipe, new Outline());
  outline.holes = (recipe.holes ?? []).map((hole) => drawn(hole, new Path()));
  return outline;
}

/** One outline or a list of them, by recipe. */
export function shapesOf(recipe: OutlineRecipe | OutlineRecipe[]): Outline | Outline[] {
  return Array.isArray(recipe) ? recipe.map(outlineOf) : outlineOf(recipe);
}

/** The curve a recipe makes. */
export function curveOf(recipe: CurveRecipe): Curve<Vec3> {
  const points = recipe.points.map(([x, y, z]) => new Vec3(x, y, z));
  if (recipe.kind === 'catmull') return new CatmullRom3(points, recipe.closed, recipe.type, recipe.tension);
  if (recipe.kind === 'line') return new Line3Curve(points[0], points[1]);
  if (recipe.kind === 'bezier2') return new Bezier2Curve3(points[0], points[1], points[2]);
  return new Bezier3Curve3(points[0], points[1], points[2], points[3]);
}

/** A fixture's geometry made one of ours (an input to an op). */
export function geometryFrom(described: Described): Geometry {
  const geometry = new Geometry();
  if (described.index) geometry.setIndex(described.index);
  for (const { name, itemSize, array } of described.attributes) geometry.setAttribute(name, floats(array, itemSize));
  return geometry;
}

/** Asserts each of `actual` is within `tolerance` of `expected`'s, naming `what` and the first that isn't. */
export function assertNear(actual: ArrayLike<number>, expected: ArrayLike<number>, what: string,
  tolerance = 2e-6): void {
  assert.equal(actual.length, expected.length, `${what}: lengths differ`);
  for (let i = 0; i < expected.length; i++) {
    const off = Math.abs(actual[i] - expected[i]);
    assert.ok(off <= tolerance, `${what}[${i}]: ${actual[i]} is not ${expected[i]} (off by ${off})`);
  }
}

/** Asserts `geometry` is the fixture's to the vertex: its attributes in order, its index and width, its groups. */
export function assertGeometry(geometry: Geometry, expected: Described, what: string): void {
  const names = Object.keys(geometry.attributes);
  assert.deepEqual(names, expected.attributes.map((args) => args.name), `${what}: attributes`);
  for (const { name, itemSize, array } of expected.attributes) {
    const attribute = geometry.attributes[name];
    assert.equal(attribute.itemSize, itemSize, `${what}: ${name}'s item size`);
    assertNear(attribute.array, array, `${what} ${name}`);
  }
  if (expected.index === null) {
    assert.equal(geometry.index, null, `${what}: an index where three has none`);
  } else {
    assert.ok(geometry.index, `${what}: no index`);
    assert.deepEqual(Array.from(geometry.index.array), expected.index, `${what}: index`);
    assert.equal(geometry.index.array.BYTES_PER_ELEMENT * 8, expected.indexBits, `${what}: index width`);
  }
  assert.deepEqual(geometry.groups, expected.groups, `${what}: groups`);
}

/** `points` (Vec2s or Vec3s) as numbers in turn, as the fixtures hold them. */
export function flatPoints(points: readonly { x: number; y: number; z?: number }[]): number[] {
  return points.flatMap((point) => (point.z === undefined ? [point.x, point.y] : [point.x, point.y, point.z]));
}
