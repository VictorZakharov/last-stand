// The maths' value classes, subclassed as `scene/` watches them: each subclass makes the fields accessors on its
// prototype that log each write, and every method must write through them (no own property made, no write past
// them). Each subclass's backing numbers are `declare`d, not initialised: the base constructor writes through the
// accessors before a subclass's own field initialisers would run, and an initialiser would then overwrite them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from './color.ts';
import { Euler } from './euler.ts';
import type { EulerOrder } from './euler.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Vec2 } from './vec2.ts';
import { Vec3 } from './vec3.ts';
import { Vec4 } from './vec4.ts';
import { assertNear } from './testing.ts';

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
  get x(): number {
    return this.kept[0];
  }
  set x(value: number) {
    (this.kept ??= [0, 0])[0] = value;
    saw(this, 'x');
  }
  get y(): number {
    return this.kept[1];
  }
  set y(value: number) {
    (this.kept ??= [0, 0])[1] = value;
    saw(this, 'y');
  }
}

/** a `Vec3` whose `x`, `y` and `z` are accessors */
class WatchedVec3 extends Vec3 implements Watched {
  declare log?: string[];
  declare kept: [number, number, number];
  get x(): number {
    return this.kept[0];
  }
  set x(value: number) {
    (this.kept ??= [0, 0, 0])[0] = value;
    saw(this, 'x');
  }
  get y(): number {
    return this.kept[1];
  }
  set y(value: number) {
    (this.kept ??= [0, 0, 0])[1] = value;
    saw(this, 'y');
  }
  get z(): number {
    return this.kept[2];
  }
  set z(value: number) {
    (this.kept ??= [0, 0, 0])[2] = value;
    saw(this, 'z');
  }
}

/** a `Vec4` whose `x`, `y`, `z` and `w` are accessors */
class WatchedVec4 extends Vec4 implements Watched {
  declare log?: string[];
  declare kept: [number, number, number, number];
  get x(): number {
    return this.kept[0];
  }
  set x(value: number) {
    (this.kept ??= [0, 0, 0, 0])[0] = value;
    saw(this, 'x');
  }
  get y(): number {
    return this.kept[1];
  }
  set y(value: number) {
    (this.kept ??= [0, 0, 0, 0])[1] = value;
    saw(this, 'y');
  }
  get z(): number {
    return this.kept[2];
  }
  set z(value: number) {
    (this.kept ??= [0, 0, 0, 0])[2] = value;
    saw(this, 'z');
  }
  get w(): number {
    return this.kept[3];
  }
  set w(value: number) {
    (this.kept ??= [0, 0, 0, 0])[3] = value;
    saw(this, 'w');
  }
}

/** a `Quat` whose `x`, `y`, `z` and `w` are accessors */
class WatchedQuat extends Quat implements Watched {
  declare log?: string[];
  declare kept: [number, number, number, number];
  get x(): number {
    return this.kept[0];
  }
  set x(value: number) {
    (this.kept ??= [0, 0, 0, 1])[0] = value;
    saw(this, 'x');
  }
  get y(): number {
    return this.kept[1];
  }
  set y(value: number) {
    (this.kept ??= [0, 0, 0, 1])[1] = value;
    saw(this, 'y');
  }
  get z(): number {
    return this.kept[2];
  }
  set z(value: number) {
    (this.kept ??= [0, 0, 0, 1])[2] = value;
    saw(this, 'z');
  }
  get w(): number {
    return this.kept[3];
  }
  set w(value: number) {
    (this.kept ??= [0, 0, 0, 1])[3] = value;
    saw(this, 'w');
  }
}

