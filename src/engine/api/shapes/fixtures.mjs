// Reads three 0.187's generators, ops and curves once into small JSON fixtures (`fixtures/*.json`), which the
// tests hold the API's own to: every attribute and the index in full, rounded to 1e-6. three is no package of the
// game's now (#973): install it for the run alone, `npm install --no-save three@0.187.0`, then
// `node src/engine/api/shapes/fixtures.mjs`, then `npm install` puts the packages back as the lockfile has them.
// The tests never import three. Each case is data the tests
// rebuild with the API (`testing.ts` reads the same recipes).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'fixtures');
const round = (x) => Math.round(x * 1e6) / 1e6;
const numbers = (list) => Array.from(list, round);

/** A geometry as the tests compare it: each attribute in order, the index and its width, the groups. */
function described(geometry) {
  const attributes = Object.entries(geometry.attributes).map(([name, args]) => ({
    name, itemSize: args.itemSize, array: numbers(args.array),
  }));
  const index = geometry.index ? Array.from(geometry.index.array) : null;
  const indexBits = geometry.index ? geometry.index.array.BYTES_PER_ELEMENT * 8 : 0;
  return { attributes, index, indexBits, groups: geometry.groups.map((group) => ({ ...group })) };
}

const v2 = ([x, y]) => new THREE.Vector2(x, y);
const v3 = ([x, y, z]) => new THREE.Vector3(x, y, z);

/** A path or an outline from its recipe: each step a pen's method and its numbers; holes their own recipes. */
function outlineOf(recipe, Kind = THREE.Shape) {
  const outline = new Kind();
  for (const [method, ...args] of recipe.steps) outline[method](...args);
  if (recipe.holes) outline.holes = recipe.holes.map((hole) => outlineOf(hole, THREE.Path));
  return outline;
}

/** A curve in space from its recipe. */
function curveOf(recipe) {
  if (recipe.kind === 'catmull') {
    return new THREE.CatmullRomCurve3(recipe.points.map(v3), recipe.closed, recipe.type, recipe.tension);
  }
  if (recipe.kind === 'line') return new THREE.LineCurve3(...recipe.points.map(v3));
  if (recipe.kind === 'bezier2') return new THREE.QuadraticBezierCurve3(...recipe.points.map(v3));
  return new THREE.CubicBezierCurve3(...recipe.points.map(v3));
}

const RECT = { steps: [['moveTo', 0, 0], ['lineTo', 1, 0], ['lineTo', 1, 0.6], ['lineTo', 0, 0.6], ['lineTo', 0, 0]] };
const HOLE = { steps: [['moveTo', 0.2, 0.2], ['lineTo', 0.2, 0.4], ['lineTo', 0.5, 0.4], ['lineTo', 0.5, 0.2]] };
const RING_HOLE = { steps: [['absarc', 0.7, 0.3, 0.1, 0, Math.PI * 2, false]] };
const CURVED = { steps: [['moveTo', 0, 0], ['quadraticCurveTo', 0.5, -0.3, 1, 0],
  ['bezierCurveTo', 1.2, 0.3, 0.8, 0.8, 0.5, 1],
  ['absarc', 0.2, 0.7, 0.3, 0.3, 3.5, false], ['closePath']] };
const KITE = { steps: [['moveTo', 0, 1], ['lineTo', 0.6, 0.2], ['lineTo', 0, -1], ['lineTo', -0.6, 0.2],
  ['closePath']] };
const ARCHED = { steps: [['moveTo', -0.5, 0], ['lineTo', 0.5, 0], ['lineTo', 0.5, 1],
  ['absarc', 0, 1, 0.5, 0, Math.PI, false],
  ['lineTo', -0.5, 0]], holes: [{ steps: [['moveTo', -0.1, 0.3], ['lineTo', 0.1, 0.3], ['lineTo', 0.1, 0.9],
  ['lineTo', -0.1, 0.9]] }] };
const PROFILE = [[0, -0.5], [0.4, -0.2], [0.5, 0.3], [0.2, 0.45], [0, 0.5]];
const TUBE_POINTS = [[0, 0, 0], [0.3, 0.5, 0.1], [0.6, 0.4, -0.3], [1, 0.9, 0], [1.2, 1.4, 0.4]];

const CURVES = {
  centripetal: { kind: 'catmull', points: TUBE_POINTS, closed: false, type: 'centripetal', tension: 0.5 },
  chordal: { kind: 'catmull', points: TUBE_POINTS, closed: false, type: 'chordal', tension: 0.5 },
  catmullrom: { kind: 'catmull', points: TUBE_POINTS, closed: false, type: 'catmullrom', tension: 0.3 },
  closed: { kind: 'catmull', points: TUBE_POINTS.slice(0, 4), closed: true, type: 'centripetal', tension: 0.5 },
  line: { kind: 'line', points: [[0, 0, 0], [0.3, 1, -0.2]] },
  bezier2: { kind: 'bezier2', points: [[0, 0, 0], [0.5, 0.8, 0], [1, 0.2, 0.3]] },
  bezier3: { kind: 'bezier3', points: [[0, 0, 0], [0.2, 1, 0], [0.8, 1, 0.5], [1, 0, 0.2]] },
};

