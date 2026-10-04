// Bow shots; damage follows the usual co-op authority checks. An arrow flies as one does: as fast as the draw sent it
// (a bow's string drives it about in proportion to how far it was drawn), on the lower ballistic arc that crosses its
// target at a man's chest, turning to follow its path, and where it comes down it sticks in the ground. The ranger's
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
import { clamp, rand } from '../../util';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { InstantSkill, Needs } from './types';

export const GRAVITY = 9.81;
/** a shot crosses its target this high off the ground (a man-sized foe's chest), aimed as though it were no nearer than
 *  NEAR, and no steeper than MAX_PITCH (out of the draw's reach it falls short) */
const AIM_H = 1.1, NEAR = 5;
export const MAX_PITCH = 0.6;
/** how deep an arrow goes into the ground (m), how long it stands there (s, shrinking away over the last half second) and how many can */
const SINK = 0.16, STUCK_LIFE = 7, STUCK_MAX = 128;
export const FWD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
export const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
export const arrowMesh = (): THREE.Mesh => new THREE.Mesh(arrowGeometry(), arrowMat);

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

/** the arrows standing in the ground, one instanced mesh: each one's place and turn, its buried point, how long it has stood and may */
let stuck: THREE.InstancedMesh | null = null;
const stood: { p: THREE.Vector3; q: THREE.Quaternion; tip: THREE.Vector3; t: number; life: number }[] = [];
/** An arrow into the ground, its point at `tip` going `dir`, standing there `life` s. */
export function stick(tip: THREE.Vector3, dir: THREE.Vector3, life = STUCK_LIFE): void {
  if (!stuck) {
    const mesh = stuck = new THREE.InstancedMesh(arrowGeometry(), arrowMat, STUCK_MAX);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'stuck arrows';
    G.scene.add(mesh);
    addEffect({
      update(dt) {
        for (let i = stood.length - 1; i >= 0; i--) if ((stood[i].t += dt) > stood[i].life) stood.splice(i, 1);
        stood.forEach((a, i) => {
          // (shrinking into the ground about its buried point)
          const k = clamp((a.life - a.t) / 0.5, 0, 1);
          _p.copy(a.p).sub(a.tip).multiplyScalar(k).add(a.tip);
          mesh.setMatrixAt(i, _m.compose(_p, a.q, _s.setScalar(k)));
        });
        mesh.count = stood.length; mesh.instanceMatrix.needsUpdate = true;
        return stood.length > 0;
      },
      dispose() { G.scene.remove(mesh); mesh.dispose(); stuck = null; stood.length = 0; },
    });
  }
  // (full: the one nearest its end makes way)
  if (stood.length >= STUCK_MAX) { let o = 0; for (let i = 1; i < stood.length; i++) if (stood[i].life - stood[i].t < stood[o].life - stood[o].t) o = i; stood.splice(o, 1); }
  const q = new THREE.Quaternion().setFromUnitVectors(FWD, dir), at = tip.clone().addScaledVector(dir, SINK);
  stood.push({ p: at.clone().addScaledVector(dir, -ARROW / 2), q, tip: at, t: 0, life });
}

type BowDef = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'range'>;
/** an arrow's speed at a draw `k` (0..1 of its time) */
const arrowSpeed = (def: BowDef, k: number): number => def.speed * pullAt(k);

/** An arrow's flight each frame: falling, turning to follow its path (its vanes keep it so), and into the ground point first. */
function fly(proj: Projectile, dt: number): void {
  proj.vel.y -= GRAVITY * dt;
  _v.copy(proj.vel).normalize();
  proj.mesh.quaternion.setFromUnitVectors(FWD, _v);
  _p.copy(proj.pos).addScaledVector(_v, ARROW / 2);
  if (_p.y <= groundHeight(_p.x, _p.z)) { stick(_p, _v); proj.kill(); }
}

/** An arrow's way off the bow: heading `yaw`, `pitch` above level. */
const shotDir = (yaw: number, pitch: number): THREE.Vector3 => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

const warmArrows = (): THREE.Object3D[] => { const s = new THREE.InstancedMesh(arrowGeometry(), arrowMat, 1); s.count = 1; return [arrowMesh(), s, new THREE.Mesh(streakGeo, streakOf(GLINT, 1))]; };

/** a piercing shot's tracer: its longest (m), and how long it fades once the arrow's gone (s) */
const TRACE = 14, TRACE_FADE = 0.3;
const GLINT = 0xf3dc9a;

export const bowShot: InstantSkill = {
  anim: 'bow', warm: warmArrows,
  pitch: (player, def, k, target) => launchPitch(player.castPoint, target, arrowSpeed(def as BowDef, k), def.range ?? 24),
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    // (the string gives the arrow the energy the bow stored, which goes with the square of the draw: that is its blow)
    const damage = def.damage * pull * pull, knock = (def.knock ?? 0) * pull;
    const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v, def.range);
    for (let i = 0; i < def.missiles; i++) {
      const dir = shotDir(yaw + (i - (def.missiles - 1) / 2) * def.spread, pitch);
      const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
      spawnProjectile({
        pos: origin, dir, speed: v, radius: 0.22, life: 4, mesh, color: 0xd3bf8d, swept: true, level: true, tick: fly,
        onHit(enemy, proj) {
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
  charging(player, _def, k, dt) {
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
      pos: origin, dir, speed: v, radius: 0.24, life: 3, mesh, color: 0xd3bf8d, swept: true, pierce: true, tick: fly,
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