/** an `Euler` whose `x`, `y`, `z` and `order` are accessors */
class WatchedEuler extends Euler implements Watched {
  declare log?: string[];
  declare kept: [number, number, number];
  declare keptOrder: EulerOrder;
  get x(): number {
    return this.kept[0];
  }
  set x(value: number) {
    (this.kept ??= [0, 0, 0])[0] = value;
    saw(this, 'x');
  }
  get y(): number {
    return this.kept[1];
  }
  set y(value: number) {
    (this.kept ??= [0, 0, 0])[1] = value;
    saw(this, 'y');
  }
  get z(): number {
    return this.kept[2];
  }
  set z(value: number) {
    (this.kept ??= [0, 0, 0])[2] = value;
    saw(this, 'z');
  }
  get order(): EulerOrder {
    return this.keptOrder;
  }
  set order(value: EulerOrder) {
    this.keptOrder = value;
    saw(this, 'order');
  }
}

/** a `Color` whose `r`, `g` and `b` are accessors */
class WatchedColor extends Color implements Watched {
  declare log?: string[];
  declare kept: [number, number, number];
  get r(): number {
    return this.kept[0];
  }
  set r(value: number) {
    (this.kept ??= [0, 0, 0])[0] = value;
    saw(this, 'r');
  }
  get g(): number {
    return this.kept[1];
  }
  set g(value: number) {
    (this.kept ??= [0, 0, 0])[1] = value;
    saw(this, 'g');
  }
  get b(): number {
    return this.kept[2];
  }
  set b(value: number) {
    (this.kept ??= [0, 0, 0])[2] = value;
    saw(this, 'b');
  }
}

/** a value whose fields are accessors, its log started */
type Watchable = Watched & object;

/** asserts each method's writes all went through the accessors: every field logged, none made an own property */
function assertWatched<T extends Watchable>(value: T, fields: readonly string[], calls: Record<string, (v: T) => void>) {
  for (const [name, call] of Object.entries(calls)) {
    value.log = [];
    call(value);
    for (const field of fields) {
      assert.ok(value.log.includes(field), `${name} wrote ${field} past its accessor`);
      assert.equal(Object.hasOwn(value, field), false, `${name} made ${field} an own property`);
    }
  }
}

const XY = ['x', 'y'] as const;
const XYZ = ['x', 'y', 'z'] as const;
const XYZW = ['x', 'y', 'z', 'w'] as const;

test('a watched Vec2 sees every write of its methods', () => {
  const v = new WatchedVec2(1, 2);
  assertWatched(v, XY, {
    set: (u) => u.set(3, 4),
    copy: (u) => u.copy(new Vec2(5, 6)),
    add: (u) => u.add(new Vec2(1, 1)),
    lerp: (u) => u.lerp(new Vec2(0, 0), 0.5),
    normalize: (u) => u.normalize(),
    fromArray: (u) => u.fromArray([7, 8]),
  });
  assertNear(v.toArray(), [7, 8]);
});

test('a watched Vec3 sees every write of its methods, and they read through its accessors', () => {
  const v = new WatchedVec3(1, 2, 3);
  const quarterTurnY = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
  assertWatched(v, XYZ, {
    set: (u) => u.set(1, 0, 0),
    applyQuaternion: (u) => u.applyQuaternion(quarterTurnY),
    copy: (u) => u.copy(new Vec3(2, 0, 0)),
    add: (u) => u.add(new Vec3(0, 3, 4)),
    lerp: (u) => u.lerp(new Vec3(0, 0, 0), 0.5),
    normalize: (u) => u.normalize(),
    fromArray: (u) => u.fromArray([7, 8, 9]),
  });
  assertNear(v.toArray(), [7, 8, 9]);
  v.set(1, 0, 0).applyQuaternion(quarterTurnY);
  assertNear(v.toArray(), [0, 0, -1], 1e-15);
});

test('a watched Vec4 sees every write of its methods', () => {
  const v = new WatchedVec4(1, 2, 3, 4);
  assertWatched(v, XYZW, {
    set: (u) => u.set(1, 0, 0, 0),
    copy: (u) => u.copy(new Vec4(2, 0, 0, 0)),
    add: (u) => u.add(new Vec4(0, 3, 4, 0)),
    lerp: (u) => u.lerp(new Vec4(0, 0, 0, 0), 0.5),
    normalize: (u) => u.normalize(),
    applyMatrix4: (u) => u.applyMatrix4(new Mat4().makeTranslation(1, 2, 3)),
    fromArray: (u) => u.fromArray([7, 8, 9, 10]),
  });
  assertNear(v.toArray(), [7, 8, 9, 10]);
});

