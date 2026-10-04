// Quarry Mark: the foe nearest the aim is marked as the hunt's quarry, and takes more damage from every player's hits
// (`amp`, combat/damage.ts). Killed, it gives the ranger his cooldowns back (not the draught's) and the mark leaps to the
// foe nearest it, so a hunt runs from kill to kill; with no kill in `duration` it fades. One mark per ranger: marking
// another moves it. Every game marks its own copy of the foe (a co-op guest's for the look and the cooldowns, the host's
// for the damage), as each sees the cast land.
import * as THREE from 'three';
import { G } from '../../state';
import { addEffect } from '../../fx/effects';
import { particles, col } from '../../fx/particles';
import { additive, nearGlow } from '../../core/materials';
import { sfx } from '../../core/audio';
import { floatText } from '../../ui/floaters';
import { rand } from '../../util';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'amp' | 'duration' | 'range'>;

const MARK = 0xff8a5c;
/** the mark leaps from a killed quarry to the nearest foe within this (m) */
const LEAP = 14;

/** the reticle over the quarry's head: a ring, four notches pointing in, a point in the middle */
let tex: THREE.CanvasTexture | null = null;
function reticle(): THREE.CanvasTexture {
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 8;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.lineTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30); g.stroke();
  }
  g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
  tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const planeGeo = new THREE.PlaneGeometry(1, 1);
const ringGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const reticleMat = () => nearGlow(new THREE.MeshBasicMaterial({ map: reticle(), color: new THREE.Color(MARK).multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));

interface Mark { on: Enemy | null; amp: number; left: number; end(): void }
/** each ranger's mark, while it's up */
const marks = new WeakMap<Player, Mark>();

/** The foe the cast marks: of those in range of the hero, the nearest the aim. */
function quarry(player: Player, target: THREE.Vector3, range: number): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!e.alive || e.spawning || Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) > range) continue;
    const d = Math.hypot(e.pos.x - target.x, e.pos.z - target.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** A trail of light from the killed quarry to the next. */
function leapTrail(a: THREE.Vector3, ah: number, b: Enemy): void {
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const k = i / n, y = ah + (b.obj.position.y + b.height + 0.4 - ah) * k + Math.sin(k * Math.PI) * 1.2;
    particles.glow.spawn({ x: a.x + (b.pos.x - a.x) * k, y, z: a.z + (b.pos.z - a.z) * k, vy: rand(-0.3, 0.3), life: 0.25 + 0.25 * k, size: 0.12, sizeEnd: 0, color: col(MARK, 2), colorEnd: col(0x802010, 0.4), drag: 3 });
  }
}

/** The cooldowns back (the draught's stays): the local hero's own, as only its game keeps them. */
function refund(player: Player): void {
  if (!player.local) return;
  let any = false;
  for (const [id, cd] of player.cooldowns) {
    if (cd <= 0 || player.known.get(id)?.def.tags.includes('consumable')) continue;
    player.cooldowns.set(id, 0); any = true;
  }
  if (!any) return;
  floatText(player.pos.x, 2.7, player.pos.z, 'Cooldowns refreshed', 'info', '#ffb08a');
  sfx.refresh();
}

function mark(player: Player, def: Def, e: Enemy): void {
  marks.get(player)?.end();
  const reticleM = new THREE.Mesh(planeGeo, reticleMat()), ringMat = additive(MARK, 1.3, 0);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  reticleM.frustumCulled = ring.frustumCulled = false;
  G.scene.add(reticleM, ring);
  let ended = false, fade = 0, t = 0;
  const me: Mark = { on: null, amp: def.amp, left: def.duration, end() { ended = true; take(); } };
  /** off its quarry */
  function take(): void {
    const q = me.on;
    if (!q) return;
    const i = q.marks.indexOf(me.amp);
    if (i >= 0) q.marks.splice(i, 1);
    me.on = null;
  }
  /** on a quarry, its time from the start */
  function put(q: Enemy): void {
    take();
    me.on = q; q.marks.push(me.amp); me.left = def.duration;
    q.onDeath.push(() => {
      if (me.on !== q || ended) return;
      take();
      refund(player);
      // (the leap: to the nearest foe still standing)
      let next: Enemy | null = null, bd = LEAP;
      for (const o of G.enemies) {
        if (o === q || !o.alive || o.spawning) continue;
        const d = Math.hypot(o.pos.x - q.pos.x, o.pos.z - q.pos.z);
        if (d < bd) { bd = d; next = o; }
      }
      if (!next) { ended = true; return; }
      leapTrail(q.pos, q.obj.position.y + q.height + 0.4, next);
      put(next);
      sfx.mark();
    });
  }
  put(e);
  marks.set(player, me);
  sfx.mark();
  addEffect({
    update(dt) {
      t += dt;
      const q = me.on;
      if (!ended && (!q || !q.alive || !G.enemies.includes(q) || (me.left -= dt) <= 0)) { ended = true; take(); }
      // (fades in, and out over its last second: never a flash)
      fade = ended ? Math.max(0, fade - dt * 3) : Math.min(1, fade + dt * 6, me.left);
      (reticleM.material as THREE.MeshBasicMaterial).opacity = fade * (0.85 + 0.15 * Math.sin(t * 4));
      ringMat.opacity = 0.7 * fade;
      if (q) {
        const top = q.obj.position.y + q.height + 0.45;
        reticleM.position.set(q.pos.x, top, q.pos.z);
        reticleM.quaternion.copy(G.camera.quaternion); reticleM.rotateZ(t * 0.8);
        reticleM.scale.setScalar(0.6 + 0.03 * Math.sin(t * 4));
        ring.position.set(q.pos.x, q.obj.position.y + 0.05, q.pos.z);
        ring.scale.setScalar(q.radius + 0.3); ring.rotation.y = -t * 0.6;
      }
      return !ended || fade > 0;
    },
    dispose() {
      ended = true; take();
      if (marks.get(player) === me) marks.delete(player);
      G.scene.remove(reticleM, ring);
      (reticleM.material as THREE.Material).dispose(); ringMat.dispose();
    },
  });
}

const skill: InstantSkill = {
  anim: 'cast',
  warm: () => [new THREE.Mesh(planeGeo, reticleMat()), new THREE.Mesh(ringGeo, additive(MARK, 1.3, 0.7))],
  canCast: (player, def, target) => !!quarry(player, target, def.range ?? 26),
  cast(player, rawDef, target) {
    const def = rawDef as Def, e = quarry(player, target, def.range);
    if (e) mark(player, def, e);
  },
};

export default skill;
