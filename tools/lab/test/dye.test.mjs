// Dye is a live uniform change, including skinned copies; restoring native colour must leave fittings alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Geometry, LitMaterial, Mesh, Node } from '../../../src/engine/api/index.ts';
import { Dye } from '../../../src/entities/models/dye.ts';
import { HERO_COLOURS } from '../../../src/data/heroColours.ts';

/** `material` marked a kit material as the kit marks one (`kitLooks.shade`, shared by its copies: models/kitTwin.ts);
 *  its copies are `copyOfKit`'s. */
function asKit(material) {
  material.kitLooks = { shade: {}, rim: { value: null } };
  return material;
}

/** A copy of the kit material `material`, sharing its mark as the kit's copies do. */
function copyOfKit(material) {
  const copy = material.clone();
  copy.kitLooks = material.kitLooks;
  return copy;
}

test('every colour dyes only registered materials and copies, and leaves the rest untouched', () => {
  const cloth = asKit(new LitMaterial({ color: 0x323c56 }));
  const metal = asKit(new LitMaterial({ color: 0xc4c8cf, metalness: 0.92 }));
  const boots = new LitMaterial({ color: 0x4e3222 });
  const copy = copyOfKit(metal);
  const original = [cloth, metal, boots].map(material => material.color.getHex());
  const root = new Node();
  for (const material of [cloth, metal, copy, boots]) root.add(new Mesh(new Geometry(), material));
  const dye = new Dye('blue').cloth(cloth).tint(metal);
  // (a colour written moves its material's version, the engine's cue to send it again: under three it meant a
  // program made again, which a colour never needs; a pipeline is keyed by blending, side and depth alone)
  const bootsVersion = boots.version;
  for (const { id } of HERO_COLOURS) {
    dye.apply(root, id);
    assert.equal(copy.color.getHex(), metal.color.getHex());
    assert.equal(boots.color.getHex(), original[2]);
    assert.equal(boots.version, bootsVersion, 'a material the dye never named is sent again');
    assert.equal(metal.metalness, 0.92);
  }
  dye.apply(root, null);
  assert.deepEqual([cloth, metal, boots].map(material => material.color.getHex()), original);
  dye.apply(root, 'blue');
  assert.equal(cloth.color.getHex(), original[0]);
  assert.notEqual(metal.color.getHex(), original[1], 'an explicit native-blue pick must tint the added cuirass too');
});

test('the leather abdomen matches the torso cloth while legs and the original look stay independent', () => {
  const cloth = asKit(new LitMaterial({ color: 0x323c56 }));
  const abdomen = asKit(new LitMaterial({ color: 0x2c1d14 }));
  const legs = asKit(new LitMaterial({ color: 0x2c1d14 }));
  const root = new Node();
  for (const material of [cloth, abdomen, legs]) root.add(new Mesh(new Geometry(), material));
  const original = abdomen.color.getHex();
  const dye = new Dye('blue').cloth(cloth).tintLike(cloth, abdomen);
  for (const colour of ['gold', 'red', 'teal', 'blue']) {
    dye.apply(root, colour);
    assert.equal(abdomen.color.getHex(), cloth.color.getHex());
    assert.equal(legs.color.getHex(), original);
  }
  dye.apply(root, null);
  assert.equal(abdomen.color.getHex(), original);
});
