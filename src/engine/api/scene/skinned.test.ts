// A skinned mesh's point moved by a vertex's bones (`applyBoneTransform`), against numbers worked by hand: a bone
// that hasn't moved leaves the point where it's bound, one that has carries it by its weight.
import { test } from 'node:test';
import { Attribute, Geometry } from '../geometry/index.ts';
import { Vec3 } from '../math/index.ts';
import { Bone, Skeleton, SkinnedMesh } from './skinned.ts';
import { near } from './testing.ts';

/** A mesh of one vertex at (1, 0, 0) on two bones at the origin, weighed `first` and `1 - first`. */
function twoBones(first: number): { mesh: SkinnedMesh; bones: Bone[] } {
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(new Float32Array([1, 0, 0]), 3));
  geometry.setAttribute('skinIndex', new Attribute(new Float32Array([0, 1, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new Attribute(new Float32Array([first, 1 - first, 0, 0]), 4));
  const bones = [new Bone(), new Bone()];
  const mesh = new SkinnedMesh(geometry);
  mesh.add(bones[0], bones[1]);
  mesh.bind(new Skeleton(bones));
  return { mesh, bones };
}

test('a point on bones that never moved stays where it was bound', () => {
  const { mesh } = twoBones(0.5);
  near(mesh.applyBoneTransform(0, new Vec3(1, 0, 0)).toArray(), [1, 0, 0], 1e-9);
});

test('a bone moved carries the point by its weight alone', () => {
  const { mesh, bones } = twoBones(0.25);
  bones[1].position.set(0, 2, 0);
  // (the second bone's 0.75 of a 2 m lift, the first's 0.25 of none)
  near(mesh.applyBoneTransform(0, new Vec3(1, 0, 0)).toArray(), [1, 1.5, 0], 1e-9);
});

test('a bone turned a quarter about z turns its share of the point with it', () => {
  const { mesh, bones } = twoBones(0);
  bones[1].rotation.z = Math.PI / 2;
  near(mesh.applyBoneTransform(0, new Vec3(1, 0, 0)).toArray(), [0, 1, 0], 1e-9);
});