test('a watched Quat sees every write of its methods', () => {
  const q = new WatchedQuat();
  const other = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1));
  assertWatched(q, XYZW, {
    set: (u) => u.set(0, 0, 0, 1),
    copy: (u) => u.copy(other),
    multiply: (u) => u.multiply(other),
    slerp: (u) => u.slerp(new Quat(), 0.3),
    normalize: (u) => u.normalize(),
    invert: (u) => u.invert(),
    setFromEuler: (u) => u.setFromEuler(new Euler(0.1, 0.2, 0.3)),
    setFromAxisAngle: (u) => u.setFromAxisAngle(new Vec3(0, 0, 1), 1),
    setFromRotationMatrix: (u) => u.setFromRotationMatrix(new Mat4().makeRotationY(0.4)),
    fromArray: (u) => u.fromArray([0, 0, 0, 1]),
  });
});

test('a watched Euler sees every write of its methods, its order among them', () => {
  const euler = new WatchedEuler(0.1, 0.2, 0.3, 'YXZ');
  const turn = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1));
  assertWatched(euler, [...XYZ, 'order'], {
    set: (u) => u.set(1, 2, 3),
    copy: (u) => u.copy(new Euler(0.4, 0.5, 0.6, 'ZXY')),
    setFromQuaternion: (u) => u.setFromQuaternion(turn, 'XYZ'),
    setFromRotationMatrix: (u) => u.setFromRotationMatrix(new Mat4().makeRotationX(0.2)),
  });
  assertNear([euler.x, euler.y, euler.z], [0.2, 0, 0], 1e-15);
  assert.equal(euler.order, 'XYZ');
});

test('a watched Color sees every write of its methods', () => {
  const color = new WatchedColor(0xff8800);
  assertWatched(color, ['r', 'g', 'b'], {
    set: (u) => u.set(0x112233),
    setRGB: (u) => u.setRGB(0.1, 0.2, 0.3),
    copy: (u) => u.copy(new Color(0.5, 0.5, 0.5)),
    add: (u) => u.add(new Color(0.1, 0.1, 0.1)),
    lerp: (u) => u.lerp(new Color(0, 0, 0), 0.5),
    multiplyScalar: (u) => u.multiplyScalar(2),
    setHSL: (u) => u.setHSL(0.3, 0.5, 0.5),
    fromArray: (u) => u.fromArray([0.25, 0.5, 0.75]),
  });
  assertNear(color.toArray(), [0.25, 0.5, 0.75]);
});

test('the check catches a write past the accessors (its canary)', () => {
  const v = new WatchedVec3(1, 2, 3);
  const pastAccessors = (u: WatchedVec3): void => {
    Object.defineProperty(u, 'x', { value: 5, writable: true, enumerable: true, configurable: true });
  };
  assert.throws(() => assertWatched(v, XYZ, { pastAccessors }), /past its accessor/);
});

test('Quat and Euler call their change callback after a method writes, not on a field\'s write', () => {
  let quatChanges = 0;
  let eulerChanges = 0;
  const q = new Quat()._onChange(() => quatChanges++);
  const euler = new Euler()._onChange(() => eulerChanges++);
  q.setFromEuler(euler);
  q.slerp(new Quat(0, 1, 0, 0), 0.5);
  q.slerp(q.clone(), 0.5);
  q.setFromEuler(euler, false);
  q.x = 0.5;
  assert.equal(quatChanges, 3);
  euler.setFromQuaternion(q);
  euler.set(1, 2, 3);
  euler.setFromQuaternion(q, 'XYZ', false);
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
