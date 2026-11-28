// A material's version: moved by every change to how it's drawn, through a field, a watched colour or vector, or a
// map assigned; never by a store of the value it holds.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Color, Vec2 } from '../math/index.ts';
import { DoubleSide } from './constants.ts';
import { LitMaterial } from './lit.ts';
import { DataTexture, Texture } from './texture.ts';
import { SpriteMaterial } from './unlit.ts';

/** How far `change` moves `material`'s version. */
function moves(material: { version: number }, change: () => void): number {
  const before = material.version;
  change();
  return material.version - before;
}

test('a field moves the version when its value changes, not when it\'s stored again', () => {
  const m = new LitMaterial();
  assert.equal(moves(m, () => { m.roughness = 0.5; }), 1);
  assert.equal(moves(m, () => { m.roughness = 0.5; }), 0);
  assert.equal(moves(m, () => { m.side = DoubleSide; }), 1);
  assert.equal(moves(m, () => { m.transparent = false; }), 0);
  assert.equal(moves(m, () => { m.opacity = 0.4; }), 1);
  const sprite = new SpriteMaterial();
  assert.equal(moves(sprite, () => { sprite.rotation = 1; }), 1);
});

test('the colour\'s setHex, copy, lerp and a field each move it', () => {
  const m = new LitMaterial();
  assert.ok(moves(m, () => m.color.setHex(0x336699)) > 0);
  assert.equal(moves(m, () => m.color.setHex(0x336699)), 0);
  assert.ok(moves(m, () => m.emissive.copy(new Color(0.5, 0.25, 0))) > 0);
  assert.equal(moves(m, () => m.emissive.copy(new Color(0.5, 0.25, 0))), 0);
  assert.ok(moves(m, () => m.color.lerp(new Color(1, 1, 1), 0.5)) > 0);
  assert.ok(moves(m, () => m.sheenColor.multiplyScalar(2).setHex(0xff0000)) > 0);
  assert.equal(moves(m, () => { m.emissive.r = 0.5; }), 0);
  assert.equal(moves(m, () => { m.emissive.g = 1; }), 1);
});

test('a colour assigned is copied into the watched one', () => {
  const m = new LitMaterial();
  const watched = m.color;
  const given = new Color(0.1, 0.2, 0.3);
  assert.ok(moves(m, () => { m.color = given; }) > 0);
  assert.equal(m.color, watched);
  assert.notEqual(m.color, given);
  assert.equal(m.color.g, 0.2);
  assert.ok(moves(m, () => { m.emissive = 0xffffff; }) > 0);
});

test('normalScale\'s set, copy and fields each move it', () => {
  const m = new LitMaterial();
  assert.ok(moves(m, () => m.normalScale.set(2, 2)) > 0);
  assert.equal(moves(m, () => m.normalScale.set(2, 2)), 0);
  assert.ok(moves(m, () => m.normalScale.copy(new Vec2(1, 3))) > 0);
  assert.equal(moves(m, () => { m.normalScale.y = 4; }), 1);
  assert.ok(moves(m, () => { m.normalScale = new Vec2(0, 0); }) > 0);
});

test('a map assigned moves it; the map\'s own changes are the map\'s version', () => {
  const m = new LitMaterial();
  const map = new Texture();
  assert.equal(moves(m, () => { m.map = map; }), 1);
  assert.equal(moves(m, () => { m.map = map; }), 0);
  assert.equal(moves(m, () => { m.normalMap = map; }), 1);
  assert.equal(moves(m, () => { map.needsUpdate = true; }), 0);
  assert.equal(map.version, 1);
  assert.equal(moves(m, () => { m.map = null; }), 1);
});

test('needsUpdate moves it whatever changed; false does nothing', () => {
  const m = new LitMaterial();
  assert.equal(moves(m, () => { m.needsUpdate = true; }), 1);
  assert.equal(moves(m, () => { m.needsUpdate = false; }), 0);
});

test('a clone starts where its source was set, and copy moves it only by what differs', () => {
  const m = new LitMaterial({ color: 0x224466, roughness: 0.2, map: new DataTexture() });
  const c = m.clone();
  assert.ok(c.version > 0);
  assert.equal(moves(c, () => c.copy(m)), 0);
  m.metalness = 1;
  assert.equal(moves(c, () => c.copy(m)), 1);
});

test('a texture\'s version moves by needsUpdate and copy alone', () => {
  const map = new Texture();
  assert.equal(map.version, 0);
  map.repeat.set(2, 2);
  map.wrapS = 1000;
  assert.equal(map.version, 0);
  map.needsUpdate = true;
  assert.equal(map.version, 1);
  assert.equal(map.clone().version, 1);
});
