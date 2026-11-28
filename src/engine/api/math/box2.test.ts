// Box2's tests: values worked by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box2 } from './box2.ts';
import { Vec2 } from './vec2.ts';

test('a new box is empty, and a point grows it to the point', () => {
  const box = new Box2();
  assert.equal(box.isEmpty(), true);
  box.expandByPoint(new Vec2(2, -1));
  assert.equal(box.isEmpty(), false);
  assert.deepEqual(box.getSize(new Vec2()).toArray(), [0, 0]);
});

test('the box round points has their middle and size', () => {
  const box = new Box2().setFromPoints([new Vec2(-1, 2), new Vec2(3, 4), new Vec2(1, 0)]);
  assert.deepEqual(box.getCenter(new Vec2()).toArray(), [1, 2]);
  assert.deepEqual(box.getSize(new Vec2()).toArray(), [4, 4]);
  assert.equal(box.containsPoint(new Vec2(3, 0)), true);
  assert.equal(box.containsPoint(new Vec2(3.1, 0)), false);
});

test('two boxes share what overlaps, and nothing where they part', () => {
  const left = new Box2(new Vec2(0, 0), new Vec2(2, 2));
  const right = new Box2(new Vec2(1, 1), new Vec2(3, 3));
  assert.equal(left.intersectsBox(right), true);
  const shared = left.clone().intersect(right);
  assert.deepEqual([shared.min.toArray(), shared.max.toArray()], [[1, 1], [2, 2]]);
  const apart = new Box2(new Vec2(5, 5), new Vec2(6, 6));
  assert.equal(left.intersectsBox(apart), false);
  assert.equal(left.clone().intersect(apart).isEmpty(), true);
  const both = left.clone().union(apart);
  assert.deepEqual([both.min.toArray(), both.max.toArray()], [[0, 0], [6, 6]]);
});
