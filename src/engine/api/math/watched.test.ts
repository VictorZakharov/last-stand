// The maths' value classes, subclassed as `scene/` watches them: each subclass makes the fields accessors on its
// prototype that log each write, and every method must write through them (no own property made, no write past
// them). Each subclass's backing numbers are `declare`d, not initialised: the base constructor writes through the
// accessors before a subclass's own field initialisers would run, and an initialiser would then overwrite them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from './color.ts';
import { Euler } from './euler.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Vec2 } from './vec2.ts';
import { Vec3 } from './vec3.ts';
import { Vec4 } from './vec4.ts';
import { assertNear } from './testing.ts';
import type { Watcher } from './types.ts';

/** the writes a watched value saw since `clear`; written by the accessors, the first ones before it exists */
interface Watched {
  log?: string[];
}

/** records a write of `field` once the log exists (the base constructor's own writes come before it) */
function saw(watched: Watched, field: string): void {
  watched.log?.push(field);
}

/** a `Vec2` whose `x` and `y` are accessors */
class WatchedVec2 extends Vec2 implements Watched {
  declare log?: string[];
  declare kept: [number, number];
  override get x(): number {
    return this.kept[0];
  }
  override set x(value: number) {
    (this.kept ??= [0, 0])[0] = value;
    saw(this, 'x');
  }
  override get y(): number {
    return this.kept[1];
  }
  override set y(value: number) {
    (this.kept ??= [0, 0])[1] = value;
    saw(this, 'y');
  }
}

/** a `Vec3` whose `x`, `y` and `z` are accessors */
class WatchedVec3 extends Vec3 implements Watched {
  declare log?: string[];
  declare kept: [number, number, number];
  override get x(): number {
    return this.kept[0];
  }
  override set x(value: number) {
    (this.kept ??= [0, 0, 0])[0] = value;
    saw(this, 'x');
  }
  override get y(): number {
    return this.kept[1];
  }
  override set y(value: number) {
    (this.kept ??= [0, 0, 0])[1] = value;
    saw(this, 'y');
  }
  override get z(): number {
    return this.kept[2];
  }
  override set z(value: number) {
    (this.kept ??= [0, 0, 0])[2] = value;
    saw(this, 'z');
  }
}

/** a `Vec4` whose `x`, `y`, `z` and `w` are accessors */
class WatchedVec4 extends Vec4 implements Watched {
  declare log?: string[];
  declare kept: [number, number, number, number];
  override get x(): number {
    return this.kept[0];
  }
  override set x(value: number) {
    (this.kept ??= [0, 0, 0, 0])[0] = value;
    saw(this, 'x');
  }
  override get y(): number {
    return this.kept[1];
  }
  override set y(value: number) {
    (this.kept ??= [0, 0, 0, 0])[1] = value;
    saw(this, 'y');
  }
  override get z(): number {
    return this.kept[2];
  }
  override set z(value: number) {
    (this.kept ??= [0, 0, 0, 0])[2] = value;
    saw(this, 'z');
  }
  override get w(): number {
    return this.kept[3];
  }
  override set w(value: number) {
    (this.kept ??= [0, 0, 0, 0])[3] = value;
    saw(this, 'w');
  }
}

/** a `Quat` whose `x`, `y`, `z` and `w` are accessors */
class WatchedQuat extends Quat implements Watched {
  declare log?: string[];
  declare kept: [number, number, number, number];
  override get x(): number {
    return this.kept[0];
  }
  override set x(value: number) {
    (this.kept ??= [0, 0, 0, 1])[0] = value;
    saw(this, 'x');
  }
  override get y(): number {
    return this.kept[1];
  }
  override set y(value: number) {
    (this.kept ??= [0, 0, 0, 1])[1] = value;
    saw(this, 'y');
  }
  override get z(): number {
    return this.kept[2];
  }
  override set z(value: number) {
    (this.kept ??= [0, 0, 0, 1])[2] = value;
    saw(this, 'z');
  }
  override get w(): number {
    return this.kept[3];
  }
  override set w(value: number) {
    (this.kept ??= [0, 0, 0, 1])[3] = value;
    saw(this, 'w');
  }
}

