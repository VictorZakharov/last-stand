// Bow shots and woodland control; damage follows the usual co-op authority checks. An arrow flies as one does: as fast
// as the draw sent it (a bow's string drives it about in proportion to how far it was drawn), on the lower ballistic arc
// that crosses its target at a man's chest, turning to follow its path, and where it comes down it sticks in the ground.
import * as THREE from 'three';
import { G } from '../../state';
import { spawnProjectile } from '../projectiles';
import { hitEnemy } from '../damage';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { addEffect, shockwave, decal } from '../../fx/effects';
import { burst } from '../../fx/particles';
import { nearGlow } from '../../core/materials';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { arrowGeometry, ARROW, pullAt } from '../../entities/models/bow';
import { clamp } from '../../util';
import type { Enemy } from '../../entities/enemy';
import type { InstantSkill, Needs } from './types';

const LEAF = 0xb4cc7b;
const GRAVITY = 9.81;
/** a shot crosses its target this high off the ground (a man-sized foe's chest), aimed as though it were no nearer than
 *  NEAR, and no steeper than MAX_PITCH (out of the draw's reach it falls short) */
const AIM_H = 1.1, NEAR = 5, MAX_PITCH = 0.6;
/** how deep an arrow goes into the ground (m), how long it stands there (s, shrinking away over the last half second) and how many can */
const SINK = 0.16, STUCK_LIFE = 7, STUCK_MAX = 64;
const FWD = new THREE.Vector3(0, 0, 1), _v = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
const arrowMesh = () => new THREE.Mesh(arrowGeometry(), arrowMat);

/** The angle above level (the lower of the two arcs) that takes an arrow at `v` from `from` across `target` at AIM_H. */
export function launchPitch(from: THREE.Vector3, target: THREE.Vector3, v: number, range: number): number {
  const d = clamp(Math.hypot(target.x - from.x, target.z - from.z), NEAR, range), h = groundHeight(target.x, target.z) + AIM_H - from.y;
  const v2 = v * v, disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * h * v2);
  return disc < 0 ? MAX_PITCH : Math.min(MAX_PITCH, Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d)));
}

/** the arrows standing in the ground, one instanced mesh: each one's place and turn, its buried point, and how long it has stood */
let stuck: THREE.InstancedMesh | null = null;
const stood: { p: THREE.Vector3; q: THREE.Quaternion; tip: THREE.Vector3; t: number }[] = [];
function stick(tip: THREE.Vector3, dir: THREE.Vector3): void {
  if (!stuck) {
    const mesh = stuck = new THREE.InstancedMesh(arrowGeometry(), arrowMat, STUCK_MAX);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'stuck arrows';
    G.scene.add(mesh);
    addEffect({
      update(dt) {
        for (let i = stood.length - 1; i >= 0; i--) if ((stood[i].t += dt) > STUCK_LIFE) stood.splice(i, 1);
        stood.forEach((a, i) => {
          // (shrinking into the ground about its buried point)
          const k = clamp((STUCK_LIFE - a.t) / 0.5, 0, 1);
          _p.copy(a.p).sub(a.tip).multiplyScalar(k).add(a.tip);
          mesh.setMatrixAt(i, _m.compose(_p, a.q, _s.setScalar(k)));
        });
        mesh.count = stood.length; mesh.instanceMatrix.needsUpdate = true;
        return stood.length > 0;
      },
      dispose() { G.scene.remove(mesh); mesh.dispose(); stuck = null; stood.length = 0; },
    });
  }
  if (stood.length >= STUCK_MAX) stood.shift();
  const q = new THREE.Quaternion().setFromUnitVectors(FWD, dir), at = tip.clone().addScaledVector(dir, SINK);
  stood.push({ p: at.clone().addScaledVector(dir, -ARROW / 2), q, tip: at, t: 0 });
}
const thornGeo = new THREE.ConeGeometry(0.09, 0.8, 5).translate(0, 0.4, 0);
const thornMat = new THREE.MeshStandardMaterial({ color: 0x5b6a31, roughness: 1 });

type BowDef = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'range'>;
/** an arrow's speed at a draw `k` (0..1 of its time) */
const arrowSpeed = (def: BowDef, k: number): number => def.speed * pullAt(k);

