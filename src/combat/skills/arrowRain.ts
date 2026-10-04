// Hailfletch: arrows raining on the ground at the aim for as long as the key is held. The ranger stands his ground and
// shoots volley after volley high over the spot, posed as any shot (drawn, loosed, the next arrow taken from the quiver);
// each volley's arrow splits at the top of its flight into a sheaf that comes down across the area over the next
// volley's time, so the rain keeps on. Every foe in it is hit a few times a second while arrows are falling, and the
// area follows the aim at a walk. The arrows in the air when the key is let go still come down.
import * as THREE from 'three';
import { G } from '../../state';
import { hitEnemy } from '../damage';
import { hurtPropsIn, PROP_DAMAGE } from '../../world/destructible';
import { addEffect, shockwave } from '../../fx/effects';
import { burst, debris, particles, col } from '../../fx/particles';
import { additive } from '../../core/materials';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { arrowGeometry, ARROW } from '../../entities/models/bow';
import { clamp, rand, smooth } from '../../util';
import { arrowMat, arrowMesh, stick, FWD, streakGeo, streakMat } from './ranger';
import type { Player } from '../../entities/player';
import type { ChannelSkill, Needs } from './types';

type Def = Needs<'damage' | 'radius' | 'range'>;

const LEAF = 0xb4cc7b;
/** damage ticks while arrows are falling (s) */
const TICK = 0.25;
/** a volley: its draw, and what follows the loose (the follow-through, the next arrow from the quiver), s at no cast speed */
const DRAW = 0.9, AFTER = 0.8;
/** a volley's angle above level off the bow (rad), how high over the area its arrow splits (m above the ground) and its
 *  flight up there (s) */
const PITCH = 0.45, SPLIT_H = 8.5, RISE = 0.5;
/** the arrows of a volley's sheaf, how fast they come down (m/s) and how long they stand in the ground (s) */
const SHEAF = 28, FALL_V = 24, STAND = 2.5;
/** the key let go, the sheaves still to come down fall within this (s) */
const TAIL = 0.35;
/** how fast the area follows the aim (m/s) */
const FOLLOW = 3.5;

/** a volley's arrow on its way up: a curve from the bow (leaving along the shot) to where it splits over the area */
interface Rising { mesh: THREE.Mesh; p0: THREE.Vector3; c: THREE.Vector3; p1: THREE.Vector3; t: number }
/** a sheaf's arrow: falling from `from` (its point) to `to` once its time comes */
interface Falling { from: THREE.Vector3; to: THREE.Vector3; dir: THREE.Vector3; wait: number; t: number; dur: number }

interface RainState {
  player: Player; def: Def;
  /** the area's middle on the floor */
  center: THREE.Vector3;
  /** the volley under way: its time, whether it's loosed, and (the first only, with no arrow on the string) the seconds
   *  taking one from the quiver first */
  cyc: number; loosed: boolean; fetch: number;
  rising: Rising[]; falling: Falling[];
  tick: number; done: boolean;
  /** its effect was cleared (a run starting): nothing more is shown */
  gone: boolean;
}

const ringGeo = new THREE.RingGeometry(0.95, 1, 64).rotateX(-Math.PI / 2);
/** a streak's longest (m) */
const STREAK = 3;
const fillGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();

/** The volley's time at the hero's cast speed. */
const pace = (p: Player): number => 1 + p.stats.castSpeed / 100;

/** Where the area goes: the aim, no further than the skill's range, inside the arena. */
function aimOf(p: Player, def: Def, out: THREE.Vector3): THREE.Vector3 {
  out.set(p.aim.x - p.pos.x, 0, p.aim.z - p.pos.z);
  if (out.length() > def.range) out.setLength(def.range);
  out.add(p.pos); out.y = 0;
  const R = G.arena.radius - 1, r = Math.hypot(out.x, out.z);
  if (r > R) { out.x *= R / r; out.z *= R / r; }
  return out;
}

/** A volley loosed: its arrow up off the bow towards where it splits over the area. */
function loose(s: RainState): void {
  if (s.gone) return;
  const p = s.player, p0 = p.castPoint, yaw = p.shotHeading(p0, s.center);
  const u = _a.set(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
  const p1 = new THREE.Vector3(s.center.x, groundHeight(s.center.x, s.center.z) + SPLIT_H, s.center.z);
  const mesh = arrowMesh(); mesh.position.copy(p0); mesh.quaternion.setFromUnitVectors(FWD, u);
  G.scene.add(mesh);
  s.rising.push({ mesh, p0: p0.clone(), c: p0.clone().addScaledVector(u, p0.distanceTo(p1) * 0.55), p1, t: 0 });
  sfx.bow();
}

/** It splits into its sheaf: each arrow comes down at its own moment through the next volley's time. */
function split(s: RainState, at: THREE.Vector3): void {
  burst(at, { count: 18, color: LEAF, speed: 3, up: 0, life: 0.45, size: 0.09, gravity: 2 });
  // (let go, what's still in the air comes down at once)
  const span = s.done ? TAIL : (DRAW + AFTER) / pace(s.player);
  for (let i = 0; i < SHEAF; i++) {
    s.falling.push({ from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), wait: rand(0, span) + (i === 0 ? 0 : 0.05), t: -1, dur: 0 });
  }
}