/** Each generator's cases: its arguments as the API takes them (curves and outlines by recipe). */
const GENERATORS = {
  sphere: [[1.5, 5, 4], [0.7, 6, 3, 0.3, 4, 0.2, 2], [1, 3, 2, 0, Math.PI * 2, 0, Math.PI / 2]],
  box: [[2, 1, 3, 2, 1, 3], [1, 1, 1], [0.5, 2, 0.25, 1, 3, 2]],
  cylinder: [[0.5, 1, 2, 6, 2], [0, 1, 1, 5, 1, false, 0.5, 3], [1, 0.5, 1, 4, 1, true], [0.3, 0, 1, 4, 2]],
  cone: [[1, 2, 5, 2], [0.5, 1, 6, 1, true, 0, Math.PI]],
  torus: [[1, 0.3, 4, 6], [1, 0.3, 3, 5, Math.PI, 0.2, 3]],
  torusKnot: [[0.011, 0.006, 12, 4, 2, 3], [1, 0.4, 10, 3, 3, 5]],
  lathe: [[PROFILE, 5], [PROFILE, 4, 0.5, Math.PI], [PROFILE, 3, 0, 9]],
  plane: [[2, 1, 3, 2], [1, 1]],
  circle: [[1, 5], [0.5, 6, 0.3, 2]],
  ring: [[0.5, 1, 5, 2], [0.2, 1, 4, 1, 0.5, 2]],
  capsule: [[0.3, 1, 2, 5], [0.24, 1.4, 4, 10], [0.1, 0, 1, 3, 2]],
  icosahedron: [[1, 0], [1.5, 1]],
  octahedron: [[1, 0], [2, 2]],
  dodecahedron: [[1, 0]],
  tube: [['centripetal', 6, 0.1, 4, false], ['closed', 5, 0.05, 3, true], ['line', 1, 0.0013, 4, false],
    ['bezier2', 4, 0.2, 5, false], ['bezier3', 3, 0.1, 3, false]],
  extrude: [[RECT, { depth: 0.4, bevelEnabled: false }], [{ ...RECT, holes: [HOLE, RING_HOLE] }, { depth: 0.2,
    bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 }],
  [CURVED, { depth: 0.1, bevelEnabled: true, bevelSegments: 1, bevelThickness: 0.02, bevelSize: 0.02,
    curveSegments: 3 }],
  [KITE, { depth: 0.3, steps: 2, bevelEnabled: false }], [ARCHED, { depth: 0.12, curveSegments: 2 }],
  [[KITE, RECT], { depth: 0.1, bevelEnabled: false, curveSegments: 1 }]],
  flat: [[RECT], [{ ...RECT, holes: [HOLE] }], [CURVED, 4], [[KITE, ARCHED], 3]],
  roundedBox: [[0.5, 0.0024, 0.2, 1, 0.001], [2, 1, 1, 3, 0.05], [1, 1, 1, 0, 0.1]],
};

/** Three's generator for each name, from a case's arguments. */
const THREE_OF = {
  sphere: (args) => new THREE.SphereGeometry(...args),
  box: (args) => new THREE.BoxGeometry(...args),
  cylinder: (args) => new THREE.CylinderGeometry(...args),
  cone: (args) => new THREE.ConeGeometry(...args),
  torus: (args) => new THREE.TorusGeometry(...args),
  torusKnot: (args) => new THREE.TorusKnotGeometry(...args),
  lathe: ([points, ...rest]) => new THREE.LatheGeometry(points.map(v2), ...rest),
  plane: (args) => new THREE.PlaneGeometry(...args),
  circle: (args) => new THREE.CircleGeometry(...args),
  ring: (args) => new THREE.RingGeometry(...args),
  capsule: (args) => new THREE.CapsuleGeometry(...args),
  icosahedron: (args) => new THREE.IcosahedronGeometry(...args),
  octahedron: (args) => new THREE.OctahedronGeometry(...args),
  dodecahedron: (args) => new THREE.DodecahedronGeometry(...args),
  tube: ([curve, ...rest]) => new THREE.TubeGeometry(curveOf(CURVES[curve]), ...rest),
  extrude: ([shapes, options]) => new THREE.ExtrudeGeometry(shapesOf(shapes), options),
  flat: ([shapes, ...rest]) => new THREE.ShapeGeometry(shapesOf(shapes), ...rest),
  roundedBox: (args) => new RoundedBoxGeometry(...args),
};

function shapesOf(recipe) {
  return Array.isArray(recipe) ? recipe.map((recipe) => outlineOf(recipe)) : outlineOf(recipe);
}

function generators() {
  const cases = [];
  for (const [name, list] of Object.entries(GENERATORS)) {
    for (const args of list) cases.push({ name, args, geometry: described(THREE_OF[name](args)) });
  }
  return { curves: CURVES, cases };
}

/** Points scattered by a fixed rule (no randomness): a lumpy ball. */
function scattered(count) {
  return Array.from({ length: count }, (_index, i) => [Math.sin(i * 12.9898) * 0.8, Math.cos(i * 78.233) * 0.5,
    Math.sin(i * 37.719 + 1) * 0.6].map(round));
}