/** a `Color` whose `r`, `g` and `b` are accessors */
class WatchedColor extends Color implements Watched {
  declare log?: string[];
  declare kept: [number, number, number];
  override get r(): number {
    return this.kept[0];
  }
  override set r(value: number) {
    (this.kept ??= [0, 0, 0])[0] = value;
    saw(this, 'r');
  }
  override get g(): number {
    return this.kept[1];
  }
  override set g(value: number) {
    (this.kept ??= [0, 0, 0])[1] = value;
    saw(this, 'g');
  }
  override get b(): number {
    return this.kept[2];
  }
  override set b(value: number) {
    (this.kept ??= [0, 0, 0])[2] = value;
    saw(this, 'b');
  }
}

/** a value whose fields are accessors, its log started */
type Watchable = Watched & object;

/** asserts each method's writes all went through the accessors: every field logged, none made an own property */
function assertWatched<Value extends Watchable>(value: Value, fields: readonly string[],
  calls: Record<string, (watched: Value) => void>): void {
  for (const [name, call] of Object.entries(calls)) {
    value.log = [];
    call(value);
    for (const field of fields) {
      assert.ok(value.log.includes(field), `${name} wrote ${field} past its accessor`);
      assert.equal(Object.hasOwn(value, field), false, `${name} made ${field} an own property`);
    }
  }
}

/** an owner counting what a watched value told it (a node's `Mover`) */
class Counted implements Watcher {
  writes = 0;
  reads = 0;
  touched(): void {
    this.writes++;
  }
  fresh(): void {
    this.reads++;
  }
}

/** asserts each method told the angles' owner of its write, and made none of `fields` an own property */
function assertTold(value: Euler, fields: readonly string[], calls: Record<string, (watched: Euler) => void>): void {
  const owner = new Counted();
  value.owner = owner;
  for (const [name, call] of Object.entries(calls)) {
    owner.writes = 0;
    call(value);
    assert.ok(owner.writes > 0, `${name} wrote past its owner`);
    for (const field of fields) {
      assert.equal(Object.hasOwn(value, field), false, `${name} made ${field} an own property`);
    }
  }
}

const XY = ['x', 'y'] as const;
const XYZ = ['x', 'y', 'z'] as const;
const XYZW = ['x', 'y', 'z', 'w'] as const;

test('a watched Vec2 sees every write of its methods', () => {
  const vector = new WatchedVec2(1, 2);
  assertWatched(vector, XY, {
    set: (value) => value.set(3, 4),
    copy: (value) => value.copy(new Vec2(5, 6)),
    add: (value) => value.add(new Vec2(1, 1)),
    lerp: (value) => value.lerp(new Vec2(0, 0), 0.5),
    normalize: (value) => value.normalize(),
    fromArray: (value) => value.fromArray([7, 8]),
  });
  assertNear(vector.toArray(), [7, 8]);
});

test('a watched Vec3 sees every write of its methods, and they read through its accessors', () => {
  const vector = new WatchedVec3(1, 2, 3);
  const quarterTurnY = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
  assertWatched(vector, XYZ, {
    set: (value) => value.set(1, 0, 0),
    applyQuaternion: (value) => value.applyQuaternion(quarterTurnY),
    copy: (value) => value.copy(new Vec3(2, 0, 0)),
    add: (value) => value.add(new Vec3(0, 3, 4)),
    lerp: (value) => value.lerp(new Vec3(0, 0, 0), 0.5),
    normalize: (value) => value.normalize(),
    fromArray: (value) => value.fromArray([7, 8, 9]),
  });
  assertNear(vector.toArray(), [7, 8, 9]);
  vector.set(1, 0, 0).applyQuaternion(quarterTurnY);
  assertNear(vector.toArray(), [0, 0, -1], 1e-15);
});

test('a watched Vec4 sees every write of its methods', () => {
  const vector = new WatchedVec4(1, 2, 3, 4);
  assertWatched(vector, XYZW, {
    set: (value) => value.set(1, 0, 0, 0),
    copy: (value) => value.copy(new Vec4(2, 0, 0, 0)),
    add: (value) => value.add(new Vec4(0, 3, 4, 0)),
    lerp: (value) => value.lerp(new Vec4(0, 0, 0, 0), 0.5),
    normalize: (value) => value.normalize(),
    applyMatrix4: (value) => value.applyMatrix4(new Mat4().makeTranslation(1, 2, 3)),
    fromArray: (value) => value.fromArray([7, 8, 9, 10]),
  });
  assertNear(vector.toArray(), [7, 8, 9, 10]);
});