export const bowShot: InstantSkill = {
  anim: 'bow', warm: () => { const s = new THREE.InstancedMesh(arrowGeometry(), arrowMat, 1); s.count = 1; return [arrowMesh(), s]; },
  pitch: (player, def, k, target) => launchPitch(player.castPoint, target, arrowSpeed(def as BowDef, k), def.range ?? 24),
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    // (the string gives the arrow the energy the bow stored, which goes with the square of the draw: that is its blow)
    const damage = def.damage * pull * pull, knock = (def.knock ?? 0) * pull;
    const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v, def.range);
    for (let i = 0; i < def.missiles; i++) {
      const angle = yaw + (i - (def.missiles - 1) / 2) * def.spread;
      const dir = new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch));
      const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
      spawnProjectile({
        pos: origin, dir, speed: v, radius: 0.22, life: 4, mesh, color: 0xd3bf8d, swept: true, level: true,
        tick(proj, dt) {
          // falling, turning to follow its path (its vanes keep it so), and into the ground point first
          proj.vel.y -= GRAVITY * dt;
          _v.copy(proj.vel).normalize();
          proj.mesh.quaternion.setFromUnitVectors(FWD, _v);
          _p.copy(proj.pos).addScaledVector(_v, ARROW / 2);
          if (_p.y <= groundHeight(_p.x, _p.z)) { stick(_p, _v); proj.kill(); }
        },
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

export const briarSnare: InstantSkill = {
  anim: 'cast', warm: () => [new THREE.Mesh(thornGeo, thornMat)],
  cast(player, rawDef, target) {
    const def = rawDef as Needs<'damage' | 'radius' | 'range' | 'freeze'>;
    const c = target.clone().sub(player.pos); c.y = 0;
    if (c.length() > def.range) c.setLength(def.range);
    c.add(player.pos);
    shockwave(c, { color: LEAF, intensity: 1.5, from: 0.2, to: def.radius, life: 0.5 });
    decal(c, { size: def.radius, life: def.freeze, opacity: 0.35 });
    const thorns = new THREE.Group();
    thorns.position.set(c.x, groundHeight(c.x, c.z), c.z);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2, r = def.radius * (i % 2 ? 0.55 : 0.95);
      const m = new THREE.Mesh(thornGeo, thornMat);
      m.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); m.rotation.set(Math.cos(a) * 0.35, a, -Math.sin(a) * 0.35);
      thorns.add(m);
    }
    G.scene.add(thorns);
    let t = 0;
    addEffect({ update(dt) { t += dt; thorns.scale.y = Math.max(0, Math.min(1, t / 0.2, (def.freeze - t) / 0.35)); return t < def.freeze; }, dispose() { G.scene.remove(thorns); } });
    for (const e of G.enemies) {
      if (!e.alive || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > def.radius + e.radius) continue;
      hitEnemy(e, def.damage, { by: player, tags: def.tags, type: 'physical', freeze: def.freeze, from: c });
      burst(e.pos, { count: 12, color: LEAF, speed: 2, life: 0.6, size: 0.1, gravity: -1 });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    sfx.snare();
  },
};

export const thornRepulse: InstantSkill = {
  anim: 'slam',
  cast(player, rawDef) {
    const def = rawDef as Needs<'damage' | 'radius' | 'knock' | 'chill'>;
    const c = player.pos.clone();
    shockwave(c, { color: 0xd9b878, intensity: 1.6, from: 0.5, to: def.radius, life: 0.45 });
    for (const e of G.enemies) {
      if (e.alive && Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < def.radius + e.radius)
        hitEnemy(e, def.damage, { by: player, tags: def.tags, type: 'physical', knock: def.knock, chill: def.chill, from: c });
    }
    hurtPropsIn(player, c.x, c.z, def.radius, PROP_DAMAGE.burst);
    sfx.snare();
  },
};

const wardGeo = new THREE.TorusGeometry(1, 0.025, 5, 48);
const wardMat = () => nearGlow(new THREE.MeshBasicMaterial({ color: LEAF, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }));
export const woodlandWard: InstantSkill = {
  anim: 'buff', warm: () => [new THREE.Mesh(wardGeo, wardMat())],
  cast(player, rawDef) {
    const def = rawDef as Needs<'absorbPct' | 'duration'>;
    player.ward?.onEnd?.();
    const mat = wardMat(), root = new THREE.Group();
    const rings = [0, 1, 2].map(() => new THREE.Mesh(wardGeo, mat)); root.add(...rings);
    G.scene.add(root);
    let ended = false, t = 0;
    player.ward = { amount: player.stats.maxLife * def.absorbPct, t: def.duration, onEnd: () => { ended = true; } };
    addEffect({
      update(dt) {
        t += dt;
        root.position.set(player.pos.x, groundHeight(player.pos.x, player.pos.z) + 0.1, player.pos.z);
        rings.forEach((ring, i) => {
          ring.rotation.set(Math.PI / 2 + Math.sin(t * 1.2 + i) * 0.18, i * 1.1, t * 0.5);
          ring.position.y = i * 0.32;
          ring.scale.setScalar((player.eyes ? 2.2 : 1) + i * 0.1);
        });
        mat.opacity = ended ? Math.max(0, mat.opacity - dt * 3) : Math.min(0.65, t * 3);
        return player.alive && (!ended || mat.opacity > 0);
      },
      dispose() { G.scene.remove(root); mat.dispose(); },
    });
    sfx.aegis();
  },
};