/** A sheaf's arrow starts down: from about the split, over the area as it is now, to a spot anywhere in it. */
function drop(s: RainState, f: Falling): void {
  const r = s.def.radius, a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
  f.to.set(s.center.x + Math.cos(a) * d, 0, s.center.z + Math.sin(a) * d);
  f.to.y = groundHeight(f.to.x, f.to.z);
  // (from above the area, a little towards the ranger: they come down steeply, leaning away from him)
  _b.set(s.center.x - s.player.pos.x, 0, s.center.z - s.player.pos.z).normalize();
  f.from.set(f.to.x - _b.x * 2.6 + rand(-0.8, 0.8), f.to.y + SPLIT_H + rand(-0.8, 0.8), f.to.z - _b.z * 2.6 + rand(-0.8, 0.8));
  f.dir.copy(f.to).sub(f.from).normalize();
  f.dur = f.from.distanceTo(f.to) / FALL_V; f.t = 0;
}

const skill: ChannelSkill<RainState> = {
  channel: true, anim: 'bow',
  warm: () => { const st = new THREE.InstancedMesh(streakGeo, streakMat, 1); st.count = 1; return [new THREE.Mesh(ringGeo, additive(LEAF, 1.2, 0.5)), arrowMesh(), st]; },
  start(player, rawDef) {
    const def = rawDef as Def;
    const q = player.cls.quiver;
    const s: RainState = { player, def, center: aimOf(player, def, new THREE.Vector3()), cyc: 0, loosed: false,
      fetch: q && !player.nocked ? q.fetch / pace(player) : 0, rising: [], falling: [], tick: 0, done: false, gone: false };
    // the area on the floor, and the sheaves' arrows as they fall (one instanced mesh)
    const ringMat = additive(LEAF, 1.2, 0), fillMat = additive(LEAF, 0.35, 0);
    const ring = new THREE.Mesh(ringGeo, ringMat), fill = new THREE.Mesh(fillGeo, fillMat);
    const area = new THREE.Group(); area.add(ring, fill); area.scale.setScalar(def.radius);
    const rain = new THREE.InstancedMesh(arrowGeometry(), arrowMat, SHEAF * 3);
    rain.count = 0; rain.frustumCulled = false; rain.name = 'arrow rain';
    const streaks = new THREE.InstancedMesh(streakGeo, streakMat, SHEAF * 3 + 4);
    streaks.count = 0; streaks.frustumCulled = false;
    G.scene.add(area, rain, streaks);
    shockwave(s.center, { color: LEAF, intensity: 1.1, from: def.radius * 0.4, to: def.radius, life: 0.45 });
    let fade = 0;
    addEffect({
      update(dt) {
        fade = s.done ? Math.max(0, fade - dt * 2.5) : Math.min(1, fade + dt * 4);
        ringMat.opacity = 0.55 * fade; fillMat.opacity = 0.18 * fade;
        area.position.set(s.center.x, groundHeight(s.center.x, s.center.z) + 0.06, s.center.z);
        // the volleys' arrows on their way up, each splitting into its sheaf at the top
        let ns = 0;
        for (let i = s.rising.length - 1; i >= 0; i--) {
          const r = s.rising[i], k = Math.min(1, (r.t += dt) / RISE);
          // (a quadratic from the bow: off it along the shot, bending over towards the split)
          const pt = _a.copy(r.p0).multiplyScalar((1 - k) ** 2).addScaledVector(r.c, 2 * k * (1 - k)).addScaledVector(r.p1, k * k);
          _b.subVectors(r.c, r.p0).multiplyScalar(1 - k).add(_d.subVectors(r.p1, r.c).multiplyScalar(k)).normalize();
          r.mesh.position.copy(pt); r.mesh.quaternion.setFromUnitVectors(FWD, _b);
          // (its streak behind it, from its point)
          streaks.setMatrixAt(ns++, _m.compose(_d.copy(pt).addScaledVector(_b, ARROW / 2), r.mesh.quaternion, _sc.set(1, 1, Math.min(STREAK, r.t * 20))));
          if (k >= 1) { G.scene.remove(r.mesh); s.rising.splice(i, 1); split(s, r.p1); }
        }
        // the sheaves coming down, and into the ground
        let n = 0, falling = 0;
        for (let i = s.falling.length - 1; i >= 0; i--) {
          const f = s.falling[i];
          if (f.t < 0) { if ((f.wait -= dt) > 0) continue; drop(s, f); }
          f.t += dt; falling++;
          const k = Math.min(1, f.t / f.dur);
          if (k >= 1) {
            stick(f.to, f.dir, STAND);
            debris(f.to, { count: 3, color: 0x4a3a28, speed: 1.4, size: 0.07, life: 0.5 });
            if (Math.random() < 0.35) sfx.thud();
            s.falling.splice(i, 1);
            continue;
          }
          if (n >= rain.instanceMatrix.count) continue;
          // (the arrow's middle, half an arrow behind its point, and its streak from the point)
          _a.lerpVectors(f.from, f.to, k); _q.setFromUnitVectors(FWD, f.dir);
          streaks.setMatrixAt(ns++, _m.compose(_a, _q, _sc.set(1, 1, Math.min(STREAK, f.t * FALL_V))));
          rain.setMatrixAt(n++, _m.compose(_a.addScaledVector(f.dir, -ARROW / 2), _q, _one));
        }
        rain.count = n; rain.instanceMatrix.needsUpdate = true;
        streaks.count = ns; streaks.instanceMatrix.needsUpdate = true;
        // every foe in the area is hit a few times a second while the arrows fall on it
        if (falling > 0 && (s.tick += dt) >= TICK) {
          s.tick -= TICK;
          const c = s.center, R = def.radius;
          for (const e of G.enemies) {
            if (!e.alive || Math.hypot(e.pos.x - c.x, e.pos.z - c.z) > R + e.radius) continue;
            hitEnemy(e, def.damage * TICK, { by: player, tags: def.tags, type: 'physical', silent: true });
            if (Math.random() < 0.5) burst({ x: e.pos.x, y: e.obj.position.y + e.height * rand(0.3, 0.8), z: e.pos.z }, { count: 3, color: 0xd3bf8d, speed: 1.5, life: 0.18, size: 0.06 });
          }
          hurtPropsIn(player, c.x, c.z, R, PROP_DAMAGE.zone * TICK);
        }
        // (motes drifting down through the rain: it reads as an area from the top-down view between the arrows)
        if (falling > 0 && Math.random() < dt * 10) {
          const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * def.radius;
          particles.glow.spawn({ x: s.center.x + Math.cos(a) * d, y: rand(2, 5), z: s.center.z + Math.sin(a) * d, vy: -3, life: 0.6, size: 0.06, sizeEnd: 0, color: col(LEAF, 1.2), colorEnd: col(0x405020, 0.3) });
        }
        return !s.done || fade > 0 || s.rising.length > 0 || s.falling.length > 0;
      },
      dispose() {
        s.gone = s.done = true;
        G.scene.remove(area, rain, streaks);
        for (const r of s.rising) G.scene.remove(r.mesh);
        s.rising.length = 0; s.falling.length = 0;
        ringMat.dispose(); fillMat.dispose(); rain.dispose(); streaks.dispose();
      },
    });
    return s;
  },
  tick(player, rawDef, dt, s) {
    // the area follows the aim at a walk
    const to = aimOf(player, rawDef as Def, _b), dx = to.x - s.center.x, dz = to.z - s.center.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) { const k = Math.min(1, FOLLOW * dt / d); s.center.x += dx * k; s.center.z += dz * k; }
    // volley after volley: (the first arrow from the quiver,) drawn, loosed, the next one taken and nocked
    const sp = pace(player), D = DRAW / sp, A = AFTER / sp;
    s.cyc += dt;
    if (s.fetch && !s.loosed && s.cyc >= s.fetch) player.nocked = true;
    if (!s.loosed && s.cyc >= s.fetch + D) { s.loosed = true; player.nocked = false; loose(s); }
    if (s.loosed && s.cyc >= s.fetch + D + A) { s.cyc -= s.fetch + D + A; s.fetch = 0; s.loosed = false; player.nocked = true; }
  },
  stop(_player, _def, s) { s.done = true; for (const f of s.falling) if (f.t < 0) f.wait = Math.min(f.wait, rand(0, TAIL)); },
  pose(player, _def, s, action) {
    const sp = pace(player), D = DRAW / sp, A = AFTER / sp, c = s.cyc - s.fetch;
    // (as a shot is posed: the hand at the quiver first, then the draw, then what follows the loose)
    if (s.fetch) action.fetch = Math.min(1, s.cyc / s.fetch);
    if (c < 0) { action.draw = 0; action.t = 0; }
    else if (!s.loosed) { action.draw = Math.min(1, c / D); action.t = 0.55 * action.draw; }
    else { action.draw = 1; action.loosed = c - D; action.t = 0.55 + 0.45 * Math.min(1, (c - D) / A); }
    // (drawn near level and lifted to the volley's angle as the string comes back, the trunk bending back at the waist:
    // raised before the draw, the draw arm's shoulder went past its range as the hand took the string)
    const after = s.loosed ? Math.min(1, (c - D) / A) : 0;
    action.pitch = PITCH * (s.loosed ? 1 - smooth(clamp(after / 0.6, 0, 1)) : smooth(clamp(((action.draw ?? 0) - 0.3) / 0.7, 0, 1)));
    action.yaw = player.shotHeading(player.castPoint, s.center);
    action.arrows = 1; action.fan = 0;
  },
};

export default skill;
