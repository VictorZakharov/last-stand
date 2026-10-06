// Bow shots; damage follows the usual co-op authority checks. An arrow flies as one does: as fast as the draw sent it
// (a bow's string drives it about in proportion to how far it was drawn), on the lower ballistic arc that crosses its
// target at a man's chest, turning to follow its path, and where it ends it stays (fx/stuckArrows): in the ground, a
// wooden prop, the thicket or a foe's body, or off stone onto the floor. The ranger's
// other skills: arrowRain.ts, quarryMark.ts, strawman.ts.
import * as THREE from 'three';
import { G } from '../../state';
import { spawnProjectile, type Projectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { addEffect } from '../../fx/effects';
import { nearGlow } from '../../core/materials';
import { burst, debris, particles, col } from '../../fx/particles';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { arrowGeometry, ARROW, pullAt } from '../../entities/models/bow';
import { showLaser, warmLaser, LASER_POINTS } from '../../fx/aimLaser';
import { arrowMat, stickAt, stickIn, glance, floorIsStone, propIsStone, wallIsStone, warmStuck, SINK } from '../../fx/stuckArrows';
import { pastWall } from '../../world/edge';
import { clamp, rand } from '../../util';
import type { Obstacle } from '../../types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { InstantSkill, Needs } from './types';

export const GRAVITY = 9.81;
/** a shot crosses its target this high off the ground (a man-sized foe's chest), aimed as though it were no nearer than
 *  NEAR, and no steeper than MAX_PITCH (out of the draw's reach it falls short) */
const AIM_H = 1.1, NEAR = 5;
export const MAX_PITCH = 0.6;
export const FWD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3();
export { arrowMat };
export const arrowMesh = (): THREE.Mesh => new THREE.Mesh(arrowGeometry(), arrowMat);
/** an arrow out through a gate is gone this far past the wall (m) */
const GATE_DEPTH = 2;
/** an arrow's flight ends this far out whatever happens (m): past the wall, out through a gate */
export const ARROW_EDGE = 40;

/** a streak of light behind an arrow (a shaft is a few pixels from the top-down view, and a fast one is gone in two frames):
 *  two crossed strips along +z from its tail (z = -1, dark: it's added light) to its point (z = 0, bright), seen from any side */
export const streakGeo = (() => {
  const pos: number[] = [], col: number[] = [], w = 0.05;
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    const v = (sx: number, z: number) => [sx * w * ax, sx * w * ay, z];
    for (const q of [v(-1, -1), v(1, -1), v(1, 0), v(-1, -1), v(1, 0), v(-1, 0)]) { pos.push(...q); const b = q[2] === 0 ? 1 : 0; col.push(b, b, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
})();
const streakOf = (color: number, k: number, opacity = 1) => nearGlow(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
export const streakMat = streakOf(0xe6efc4, 2.2);

/** The angle above level (the lower of the two arcs) that takes an arrow at `v` from `from` across `target` at AIM_H. */
export function launchPitch(from: THREE.Vector3, target: THREE.Vector3, v: number, range: number): number {
  const d = clamp(Math.hypot(target.x - from.x, target.z - from.z), NEAR, range), h = groundHeight(target.x, target.z) + AIM_H - from.y;
  const v2 = v * v, disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * h * v2);
  return disc < 0 ? MAX_PITCH : Math.min(MAX_PITCH, Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d)));
}

/** An arrow coming down at `tip` going `dir` at `vel`: into the ground, or off it if it's stone. */
export function intoGround(tip: THREE.Vector3, vel: THREE.Vector3): void {
  tip.y = groundHeight(tip.x, tip.z);
  if (floorIsStone(tip.x, tip.z)) glance(tip, vel, _n.set(0, 1, 0));
  else stickAt(tip, _d.copy(vel).normalize(), SINK.ground);
}

/** An arrow into a prop at `at`, going `vel`: off it if it's stone, else into it (and down with it when it breaks). */
export function intoProp(o: Obstacle, at: THREE.Vector3, vel: THREE.Vector3): void {
  if (propIsStone(o)) glance(at, vel, _n.set(at.x - o.x, 0, at.z - o.z).normalize());
  else stickAt(at, _d.copy(vel).normalize(), SINK.prop, o);
}

/** An arrow into a foe, struck at `at` going `vel`: it lodges in the body where it meets it, riding it until the body
 *  dissolves; if the line misses the body's surface (the foe's circle is rounder than it), aimed in at its middle. */
export function intoFoe(e: Enemy, at: THREE.Vector3, vel: THREE.Vector3): void {
  const dir = _d.copy(vel).normalize(), gone = () => !e.obj.parent || (!e.alive && e.deadT > 0.45);
  if (stickIn(e.obj, _e.copy(at).addScaledVector(dir, -2), dir, gone)) return;
  const y = clamp(at.y, e.obj.position.y + e.height * 0.2, e.obj.position.y + e.height * 0.85);
  _v.set(e.pos.x - at.x, 0, e.pos.z - at.z);
  if (_v.lengthSq() < 1e-6) _v.set(-dir.x, 0, -dir.z);
  _v.normalize();
  stickIn(e.obj, _e.set(e.pos.x - _v.x * (e.radius + 1), y, e.pos.z - _v.z * (e.radius + 1)), _v, gone);
}

/** Where a flight's step from `a` to `b` meets the wall (0..1), the wall's normal into `n`, or -1 (out through a gate: -2 once gone). */
function meetsWall(a: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3): number {
  const w1 = pastWall(G.arena.biome, b.x, b.z, n);
  if (w1.by <= 0) return -1;
  if (w1.gate) return w1.by > GATE_DEPTH ? -2 : -1;
  const w0 = pastWall(G.arena.biome, a.x, a.z, _n);
  return w0.by >= 0 ? 0 : w0.by / (w0.by - w1.by);
}

type BowDef = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'range'>;
/** an arrow's speed at a draw `k` (0..1 of its time) */
const arrowSpeed = (def: BowDef, k: number): number => def.speed * pullAt(k);

const _prev = new THREE.Vector3();
/** An arrow's flight each frame: falling, turning to follow its path (its vanes keep it so), into the ground point first
 *  (off it on stone), and into the wall (off it if it's stone, into a thicket) or out through a gate. */
function fly(proj: Projectile, dt: number): void {
  _prev.copy(proj.pos).addScaledVector(proj.vel, -dt);
  proj.vel.y -= GRAVITY * dt;
  _v.copy(proj.vel).normalize();
  proj.mesh.quaternion.setFromUnitVectors(FWD, _v);
  _p.copy(proj.pos).addScaledVector(_v, ARROW / 2);
  if (_p.y <= groundHeight(_p.x, _p.z)) { intoGround(_p, proj.vel); proj.kill(); return; }
  const t = meetsWall(_prev, _p, _n);
  if (t === -2) { proj.kill(); return; }
  if (t < 0) return;
  _p.lerpVectors(_prev.addScaledVector(_v, ARROW / 2), _p, t);
  if (wallIsStone()) glance(_p, proj.vel, _n); else stickAt(_p, _v, SINK.prop);
  proj.kill();
}

/** An arrow meeting a prop: where its point crossed into the prop's circle on the step from `from`. */
function arrowProp(o: Obstacle, proj: Projectile, from: THREE.Vector3): void {
  const dx = proj.pos.x - from.x, dz = proj.pos.z - from.z;
  const t = Math.max(0, entry(from.x, from.z, dx, dz, o.x, o.z, o.r));
  intoProp(o, _p.lerpVectors(from, proj.pos, t), proj.vel);
}

/** An arrow's way off the bow: heading `yaw`, `pitch` above level. */
const shotDir = (yaw: number, pitch: number): THREE.Vector3 => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

const warmArrows = (): THREE.Object3D[] => [arrowMesh(), ...warmStuck(), new THREE.Mesh(streakGeo, streakOf(GLINT, 1)), ...warmLaser()];

/** the aim preview's flight is stepped as the arrow's is, a frame at 60 fps (swept, as its collisions are) */
const PREVIEW_DT = 1 / 60;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _wn = new THREE.Vector3();

/** Where along the step from (px, pz) by (dx, dz) it first comes within `r` of (cx, cz): 0..1, or -1 if it doesn't. */
function entry(px: number, pz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = px - cx, fz = pz - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * The path an arrow loosed now would fly (as `fly` and the projectile's own collisions have it): from `origin` along
 * `dir` at `v`, falling, until it sticks in the ground, meets a prop it doesn't clear or the arena's edge, or (unless it
 * goes on through them) a foe. Returns its points and where it strikes (null if it only runs out).
 */
function flightPath(origin: THREE.Vector3, dir: THREE.Vector3, v: number, radius: number, level: boolean, pierce: boolean): { pts: THREE.Vector3[]; end: THREE.Vector3 | null } {
  const pts = [origin.clone()], pos = _a.copy(origin), vel = _w.copy(dir).multiplyScalar(v);
  while (pts.length < LASER_POINTS) {
    // (in the projectile's order: it moves, then falls, as `fly` follows its move)
    const px = pos.x, py = pos.y, pz = pos.z;
    pos.addScaledVector(vel, PREVIEW_DT);
    vel.y -= GRAVITY * PREVIEW_DT;
    const dx = pos.x - px, dz = pos.z - pz;
    // the first thing the step meets: the ground (the point half an arrow ahead), the edge, a prop, a foe
    let t = 2;
    _b.copy(vel).normalize().multiplyScalar(ARROW / 2).add(pos);
    if (_b.y <= groundHeight(_b.x, _b.z)) {
      // (where between the step's ends the point went under)
      const g0 = py + (_b.y - pos.y) - groundHeight(px, pz), g1 = _b.y - groundHeight(_b.x, _b.z);
      t = g0 > 0 ? g0 / (g0 - g1) : 0;
    }
    // (the wall, by the arrow's point as `fly` has it: out through a gate the path just ends)
    const w = meetsWall(_c.set(px, py, pz).addScaledVector(_e.copy(vel).normalize(), ARROW / 2), _b, _wn);
    if (w === -2) return { pts, end: null };
    if (w >= 0) t = Math.min(t, w);
    const low = pos.y - radius * 0.5;
    for (const o of G.arena.obstacles) {
      if (o.h <= low) continue;
      const k = entry(px, pz, dx, dz, o.x, o.z, o.r + radius * 0.5);
      if (k >= 0 && k < t) t = k;
    }
    if (!pierce) for (const en of G.enemies) {
      if (!en.alive || en.invulnerable) continue;
      const k = entry(px, pz, dx, dz, en.pos.x, en.pos.z, en.radius + radius);
      if (k < 0 || k >= t) continue;
      // (over a foe it's above as the projectile has it: by its height at the step's end)
      const base = en.obj.position.y;
      if (level && (pos.y < base - radius || pos.y > base + en.height + radius)) continue;
      t = k;
    }
    if (t <= 1) {
      const end = new THREE.Vector3(px + dx * t, py + (pos.y - py) * t, pz + dz * t);
      pts.push(end);
      return { pts, end };
    }
    pts.push(pos.clone());
  }
  return { pts, end: null };
}

/** The aim preview of a drawn shot on the local hero's own screen: each arrow's path if it were loosed now
 *  (no weaker than the least draw, as it would leave), shown through `fx/aimLaser`. */
function previewShot(player: Player, def: BowDef, k: number, radius: number, level: boolean, pierce: boolean): void {
  if (!player.local) return;
  const origin = player.castPoint, target = player.aim, v = arrowSpeed(def, Math.max(k, def.minDraw ?? 0));
  const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v, def.range);
  const paths = [];
  for (let i = 0; i < def.missiles; i++) paths.push(flightPath(origin, shotDir(yaw + (i - (def.missiles - 1) / 2) * def.spread, pitch), v, radius, level, pierce));
  showLaser(paths);
}

/** a piercing shot's tracer: its longest (m), and how long it fades once the arrow's gone (s) */
const TRACE = 14, TRACE_FADE = 0.3;
const GLINT = 0xf3dc9a;

export const bowShot: InstantSkill = {
  anim: 'bow', warm: warmArrows,
  pitch: (player, def, k, target) => launchPitch(player.castPoint, target, arrowSpeed(def as BowDef, k), def.range ?? 24),
  charging: (player, def, k) => previewShot(player, def as BowDef, k, 0.22, true, false),
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    // (the string gives the arrow the energy the bow stored, which goes with the square of the draw: that is its blow)
    const damage = def.damage * pull * pull, knock = (def.knock ?? 0) * pull;
    const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v, def.range);
    for (let i = 0; i < def.missiles; i++) {
      const dir = shotDir(yaw + (i - (def.missiles - 1) / 2) * def.spread, pitch);
      const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
      spawnProjectile({
        pos: origin, dir, speed: v, radius: 0.22, life: 4, mesh, color: 0xd3bf8d, swept: true, level: true, tick: fly, edge: ARROW_EDGE, onProp: arrowProp,
        onHit(enemy, proj) {
          intoFoe(enemy as Enemy, proj.pos, proj.vel);
          hitEnemy(enemy as Enemy, damage, { by: player, tags: def.tags, type: 'physical', knock,
            from: { x: proj.pos.x - proj.vel.x, z: proj.pos.z - proj.vel.z } });
          burst(proj.pos, { count: 6, color: 0xd3bf8d, speed: 2, life: 0.2, size: 0.07 });
          sfx.boltHit();
        },
      });
    }
    sfx.bow();
  },
};