function ops() {
  const lumpy = new THREE.SphereGeometry(1, 6, 4);
  const position = lumpy.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) * (1 + 0.1 * Math.sin(i)), position.getY(i), position.getZ(i));
  }
  const lumpyIn = described(lumpy);
  lumpy.computeVertexNormals();
  const soup = new THREE.SphereGeometry(1, 4, 3).toNonIndexed();
  const soupIn = described(soup);
  soup.computeVertexNormals();
  const cube = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    [0, 0, 0], [0.5, 0.2, -0.3], [1, 0, 0]];
  const ball = scattered(40);
  return {
    mergeGroups: described(mergeGeometries([new THREE.BoxGeometry(1, 1, 1), new THREE.SphereGeometry(1, 4, 3),
      new THREE.CylinderGeometry(0.5, 0.5, 1, 4)], true)),
    mergePlain: described(mergeGeometries([new THREE.OctahedronGeometry(1, 0),
      new THREE.IcosahedronGeometry(0.5, 0)])),
    weldBox: described(mergeVertices(new THREE.BoxGeometry(1, 1, 1, 2, 1, 1).toNonIndexed())),
    weldSphere: described(mergeVertices(new THREE.SphereGeometry(1, 5, 4).toNonIndexed(), 1e-3)),
    weldLoose: described(mergeVertices(new THREE.OctahedronGeometry(1, 1).deleteAttribute('uv')
      .deleteAttribute('normal'), 0.1)),
    unindexedTorus: described(new THREE.TorusGeometry(1, 0.3, 3, 4).toNonIndexed()),
    unindexedBox: described(new THREE.BoxGeometry(1, 2, 3).toNonIndexed()),
    normalsIndexed: { input: lumpyIn, output: described(lumpy) },
    normalsSoup: { input: soupIn, output: described(soup) },
    hullCube: { points: cube, geometry: described(new ConvexGeometry(cube.map(v3))) },
    hullBall: { points: ball, geometry: described(new ConvexGeometry(ball.map(v3))) },
  };
}

const flatPoints = (points) => points.flatMap((point) => [round(point.x), round(point.y),
  ...(point.z === undefined ? [] : [round(point.z)])]);

function curves() {
  const space = {};
  for (const [name, recipe] of Object.entries(CURVES)) {
    const curve = curveOf(recipe);
    const frames = curve.computeFrenetFrames(6, recipe.closed ?? false);
    space[name] = {
      points: flatPoints(curve.getPoints(8)),
      spaced: flatPoints(curve.getSpacedPoints(6)),
      length: round(curve.getLength()),
      lengths: numbers(curve.getLengths(10)),
      tangents: flatPoints([0, 0.25, 0.5, 0.9, 1].map((u) => curve.getTangentAt(u))),
      frames: { tangents: flatPoints(frames.tangents), normals: flatPoints(frames.normals),
        binormals: flatPoints(frames.binormals) },
    };
  }
  const ellipses = [[0, 0.006, 0.043, 0.032, Math.PI * 1.05, Math.PI * 1.95], [1, 2, 3, 1, 0, Math.PI, true, 0.4],
    [0, 0, 1, 1, 0, 0], [0, 0, 1, 2, 2, -1, false]].map((args) => ({
    args, points: flatPoints(new THREE.EllipseCurve(...args).getPoints(14)) }));
  const outlines = [CURVED, ARCHED, KITE, { ...RECT, holes: [HOLE, RING_HOLE] }].map((recipe) => {
    const outline = outlineOf(recipe);
    const extracted = outline.extractPoints(6);
    return { recipe, shape: flatPoints(extracted.shape), holes: extracted.holes.map(flatPoints),
      spaced: flatPoints(outline.getSpacedPoints(10)), length: round(outline.getLength()) };
  });
  const wobble = Array.from({ length: 120 }, (_index, i) => {
    const args = (i / 120) * Math.PI * 2;
    const recipe = 1 + 0.3 * Math.sin(args * 7) + 0.1 * Math.cos(args * 13);
    return [round(Math.cos(args) * recipe), round(Math.sin(args) * recipe)];
  });
  const polygons = [
    { contour: RECT.steps.slice(0, 4).map(([, x, y]) => [x, y]), holes: [HOLE.steps.map(([, x, y]) => [x, y])] },
    { contour: wobble, holes: [[[0.1, 0.1], [0.1, -0.1], [-0.1, -0.1], [-0.1, 0.1]],
      [[0.5, 0], [0.45, 0.05], [0.4, 0]]] },
    { contour: [[0, 0], [2, 0], [2, 2], [1, 1], [0, 2], [0, 0]], holes: [] },
  ].map(({ contour, holes }) => ({ contour, holes,
    faces: THREE.ShapeUtils.triangulateShape(contour.map(v2), holes.map((hole) => hole.map(v2))) }));
  return { space, ellipses, outlines, polygons };
}

mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(join(out, `${name}.json`), JSON.stringify(data));
write('generators', generators());
write('ops', ops());
write('curves', curves());
