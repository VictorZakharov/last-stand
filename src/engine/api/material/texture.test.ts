// The textures against three 0.187's defaults (read off its source once), clone and dispose.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  ClampToEdgeWrapping, FloatType, LinearFilter, LinearMipmapLinearFilter, NearestFilter, NoColorSpace, RedFormat,
  RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType,
} from './constants.ts';
import { CanvasTexture, DataTexture, Texture, VolumeTexture } from './texture.ts';

test('a texture has three\'s defaults', () => {
  const t = new Texture();
  assert.equal(t.image, null);
  assert.equal(t.wrapS, ClampToEdgeWrapping);
  assert.equal(t.wrapT, ClampToEdgeWrapping);
  assert.equal(t.magFilter, LinearFilter);
  assert.equal(t.minFilter, LinearMipmapLinearFilter);
  assert.equal(t.generateMipmaps, true);
  assert.equal(t.anisotropy, 1);
  assert.equal(t.colorSpace, NoColorSpace);
  assert.equal(t.flipY, true);
  assert.equal(t.format, RGBAFormat);
  assert.equal(t.type, UnsignedByteType);
  assert.equal(t.unpackAlignment, 4);
  assert.deepEqual([t.repeat.x, t.repeat.y, t.offset.x, t.offset.y, t.rotation], [1, 1, 0, 0, 0]);
  assert.equal(t.version, 0);
  assert.equal(t.isTexture, true);
});

test('a data texture is read nearest, unflipped, with no smaller levels', () => {
  const data = new Float32Array(8);
  const t = new DataTexture(data, 2, 1, RedFormat, FloatType);
  assert.deepEqual(t.image, { data, width: 2, height: 1 });
  assert.equal(t.format, RedFormat);
  assert.equal(t.type, FloatType);
  assert.equal(t.magFilter, NearestFilter);
  assert.equal(t.minFilter, NearestFilter);
  assert.equal(t.generateMipmaps, false);
  assert.equal(t.flipY, false);
  assert.equal(t.unpackAlignment, 1);
  assert.equal(t.version, 0);
  assert.deepEqual(new DataTexture().image, { data: null, width: 1, height: 1 });
});

test('a volume texture has its depth and is clamped on every axis', () => {
  const data = new Uint8Array(24);
  const t = new VolumeTexture(data, 2, 3, 4);
  assert.deepEqual(t.image, { data, width: 2, height: 3, depth: 4 });
  assert.equal(t.wrapR, ClampToEdgeWrapping);
  assert.equal(t.magFilter, NearestFilter);
  assert.equal(t.flipY, false);
  t.wrapR = RepeatWrapping;
  assert.equal(t.clone().wrapR, RepeatWrapping);
});

test('a canvas texture is marked to be handed over', () => {
  const canvas = { width: 4, height: 4 } as unknown as HTMLCanvasElement;
  const t = new CanvasTexture(canvas);
  assert.equal(t.image, canvas);
  assert.equal(t.version, 1);
  assert.equal(t.isCanvasTexture, true);
});

test('a clone shares its picture and copies the rest', () => {
  const t = new DataTexture(new Uint8Array(4));
  t.colorSpace = SRGBColorSpace;
  t.repeat.set(3, 2);
  t.name = 'soil';
  t.userData.kept = true;
  const c = t.clone();
  assert.ok(c instanceof DataTexture);
  assert.notEqual(c.id, t.id);
  assert.notEqual(c.uuid, t.uuid);
  assert.equal(c.image, t.image);
  assert.equal(c.colorSpace, SRGBColorSpace);
  assert.notEqual(c.repeat, t.repeat);
  assert.deepEqual([c.repeat.x, c.repeat.y], [3, 2]);
  assert.equal(c.name, 'soil');
  assert.deepEqual(c.userData, { kept: true });
  assert.equal(c.version, 1);
});

test('dispose runs its hooks', () => {
  const t = new Texture();
  let runs = 0;
  t.onDispose(() => runs++);
  t.dispose();
  assert.equal(runs, 1);
});
