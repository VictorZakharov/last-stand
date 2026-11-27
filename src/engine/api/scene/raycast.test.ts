// Rays against meshes, against hits read once off three 0.187's `Raycaster` with the same geometries (three's
// own box and sphere, `raycast.fixtures.ts`), places and sides.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BackSide, DoubleSide, UnlitMaterial } from '../material/index.ts';
import { Euler, Mat4, Quat, Vec3 } from '../math/index.ts';
import { InstancedMesh } from './instanced.ts';
import { Mesh } from './mesh.ts';
import { Node } from './node.ts';
import { Raycaster, type Hit } from './raycaster.ts';
import { near, threeBox, threeSphere } from './testing.ts';

/** A hit as three gave it. */
interface ThreeHit {
  distance: number;
  point: number[];
  faceIndex: number;
  corners: number[];
  faceNormal: number[];
  uv?: number[];
  normal?: number[];
  instanceId?: number;
}

/** Asserts `hits` are three's, one by one. */
function sameHits(hits: Hit[], expected: ThreeHit[], object: Node): void {
  assert.equal(hits.length, expected.length, 'how many');
  expected.forEach((want, at) => {
    const hit = hits[at];
    const what = `hit ${at}`;
    assert.equal(hit.object, object, `${what}: object`);
    near([hit.distance], [want.distance], 1e-6, `${what}: distance`);
    near(hit.point.toArray(), want.point, 1e-6, `${what}: point`);
    assert.equal(hit.faceIndex, want.faceIndex, `${what}: faceIndex`);
    assert.deepEqual([hit.face!.a, hit.face!.b, hit.face!.c], want.corners, `${what}: corners`);
    near(hit.face!.normal.toArray(), want.faceNormal, 1e-6, `${what}: face normal`);
    if (want.uv) near(hit.uv!.toArray(), want.uv, 1e-6, `${what}: uv`);
    if (want.normal) near(hit.normal!.toArray(), want.normal, 1e-6, `${what}: normal`);
    assert.equal(hit.instanceId, want.instanceId, `${what}: instance`);
  });
}

const FRONT: ThreeHit = {
  distance: 3.455022481, point: [0, 0, -3.455022481], faceIndex: 8, corners: [16, 18, 17], faceNormal: [0, 0, 1],
  uv: [0.011132256, 0.874495944], normal: [0, 0, 1],
};
const BACK: ThreeHit = {
  distance: 5.991570239, point: [0, 0, -5.991570239], faceIndex: 10, corners: [20, 22, 21], faceNormal: [0, 0, -1],
  uv: [0.345566391, 0.433268112], normal: [0, 0, 1],
};

/** three's box, turned and placed in front of the origin. */
function turnedBox(): Mesh {
  const box = new Mesh(threeBox(), new UnlitMaterial());
  box.position.set(0.3, -0.2, -5);
  box.rotation.set(0.3, 0.6, 0.1);
  return box;
}

const forward = (): Raycaster => new Raycaster(new Vec3(0, 0, 0), new Vec3(0, 0, -1));

test('a ray meets a turned box\'s front face alone where its material draws the front', () => {
  const box = turnedBox();
  sameHits(forward().intersectObject(box), [FRONT], box);
});

test('a ray meets both of a box\'s faces drawn both sides, nearest first, and the back alone drawn back', () => {
  const box = turnedBox();
  (box.material as UnlitMaterial).side = DoubleSide;
  sameHits(forward().intersectObject(box), [FRONT, BACK], box);
  (box.material as UnlitMaterial).side = BackSide;
  sameHits(forward().intersectObject(box), [BACK], box);
  const short = forward();
  short.far = 4.5;
  sameHits(short.intersectObject(box), [], box);
});

test('a ray meets a sphere where three\'s did', () => {
  const sphere = new Mesh(threeSphere(), new UnlitMaterial());
  sphere.position.set(2, 1, -3);
  const ray = new Raycaster(new Vec3(-1, 0.5, 2), new Vec3(3, 0.6, -5.2).normalize());
  sameHits(ray.intersectObject(sphere), [{
    distance: 4.912373487, point: [1.442653931, 0.988530786, -2.233933481], faceIndex: 42, corners: [29, 28, 38],
    faceNormal: [-0.371470391, -0.240299223, 0.896808805],
  }], sphere);
});

test('a ray meets an instanced mesh\'s instances, each hit naming its instance', () => {
  const boxes = new InstancedMesh(threeBox(), new UnlitMaterial(), 3);
  const m = new Mat4();
  boxes.setMatrixAt(0, m.makeTranslation(0, 0, -4));
  const turn = new Quat().setFromEuler(new Euler(0, 0.5, 0));
  boxes.setMatrixAt(1, m.compose(new Vec3(0.5, 0, -10), turn, new Vec3(1, 2, 1)));
  boxes.setMatrixAt(2, m.makeTranslation(5, 0, -4));
  boxes.position.set(0, 0.2, 0);
  sameHits(forward().intersectObject(boxes), [
    { distance: 3, point: [0, 0, -3], faceIndex: 9, corners: [18, 19, 17], faceNormal: [0, 0, 1], uv: [0.5, 0.4],
      normal: [0, 0, 1], instanceId: 0 },
    { distance: 8.829414254, point: [0, 0, -8.829414254], faceIndex: 3, corners: [6, 7, 5], faceNormal: [-1, 0, 0],
      uv: [0.893786429, 0.45], normal: [-1, 0, 0], instanceId: 1 },
  ], boxes);
});

test('a ray meets a mesh under a turned and scaled parent, through the parent', () => {
  const parent = new Node();
  parent.position.set(1, 0, -2);
  parent.rotation.y = 0.7;
  parent.scale.set(2, 1, 0.5);
  const child = new Mesh(threeBox(), new UnlitMaterial({ side: DoubleSide }));
  child.position.set(0, 0.1, -4);
  parent.add(child);
  const ray = new Raycaster(new Vec3(0, 0, 0), new Vec3(0.1, 0, -1).normalize());
  sameHits(ray.intersectObjects([parent]), [
    { distance: 3.422750518, point: [0.340576406, 0, -3.405764058], faceIndex: 9, corners: [18, 19, 17],
      faceNormal: [0, 0, 1], uv: [0.600315772, 0.45], normal: [0, 0, 1] },
    { distance: 4.857585277, point: [0.4833478, 0, -4.833478005], faceIndex: 10, corners: [20, 22, 21],
      faceNormal: [0, 0, -1], uv: [0.142445188, 0.45], normal: [0, 0, 1] },
  ], child);
  assert.equal(ray.intersectObjects([parent], false).length, 0, 'the parent alone draws nothing');
  ray.layers.set(2);
  assert.equal(ray.intersectObjects([parent]).length, 0, 'a ray on another layer meets nothing');
});

test('a node whose raycast returns false keeps the ray from what\'s under it', () => {
  const box = turnedBox();
  const cover = new Node() as Node & { raycast(): boolean };
  cover.raycast = () => false;
  cover.add(box);
  assert.equal(forward().intersectObject(cover).length, 0);
});