test('a watched Quat sees every write of its methods', () => {
  const quaternion = new WatchedQuat();
  const other = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1));
  assertWatched(quaternion, XYZW, {
    set: (value) => value.set(0, 0, 0, 1),
    copy: (value) => value.copy(other),
    multiply: (value) => value.multiply(other),
    slerp: (value) => value.slerp(new Quat(), 0.3),
    normalize: (value) => value.normalize(),
    invert: (value) => value.invert(),
    setFromEuler: (value) => value.setFromEuler(new Euler(0.1, 0.2, 0.3)),
    setFromAxisAngle: (value) => value.setFromAxisAngle(new Vec3(0, 0, 1), 1),
    setFromRotationMatrix: (value) => value.setFromRotationMatrix(new Mat4().makeRotationY(0.4)),
    fromArray: (value) => value.fromArray([0, 0, 0, 1]),
  });
});

test('a watched Euler tells its owner of every write of its methods, its order among them', () => {
  const euler = new Euler(0.1, 0.2, 0.3, 'YXZ');
  const turn = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1));
  assertTold(euler, [...XYZ, 'order'], {
    set: (value) => value.set(1, 2, 3),
    copy: (value) => value.copy(new Euler(0.4, 0.5, 0.6, 'ZXY')),
    setFromQuaternion: (value) => value.setFromQuaternion(turn, 'XYZ'),
    setFromRotationMatrix: (value) => value.setFromRotationMatrix(new Mat4().makeRotationX(0.2)),
  });
  assertNear([euler.x, euler.y, euler.z], [0.2, 0, 0], 1e-15);
  assert.equal(euler.order, 'XYZ');
});

test('a watched Color sees every write of its methods', () => {
  const color = new WatchedColor(0xff8800);
  assertWatched(color, ['r', 'g', 'b'], {
    set: (value) => value.set(0x112233),
    setRGB: (value) => value.setRGB(0.1, 0.2, 0.3),
    copy: (value) => value.copy(new Color(0.5, 0.5, 0.5)),
    add: (value) => value.add(new Color(0.1, 0.1, 0.1)),
    lerp: (value) => value.lerp(new Color(0, 0, 0), 0.5),
    multiplyScalar: (value) => value.multiplyScalar(2),
    setHSL: (value) => value.setHSL(0.3, 0.5, 0.5),
    fromArray: (value) => value.fromArray([0.25, 0.5, 0.75]),
  });
  assertNear(color.toArray(), [0.25, 0.5, 0.75]);
});

test('the check catches a write the angles\' owner is never told of (its canary)', () => {
  const euler = new Euler(1, 2, 3);
  const pastOwner = (value: Euler): void => {
    Object.assign(value, { _ex: 5 });
  };
  assert.throws(() => assertTold(euler, XYZ, { pastOwner }), /past its owner/);
});

test('the check catches a write past the accessors (its canary)', () => {
  const vector = new WatchedVec3(1, 2, 3);
  const pastAccessors = (value: WatchedVec3): void => {
    Object.defineProperty(value, 'x', { value: 5, writable: true, enumerable: true, configurable: true });
  };
  assert.throws(() => assertWatched(vector, XYZ, { pastAccessors }), /past its accessor/);
});

test('Quat and Euler call their change callback after a method writes, not on a field\'s write', () => {
  let quatChanges = 0;
  let eulerChanges = 0;
  const quaternion = new Quat()._onChange(() => quatChanges++);
  const euler = new Euler()._onChange(() => eulerChanges++);
  quaternion.setFromEuler(euler);
  quaternion.slerp(new Quat(0, 1, 0, 0), 0.5);
  quaternion.slerp(quaternion.clone(), 0.5);
  quaternion.setFromEuler(euler, false);
  quaternion.x = 0.5;
  assert.equal(quatChanges, 3);
  euler.setFromQuaternion(quaternion);
  euler.set(1, 2, 3);
  euler.setFromQuaternion(quaternion, 'XYZ', false);
  euler.x = 2;
  assert.equal(eulerChanges, 2);
});

test('a rotation and a quaternion kept in step both ways, as a node keeps them', () => {
  const rotation = new Euler();
  const quaternion = new Quat();
  rotation._onChange(() => quaternion.setFromEuler(rotation, false));
  quaternion._onChange(() => rotation.setFromQuaternion(quaternion, undefined, false));
  rotation.set(0.3, -0.7, 1.1);
  assertNear(quaternion.toArray(), new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1)).toArray());
  quaternion.setFromAxisAngle(new Vec3(0, 1, 0), 0.5);
  assertNear([rotation.x, rotation.y, rotation.z], [0, 0.5, 0], 1e-15);
});