/** a drawn shot counts as drawn to full from here (of its draw's time) */
const FULL = 0.98;
/** how far each hero's piercing shot was drawn last frame (the glint shows as it reaches full) */
const drawnTo = new WeakMap<Player, number>();
/** The arrowhead of the arrow on the string, about: half an arrow ahead of its middle along the shot. */
const headOf = (player: Player, out: THREE.Vector3): THREE.Vector3 =>
  out.copy(player.castPoint).add(_v.set(Math.sin(player.facing), 0, Math.cos(player.facing)).multiplyScalar(ARROW * 0.45));

/**
 * Lancewood Shot: drawn while held like any shot, and driven through every foe in its line, each one it passes
 * through taking less (`falloff`); loosed at full draw it strikes harder (`fullBonus`), and the arrowhead glints
 * when it's there. Props and walls still stop it.
 */
export const piercingShot: InstantSkill = {
  anim: 'bow', warm: warmArrows, pitch: bowShot.pitch,
  charging(player, def, k, dt) {
    previewShot(player, def as BowDef, k, 0.24, false, true);
    const was = drawnTo.get(player) ?? 0;
    drawnTo.set(player, k);
    const head = headOf(player, _p);
    if (k >= FULL && was < FULL) {
      burst(head, { count: 12, color: GLINT, speed: 1.6, up: 0.4, life: 0.32, size: 0.06, gravity: 0, drag: 4 });
      if (player.local) sfx.bowReady();
    } else if (k < FULL && Math.random() < dt * 14 * k) {
      // (motes drawn in onto the arrowhead as the bow comes to full)
      const a = rand(0, Math.PI * 2), r = rand(0.25, 0.45), x = Math.cos(a) * r, y = rand(-0.2, 0.25), z = Math.sin(a) * r;
      particles.glow.spawn({ x: head.x + x, y: head.y + y, z: head.z + z, vx: -x * 3, vy: -y * 3, vz: -z * 3, life: 0.3, size: 0.05, sizeEnd: 0, color: col(GLINT, 1.6), colorEnd: col(0x806030, 0.4) });
    }
  },
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef & Needs<'falloff'>, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    const full = power >= FULL;
    drawnTo.delete(player);
    const damage = def.damage * pull * pull * (full ? 1 + (def.fullBonus ?? 0) : 1), knock = (def.knock ?? 0) * pull;
    const dir = shotDir(player.shotHeading(origin, target), launchPitch(origin, target, v, def.range));
    const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
    let through = 0;
    const pr = spawnProjectile({
      // (through everything on its line, short foes too: it flies near level, and over the nearest heads a line shot missed them)
      pos: origin, dir, speed: v, radius: 0.24, life: 3, mesh, color: 0xd3bf8d, swept: true, pierce: true, tick: fly, edge: ARROW_EDGE, onProp: arrowProp,
      trail: { color: GLINT, colorEnd: 0x5a4020, intensity: full ? 1.3 : 0.55, size: full ? 0.13 : 0.08, rate: full ? 90 : 40, life: 0.28 },
      onHit(enemy, proj) {
        const share = def.falloff[Math.min(through++, def.falloff.length - 1)];
        hitEnemy(enemy as Enemy, damage * share, { by: player, tags: def.tags, type: 'physical', knock: knock * share,
          from: { x: proj.pos.x - proj.vel.x, z: proj.pos.z - proj.vel.z } });
        burst(proj.pos, { count: 8, color: 0xd3bf8d, speed: 2.4, life: 0.22, size: 0.07 });
        debris(proj.pos, { count: 3, color: 0x6a4a2a, speed: 2, size: 0.05, life: 0.5 });
        sfx.boltHit();
      },
    });
    // its line through the pack, a streak behind the arrow from the bow, fading once it's down
    const mat = streakOf(GLINT, full ? 1.6 : 0.9), trace = new THREE.Mesh(streakGeo, mat), from = origin.clone();
    trace.frustumCulled = false; G.scene.add(trace);
    let gone = 0;
    addEffect({
      update(dt) {
        if (pr.alive) {
          _d.copy(pr.pos).addScaledVector(_e.copy(pr.vel).normalize(), ARROW / 2);
          trace.position.copy(_d); trace.quaternion.setFromUnitVectors(FWD, _e);
          trace.scale.set(full ? 1.4 : 1, full ? 1.4 : 1, Math.min(TRACE, _d.distanceTo(from)));
        } else gone += dt;
        mat.opacity = 1 - gone / TRACE_FADE;
        return gone < TRACE_FADE;
      },
      dispose() { G.scene.remove(trace); mat.dispose(); },
    });
    if (full) sfx.pierce(); else sfx.bow();
  },
};
