// The materials against three 0.187's defaults (read off its source once), their parameters objects, clone and copy.
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Color, Vec2 } from '../math/index.ts';
import {
  AdditiveBlending, BackSide, DoubleSide, FrontSide, NormalBlending, OneMinusSrcAlphaFactor, SrcAlphaFactor,
} from './constants.ts';
import { LitMaterial } from './lit.ts';
import { LookMaterial } from './look.ts';
import { Material } from './material.ts';
import { DataTexture, Texture } from './texture.ts';
import { LineMaterial, PointsMaterial, SpriteMaterial, UnlitMaterial } from './unlit.ts';

const near = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual}`);

test('every material has three\'s defaults', () => {
  const m = new Material();
  assert.equal(m.opacity, 1);
  assert.equal(m.transparent, false);
  assert.equal(m.alphaTest, 0);
  assert.equal(m.side, FrontSide);
  assert.equal(m.blending, NormalBlending);
  assert.equal(m.blendSrc, SrcAlphaFactor);
  assert.equal(m.blendDst, OneMinusSrcAlphaFactor);
  assert.equal(m.depthWrite, true);
  assert.equal(m.depthTest, true);
  assert.equal(m.colorWrite, true);
  assert.equal(m.polygonOffset, false);
  assert.equal(m.visible, true);
  assert.equal(m.vertexColors, false);
  assert.equal(m.version, 0);
  assert.equal(m.isMaterial, true);
  assert.deepEqual(m.userData, {});
});

test('a lit material has MeshStandardMaterial\'s and MeshPhysicalMaterial\'s defaults', () => {
  const m = new LitMaterial();
  assert.deepEqual([m.color.r, m.color.g, m.color.b], [1, 1, 1]);
  assert.deepEqual([m.emissive.r, m.emissive.g, m.emissive.b], [0, 0, 0]);
  assert.deepEqual([m.sheenColor.r, m.sheenColor.g, m.sheenColor.b], [0, 0, 0]);
  assert.deepEqual([m.normalScale.x, m.normalScale.y], [1, 1]);
  assert.equal(m.roughness, 1);
  assert.equal(m.metalness, 0);
  assert.equal(m.emissiveIntensity, 1);
  assert.equal(m.bumpScale, 1);
  assert.equal(m.sheenRoughness, 1);
  assert.equal(m.clearcoat, 0);
  assert.equal(m.envMapIntensity, 1);
  assert.equal(m.specularIntensity, 1);
  assert.equal(m.map, null);
  assert.equal(m.fog, true);
  assert.equal(m.version, 0);
  assert.equal(m.type, 'LitMaterial');
});

test('the unlit, points, sprite and line materials have three\'s defaults', () => {
  const sprite = new SpriteMaterial();
  assert.equal(sprite.transparent, true);
  assert.equal(sprite.rotation, 0);
  assert.equal(sprite.sizeAttenuation, true);
  const points = new PointsMaterial();
  assert.equal(points.size, 1);
  assert.equal(points.transparent, false);
  assert.equal(new UnlitMaterial().color.r, 1);
  assert.equal(new LineMaterial().map, null);
  assert.equal(sprite.version, 0);
});

test('a look material has ShaderMaterial\'s defaults and takes its uniforms as given', () => {
  const uniforms = { uScale: { value: 400 } };
  const m = new LookMaterial({ uniforms, transparent: true, depthWrite: false });
  assert.equal(m.uniforms, uniforms);
  assert.equal(m.uniforms.uScale.value, 400);
  assert.equal(m.fog, false);
  assert.equal(m.forceSinglePass, true);
  assert.equal(m.transparent, true);
  assert.equal(m.depthWrite, false);
  assert.deepEqual(m.defines, {});
  assert.equal(m.version, 0);
});

test('the parameters object: colours from sRGB numbers and strings, Color objects copied', () => {
  const tint = new Color(0.25, 0.5, 0.75);
  const m = new LitMaterial({ color: 0xff0000, emissive: tint, sheenColor: '#00ff00', roughness: 0.8 });
  near(m.color.r, 1);
  near(m.color.g, 0);
  near(m.sheenColor.g, 1);
  assert.equal(m.roughness, 0.8);
  assert.notEqual(m.emissive, tint);
  assert.deepEqual([m.emissive.r, m.emissive.g, m.emissive.b], [0.25, 0.5, 0.75]);
  tint.r = 0;
  assert.equal(m.emissive.r, 0.25);
  const half = new Color(0x808080);
  const grey = new LitMaterial({ color: 0x808080 });
  near(grey.color.r, half.r);
  assert.equal(m.version, 0);
});

test('the parameters object: a vector copied, a map shared, an unknown key left out', () => {
  const scale = new Vec2(0.5, 2);
  const map = new Texture();
  const m = new LitMaterial({ normalScale: scale, map, side: DoubleSide });
  assert.notEqual(m.normalScale, scale);
  assert.deepEqual([m.normalScale.x, m.normalScale.y], [0.5, 2]);
  assert.equal(m.map, map);
  assert.equal(m.side, DoubleSide);
  const warn = console.warn;
  const warned: unknown[] = [];
  console.warn = (...args: unknown[]) => warned.push(args);
  try {
    m.setValues({ nothing: 1 } as never);
  } finally {
    console.warn = warn;
  }
  assert.equal(warned.length, 1);
  assert.equal((m as unknown as Record<string, unknown>).nothing, undefined);
});

test('a clone has everything, its colours its own and its maps shared', () => {
  const map = new DataTexture(new Uint8Array(4));
  const m = new LitMaterial({ color: 0x336699, map, roughness: 0.3, blending: AdditiveBlending, side: BackSide });
  m.name = 'stone';
  m.userData.litMost = 2;
  const c = m.clone();
  assert.ok(c instanceof LitMaterial);
  assert.notEqual(c.id, m.id);
  assert.notEqual(c.uuid, m.uuid);
  assert.notEqual(c.color, m.color);
  assert.equal(c.color.r, m.color.r);
  assert.equal(c.map, map);
  assert.equal(c.roughness, 0.3);
  assert.equal(c.blending, AdditiveBlending);
  assert.equal(c.side, BackSide);
  assert.equal(c.name, 'stone');
  assert.deepEqual(c.userData, { litMost: 2 });
  assert.notEqual(c.userData, m.userData);
  c.color.setHex(0xffffff);
  assert.notEqual(m.color.r, 1);
});

test('a look material\'s clone copies its uniforms, sharing their textures', () => {
  const map = new Texture();
  const tint = new Color(1, 0, 0);
  const m = new LookMaterial({ uniforms: { uFill: { value: tint }, uMap: { value: map }, uList: { value: [1, 2] } } });
  m.defines.FAST = 1;
  const c = m.clone();
  assert.notEqual(c.uniforms, m.uniforms);
  assert.notEqual(c.uniforms.uFill.value, tint);
  assert.equal((c.uniforms.uFill.value as Color).r, 1);
  assert.equal(c.uniforms.uMap.value, map);
  assert.notEqual(c.uniforms.uList.value, m.uniforms.uList.value);
  assert.deepEqual(c.defines, { FAST: 1 });
  assert.notEqual(c.defines, m.defines);
});

test('dispose runs its hooks until they are taken off', () => {
  const m = new UnlitMaterial();
  let runs = 0;
  const off = m.onDispose(() => runs++);
  m.dispose();
  m.dispose();
  off();
  m.dispose();
  assert.equal(runs, 2);
});
