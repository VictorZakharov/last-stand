// Quarry Mark: the foe nearest the aim is marked as the hunt's quarry, and takes more damage from every player's hits
// (`amp`, combat/damage.ts). Killed, it gives the ranger his cooldowns back (not the draught's) and the mark is spent;
// with no kill in `duration` it fades. One mark per ranger: marking another moves it. Every game marks its own copy of the foe (a co-op guest's for the look and the cooldowns, the host's
// for the damage), as each sees the cast land.
import * as THREE from 'three';
import { G } from '../../state';
import { addEffect } from '../../fx/effects';
import { burst } from '../../fx/particles';
import { additive, nearGlow } from '../../core/materials';
import { floorPatch, lay } from '../../fx/floorPatch';
import { sfx } from '../../core/audio';
import { floatText } from '../../ui/floaters';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { InstantSkill, Needs } from './types';

type Def = Needs<'amp' | 'duration' | 'range'>;

const MARK = 0xff8a5c;

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
/** the ring at the quarry's feet, a unit one scaled to it (laid on the ground: under a foe beside the dais it went in under the step) */
const ringGeo = () => floorPatch(0.86, 1, 1, 48);
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
  const ringG = ringGeo(), ring = new THREE.Mesh(ringG, ringMat);
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
  me.on = e; e.marks.push(me.amp);
  // killed, the cooldowns come back and the mark is spent (it breaks over the quarry and fades there)
  e.onDeath.push(() => {
    if (me.on !== e || ended) return;
    ended = true; take();
    refund(player);
    burst(reticleM.position, { count: 16, color: MARK, speed: 2.5, up: 0.5, life: 0.4, size: 0.08, gravity: 2 });
  });
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
        const r = q.radius + 0.3;
        ring.position.set(q.pos.x, 0, q.pos.z); ring.scale.set(r, 1, r);
        lay(ringG, q.pos.x, q.pos.z, 0.05, r);
      }
      return !ended || fade > 0;
    },
    dispose() {
      ended = true; take();
      if (marks.get(player) === me) marks.delete(player);
      G.scene.remove(reticleM, ring);
      (reticleM.material as THREE.Material).dispose(); ringMat.dispose(); ringG.dispose();
    },
  });
}

const skill: InstantSkill = {
  anim: 'cast',
  warm: () => [new THREE.Mesh(planeGeo, reticleMat()), new THREE.Mesh(ringGeo(), additive(MARK, 1.3, 0.7))],
  canCast: (player, def, target) => !!quarry(player, target, def.range ?? 26),
  cast(player, rawDef, target) {
    const def = rawDef as Def, e = quarry(player, target, def.range);
    if (e) mark(player, def, e);
  },
};

export default skill;
