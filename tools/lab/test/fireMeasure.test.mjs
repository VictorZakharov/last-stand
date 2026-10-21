// The fire's measures (page/fireMeasure.ts): its light alone, its size and bands, how it moves, and seen from behind
// whether it turns with the camera (a flame is its own mirror from behind; a sheet turned to the camera is not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  changeBetween, correlationOf, detailIn, frameStats, medianOf, mirroredOf, strongestFrequency, swingOf, turningOf,
} from '../page/fireMeasure.ts';

const WIDTH = 32;
const HEIGHT = 48;

/** A picture as `ImageData` has it (only its size and pixels are read), every pixel `rgb` (0-255) where `lit`. */
function picture(lit, rgb) {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) {
    const shown = lit(pixel % WIDTH, Math.floor(pixel / WIDTH));
    data.set(shown ? rgb : [0, 0, 0], pixel * 4);
    data[pixel * 4 + 3] = 255;
  }
  return { width: WIDTH, height: HEIGHT, data };
}

const black = () => picture(() => false, [0, 0, 0]);

/** A flame of light alone, a share of white a pixel: lumps scattered off its axis, none mirrored. */
function lumpyFlame() {
  const light = new Float32Array(WIDTH * HEIGHT);
  const lumps = [[9, 12], [20, 18], [13, 30], [24, 36], [6, 40], [17, 8]];
  for (let pixel = 0; pixel < light.length; pixel++) {
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    for (const [lumpX, lumpY] of lumps) light[pixel] += Math.exp(-((x - lumpX) ** 2 + (y - lumpY) ** 2) / 6);
  }
  return light;
}

test('a fire drawn over nothing is its light alone, its extent where it is lit', () => {
  const shown = picture((x, y) => x >= 10 && x < 20 && y >= 5 && y < 40, [255, 140, 20]);
  const stats = frameStats({ shown, hidden: black(), bare: black() });
  assert.deepEqual(stats.extent, { top: 5, bottom: 39, left: 10, right: 19 });
  assert.equal(stats.lit, 350);
  assert.equal(stats.bands.length, 4);
  // (its hue is its light's: encoded 255, 140, 20 is 1, 0.27, 0.006 of white, 16°)
  assert.ok(stats.bands.every((band) => Math.abs(band.hue - 16) < 1), 'an orange fire reads its light\'s hue');
  assert.equal(stats.white, 0);
});

test('a fire drawn white throughout is all white', () => {
  const shown = picture((x, y) => x >= 10 && x < 20 && y >= 5 && y < 40, [255, 255, 255]);
  assert.equal(frameStats({ shown, hidden: black(), bare: black() }).white, 1);
});

test('what is drawn without the fire too is none of its light', () => {
  const both = picture((x) => x < 16, [120, 120, 120]);
  const stats = frameStats({ shown: both, hidden: both, bare: both });
  assert.equal(stats.extent, null);
  assert.equal(stats.lit, 0);
});

test('a light that never changes moved none of itself; one moved away moved all of it', () => {
  const light = lumpyFlame();
  assert.equal(changeBetween(light, light), 0);
  const moved = new Float32Array(light.length);
  moved[0] = 1;
  assert.ok(changeBetween(light, moved) > 0.9);
});

test('a swing at 1.5 Hz is found at 1.5 Hz', () => {
  const step = 1 / 30;
  const values = Array.from({ length: 60 }, (_, at) => 1 + 0.2 * Math.sin(2 * Math.PI * 1.5 * at * step));
  const strongest = strongestFrequency(values, step);
  assert.ok(Math.abs(strongest.hz - 1.5) < 0.01, `found at ${strongest.hz} Hz`);
  assert.ok(strongest.share > 0.9);
  assert.ok(Math.abs(swingOf(values) - 0.2 / Math.SQRT2) < 0.01);
});

test('the median is the middle value, the lower of two middles', () => {
  assert.equal(medianOf([5, 1, 3]), 3);
  assert.equal(medianOf([4, 1, 3, 2]), 2);
  assert.equal(medianOf([]), 0);
});

test('a picture mirrored twice is itself, its rows kept', () => {
  const light = lumpyFlame();
  const mirrored = mirroredOf(light, WIDTH);
  assert.equal(mirrored[0], light[WIDTH - 1]);
  assert.equal(mirrored[WIDTH], light[2 * WIDTH - 1]);
  assert.deepEqual(mirroredOf(mirrored, WIDTH), light);
});

test('an even light has no detail', () => {
  const even = new Float32Array(WIDTH * HEIGHT).fill(0.4);
  assert.ok(detailIn(even, WIDTH, 2).every((value) => Math.abs(value) < 1e-6));
});

test('a light is alike itself, unlike its opposite, and nothing like a flat one', () => {
  const light = lumpyFlame();
  assert.ok(Math.abs(correlationOf(light, light) - 1) < 1e-6);
  assert.ok(Math.abs(correlationOf(light, light.map((value) => -value)) + 1) < 1e-6);
  assert.equal(correlationOf(light, new Float32Array(light.length)), 0);
});

test('flames whose far side is their near side\'s mirror do not turn with the camera', () => {
  const front = lumpyFlame();
  const turning = turningOf(front, mirroredOf(front, WIDTH), WIDTH);
  assert.ok(turning.mirrored > 0.99, `mirrored ${turning.mirrored}`);
  assert.ok(turning.unmirrored < turning.mirrored - 0.5, `unmirrored ${turning.unmirrored}`);
});

test('flames showing the same face from behind turn with the camera', () => {
  const front = lumpyFlame();
  const turning = turningOf(front, front, WIDTH);
  assert.ok(turning.unmirrored > 0.99);
  assert.ok(turning.mirrored < turning.unmirrored);
  assert.ok(turning.even < 0.5, `uneven flames read ${turning.even} alike their mirror`);
});

test('flames as even both ways as their mirror are their own mirror', () => {
  const front = lumpyFlame();
  const mirrored = mirroredOf(front, WIDTH);
  const even = front.map((light, pixel) => light + mirrored[pixel]);
  assert.ok(turningOf(even, even, WIDTH).even > 0.99);
});
