// `Color` against three 0.187's numbers (read once, said where): sRGB in, linear held, sRGB out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, linearToSrgb, srgbToLinear } from './color.ts';
import type { HSL } from './color.ts';
import { assertNear } from './testing.ts';

/** three 0.187's `new Color(0xff8800).toArray()` */
const ORANGE = [1, 0.24620132669705552, 0];

/** an empty HSL to write into */
function hsl(): HSL {
  return { h: 0, s: 0, l: 0 };
}

test('hex and CSS are sRGB, held linear (read off three 0.187)', () => {
  assertNear(new Color(0xff8800).toArray(), ORANGE);
  assertNear(new Color('#ff8800').toArray(), ORANGE);
  assertNear(new Color('#f80').toArray(), ORANGE);
  assertNear(new Color('rgb(255, 136, 0)').toArray(), ORANGE);
  assertNear(new Color('rgba(255,136,0,0.5)').toArray(), ORANGE);
  const tan = [0.6444796819634361, 0.45641102317066595, 0.26225065751888765];
  assertNear(new Color('tan').toArray(), tan);
  assertNear(new Color('Tan').toArray(), tan);
  const fromHsl = [0.03310476656515207, 0.18447499449003002, 0.31854677811435367];
  assertNear(new Color('hsl(200, 50%, 40%)').toArray(), fromHsl);
});

test('out again as sRGB: hex, its string, CSS (read off three 0.187)', () => {
  const orange = new Color(0xff8800);
  assert.equal(orange.getHex(), 0xff8800);
  assert.equal(orange.getHexString(), 'ff8800');
  assert.equal(orange.getStyle(), 'rgb(255,136,0)');
  assert.equal(new Color(0x000102).getHexString(), '000102');
  assert.equal(new Color().setHex(0x336699, 'srgb-linear').getHex('srgb-linear'), 0x336699);
  assert.equal(new Color(2, -1, 0.5).getHex('srgb-linear'), 0xff0080);
  assert.equal(new Color(1, 0.5, 0).getStyle('srgb-linear'), 'color(srgb-linear 1.000 0.500 0.000)');
});

test('HSL in the working space unless said (read off three 0.187)', () => {
  const orange = new Color(0xff8800);
  const linear = orange.getHSL(hsl());
  assertNear([linear.h, linear.s, linear.l], [0.041033554449509256, 1, 0.5]);
  const srgb = orange.getHSL(hsl(), 'srgb');
  assertNear([srgb.h, srgb.s, srgb.l], [0.08888980512620258, 1, 0.5]);
  assertNear(new Color().setHSL(1 / 3, 1, 0.5).toArray(), [0, 1, 0]);
  assertNear(new Color().setHSL(0.5, 0, 0.25).toArray(), [0.25, 0.25, 0.25]);
  const back = new Color().setHSL(srgb.h, srgb.s, srgb.l, 'srgb');
  // within 1e-5 alone: three's linear-to-sRGB curve takes 0.41666 for 1 / 2.4
  assertNear(back.toArray(), ORANGE, 1e-5);
});

test('the transfer curves undo each other', () => {
  for (const component of [0, 0.002, 0.04, 0.2, 0.5, 1]) {
    assertNear([srgbToLinear(linearToSrgb(component))], [component], 1e-4);
  }
  const color = new Color(0.2, 0.4, 0.6);
  assertNear(color.clone().convertLinearToSRGB().convertSRGBToLinear().toArray(), [0.2, 0.4, 0.6], 1e-4);
  assertNear(new Color().copySRGBToLinear(new Color(1, 0, 0.5)).toArray(), [1, 0, srgbToLinear(0.5)]);
  assertNear(new Color().copyLinearToSRGB(new Color(1, 0, 0.5)).toArray(), [1, 0, linearToSrgb(0.5)]);
});

test('arithmetic in place, chainable', () => {
  const color = new Color(0.5, 0.25, 0);
  assert.equal(color.multiplyScalar(2), color);
  assertNear(color.toArray(), [1, 0.5, 0]);
  assertNear(color.clone().add(new Color(0, 0.5, 1)).toArray(), [1, 1, 1]);
  assertNear(color.clone().addScalar(0.5).toArray(), [1.5, 1, 0.5]);
  assertNear(color.clone().multiply(new Color(0.5, 0.5, 0.5)).toArray(), [0.5, 0.25, 0]);
  assertNear(color.clone().lerp(new Color(0, 0, 1), 0.5).toArray(), [0.5, 0.25, 0.5]);
  assertNear(new Color().lerpColors(new Color(0, 0, 0), new Color(1, 1, 1), 0.25).toArray(), [0.25, 0.25, 0.25]);
  assertNear(new Color().setScalar(0.3).toArray(), [0.3, 0.3, 0.3]);
  const red = new Color(1, 0, 0);
  assertNear(red.clone().lerpHSL(new Color(0, 0, 1), 0.5).toArray(), [0, 1, 0], 1e-15);
  assertNear(red.clone().offsetHSL(1 / 3, 0, 0).toArray(), [0, 1, 0], 1e-15);
});

test('set, copy, arrays, flags', () => {
  const color = new Color();
  assertNear(color.toArray(), [1, 1, 1]);
  assertNear(color.set(0xff8800).toArray(), ORANGE);
  assertNear(color.set('#000000').toArray(), [0, 0, 0]);
  assertNear(color.set(new Color(0.1, 0.2, 0.3)).toArray(), [0.1, 0.2, 0.3]);
  assertNear(color.set(0.4, 0.5, 0.6).toArray(), [0.4, 0.5, 0.6]);
  assertNear(new Color(color).toArray(), [0.4, 0.5, 0.6]);
  assert.ok(new Color().copy(color).equals(color) && color.clone().equals(color));
  assert.deepEqual(new Color().fromArray([9, 0.1, 0.2, 0.3], 1).toArray([0, 0, 0, 0], 1), [0, 0.1, 0.2, 0.3]);
  assert.equal(color.isColor, true);
  const warn = console.warn;
  console.warn = () => {};
  assertNear(color.setStyle('not a colour').toArray(), [0.4, 0.5, 0.6]);
  console.warn = warn;
});
