// What a swung weapon's trail is measured with (page/sweptArea.ts): the quads it swept cut to the camera's near
// plane, the curve it moved along between frames, a point's distance to a segment on the screen, and the pixels one
// draw lit that another didn't.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipNear, curveAt, distanceToSegment, litBetween } from '../page/sweptArea.ts';

const NEAR = 0.1;
const point = (x, y, z) => ({ x, y, z });

test('a quad all ahead of the camera is kept whole', () => {
  const quad = [point(0, 0, -1), point(1, 0, -1), point(1, 1, -2), point(0, 1, -2)];
  assert.deepEqual(clipNear(quad, NEAR), quad);
});

test('a quad all behind the camera is gone', () => {
  const quad = [point(0, 0, 1), point(1, 0, 1), point(1, 1, 2), point(0, 1, 2)];
  assert.deepEqual(clipNear(quad, NEAR), []);
});

test('a quad across the near plane ends on it', () => {
  // (from 1 m ahead to 1 m behind: cut where it's NEAR ahead)
  const quad = [point(0, 0, -1), point(1, 0, -1), point(1, 0, 1), point(0, 0, 1)];
  const clipped = clipNear(quad, NEAR);
  assert.equal(clipped.length, 4);
  for (const kept of clipped) assert.ok(-kept.z >= NEAR - 1e-9, `${kept.z} is behind the near plane`);
  const cut = clipped.filter((kept) => Math.abs(kept.z + NEAR) < 1e-9);
  assert.equal(cut.length, 2);
  for (const each of cut) assert.ok(Math.abs(each.y) < 1e-9);
});

test('a triangle with one corner behind becomes a quad', () => {
  const triangle = [point(0, 0, -2), point(2, 0, -2), point(1, 0, 2)];
  assert.equal(clipNear(triangle, NEAR).length, 4);
});

test('a point beside a segment is as far as its square from it', () => {
  assert.equal(distanceToSegment(5, 3, 0, 0, 10, 0), 3);
});

test('a point past a segment\'s end is as far as that end', () => {
  assert.equal(distanceToSegment(13, 4, 0, 0, 10, 0), 5);
});

test('a segment of no length is its point', () => {
  assert.equal(distanceToSegment(3, 4, 0, 0, 0, 0), 5);
});

/** Pixels from their channels (red, green, blue each), opaque. */
function pixelsOf(...colours) {
  return Uint8Array.from(colours.flatMap((colour) => [...colour, 255]));
}

test('the pixels lit are those risen enough in any channel, each by how much, and the most', () => {
  const plain = pixelsOf([10, 10, 10], [10, 10, 10], [10, 10, 10], [200, 200, 200]);
  const shown = pixelsOf([10, 10, 10], [10, 40, 10], [25, 10, 10], [180, 255, 200]);
  assert.deepEqual(litBetween(shown, plain, 20), { pixels: [1, 3], rises: [30, 55], most: 55 });
});

test('a darker pixel is never lit', () => {
  const plain = pixelsOf([100, 100, 100]);
  const shown = pixelsOf([0, 0, 0]);
  assert.deepEqual(litBetween(shown, plain, 1), { pixels: [], rises: [], most: 0 });
});

const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-9;

test('a curve through four places goes through the middle two', () => {
  const places = [point(0, 0, 0), point(1, 0, 0), point(2, 1, 0), point(3, 3, 0)];
  assert.ok(near(curveAt(...places, 0), places[1]));
  assert.ok(near(curveAt(...places, 1), places[2]));
});

test('a curve through places round a circle stays near it, where the line between them cuts inside', () => {
  // (a blade's tip round the eyes, 80 degrees a frame)
  const step = 80 * Math.PI / 180;
  const places = [0, 1, 2, 3].map((i) => point(Math.cos(i * step), Math.sin(i * step), 0));
  const middle = curveAt(...places, 0.5);
  const chord = point((places[1].x + places[2].x) / 2, (places[1].y + places[2].y) / 2, 0);
  const off = (p) => Math.abs(Math.hypot(p.x, p.y) - 1);
  assert.ok(off(middle) < 0.1, `the curve is ${off(middle)} off the circle`);
  assert.ok(off(chord) > 0.2, `the chord is ${off(chord)} off it`);
});

test('a curve with its end places doubled (the first and last frames) is still whole', () => {
  const a = point(0, 0, 0);
  const b = point(1, 0, 0);
  const middle = curveAt(a, a, b, b, 0.5);
  assert.ok(near(middle, point(0.5, 0, 0)), JSON.stringify(middle));
});
